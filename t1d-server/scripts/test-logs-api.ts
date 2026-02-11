import { query } from '../src/config/database.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

async function testLogsAPI() {
  console.log('🔍 Testing Logs API Query\n');
  
  const userResult = await query('SELECT id FROM users LIMIT 1');
  const userId = userResult.rows[0].id;

  // Simulate what the API endpoint does NOW with our fix
  const start = new Date();
  start.setDate(start.getDate() - 7); // 7 days ago
  
  const end = new Date(); // NOW

  console.log(`User ID: ${userId}`);
  console.log(`Start: ${start.toISOString()}`);
  console.log(`End: ${end.toISOString()}\n`);

  // This is the EXACT query the backend now uses
  const queryText = `
    SELECT id, timestamp, insulin_type, units, purpose
    FROM insulin_doses
    WHERE user_id = $1
      AND timestamp >= $2
      AND timestamp <= $3
    ORDER BY timestamp DESC
    LIMIT 100
  `;

  const result = await query(queryText, [userId, start.toISOString(), end.toISOString()]);

  console.log(`📊 Found ${result.rows.length} insulin doses\n`);
  console.log('Date'.padEnd(15) + 'Time'.padEnd(10) + 'Type'.padEnd(20) + 'Units');
  console.log('-'.repeat(60));

  result.rows.forEach((row: any) => {
    const timestamp = new Date(row.timestamp);
    const dateStr = timestamp.toISOString().split('T')[0];
    const timeStr = timestamp.toTimeString().split(' ')[0].substring(0, 5);
    
    console.log(
      dateStr.padEnd(15) +
      timeStr.padEnd(10) +
      row.insulin_type.padEnd(20) +
      row.units + 'u'
    );
  });

  process.exit(0);
}

testLogsAPI().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
