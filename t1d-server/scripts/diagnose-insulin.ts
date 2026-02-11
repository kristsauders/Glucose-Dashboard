import { query } from '../src/config/database.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

// Same basal detection logic as in the app
function isBasalInsulin(insulinType: string): boolean {
  const type = insulinType.toLowerCase();
  return type.includes('lantus') ||
         type.includes('basal') ||
         type.includes('tresiba') ||
         type.includes('levemir') ||
         type.includes('toujeo') ||
         type.includes('degludec') ||
         type.includes('glargine') ||
         type.includes('detemir') ||
         type.includes('long-acting') ||
         type.includes('long');
}

async function diagnoseInsulin() {
  console.log('🔍 INSULIN DATABASE DIAGNOSTIC\n');
  console.log('='.repeat(80));

  // Get user ID
  const userResult = await query('SELECT id, email FROM users LIMIT 1');
  if (userResult.rows.length === 0) {
    console.error('❌ No users found');
    process.exit(1);
  }
  const userId = userResult.rows[0].id;
  const userEmail = userResult.rows[0].email;

  console.log(`\n📧 User: ${userEmail}`);
  console.log(`🆔 User ID: ${userId}\n`);
  console.log('='.repeat(80));

  // 1. All unique insulin types
  console.log('\n\n📊 ALL INSULIN TYPES IN DATABASE\n');
  const typesResult = await query(
    `SELECT
       insulin_type,
       COUNT(*) as dose_count,
       SUM(units) as total_units
     FROM insulin_doses
     WHERE user_id = $1
     GROUP BY insulin_type
     ORDER BY dose_count DESC`,
    [userId]
  );

  console.log('Insulin Type'.padEnd(30) + 'Doses'.padEnd(10) + 'Total Units');
  console.log('-'.repeat(50));
  typesResult.rows.forEach((row: any) => {
    const isBasal = isBasalInsulin(row.insulin_type);
    const marker = isBasal ? '🟦 BASAL' : '🟨 RAPID';
    console.log(
      `${marker} "${row.insulin_type}"`.padEnd(40) +
      `${row.dose_count}`.padEnd(10) +
      `${row.total_units}u`
    );
  });

  // 2. All doses from last 7 days
  console.log('\n\n📅 ALL INSULIN DOSES (Last 7 Days)\n');
  const dosesResult = await query(
    `SELECT
       timestamp,
       insulin_type,
       units,
       purpose
     FROM insulin_doses
     WHERE user_id = $1
       AND timestamp > NOW() - INTERVAL '7 days'
     ORDER BY timestamp DESC`,
    [userId]
  );

  console.log('Date'.padEnd(12) + 'Time'.padEnd(10) + 'Type'.padEnd(20) + 'Units'.padEnd(10) + 'Purpose');
  console.log('-'.repeat(80));

  let totalBasal = 0;
  let totalRapid = 0;
  let basalDoses = 0;
  let rapidDoses = 0;

  dosesResult.rows.forEach((row: any) => {
    const date = new Date(row.timestamp);
    const dateStr = date.toISOString().split('T')[0];
    const timeStr = date.toTimeString().split(' ')[0].substring(0, 5);
    const isBasal = isBasalInsulin(row.insulin_type);
    const marker = isBasal ? '🟦' : '🟨';
    const purpose = row.purpose || '';

    if (isBasal) {
      totalBasal += parseFloat(row.units);
      basalDoses++;
    } else {
      totalRapid += parseFloat(row.units);
      rapidDoses++;
    }

    console.log(
      `${marker} ${dateStr}`.padEnd(15) +
      timeStr.padEnd(10) +
      row.insulin_type.padEnd(20) +
      `${row.units}u`.padEnd(10) +
      purpose
    );
  });

  // 3. Summary statistics
  console.log('\n\n📈 SUMMARY (Last 7 Days)\n');
  console.log('='.repeat(50));
  console.log(`🟦 Basal Doses:  ${basalDoses} doses, ${totalBasal.toFixed(1)}u total`);
  console.log(`🟨 Rapid Doses:  ${rapidDoses} doses, ${totalRapid.toFixed(1)}u total`);
  console.log(`📊 Total:        ${basalDoses + rapidDoses} doses, ${(totalBasal + totalRapid).toFixed(1)}u total`);

  if (basalDoses > 0) {
    console.log(`\n📊 Basal Average: ${(totalBasal / basalDoses).toFixed(1)}u per dose`);
  }
  if (rapidDoses > 0) {
    console.log(`📊 Rapid Average: ${(totalRapid / rapidDoses).toFixed(1)}u per dose`);
  }

  // 4. Daily breakdown
  console.log('\n\n📆 DAILY BREAKDOWN\n');
  const dailyResult = await query(
    `SELECT
       DATE(timestamp) as day,
       insulin_type,
       SUM(units) as daily_units,
       COUNT(*) as dose_count
     FROM insulin_doses
     WHERE user_id = $1
       AND timestamp > NOW() - INTERVAL '7 days'
     GROUP BY DATE(timestamp), insulin_type
     ORDER BY day DESC, insulin_type`,
    [userId]
  );

  let currentDay = '';
  dailyResult.rows.forEach((row: any) => {
    const day = row.day.toISOString().split('T')[0];
    if (day !== currentDay) {
      if (currentDay !== '') console.log('');
      console.log(`📅 ${day}`);
      currentDay = day;
    }

    const isBasal = isBasalInsulin(row.insulin_type);
    const marker = isBasal ? '  🟦' : '  🟨';
    console.log(
      `${marker} ${row.insulin_type.padEnd(25)} ${row.daily_units}u (${row.dose_count} dose${row.dose_count > 1 ? 's' : ''})`
    );
  });

  // 5. Detection test
  console.log('\n\n🧪 BASAL DETECTION TEST\n');
  console.log('='.repeat(50));
  console.log('Testing detection logic on each unique insulin type:\n');

  typesResult.rows.forEach((row: any) => {
    const type = row.insulin_type;
    const isBasal = isBasalInsulin(type);
    const result = isBasal ? '✅ DETECTED AS BASAL' : '❌ DETECTED AS RAPID';
    console.log(`"${type}" → ${result}`);
  });

  console.log('\n' + '='.repeat(80));
  console.log('\n✅ Diagnostic complete!\n');

  process.exit(0);
}

diagnoseInsulin().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
