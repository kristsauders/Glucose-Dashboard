# T1D AI Assistant Server

Backend server for the AI-powered T1D/LADA management system.

## Quick Start

### Setup (run once)

```bash
./setup.sh
```

This will:
- Copy `.env.example` to `.env` (edit if needed)
- Install dependencies
- Start PostgreSQL in Docker
- Set up database schema

### Run Development Server

```bash
npm run dev
```

Or start everything at once:

```bash
npm run full-start
```

## Available Commands

- `npm run dev` - Start development server with hot reload
- `npm start` - Start production server
- `npm run build` - Build TypeScript to JavaScript
- `npm run db:setup` - Run database schema
- `npm run docker:up` - Start Docker containers
- `npm run docker:down` - Stop Docker containers
- `npm run full-start` - Start Docker + dev server

## API Endpoints

### Health Check
```
GET /api/health
```

### Authentication
```
POST /api/auth/signup
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me (requires auth)
```

## Testing Phase 1

### 1. Check health endpoint
```bash
curl http://localhost:3002/api/health
```

### 2. Create a user
```bash
curl -X POST http://localhost:3002/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "diagnosisType": "LADA",
    "diagnosisDate": "2024-01-01"
  }'
```

### 3. Login
```bash
curl -X POST http://localhost:3002/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

### 4. Get user info (use token from login response)
```bash
curl http://localhost:3002/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## Environment Variables

See `.env.example` for all available configuration options.

## Docker

The server uses Docker Compose to run PostgreSQL. Data is persisted in a Docker volume.

To completely reset the database:
```bash
npm run docker:down
docker volume rm t1d-server_postgres_data
npm run docker:up
npm run db:setup
```

## Architecture

- **Express** - Web server
- **PostgreSQL** - Database
- **JWT** - Authentication
- **TypeScript** - Type safety
- **LangGraph** - AI agent framework (Phase 3)
- **Ollama** - Local AI inference

## Development

The server will automatically reload when you make changes to TypeScript files.

Logs show all database queries in development mode.
