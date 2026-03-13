import { readFileSync } from 'fs';
import { pool } from '../src/config/database.js';

const sql = readFileSync(new URL('./migrate-meal-notifications.sql', import.meta.url), 'utf8');
const client = await pool.connect();
try {
  await client.query(sql);
  console.log('Migration complete');
} finally {
  client.release();
  await pool.end();
}
