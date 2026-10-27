import Fastify, { type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import { ConflictError, type ScoreStore } from './db.ts';
import { submissionSchema, leaderboardQuery } from './scores.ts';
import { SCORE_VERSION } from '../../src/core/scoring.ts';

export async function buildApp(store: ScoreStore, options: { origins?: string[]; logger?: boolean; logLevel?: string; trustProxy?: boolean; submitLimit?: number } = {}) {
  const app = Fastify({
    logger: options.logger === false ? false : { level: options.logLevel ?? 'info', redact: ['req.headers.authorization', 'req.headers.cookie'] },
    bodyLimit: 8192, requestTimeout: 10_000, connectionTimeout: 10_000,
    trustProxy: options.trustProxy ? (_address, hop) => hop === 0 : false,
  });
  const origins = options.origins ?? ['http://127.0.0.1:5173'];
  await app.register(cors, { origin: origins, methods: ['GET', 'POST'], credentials: false });
  // CORS 只限制浏览器读响应；额外拒绝带有未知 Origin 的写入。无 Origin 的 CLI 仍可使用 API。
  app.addHook('onRequest', async (request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff').header('Cache-Control', 'no-store');
    if (request.headers.origin && !origins.includes(request.headers.origin)) return reply.code(403).send({ error: { code: 'ORIGIN_DENIED', message: '此来源未获允许' } });
  });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute', errorResponseBuilder: () => ({ statusCode: 429, error: { code: 'RATE_LIMITED', message: '请求过于频繁，请稍后重试' } }) });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) return reply.code(400).send({ error: { code: 'INVALID_INPUT', message: '输入不符合规则', fields: error.issues.map(i => i.path.join('.')) } });
    if (error instanceof ConflictError) return reply.code(409).send({ error: { code: 'RUN_CONFLICT', message: '同一战役已提交其他内容，请保留原提交重试' } });
    const e = error as FastifyError;
    const status = typeof e.statusCode === 'number' ? e.statusCode : 503;
    if (status === 429) return reply.code(429).send({ error: { code: 'RATE_LIMITED', message: '请求过于频繁，请稍后重试' } });
    request.log.error({ code: e.code, name: e.name }, 'API request failed');
    return reply.code(status >= 400 && status < 500 ? status : 503).send({ error: { code: status < 500 ? 'BAD_REQUEST' : 'UNAVAILABLE', message: status < 500 ? '请求格式错误' : '排行榜暂时不可用，请稍后重试' } });
  });
  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: { code: 'NOT_FOUND', message: '接口不存在' } }));
  app.get('/api/health', { config: { rateLimit: false } }, async () => { await store.health(); return { status: 'ok', database: 'ready', scoreVersion: SCORE_VERSION }; });
  app.get('/api/leaderboard', async request => {
    const q = leaderboardQuery.parse(request.query);
    return { board: q.board, difficulty: q.difficulty, scope: q.scope, scoreVersion: SCORE_VERSION, entries: await store.leaderboard(q.board, q.difficulty, q.limit, q.scope) };
  });
  app.post('/api/scores', { config: { rateLimit: { max: options.submitLimit ?? 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const score = submissionSchema.parse(request.body);
    const result = await store.submit(score);
    return reply.code(result.created ? 201 : 200).send({ entry: result.entry, duplicate: !result.created, ranks: result.ranks });
  });
  return app;
}
