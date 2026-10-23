import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMP, CAPACITY, ExpeditionWorld, cargoWeight } from '../src/core/expedition.ts';
import { decodeCampaign, loadCampaign, newCampaign, SAVE_KEY, saveCampaign } from '../src/core/campaign.ts';
import { canOccupy, distance } from '../src/core/geometry.ts';
import { CombatWorld } from '../src/core/world.ts';
import type { InputState, Vec } from '../src/core/types.ts';

const idle: InputState = { moveX: 0, moveY: 0, firing: false, sprinting: false, aim: { x: 1600, y: 720 } };
const world = () => new ExpeditionWorld(newCampaign(), false);
function at(w: ExpeditionWorld, point: Vec) { Object.assign(w.player, { x: point.x, y: point.y }); }
function step(w: CombatWorld, seconds: number) { for (let i = 0; i < Math.round(seconds * 60); i++) w.step(idle); }

test('物资/NPC/返营信标均在可达的非碰撞位置，90 秒内提供引导目标', () => {
  const w = world();
  for (const point of [...w.caches, ...w.survivors, CAMP]) assert.ok(canOccupy(point, 10, w.obstacles, w.width, w.height), JSON.stringify(point));
  assert.equal(w.remaining, 90); assert.equal(w.objective().point, w.caches[0]);
  assert.equal(w.interact().ok, false);
});
test('搜刮必须接近且无墙阻隔，奖励只发一次，背包不足时整箱保留', () => {
  const w = world(), c = w.caches[0];
  assert.equal(w.interact().ok, false);
  at(w, c); assert.equal(w.interact().ok, true); assert.equal(w.inventory.materials, 8); assert.equal(w.weight, 10);
  w.interact(); assert.equal(w.inventory.materials, 8);
  w.inventory.materials = CAPACITY; w.inventory.energy = 0;
  at(w, w.caches[2]); assert.equal(w.interact().ok, false); assert.equal(w.caches[2].opened, false);
  assert.equal(w.inventory.medkits, 0);
  w.inventory.materials = 14; at(w, w.caches[4]); assert.equal(w.interact().ok, true); assert.equal(w.weight, 24);
  assert.equal(cargoWeight({ materials: 1, energy: 1, medkits: 2 }), 6);
  const blocked = world(); const target = blocked.caches[0]; at(blocked, { x: target.x - 50, y: target.y });
  (blocked.obstacles as { x: number; y: number; width: number; height: number }[]).push({ x: target.x - 30, y: target.y - 15, width: 5, height: 30 });
  assert.equal(blocked.interact().ok, false);
  (blocked.obstacles as unknown[]).pop();
});
test('获得步枪可切换，切枪不会补弹或保留半次换弹，弹体保留发射时伤害', () => {
  const w = world(); at(w, w.caches[1]); assert.equal(w.interact().ok, true); assert.equal(w.weaponId, 'rifle');
  w.player.shotCooldown = 0; w.step({ ...idle, firing: true }); assert.equal(w.player.ammo, 23);
  assert.equal(w.bullets[0].damage, 22);
  assert.equal(w.switchWeapon('pistol'), true); assert.equal(w.player.ammo, 18);
  w.player.ammo = 7; w.requestReload(); assert.ok(w.player.reload > 0);
  w.switchWeapon('rifle'); assert.equal(w.player.ammo, 23); assert.equal(w.player.reload, 0);
  w.switchWeapon('pistol'); assert.equal(w.player.ammo, 7); assert.equal(w.acquireWeapon('rifle'), false);
});
test('救援后真实跟随，不重复触发技能，医护治疗与教官换弹加成有效', () => {
  const w = world(); at(w, w.survivors[0]); w.interact();
  const engineer = w.survivors[0]; at(w, { x: 1210, y: 850 }); const before = distance(engineer, w.player);
  step(w, 0.3); assert.ok(distance(engineer, w.player) < before); assert.equal(engineer.state, 'following');
  w.player.health = 50; at(w, w.survivors[1]); w.interact(); assert.equal(w.player.health, 70);
  w.interact(); assert.equal(w.player.health, 70);
  at(w, w.survivors[2]); w.interact(); w.player.ammo = 5; w.requestReload();
  assert.ok(Math.abs(w.player.reload - 1.15 * 0.8) < 1e-9);
});
test('急救包仅在受伤时消耗，治疗封顶且释放负重', () => {
  const w = world(); w.inventory.medkits = 2;
  assert.equal(w.useMedkit().ok, false); assert.equal(w.inventory.medkits, 2);
  w.player.health = 80; assert.equal(w.useMedkit().ok, true); assert.equal(w.player.health, 100); assert.equal(w.inventory.medkits, 1);
});
test('提前回营只结算一次，工程师随队才能带回，返营后冻结模拟与操作', () => {
  const w = world(); at(w, w.caches[0]); w.interact(); at(w, w.survivors[0]); w.interact();
  at(w, CAMP); assert.equal(w.interact().ok, false); assert.equal(w.status, 'playing');
  step(w, 2); assert.ok(distance(w.survivors[0], w.player) < 150);
  assert.equal(w.interact().ok, true); assert.equal(w.status, 'complete'); assert.equal(w.campaign.depot.materials, 12);
  assert.deepEqual(w.campaign.survivors, ['engineer']); assert.equal(w.summary?.reason, 'return');
  const before = w.snapshot(); w.interact(); w.useMedkit(); w.switchWeapon('rifle'); step(w, 3);
  assert.deepEqual(w.snapshot(), before);
});
test('90 秒自动黄昏结算；未汇合的 NPC 不计入营救，死亡丢失本轮收获', () => {
  const w = world(); at(w, w.caches[1]); w.interact(); at(w, w.survivors[0]); w.interact();
  at(w, CAMP); step(w, 90);
  assert.equal(w.status, 'complete'); assert.equal(w.summary?.reason, 'sunset'); assert.equal(w.elapsed, 90); assert.equal(w.summary?.duration, 90); assert.equal(w.campaign.expeditions, 1);
  const distant = world(); at(distant, distant.survivors[0]); distant.interact(); at(distant, { x: 600, y: 600 });
  distant.elapsed = 89.99; distant.step(idle); assert.deepEqual(distant.summary?.rescued, []);
  const dead = world(); at(dead, dead.caches[0]); dead.interact(); dead.status = 'defeat'; dead.step(idle); dead.interact();
  assert.equal(dead.summary, null); assert.equal(dead.campaign.depot.materials, 0);
});
test('独立 v2 存档验证、损坏回退、禁用存储、深拷贝与旧版数据隔离', () => {
  const c = newCampaign(); c.depot.materials = 8;
  const storage = new Map<string, string>([['last-light.save.v1', 'legacy-sentinel']]);
  const api = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => { storage.set(k, v); } };
  assert.equal(saveCampaign(api, c), true); assert.equal(loadCampaign(api).campaign.depot.materials, 8);
  assert.equal(storage.get('last-light.save.v1'), 'legacy-sentinel');
  const w = new ExpeditionWorld(c, false); w.campaign.depot.materials = 12; assert.equal(c.depot.materials, 8);
  for (const raw of ['bad-json', '{"version":1}', JSON.stringify({ ...c, depot: { ...c.depot, energy: -1 } }), JSON.stringify({ ...c, survivors: ['unknown'] }), JSON.stringify({ ...c, lastSummary: {} })]) {
    storage.set(SAVE_KEY, raw); assert.ok(loadCampaign(api).warning); assert.equal(loadCampaign(api).campaign.expeditions, 0); assert.equal(storage.get(SAVE_KEY), raw);
  }
  assert.deepEqual(decodeCampaign(null), newCampaign());
  assert.equal(saveCampaign({ setItem: () => { throw Error('quota'); } }, c), false);
  assert.ok(loadCampaign({ getItem: () => { throw Error('denied'); } }).warning);
});
