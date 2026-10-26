import test from 'node:test';
import assert from 'node:assert/strict';
import { assaultPlan, ASSAULT_TUNING } from '../src/core/assault.ts';
import { NightWorld } from '../src/core/night-world.ts';
import { BaseWorld } from '../src/core/base-world.ts';
import { newCampaign } from '../src/core/campaign.ts';
import { gatesForStage, INFECTED, NIGHT_LIMITS } from '../src/config/night.ts';
import { LIGHTHOUSE, buildingRect } from '../src/config/base.ts';
import { distance, canOccupy } from '../src/core/geometry.ts';

test('攻势种子可复现，改变侧翼；困难增加威胁预算，末段有四向同刻推进计划', () => {
  const a = assaultPlan(3, 9), hard = assaultPlan(3, 9, 'hard');
  assert.deepEqual(a, assaultPlan(3, 9)); assert.notDeepEqual(a, assaultPlan(3, 10)); assert.ok(hard.length > a.length);
  assert.equal(new Set(a.filter(o => o.at >= 82 && o.at < 84).map(o => o.gate)).size, 4);
  for (const stage of [1, 2, 3] as const) {
    assert.equal(ASSAULT_TUNING[stage].directions, stage + 1);
    for (const gate of gatesForStage(stage)) assert.ok(distance(gate, LIGHTHOUSE) >= 400);
  }
});

test('实际固定步长刷新有四向同时存活，满载不丢Boss，且出生均在外围', () => {
  const c = newCampaign(); c.clearedStage = 2; const w = new NightWorld(c); w.elapsed = 82;
  for (const f of w.fighters.values()) f.health = 0;
  const origins = new Map<number, { x: number; y: number }>(); let coverage = 0;
  for (let i = 0; i < 150; i++) {
    w.step();
    for (const e of w.enemies) if (!origins.has(e.id)) { origins.set(e.id, e); assert.ok(distance(e, LIGHTHOUSE) > 380); }
    coverage = Math.max(coverage, w.pressure.filter(n => n >= 3).length);
    assert.ok(w.enemies.length <= NIGHT_LIMITS.enemies);
  }
  assert.equal(coverage, 4); assert.ok(w.bossesSeen.has('queen') && w.bossesSeen.has('blighter'));
});

test('重型敌人面对多层墙能破坏设施并继续推进，所有单位保持合法占地', () => {
  const c = newCampaign(); c.depot.materials = 100; const b = new BaseWorld(c);
  for (const x of [512, 544, 576]) for (let y = 320; y <= 448; y += 32) b.build('wall', { x, y });
  const w = new NightWorld(b.campaign); for (const f of w.fighters.values()) f.health = 0;
  const initial = w.plan.buildings.length;
  w.enemies.push({ id: 999, kind: 'brute', x: 484, y: 400, health: 9999, aim: 0, moving: true, cooldown: 0, hurt: 0 });
  for (let i = 0; i < 1800 && w.commanding; i++) w.step();
  assert.ok(w.plan.buildings.length <= initial - 3); assert.ok(w.enemies.find(e => e.id === 999)!.x > 512);
  assert.ok(canOccupy(w.enemies.find(e => e.id === 999)!, INFECTED.brute.radius, w.obstacles, 2048, 1408));
  assert.ok(w.plan.buildings.every(b => buildingRect(b).width > 0));
});
