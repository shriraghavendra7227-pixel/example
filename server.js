require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { Anthropic } = require('@anthropic-ai/sdk');

// Express App setup
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

// Create HTTP server & WebSocket server
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Anthropic API client setup
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || 'MOCK_KEY_IF_NOT_SET'
});

// Stadium Zones initial configuration
const initialZones = [
  { id: 'gate_a', name: 'Gate A', capacity: 15000, baseOccupancy: 45 },
  { id: 'gate_b', name: 'Gate B', capacity: 15000, baseOccupancy: 50 },
  { id: 'gate_c', name: 'Gate C', capacity: 12000, baseOccupancy: 35 },
  { id: 'gate_d', name: 'Gate D', capacity: 12000, baseOccupancy: 40 },
  { id: 'main_concourse', name: 'Main Concourse', capacity: 25000, baseOccupancy: 55 },
  { id: 'food_court', name: 'Food Court', capacity: 8000, baseOccupancy: 60 },
  { id: 'restroom_block_1', name: 'Restroom Block 1', capacity: 1500, baseOccupancy: 30 },
  { id: 'transit_hub', name: 'Transit Hub', capacity: 20000, baseOccupancy: 40 }
];

// Single source of truth status thresholds helper (Bug 1 Fix)
function getStatusCategory(occupancy) {
  if (occupancy < 60) return 'normal';
  if (occupancy <= 85) return 'warning';
  return 'critical';
}

// In-memory state of the stadium zones
let zones = initialZones.map(zone => {
  const history = [];
  // Populate initial mock history of last 10 points
  for (let i = 0; i < 10; i++) {
    const variance = Math.floor(Math.random() * 11) - 5; // -5% to +5%
    history.push(Math.max(10, Math.min(95, zone.baseOccupancy + variance)));
  }
  const currentOccupancy = history[history.length - 1];
  return {
    id: zone.id,
    name: zone.name,
    capacity: zone.capacity,
    occupancy: currentOccupancy,
    trend: 'stable',
    history: history
  };
});

// In-memory timestamps tracking last-alerted per zone (Bug 3 Fix)
let lastAlertedTimestamps = {}; 

// Cache for GenAI Operational Briefings to prevent excessive API hits
let cachedBriefing = {
  text: "Initializing system briefings. Please wait for first data cycle...",
  timestamp: 0
};

// Queue for pending alerts to send to clients
let alertsLog = [];

// Helper to broadcast JSON payload to all connected WebSocket clients
function broadcast(payload) {
  const message = JSON.stringify(payload);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Check if API key is configured
function hasValidApiKey() {
  return process.env.ANTHROPIC_API_KEY && 
         process.env.ANTHROPIC_API_KEY !== 'MOCK_KEY_IF_NOT_SET' && 
         process.env.ANTHROPIC_API_KEY.trim() !== '';
}

// Generate fallback alert (rule-based)
function getFallbackAlert(zoneName, occupancy, capacity) {
  return {
    zoneId: zoneName.toLowerCase().replace(/\s+/g, '_'),
    zoneName: zoneName,
    occupancy: occupancy,
    timestamp: new Date().toLocaleTimeString(),
    staff_action: `[AUTOALERT] Congestion spike at ${zoneName} (${occupancy}%). Redirect queues, open secondary turnstiles, and deploy 2 backup supervisors immediately.`,
    fan_english: `Announcer: ${zoneName} is currently congested. To save time, please follow the arrows to alternate gates or seating areas.`,
    fan_spanish: `Anuncio: La zona de ${zoneName} está congestionada. Para ingresar más rápido, siga las señales hacia los accesos alternativos.`
  };
}

// Generate GenAI Alert via Claude (claude-sonnet-4-5)
async function generateClaudeAlert(zoneName, occupancy, capacity) {
  if (!hasValidApiKey()) {
    console.log("No API key configured for AI services. Using fallback alert engine.");
    return getFallbackAlert(zoneName, occupancy, capacity);
  }

  // Ensure prompt snaps exact percentage and instructs Claude to not hallucinate (Bug 4 Fix)
  const prompt = `You are a stadium crowd flow AI assistant for the FIFA World Cup 2026.
A critical crowd bottleneck has occurred:
Zone Name: "${zoneName}"
Current Occupancy: ${occupancy}% of its ${capacity} limit.

Generate a JSON object with exactly the three fields below, with no formatting wrappers (like \`\`\`json) or extra text:
{
  "staff_action": "a short, 1-sentence action directive for stadium staff detailing where to go or what to do (e.g. redirect, open gates, deploy supervisors).",
  "fan_english": "a clear, polite 1-sentence public announcement in English directing fans on how to bypass this congestion.",
  "fan_spanish": "a precise, polite translation of the fan announcement in Spanish."
}

Constraints:
- Keep response brief, direct, professional, and do not invent other zone names.
- IMPORTANT: If you choose to embed the occupancy percentage anywhere in your messages, you MUST write exactly "${occupancy}%". Do not hallucinate or use any other percentage value.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022', // using latest claude sonnet capability
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }]
    });

    let responseText = response.content[0].text.trim();
    // Strip markdown JSON blocks if returned
    if (responseText.startsWith('```')) {
      responseText = responseText.replace(/^```(json)?/, '').replace(/```$/, '').trim();
    }
    
    const parsedAlert = JSON.parse(responseText);
    return {
      zoneId: zoneName.toLowerCase().replace(/\s+/g, '_'),
      zoneName: zoneName,
      occupancy: occupancy,
      timestamp: new Date().toLocaleTimeString(),
      staff_action: parsedAlert.staff_action,
      fan_english: parsedAlert.fan_english,
      fan_spanish: parsedAlert.fan_spanish
    };
  } catch (error) {
    console.error("Error generating alert via AI Assistant:", error.message);
    return getFallbackAlert(zoneName, occupancy, capacity);
  }
}

