import { query } from '../src/config/database.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

async function checkRawTimestamps() {
  console.log('🕐 RAW TIMESTAMP CHECK\n');
  console.log('Current server time:', new Date().toISOString());
  console.log('Current local time:', new Date().toString());
  console.log('='.repeat(80));

  // Get user ID
  const userResult = await query('SELECT id FROM users LIMIT 1');
  if (userResult.rows.length === 0) {
    console.error('❌ No users found');
    process.exit(1);
  }
  const userId = userResult.rows[0].id;

  // Get all insulin doses from last 7 days with RAW timestamps
  const dosesResult = await query(
    `SELECT
       id,
       timestamp,
       timestamp AT TIME ZONE 'UTC' as utc_timestamp,
       insulin_type,
       units,
       created_at
     FROM insulin_doses
     WHERE user_id = $1
       AND timestamp > NOW() - INTERVAL '7 days'
     ORDER BY timestamp DESC`,
    [userId]
  );

  console.log('\n\n📋 ALL INSULIN DOSES (Last 7 Days) - RAW DATA\n');
  console.log('ID'.padEnd(38) + 'Timestamp'.padEnd(28) + 'Type'.padEnd(20) + 'Units');
  console.log('-'.repeat(100));

  dosesResult.rows.forEach((row: any) => {
    const timestamp = new Date(row.timestamp);
    const utcTime = new Date(row.utc_timestamp);

    console.log(
      row.id.substring(0, 8).padEnd(10) +
      timestamp.toISOString().padEnd(28) +
      row.insulin_type.padEnd(20) +
      row.units + 'u'
    );
    console.log('  Local: ' + timestamp.toString());
    console.log('  Created: ' + new Date(row.created_at).toISOString());
    console.log('');
  });

  // Check for duplicates
  console.log('\n🔍 CHECKING FOR DUPLICATES\n');
  console.log('='.repeat(80));

  const duplicateCheck = await query(
    `SELECT
       timestamp,
       insulin_type,
       units,
       COUNT(*) as duplicate_count,
       ARRAY_AGG(id) as ids
     FROM insulin_doses
     WHERE user_id = $1
       AND timestamp > NOW() - INTERVAL '7 days'
     GROUP BY timestamp, insulin_type, units
     HAVING COUNT(*) > 1
     ORDER BY timestamp DESC`,
    [userId]
  );

  if (duplicateCheck.rows.length > 0) {
    console.log('⚠️  DUPLICATES FOUND:\n');
    duplicateCheck.rows.forEach((row: any) => {
      console.log(`❌ ${new Date(row.timestamp).toISOString()} - ${row.insulin_type} ${row.units}u`);
      console.log(`   Count: ${row.duplicate_count} entries`);
      console.log(`   IDs: ${row.ids.map((id: string) => id.substring(0, 8)).join(', ')}`);
      console.log('');
    });
  } else {
    console.log('✅ No duplicates found');
  }

  // Check Feb 10 and Feb 11 specifically
  console.log('\n\n📅 FEBRUARY 10-11 DETAILS\n');
  console.log('='.repeat(80));

  const feb10_11 = await query(
    `SELECT
       DATE(timestamp) as day,
       timestamp,
       insulin_type,
       units,
       id
     FROM insulin_doses
     WHERE user_id = $1
       AND DATE(timestamp) IN ('2026-02-10', '2026-02-11')
     ORDER BY timestamp`,
    [userId]
  );

  let currentDay = '';
  feb10_11.rows.forEach((row: any) => {
    const day = row.day.toISOString().split('T')[0];
    if (day !== currentDay) {
      console.log(`\n📅 ${day}`);
      currentDay = day;
    }

    const time = new Date(row.timestamp).toTimeString().split(' ')[0];
    console.log(`  ${time} - ${row.insulin_type.padEnd(15)} ${row.units}u (ID: ${row.id.substring(0, 8)})`);
  });

  process.exit(0);
}

checkRawTimestamps().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
