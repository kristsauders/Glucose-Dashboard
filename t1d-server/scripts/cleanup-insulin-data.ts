import { query } from '../src/config/database.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

async function cleanupInsulinData() {
  console.log('🧹 INSULIN DATA CLEANUP TOOL\n');
  console.log('='.repeat(80));

  // Get user ID
  const userResult = await query('SELECT id FROM users LIMIT 1');
  if (userResult.rows.length === 0) {
    console.error('❌ No users found');
    process.exit(1);
  }
  const userId = userResult.rows[0].id;

  const now = new Date();
  console.log(`\n⏰ Current time: ${now.toISOString()} (${now.toString()})\n`);

  // 1. Find and show duplicates
  console.log('🔍 STEP 1: DUPLICATES\n');
  const duplicates = await query(
    `SELECT
       timestamp,
       insulin_type,
       units,
       COUNT(*) as count,
       ARRAY_AGG(id ORDER BY created_at) as ids,
       ARRAY_AGG(created_at ORDER BY created_at) as created_dates
     FROM insulin_doses
     WHERE user_id = $1
     GROUP BY timestamp, insulin_type, units
     HAVING COUNT(*) > 1
     ORDER BY timestamp DESC`,
    [userId]
  );

  if (duplicates.rows.length > 0) {
    console.log('⚠️  Found duplicates:\n');
    for (const dup of duplicates.rows) {
      const timestamp = new Date(dup.timestamp);
      console.log(`❌ ${timestamp.toISOString()} - ${dup.insulin_type} ${dup.units}u`);
      console.log(`   ${dup.count} entries:`);
      dup.ids.forEach((id: string, idx: number) => {
        const created = new Date(dup.created_dates[idx]);
        const marker = idx === 0 ? '   📌 KEEP' : '   🗑️  DELETE';
        console.log(`${marker} ${id.substring(0, 8)} (created ${created.toISOString()})`);
      });
      console.log('');
    }

    const answer = await question('Delete duplicate entries? (keep oldest, delete newer) [y/N]: ');
    if (answer.toLowerCase() === 'y') {
      for (const dup of duplicates.rows) {
        // Keep first (oldest), delete rest
        const toDelete = dup.ids.slice(1);
        for (const id of toDelete) {
          await query('DELETE FROM insulin_doses WHERE id = $1', [id]);
          console.log(`✅ Deleted duplicate: ${id.substring(0, 8)}`);
        }
      }
      console.log('\n✅ Duplicates cleaned up!\n');
    } else {
      console.log('⏭️  Skipped duplicate cleanup\n');
    }
  } else {
    console.log('✅ No duplicates found\n');
  }

  // 2. Find and show future-dated entries
  console.log('\n🔍 STEP 2: FUTURE-DATED ENTRIES\n');
  const futureEntries = await query(
    `SELECT
       id,
       timestamp,
       insulin_type,
       units,
       created_at
     FROM insulin_doses
     WHERE user_id = $1
       AND timestamp > NOW()
     ORDER BY timestamp DESC`,
    [userId]
  );

  if (futureEntries.rows.length > 0) {
    console.log('⚠️  Found entries with future timestamps:\n');
    futureEntries.rows.forEach((entry: any) => {
      const timestamp = new Date(entry.timestamp);
      const created = new Date(entry.created_at);
      const hoursInFuture = (timestamp.getTime() - Date.now()) / (1000 * 60 * 60);
      console.log(`❌ ${timestamp.toISOString()} - ${entry.insulin_type} ${entry.units}u`);
      console.log(`   ${hoursInFuture.toFixed(1)} hours in the future`);
      console.log(`   ID: ${entry.id.substring(0, 8)}, Created: ${created.toISOString()}`);
      console.log('');
    });

    const answer = await question('Delete future-dated entries? [y/N]: ');
    if (answer.toLowerCase() === 'y') {
      for (const entry of futureEntries.rows) {
        await query('DELETE FROM insulin_doses WHERE id = $1', [entry.id]);
        console.log(`✅ Deleted future entry: ${entry.id.substring(0, 8)}`);
      }
      console.log('\n✅ Future entries cleaned up!\n');
    } else {
      console.log('⏭️  Skipped future entry cleanup\n');
    }
  } else {
    console.log('✅ No future-dated entries found\n');
  }

  // 3. Summary
  console.log('\n' + '='.repeat(80));
  console.log('\n📊 FINAL SUMMARY\n');

  const finalCount = await query(
    `SELECT
       DATE(timestamp) as day,
       COUNT(*) as entries,
       SUM(units) as total_units
     FROM insulin_doses
     WHERE user_id = $1
       AND timestamp > NOW() - INTERVAL '7 days'
       AND timestamp <= NOW()
     GROUP BY DATE(timestamp)
     ORDER BY day DESC`,
    [userId]
  );

  console.log('Last 7 days (excluding future entries):');
  finalCount.rows.forEach((row: any) => {
    const day = row.day.toISOString().split('T')[0];
    console.log(`  ${day}: ${row.entries} doses, ${row.total_units}u total`);
  });

  console.log('\n✅ Cleanup complete!\n');

  rl.close();
  process.exit(0);
}

cleanupInsulinData().catch(error => {
  console.error('❌ Error:', error);
  rl.close();
  process.exit(1);
});
