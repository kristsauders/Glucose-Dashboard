import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { query } from '../src/config/database.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const sql = readFileSync(join(__dirname, 'migrate-healthkit.sql'), 'utf8');

// Strip comment lines BEFORE splitting so that semicolons inside comments
// (e.g. "-- uses 'type'; see schema.sql") never produce phantom statements.
const stripped = sql
  .split('\n')
  .filter(line => !line.trimStart().startsWith('--'))
  .join('\n');

const statements = stripped
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0);

console.log(`Running HealthKit migration (${statements.length} statements)...`);

for (const stmt of statements) {
  await query(stmt);
  console.log('  ✓', stmt.slice(0, 60).replace(/\s+/g, ' ') + '...');
}

console.log('✅ HealthKit migration complete.');
process.exit(0);
