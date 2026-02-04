#!/bin/bash

# Load environment variables
set -a
source "$(dirname "$0")/../.env"
set +a

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "Error: DATABASE_URL not found in .env file"
  exit 1
fi

echo "Running push notification migration..."
echo "Database: $DATABASE_URL"
echo ""

# Run the migration
psql "$DATABASE_URL" -f "$(dirname "$0")/migrate-push-notifications.sql"

if [ $? -eq 0 ]; then
  echo ""
  echo "✓ Migration completed successfully!"
else
  echo ""
  echo "✗ Migration failed"
  exit 1
fi
