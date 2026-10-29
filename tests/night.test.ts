import test from 'node:test';
import assert from 'node:assert/strict';
import { BaseWorld } from '../src/core/base-world.ts';
import { NightWorld, type NightEnemy } from '../src/core/night-world.ts';
import { decodeCampaign, newCampaign } from '../src/core/campaign.ts';
import { INFECTED, NIGHT_LIMITS } from '../src/config/night.ts';

function prepared() {
  const c = newCampaign(); c.depot = { materials: 12, energy: 2, medkits: 0 }; c.survivors = ['engineer']; c.weapons.push('rifle');
  const base = new BaseWorld(c); base.build('turret', { x: 1088, y: 544 }); base.build('barricade', { x: 1216, y: 832 }, 1); base.finish();
  return new NightWorld(base.campaign);
}
function enemy(w: NightWorld, x: number, y: number, kind: NightEnemy['kind'] = 'walker'): NightEnemy {
  const e: NightEnemy = { id: 10000 + w.enemies.length, x, y, kind, health: INFECTED[kind].health, aim: 0, moving: false, cooldown: 0, hurt: 0 }; w.enemies.push(e); return e;
}
function run(w: NightWorld, seconds: number) { for (let i = 0; i < Math.ceil(seconds * 60); i++) w.step(); }
function noArmy(w: NightWorld) { for (const f of w.fighters.values()) f.health = 0; }

