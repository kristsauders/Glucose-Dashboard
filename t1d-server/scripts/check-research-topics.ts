import { query, pool } from '../src/config/database.js';

async function check() {
  try {
    const result = await query('SELECT name, query FROM research_topics ORDER BY name');
    console.log('All topics (' + result.rows.length + '):');
    result.rows.forEach((r: any) => console.log(`  - ${r.name}`));

    const dupes = await query('SELECT name, COUNT(*) as count FROM research_topics GROUP BY name HAVING COUNT(*) > 1');
    if (dupes.rows.length > 0) {
      console.log('\nDuplicates found:');
      dupes.rows.forEach((r: any) => console.log(`  - ${r.name}: ${r.count} times`));
    } else {
      console.log('\nNo duplicates found');
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

check();
