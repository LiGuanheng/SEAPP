import test from 'node:test';
import assert from 'node:assert/strict';
import { ExplorationVision, LIGHT_RADII } from '../src/core/exploration-vision.ts';
import { CAPACITY, CAMP, ExpeditionWorld } from '../src/core/expedition.ts';
import { BaseWorld } from '../src/core/base-world.ts';
import { NightWorld } from '../src/core/night-world.ts';
import { decodeCampaign, newCampaign } from '../src/core/campaign.ts';
import { validBasePlan } from '../src/config/base.ts';
import type { InputState, Vec } from '../src/core/types.ts';

const idle: InputState = { moveX: 0, moveY: 0, firing: false, sprinting: false, aim: { x: 1100, y: 720 } };
function at(w: ExpeditionWorld, p: Vec) { Object.assign(w.player, p); w.vision.update(w.player, w.lightRadius); }

test('当前灯光与探索记忆分离：附近可见、远处隐藏，离开后仅记地形，边界不越界', () => {
  const v = new ExplorationVision(1024, 1024, []); v.update({ x: 240, y: 240 }, 240);
  assert.ok(v.canSee({ x: 320, y: 240 })); assert.equal(v.canSee({ x: 800, y: 240 }), false);
  assert.ok(v.wasSeen({ x: 320, y: 240 })); assert.equal(v.wasSeen({ x: 800, y: 240 }), false);
  const count = v.explored; v.update({ x: 800, y: 240 }, 240);
  assert.equal(v.canSee({ x: 320, y: 240 }), false); assert.ok(v.wasSeen({ x: 320, y: 240 })); assert.ok(v.explored > count);
  assert.equal(v.canSee({ x: 1025, y: 240 }), false); assert.equal(v.canSee({ x: NaN, y: 240 }), false);
});

test('灯光受墙体阻挡，从门洞可见；扩大半径也不能穿墙透视', () => {
  const v = new ExplorationVision(800, 600, [{ x: 320, y: 64, width: 16, height: 240 }]); v.update({ x: 260, y: 200 }, 400);
  assert.equal(v.canSee({ x: 380, y: 200 }), false); assert.equal(v.wasSeen({ x: 384, y: 208 }), false);
  v.update({ x: 260, y: 350 }, 400); assert.ok(v.canSee({ x: 380, y: 350 }));
});

test('提灯升级即时扩大视野、不降级、不重复领取，满背包可取无重量镜片', () => {
  const w = new ExpeditionWorld(newCampaign(), false), lens = w.caches.find(c => c.id === 'lantern-lens')!;
  assert.equal(w.lightRadius, LIGHT_RADII[0]); w.inventory.materials = CAPACITY; at(w, lens); assert.ok(w.interact().ok);
  assert.equal(w.lanternLevel, 1); assert.equal(w.lightRadius, 320); const count = w.vision.explored;
  w.interact(); assert.equal(w.lanternLevel, 1); assert.equal(w.vision.explored, count);
  w.inventory.materials = 0; const room = w.caches.find(c => c.id === 'room-1')!; at(w, room); assert.ok(w.interact().ok);
  assert.equal(w.lanternLevel, 2); assert.equal(w.lightRadius, 400); assert.ok(w.ownedWeapons.includes('bow'));
  const upgraded = newCampaign(); upgraded.lanternLevel = 2; const full = new ExpeditionWorld(upgraded, false); at(full, lens); full.interact(); assert.equal(full.lanternLevel, 2);
});

test('提灯只有成功返营后持久保存，失败不带回升级，旧档/非法灯级校验', () => {
  const w = new ExpeditionWorld(newCampaign(), false); at(w, w.caches.find(c => c.id === 'lantern-lens')!); w.interact();
  assert.equal(w.campaign.lanternLevel, undefined); at(w, CAMP); assert.ok(w.interact().ok); assert.equal(w.campaign.lanternLevel, 1);
  assert.equal(new ExpeditionWorld(decodeCampaign(JSON.stringify(w.campaign)), false).lightRadius, 320);
  const lost = new ExpeditionWorld(newCampaign(), false); at(lost, lost.caches.find(c => c.id === 'lantern-lens')!); lost.interact(); lost.status = 'defeat'; lost.step(idle);
  assert.equal(new ExpeditionWorld(lost.campaign, false).lightRadius, 240); assert.ok(decodeCampaign(JSON.stringify(newCampaign())));
  for (const level of [-1, 3, 1.5, '1']) assert.throws(() => decodeCampaign(JSON.stringify({ ...newCampaign(), lanternLevel: level })));
});

test('48 容量可带回超过旧 24 的物资，容量满仍拒绝整箱且不扣奖励', () => {
  const w = new ExpeditionWorld(newCampaign(), false); assert.equal(CAPACITY, 48);
  for (const id of ['salvage', 'warehouse', 'medical', 'battery']) { at(w, w.caches.find(c => c.id === id)!); assert.ok(w.interact().ok); }
  assert.equal(w.weight, 32); w.inventory.materials = 48; w.inventory.energy = 0; w.inventory.medkits = 0;
  const room = w.caches.find(c => c.id === 'room-1')!; at(w, room); assert.equal(w.interact().ok, false); assert.equal(room.opened, false); assert.equal(w.lanternLevel, 0);
});

test('超过四十座设施可真实扣费、保存、读档和夜战结算，非法占地仍拒绝', () => {
  const c = newCampaign(); c.depot.materials = 100; const b = new BaseWorld(c);
  for (let i = 0; i < 60; i++) assert.ok(b.build('wall', { x: 352 + i % 10 * 32, y: 256 + Math.floor(i / 10) * 32 }).ok);
  assert.equal(b.plan.buildings.length, 60); assert.equal(b.campaign.depot.materials, 40); assert.ok(validBasePlan(b.plan));
  assert.equal(b.build('wall', { x: 352, y: 256 }).ok, false); assert.equal(b.build('wall', { x: 736, y: 352 }).ok, false);
  const n = new NightWorld(decodeCampaign(JSON.stringify(b.campaign))); n.elapsed = 119.99; n.step();
  assert.equal(n.status, 'victory'); assert.equal(n.summary().buildings, 60); assert.equal(decodeCampaign(JSON.stringify(n.resultCampaign())).lastNight?.buildings, 60);
});
