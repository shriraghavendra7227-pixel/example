# CrowdPulse — Smart Stadium Crowd Congestion Dashboard

**CrowdPulse** is a real-time queue congestion and crowd flow telemetry dashboard built specifically for **FIFA World Cup 2026** stadium operations staff. It represents a state-of-the-art approach to smart arena operations (PromptWars Challenge 4 — Smart Stadiums & Tournament Operations).

It combines high-frequency telemetry updates with server-side GenAI reasoning (powered by Anthropic's Claude 3.5 Sonnet) to deliver not just raw charts, but real-time tactical action cards, ad-hoc natural language operations assistance, and automated bilingual public alerts.

---

## ⚽ The Problem: World Cup 2026 Crowd Bottlenecks

A FIFA World Cup stadium hosts upwards of 60,000 to 100,000 spectators. Large venues face massive crowd coordination bottlenecks:
1. **Entry Gate Congestion**: Batches of thousands of fans arriving at the same gate simultaneously lead to hours-long queues, manual ticket scanner overload, and security risks.
2. **Concourse Stagnation**: Fans congregate around primary amenities (food courts, restrooms) during half-time, causing gridlock that prevents emergency movements.
3. **Transit Overload**: Immediate surges towards buses and rail transit lines post-match can block evacuation corridors.
4. **Information Dissemination Lag**: Operational staff can see congestion on static screens, but translating that raw telemetry into actionable steps for stewards and clear announcements for fans in multiple languages (specifically English and Spanish for 2026 hosts) usually takes 10–15 critical minutes.

---

## 🧠 The GenAI Value Proposition

A traditional telemetry dashboard displays numbers and graphs. However, operators in a high-stress stadium command center must spend cognitive load digesting these figures to decide *what* to do. 

**CrowdPulse** changes this paradigm by using Claude 3.5 Sonnet to add:
- **Instant Synthesis**: Translates raw occupancy % and direction trends across all 8 zones into a 2-sentence tactical briefing every 20 seconds.
- **Multilingual Fan Redirection**: When a zone crosses the critical 85% threshold, Claude automatically generates an active instruction set. This includes a tactical radio directive for staff *and* a friendly, localized public announcement in both English and Spanish for immediate display on stadium signage and mobile apps.
- **Natural Language Inquiry**: Instead of writing SQL queries or navigating complex menu trees, operations directors can simply type: *"Which gate needs backup staff right now?"* or *"Summarize the restroom lines"* to get instant, synthesized, context-aware operational advice.

---

## 📡 Connecting to Production Sensors & Beacons

While this MVP relies on a simulated telemetry engine, the backend is architected to slot directly into a live IoT infrastructure:
```
[Physical Arena Sensors] 
        │ (Wi-Fi APs, LiDAR, BLE Beacons, Cameras)
        ▼
[Edge Event Stream Hub] 
        │ (Kafka / AWS Kinesis / RabbitMQ)
        ▼
[Real-Time State Processor] 
        │ (Flinks / Node-RED / Express Event Receiver)
        ▼
[CrowdPulse In-Memory telemetry] ──► [Claude API] ──► [Operations Web UI]
```

To replace the simulation with live data:
1. **Camera Feed/LiDAR Feed**: Deploy overhead camera counts or LiDAR sensors at gates and concourses. Run edge-based object detection (e.g., YOLO) to get ingress/egress velocities and occupancy estimates.
2. **Wi-Fi / Bluetooth Low Energy (BLE) Beacons**: Match day apps can report anonymized BLE beacon signals to triangulate fan location densities.
3. **Data Ingestion**: Replace the `setInterval` simulator in `server.js` with an event listener subscribing to a message queue (e.g., MQTT or Apache Kafka topic). Each time a zone sensor sends a payload, update the zone's in-memory array, push history points, check if it crosses the 85% threshold, and broadcast the new packet over WebSockets.

---

## 🛠️ Installation & Setup Instructions

### Prerequisites
- Node.js installed (v16.0 or higher recommended)
- Anthropic API Key (Claude Sonnet 3.5 capability)

### Step 1: Clone and Install Dependencies
In the project directory, run:
```bash
npm install
```

### Step 2: Configure Environment Variables
Create a file named `.env` in the root folder of the project (`w:\yoga akka projecct\.env`):
```env
PORT=3000
ANTHROPIC_API_KEY=your_actual_anthropic_api_key
```

*Note: If the API key is missing or not provided, the dashboard will run seamlessly using its built-in rule-based fallback engines for alerts, briefings, and chat queries.*

### Step 3: Launch the Application
Run the start command:
```bash
npm start
```

Open your browser and navigate to **`http://localhost:3000`** to view the live dashboard!
