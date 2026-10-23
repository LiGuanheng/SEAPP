import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE as B } from '../src/config/balance.ts';
import { CombatWorld } from '../src/core/world.ts';
import { canOccupy, distance, segmentCircle, segmentRect } from '../src/core/geometry.ts';
import type { CombatEvent, InputState, Vec, Zombie } from '../src/core/types.ts';

const idle = (aim: Vec = { x: 500, y: 224 }): InputState => ({ moveX: 0, moveY: 0, aim, firing: false, sprinting: false });
const smallWorld = () => new CombatWorld(42, [], 640, 480, { x: 120, y: 240 }, false);
function addEnemy(world: CombatWorld, x: number, y: number, id = 100): Zombie {
  const zombie: Zombie = { id, x, y, health: B.zombie.health, aim: 0, moving: false, attackCooldown: 0, hurt: 0, knockX: 0, knockY: 0, skin: 0 };
  world.zombies.push(zombie); return zombie;
}
function run(world: CombatWorld, seconds: number, input: InputState): CombatEvent[] {
  const events: CombatEvent[] = [];
  for (let i = 0; i < Math.round(seconds / B.step); i++) { world.step(input); events.push(...world.events); }
  return events;
}

test('归一斜向移动，松开后停下；边界和墙体阻挡且能贴墙滑动', () => {
  const straight = smallWorld(), diagonal = smallWorld();
  run(straight, 1, { ...idle(), moveX: 1 }); run(diagonal, 1, { ...idle(), moveX: 1, moveY: -1 });
  assert.ok(Math.abs(distance(straight.player, { x: 120, y: 240 }) - distance(diagonal.player, { x: 120, y: 240 })) < 1e-8);
  const x = straight.player.x; run(straight, 0.5, idle()); assert.equal(straight.player.x, x);
  const w = new CombatWorld(1, [{ x: 200, y: 0, width: 30, height: 480 }], 640, 480, { x: 170, y: 240 }, false);
  run(w, 1, { ...idle(), moveX: 1, moveY: -1 });
  assert.ok(w.player.x <= 190); assert.ok(w.player.y < 200);
  run(w, 3, { ...idle(), moveY: -1 }); assert.ok(w.player.y >= B.player.radius);
});

test('冲刺确实加速且体力始终有界，松开会恢复', () => {
  const walk = smallWorld(), sprint = smallWorld();
  run(walk, 1, { ...idle(), moveX: 1 }); run(sprint, 1, { ...idle(), moveX: 1, sprinting: true });
  assert.ok(sprint.player.x > walk.player.x + 50);
  assert.ok(sprint.player.stamina < walk.player.stamina);
  run(sprint, 4, { ...idle(), moveX: -1, sprinting: true });
  assert.ok(sprint.player.stamina >= 0 && sprint.player.stamina <= 100);
  const before = sprint.player.stamina; run(sprint, 1, idle()); assert.ok(sprint.player.stamina > before);
});

test('体力耗尽后不会在每帧恢复/冲刺之间抖动，恢复到阈值再加速', () => {
  const world = smallWorld(); world.player.stamina = 0.5;
  for (let i = 0; i < 45; i++) {
    world.step({ ...idle(), moveX: 1, sprinting: true });
    assert.equal(world.player.sprinting, false);
  }
  run(world, 0.5, { ...idle(), moveX: -1, sprinting: true });
  assert.ok(world.player.stamina >= 0);
  run(world, 1, idle());
  world.step({ ...idle(), moveX: 1, sprinting: true });
  assert.equal(world.player.sprinting, true);
});

test('感染者聚集后仍有独立身体间距，不会全部叠成一个精灵', () => {
  const world = smallWorld(); const a = addEnemy(world, 300, 240, 100), b = addEnemy(world, 300, 240, 101);
  run(world, 0.5, idle());
  assert.ok(distance(a, b) >= 18, `感染者间距 ${distance(a, b)}`);
});

test('连续线段检测高速弹穿过目标，起点在目标内也命中', () => {
  assert.equal(segmentRect({ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 100, y: -10, width: 2, height: 20 }), 0.1);
  assert.ok(Math.abs(segmentCircle({ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 500, y: 0 }, 10)! - 0.49) < 1e-8);
  assert.equal(segmentCircle({ x: 500, y: 0 }, { x: 510, y: 0 }, { x: 500, y: 0 }, 10), 0);
  assert.equal(segmentCircle({ x: 0, y: 100 }, { x: 1000, y: 100 }, { x: 500, y: 0 }, 10), null);
});

test('真实射击能命中与击杀，事件只计一次，子弹受射速约束', () => {
  const world = smallWorld(); addEnemy(world, 350, 240);
  const events = run(world, 1.2, { ...idle({ x: 350, y: 224 }), firing: true });
  assert.equal(world.kills, 1); assert.equal(events.filter(e => e.type === 'kill').length, 1);
  assert.ok(events.some(e => e.type === 'shot')); assert.ok(events.some(e => e.type === 'hit'));
  assert.ok(world.player.shots <= Math.ceil(1.2 / B.weapon.interval) + 1);
  assert.ok(world.player.ammo >= 0);
});

