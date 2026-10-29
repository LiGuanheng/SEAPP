import test from 'node:test';
import assert from 'node:assert/strict';
import { ExpeditionWorld, CAMP } from '../src/core/expedition.ts';
import { newCampaign, decodeCampaign } from '../src/core/campaign.ts';
import { BaseWorld } from '../src/core/base-world.ts';
import { NightWorld } from '../src/core/night-world.ts';
import { HERO_IDS, SURVIVOR_PROFILES } from '../src/config/survivors.ts';
import { INFECTED, levelStats, wavesForStage } from '../src/config/night.ts';
import { canOccupy, distance } from '../src/core/geometry.ts';
import type { StageId } from '../src/config/progression.ts';

function leave(w: ExpeditionWorld) { Object.assign(w.player, CAMP); assert.ok(w.interact().ok); return decodeCampaign(JSON.stringify(w.campaign)); }
function base(stage: StageId = 2) { const c = newCampaign(); c.clearedStage = stage - 1; c.depot = { materials: 500, energy: 100, medkits: 0 }; return new BaseWorld(c); }

test('原箱子只领取一次：跨街区、再返回、序列化与新随机参数都不会刷新已搜物资；普通人员换位再生', () => {
  const a = new ExpeditionWorld(newCampaign(), false, 13579);
  Object.assign(a.player, a.caches[0]); assert.ok(a.interact().ok); assert.equal(a.interact().ok, false);
  const engineer = a.survivors.find(s => s.id === 'engineer')!; Object.assign(a.player, engineer); assert.ok(a.interact().ok); Object.assign(engineer, { x: CAMP.x - 20, y: CAMP.y });
  const first = leave(a); assert.ok(first.exploration!.looted[0].includes('salvage'));
  const b = new ExpeditionWorld(first, false, 99999); assert.equal(b.district, 1); assert.equal(b.survivors.some(s => s.id === 'engineer'), true);
  const second = leave(b), c = new ExpeditionWorld(second, false, 88888);
  assert.equal(c.district, 0); assert.equal(c.caches[0].depleted, true); assert.equal(c.hasFinds, false);
  assert.deepEqual(c.layout, a.layout); Object.assign(c.player, c.caches[0]); assert.equal(c.interact().ok, false); assert.equal(c.inventory.materials, 0);
  assert.deepEqual(c.caches.map(c => c.cargo), a.caches.map(c => c.cargo));
  assert.notDeepEqual(c.survivors.find(s => s.id === 'engineer'), a.survivors.find(s => s.id === 'engineer'));
  const third = leave(c); assert.equal(third.depot.materials, first.depot.materials); assert.equal(third.lastSummary?.caches, 0);
});

test('新街区优先开放，世界种子固定；已救齐人物与搬空街区仍能安全给出返营目标', () => {
  const c = newCampaign(); c.clearedStage = 4; c.survivors = Object.keys(SURVIVOR_PROFILES);
  const a = new ExpeditionWorld(c, false, 345678); assert.equal(a.district, 5); assert.equal(a.survivors.length, 6); a.survivors.forEach(s => s.state = 'secured');
  a.caches.forEach(cache => { cache.opened = true; }); assert.deepEqual(a.objective().point, CAMP);
  const saved = leave(a); const b = new ExpeditionWorld(saved, false, 7654); assert.equal(b.district, 4); assert.equal(b.worldState.seed, a.worldState.seed);
  assert.notDeepEqual(b.layout.buildings, a.layout.buildings);
  const invalid = structuredClone(saved); invalid.exploration!.looted[0] = ['salvage', 'salvage']; assert.throws(() => decodeCampaign(JSON.stringify(invalid)));
  assert.equal(decodeCampaign(JSON.stringify(newCampaign())).exploration, undefined);
});

test('失败不会把未带回的搜刮、武器、救援提交到持续世界；成功带回的武器后续直接可用', () => {
  const original = newCampaign(), a = new ExpeditionWorld(original, false, 89);
  const weapon = a.caches.find(c => c.rifle)!; Object.assign(a.player, weapon); assert.ok(a.interact().ok); a.status = 'defeat';
  assert.equal(a.campaign.exploration, undefined); assert.deepEqual(a.campaign.weapons, ['pistol']); assert.equal(original.exploration, undefined);
  const b = new ExpeditionWorld(original, false, 89); Object.assign(b.player, b.caches.find(c => c.rifle)!); b.interact();
  const saved = leave(b), next = new ExpeditionWorld(saved, false); assert.ok(next.ownedWeapons.includes('rifle'));
});

