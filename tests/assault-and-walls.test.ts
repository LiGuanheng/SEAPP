import test from 'node:test';
import assert from 'node:assert/strict';
import { wallLine } from '../src/core/wall-stroke.ts';
import { BaseWorld } from '../src/core/base-world.ts';
import { NightWorld } from '../src/core/night-world.ts';
import { decodeCampaign, newCampaign } from '../src/core/campaign.ts';
import { GRID, validBasePlan } from '../src/config/base.ts';
import { ASSAULT_CADENCE, MOB_KINDS, NIGHT_LIMITS, wavesForStage } from '../src/config/night.ts';

test('快速笔划补齐水平/竖直/斜线网格，四方向连通且无重复，非法坐标不迭代', () => {
  for (const [a, b] of [[{ x: 352, y: 320 }, { x: 672, y: 320 }], [{ x: 672, y: 416 }, { x: 352, y: 224 }], [{ x: 352, y: 320 }, { x: 352, y: 416 }]]) {
    const line = wallLine(a, b); assert.deepEqual(line[0], a); assert.deepEqual(line.at(-1), b);
    assert.deepEqual(wallLine(b, a), [...line].reverse());
    assert.equal(line.length, (Math.abs(a.x - b.x) + Math.abs(a.y - b.y)) / GRID + 1);
    assert.equal(new Set(line.map(p => `${p.x},${p.y}`)).size, line.length);
    for (let i = 1; i < line.length; i++) assert.equal(Math.abs(line[i].x - line[i - 1].x) + Math.abs(line[i].y - line[i - 1].y), GRID);
  }
  for (const p of [{ x: Infinity, y: 0 }, { x: 1, y: 1 }, { x: 1e9, y: 320 }]) assert.deepEqual(wallLine({ x: 352, y: 320 }, p), []);
});

test('连续铺墙逐格扣真实库存，回划不重复扣费，预算不足不透支且可保存', () => {
  const c = newCampaign(); c.depot.materials = 7; c.survivors = ['engineer']; const b = new BaseWorld(c);
  const line = wallLine({ x: 352, y: 320 }, { x: 672, y: 320 });
  assert.equal(b.buildWalls(line).built, 7); assert.equal(b.campaign.depot.materials, 0); assert.equal(b.plan.buildings.length, 7);
  const before = b.snapshot(); assert.equal(b.buildWalls([...line].reverse()).built, 0); assert.deepEqual(b.snapshot(), before);
  assert.ok(validBasePlan(b.plan)); assert.deepEqual(decodeCampaign(JSON.stringify(b.campaign)).base, b.plan);
});

test('连续墙跳过十字通路/建筑，最后会困兵的格子仍被拒绝', () => {
  const c = newCampaign(); c.depot.materials = 100; const b = new BaseWorld(c);
  const r = b.buildWalls(wallLine({ x: 352, y: 416 }, { x: 352, y: 640 })); assert.equal(r.built, 5);
  assert.ok(b.plan.buildings.every(p => p.y < 480 || p.y >= 576));
  const trapped = new BaseWorld(c); Object.assign(trapped.plan.soldiers[0], { x: 496, y: 336 });
  trapped.build('barricade', { x: 448, y: 288 }); trapped.build('barricade', { x: 448, y: 352 }); trapped.build('barricade', { x: 416, y: 320 }, 1);
  const before = trapped.snapshot(); assert.equal(trapped.buildWalls([{ x: 512, y: 320 }]).ok, false); assert.deepEqual(trapped.snapshot(), before);
});

test('夜战禁铺墙和出售，正常出售按实际支付回收且不可重复领取', () => {
  const c = newCampaign(); c.depot = { materials: 20, energy: 4, medkits: 0 }; c.survivors = ['engineer']; const b = new BaseWorld(c);
  b.build('turret', { x: 960, y: 352 }); assert.equal(b.campaign.depot.materials, 15);
  const w = new NightWorld(b.campaign), before = w.nightSnapshot();
  assert.equal(w.buildWalls([{ x: 352, y: 320 }]).built, 0); assert.equal(w.demolish(1).ok, false); assert.deepEqual(w.nightSnapshot(), before);
  assert.equal(b.demolish(1).ok, true); assert.equal(b.campaign.depot.materials, 17); assert.equal(b.campaign.depot.energy, 2);
  assert.equal(b.demolish(1).ok, false); assert.equal(b.campaign.depot.materials, 17);
  b.build('wall', { x: 352, y: 320 }); const id = b.plan.buildings[0].id;
  assert.equal(b.campaign.depot.materials, 16); b.demolish(id); assert.equal(b.campaign.depot.materials, 17);
  assert.equal(b.demolish(id).ok, false); assert.equal(b.campaign.depot.materials, 17);
});

test('三阶段兵力增加，首夜第二波有空军；成批混编进场而非先出完步兵', () => {
  const totals = ([1, 2, 3] as const).map(s => wavesForStage(s).reduce((n, w) => n + w.bosses.length + MOB_KINDS.reduce((m, k) => m + w[k], 0), 0));
  assert.deepEqual(totals, [100, 162, 230]); assert.ok(wavesForStage(1)[1].crow > 0);
  for (const stage of [1, 2, 3] as const) {
    const c = newCampaign(); c.clearedStage = stage - 1; const w = new NightWorld(c);
    w.elapsed = 3; w.step(); assert.equal(w.enemies.length, ASSAULT_CADENCE[stage].batch);
    assert.ok(new Set(w.enemies.map(e => e.kind)).size >= 2);
  }
  const first = new NightWorld(newCampaign());
  for (let i = 0; i < 25 * 60; i++) first.step(); assert.ok(first.enemies.some(e => e.kind === 'crow'));
});

test('密集刷新仍遵守72敌人上限，留待刷新队列不会无限挤入场', () => {
  const c = newCampaign(); c.clearedStage = 2; const w = new NightWorld(c); w.elapsed = 3;
  for (let i = 0; i < NIGHT_LIMITS.enemies - 1; i++) w.enemies.push({ id: 10000 + i, kind: 'walker', x: 1900, y: 900 + i, health: 10000, aim: 0, moving: false, cooldown: 999, hurt: 0 });
  w.step(); assert.equal(w.enemies.length, NIGHT_LIMITS.enemies);
  for (let i = 0; i < 120; i++) { w.step(); assert.equal(w.enemies.length, NIGHT_LIMITS.enemies); }
});
