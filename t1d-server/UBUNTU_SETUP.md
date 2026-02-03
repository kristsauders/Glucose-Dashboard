# Ubuntu Fresh Setup Guide

This guide will help you set up the T1D server from scratch on your Ubuntu machine with a clean database.

## Prerequisites

- Docker and Docker Compose installed
- Node.js 18+ installed
- Ollama running (for local AI models)
- Git

## Fresh Setup Steps

### 1. Pull Latest Code

```bash
cd /path/to/T1D/glucose-dashboard/t1d-server
git pull origin main
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

Create or update your `.env` file:

```bash
cp .env.example .env
nano .env  # Or use your preferred editor
```

**Important settings for Ubuntu + Ollama:**

```env
# Server
PORT=3002
NODE_ENV=development

# Database (Docker PostgreSQL)
DATABASE_URL=postgresql://t1d_user:t1d_password@localhost:5432/t1d_db

# Auth
JWT_SECRET=your-super-long-random-secret-key-min-32-chars
ENCRYPTION_KEY=your-32-character-encryption-key

# AI Configuration - HYBRID MODE (Cost-optimized)
AI_PROVIDER=hybrid
HYBRID_SMALL_PROVIDER=ollama
HYBRID_SMALL_MODEL=qwen2.5:32b
HYBRID_LARGE_MODEL=anthropic/claude-sonnet-4.5

# Ollama (local on Ubuntu)
OLLAMA_BASE_URL=http://localhost:11434

# OpenRouter (for Sonnet 4.5 synthesis)
OPENROUTER_API_KEY=your-openrouter-api-key-here

# LibreView
LIBREVIEW_POLL_INTERVAL=60000

# CORS
CORS_ORIGIN=http://localhost:5173

# Discord (optional)
DISCORD_WEBHOOK_URL=your-webhook-url
DISCORD_BOT_TOKEN=your-bot-token
```

### 4. Start Docker & Reset Database

This will:
- Start PostgreSQL in Docker
- Drop all existing tables
- Create fresh schema
- Run all migrations

```bash
npm run reset
```

**Or manually:**

```bash
# Start PostgreSQL
npm run docker:up

# Wait for DB to be ready
sleep 10

# Reset database (drops all tables and recreates)
npm run db:reset
```

### 5. Verify Ollama is Running

```bash
# Check Ollama status
curl http://localhost:11434/api/tags

# Make sure qwen2.5:32b is installed
ollama list

# If not installed:
ollama pull qwen2.5:32b
```

### 6. Start the Server

```bash
npm run dev
```

You should see:
```
🔗 Testing database connection...
✓ Database connected successfully
✓ Using hybrid AI providers:
  - Small model (tool calling): ollama:qwen2.5:32b
  - Large model (synthesis): openrouter:anthropic/claude-sonnet-4.5
  Binding 26 tools to small model
🚀 Server listening on port 3002
...
```

### 7. Create Your User Account

Use the frontend or curl:

```bash
curl -X POST http://localhost:3002/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your-email@example.com",
    "password": "your-secure-password",
    "diagnosisDate": "2024-01-01",
    "diagnosisType": "LADA",
    "timezone": "America/New_York"
  }'
```

### 8. Connect LibreView

```bash
curl -X POST http://localhost:3002/api/libreview/connect \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "email": "your-libreview-email",
    "password": "your-libreview-password",
    "region": "us"
  }'
```

The server will automatically start polling LibreView every 60 seconds for new glucose data.

---

## Troubleshooting

### Database Connection Issues

```bash
# Check if PostgreSQL is running
docker ps

# Check logs
docker-compose logs postgres

# Restart PostgreSQL
npm run docker:down
npm run docker:up
```

### Ollama Issues

```bash
# Check if Ollama is running
systemctl status ollama

# Start Ollama
sudo systemctl start ollama

# Check available models
ollama list

# Test inference
ollama run qwen2.5:32b "Hello, test response"
```

### Context Overflow Errors

If you see "exceeded 131072 limit" or similar:
- Check that `AI_PROVIDER=hybrid` in .env
- Verify `HYBRID_SMALL_PROVIDER=ollama` for local model
- Restart server after .env changes

### Port Already in Use

```bash
# Find what's using port 3002
sudo lsof -i :3002

# Kill the process if needed
sudo kill -9 <PID>
```

---

## Monitoring

### View Real-time Logs

```bash
# Server logs
npm run dev

# PostgreSQL logs
docker-compose logs -f postgres

# Ollama logs
journalctl -u ollama -f
```

### Check Background Services

The server runs several background services:
- **LibreView Poller**: Syncs glucose data every 60s
- **Pattern Detector**: Analyzes patterns every 30min (starts at T+2min)
- **Proactive Monitor**: Generates insights every 30min (starts at T+5min)
- **Discord Bot**: Listens for commands

---

## Cost Optimization

With the hybrid setup:
- **Small model (Ollama local)**: FREE - runs on your Ubuntu GPU
- **Large model (Sonnet 4.5)**: ~$18-20/month for synthesis only

Monitor your costs at: https://openrouter.ai/activity

---

## Next Steps

1. Access the dashboard at `http://localhost:5173`
2. Log in with your new account
3. Wait for glucose data to sync from LibreView
4. Ask Sage questions via chat
5. Receive proactive insights every ~30-60 minutes

---

## Quick Commands Reference

```bash
# Development
npm run dev                  # Start dev server with hot reload
npm run build               # Build for production
npm start                   # Run production build

# Database
npm run db:setup            # Initial setup (keeps existing data)
npm run db:reset            # DANGER: Drops all tables and recreates
npm run docker:up           # Start PostgreSQL
npm run docker:down         # Stop PostgreSQL

# Full workflows
npm run setup               # Fresh install (initial setup)
npm run reset               # Fresh database (complete reset)
npm run full-start          # Start Docker + dev server
```
