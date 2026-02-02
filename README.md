# Sage - AI Diabetes Assistant

A comprehensive, AI-powered Type 1 Diabetes management platform with real-time glucose monitoring, intelligent pattern analysis, and proactive health insights. Features LibreView integration, conversational AI assistant, and automated monitoring.

## Features

### 🤖 AI Assistant (Sage)
- **Conversational Analysis**: Chat with Sage to analyze your glucose patterns and get personalized insights
- **Multiple Conversations**: Organize different topics in separate chat threads
- **Long-term Memory**: Sage remembers your preferences, habits, and medical information across all conversations
- **Tool Integration**: Sage can analyze overnight patterns, detect trends, compare time periods, and more
- **Proactive Monitoring**: Sage automatically watches your glucose data and reaches out via Discord with insights, questions, and suggestions

### 📊 Live Glucose Monitoring
- **Real-time LibreView Integration**: Connect to your LibreView/LibreLinkUp account for live glucose readings
- **Fresh Data**: Displays current glucose with trend arrows
- **Automated Polling**: Continuous background sync of glucose data
- **Today-focused View**: Shows glucose data from 7am through now
- **Last Night's Bedtime & Overnight**: Reference charts for bedtime (10pm-midnight) and overnight fasting (3am-7am)
- **Data Persistence**: PostgreSQL database stores all readings

### 📈 Data Analysis
- **Daily Metrics**: Average, minimum, maximum glucose levels
- **Time in Range**: Track percentage of readings in target ranges (70-140 mg/dL and 70-180 mg/dL)
- **Glucose Variability**: Coefficient of variation (CV) analysis for glucose stability
- **Overnight Analysis**: Fasting glucose and overnight patterns
- **Pattern Detection**: Dawn phenomenon, overnight lows, high variability
- **Estimated A1C**: Calculate estimated A1C from average glucose

### 📱 Proactive Notifications
- **Discord Integration**: Receive insights, questions, and suggestions via Discord
- **Smart Cooldowns**: Avoids spam with intelligent messaging intervals (min 4 hours)
- **Pattern-based Outreach**: Sage reaches out when it detects interesting trends worth discussing
- **Not Critical Alerts**: Focus on insights and learning, not urgent warnings (Libre handles those)

### 🎨 Visualizations
- **Continuous Glucose Monitor View**: Detailed timeline of all readings
- **Daily Overview Charts**: Long-range view with min/max ranges
- **Weekly Trends**: Aggregated weekly metrics
- **Multiple Interactive Charts**: Scrollable charts showing different aspects of your glucose control
- **Date Range Selector**: View data from 7 days to all-time

## Architecture

### Frontend (React + TypeScript)
- Modern UI built with Vite, React 19, and Tailwind CSS
- shadcn/ui components for consistent design
- Recharts for data visualization
- Framer Motion for smooth animations

### Backend (Node.js + Express + PostgreSQL)
- RESTful API for authentication, data management, and AI chat
- LibreView polling service for automated glucose sync
- LangGraph-powered AI agent with specialized tools
- PostgreSQL database for persistent storage
- JWT authentication

### AI Agent (LangGraph + Ollama/OpenRouter)
- Conversational memory with context preservation
- Long-term memory storage across conversations
- Specialized tools for glucose analysis
- Proactive monitoring service
- Discord webhook integration

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Docker (for PostgreSQL)
- Ollama (for local AI) or OpenRouter API key
- Discord webhook (optional, for proactive notifications)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/kristsauders/Glucose-Dashboard.git
cd Glucose-Dashboard
```

2. Install dependencies:
```bash
npm install
```

This will install dependencies for both the frontend and backend (t1d-server).

### Configuration

1. **Set up the backend** (t1d-server):
```bash
cd t1d-server
cp .env.example .env
```

2. **Configure environment variables** in `t1d-server/.env`:
```bash
# Database
DATABASE_URL=postgresql://t1d_user:t1d_password_change_in_production@localhost:5432/t1d

# JWT Secret (generate a random string)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# AI Provider (ollama or openrouter)
AI_PROVIDER=ollama

# Ollama (if using local AI)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=glm-4.7-flash:latest

# OpenRouter (if using cloud AI)
OPENROUTER_API_KEY=your-api-key
OPENROUTER_MODEL=anthropic/claude-sonnet-4.5

