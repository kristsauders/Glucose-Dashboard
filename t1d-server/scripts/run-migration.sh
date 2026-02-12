#!/bin/bash

# Run database migration script
# Usage: ./scripts/run-migration.sh <migration-file>

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get database URL from environment or use default
DB_NAME="${DATABASE_NAME:-t1d}"
DB_USER="${DATABASE_USER:-$(whoami)}"
DB_HOST="${DATABASE_HOST:-localhost}"
DB_PORT="${DATABASE_PORT:-5432}"

# Migration file
MIGRATION_FILE="${1:-scripts/migrations/001-add-pattern-tables.sql}"

if [ ! -f "$MIGRATION_FILE" ]; then
  echo -e "${RED}❌ Migration file not found: $MIGRATION_FILE${NC}"
  exit 1
fi

echo -e "${YELLOW}🚀 Running migration: $MIGRATION_FILE${NC}"
echo -e "   Database: $DB_NAME"
echo -e "   User: $DB_USER"
echo -e "   Host: $DB_HOST:$DB_PORT"
echo ""

# Run the migration
if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$MIGRATION_FILE"; then
  echo ""
  echo -e "${GREEN}✅ Migration completed successfully!${NC}"
else
  echo ""
  echo -e "${RED}❌ Migration failed!${NC}"
  exit 1
fi
