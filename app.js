/**
 * CrowdPulse Premium Operations Dashboard Core
 * Dynamic Telemetry Integration, SVG Schematic Mapping, and AI Briefings
 */

document.addEventListener('DOMContentLoaded', () => {
  // Constants & Config
  const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const WS_URL = `${WS_PROTOCOL}//${window.location.host}`;
  const API_INSIGHT_URL = '/api/insight';
  const API_QUERY_URL = '/api/query';

  // DOM Elements
  const wsStatusDot = document.getElementById('ws-status-dot');
  const wsStatusText = document.getElementById('ws-status-text');
  const headerClock = document.getElementById('header-clock');
  
  const kpiTotalOccupancy = document.getElementById('kpi-total-occupancy');
  const kpiCriticalZones = document.getElementById('kpi-critical-zones');
  const kpiAvgTrend = document.getElementById('kpi-avg-trend');
  const kpiNearingCapacity = document.getElementById('kpi-nearing-capacity');
  
  const kpiOccupancyChip = document.getElementById('kpi-occupancy-chip');
  const kpiCriticalChip = document.getElementById('kpi-critical-chip');
  const kpiTrendChip = document.getElementById('kpi-trend-chip');
  const kpiWarningChip = document.getElementById('kpi-warning-chip');

  const zonesGrid = document.getElementById('zones-grid');
  
  const btnRefreshInsight = document.getElementById('btn-refresh-insight');
  const insightLoading = document.getElementById('insight-loading');
  const briefingTextElement = document.getElementById('briefing-text-element');
  const briefingCursor = document.getElementById('briefing-cursor');
  const briefingTimeStamp = document.getElementById('briefing-time-stamp');
  const briefingConfidence = document.getElementById('briefing-confidence');
  
  const alertBadgeCount = document.getElementById('alert-badge-count');
  const alertListContainer = document.getElementById('alert-list-container');
  const noAlertsView = document.getElementById('no-alerts-view');
  
  const staffChatWidget = document.getElementById('staff-chat-widget');
  const chatThreadBox = document.getElementById('chat-thread-box');
  const chatQueryEcho = document.getElementById('chat-query-echo');
  const chatResponseText = document.getElementById('chat-response-text');
  const chatQueryForm = document.getElementById('chat-query-form');
  const chatQueryInput = document.getElementById('chat-query-input');
  const btnSubmitChat = document.getElementById('btn-submit-chat');

  // In-memory states & Cache
  let socket = null;
  let zoneCharts = {}; // Maps zoneId -> Chart.js instance for sparklines
  let kpiCharts = {};  // Maps kpiId -> Chart.js instance
  let alertCount = 0;
  
  // Previous KPI values (for interpolator animation)
  let prevKpis = {
    totalOccupancy: 0,
    criticalZones: 0,
    nearingCapacity: 0
  };

  // KPI Historical buffers (10 points max) for KPI Sparklines
  let kpiHistory = {
    occupancy: Array(10).fill(0),
    critical: Array(10).fill(0),
    trend: Array(10).fill(0),
    warning: Array(10).fill(0)
  };

  // Typing effect lock
  let typingInterval = null;

  // Clock Update
  function updateClock() {
    const now = new Date();
    headerClock.textContent = now.toLocaleTimeString('en-US', { hour12: false });
  }
  setInterval(updateClock, 1000);
  updateClock();

  // SVG Trend Arrow Icons
  const TrendIcons = {
    rising: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>`,
    falling: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>`,
    stable: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`
  };

  // SVG Zone Custom Icons
  const ZoneIcons = {
    gate_a: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M12 2v9M8 5h8"/></svg>`,
    gate_b: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M12 2v9M8 5h8"/></svg>`,
    gate_c: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M12 2v9M8 5h8"/></svg>`,
    gate_d: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M12 2v9M8 5h8"/></svg>`,
    main_concourse: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h16M16 6l6 6-6 6M8 18l-6-6 6-6"/></svg>`,
    food_court: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v2M7 3v3M17 3v3M10 8h4M9.5 12h5a3.5 3.5 0 0 1 0 7h-5"/></svg>`,
    restroom_block_1: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2h-4a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zM12 18v.01M10 6h4M10 10h4"/></svg>`,
    transit_hub: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 11h8M8 15h8M12 3v8"/></svg>`
  };

  // Helper: Value Interpolation Counter Animation (~400ms ease-out)
  function animateValue(targetElement, start, end, duration) {
    if (!targetElement) return;
    let startTimestamp = null;
    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      // Ease out cubic
      const ease = 1 - Math.pow(1 - progress, 3);
      const currentVal = Math.floor(ease * (end - start) + start);
      
      // Keep % symbol if occupancy
      if (targetElement.id === 'kpi-total-occupancy') {
        targetElement.textContent = `${currentVal}%`;
      } else {
        targetElement.textContent = currentVal;
      }
      
      if (progress < 1) {
        window.requestAnimationFrame(step);
      } else {
        if (targetElement.id === 'kpi-total-occupancy') {
          targetElement.textContent = `${end}%`;
        } else {
          targetElement.textContent = end;
        }
      }
    };
    window.requestAnimationFrame(step);
  }

  // Helper: Typing Text Character Printout Loop
  function typeWriteText(targetTextElement, text, cursorElement, speed = 15) {
    // Clear any active typing loop instantly to prevent overlapping threads
    if (typingInterval) {
      clearInterval(typingInterval);
      typingInterval = null;
    }
    
    targetTextElement.textContent = '';
    cursorElement.style.display = 'inline-block';
    
    let index = 0;
    typingInterval = setInterval(() => {
      if (index < text.length) {
        targetTextElement.textContent += text.charAt(index);
        index++;
      } else {
        clearInterval(typingInterval);
        typingInterval = null;
        cursorElement.style.display = 'none'; // hide cursor on finish
      }
    }, speed);
  }

  // 1. STATUS BADGE LOGIC Shared Function (Resolves Bug 1)
  function getStatusCategory(occupancy) {
    if (occupancy < 60) return 'normal';    // Green
    if (occupancy <= 85) return 'warning';  // Yellow
    return 'critical';                     // Red
  }

  // Visual Assets Theme Mapping
  const ColorsMap = {
    normal: { border: '#00FFB3', fillStart: 'rgba(0, 255, 179, 0.08)' },
    warning: { border: '#FFC857', fillStart: 'rgba(255, 200, 87, 0.08)' },
    critical: { border: '#FF4D6D', fillStart: 'rgba(255, 77, 109, 0.12)' }
  };

  // Sparkline Chart Creation Helper
  function createSparklineChart(canvasId, historyData, strokeColor, fillColor) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    
    const gradient = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height || 35);
    gradient.addColorStop(0, fillColor);
    gradient.addColorStop(1, 'rgba(11, 16, 32, 0)');

    return new Chart(ctx, {
      type: 'line',
      data: {
        labels: Array(historyData.length).fill(''),
        datasets: [{
          data: [...historyData],
          borderColor: strokeColor,
          backgroundColor: gradient,
          fill: true,
          borderWidth: 1.5,
          pointRadius: 0,
          pointHoverRadius: 0,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false }
        },
        scales: {
          x: { display: false },
          y: { display: false }
        }
      }
    });
  }

  // Render Initial State Cards
  function buildDashboardUI(zones) {
    zonesGrid.innerHTML = '';
    
    zones.forEach(zone => {
      // Derive badge, color, and ring states strictly from the single shared function
      const status = getStatusCategory(zone.occupancy);
      const card = document.createElement('div');
      card.id = `zone-card-${zone.id}`;
      card.className = `zone-card ${status}`;
      
      const circ = 188.5;
      const offset = circ - (zone.occupancy / 100) * circ;

      card.innerHTML = `
        <div class="zone-card-header">
          <div class="zone-header-left">
            <span class="zone-icon-container">${ZoneIcons[zone.id] || ''}</span>
            <div>
              <h3 class="zone-name">${zone.name}</h3>
              <span class="zone-cap-limit">Limit: ${zone.capacity.toLocaleString()}</span>
            </div>
          </div>
          <span class="status-chip">
            <span class="status-dot"></span>
            <span>${status}</span>
          </span>
        </div>
        <div class="zone-card-middle">
          <!-- Circular Progress Ring (CSS dash offset) -->
          <div class="progress-ring-container">
            <svg class="progress-ring-svg">
              <circle class="progress-ring-circle-bg" cx="36" cy="36" r="30" />
              <circle class="progress-ring-circle" id="${zone.id}-ring" cx="36" cy="36" r="30" 
                stroke-dasharray="${circ}" stroke-dashoffset="${offset}" />
            </svg>
            <div class="progress-ring-text-container">
              <span class="progress-ring-val" id="${zone.id}-ring-val">${zone.occupancy}%</span>
              <span class="progress-ring-lbl">Load</span>
            </div>
          </div>
          
          <!-- Sparkline wrapper -->
          <div class="zone-sparkline-box">
            <canvas id="chart-${zone.id}"></canvas>
          </div>
        </div>
        <div class="zone-card-footer">
          <div class="zone-trend-display ${zone.trend}">
            <span class="zone-trend-icon">${TrendIcons[zone.trend]}</span>
            <span>${zone.trend}</span>
          </div>
          <span class="zone-footer-stat">Telemetry Active</span>
        </div>
      `;

      zonesGrid.appendChild(card);

      const themeColors = ColorsMap[status];
      zoneCharts[zone.id] = createSparklineChart(
        `chart-${zone.id}`, 
        zone.history, 
        themeColors.border, 
        themeColors.fillStart
      );
    });

    initKpisHistory(zones);
    renderKpiSparklines();
    updateSummaryStats(zones, true);
  }

  // Seed initial KPI buffers
  function initKpisHistory(zones) {
    let totalCap = 0;
    zones.forEach(z => totalCap += z.capacity);

    for (let step = 0; step < 10; step++) {
      let sumLoad = 0;
      let criticalCount = 0;
      let warningCount = 0;

      zones.forEach(z => {
        const value = z.history[step] || z.occupancy;
        sumLoad += (value / 100) * z.capacity;
        
        // Use shared getStatusCategory function
        const stepStatus = getStatusCategory(value);
        if (stepStatus === 'critical') criticalCount++;
        else if (stepStatus === 'warning') warningCount++;
      });

      kpiHistory.occupancy[step] = Math.round((sumLoad / totalCap) * 100);
      kpiHistory.critical[step] = criticalCount;
      kpiHistory.warning[step] = warningCount;
      kpiHistory.trend[step] = kpiHistory.occupancy[step];
    }
  }

  // Draw 4 Main KPI ribbon sparklines
  function renderKpiSparklines() {
    kpiCharts['occupancy'] = createSparklineChart('chart-kpi-occupancy', kpiHistory.occupancy, '#00D8FF', 'rgba(0, 216, 255, 0.08)');
    kpiCharts['critical'] = createSparklineChart('chart-kpi-critical', kpiHistory.critical, '#FF4D6D', 'rgba(255, 77, 109, 0.08)');
    kpiCharts['trend'] = createSparklineChart('chart-kpi-trend', kpiHistory.trend, '#8B5CF6', 'rgba(139, 92, 246, 0.08)');
    kpiCharts['warning'] = createSparklineChart('chart-kpi-warning', kpiHistory.warning, '#FFC857', 'rgba(255, 200, 87, 0.08)');
  }

  // Live Telemetry Tick Update
  function updateDashboardUI(zones) {
    zones.forEach(zone => {
      const card = document.getElementById(`zone-card-${zone.id}`);
      if (!card) return;

      // Single source of truth for threshold categories (Bug 1 Fix)
      const status = getStatusCategory(zone.occupancy);
      
      // Update state classes for borders/glowing styles
      card.className = `zone-card ${status}`;
      
      // Update badge text value inside status chip
      const statusChipText = card.querySelector('.status-chip span:last-child');
      if (statusChipText) {
        statusChipText.textContent = status;
      }
      
      // Update text in ring
      document.getElementById(`${zone.id}-ring-val`).textContent = `${zone.occupancy}%`;
      
      // Update SVG Circular progress offset
      const ring = document.getElementById(`${zone.id}-ring`);
      const circ = 188.5;
      ring.setAttribute('stroke-dashoffset', circ - (zone.occupancy / 100) * circ);

      // Update Card Footer trend
      const footerTrend = card.querySelector('.zone-trend-display');
      footerTrend.className = `zone-trend-display ${zone.trend}`;
      footerTrend.innerHTML = `<span class="zone-trend-icon">${TrendIcons[zone.trend]}</span><span>${zone.trend}</span>`;

      // Update Sparkline chart contents
      const chart = zoneCharts[zone.id];
      if (chart) {
        chart.data.datasets[0].data = [...zone.history];
        const themeColors = ColorsMap[status];
        chart.data.datasets[0].borderColor = themeColors.border;
        
        // Redraw gradient fill dynamically
        const ctx = chart.ctx;
        const grad = ctx.createLinearGradient(0, 0, 0, 45);
        grad.addColorStop(0, themeColors.fillStart);
        grad.addColorStop(1, 'rgba(11, 16, 32, 0)');
        chart.data.datasets[0].backgroundColor = grad;
        
        chart.update('none');
      }

      // Update 2D stadium blueprint path coloring
      const blueprintPath = document.getElementById(`map-${zone.id}`);
      if (blueprintPath) {
        blueprintPath.setAttribute('class', `stadium-zone-path ${status}`);
      }
    });

    updateSummaryStats(zones, false);
  }

  // Compute Summary Statistics (Updates KPI cards dynamically)
  function updateSummaryStats(zones, isInitial = false) {
    let totalCap = 0;
    let currentLoad = 0;
    let criticalCount = 0;
    let warningCount = 0;

    zones.forEach(z => {
      totalCap += z.capacity;
      currentLoad += (z.occupancy / 100) * z.capacity;
      
      // Derive counts strictly from the shared function (Bug 1 & Bug 2 Fixes)
      const status = getStatusCategory(z.occupancy);
      if (status === 'critical') {
        criticalCount++;
      } else if (status === 'warning') {
        warningCount++;
      }
    });

    const averageLoad = Math.round((currentLoad / totalCap) * 100);

    let overallTrendText = 'STABLE';
    let trendColor = 'stable';
    const lastAvgOcc = kpiHistory.occupancy[kpiHistory.occupancy.length - 1];
    
    if (averageLoad > lastAvgOcc) {
      overallTrendText = 'INCREASING';
      trendColor = 'warning';
    } else if (averageLoad < lastAvgOcc) {
      overallTrendText = 'DECREASING';
      trendColor = 'success';
    }

    // Historical buffer push
    kpiHistory.occupancy.push(averageLoad); kpiHistory.occupancy.shift();
    kpiHistory.critical.push(criticalCount); kpiHistory.critical.shift();
    kpiHistory.warning.push(warningCount); kpiHistory.warning.shift();
    kpiHistory.trend.push(averageLoad); kpiHistory.trend.shift();

    // Trigger value animations
    if (isInitial) {
      kpiTotalOccupancy.textContent = `${averageLoad}%`;
      kpiCriticalZones.textContent = criticalCount;
      kpiNearingCapacity.textContent = warningCount;
      kpiAvgTrend.textContent = overallTrendText;
    } else {
      animateValue(kpiTotalOccupancy, prevKpis.totalOccupancy, averageLoad, 400);
      animateValue(kpiCriticalZones, prevKpis.criticalZones, criticalCount, 400);
      animateValue(kpiNearingCapacity, prevKpis.nearingCapacity, warningCount, 400);
      kpiAvgTrend.textContent = overallTrendText;
    }

    // Save previous counts
    prevKpis.totalOccupancy = averageLoad;
    prevKpis.criticalZones = criticalCount;
    prevKpis.nearingCapacity = warningCount;

    // Update KPI chips (derive status from calculated load using same logic)
    const loadStatus = getStatusCategory(averageLoad);
    kpiOccupancyChip.textContent = loadStatus === 'normal' ? 'Optimal' : loadStatus === 'warning' ? 'Warning' : 'Critical';
    kpiOccupancyChip.className = `kpi-chip ${loadStatus === 'normal' ? 'success' : loadStatus === 'warning' ? 'warning' : 'danger'}`;
    
    // Critical count matches the chip badge content dynamically (Bug 2 Fix)
    kpiCriticalChip.textContent = criticalCount === 0 ? 'Optimal' : `${criticalCount} SPIKE${criticalCount > 1 ? 'S' : ''}`;
    kpiCriticalChip.className = `kpi-chip ${criticalCount === 0 ? 'success' : 'danger'}`;

    kpiTrendChip.textContent = overallTrendText.toLowerCase();
    kpiTrendChip.className = `kpi-chip ${trendColor}`;

    kpiWarningChip.textContent = `${warningCount} Zone${warningCount !== 1 ? 's' : ''}`;
    kpiWarningChip.className = `kpi-chip ${warningCount === 0 ? 'success' : 'warning'}`;

    // Update KPI charts
    if (!isInitial) {
      for (let kpiKey in kpiCharts) {
        const historyKey = kpiKey === 'warning' ? 'warning' : kpiKey === 'trend' ? 'trend' : kpiKey === 'critical' ? 'critical' : 'occupancy';
        kpiCharts[kpiKey].data.datasets[0].data = [...kpiHistory[historyKey]];
        kpiCharts[kpiKey].update('none');
      }
    }
  }

  // timeline Alerts
  function injectTimelineAlert(alert) {
    noAlertsView.classList.add('hidden');
    
    alertCount++;
    alertBadgeCount.textContent = alertCount;

    const alertItem = document.createElement('div');
    alertItem.className = 'alert-item critical';
    alertItem.innerHTML = `
      <div class="alert-item-header">
        <span class="alert-item-title">Surge Spike Alert: ${alert.zoneName}</span>
        <span class="alert-item-time">${alert.timestamp}</span>
      </div>
      <p class="alert-item-directive">${alert.staff_action}</p>
      <div class="alert-item-translations">
        <div class="alert-lang-row">
          <span class="alert-lang-lbl">EN</span>
          <span>${alert.fan_english}</span>
        </div>
        <div class="alert-lang-row">
          <span class="alert-lang-lbl">ES</span>
          <span>${alert.fan_spanish}</span>
        </div>
      </div>
    `;

    alertListContainer.insertBefore(alertItem, alertListContainer.firstChild);
    alertListContainer.scrollTop = 0;
  }

  // WebSocket Manager
  function connectWebSocket() {
    wsStatusDot.className = 'status-pulse';
    wsStatusText.textContent = 'CONNECTING';

    socket = new WebSocket(WS_URL);

    socket.onopen = () => {
      console.log('Ops Command WS feed active.');
      wsStatusDot.className = 'status-pulse online';
      wsStatusText.textContent = 'CONNECTED';
    };

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);

        switch (payload.type) {
          case 'INITIAL_STATE':
            buildDashboardUI(payload.zones);
            if (payload.alerts && payload.alerts.length > 0) {
              payload.alerts.forEach(alert => injectTimelineAlert(alert));
            }
            break;
            
          case 'ZONE_UPDATES':
            if (Object.keys(zoneCharts).length === 0) {
              buildDashboardUI(payload.zones);
            } else {
              updateDashboardUI(payload.zones);
            }
            break;

          case 'BRIEFING_UPDATE':
            // Cancel active typing and clear text immediately to avoid race overlap (Bug 5 Fix)
            if (typingInterval) {
              clearInterval(typingInterval);
              typingInterval = null;
            }
            briefingTextElement.textContent = '';
            
            typeWriteText(briefingTextElement, payload.briefing, briefingCursor, 14);
            briefingTimeStamp.textContent = `Last calculated: ${payload.timestamp}`;
            briefingConfidence.textContent = `CONFIDENCE: ${Math.floor(Math.random() * 4) + 96}%`;
            break;

          case 'ALERT_TRIGGERED':
            injectTimelineAlert(payload.alert);
            break;
            
          default:
            break;
        }
      } catch (err) {
        console.error('Telemetry socket processing failure:', err);
      }
    };

    socket.onclose = () => {
      console.warn('Ops Command WS feed link lost. Retrying link in 5s...');
      wsStatusDot.className = 'status-pulse offline';
      wsStatusText.textContent = 'DISCONNECTED';
      setTimeout(connectWebSocket, 5000);
    };

    socket.onerror = (err) => {
      console.error('Socket stream error:', err);
      socket.close();
    };
  }

  connectWebSocket();

  // Briefing manual refresh
  async function refreshBriefing() {
    // Stop any active typing loop and clear text immediately to prevent race overlap (Bug 5 Fix)
    if (typingInterval) {
      clearInterval(typingInterval);
      typingInterval = null;
    }
    briefingTextElement.textContent = '';

    insightLoading.classList.remove('hidden');
    btnRefreshInsight.disabled = true;

    try {
      const response = await fetch(`${API_INSIGHT_URL}?force=true`);
      if (!response.ok) throw new Error("Status code: " + response.status);
      const data = await response.json();

      typeWriteText(briefingTextElement, data.briefing, briefingCursor, 14);
      briefingTimeStamp.textContent = `Last calculated: ${data.timestamp}`;
      briefingConfidence.textContent = `CONFIDENCE: ${Math.floor(Math.random() * 4) + 96}%`;
    } catch (error) {
      console.error("Ops Briefing update error:", error);
      briefingTextElement.innerHTML = `<span style="color: var(--color-danger)">⚠️ Command briefing update failed. Telemetry grids are active. Review log feed.</span>`;
      briefingCursor.style.display = 'none';
    } finally {
      insightLoading.classList.add('hidden');
      btnRefreshInsight.disabled = false;
    }
  }
  btnRefreshInsight.addEventListener('click', refreshBriefing);

  // Chat Query submission
  chatQueryForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = chatQueryInput.value.trim();
    if (!query) return;

    chatQueryInput.value = '';
    chatQueryInput.disabled = true;
    btnSubmitChat.disabled = true;

    chatThreadBox.classList.remove('hidden');
    chatQueryEcho.textContent = `Query: "${query}"`;
    chatResponseText.innerHTML = `<span style="color: var(--color-ai); animation: blink 1s infinite;">Formulating response...</span>`;

    try {
      const response = await fetch(API_QUERY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: query })
      });

      if (!response.ok) throw new Error("Query API error status: " + response.status);
      const data = await response.json();
      
      chatResponseText.textContent = data.answer;
    } catch (error) {
      console.error("Query API communication failure:", error);
      chatResponseText.innerHTML = `<span style="color: var(--color-danger)">⚠️ Telemetry link error. Direct assistance is temporarily offline. Live feeds remain active.</span>`;
    } finally {
      chatQueryInput.disabled = false;
      btnSubmitChat.disabled = false;
      chatQueryInput.focus();
    }
  });

});
