# Sage - AI-Powered Type 1 Diabetes Assistant

An intelligent, proactive diabetes management platform featuring real-time glucose monitoring, advanced pattern analysis, and a conversational AI assistant built on LangGraph. Sage combines LibreView integration, sophisticated statistical analysis, and multi-channel communication to provide personalized insights and recommendations.

## Table of Contents

- [Features](#features)
- [Architecture Overview](#architecture-overview)
- [LangGraph Agent Architecture](#langgraph-agent-architecture)
- [AI Agent System](#ai-agent-system)
- [Code Structure](#code-structure)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Usage](#usage)
- [Development](#development)
- [Cost Considerations](#cost-considerations)

## Features

### 🤖 Intelligent AI Assistant (Sage)

**Conversational Analysis:**
- Multi-turn conversations with context preservation
- 32 specialized tools for glucose analysis
- Hybrid architecture: small model for tool calling, large model for synthesis
- Long-term memory system that remembers your preferences across all conversations

**Analysis Capabilities:**
- **Trend Analysis**: Detect glucose trends with regression analysis and forecasting
- **Anomaly Detection**: Identify unusual readings with statistical scoring
- **Period Comparison**: Compare weekdays vs weekends, or any two time periods
- **Pattern Recognition**: Meal responses, basal adequacy, exercise effects
- **Statistical Insights**: Correlation tracking, confidence scoring, significance testing

### 📊 Real-Time Glucose Monitoring

- **LibreView Integration**: Automatic sync with LibreView/LibreLinkUp
- **Live Updates**: Continuous polling every 60 seconds
- **Multi-View Dashboard**: Today, last night, overnight fasting
- **Trend Indicators**: Visual arrows showing glucose direction
- **Data Persistence**: PostgreSQL storage with full history

### 📈 Advanced Analytics

**Core Metrics:**
- Time in Range (TIR): 70-140 mg/dL and 70-180 mg/dL targets
- Coefficient of Variation (CV): Glucose stability indicator
- Estimated A1C: Calculated from average glucose
- Fasting Glucose: 3am-7am overnight averages

**Pattern Detection:**
- Dawn phenomenon detection (automatic)
- Overnight low detection (automatic)
- Meal response patterns with confidence scoring
- Basal insulin adequacy analysis
- Exercise impact tracking
- Correlation analysis between events and glucose responses

### 📱 Proactive Monitoring

- **Background Analysis**: Checks every 30 minutes automatically
- **Discord Integration**: Sends insights via Discord messages
- **Smart Cooldowns**: Prevents spam with intelligent timing (4+ hour intervals)
- **Educational Focus**: Explains physiological mechanisms, not just numbers
- **Adaptive Messaging**: Adjusts based on time of day and recent activity

### 💬 Multi-Channel Communication

1. **Web Chat**: Built-in chat interface with streaming responses
2. **Discord Bot**: Two-way conversations via Discord DMs
3. **Proactive Messages**: Automated insights sent to Discord

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐    │
│  │  Dashboard   │  │  Chat UI     │  │  Settings         │    │
│  │  (Charts)    │  │  (Streaming) │  │  (LibreView Auth) │    │
│  └──────────────┘  └──────────────┘  └───────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP / SSE (Server-Sent Events)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Backend (Node.js + Express)                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                      REST API                             │  │
│  │  /auth  /chat  /glucose  /conversations  /settings       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                   │
│  ┌───────────────┬──────────┴─────────┬────────────────────┐  │
│  │               │                     │                     │  │
│  ▼               ▼                     ▼                     ▼  │
│ ┌─────────┐  ┌─────────┐  ┌───────────────┐  ┌──────────────┐ │
│ │LibreView│  │  AI     │  │   Pattern     │  │   Discord    │ │
│ │ Poller  │  │ Agent   │  │   Detector    │  │     Bot      │ │
│ │(60s)    │  │(Hybrid) │  │   (30min)     │  │  (Real-time) │ │
│ └─────────┘  └─────────┘  └───────────────┘  └──────────────┘ │
│                              │                                   │
│                   Proactive Monitor (30min)                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │   PostgreSQL     │
                    │   - Users        │
                    │   - Glucose Data │
                    │   - Conversations│
                    │   - Patterns     │
                    │   - Memory       │
                    └──────────────────┘
```

### Frontend Architecture

**Technology Stack:**
- React 19 with TypeScript
- Vite for blazing-fast development
- Tailwind CSS + shadcn/ui components
- Recharts for glucose visualizations
- Framer Motion for smooth animations

**Key Components:**
- `Dashboard.tsx`: Main glucose monitoring view with charts
- `ChatInterface.tsx`: AI assistant conversation UI with streaming
- `GlucoseChart.tsx`: Time-series visualization of glucose readings
- `Settings.tsx`: LibreView connection and user preferences

### Backend Architecture

**Core Services:**

1. **REST API** (`src/api/routes/`)
   - Authentication (JWT-based)
   - Chat streaming (Server-Sent Events)
   - Glucose data management
   - Conversation history

2. **LibreView Poller** (`src/services/libreviewPoller.ts`)
   - Polls every 60 seconds
   - Fetches latest glucose readings
   - Stores in database
   - Handles authentication refresh

3. **AI Agent** (`src/agent/`)
   - Hybrid LangGraph architecture
   - Tool execution and synthesis
   - Streaming responses
   - Multi-modal (chat, Discord, proactive)

4. **Pattern Detector** (`src/services/pattern-detector.ts`)
   - Runs every 30 minutes
   - Analyzes meals (>4h old)
   - Analyzes exercise (>2h old)
   - Analyzes overnight patterns
   - Stores patterns with confidence scores

5. **Proactive Monitor** (`src/services/proactive-monitor.ts`)
   - Runs every 30 minutes
   - Uses AI agent for analysis
   - Sends Discord messages
   - Manages cooldowns and timing

6. **Discord Bot** (`src/services/discord-bot.ts`)
   - Receives DMs and mentions
   - Links Discord users to Sage accounts
   - Two-way conversations

## LangGraph Agent Architecture

Sage uses **LangGraph** (by LangChain) to orchestrate complex, multi-step AI workflows. The agent can either use a standard single-model approach or a hybrid two-model approach for optimal cost and performance.

### What is LangGraph?

LangGraph is a framework for building stateful, multi-actor applications with LLMs. It models agent workflows as **graphs** with **nodes** (functions that process state) and **edges** (transitions between nodes).

**Key Concepts:**
- **State**: Shared data structure passed between nodes
- **Nodes**: Functions that read state, do work, return new state
- **Edges**: Define flow between nodes (fixed or conditional)
- **Reducers**: Functions that merge new state into existing state (e.g., `concat` for messages)

### Hybrid Agent Graph

Sage uses a **hybrid architecture** to optimize for both cost and quality:

```
┌─────────────────────────────────────────────────────────────────────┐
│                      HYBRID AGENT GRAPH                              │
│                                                                       │
│  START                                                                │
│    │                                                                  │
│    ▼                                                                  │
│  ┌──────────────────────────────────────────────────────┐           │
│  │         ANALYSIS NODE (Small Model)                   │           │
│  │  - gpt-oss-120b (OpenRouter) or qwen2.5:32b (Ollama) │           │
│  │  - Has 32 tools bound                                 │           │
│  │  - Decides which tools to call                        │           │
│  │  - Iterates up to 8 times                             │           │
│  │  - Returns "Analysis complete" when done              │           │
│  └──────────────────────────────────────────────────────┘           │
│           │                        ▲                                  │
│           │ has tool calls?        │                                  │
│           ▼                        │                                  │
│  ┌──────────────────────────────────────────────────────┐           │
│  │              TOOLS NODE                               │           │
│  │  - Executes requested tools                           │           │
│  │  - Returns ToolMessage results                        │           │
│  │  - Examples: get_glucose_readings, analyze_trends    │           │
│  └──────────────────────────────────────────────────────┘           │
│           │                                                            │
│           └────────────────┐                                         │
│                             │                                         │
│           no tool calls?    │                                         │
│           ▼                 │                                         │
│  ┌──────────────────────────────────────────────────────┐           │
│  │       SYNTHESIS NODE (Large Model)                    │           │
│  │  - Claude Sonnet 4.5 (OpenRouter)                    │           │
│  │  - NO tools bound                                     │           │
│  │  - Receives filtered messages:                        │           │
│  │    • User's question                                  │           │
│  │    • Tool results (formatted as context)             │           │
│  │  - Generates final user-facing message                │           │
│  └──────────────────────────────────────────────────────┘           │
│           │                                                            │
│           ▼                                                            │
│          END                                                          │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### Message Flow Through the Graph

**Initial State:**
```javascript
{
  messages: [HumanMessage("What's my glucose trend this week?")],
  userId: "user-123",
  userContext: { email, diagnosisType, timezone },
  readyForSynthesis: false,
  iterationCount: 0
}
```

**Iteration 1 - Analysis Node:**
```javascript
// Analysis node calls small model with tools
// Small model decides to call analyze_trends tool
{
  messages: [
    HumanMessage("What's my glucose trend this week?"),
    AIMessage("", tool_calls=[{name: "analyze_trends", args: {days: 7}}])
  ],
  readyForSynthesis: false,
  iterationCount: 1
}
```

**Tools Node:**
```javascript
// Tool executes and returns results
{
  messages: [
    HumanMessage("What's my glucose trend this week?"),
    AIMessage("", tool_calls=[...]),
    ToolMessage("{\"trendDirection\":\"stable\",\"slope\":2.5,...}")
  ],
  readyForSynthesis: false,
  iterationCount: 1
}
```

**Iteration 2 - Analysis Node:**
```javascript
// Small model sees tool results, decides it has enough data
{
  messages: [
    HumanMessage("What's my glucose trend this week?"),
    AIMessage("", tool_calls=[...]),
    ToolMessage("{...trend data...}"),
    AIMessage("Analysis complete")
  ],
  readyForSynthesis: true,  // ← Signals ready for synthesis
  iterationCount: 2
}
```

**Synthesis Node:**
```javascript
// Large model receives:
// 1. System prompts (synthesis-specific, NO tool descriptions)
// 2. User's question
// 3. Tool results formatted as structured context
//
// Generates user-facing response
{
  messages: [
    HumanMessage("What's my glucose trend this week?"),
    AIMessage("", tool_calls=[...]),
    ToolMessage("{...}"),
    AIMessage("Analysis complete"),
    AIMessage("Your glucose trend this week shows stability...")  // ← Final response
  ],
  readyForSynthesis: true,
  iterationCount: 2
}
```

### Critical Implementation Details

**1. State Reducers Use Concat**

LangGraph's state reducers use `concat` for message arrays. This means nodes **must only return NEW messages**, not the full message array:

```typescript
// ❌ WRONG - Causes exponential duplication
return {
  messages: [...state.messages, newMessage]
};

// ✅ CORRECT - State reducer handles concat
return {
  messages: [newMessage]
};
```

**2. Message Transformation for Synthesis**

The synthesis node cannot receive raw tool_calls and ToolMessages because:
- Large model doesn't have tools bound
- Anthropic API requires tool_calls to have corresponding tool definitions
- Would confuse the model (seeing tool_calls it doesn't know about)

Solution: Transform messages before sending to synthesis:
```typescript
// Remove: AIMessages with tool_calls, "Analysis complete" messages
// Keep: HumanMessages (user questions), substantial AIMessages from previous turns
// Convert: ToolMessages → SystemMessage with formatted context

// Example transformation:
[
  SystemMessage("You are Sage..."),
  HumanMessage("What's my trend?"),
  SystemMessage("Analysis phase gathered:\n--- Data from analyze_trends ---\n{...json...}")
]
```

**3. Streaming in Hybrid Mode**

When streaming responses, only collect from the **synthesis node**:

```typescript
for await (const chunk of stream) {
  // Check which node the chunk is from
  const nodeUpdate = chunk.agent || chunk.analysis || chunk.synthesis || chunk.tools;

  // Only stream synthesis node (or standard agent node)
  const isFromSynthesis = !!chunk.synthesis;
  const isFromStandardAgent = !!chunk.agent;

  if (isFromSynthesis || isFromStandardAgent) {
    // This is the final message, stream it to user
  }
  // Skip analysis node's "Analysis complete" message
}
```

### Standard vs Hybrid Mode

**Standard Mode** (single model):
```
START → AGENT (with tools) ⇄ TOOLS → END
         ↑_____________________↓
```
- One model does everything (tool calling + response generation)
- Simpler but more expensive if using large model
- Good for local development (Ollama)

**Hybrid Mode** (two models):
```
START → ANALYSIS (small + tools) ⇄ TOOLS → SYNTHESIS (large, no tools) → END
         ↑____________________________↓
```
- Small model ($0.039/M) handles tool calling iterations
- Large model ($3/M) only generates final synthesis
- 45-93% cost savings depending on configuration
- Optimal for production with cloud models

## AI Agent System

### Tool System (32 Tools)

Sage has access to 32 specialized tools organized by category:

**Glucose Data Tools:**
- `get_glucose_readings`: Fetch glucose readings for date range
- `get_glucose_summary`: Daily aggregated metrics
- `get_recent_glucose`: Last N readings
- `analyze_live_trend`: Current glucose and recent trend

**Statistical Analysis Tools:**
- `analyze_trends`: Trend detection with regression and forecasting
- `detect_anomalies`: Identify unusual readings with scoring
- `compare_periods_statistical`: Statistical comparison between periods

**Pattern Analysis Tools:**
- `analyze_meal_patterns`: Meal response analysis
- `analyze_basal_patterns`: Overnight/fasting pattern analysis
- `analyze_exercise_patterns`: Exercise impact analysis
- `get_detected_patterns`: Retrieve stored patterns
- `run_pattern_detection`: Manually trigger pattern detection

**Event Logging Tools:**
- `log_meal`: Log meals with carb estimation
- `log_exercise`: Track exercise sessions
- `log_insulin`: Record insulin doses
- `get_meal_history`, `get_exercise_history`, `get_insulin_history`

**Memory Tools:**
- `store_user_memory`: Save facts about user
- `retrieve_user_memory`: Recall stored facts
- `search_user_memory`: Find relevant memories

**Context Tools:**
- `get_user_context`: User's diagnosis info and timezone
- `check_alert_conditions`: Check for concerning patterns

### Pattern Detection Service

Runs every 30 minutes in the background:

**Meal Pattern Detection:**
- Analyzes meals >4 hours old
- Calculates spike magnitude, time to peak, time in range
- Builds confidence scores based on consistency
- Example: "Breakfast (oatmeal + eggs) typically spikes 65mg/dL, peaks at 90min" (confidence: 0.72)

**Basal Pattern Detection:**
- Analyzes overnight periods (10pm-8am)
- Checks for dawn phenomenon, overnight lows, stability
- Evaluates basal insulin adequacy
- Example: "Overnight glucose stable at 105±8 mg/dL" (confidence: 0.85)

**Exercise Pattern Detection:**
- Analyzes exercise >2 hours old
- Measures glucose drop, recovery time, delayed effects
- Tracks insulin sensitivity changes
- Example: "30min cardio → 45mg/dL drop, 3h recovery" (confidence: 0.68)

**Correlation Tracking:**
- Links events to glucose readings via `glucose_correlations` table
- Stores pre-event, peak, and post-event glucose values
- Enables statistical analysis of event impacts

### Proactive Monitoring Service

Runs every 30 minutes, analyzes all users:

**Two-Phase Approach:**

1. **Phase 1: Generate Message**
   - Agent analyzes recent glucose data
   - Uses 4-6 tools to gather comprehensive insights
   - Generates a message based on findings
   - Adjusts analysis based on time of day

2. **Phase 2: Decide Whether to Send**
   - Agent evaluates if message is substantial enough
   - Checks against cooldown timers (4+ hours)
   - Verifies message contains specific data/insights
   - Only sends if genuinely valuable

**Time-Aware Analysis:**
- 6am: Good morning review
- 7-10am: Breakfast patterns
- 10am-12pm: Morning recap
- 12-2pm: Lunch context
- 2-5pm: Afternoon analysis
- 5-8pm: Evening patterns
- 8-10pm: Dinner review
- 10pm: Goodnight summary

**Cooldown Logic:**
- Minimum 4 hours between messages
- Daily summary sent once per day (8am)
- Respects sleep hours (10pm-7am)
- Skips users without recent data

## Code Structure

```
glucose-dashboard/
├── src/                          # Frontend (React)
│   ├── components/
│   │   ├── Dashboard.tsx         # Main monitoring view
│   │   ├── ChatInterface.tsx     # AI chat UI
│   │   ├── GlucoseChart.tsx      # Recharts visualizations
│   │   ├── Settings.tsx          # User preferences
│   │   └── ui/                   # shadcn/ui components
│   ├── services/
│   │   └── api.ts                # API client
│   ├── lib/
│   │   └── utils.ts              # Shared utilities
│   └── App.tsx                   # Root component
│
└── t1d-server/                   # Backend (Node.js)
    ├── src/
    │   ├── api/
    │   │   ├── routes/
    │   │   │   ├── auth.ts       # Authentication endpoints
    │   │   │   ├── chat.ts       # Chat streaming (SSE)
    │   │   │   ├── conversations.ts  # Chat history
    │   │   │   ├── glucose.ts    # Glucose data API
    │   │   │   └── settings.ts   # User settings
    │   │   └── middleware/
    │   │       └── auth.ts       # JWT verification
    │   │
    │   ├── agent/
    │   │   ├── graph.ts          # Agent graph factory
    │   │   ├── hybrid-graph.ts   # Hybrid implementation
    │   │   ├── standard-graph.ts # Standard implementation
    │   │   ├── tools.ts          # All 32 tools
    │   │   ├── prompts.ts        # System prompts
    │   │   └── providers.ts      # AI model configuration
    │   │
    │   ├── services/
    │   │   ├── libreviewPoller.ts       # LibreView sync
    │   │   ├── pattern-detector.ts      # Pattern analysis
    │   │   ├── pattern-algorithms.ts    # Statistical algorithms
    │   │   ├── advanced-analysis.ts     # Trend/anomaly tools
    │   │   ├── proactive-monitor.ts     # Proactive messaging
    │   │   ├── discord-bot.ts           # Discord integration
    │   │   ├── discord.ts               # Discord webhooks
    │   │   ├── report-generators.ts     # Daily/weekly/monthly reports
    │   │   └── reporting-service.ts     # Report scheduling
    │   │
    │   ├── config/
    │   │   ├── database.ts       # PostgreSQL connection
    │   │   └── env.ts            # Environment config
    │   │
    │   ├── db/
    │   │   └── schema.sql        # Database schema
    │   │
    │   └── index.ts              # Server entry point
    │
    ├── scripts/
    │   ├── setup-db.js           # Database initialization
    │   ├── reset-db.js           # Fresh database reset
    │   ├── migrate-*.js          # Schema migrations
    │   └── check-config.js       # Configuration diagnostics
    │
    └── COST_ANALYSIS.md          # Detailed cost breakdown
```

### Key Files Explained

**Agent Graph (`src/agent/`):**
- `graph.ts`: Factory function that returns configured agent (standard or hybrid)
- `hybrid-graph.ts`: Implements three-node hybrid architecture
- `standard-graph.ts`: Implements single-model architecture
- `tools.ts`: Defines all 32 tools with schemas and implementations
- `prompts.ts`: System prompts for both analysis and synthesis
- `providers.ts`: Configures Ollama/OpenRouter models

**Services (`src/services/`):**
- Background services that run independently
- Each service is a class with `start()` and `stop()` methods
- Managed by main server (`index.ts`)

**API Routes (`src/api/routes/`):**
- RESTful endpoints for frontend
- `chat.ts` uses Server-Sent Events for streaming responses
- All routes protected by JWT auth middleware

## Getting Started

### Prerequisites

- **Node.js 18+** and npm
- **Docker** (for PostgreSQL)
- **AI Provider**: Choose one:
  - **Ollama** (local, free) - Recommended for development
  - **OpenRouter** (cloud, paid) - Recommended for production

### Quick Setup

1. **Clone the repository:**
```bash
git clone https://github.com/kristsauders/Glucose-Dashboard.git
cd Glucose-Dashboard
```

2. **Install dependencies:**
```bash
npm install
```

This installs dependencies for both frontend and backend.

3. **Configure backend:**
```bash
cd t1d-server
cp .env.example .env
```

Edit `.env` with your configuration (see [Configuration](#configuration) section).

4. **Set up database:**
```bash
npm run docker:up    # Start PostgreSQL
sleep 5              # Wait for startup
npm run db:setup     # Create schema
npm run db:migrate   # Run migrations
```

5. **Start the application:**

From root directory:
```bash
npm start
```

This starts both frontend (http://localhost:5173) and backend (http://localhost:3002).

6. **First-time setup:**
- Open http://localhost:5173
- Create account
- Go to Settings
- Connect LibreView (optional)
- Upload CSV file (optional)
- Start chatting with Sage!

### Ubuntu Setup (Fresh Machine)

See `t1d-server/UBUNTU_SETUP.md` for complete Ubuntu installation guide.

## Configuration

### AI Provider Options

You can configure Sage to use different AI models for optimal cost/performance:

**Option 1: Local Ollama (FREE)**
```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:32b
```

**Pros:** Free, private, fast
**Cons:** Requires local GPU, 32k context limit

**Option 2: Hybrid Mode (RECOMMENDED for Production)**
```env
AI_PROVIDER=hybrid
HYBRID_SMALL_PROVIDER=ollama
HYBRID_SMALL_MODEL=qwen2.5:32b
HYBRID_LARGE_MODEL=anthropic/claude-sonnet-4.5
OLLAMA_BASE_URL=http://localhost:11434
OPENROUTER_API_KEY=your-key
```

**Pros:** Free tool iterations, high-quality synthesis, optimal cost
**Cons:** Requires both Ollama and OpenRouter

**Option 3: Cloud Models (OpenRouter)**
```env
AI_PROVIDER=hybrid
HYBRID_SMALL_PROVIDER=openrouter
HYBRID_SMALL_MODEL=openai/gpt-oss-120b:nitro
HYBRID_LARGE_MODEL=anthropic/claude-sonnet-4.5
OPENROUTER_API_KEY=your-key
```

**Pros:** No local infrastructure, 131k context
**Cons:** More expensive (~$170/month with 30min proactive checks)

### Cost Optimization

See `t1d-server/COST_ANALYSIS.md` for detailed cost breakdown of different configurations.

**Summary:**
- **Ollama + Sonnet 4.5 @ 60min**: $94/month (45% savings)
- **gpt-oss-120b + Sonnet 4.5 @ 30min**: $170/month (baseline)
- **Ollama + glm-4.7 @ 60min**: $12/month (93% savings, lower quality)

**Check your current configuration:**
```bash
cd t1d-server
npm run check-config
```

### Environment Variables Reference

**Database:**
```env
DATABASE_URL=postgresql://t1d_user:password@localhost:5432/t1d
```

**Authentication:**
```env
JWT_SECRET=your-super-secret-key-change-this
```

**AI Provider (choose one mode):**
```env
# Standard mode with Ollama
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:32b

# OR: Hybrid mode (recommended)
AI_PROVIDER=hybrid
HYBRID_SMALL_PROVIDER=ollama
HYBRID_SMALL_MODEL=qwen2.5:32b
HYBRID_LARGE_MODEL=anthropic/claude-sonnet-4.5
OLLAMA_BASE_URL=http://localhost:11434
OPENROUTER_API_KEY=your-openrouter-key
```

**Discord (optional):**
```env
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/your-webhook
DISCORD_BOT_TOKEN=your-bot-token
```

**LibreView Polling:**
```env
LIBREVIEW_POLL_INTERVAL=60000  # milliseconds (default: 60s)
```

## Usage

### Chat with Sage

**Web Interface:**
1. Click chat icon in dashboard
2. Type questions about your glucose
3. Get streaming responses with real-time insights
4. Switch conversations or start new ones

**Example Questions:**
- "What's my glucose trend this week?"
- "Show me my overnight patterns"
- "Compare this week to last week"
- "Do I have any unusual readings?"
- "I had oatmeal for breakfast" (logs meal automatically)
- "Took 4 units of Humalog" (logs insulin)

**Discord Bot:**
1. Link Discord in Settings (enter your Discord User ID)
2. Send DM to Sage bot
3. Or mention @Sage in server

### Proactive Monitoring

Once configured, Sage automatically:
- Checks every 30 minutes
- Analyzes recent patterns
- Generates insights
- Sends to Discord if substantial
- Respects cooldowns (4+ hours)
- Avoids sleep hours (10pm-7am)

**Message Types:**
- Trend analysis: "Your TIR increased 8% this week"
- Pattern identification: "Breakfast spikes are 30mg/dL less on days you exercise"
- Anomaly alerts: "Detected 3 unexplained highs yesterday"
- Educational explanations: "This looks like dawn phenomenon..."
- Recommendations: "Consider checking basal adequacy"

### Memory System

Sage remembers facts across all conversations:

```
You: "I usually eat breakfast at 7am"
Sage: "Got it, I'll remember that"

[New conversation, hours later]

You: "When should I check my glucose?"
Sage: "Since you typically eat breakfast at 7am, I'd recommend
       checking fasting glucose right before, then 2 hours after..."
```

**Stored in `agent_memory` table:**
- Habits (meal times, exercise routine)
- Medical info (insulin doses, medication)
- Preferences (diet type, goals)
- Patterns (glucose responses, sensitivities)

## Development

### Backend Development

```bash
cd t1d-server
npm run dev           # Start with hot reload (tsx watch)
npm run build         # Build TypeScript → dist/
npm run start         # Run production build
npm run check-config  # Verify configuration
```

### Frontend Development

```bash
npm run dev           # Vite dev server (port 5173)
npm run build         # Build for production
npm run preview       # Preview production build
```

### Database Management

```bash
cd t1d-server
npm run docker:up     # Start PostgreSQL container
npm run docker:down   # Stop PostgreSQL container
npm run db:setup      # Create initial schema
npm run db:reset      # Drop all tables and recreate
npm run db:migrate    # Run all migrations
```

### Testing Discord

```bash
cd t1d-server
node scripts/test-discord.js  # Send test webhook message
```

### Database Schema

**Core Tables:**
- `users`: User accounts and settings
- `glucose_readings`: All glucose data points
- `conversations`: Chat threads
- `chat_messages`: Chat history
- `agent_memory`: Long-term memory facts

**Pattern Tables:**
- `glucose_patterns`: Detected patterns with confidence
- `glucose_correlations`: Event→glucose response links
- `pattern_events`: Indexed events for pattern matching

**Logging Tables:**
- `meal_logs`, `exercise_logs`, `insulin_doses`: User-logged events
- `sage_messages`: Proactive message history
- `glucose_monitoring_state`: Per-user monitoring state

**Report Tables:**
- `daily_reports`: Daily glucose summaries
- `weekly_reports`: Weekly trend analysis
- `monthly_reports`: Monthly comprehensive reports

## Cost Considerations

AI model costs vary significantly based on configuration. See `t1d-server/COST_ANALYSIS.md` for detailed analysis.

**Key Factors:**
- Small model choice (Ollama free vs OpenRouter $0.039/M)
- Large model choice (Sonnet $3/M vs Opus $5/M)
- Proactive frequency (30min vs 60min vs 90min)
- Chat usage (estimated 10/day)

**Recommended:**
- **Development**: Ollama locally (100% free)
- **Production**: Hybrid with Ollama + Sonnet 4.5 @ 60min ($94/month)
- **Premium**: Hybrid with Ollama + Opus 4.5 @ 60min ($163/month)

## Advanced Features

### Pattern Confidence Scoring

Patterns are scored 0-1 based on:
- Number of observations (more = higher)
- Consistency of results (less variance = higher)
- Statistical significance (R² for trends)

Example pattern with 0.85 confidence:
```json
{
  "pattern_type": "basal",
  "name": "Overnight Stability",
  "confidence": 0.85,
  "data": {
    "avgGlucose": 105,
    "stdDev": 8,
    "observations": 14,
    "dawnPhenomenon": false
  }
}
```

### Statistical Tools

**Trend Analysis:**
- Linear regression (y = mx + b)
- R² goodness of fit
- Forecasting with confidence intervals
- Change point detection (>20% deviation)

**Anomaly Detection:**
- Baseline expectations from patterns
- Severity scoring (low/medium/high)
- Contextualization with logged events
- Adjustable sensitivity levels

**Period Comparison:**
- T-tests for significance (p < 0.05)
- Effect size classification (major/moderate/minor)
- Multiple metrics comparison
- Week-over-week, weekend vs weekday

## Privacy & Security

- ✅ All data stored in PostgreSQL (your control)
- ✅ JWT authentication for all API requests
- ✅ LibreView credentials encrypted (AES-256)
- ✅ Local AI option (Ollama) for privacy
- ✅ No third-party analytics or tracking
- ✅ Discord optional (not required)
- ✅ Open source (audit the code)

## Troubleshooting

### Chat not working / Empty responses

Check logs for:
- `[synthesisNode] WARNING: No tool results found!`
- Verify hybrid mode is configured correctly
- Check that tool results are being matched

### Context overflow errors

If you see "tokens exceeded limit":
- Reduce proactive frequency (60min or 90min)
- Consider switching to Ollama (32k limit but free)
- Check truncation settings in `hybrid-graph.ts`

### Proactive messages not sending

Check:
- Discord webhook URL is configured
- User has recent glucose data (< 2 hours)
- Cooldown period has passed (4+ hours)
- Not in sleep hours (10pm-7am)
- Run `npm run check-config` to verify setup

### Database migrations failing

If tables already exist:
```bash
cd t1d-server
npm run db:reset     # Nuclear option: drops everything
npm run db:migrate   # Run migrations
```

## Future Enhancements

**Short-term:**
- [ ] Multi-timescale reports (daily/weekly/monthly)
- [ ] More pattern types (meal composition, stress effects)
- [ ] Enhanced memory system with semantic search
- [ ] PDF export for healthcare providers

**Long-term:**
- [ ] Predictive analytics (forecast hypoglycemia)
- [ ] Integration with other CGM systems (Dexcom, Medtronic)
- [ ] Mobile app (React Native)
- [ ] Medication tracking and interactions
- [ ] Food database with carb counts
- [ ] Computer vision for meal logging (photo → carbs)

## Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Acknowledgments

- **LangGraph** by LangChain for agent orchestration
- **LibreView** by Abbott for glucose data access
- **OpenRouter** for unified LLM API
- **Ollama** for local LLM inference
- **shadcn/ui** for beautiful React components

## Support

- **Issues**: https://github.com/kristsauders/Glucose-Dashboard/issues
- **Discussions**: https://github.com/kristsauders/Glucose-Dashboard/discussions
- **Email**: [your email]

---

Built with ❤️ for the T1D/LADA community
