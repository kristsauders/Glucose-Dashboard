import { query, pool } from '../src/config/database.js';

async function deduplicate() {
  try {
    console.log('Removing duplicate research topics...');

    // Delete duplicates, keeping only one for each name
    const result = await query(`
      DELETE FROM research_topics
      WHERE id IN (
        SELECT id
        FROM (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY name ORDER BY created_at) AS rn
          FROM research_topics
        ) t
        WHERE rn > 1
      )
    `);

    console.log(`✓ Removed ${result.rowCount} duplicate topics`);

    // Show remaining topics
    const remaining = await query('SELECT name FROM research_topics ORDER BY name');
    console.log(`\nRemaining topics (${remaining.rows.length}):`);
    remaining.rows.forEach((r: any) => console.log(`  - ${r.name}`));

    process.exit(0);
  } catch (error) {
    console.error('✗ Error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

deduplicate();
