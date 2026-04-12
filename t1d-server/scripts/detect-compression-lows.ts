/**
 * Compression low migration + retroactive detection script.
 *
 * 1. Adds is_compression_suspect column + index if they don't exist.
 * 2. Scans all historical glucose readings for every user and flags
 *    compression artifacts in the database.
 *
 * Safe to re-run (idempotent). Dry-run by default — pass --apply to commit.
 *
 * Usage:
 *   node node_modules/.bin/tsx --tsconfig tsconfig.json scripts/detect-compression-lows.ts
 *   node node_modules/.bin/tsx --tsconfig tsconfig.json scripts/detect-compression-lows.ts --apply
 */

import { query } from '../src/config/database.js';
import { findCompressionSuspects } from '../src/services/compression-low-detector.js';

const DRY_RUN = !process.argv.includes('--apply');

async function main() {
  console.log(`\nCompression low migration + detection — ${DRY_RUN ? 'DRY RUN (pass --apply to write)' : 'APPLYING'}\n`);

  // ── Step 1: run migration ────────────────────────────────────────────────
  console.log('Running migration...');
  await query(`
    ALTER TABLE glucose_readings
      ADD COLUMN IF NOT EXISTS is_compression_suspect BOOLEAN NOT NULL DEFAULT FALSE;
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_glucose_compression
      ON glucose_readings(user_id, timestamp)
      WHERE is_compression_suspect = TRUE;
  `);
  console.log('  ✓ Column and index ready.\n');

  // ── Step 2: detect suspects for every user ───────────────────────────────
  const usersResult = await query(`SELECT DISTINCT user_id FROM glucose_readings`);
  const userIds: string[] = usersResult.rows.map((r: any) => r.user_id);
  console.log(`Found ${userIds.length} user(s).\n`);

  let totalFlagged = 0;

  for (const userId of userIds) {
    const readingsResult = await query(
      `SELECT id, timestamp, glucose
       FROM glucose_readings
       WHERE user_id = $1
         AND record_type IS DISTINCT FROM 0
       ORDER BY timestamp ASC`,
      [userId],
    );

    const readings = readingsResult.rows.map((r: any) => ({
      id: r.id,
      timestamp: new Date(r.timestamp),
      glucose: Number(r.glucose),
    }));

    const suspectIds = findCompressionSuspects(readings);

    const prevResult = await query(
      `SELECT COUNT(*) as n FROM glucose_readings
       WHERE user_id = $1 AND is_compression_suspect = TRUE`,
      [userId],
    );
    const prevFlagged = parseInt(prevResult.rows[0].n);

    console.log(
      `  User ${userId.slice(0, 8)}…  readings: ${readings.length}  ` +
      `suspects found: ${suspectIds.size}  previously flagged: ${prevFlagged}`,
    );

    if (!DRY_RUN) {
      await query(
        `UPDATE glucose_readings SET is_compression_suspect = FALSE WHERE user_id = $1`,
        [userId],
      );
      if (suspectIds.size > 0) {
        await query(
          `UPDATE glucose_readings SET is_compression_suspect = TRUE WHERE id = ANY($1)`,
          [[...suspectIds]],
        );
      }
    }

    totalFlagged += suspectIds.size;
  }

  console.log(`\n────────────────────────────────────────────────`);
  console.log(`Total suspects ${DRY_RUN ? 'identified' : 'flagged'}: ${totalFlagged}`);
  if (DRY_RUN) {
    console.log(`\nRe-run with --apply to write changes to the database.`);
  } else {
    console.log(`Done.`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
