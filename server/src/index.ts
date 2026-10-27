import { readConfig } from './config.ts';
import { createPool, createStore } from './db.ts';
import { buildApp } from './app.ts';

async function main() {
  const config = readConfig();
  const pool = createPool(config);
  const app = await buildApp(createStore(pool), { origins: config.origins, logLevel: config.LOG_LEVEL, trustProxy: config.TRUST_PROXY === '1' });
  app.addHook('onClose', async () => { await pool.end(); });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void app.close().catch(() => { process.exitCode = 1; }); });
  try { await app.listen({ host: config.HOST, port: config.PORT }); }
  catch (error) { app.log.error({ name: error instanceof Error ? error.name : 'Error' }, 'API startup failed'); await app.close(); process.exitCode = 1; }
}
main().catch(() => { process.stderr.write('API 配置错误；请检查环境变量。连接信息不会写入日志。\n'); process.exitCode = 1; });
