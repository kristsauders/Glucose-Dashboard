import pg from 'pg';

const pool = new pg.Pool({
  connectionString: 'postgresql://t1d_user:t1d_password_change_in_production@192.168.202.132:5432/t1d',
});

const now = new Date();
const dayAgo = new Date(now.getTime() - 86400000);

console.log('Now:', now.toISOString());
console.log('24h ago:', dayAgo.toISOString());

const mAll = await pool.query('SELECT COUNT(*) as n FROM meals');
const iAll = await pool.query('SELECT COUNT(*) as n FROM insulin_doses');
console.log('\nTotal meals in DB:', mAll.rows[0].n);
console.log('Total insulin in DB:', iAll.rows[0].n);

const mRecent = await pool.query(
  "SELECT id, timestamp::text as ts_raw, description, carbs FROM meals ORDER BY timestamp DESC LIMIT 10"
);
console.log('\nAll meals (newest first):');
mRecent.rows.forEach(r => console.log('  ', r.ts_raw, '|', r.description));

const iRecent = await pool.query(
  "SELECT id, timestamp::text as ts_raw, insulin_type, units FROM insulin_doses ORDER BY timestamp DESC LIMIT 10"
);
console.log('\nAll insulin (newest first):');
iRecent.rows.forEach(r => console.log('  ', r.ts_raw, '|', r.insulin_type, '| units:', r.units));

// What the mobile dashboard actually fetches (last 24h)
const m24 = await pool.query(
  'SELECT COUNT(*) as n FROM meals WHERE timestamp >= $1',
  [dayAgo.toISOString()]
);
const i24 = await pool.query(
  'SELECT COUNT(*) as n FROM insulin_doses WHERE timestamp >= $1',
  [dayAgo.toISOString()]
);
console.log('\nLogs in last 24h → meals:', m24.rows[0].n, '| insulin:', i24.rows[0].n);

await pool.end();
