#!/usr/bin/env tsx

/**
 * Database Migration Runner
 * Usage: npm run migrate [migration-file]
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { query, pool } from '../src/config/database.js';

const MIGRATION_FILE = process.argv[2] || 'scripts/migrations/001-add-pattern-tables.sql';

async function runMigration() {
  try {
    console.log('🚀 Running migration:', MIGRATION_FILE);
    console.log('');

    // Read migration file
    const migrationPath = resolve(process.cwd(), MIGRATION_FILE);
    const sql = readFileSync(migrationPath, 'utf-8');

    // Run migration
    await query(sql);

    console.log('');
    console.log('✅ Migration completed successfully!');
    process.exit(0);
  } catch (error: any) {
    console.error('');
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
