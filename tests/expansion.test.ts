import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILDINGS, roomDoor, roomWalls } from '../src/config/map.ts';
import { BUILDINGS as DEFENSES, validBasePlan } from '../src/config/base.ts';
import { ExpeditionWorld, CAMP } from '../src/core/expedition.ts';
import { CombatWorld } from '../src/core/world.ts';
import { BaseWorld } from '../src/core/base-world.ts';
import { NightWorld, type NightEnemy } from '../src/core/night-world.ts';
import { decodeCampaign, newCampaign } from '../src/core/campaign.ts';
import { canOccupy, distance, firstWall } from '../src/core/geometry.ts';
import type { InputState, Zombie } from '../src/core/types.ts';

const idle: InputState = { moveX: 0, moveY: 0, firing: false, sprinting: false, aim: { x: 1256, y: 376 } };
const zombie = (id: number, x: number, y: number): Zombie => ({ id, x, y, health: 64, aim: 0, moving: false, attackCooldown: 0, hurt: 0, knockX: 0, knockY: 0, skin: 0 });
function rich() { const c = newCampaign(); c.depot = { materials: 100, energy: 20, medkits: 0 }; return c; }
function enemy(w: NightWorld, x: number, y: number): NightEnemy { const e: NightEnemy = { id: 1000 + w.enemies.length, x, y, health: 60, kind: 'walker', aim: 0, moving: false, cooldown: 0, hurt: 0 }; w.enemies.push(e); return e; }

test('六处房间门洞真实可通过，侧墙阻挡，室内奖励和人物可从外部到达', () => {
  const w = new ExpeditionWorld(newCampaign(), false); w.navigation.rebuild(CAMP);
  for (const b of w.layout.buildings) {
    const door = roomDoor(b); assert.ok(canOccupy(door, 10, w.obstacles, w.width, w.height));
    assert.equal(firstWall({ x: door.x, y: door.y + 32 }, { x: door.x, y: door.y - 48 }, roomWalls(b)), null);
    assert.notEqual(firstWall({ x: b.x * 32 - 20, y: b.y * 32 + 144 }, { x: b.x * 32 + 80, y: b.y * 32 + 144 }, w.obstacles), null);
  }
  for (const p of [...w.caches, ...w.survivors]) { assert.ok(canOccupy(p, 10, w.obstacles, w.width, w.height)); assert.ok(w.navigation.field[Math.floor(p.y / 32) * w.navigation.cols + Math.floor(p.x / 32)] >= 0, JSON.stringify(p)); }
});

test('首次进入室内生成守卫且不重复刷，奖励与猎弓只发一次', () => {
  const w = new ExpeditionWorld(); Object.assign(w.player, { x: 1072, y: 464 }); w.step(idle);
  assert.equal(w.currentRoom, 1); assert.equal(w.exploredRooms.size, 1); const ids = w.zombies.map(e => e.id); assert.ok(ids.length > 3);
  Object.assign(w.player, { x: 1072, y: 544 }); w.step(idle); Object.assign(w.player, { x: 1072, y: 464 }); w.step(idle);
  assert.deepEqual(w.zombies.map(e => e.id), ids);
  const chest = w.caches.find(c => c.id === 'room-1')!; Object.assign(w.player, chest); assert.equal(w.interact().ok, true); assert.equal(w.weaponId, 'bow');
  const before = { ...w.inventory }; w.interact(); assert.deepEqual(w.inventory, before); assert.ok(w.ownedWeapons.includes('bow'));
});

test('消防斧只伤正面近距离敌人，隔墙无效，冷却限制且不耗弹药', () => {
  const w = new CombatWorld(1, [], 500, 400, { x: 200, y: 200 }, false); w.switchWeapon('axe'); w.player.shotCooldown = 0;
  const front = zombie(1, 246, 200), rear = zombie(2, 154, 200), far = zombie(3, 310, 200); w.zombies = [front, rear, far];
  w.step({ ...idle, firing: true }); assert.equal(front.health, 16); assert.equal(rear.health, 64); assert.equal(far.health, 64); assert.equal(w.bullets.length, 0); assert.equal(w.requestReload(), false);
  const attacks = w.player.shots; for (let i = 0; i < 10; i++) w.step({ ...idle, firing: true }); assert.equal(w.player.shots, attacks);
  const blocked = new CombatWorld(1, [{ x: 223, y: 150, width: 8, height: 90 }], 500, 400, { x: 200, y: 200 }, false); blocked.switchWeapon('axe'); blocked.player.shotCooldown = 0; const z = zombie(1, 250, 200); blocked.zombies = [z]; blocked.step({ ...idle, firing: true }); assert.equal(z.health, 64);
});