# Discord (optional - for proactive notifications)
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/your-webhook-url
```

3. **Set up the database**:
```bash
# Start PostgreSQL with Docker
npm run docker:up

# Wait a few seconds, then run the schema
npm run db:setup
```

### Running the Application

**Quick Start (Recommended):**

From the root `glucose-dashboard` directory:
```bash
npm start
```

This starts both:
- **Backend server** on `http://localhost:3002` (API + AI agent + proactive monitoring)
- **Frontend app** on `http://localhost:5173` (Sage UI)

**Alternative - Run Separately:**

```bash
# Terminal 1 - Backend
cd t1d-server
npm run dev

# Terminal 2 - Frontend
cd glucose-dashboard
npm run dev
```

### First-Time Setup

1. Open `http://localhost:5173`
2. Sign up for an account
3. Connect your LibreView account in Settings
4. Upload a CSV file or wait for automatic sync
5. Start chatting with Sage!

### Discord Notifications (Optional)

To enable proactive monitoring notifications:

1. Create a Discord webhook:
   - Go to your Discord server
   - Edit channel → Integrations → Webhooks
   - Create webhook → Copy URL
2. Add to `t1d-server/.env`: `DISCORD_WEBHOOK_URL=<your-webhook-url>`
3. Restart the server
4. Sage will now send insights, questions, and suggestions to Discord!

Test it works:
```bash
cd t1d-server
node scripts/test-discord.js
```

## Usage

### Chat with Sage

1. Click the chat icon to open Sage
2. Ask questions about your glucose patterns:
   - "What were my overnight readings like?"
   - "Show me my time in range for the last week"
   - "Do I have a dawn phenomenon pattern?"
   - "Compare this week to last week"
3. Sage can analyze patterns, detect trends, and provide personalized insights
4. Your preferences and habits are remembered across all conversations

### Proactive Monitoring

Once enabled, Sage will:
- Check your glucose data every 30 minutes
- Analyze patterns and trends automatically
- Send Discord messages when it finds interesting insights
- Ask questions about unusual patterns
- Suggest adjustments based on detected trends
- Respect cooldowns to avoid spam (min 4 hours between messages)

### Conversations & Memory

- **New Chat**: Start a fresh conversation (old context cleared)
- **Switch Conversations**: All past conversations are saved
- **Long-term Memory**: Sage remembers important facts across all chats
  - Tell Sage: "I usually eat breakfast at 7am"
  - Later, in a new chat: "When should I eat breakfast?"
  - Sage will remember: "You typically eat breakfast at 7am..."

## Technology Stack

### Frontend
- React 19 + TypeScript
- Vite for build and dev server
- Tailwind CSS + shadcn/ui
- Recharts for visualizations
- Framer Motion for animations

### Backend
- Node.js + Express
- PostgreSQL database
- JWT authentication
- LibreView API integration
- Server-Sent Events for streaming

### AI Agent
- LangGraph for agent orchestration
- Ollama for local LLM inference
- OpenRouter for cloud LLM access
- Specialized tools for glucose analysis
- Discord webhook integration

## Database Schema

- **users**: User accounts and settings
- **glucose_readings**: All glucose data points
- **conversations**: Chat conversation threads
- **chat_messages**: All chat messages
- **agent_memory**: Long-term user facts
- **sage_messages**: Proactive notification log
- **glucose_monitoring_state**: Monitoring state per user

## Privacy & Security

- All data stored securely in PostgreSQL
- JWT authentication for API access
- LibreView credentials encrypted in database
- Local AI option (Ollama) for privacy
- Discord webhook is optional
- No third-party analytics or tracking

## Development

### Backend Development
```bash
cd t1d-server
npm run dev        # Start with hot reload
npm run build      # Build TypeScript
npm run start      # Run production build
```

### Frontend Development
```bash
npm run dev        # Start Vite dev server
npm run build      # Build for production
npm run preview    # Preview production build
```

### Database Management
```bash
cd t1d-server
npm run docker:up    # Start PostgreSQL
npm run docker:down  # Stop PostgreSQL
npm run db:setup     # Run schema migrations
```

## Future Enhancements

- Meal and insulin logging
- Exercise tracking
- Medication management
- Advanced pattern recognition
- Predictive analytics
- Integration with other CGM systems
- Mobile app (React Native)

## License

MIT

## Support

For issues or questions, please open an issue on the GitHub repository.