test('入夜独立克隆阵地，持有有限支援，不允许夜间施工/拆除，但允许军队命令', () => {
  const w = prepared(); assert.equal(w.charges, 2); assert.equal(w.remaining, 120);
  assert.equal(w.build('barricade', { x: 1056, y: 352 }).ok, false); assert.equal(w.demolish(1).ok, false);
  assert.equal(w.move([1, 2], { x: 1072, y: 592 }).ok, true); run(w, 0.5); assert.ok(w.plan.soldiers[0].x > 688);
  assert.equal(w.hold([1, 2]).ok, true); assert.equal(w.checkpoint.base?.soldiers[0].x, 944);
});
test('士兵与机枪塔自动发射真实弹体、命中与击杀；同一尸体不重复记击杀', () => {
  const w = prepared(); const e = enemy(w, 1136, 524); let shots = 0, hit = 0;
  for (let i = 0; i < 100; i++) { w.step(); shots += w.events.filter(e => e.type === 'fire').length; hit += w.events.filter(e => e.type === 'hit').length; }
  assert.ok(shots > 0); assert.ok(hit > 0); assert.equal(e.health, 0); assert.equal(w.kills, 1);
  run(w, 1); assert.equal(w.kills, 1);
});
test('不同尸种具备不同耐久/速度/伤害；分波生成不是开局全部生成', () => {
  assert.ok(INFECTED.runner.speed > INFECTED.walker.speed); assert.ok(INFECTED.brute.health > INFECTED.walker.health); assert.ok(INFECTED.brute.damage > INFECTED.walker.damage);
  const w = prepared(); run(w, 2.9); assert.equal(w.wave, 0); assert.equal(w.enemies.length, 0);
  run(w, 0.2); assert.equal(w.wave, 1); assert.ok(w.enemies.length > 0 && w.enemies.length < 6);
  w.elapsed = 50; w.step(); assert.equal(w.wave, 3);
});
test('炮火支援扣次数和冷却，延时爆炸命中范围敌人，不伤己方，非法落点拒绝', () => {
  const w = prepared(); const e = enemy(w, 1186, 782); const health = w.lampHealth;
  assert.equal(w.callStrike({ x: NaN, y: 692 }).ok, false); assert.equal(w.callStrike({ x: 281, y: 217 }).ok, false); assert.equal(w.charges, 2);
  assert.equal(w.callStrike({ x: 1186, y: 782 }).ok, true); assert.equal(w.charges, 1); assert.equal(w.callStrike({ x: 1186, y: 782 }).ok, false);
  run(w, 0.5); assert.ok(w.strikes.length > 0); run(w, 0.2); assert.equal(w.strikes.length, 0); assert.equal(e.health, 0); assert.equal(w.lampHealth, health);
});
test('丧尸可以摧毁路障并更新导航；近战冷却限制伤害', () => {
  const w = prepared(); noArmy(w);
  const barricade = w.plan.buildings.find(b => b.kind === 'barricade')!; barricade.health = 22;
  enemy(w, barricade.x - 12, barricade.y + 16, 'brute'); w.step(); assert.ok(!w.plan.buildings.includes(barricade));
  const lamp = new NightWorld(newCampaign()); noArmy(lamp); enemy(lamp, 1068, 704); lamp.step(); assert.equal(lamp.lampHealth, 371);
  run(lamp, 0.5); assert.equal(lamp.lampHealth, 371);
});
test('灯塔归零判负；终局冻结子弹/支援/单位/伤害，不能再领奖或下令', () => {
  const w = new NightWorld(newCampaign()); noArmy(w); w.lampHealth = 9; enemy(w, 1068, 704); w.step();
  assert.equal(w.status, 'defeat'); assert.equal(w.lampHealth, 0); const before = w.nightSnapshot();
  run(w, 10); w.callStrike({ x: 1056, y: 792 }); w.move([1], { x: 1156, y: 792 }); assert.deepEqual(w.nightSnapshot(), before);
  assert.deepEqual(w.resultCampaign(), w.resultCampaign()); assert.equal(w.resultCampaign().nightsWon, 0);
});
test('守卫可阵亡且不再接受命令或射击，尸体不阻挡其他部队', () => {
  const w = prepared(); w.fighters.get(1)!.health = 22; const s = w.plan.soldiers[0]; enemy(w, s.x, s.y + 24, 'brute'); w.step();
  assert.equal(w.fighters.get(1)!.health, 0); assert.ok(!w.livingSoldiers.includes(s)); assert.equal(w.move([1], { x: 1156, y: 792 }).ok, false);
  assert.equal(s.destination, null); assert.equal(s.moving, false);
});
test('跨过黎明截止时间时只推进剩余时长，同一步灯塔归零优先判负且结算可存档', () => {
  const w = new NightWorld(newCampaign()); noArmy(w); w.elapsed = 119.99; w.lampHealth = 9; enemy(w, 1068, 704); w.step(0.05);
  assert.equal(w.elapsed, 120); assert.equal(w.status, 'defeat'); assert.ok(decodeCampaign(JSON.stringify(w.resultCampaign())));
});
test('医护员定时治疗仍存活的守卫，不复活阵亡单位', () => {
  const c = newCampaign(); c.survivors = ['medic']; const w = new NightWorld(c);
  w.fighters.get(1)!.health = 20; w.fighters.get(2)!.health = 0; run(w, 8.1);
  assert.equal(w.fighters.get(1)!.health, 28); assert.equal(w.fighters.get(2)!.health, 0);
});
test('完整 120 秒普通布防可守到天亮，状态有界、结算幂等且保存入夜前检查点', () => {
  // 工具箱 + 急救补给箱 + 工程师：16 建材 / 2 电力，成本不超过真实短路线收益。
  const c = newCampaign(); c.depot = { materials: 16, energy: 2, medkits: 1 }; c.survivors = ['engineer']; c.weapons.push('rifle');
  const b = new BaseWorld(c);
  for (const [kind, x, y] of [['turret', 1088, 544], ['arrowtower', 864, 832], ['arrowtower', 1120, 832], ['barricade', 1216, 832]] as const) assert.ok(b.build(kind, { x, y }, kind === 'barricade' ? 1 : 0).ok);
  b.finish(); const w = new NightWorld(b.campaign);
  for (let i = 0; i < 7201 && w.commanding; i++) {
    if (w.charges && w.supportCooldown === 0 && w.elapsed > 55) { const heavy = w.enemies.find(e => e.kind === 'brute' && w.canSee(e)); if (heavy) w.callStrike(heavy); }
    w.step(); assert.ok(w.enemies.length <= NIGHT_LIMITS.enemies); assert.ok(w.bullets.length <= NIGHT_LIMITS.bullets); assert.ok(w.lampHealth >= 0);
  }
  assert.equal(w.status, 'victory'); assert.equal(w.elapsed, 120); assert.ok(w.kills > 20); assert.equal(w.wave, 5);
  const result = w.resultCampaign(); assert.equal(result.nightsWon, 1); assert.deepEqual(result.base, w.checkpoint.base);
  assert.deepEqual(decodeCampaign(JSON.stringify(result)), result); assert.equal(w.resultCampaign().nightsWon, 1);
  const before = w.nightSnapshot(); run(w, 1); assert.deepEqual(w.nightSnapshot(), before);
});
test('旧存档不需守夜字段，非法结算不接受', () => {
  assert.ok(decodeCampaign(JSON.stringify(newCampaign())));
  assert.throws(() => decodeCampaign(JSON.stringify({ ...newCampaign(), nightsWon: -1 })));
  assert.throws(() => decodeCampaign(JSON.stringify({ ...newCampaign(), lastNight: { outcome: 'victory', duration: 10, lampHealth: 380, kills: 0, soldiers: 3, buildings: 0, strikes: 0 } })));
});
