import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPool, createStore, ConflictError } from '../src/db.ts';
import { migrate } from '../src/migrate.ts';
import { buildApp } from '../src/app.ts';
import { payload } from './fixtures.ts';
import { calculateScore } from '../../src/core/scoring.ts';

const raw = process.env.TEST_DATABASE_URL;
if (!raw || !/(_test|test_)/.test(new URL(raw).pathname)) throw new Error('设置专用 TEST_DATABASE_URL；数据库名必须含 _test 或 test_，测试将清空 scores 表。');

test('真实PostgreSQL集成（专用测试库）', async t => {
  const pool = createPool({ DATABASE_URL: raw, DATABASE_SSL: process.env.DATABASE_SSL === 'verify-full' ? 'verify-full' : 'disable' });
  t.after(() => pool.end()); await migrate(pool); const store = createStore(pool);
  await t.test('迁移可重复执行且保留版本校验和', async () => {
    await migrate(pool); assert.equal(Number((await pool.query('SELECT count(*) FROM schema_migrations')).rows[0].count), 1);
  });
  await t.test('空榜、真实写入读取、同昵称允许多次战役', async () => {
    await pool.query('TRUNCATE scores'); assert.deepEqual(await store.leaderboard('speed', 'normal', 20), []);
    const s = payload(); const saved = await store.submit(s); assert.equal(saved.created, true); assert.equal(saved.entry.nickname, s.nickname);
    assert.equal((await store.submit(payload())).created, true); assert.equal((await store.leaderboard('speed', 'normal', 20)).length, 2);
  });
  await t.test('并发重复只存一条，重放安全，更改内容409语义', async () => {
    await pool.query('TRUNCATE scores'); const s = payload(); const results = await Promise.all(Array.from({ length: 8 }, () => store.submit(s)));
    assert.equal(results.filter(r => r.created).length, 1); assert.equal(Number((await pool.query('SELECT count(*) FROM scores')).rows[0].count), 1);
    await assert.rejects(() => store.submit({ ...s, nickname: '改动昵称' }), ConflictError);
  });
  await t.test('双榜主要与次级排序、难度隔离、完全并列顺序稳定、最多20条', async () => {
    await pool.query('TRUNCATE scores');
    const slowHigh = payload({ durationMs: 500000 }), fastLow = payload({ durationMs: 400000, stages: payload().stages.map(s => ({ ...s, kills: 0, bossKills: 0, lampHealth: 10 })) });
    const fastHigh = payload({ durationMs: 400000 });
    // 相同分数但不同用时：超过效率奖励范围后，时长不再影响分数。
    const tieSlow = payload({ durationMs: 4000000 }), tieFast = payload({ durationMs: 3000000 });
    for (const s of [slowHigh, fastLow, fastHigh, tieSlow, tieFast, payload({ difficulty: 'hard' })]) await store.submit(s);
    const speed = await store.leaderboard('speed', 'normal', 20); assert.deepEqual(speed.slice(0, 3).map(e => e.id), [fastHigh.runId, fastLow.runId, slowHigh.runId]);
    const scores = await store.leaderboard('score', 'normal', 20); assert.equal(scores[0].id, fastHigh.runId);
    assert.ok(scores.findIndex(e => e.id === tieFast.runId) < scores.findIndex(e => e.id === tieSlow.runId));
    assert.equal((await store.leaderboard('score', 'hard', 20)).length, 1);
    for (let i = 0; i < 22; i++) await store.submit(payload());
    const a = await store.leaderboard('speed', 'normal', 20), b = await store.leaderboard('speed', 'normal', 20);
    assert.equal(a.length, 20); assert.deepEqual(a.map(x => x.id), b.map(x => x.id));
  });
  await t.test('PostgreSQL约束拒绝越界值，演示种子的分数符合统一公式', async () => {
    const row = payload(); await assert.rejects(() => pool.query('INSERT INTO scores (id,nickname,difficulty,duration_ms,score,max_speed,score_version,game_version,stages) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [row.runId, '非法', 'easy', 1, -1, 1, 1, '0.12.0', '[]']));
    await pool.query(await readFile(new URL('../sql/seed.sql', import.meta.url), 'utf8'));
    const seeds = await pool.query('SELECT stages, duration_ms, score FROM scores WHERE id::text LIKE $1', ['00000000-%']);
    assert.equal(seeds.rows.length, 2); for (const s of seeds.rows) assert.equal(calculateScore(s.stages, s.duration_ms).total, s.score);
  });
  await t.test('真实HTTP POST→Fastify→SQL→GET，允许前端跨域并可重复提交', async () => {
    const app = await buildApp(store, { logger: false, origins: ['http://127.0.0.1:4173'] });
    await app.listen({ port: 0, host: '127.0.0.1' });
    try {
      const url = app.listeningOrigin, s = payload({ nickname: '真实联调' });
      const post = await fetch(url + '/api/scores', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:4173' }, body: JSON.stringify(s) });
      assert.equal(post.status, 201); assert.equal(post.headers.get('access-control-allow-origin'), 'http://127.0.0.1:4173');
      assert.equal((await post.json() as { entry: { id: string } }).entry.id, s.runId);
      const get = await fetch(url + '/api/leaderboard?board=score&difficulty=normal'); assert.equal(get.status, 200); assert.equal((await get.json() as { entries: unknown[] }).entries.length, 20);
    } finally { await app.close(); }
  });
  await t.test('数据库语句超时，连接错误不破坏后续健康请求', async () => {
    await assert.rejects(() => pool.query({ text: 'SELECT pg_sleep(1)', query_timeout: 50 }));
    await store.health();
  });
});
