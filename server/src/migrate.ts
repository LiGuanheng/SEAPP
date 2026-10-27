import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import type pg from 'pg';
import { createPool } from './db.ts';
import { readConfig } from './config.ts';

export async function migrate(pool: pg.Pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(20261026)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    const dir = fileURLToPath(new URL('../sql/', import.meta.url));
    for (const name of (await readdir(dir)).filter(n => /^\d+_.+\.sql$/.test(n)).sort()) {
      // Git 在 Windows 可能检出 CRLF；跨平台迁移/恢复时校验和必须保持一致。
      const sql = (await readFile(resolve(dir, name), 'utf8')).replace(/\r\n/g, '\n'), checksum = createHash('sha256').update(sql).digest('hex');
      const old = await client.query<{ checksum: string }>('SELECT checksum FROM schema_migrations WHERE name=$1', [name]);
      if (old.rows[0]) { if (old.rows[0].checksum !== checksum) throw new Error('已运行的迁移文件发生变化'); continue; }
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1,$2)', [name, checksum]);
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const pool = createPool(readConfig());
  try {
    await migrate(pool);
    if (process.argv.includes('--seed')) await pool.query(await readFile(new URL('../sql/seed.sql', import.meta.url), 'utf8'));
    process.stdout.write('数据库迁移完成\n');
  } catch { process.stderr.write('迁移失败；检查数据库、权限和迁移校验和。\n'); process.exitCode = 1; }
  finally { await pool.end(); }
}
