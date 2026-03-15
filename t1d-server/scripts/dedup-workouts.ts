/**
 * dedup-workouts.ts
 *
 * Removes duplicate exercise_log rows created before the ±15-min / ±10-min
 * dedup logic was tightened.
 *
 * Duplicate detection: two rows for the same user whose timestamps are within
 * 15 minutes of each other AND whose durations are within 10 minutes.
 *
 * Resolution priority (highest wins):
 *   1. source = 'healthkit' with a healthkit_uuid         (richest data)
 *   2. source = 'healthkit' without a healthkit_uuid
 *   3. any other source (manual, etc.)
 *   Tie-break: whichever row has more non-null data columns; then lowest id.
 *
 * Run (dry-run by default):
 *   node node_modules/.bin/tsx --tsconfig tsconfig.json scripts/dedup-workouts.ts
 *
 * To actually delete:
 *   node node_modules/.bin/tsx --tsconfig tsconfig.json scripts/dedup-workouts.ts --apply
 */

import { query, pool } from '../src/config/database.js';

const DRY_RUN = !process.argv.includes('--apply');

// ── Score a row: higher = keep ────────────────────────────────────────────────

function score(row: Record<string, any>): number {
  let s = 0;
  if (row.source === 'healthkit') s += 100;
  if (row.healthkit_uuid)         s += 50;
  if (row.avg_heart_rate != null) s += 10;
  if (row.max_heart_rate != null) s += 10;
  if (row.calories != null)       s += 10;
  if (row.description != null)    s += 5;
  return s;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (pass --apply to delete)' : 'APPLY — will delete rows'}\n`);

  // Fetch all exercise logs ordered by user + time so we can walk them linearly.
  const { rows } = await query<Record<string, any>>(
    `SELECT id, user_id, timestamp, duration_minutes, activity_type,
            source, healthkit_uuid, avg_heart_rate, max_heart_rate,
            calories, description
     FROM exercise_logs
     ORDER BY user_id, timestamp`,
  );

  console.log(`Loaded ${rows.length} exercise_log rows.`);

  const toDelete = new Set<string>();

  // Walk the sorted list; for each row compare against recent rows from the same user.
  for (let i = 0; i < rows.length; i++) {
    if (toDelete.has(rows[i].id)) continue;   // already marked for removal

    const a = rows[i];
    const aMs = new Date(a.timestamp).getTime();

    for (let j = i + 1; j < rows.length; j++) {
      const b = rows[j];
      if (b.user_id !== a.user_id) break;     // moved to next user

      const bMs = new Date(b.timestamp).getTime();
      if (bMs - aMs > 15 * 60_000) break;     // too far ahead in time — stop inner loop

      if (toDelete.has(b.id)) continue;        // already marked

      const durDiff = Math.abs(a.duration_minutes - b.duration_minutes);
      if (durDiff > 10) continue;              // duration mismatch — not a duplicate

      // It's a duplicate pair — decide which to keep.
      const scoreA = score(a);
      const scoreB = score(b);
      const keepA  = scoreA >= scoreB;         // tie → keep lower index (a)
      const loser  = keepA ? b : a;

      toDelete.add(loser.id);

      const keeper = keepA ? a : b;
      console.log(
        `  DUPLICATE: keep ${keeper.id} (${keeper.source}, score ${Math.max(scoreA, scoreB)}, ` +
        `${keeper.activity_type}, ${keeper.duration_minutes}m, ${new Date(keeper.timestamp).toISOString().slice(0, 16)}) ` +
        `→ delete ${loser.id} (${loser.source}, score ${Math.min(scoreA, scoreB)})`,
      );
    }
  }

  console.log(`\nFound ${toDelete.size} duplicate rows to remove.`);

  if (toDelete.size === 0) {
    console.log('Nothing to do.');
    await pool.end();
    return;
  }

  if (DRY_RUN) {
    console.log('\nDry run — no rows deleted. Re-run with --apply to commit.');
  } else {
    const ids = Array.from(toDelete);
    const result = await query(
      `DELETE FROM exercise_logs WHERE id = ANY($1::uuid[])`,
      [ids],
    );
    console.log(`\nDeleted ${result.rowCount} rows.`);
  }

  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
