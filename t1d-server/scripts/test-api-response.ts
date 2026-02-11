import { query } from '../src/config/database.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

async function testApiResponse() {
  console.log('🔍 Testing what the API would return\n');
  
  const userResult = await query('SELECT id FROM users LIMIT 1');
  const userId = userResult.rows[0].id;

  // Simulate what the API endpoint returns
  const insulin = await query(
    `SELECT id, timestamp, insulin_type, units, purpose
     FROM insulin_doses
     WHERE user_id = $1
       AND timestamp > NOW() - INTERVAL '7 days'
       AND timestamp <= NOW()
     ORDER BY timestamp DESC`,
    [userId]
  );

  console.log('📊 Insulin doses that would be returned by API:\n');
  console.log('Date'.padEnd(15) + 'Time'.padEnd(10) + 'Type'.padEnd(20) + 'Units');
  console.log('-'.repeat(60));

  const dailyTotals = new Map<string, { basal: number; rapid: number }>();

  insulin.rows.forEach((dose: any) => {
    const timestamp = new Date(dose.timestamp);
    const dateStr = timestamp.toISOString().split('T')[0];
    const timeStr = timestamp.toTimeString().split(' ')[0].substring(0, 5);
    
    console.log(
      dateStr.padEnd(15) +
      timeStr.padEnd(10) +
      dose.insulin_type.padEnd(20) +
      dose.units + 'u'
    );

    // Simulate frontend grouping
    if (!dailyTotals.has(dateStr)) {
      dailyTotals.set(dateStr, { basal: 0, rapid: 0 });
    }
    const day = dailyTotals.get(dateStr)!;
    
    const type = dose.insulin_type.toLowerCase();
    const isBasal = type.includes('tresiba') || type.includes('long');
    
    if (isBasal) {
      day.basal += Number(dose.units);
    } else {
      day.rapid += Number(dose.units);
    }
  });

  console.log('\n\n📊 Daily totals (as frontend would calculate):\n');
  console.log('Date'.padEnd(15) + 'Basal'.padEnd(10) + 'Rapid'.padEnd(10) + 'Total');
  console.log('-'.repeat(45));

  Array.from(dailyTotals.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .forEach(([date, totals]) => {
      console.log(
        date.padEnd(15) +
        `${totals.basal}u`.padEnd(10) +
        `${totals.rapid}u`.padEnd(10) +
        `${totals.basal + totals.rapid}u`
      );
    });

  process.exit(0);
}

testApiResponse().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
