import test from 'node:test';
import assert from 'node:assert/strict';
import { ExpeditionWorld, CAMP } from '../src/core/expedition.ts';
import { BaseWorld } from '../src/core/base-world.ts';
import { NightWorld } from '../src/core/night-world.ts';
import { newCampaign, decodeCampaign } from '../src/core/campaign.ts';
import { canOccupy } from '../src/core/geometry.ts';
import { roomDoor } from '../src/config/map.ts';
import { buildingStats } from '../src/config/base.ts';
const idle = { moveX: 0, moveY: 0, aim: CAMP, firing: false, sprinting: false };

test('300种子城市有三种真实房间/街垒结构，所有门、奖励、人物均可达，回营保存种子且兼容旧档', () => {
  const shapes = new Set(), events = new Set();
  for (let i = 0; i < 300; i++) {
    const seed = Math.imul(i + 7, 2654435761) >>> 0, c = newCampaign(); c.clearedStage = 2;
    const w = new ExpeditionWorld(c, false, seed); w.navigation.rebuild(CAMP);
    shapes.add(JSON.stringify(w.layout.buildings)); events.add(w.layout.event.kind);
    const reward = w.caches.find(c => c.id === 'event')!;
    assert.equal(reward.rifle, w.layout.event.kind === 'supply'); assert.equal(reward.weapon, w.layout.event.kind === 'clinic' ? 'bow' : undefined);
    for (const p of [...w.caches, ...w.survivors, ...w.layout.buildings.map(roomDoor)]) {
      assert.ok(canOccupy(p, 10, w.obstacles, w.width, w.height), `${seed}: ${JSON.stringify(p)}`);
      assert.ok(w.navigation.field[Math.floor(p.y / 32) * w.navigation.cols + Math.floor(p.x / 32)] >= 0, `${seed}: 无法到达 ${JSON.stringify(p)}`);
    }
    Object.assign(w.player, CAMP); w.finish('return'); assert.equal(decodeCampaign(JSON.stringify(w.campaign)).lastSummary!.seed, seed);
  }
  assert.equal(shapes.size, 3); assert.equal(events.size, 3); assert.ok(decodeCampaign(JSON.stringify(newCampaign())));
});

test('可选危险事件最多触发一次、最多16感染者；原短路线仍提供相同奖励与48负重', () => {
  for (const seed of [3, 123456, 20261026]) {
    const w = new ExpeditionWorld(newCampaign(), true, seed); Object.assign(w.player, w.layout.event.point); w.step(idle);
    assert.equal(w.snapshot().expedition.eventTriggered, true); const count = w.zombies.length;
    for (let i = 0; i < 5; i++) w.step(idle); assert.equal(w.zombies.length, count); assert.ok(count <= 16);
    assert.deepEqual(w.caches[0].cargo, { materials: 8, energy: 2, medkits: 0 }); assert.equal(w.snapshot().expedition.capacity, 48);
  }
});

test('危险地点的随机武器须真实互动取得，超重不吞奖励，返营后随原存档保存', () => {
  const seen = new Set<string>();
  for (let seed = 1000; seed < 1100 && seen.size < 2; seed++) {
    const w = new ExpeditionWorld(newCampaign(), false, seed), cache = w.caches.find(c => c.id === 'event')!;
    const weapon = cache.rifle ? 'rifle' : cache.weapon;
    if (!weapon || seen.has(weapon)) continue;
    Object.assign(w.player, cache); w.inventory.materials = 48;
    assert.equal(w.interact().ok, false); assert.equal(cache.opened, false); assert.ok(!w.ownedWeapons.includes(weapon));
    w.inventory.materials = 0; assert.ok(w.interact().ok); assert.ok(w.ownedWeapons.includes(weapon)); assert.ok(cache.opened);
    Object.assign(w.player, CAMP); w.finish('return'); assert.ok(decodeCampaign(JSON.stringify(w.campaign)).weapons.includes(weapon)); seen.add(weapon);
  }
  assert.equal(seen.size, 2);
});

function base(stage = 3) { const c = newCampaign(); c.clearedStage = stage - 1; c.depot = { materials: 100, energy: 30, medkits: 0 }; c.survivors = ['engineer']; return new BaseWorld(c); }
test('两种改装接入阶段、真实费用、原子失败、一次性升级、维修耐久、存档与出售回收', () => {
  const b = base(1); b.build('turret', { x: 960, y: 352 }); const before = structuredClone(b.campaign);
  assert.equal(b.refit(1).ok, false); assert.deepEqual(b.campaign, before);
  b.campaign.clearedStage = 2; b.finish(); b.resume(); b.campaign.depot.energy = 0; assert.equal(b.refit(1).ok, false); assert.equal(b.plan.buildings[0].upgrade, undefined);
  b.campaign.depot.energy = 30; const materials = b.campaign.depot.materials;
  assert.ok(b.refit(1).ok); assert.equal(b.plan.buildings[0].upgrade, 'flak'); assert.equal(b.campaign.depot.materials, materials - 5); assert.equal(buildingStats(b.plan.buildings[0]).health, 125);
  const once = structuredClone(b.campaign); assert.equal(b.refit(1).ok, false); assert.deepEqual(b.campaign, once); assert.deepEqual(decodeCampaign(JSON.stringify(once)), once);
  assert.throws(() => decodeCampaign(JSON.stringify({ ...once, base: { ...once.base, buildings: [{ ...once.base!.buildings[0], kind: 'wall' }] } })));
  b.demolish(1); assert.equal(b.campaign.depot.materials, materials); assert.equal(b.campaign.depot.energy, 28);
  b.build('cannon', { x: 960, y: 640 }); const id = b.plan.buildings[0].id; assert.ok(b.refit(id).ok); assert.equal(b.plan.buildings[0].upgrade, 'howitzer');
  b.finish(); const w = new NightWorld(b.campaign); assert.equal(w.refit(id).ok, false); assert.deepEqual(decodeCampaign(JSON.stringify(w.checkpoint)), w.checkpoint);
});

test('高射炮真实破片只命中空中敌群；榴弹炮延迟实弹范围伤害不对空', () => {
  for (const kind of ['turret', 'cannon'] as const) {
    const b = base(); b.build(kind, { x: 960, y: 640 }); b.refit(1); const w = new NightWorld(b.campaign);
    for (const f of w.fighters.values()) f.health = 0;
    const entities = [false, true, true].map((air, i) => ({ id: 1000 + i, kind: air ? 'crow' as const : 'brute' as const, x: 1100 + i * 12, y: 670, health: 2000, maxHealth: 2000, aim: 0, moving: false, cooldown: 999, hurt: 0 }));
    w.enemies.push(...entities); let projectile = false;
    for (let i = 0; i < 24; i++) { w.step(); projectile ||= w.bullets.some(p => p.projectile === (kind === 'turret' ? 'flak' : 'shell')); }
    assert.ok(projectile);
    if (kind === 'turret') { assert.equal(entities[0].health, 2000); assert.ok(entities[1].health < 2000 && entities[2].health < 2000); }
    else { assert.ok(entities[0].health < 2000); assert.equal(entities[1].health, 2000); assert.equal(entities[2].health, 2000); }
    assert.equal(w.stage, 3);
  }
});
