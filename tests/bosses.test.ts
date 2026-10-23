import test from 'node:test';
import assert from 'node:assert/strict';
import { BASE_HEIGHT, BASE_WIDTH, validBasePlan } from '../src/config/base.ts';
import { INFECTED, MOB_KINDS, NIGHT_LIMITS, WAVES, levelStats, type InfectedKind } from '../src/config/night.ts';
import { BaseWorld } from '../src/core/base-world.ts';
import { NightWorld, type NightEnemy } from '../src/core/night-world.ts';
import { newCampaign, decodeCampaign } from '../src/core/campaign.ts';
import { ExpeditionWorld, CAMP } from '../src/core/expedition.ts';
import { explorationLayout } from '../src/core/exploration-layout.ts';
import { canOccupy } from '../src/core/geometry.ts';

function quiet() { const w = new NightWorld(newCampaign()); for (const f of w.fighters.values()) f.health = 0; return w; }
function enemy(w: NightWorld, kind: InfectedKind, x: number, y: number, level = 1) {
  const stats = levelStats(kind, level);
  const e: NightEnemy = { id: 10000 + w.enemies.length, kind, x, y, level, health: stats.health, maxHealth: stats.health, aim: 0, moving: false, cooldown: 0, hurt: 0, skillCooldown: 0, summonCooldown: 999 };
  w.enemies.push(e); return e;
}
function run(w: NightWorld, seconds: number) { for (let i = 0; i < Math.ceil(seconds * 60); i++) w.step(); }

test('五波编成递增、四种 Boss 各一位，波次同时提升耐久/伤害/速度且等级封顶', () => {
  const sizes = WAVES.map(w => MOB_KINDS.reduce((n, k) => n + w[k], Number(!!w.boss)));
  assert.deepEqual(sizes, [8, 16, 23, 31, 45]); assert.equal(sizes.reduce((a, b) => a + b), 123);
  assert.deepEqual(WAVES.map(w => w.boss).filter(Boolean), ['axeman', 'queen', 'knight', 'bird']);
  for (const k of Object.keys(INFECTED) as InfectedKind[]) {
    const a = levelStats(k), b = levelStats(k, 5); assert.ok(b.health > a.health && b.damage > a.damage && b.speed > a.speed); assert.deepEqual(levelStats(k, 50), b);
  }
  const w = quiet(); w.elapsed = 94; w.step(); assert.equal(w.enemies[0].kind, 'bird'); assert.equal(w.enemies[0].level, 5); assert.ok(w.bossesSeen.has('bird'));
});

test('女皇召唤蜘蛛、骑士召唤亡灵，继承波次，召唤冷却与总人数上限生效', () => {
  for (const [boss, minion] of [['queen', 'spiderling'], ['knight', 'undead']] as const) {
    const w = quiet(), e = enemy(w, boss, 1100, 640, 4); e.summonCooldown = 0; e.skillCooldown = 999;
    w.step(); assert.equal(w.enemies.filter(e => e.kind === minion).length, 2);
    for (const child of w.enemies.filter(e => e.kind === minion)) { assert.equal(child.level, 4); assert.equal(child.maxHealth, levelStats(minion, 4).health); assert.ok(canOccupy(child, INFECTED[minion].radius, w.obstacles, BASE_WIDTH, BASE_HEIGHT)); }
    w.step(); assert.equal(w.enemies.length, 3);
    while (w.enemies.length < NIGHT_LIMITS.enemies) enemy(w, minion, 1400, 640);
    e.summonCooldown = 0; w.step(); assert.equal(w.enemies.length, NIGHT_LIMITS.enemies);
  }
});

test('重斧先锁定落点预警，移动可躲开，原地驻守受到范围伤害', () => {
  for (const dodge of [false, true]) {
    const w = quiet(), s = w.plan.soldiers[0], f = w.fighters.get(s.id)!;
    Object.assign(s, { x: 960, y: 624 }); Object.assign(f, { health: 90, cooldown: 999 });
    const e = enemy(w, 'axeman', 920, 624); w.step(); assert.equal(e.windup?.kind, 'slam'); assert.equal(e.windup.point.x, 960); assert.equal(f.health, 90);
    if (dodge) assert.ok(w.move([s.id], { x: 1180, y: 624 }).ok);
    run(w, 1); assert.equal(f.health, dodge ? 90 : 58); assert.equal(e.windup, undefined);
  }
});

test('Boss 在读条期间被击杀会取消未生效技能，只结算一次 Boss 击杀', () => {
  const w = quiet(), e = enemy(w, 'queen', 880, 600); e.health = 1;
  e.windup = { kind: 'web', point: { x: 768, y: 512 }, remaining: 0.001, duration: 1.1, radius: 92 };
  w.bullets.push({ id: 1, x: 880, y: 584, vx: 1, vy: 0, life: 1, damage: 10 }); w.step();
  assert.equal(w.hazards.length, 0); assert.equal(w.bossKills, 1); assert.equal(w.kills, 1); assert.equal(w.enemies.length, 0);
  w.step(); assert.equal(w.bossKills, 1);
});

