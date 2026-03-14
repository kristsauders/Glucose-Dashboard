import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { query } from '../src/config/database.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const sql = readFileSync(join(__dirname, 'migrate-healthkit.sql'), 'utf8');

const statements = sql
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--'));

console.log(`Running HealthKit migration (${statements.length} statements)...`);

for (const stmt of statements) {
  await query(stmt);
  console.log('  ✓', stmt.slice(0, 60).replace(/\s+/g, ' ') + '...');
}

console.log('✅ HealthKit migration complete.');
process.exit(0);
