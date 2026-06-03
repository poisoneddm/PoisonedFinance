import fs from 'fs';
import path from 'path';
import { pool } from './client';

export async function runMigrations(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename TEXT PRIMARY KEY,
      run_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const filename of files) {
    const { rows } = await pool.query(
      'SELECT 1 FROM _migrations WHERE filename = $1',
      [filename],
    );
    if (rows.length > 0) continue;

    const sql = fs.readFileSync(path.join(dir, filename), 'utf8');
    // Pin BEGIN/SQL/INSERT/COMMIT to a single connection so the migration is
    // genuinely transactional. Using pool.query() per statement would run each
    // on an arbitrary pooled connection, voiding the transaction (contracts §11).
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [filename]);
      await client.query('COMMIT');
      console.log(`[migrate] ran ${filename}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