test('300个多样街区中NPC不重叠，均可直接营救；物资、房门、NPC保持可达', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const c = newCampaign(); c.clearedStage = 4; const w = new ExpeditionWorld(c, false, Math.imul(seed, 2654435761) >>> 0); w.navigation.rebuild(CAMP);
    for (const s of w.survivors) {
      assert.ok(canOccupy(s, 12, w.obstacles, w.width, w.height)); assert.ok(w.navigation.field[Math.floor(s.y / 32) * w.navigation.cols + Math.floor(s.x / 32)] >= 0);
      assert.ok(w.survivors.every(o => o === s || distance(o, s) >= 30)); Object.assign(w.player, s); assert.equal(w.nearby()?.id, s.id);
    }
  }
});

test('阶段2至5恰好新增一名英雄，已救的四人不再出现，八人阵地能同时容纳四英雄', () => {
  for (const stage of [1, 2, 3, 4, 5] as const) {
    const c = newCampaign(); c.clearedStage = stage - 1;
    const w = new ExpeditionWorld(c, false, 42); assert.equal(w.survivors.filter(s => SURVIVOR_PROFILES[s.id].hero).length, stage - 1);
  }
  const c = base(5).campaign; c.survivors = Object.keys(SURVIVOR_PROFILES);
  const b = new BaseWorld(c); assert.equal(b.plan.soldiers.length, 10); for (const id of HERO_IDS) assert.equal(b.plan.soldiers.filter(s => s.role === id).length, 1);
  assert.ok(decodeCampaign(JSON.stringify(b.campaign))); assert.equal(new ExpeditionWorld(b.campaign, false).survivors.length, 6);
});

test('独立防空塔阶段解锁、真实扣费、存档；防空弹和范围伤害只作用空中单位', () => {
  const early = base(1), before = structuredClone(early.campaign); assert.equal(early.build('antiair', { x: 1216, y: 544 }).ok, false); assert.deepEqual(early.campaign, before);
  const b = base(); assert.ok(b.build('antiair', { x: 1216, y: 544 }).ok); assert.equal(b.campaign.depot.energy, 96); assert.equal(b.campaign.depot.materials, 491); assert.ok(decodeCampaign(JSON.stringify(b.campaign)));
  const w = new NightWorld(b.campaign); for (const f of w.fighters.values()) f.health = 0;
  const targets = [false, true, true].map((air, i) => ({ id: 1000 + i, kind: air ? 'crow' as const : 'brute' as const, x: 1356 + i * 12, y: 612, health: 2000, maxHealth: 2000, aim: 0, moving: false, cooldown: 999, hurt: 0 })); w.enemies.push(...targets);
  for (let i = 0; i < 40; i++) w.step(); assert.ok(w.shotsFired.flak > 0); assert.equal(targets[0].health, 2000); assert.ok(targets[1].health < 2000 && targets[2].health < 2000);
});

test('铁甲巨尸真实高血量减伤、慢速并在第二关后进入波次，不冒充Boss', () => {
  assert.equal(INFECTED.tank.boss, false); assert.ok(INFECTED.tank.health > INFECTED.brute.health * 3); assert.ok(levelStats('tank').speed < levelStats('walker').speed);
  assert.ok(wavesForStage(2).some(w => w.tank > 0)); assert.ok(wavesForStage(1).every(w => w.tank === 0));
  const w = new NightWorld(base().campaign); for (const f of w.fighters.values()) f.health = 0;
  const e = { id: 9000, kind: 'tank' as const, x: 1256, y: 892, health: 900, aim: 0, moving: false, cooldown: 999, hurt: 0 }; w.enemies.push(e);
  w.bullets.push({ id: 99, x: 1256, y: 876, vx: 1, vy: 0, damage: 100, life: 1 }); w.step(); assert.equal(e.health, 845);
});

test('磐石英雄实际承伤能力与逐空英雄优先对空生效', () => {
  const c = base(5).campaign; c.survivors = ['sentinel', 'striker']; const w = new NightWorld(c);
  const shield = w.plan.soldiers.find(s => s.role === 'sentinel')!, hunter = w.plan.soldiers.find(s => s.role === 'striker')!;
  assert.equal(w.fighters.get(shield.id)!.health, 520); (w as any).hurtSoldier(shield, 100); assert.equal(w.fighters.get(shield.id)!.health, 465);
  for (const [id, f] of w.fighters) if (id !== hunter.id) f.health = 0;
  Object.assign(hunter, { x: 1356, y: 892 });
  w.enemies.push({ id: 9000, kind: 'walker', x: 1416, y: 892, health: 2000, aim: 0, moving: false, cooldown: 999, hurt: 0 }, { id: 9001, kind: 'crow', x: 1516, y: 892, health: 2000, aim: 0, moving: false, cooldown: 999, hurt: 0 });
  for (let i = 0; i < 35; i++) w.step(); assert.ok(w.shotsFired.flak > 0); assert.equal(w.enemies.find(e => e.id === 9000)!.health, 2000); assert.ok(w.enemies.find(e => e.id === 9001)!.health < 2000);
});
