// Docker 不可用时的可选真实数据库验收；仅在 artifacts 下创建临时库，退出时停止。
import { randomUUID, randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';

const { default: EmbeddedPostgres } = await import('../artifacts/pg-runtime/node_modules/embedded-postgres/dist/index.js').catch(() => {
  throw new Error('先执行 npm install --prefix artifacts/pg-runtime --no-save --package-lock=false embedded-postgres@17.10.0-beta.17');
});
const probe = createServer(); await new Promise(r => probe.listen(0, '127.0.0.1', r));
const port = probe.address().port; await new Promise(r => probe.close(r));
const password = randomBytes(16).toString('hex');
const dir = resolve('artifacts', `pg-test-${randomUUID()}`); await mkdir(dir, { recursive: true });
const pg = new EmbeddedPostgres({ databaseDir: dir, port, user: 'seapp', password, persistent: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C'], postgresFlags: ['-h', '127.0.0.1'],
  onLog: () => {}, onError: () => {} });
const url = `postgresql://seapp:${password}@127.0.0.1:${port}/seapp_test`;
async function command(args, extraEnv = {}) {
  const child = spawn(process.execPath, args, { stdio: 'inherit', env: { ...process.env, TEST_DATABASE_URL: url, ...extraEnv }, windowsHide: true });
  await new Promise((res, rej) => { child.on('error', rej); child.on('exit', code => code === 0 ? res() : rej(new Error(`验收命令失败 (${code})`))); });
}
let apiProcess;
try {
  await pg.initialise(); await pg.start(); await pg.createDatabase('seapp_test');
  console.log('临时 PostgreSQL 17 已启动，仅绑定 127.0.0.1；连接密码不写入输出。');
  await command(['--experimental-strip-types', '--test', 'server/tests/database.integration.ts']);
  if (process.argv.includes('--e2e')) {
    await command(['server/node_modules/typescript/bin/tsc', '-p', 'server/tsconfig.json']);
    await command(['server/scripts/copy-sql.mjs']);
    // 实际运行编译后的入口，覆盖 PORT/HOST/CORS 配置和生产模块路径。
    apiProcess = spawn(process.execPath, ['server/dist/server/src/index.js'], { stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true,
      env: { ...process.env, DATABASE_URL: url, DATABASE_SSL: 'disable', HOST: '127.0.0.1', PORT: '3000', CORS_ORIGINS: 'http://127.0.0.1:4173', LOG_LEVEL: 'silent' } });
    for (let i = 0; i < 50; i++) {
      try { if ((await fetch('http://127.0.0.1:3000/api/health')).ok) break; } catch { /* 等待 API 入口启动 */ }
      if (i === 49 || apiProcess.exitCode !== null) throw new Error('编译后的 API 入口未启动');
      await new Promise(r => setTimeout(r, 100));
    }
    await command(['node_modules/typescript/bin/tsc', '--noEmit']);
    await command(['node_modules/vite/bin/vite.js', 'build', '--base=./'], { VITE_API_BASE_URL: 'http://127.0.0.1:3000' });
    const specs = process.argv.includes('--all') ? [] : process.argv.includes('--regression') ? ['base','city-and-refits','progression','run-flow','growth-v016'].map(name=>`tests/browser/${name}.spec.ts`) : process.argv.includes('--v016') ? ['growth-v016','leaderboard','combat','expedition','story-and-fog'].map(name=>`tests/browser/${name}.spec.ts`) : process.argv.includes('--flow') ? ['run-flow', 'leaderboard', 'night', 'polish', 'city-and-refits'].map(name => `tests/browser/${name}.spec.ts`) : ['tests/browser/leaderboard.spec.ts'];
    await command(['node_modules/@playwright/test/cli.js', 'test', ...specs], { E2E_REAL_API: '1', E2E_PRODUCTION: '1' });
  }
} finally {
  if (apiProcess && apiProcess.exitCode === null) { const stopped = new Promise(r => apiProcess.once('exit', r)); apiProcess.kill(); await stopped; }
  await pg.stop(); console.log('临时 PostgreSQL 已停止；数据留在 artifacts 供本地排查。');
}