test('子弹先撞墙不能杀墙后敌人；枪口伸入墙内也不能穿出', () => {
  for (const x of [120, 189]) {
    const world = new CombatWorld(1, [{ x: 200, y: 0, width: 12, height: 480 }], 640, 480, { x, y: 240 }, false);
    const enemy = addEnemy(world, 270, 240);
    const events = run(world, 0.8, { ...idle({ x: 300, y: 224 }), firing: true });
    assert.equal(enemy.health, B.zombie.health); assert.equal(world.kills, 0);
    assert.ok(events.some(e => e.type === 'impact'));
  }
});

test('共线敌人只命中最近者，同一发子弹不会重复奖励', () => {
  const world = smallWorld(); const near = addEnemy(world, 230, 240), far = addEnemy(world, 310, 240, 101);
  world.step({ ...idle(), firing: true }); run(world, 0.12, idle());
  assert.equal(near.health, B.zombie.health - B.weapon.damage); assert.equal(far.health, B.zombie.health);
});

test('满弹不可换弹；主动和空匣换弹完成后弹药恢复，扣弹不为负', () => {
  const world = smallWorld(); assert.equal(world.requestReload(), false);
  run(world, 0.1, { ...idle(), firing: true }); assert.equal(world.player.ammo, 17);
  assert.equal(world.requestReload(), true); assert.equal(world.requestReload(), false);
  const shots = world.player.shots;
  run(world, 0.5, { ...idle(), firing: true }); assert.equal(world.player.shots, shots);
  run(world, 0.7, idle()); assert.equal(world.player.ammo, B.weapon.magazine);
  run(world, 3, { ...idle(), firing: true }); assert.ok(world.player.reload > 0);
  assert.equal(world.player.ammo, 0);
  run(world, 1.2, idle()); assert.equal(world.player.ammo, B.weapon.magazine);
});

test('丧尸绕过建筑而非穿墙，最终能够接近玩家', () => {
  const wall = { x: 192, y: 64, width: 64, height: 224 };
  const world = new CombatWorld(2, [wall], 640, 448, { x: 410, y: 150 }, false);
  const zombie = addEnemy(world, 95, 150);
  let detoured = false;
  for (let i = 0; i < 12 * 60 && world.status === 'playing'; i++) {
    world.step(idle());
    assert.equal(canOccupy(zombie, B.zombie.radius, [wall], 640, 448), true);
    if (zombie.y < 54 || zombie.y > 299) detoured = true;
  }
  assert.ok(detoured); assert.ok(distance(zombie, world.player) < 45, `最终距离 ${distance(zombie, world.player)}`);
});

test('近战受攻击间隔与无敌限制，死亡后状态冻结，重建新局无残留', () => {
  const world = smallWorld(); addEnemy(world, 139, 240); addEnemy(world, 140, 240, 101);
  run(world, 0.3, idle()); assert.equal(world.player.health, 86);
  run(world, 0.7, idle()); assert.equal(world.player.health, 72);
  run(world, 15, idle()); assert.equal(world.status, 'defeat'); assert.equal(world.player.health, 0);
  const ended = world.snapshot(); run(world, 5, { ...idle(), firing: true, moveX: 1 }); assert.deepEqual(world.snapshot(), ended);
  assert.equal(world.requestReload(), false);
  const fresh = smallWorld(); assert.equal(fresh.player.health, 100); assert.equal(fresh.kills, 0); assert.equal(fresh.bullets.length, 0);
});

test('固定输入与种子可重现；生成安全、实体有界，十分钟模拟多次新局无异常', () => {
  const a = new CombatWorld(11), b = new CombatWorld(11);
  for (let i = 0; i < 600; i++) { const input = { ...idle(), moveX: Math.sin(i / 100), moveY: Math.cos(i / 100), firing: i % 3 === 0 }; a.step(input); b.step(input); }
  assert.deepEqual(a.snapshot(), b.snapshot());
  let world = new CombatWorld(42), restarts = 0;
  for (let i = 0; i < 600 * 60; i++) {
    if (world.status === 'defeat') { world = new CombatWorld(42 + ++restarts); }
    const nearest = world.zombies.slice().sort((a, b) => distance(a, world.player) - distance(b, world.player))[0];
    world.step({ ...idle(nearest ? { x: nearest.x, y: nearest.y - 16 } : { x: 1500, y: 700 }), moveX: Math.sin(i / 120), moveY: Math.cos(i / 120), firing: true });
    assert.ok(world.bullets.length <= B.maxBullets); assert.ok(world.zombies.length <= B.zombie.maxAlive);
    assert.ok(Number.isFinite(world.player.x) && Number.isFinite(world.player.y)); assert.ok(world.player.ammo >= 0);
    assert.ok(world.events.length < 300);
  }
});