test('近战和弓手救援后协助战斗，返营解锁不同兵种；旧档仍兼容', () => {
  const c = rich(); c.survivors = ['ranger', 'brawler']; const base = new BaseWorld(c); assert.equal(base.plan.soldiers.length, 5);
  const later = structuredClone(base.campaign); later.survivors.push('captain'); const recruited = new BaseWorld(later); assert.equal(recruited.plan.soldiers.length, 6); assert.equal(validBasePlan(recruited.plan), true);
  assert.deepEqual(new BaseWorld(decodeCampaign(JSON.stringify(recruited.campaign))).plan, recruited.plan);
  const occupied = new BaseWorld(rich()); assert.equal(occupied.build('arrowtower', { x: 864, y: 608 }).ok, true); occupied.campaign.survivors.push('captain');
  assert.equal(validBasePlan(new BaseWorld(occupied.campaign).plan), true);
  const w = new ExpeditionWorld(newCampaign(), false), s = w.survivors.find(s => s.id === 'ranger')!; Object.assign(s, { x: 1000, y: 720, state: 'following' }); const z = zombie(999, 1160, 720); w.zombies = [z];
  let arrows = 0; for (let i = 0; i < 45; i++) { w.step(idle); arrows += w.events.filter(e => e.type === 'ally-shot').length; } assert.ok(arrows > 0); assert.ok(z.health < 64);
  const melee = w.survivors.find(s => s.id === 'brawler')!; Object.assign(melee, { x: w.player.x + 40, y: w.player.y, state: 'following' }); w.zombies = [zombie(998, melee.x + 30, melee.y)]; w.step(idle); assert.ok(w.events.some(e => e.type === 'swing'));
});

test('夜战先锋真实挥斧且有冷却，不能隔着城墙近战伤敌', () => {
  const b = new BaseWorld(rich()); b.campaign.survivors.push('brawler'); const w = new NightWorld(b.campaign);
  const s = w.plan.soldiers.find(s => s.role === 'vanguard')!; Object.assign(s, { x: 1156, y: 816 });
  for (const [id, f] of w.fighters) if (id !== s.id) f.health = 0;
  const z = enemy(w, 1206, 816); w.step(); assert.equal(z.health, 18); assert.ok(w.events.some(e => e.type === 'swing'));
  w.step(); assert.equal(z.health, 18);
  const fort = new BaseWorld(rich()); fort.campaign.survivors.push('brawler'); assert.equal(fort.build('wall', { x: 1184, y: 800 }).ok, true);
  const blocked = new NightWorld(fort.campaign), guard = blocked.plan.soldiers.find(s => s.role === 'vanguard')!; Object.assign(guard, { x: 1172, y: 816 });
  for (const [id, f] of blocked.fighters) if (id !== guard.id) f.health = 0;
  const behind = enemy(blocked, 1228, 816); blocked.step(); assert.equal(behind.health, 60);
});

test('低价城墙可建设超过十四段，工程师不使其免费，真实敌人可以破墙', () => {
  const c = rich(); c.survivors = ['engineer']; const b = new BaseWorld(c); assert.equal(b.cost('wall').materials, 1);
  for (let i = 0; i < 16; i++) assert.equal(b.build('wall', { x: 576 + i % 10 * 32, y: 448 + Math.floor(i / 10) * 32 }).ok, true);
  assert.equal(b.plan.buildings.length, 16); assert.ok(validBasePlan(b.plan));
  const w = new NightWorld(b.campaign); for (const f of w.fighters.values()) f.health = 0;
  const wall = w.plan.buildings[0]; enemy(w, wall.x + 16, wall.y - 12); for (let i = 0; i < 12 * 60 && w.plan.buildings.includes(wall); i++) w.step();
  assert.ok(!w.plan.buildings.includes(wall)); assert.ok(DEFENSES.wall.health < DEFENSES.barricade.health);
});

test('加农炮真实弹体范围杀伤，箭塔单体高射程，两者保存与读档有效', () => {
  for (const kind of ['cannon', 'arrowtower'] as const) {
    const b = new BaseWorld(rich()); assert.equal(b.build(kind, { x: 1088, y: 544 }).ok, true); assert.ok(decodeCampaign(JSON.stringify(b.campaign)));
    const w = new NightWorld(b.campaign); for (const f of w.fighters.values()) f.health = 0;
    const a = enemy(w, 1116, 482), nearby = enemy(w, 1149, 485); assert.ok(distance(a, nearby) < 62);
    let shots = 0, explosions = 0;
    for (let i = 0; i < 45; i++) { w.step(); shots += w.events.filter(e => e.type === 'fire').length; explosions += w.events.filter(e => e.type === 'explosion').length; }
    assert.ok(shots > 0);
    if (kind === 'cannon') { assert.equal(a.health, 0); assert.equal(nearby.health, 0); assert.ok(explosions > 0); }
    else { assert.ok(a.health < 60 || nearby.health < 60); assert.equal(explosions, 0); assert.ok(a.health === 60 || nearby.health === 60); }
  }
});