// Update loop (every 4 seconds)
setInterval(async () => {
  let spikedZoneId = null;

  // 15% chance to simulate a sudden crowd surge in one random zone
  if (Math.random() < 0.15) {
    const randomIndex = Math.floor(Math.random() * zones.length);
    spikedZoneId = zones[randomIndex].id;
  }

  // Update each zone
  for (let zone of zones) {
    const oldOccupancy = zone.occupancy;
    let newOccupancy;

    if (zone.id === spikedZoneId) {
      newOccupancy = Math.floor(Math.random() * 13) + 86; // 86% - 98%
      console.log(`[SIMULATOR] Spiking surge at ${zone.name}: ${newOccupancy}%`);
    } else {
      const change = Math.floor(Math.random() * 9) - 4; // -4% to +4%
      newOccupancy = Math.max(10, Math.min(95, oldOccupancy + change));
    }

    // Determine trend
    let trend = 'stable';
    if (newOccupancy > oldOccupancy) trend = 'rising';
    else if (newOccupancy < oldOccupancy) trend = 'falling';

    // Verify crossed into critical threshold using shared function logic (Bug 1 & Bug 3 Fixes)
    const oldStatus = getStatusCategory(oldOccupancy);
    const newStatus = getStatusCategory(newOccupancy);
    const crossedToRed = (oldStatus !== 'critical' && newStatus === 'critical');

    // Update in-memory state
    zone.occupancy = newOccupancy;
    zone.trend = trend;
    zone.history.push(newOccupancy);
    if (zone.history.length > 10) {
      zone.history.shift();
    }

    // If crossed into red, trigger alert with cooldown check (Bug 3 Fix)
    if (crossedToRed) {
      const now = Date.now();
      const lastAlerted = lastAlertedTimestamps[zone.id] || 0;
      const cooldownPeriod = 60000; // 60s cooldown

      if (now - lastAlerted > cooldownPeriod) {
        lastAlertedTimestamps[zone.id] = now; // Set cooldown timestamp
        console.log(`[ALERT TRIGGER] ${zone.name} crossed to critical (${newOccupancy}%). Firing AI alert...`);
        
        generateClaudeAlert(zone.name, newOccupancy, zone.capacity).then(alertData => {
          alertsLog.unshift(alertData);
          if (alertsLog.length > 30) alertsLog.pop();
          broadcast({ type: 'ALERT_TRIGGERED', alert: alertData });
        });
      } else {
        console.log(`[ALERT COOLDOWN] Suppressed duplicate alert for ${zone.name}. Last alerted ${Math.round((now - lastAlerted)/1000)}s ago.`);
      }
    }
  }

  // Broadcast updates
  broadcast({ type: 'ZONE_UPDATES', zones: zones });

}, 4000);

