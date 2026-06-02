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
    try {
      await pool.query('BEGIN');
      await pool.query(sql);
      await pool.query('INSERT INTO _migrations (filename) VALUES ($1)', [filename]);
      await pool.query('COMMIT');
      console.log(`[migrate] ran ${filename}`);
    } catch (err) {
      await pool.query('ROLLBACK');
      throw err;
    }
  }
}
