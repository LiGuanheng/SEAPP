import test from 'node:test';
import assert from 'node:assert/strict';
import { BaseWorld } from '../src/core/base-world.ts';
import { NightWorld, type NightEnemy } from '../src/core/night-world.ts';
import { newCampaign } from '../src/core/campaign.ts';
import { assaultPlan } from '../src/core/assault.ts';
import { wavesForStage, levelStats } from '../src/config/night.ts';
import type { BuildingKind } from '../src/config/base.ts';

function battle(kind: BuildingKind = 'turret', hard = true) {
  const c = newCampaign(); c.clearedStage = 2; c.depot = { materials: 100, energy: 40, medkits: 0 };
  const b = new BaseWorld(c); assert.ok(b.build(kind, { x: 1216, y: 832 }).ok);
  const w = new NightWorld(b.campaign, hard ? 'hard' : 'normal'); for (const f of w.fighters.values()) f.health = 0;
  return w;
}
function enemy(w: NightWorld, kind: NightEnemy['kind'], x = 1340, y = 848) {
  const e: NightEnemy = { id: 9000 + w.enemies.length, kind, x, y, health: 10000, maxHealth: 10000, aim: 0, moving: false, cooldown: 999, hurt: 0, skillCooldown: 999, summonCooldown: 999 };
  w.enemies.push(e); return e;
}
const steps = (w: NightWorld, n: number) => { for (let i = 0; i < n; i++) w.step(); };

test('困难五阶段实际出兵约增加55%、保留Boss、提前末轮且种子可复现', () => {
  for (const stage of [1, 2, 3, 4, 5] as const) {
    const normal = assaultPlan(stage, 3), hard = assaultPlan(stage, 3, 'hard');
    assert.ok(hard.length > normal.length * 1.45); assert.deepEqual(hard, assaultPlan(stage, 3, 'hard'));
    assert.equal(wavesForStage(stage, 'hard').flatMap(w => w.bosses).length, wavesForStage(stage).flatMap(w => w.bosses).length);
    assert.ok(wavesForStage(stage, 'hard')[4].at < wavesForStage(stage)[4].at);
    const a = levelStats('walker', 1, stage), b = levelStats('walker', 1, stage, 'hard');
    assert.ok(Math.abs(b.health - a.health * 1.5) <= 1 && b.damage > a.damage && b.speed > a.speed);
  }
});
test('铁甲掩护真实减少直射25%，不保护远方、飞行单位或Boss', () => {
  const covered = battle(), a = enemy(covered, 'walker'); enemy(covered, 'tank', 1420, 920);
  assert.ok(covered.tankCovered(a)); assert.equal(covered.tankCovered(enemy(covered, 'crow')), false);
  assert.equal(covered.tankCovered(enemy(covered, 'queen')), false); assert.equal(covered.tankCovered(enemy(covered, 'walker', 1800, 900)), false);
  // 移走额外测试对象，比较相同弹道下的实伤。
  covered.enemies.splice(2); const exposed = battle(), b = enemy(exposed, 'walker');
  steps(covered, 30); steps(exposed, 30); assert.ok(10000 - a.health > 0);
  assert.ok(Math.abs((10000 - a.health) / (10000 - b.health) - 0.75) < 0.01);
});
test('震地锤的群体攻击穿过掩护圈，仍遵守目标自身护甲', () => {
  const w = battle('pounder'), a = enemy(w, 'walker'); enemy(w, 'tank', 1420, 920); w.step();
  assert.equal(10000 - a.health, 100);
});
test('困难巨尸蓄力震击有1.4秒反应时间，普通巨尸没有新增技能', () => {
  const w = battle(), e = enemy(w, 'tank', 1330, 852); e.skillCooldown = 0;
  w.step(); assert.equal(e.windup?.kind, 'breach'); assert.ok(e.windup!.remaining > 1.3);
  const before = w.plan.buildings[0].health; steps(w, 90); assert.ok(w.plan.buildings[0].health < before);
  const normal = battle('turret', false), tank = enemy(normal, 'tank', 1330, 852); tank.skillCooldown = 0; normal.step(); assert.equal(tank.windup, undefined);
});
test('困难毒池压制建筑30%输出速度，离开或毒池到期即恢复，普通不压制', () => {
  const w = battle(), b = w.plan.buildings[0];
  w.hazards.push({ id: 1, kind: 'poison', x: 1248, y: 864, radius: 92, remaining: 5, tick: 999, damage: 0 });
  assert.ok(w.buildingSuppressed(b)); w.turrets.get(b.id)!.cooldown = 1; steps(w, 30);
  assert.ok(Math.abs(w.turrets.get(b.id)!.cooldown - 0.65) < .01); w.hazards.length = 0;
  steps(w, 30); assert.ok(Math.abs(w.turrets.get(b.id)!.cooldown - 0.15) < .01);
  const normal = battle('turret', false); normal.hazards.push({ id: 1, kind: 'poison', x: 1248, y: 864, radius: 92, remaining: 5, tick: 999, damage: 0 }); assert.equal(normal.buildingSuppressed(normal.plan.buildings[0]), false);
});
test('困难最后30秒真实提高移动压力，不改120秒守夜时长', () => {
  const calm = battle(), rage = battle(); calm.elapsed = 80; rage.elapsed = 91;
  const a = enemy(calm, 'walker', 700, 710), b = enemy(rage, 'walker', 700, 710);
  steps(calm, 10); steps(rage, 10); assert.ok(Math.hypot(b.x - 700, b.y - 710) > Math.hypot(a.x - 700, a.y - 710) * 1.2);
  assert.equal(rage.waves.length, 5);
});