test('女皇织网与巨鸟风暴真实读条后生成区域，区域数量有界', () => {
  for (const [boss, kind] of [['queen', 'web'], ['bird', 'storm']] as const) {
    const w = quiet(); enemy(w, boss, 920, 600); w.step(); assert.equal(w.enemies[0].windup?.kind, kind);
    assert.equal(w.hazards.length, 0); run(w, 1.2); assert.equal(w.hazards[0].kind, kind); const health = w.lampHealth; run(w, 0.5); assert.ok(w.lampHealth < health);
  }
  const w = quiet();
  for (let i = 0; i < 10; i++) { const e = enemy(w, 'bird', 1300, 700); e.windup = { kind: 'storm', point: { x: 1300, y: 700 }, remaining: 0.001, duration: 1, radius: 92 }; }
  w.step(); assert.equal(w.hazards.length, NIGHT_LIMITS.zones);
});

test('蛛网造成定时伤害和移速降低，过期解除；风暴可同时摧毁建筑与灯塔且终局清理', () => {
  const w = quiet(), s = w.plan.soldiers[0], f = w.fighters.get(s.id)!;
  Object.assign(s, { x: 1000, y: 640 }); Object.assign(f, { health: 90, cooldown: 999 });
  w.hazards.push({ id: 1, kind: 'web', x: 1050, y: 640, radius: 150, remaining: 1, tick: 0.5, damage: 2 });
  w.move([s.id], { x: 1300, y: 640 }); run(w, 0.6); assert.ok(s.x > 1040 && s.x < 1050); assert.equal(f.health, 88);
  run(w, 0.5); assert.equal(w.hazards.length, 0); const x = s.x; run(w, 0.2); assert.ok(s.x - x > 27);
  const c = newCampaign(); c.depot.materials = 1; const b = new BaseWorld(c); assert.ok(b.build('wall', { x: 832, y: 576 }).ok);
  const loss = new NightWorld(b.campaign); loss.plan.buildings[0].health = 4; loss.lampHealth = 4;
  loss.hazards.push({ id: 2, kind: 'storm', x: 810, y: 550, radius: 100, remaining: 1, tick: 0, damage: 4 }); loss.step();
  assert.equal(loss.status, 'defeat'); assert.equal(loss.plan.buildings.length, 0); assert.equal(loss.summary().buildings, 0); assert.equal(loss.hazards.length, 0);
  const frozen = loss.nightSnapshot(); run(loss, 1); assert.deepEqual(loss.nightSnapshot(), frozen);
});

test('飞行目标越过城墙，近战与加农炮不能对空，箭塔/步枪可以对空', () => {
  const c = newCampaign(); c.depot = { materials: 100, energy: 20, medkits: 0 }; c.survivors = ['brawler'];
  const b = new BaseWorld(c); b.build('wall', { x: 832, y: 608 }); b.build('cannon', { x: 960, y: 352 });
  const w = new NightWorld(b.campaign); for (const f of w.fighters.values()) f.health = 0;
  const v = w.plan.soldiers.find(s => s.role === 'vanguard')!; Object.assign(v, { x: 940, y: 460 }); w.fighters.get(v.id)!.health = 90;
  const air = enemy(w, 'bird', 980, 460); air.skillCooldown = 999; const health = air.health; run(w, 0.7); assert.equal(air.health, health); assert.equal(w.bullets.length, 0);
  const crossing = enemy(w, 'crow', 848, 660); run(w, 0.5); assert.ok(crossing.y < 640); assert.equal(w.plan.buildings.find(b => b.kind === 'wall')!.health, 80);
  const antiAir = new BaseWorld(c); antiAir.build('arrowtower', { x: 960, y: 352 }); const defense = new NightWorld(antiAir.campaign);
  const target = enemy(defense, 'bird', 980, 460); target.skillCooldown = 999; run(defense, 1); assert.ok(target.health < health);
});

test('扩展基地可在旧边界外施工，旧坐标阵地及缺少 Boss 字段的存档保持兼容', () => {
  const c = newCampaign(); c.depot.materials = 100; const b = new BaseWorld(c);
  for (const point of [{ x: 352, y: 192 }, { x: 1376, y: 672 }, { x: 352, y: 864 }]) assert.ok(b.build('wall', point).ok);
  assert.ok(validBasePlan(b.plan)); assert.deepEqual(decodeCampaign(JSON.stringify(b.campaign)).base, b.plan);
  const bad = structuredClone(c); bad.lastNight = { outcome: 'defeat', duration: 10, kills: 0, lampHealth: 0, soldiers: 0, buildings: 0, strikes: 0, bossKills: 5 };
  assert.throws(() => decodeCampaign(JSON.stringify(bad)));
});

test('100 个探索种子可复现且产生不同布局，所有奖励/NPC/门路仍可达且教学路线稳定', () => {
  const layouts = new Set<string>(), themes = new Set<string>();
  for (let i = 0; i < 100; i++) {
    const seed = Math.imul(i + 1, 2654435761) >>> 0, w = new ExpeditionWorld(newCampaign(), false, seed);
    assert.deepEqual(explorationLayout(seed), w.layout); layouts.add(JSON.stringify(w.layout.debris)); themes.add(w.layout.theme);
    w.navigation.rebuild(CAMP);
    for (const p of [...w.caches, ...w.survivors]) { assert.ok(canOccupy(p, 10, w.obstacles, w.width, w.height), `${seed}: ${JSON.stringify(p)}`); assert.ok(w.navigation.field[Math.floor(p.y / 32) * w.navigation.cols + Math.floor(p.x / 32)] >= 0, `${seed}: 无法到达 ${JSON.stringify(p)}`); }
    assert.deepEqual([w.caches[0].x, w.caches[0].y], [1056, 736]); assert.deepEqual([w.survivors[0].x, w.survivors[0].y], [1104, 852]);
  }
  assert.ok(layouts.size > 80); assert.equal(themes.size, 3);
});