// Generate Operational Briefing using AI
async function getOperationalBriefing(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && (now - cachedBriefing.timestamp < 10000)) {
    return cachedBriefing.text;
  }

  if (!hasValidApiKey()) {
    // Fallback generator using shared function
    const redZones = zones.filter(z => getStatusCategory(z.occupancy) === 'critical');
    const yellowZones = zones.filter(z => getStatusCategory(z.occupancy) === 'warning');
    
    let summaryText = "";
    if (redZones.length > 0) {
      summaryText = `CRITICAL: ${redZones.map(z => `${z.name} (${z.occupancy}%)`).join(', ')} are severely congested. Deploy emergency stewards immediately to clear blockages and redirect incoming flows. `;
    } else if (yellowZones.length > 0) {
      summaryText = `Caution: High traffic in progress at ${yellowZones.map(z => `${z.name} (${z.occupancy}%)`).join(', ')}. Monitor entry lines and staff coverage. `;
    } else {
      summaryText = "All stadium zones are operating normally. Flow rates are optimal. ";
    }
    summaryText += "Transit Hub flow is stable. Continue standard operations routine.";
    
    cachedBriefing = { text: summaryText, timestamp: now };
    return summaryText;
  }

  const snapshot = zones.map(z => `${z.name}: ${z.occupancy}% Occupancy (Trend: ${z.trend}, Capacity: ${z.capacity})`).join('\n');
  const prompt = `You are a Senior Stadium Operations Analyst for the FIFA World Cup 2026.
Here is the current real-time occupancy and congestion status of the stadium:
${snapshot}

Write a short, highly operational briefing (2-3 sentences) for the command center wallboard.
Structure it to clearly outline:
1. Which areas are currently experiencing bottlenecks/surges (occupancy > 85%) or are at risk.
2. The operational risk/consequence if not addressed.
3. 1 or 2 concrete, direct directives for the stadium staff.

Constraints:
- Be concise, direct, and professional.
- Do NOT invent any zone names. Only refer to the ones provided in the list.
- Do NOT use greeting phrases or markdown headers. Just return the short paragraph.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }]
    });

    cachedBriefing = {
      text: response.content[0].text.trim(),
      timestamp: now
    };
    return cachedBriefing.text;
  } catch (error) {
    console.error("Error calling AI for briefing:", error.message);
    return "Operational Briefing unavailable due to API communication issue. Live data streams remain operational. Review dashboard alerts above.";
  }
}

// REST API Endpoints
app.get('/api/insight', async (req, res) => {
  const force = req.query.force === 'true';
  const briefing = await getOperationalBriefing(force);
  res.json({ briefing, timestamp: new Date().toLocaleTimeString() });
});

app.post('/api/query', async (req, res) => {
  const { question } = req.body;
  if (!question) {
    return res.status(400).json({ error: "Question is required." });
  }

  if (!hasValidApiKey()) {
    // Generate fallback response analyzing current states using shared function
    const redZones = zones.filter(z => getStatusCategory(z.occupancy) === 'critical');
    const yellowZones = zones.filter(z => getStatusCategory(z.occupancy) === 'warning');
    
    let answer = `[Offline Assistant] I'm currently running in offline fallback mode. Based on current telemetry:\n`;
    if (redZones.length > 0) {
      answer += `- Critical areas: ${redZones.map(z => `${z.name} at ${z.occupancy}%`).join(', ')}. Action is required here.\n`;
    }
    if (yellowZones.length > 0) {
      answer += `- Elevated traffic: ${yellowZones.map(z => `${z.name} at ${z.occupancy}%`).join(', ')}.\n`;
    }
    if (redZones.length === 0 && yellowZones.length === 0) {
      answer += `- All 8 zones are currently under 60% capacity and flowing well.\n`;
    }
    answer += `Please resolve the ANTHROPIC_API_KEY environment variable in your .env file to restore full operational chat assistant capabilities.`;
    return res.json({ answer });
  }

  const snapshot = zones.map(z => `- ${z.name}: Occupancy: ${z.occupancy}%, capacity limit: ${z.capacity}, current trend: ${z.trend}. Last readings: ${z.history.join(', ')}`).join('\n');
  const prompt = `You are the FIFA World Cup 2026 Smart Stadium Operations Assistant.
You have access to the current real-time telemetry metrics:
${snapshot}

The operations director is asking this question:
"${question}"

Provide a short, direct, actionable answer (2-3 sentences max).
- Refer strictly to the telemetry data above.
- Never invent zone names.
- Keep the tone professional, prompt, and operationally focused.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }]
    });

    res.json({ answer: response.content[0].text.trim() });
  } catch (error) {
    console.error("Error answering query:", error.message);
    res.json({ 
      answer: "I encountered an error retrieving insights from the AI Assistant. Current status summary: " + 
              zones.map(z => `${z.name} (${z.occupancy}%)`).join(', ')
    });
  }
});

// Periodic Briefing Generation (Every 20 seconds)
let lastBriefingText = "";
setInterval(async () => {
  if (wss.clients.size > 0) {
    const briefing = await getOperationalBriefing(true);
    if (briefing !== lastBriefingText) {
      lastBriefingText = briefing;
      broadcast({ type: 'BRIEFING_UPDATE', briefing, timestamp: new Date().toLocaleTimeString() });
    }
  }
}, 20000);

// WebSocket handling
wss.on('connection', ws => {
  console.log('Client connected to telemetry broadcast.');
  
  ws.send(JSON.stringify({
    type: 'INITIAL_STATE',
    zones: zones,
    alerts: alertsLog
  }));

  getOperationalBriefing().then(briefing => {
    ws.send(JSON.stringify({
      type: 'BRIEFING_UPDATE',
      briefing: briefing,
      timestamp: new Date(cachedBriefing.timestamp || Date.now()).toLocaleTimeString()
    }));
  });

  ws.on('close', () => {
    console.log('Client disconnected from telemetry broadcast.');
  });
});

// Start Server
server.listen(port, () => {
  console.log(`================================================================`);
  console.log(`  CrowdPulse Dashboard Backend is running on port ${port}`);
  console.log(`  URL: http://localhost:${port}`);
  console.log(`================================================================`);
});
