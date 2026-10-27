import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.ts';
import { ConflictError, createPool, createStore, type ScoreStore } from '../src/db.ts';
import { readConfig } from '../src/config.ts';
import { payload } from './fixtures.ts';
import type { ScoreSubmission, LeaderboardEntry } from '../../src/core/scoring.ts';

function memoryStore(): ScoreStore {
  const values = new Map<string, ScoreSubmission>();
  const entry = (s: ScoreSubmission): LeaderboardEntry => ({ id: s.runId, nickname: s.nickname, difficulty: s.difficulty, score: s.score, durationMs: s.durationMs, maxSpeed: s.maxSpeed, submittedAt: '2026-10-26T00:00:00Z' });
  return { health: async () => {}, leaderboard: async () => [], submit: async s => {
    const old = values.get(s.runId); if (old && JSON.stringify(old) !== JSON.stringify(s)) throw new ConflictError();
    values.set(s.runId, s); return { entry: entry(s), created: !old };
  } };
}
test('health、空榜、查询默认值、正确JSON与404', async t => {
  const app = await buildApp(memoryStore(), { logger: false }); t.after(() => app.close());
  assert.equal((await app.inject('/api/health')).json().database, 'ready');
  const board = await app.inject('/api/leaderboard'); assert.equal(board.statusCode, 200); assert.deepEqual(board.json().entries, []); assert.equal(board.json().board, 'speed');
  assert.equal((await app.inject('/missing')).statusCode, 404);
  for (const query of ['board=hack', 'difficulty=easy', 'limit=21', 'limit=0', 'board=score&unknown=1']) assert.equal((await app.inject('/api/leaderboard?' + query)).statusCode, 400);
});
test('首次201，安全重复200，同ID更改内容409，同昵称允许不同战役', async t => {
  const app = await buildApp(memoryStore(), { logger: false }); t.after(() => app.close());
  const s = payload(); const send = (data: unknown) => app.inject({ method: 'POST', url: '/api/scores', payload: data as object });
  assert.equal((await send(s)).statusCode, 201); const replay = await send(s); assert.equal(replay.statusCode, 200); assert.equal(replay.json().duplicate, true);
  assert.equal((await send({ ...s, nickname: '其他昵称' })).statusCode, 409); assert.equal((await send(payload())).statusCode, 201);
});
test('非法昵称、分数、时间、失败、旧版本、重复阶段、额外字段均拒绝', async t => {
  const app = await buildApp(memoryStore(), { logger: false, submitLimit: 100 }); t.after(() => app.close());
  for (const patch of [{ nickname: '<script>' }, { nickname: 'a' }, { nickname: '灯\u202e人' }, { score: 999999 }, { score: 10001 }, { durationMs: 119999 }, { durationMs: 86400001 }, { completed: false }, { maxSpeed: 1, durationMs: 120000 }, { gameVersion: '0.11.0' }, { scoreVersion: 99 }, { stages: [payload().stages[0], payload().stages[0], payload().stages[2]] }, { extra: true }]) {
    const response = await app.inject({ method: 'POST', url: '/api/scores', payload: { ...payload(), ...patch } }); assert.equal(response.statusCode, 400, JSON.stringify(patch));
  }
  const normalized = await app.inject({ method: 'POST', url: '/api/scores', payload: payload({ nickname: '  ＡＢ守灯人  ' }) }); assert.equal(normalized.json().entry.nickname, 'AB守灯人');
});
test('只允许准确来源，正确预检，不信任伪造的转发地址', async t => {
  const app = await buildApp(memoryStore(), { logger: false, submitLimit: 1 }); t.after(() => app.close());
  const allowed = await app.inject({ url: '/api/health', headers: { origin: 'http://127.0.0.1:5173' } }); assert.equal(allowed.headers['access-control-allow-origin'], 'http://127.0.0.1:5173');
  assert.equal((await app.inject({ url: '/api/health', headers: { origin: 'https://evil.example' } })).statusCode, 403);
  const preflight = await app.inject({ method: 'OPTIONS', url: '/api/scores', headers: { origin: 'http://127.0.0.1:5173', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } }); assert.equal(preflight.statusCode, 204);
  assert.equal((await app.inject({ method: 'POST', url: '/api/scores', payload: payload(), headers: { 'x-forwarded-for': '1.2.3.4' } })).statusCode, 201);
  const limited = await app.inject({ method: 'POST', url: '/api/scores', payload: payload(), headers: { 'x-forwarded-for': '2.3.4.5' } }); assert.equal(limited.statusCode, 429); assert.ok(limited.headers['retry-after']);
});
test('数据库故障返回503，错误不泄露连接信息；超大/畸形请求被拒绝', async t => {
  const store = memoryStore(); store.health = store.submit = store.leaderboard = async () => { throw new Error('postgresql://secret:password@private'); };
  const app = await buildApp(store, { logger: false }); t.after(() => app.close());
  for (const path of ['/api/health', '/api/leaderboard']) { const r = await app.inject(path); assert.equal(r.statusCode, 503); assert.ok(!r.body.includes('secret')); }
  assert.equal((await app.inject({ method: 'POST', url: '/api/scores', payload: payload() })).statusCode, 503);
  assert.equal((await app.inject({ method: 'POST', url: '/api/scores', payload: { junk: 'a'.repeat(9000) } })).statusCode, 413);
  assert.equal((await app.inject({ method: 'POST', url: '/api/scores', headers: { 'content-type': 'application/json' }, payload: '{broken' })).statusCode, 400);
});
test('真实pg连接失败有界返回503，不挂住HTTP请求', async t => {
  const pool = createPool({ DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/seapp_test', DATABASE_SSL: 'disable' });
  const app = await buildApp(createStore(pool), { logger: false }); t.after(async () => { await app.close(); await pool.end(); });
  const r = await app.inject('/api/health'); assert.equal(r.statusCode, 503);
});
test('环境配置拒绝通配CORS和非法SSL/端口，生产SSL保持证书验证', () => {
  for (const patch of [{ CORS_ORIGINS: '*' }, { CORS_ORIGINS: 'https://site.example/path' }, { PORT: '0' }, { DATABASE_SSL: 'insecure' }]) assert.throws(() => readConfig({ DATABASE_URL: 'postgresql://localhost/seapp_test', ...patch }));
  const config = readConfig({ DATABASE_URL: 'postgresql://localhost/seapp_test?sslmode=require', DATABASE_SSL: 'verify-full' });
  const pool = createPool(config); assert.deepEqual(pool.options.ssl, { rejectUnauthorized: true }); void pool.end();
  assert.throws(() => createPool({ ...config, DATABASE_SSL: 'disable' }));
});
