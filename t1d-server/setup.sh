#!/bin/bash

echo "🚀 Setting up T1D Server..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo "❌ Docker is not running. Please start Docker and try again."
  exit 1
fi

# Check if .env exists, if not copy from example
if [ ! -f .env ]; then
  echo "📝 Creating .env file from .env.example..."
  cp .env.example .env
  echo "⚠️  Please edit .env file with your configuration before proceeding."
  echo "   Especially update JWT_SECRET and database password for production."
  read -p "Press enter to continue after editing .env, or Ctrl+C to exit..."
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Start Docker containers
echo "🐳 Starting PostgreSQL container..."
docker-compose up -d

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
sleep 10

# Setup database
echo "🗄️  Setting up database schema..."
npm run db:setup

echo "✅ Setup complete!"
echo ""
echo "To start the server:"
echo "  npm run dev        # Development mode with hot reload"
echo "  npm start          # Production mode"
echo ""
echo "To start everything:"
echo "  npm run full-start # Start Docker + dev server"
echo ""
echo "Other commands:"
echo "  npm run docker:up   # Start Docker containers"
echo "  npm run docker:down # Stop Docker containers"
