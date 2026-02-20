#!/usr/bin/env tsx
/**
 * Data Migration Script
 *
 * Exports all user data to a portable SQL file, or imports it into a target DB.
 *
 * Usage:
 *   # Export to SQL (for moving data between machines):
 *   npx tsx scripts/migrate-data.ts --export > data-export.sql
 *
 *   # Export to JSON (for inspection / backup):
 *   npx tsx scripts/migrate-data.ts --export-json > data-export.json
 *
 *   # Import from SQL file:
 *   npx tsx scripts/migrate-data.ts --import data-export.sql
 *
 *   # Import from JSON file:
 *   npx tsx scripts/migrate-data.ts --import-json data-export.json
 *
 *   # Dry-run (show counts without writing):
 *   npx tsx scripts/migrate-data.ts --dry-run
 */

import { pool } from '../src/config/database.js';
import { readFileSync, writeFileSync } from 'fs';

const args = process.argv.slice(2);
const mode = args[0];
const file = args[1];

// ─── Dry-run: show current row counts ─────────────────────────────────────────

async function dryRun() {
  console.log('\n📊 Current database row counts:\n');

  const tables = [
    'users',
    'glucose_readings',
    'meals',
    'insulin_doses',
    'exercise_logs',
    'sleep_logs',
    'chat_messages',
    'conversations',
    'glucose_patterns',
    'glucose_correlations',
    'user_memories',
    'analysis_cache',
  ];

  let totalRows = 0;
  for (const table of tables) {
    try {
      const result = await pool.query(`SELECT COUNT(*) as n FROM ${table}`);
      const n = Number(result.rows[0].n);
      totalRows += n;
      console.log(`  ${table.padEnd(28)} ${n.toLocaleString()} rows`);
    } catch {
      console.log(`  ${table.padEnd(28)} (table not found)`);
    }
  }

  console.log(`\n  ${'TOTAL'.padEnd(28)} ${totalRows.toLocaleString()} rows\n`);
}

// ─── Export: SQL ──────────────────────────────────────────────────────────────

async function exportSQL() {
  const lines: string[] = [];

  lines.push('-- T1D Dashboard Data Export');
  lines.push(`-- Generated: ${new Date().toISOString()}`);
  lines.push('-- Usage: psql $DATABASE_URL < data-export.sql');
  lines.push('');
  lines.push('BEGIN;');
  lines.push('');

  // Export users
  const users = await pool.query(
    `SELECT id, email, password_hash, diagnosis_date, diagnosis_type, timezone, preferences, created_at
     FROM users ORDER BY created_at`
  );
  lines.push(`-- Users (${users.rows.length})`);
  for (const u of users.rows) {
    lines.push(
      `INSERT INTO users (id, email, password_hash, diagnosis_date, diagnosis_type, timezone, preferences, created_at) ` +
      `VALUES (${esc(u.id)}, ${esc(u.email)}, ${esc(u.password_hash)}, ${esc(u.diagnosis_date)}, ` +
      `${esc(u.diagnosis_type)}, ${esc(u.timezone)}, ${esc(JSON.stringify(u.preferences))}, ${esc(u.created_at)}) ` +
      `ON CONFLICT (id) DO NOTHING;`
    );
  }
  lines.push('');

  // Export glucose readings
  await exportTable(lines, 'glucose_readings',
    'id, user_id, timestamp, glucose, trend, device, record_type, source, created_at'
  );

  // Export meals
  await exportTable(lines, 'meals',
    'id, user_id, timestamp, description, estimated_carbs, meal_type, notes, source, created_at'
  );

  // Export insulin doses
  await exportTable(lines, 'insulin_doses',
    'id, user_id, timestamp, units, insulin_type, brand_name, purpose, notes, source, created_at'
  );

  // Export exercise logs
  await exportTable(lines, 'exercise_logs',
    'id, user_id, timestamp, activity_type, description, duration_minutes, intensity, notes, source, created_at'
  );

  // Export sleep logs
  await exportTable(lines, 'sleep_logs',
    'id, user_id, timestamp, duration_minutes, quality, notes, source, created_at',
    true // optional table
  );

  // Export conversations
  await exportTable(lines, 'conversations',
    'id, user_id, title, created_at, updated_at'
  );

  // Export chat messages
  await exportTable(lines, 'chat_messages',
    'id, user_id, conversation_id, role, content, metadata, created_at'
  );

  // Export user memories
  await exportTable(lines, 'user_memories',
    'id, user_id, memory_key, memory_value, created_at, updated_at',
    true
  );

  // Export analysis cache
  await exportTable(lines, 'analysis_cache',
    'id, user_id, analysis_type, computed_at, data_window_start, data_window_end, results, metadata',
    true, 'computed_at'
  );

  lines.push('COMMIT;');
  lines.push('');
  lines.push('-- Export complete');

  process.stdout.write(lines.join('\n') + '\n');
  console.error(`✅ SQL export complete`);
}

async function exportTable(
  lines: string[],
  table: string,
  columns: string,
  optional = false,
  orderBy = 'created_at'
) {
  try {
    const result = await pool.query(`SELECT ${columns} FROM ${table} ORDER BY ${orderBy}`);
    lines.push(`-- ${table} (${result.rows.length})`);

    for (const row of result.rows) {
      const vals = columns.split(', ').map(col => esc(row[col])).join(', ');
      lines.push(
        `INSERT INTO ${table} (${columns}) VALUES (${vals}) ON CONFLICT (id) DO NOTHING;`
      );
    }

    lines.push('');
    console.error(`  ${table}: ${result.rows.length} rows`);
  } catch (err) {
    if (optional) {
      lines.push(`-- ${table}: skipped (table not found)`);
      lines.push('');
    } else {
      throw err;
    }
  }
}

