import pg from 'pg';
import { env } from './env.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
});

export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<pg.QueryResult<T>> {
  const start = Date.now();
  try {
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;
    // if (env.NODE_ENV === 'development') {
    //   console.log('Query executed:', { text, duration, rows: result.rowCount });
    // }
    return result;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

export async function testConnection(): Promise<boolean> {
  try {
    await query('SELECT NOW()');
    return true;
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  }
}
