import { newDb, DataType } from 'pg-mem';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

export interface BddWorld {
  query: <T extends object = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ) => Promise<{ rows: T[] }>;
  teardown: () => Promise<void>;
}

function preprocessMigration(sql: string): string {
  return (
    sql
      // pg-mem does not support CREATE EXTENSION
      .replace(/CREATE\s+EXTENSION[^;]+;/gi, '')
      // pg-mem v2.9 treats nullable IN-check constraints as violated on NULL.
      // Strip all CHECK clauses (CONSTRAINT name CHECK (...) or inline CHECK (...)).
      // Handles one level of nesting inside the outer parens.
      .replace(
        /\s+(?:CONSTRAINT\s+\w+\s+)?CHECK\s*\((?:[^()]*|\([^()]*\))*\)/gi,
        '',
      )
      // Clean up trailing commas left when a CHECK was the last table column/constraint
      .replace(/,(\s*\n\s*\);)/g, '$1')
  );
}

export async function createWorld(): Promise<BddWorld> {
  const db = newDb();

  db.public.registerFunction({
    name: 'uuid_generate_v4',
    returns: DataType.uuid,
    implementation: () => randomUUID(),
    impure: true,
  });

  const { Pool } = db.adapters.createPg();
  const pool = new Pool();

  const migrationsDir = path.join(__dirname, '../../db/migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const raw = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    const sql = preprocessMigration(raw);
    if (sql.trim()) await pool.query(sql);
  }

  return {
    query: async <T extends object>(sql: string, params?: unknown[]) => {
      const result = await pool.query(sql, params);
      return { rows: result.rows as T[] };
    },
    teardown: () => pool.end(),
  };
}