// ─── Export: JSON ─────────────────────────────────────────────────────────────

async function exportJSON(outputFile: string) {
  const data: Record<string, any[]> = {};

  const tables = [
    { name: 'users', cols: 'id, email, diagnosis_date, diagnosis_type, timezone, preferences, created_at' },
    { name: 'glucose_readings', cols: 'id, user_id, timestamp, glucose, trend, device, record_type, source, created_at' },
    { name: 'meals', cols: 'id, user_id, timestamp, description, estimated_carbs, meal_type, notes, source, created_at' },
    { name: 'insulin_doses', cols: 'id, user_id, timestamp, units, insulin_type, brand_name, purpose, notes, source, created_at' },
    { name: 'exercise_logs', cols: 'id, user_id, timestamp, activity_type, description, duration_minutes, intensity, notes, source, created_at' },
    { name: 'sleep_logs', cols: 'id, user_id, timestamp, duration_minutes, quality, notes, source, created_at' },
    { name: 'conversations', cols: 'id, user_id, title, created_at, updated_at' },
    { name: 'chat_messages', cols: 'id, user_id, conversation_id, role, content, metadata, created_at' },
    { name: 'user_memories', cols: 'id, user_id, memory_key, memory_value, created_at, updated_at' },
    { name: 'analysis_cache', cols: 'id, user_id, analysis_type, computed_at, data_window_start, data_window_end, results, metadata', orderBy: 'computed_at' },
  ];

  for (const { name, cols, orderBy } of (tables as Array<{ name: string; cols: string; orderBy?: string }>) ) {
    try {
      const sortCol = orderBy ?? 'created_at';
      const result = await pool.query(`SELECT ${cols} FROM ${name} ORDER BY ${sortCol}`);
      data[name] = result.rows;
      console.log(`  ${name}: ${result.rows.length} rows`);
    } catch {
      data[name] = [];
      console.log(`  ${name}: skipped (table not found)`);
    }
  }

  const json = JSON.stringify({ exportedAt: new Date().toISOString(), data }, null, 2);

  if (outputFile) {
    writeFileSync(outputFile, json, 'utf8');
    console.log(`\n✅ JSON export written to ${outputFile}`);
  } else {
    process.stdout.write(json + '\n');
    console.error('✅ JSON export complete');
  }
}

// ─── Import: SQL ──────────────────────────────────────────────────────────────

async function importSQL(sqlFile: string) {
  if (!sqlFile) {
    console.error('Usage: npx tsx scripts/migrate-data.ts --import <file.sql>');
    process.exit(1);
  }

  console.log(`\n📥 Importing SQL from ${sqlFile}...\n`);

  const sql = readFileSync(sqlFile, 'utf8');
  const client = await pool.connect();

  try {
    await client.query(sql);
    console.log('✅ SQL import complete');
  } finally {
    client.release();
  }
}

// ─── Import: JSON ─────────────────────────────────────────────────────────────

async function importJSON(jsonFile: string) {
  if (!jsonFile) {
    console.error('Usage: npx tsx scripts/migrate-data.ts --import-json <file.json>');
    process.exit(1);
  }

  console.log(`\n📥 Importing JSON from ${jsonFile}...\n`);

  const { data } = JSON.parse(readFileSync(jsonFile, 'utf8'));

  const tableOrder = [
    'users',
    'glucose_readings',
    'meals',
    'insulin_doses',
    'exercise_logs',
    'sleep_logs',
    'conversations',
    'chat_messages',
    'user_memories',
    'analysis_cache',
  ];

  let totalInserted = 0;

  for (const table of tableOrder) {
    const rows = data[table] ?? [];
    if (!rows.length) {
      console.log(`  ${table}: 0 rows (skipped)`);
      continue;
    }

    let inserted = 0;
    for (const row of rows) {
      try {
        const cols = Object.keys(row);
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
        const vals = cols.map(c => row[c]);
        await pool.query(
          `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`,
          vals
        );
        inserted++;
      } catch (err) {
        console.error(`  ⚠️  ${table} row ${row.id}: ${(err as Error).message}`);
      }
    }

    console.log(`  ${table}: ${inserted}/${rows.length} rows inserted`);
    totalInserted += inserted;
  }

  console.log(`\n✅ JSON import complete — ${totalInserted} total rows inserted`);
}

// ─── SQL escape helper ────────────────────────────────────────────────────────

function esc(val: any): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'number') return String(val);
  if (val instanceof Date) return `'${val.toISOString()}'`;
  const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
  // Escape single quotes by doubling them
  return `'${str.replace(/'/g, "''")}'`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  try {
    switch (mode) {
      case '--dry-run':
        await dryRun();
        break;
      case '--export':
        await exportSQL();
        break;
      case '--export-json':
        await exportJSON(file || '');
        break;
      case '--import':
        await importSQL(file);
        break;
      case '--import-json':
        await importJSON(file);
        break;
      default:
        console.log(`
T1D Data Migration Script

Usage:
  npx tsx scripts/migrate-data.ts --dry-run
      Show current row counts

  npx tsx scripts/migrate-data.ts --export > export.sql
      Export all data as SQL INSERT statements

  npx tsx scripts/migrate-data.ts --export-json export.json
      Export all data as JSON

  npx tsx scripts/migrate-data.ts --import export.sql
      Import from SQL file (uses ON CONFLICT DO NOTHING)

  npx tsx scripts/migrate-data.ts --import-json export.json
      Import from JSON file (uses ON CONFLICT DO NOTHING)
        `);
        process.exit(0);
    }
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
