import test from 'node:test';
import assert from 'node:assert/strict';
import { Navigation } from '../src/core/navigation.ts';
import { canOccupy, distance, moveWithCollision } from '../src/core/geometry.ts';
import { NightWorld } from '../src/core/night-world.ts';
import { newCampaign } from '../src/core/campaign.ts';
import { DIFFICULTIES, nightDifficulty } from '../src/config/difficulty.ts';
import { CombatWorld } from '../src/core/world.ts';

test('空地直接接近目标，等步数绕路不提前斜走', () => {
  const nav = new Navigation(512, 512, 32, [], 11); nav.rebuild({ x: 336, y: 240 });
  assert.deepEqual(nav.direction({ x: 80, y: 240 }, { x: 336, y: 240 }), { x: 1, y: 0 });
  const wall = new Navigation(512, 512, 32, [{ x: 256, y: 192, width: 64, height: 96 }], 11);
  wall.rebuild({ x: 400, y: 240 });
  // 原遍历顺序会在离墙很远时先斜向上方；等价路线应先直走接近障碍。
  for (const p of [{ x: 80, y: 240 }, { x: 80, y: 208 }, { x: 112, y: 240 }]) {
    assert.deepEqual(wall.direction(p, { x: 400, y: 240 }), { x: 1, y: 0 });
  }
});

test('绕过长墙选择较短一侧，不穿墙、不在墙角往返，抵达后停止', () => {
  for (const mirrored of [false, true]) {
    const obstacles = [{ x: 192, y: mirrored ? 192 : 64, width: 64, height: 256 }];
    const p = { x: 80, y: 160 }, goal = { x: 400, y: 160 };
    const nav = new Navigation(512, 512, 32, obstacles, 11); nav.rebuild(goal);
    let traveled = 0, minY = p.y, maxY = p.y;
    for (let i = 0; i < 600 && distance(p, goal) > 3; i++) {
      const before = { ...p }, d = nav.direction(p, goal);
      moveWithCollision(p, d.x * 2, d.y * 2, 11, obstacles, 512, 512);
      traveled += distance(p, before); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      assert.ok(canOccupy(p, 11, obstacles, 512, 512));
    }
    assert.ok(distance(p, goal) <= 3); assert.ok(traveled < 550);
    if (!mirrored) assert.ok(minY < 53 && maxY <= 162, '上端更近，不应先走向下端');
    else assert.ok(maxY <= 162, '通路畅通时不应无故向下斜走');
  }
});

test('封闭地图与不可达目标安全停止，斜向不能穿过墙角', () => {
  const closed = new Navigation(128, 128, 32, [{ x: 0, y: 0, width: 128, height: 128 }], 11);
  closed.rebuild({ x: 64, y: 64 }); assert.deepEqual(closed.direction({ x: 32, y: 32 }, { x: 64, y: 64 }), { x: 0, y: 0 });
  const nav = new Navigation(320, 320, 32, [{ x: 144, y: 0, width: 32, height: 320 }], 11);
  nav.rebuild({ x: 240, y: 160 }); assert.deepEqual(nav.direction({ x: 80, y: 160 }, { x: 240, y: 160 }), { x: 0, y: 0 });
  const corner = new Navigation(96, 96, 32, [{ x: 32, y: 0, width: 32, height: 32 }, { x: 0, y: 32, width: 32, height: 32 }], 3);
  corner.rebuild({ x: 48, y: 48 }); assert.deepEqual(corner.direction({ x: 16, y: 16 }, { x: 48, y: 48 }), { x: 0, y: 0 });
});

test('夜战敌人贴着固定障碍滑动时，动画朝向实际移动方向', () => {
  const w = new NightWorld(newCampaign()); for (const f of w.fighters.values()) f.health = 0;
  const e = { id: 9000, kind: 'walker' as const, x: 149, y: 180, health: 999, aim: 0, moving: false, cooldown: 999, hurt: 0 };
  w.enemies.push(e);
  const nav = (w as unknown as { enemyNavigation: Navigation }).enemyNavigation;
  nav.direction = () => ({ x: Math.SQRT1_2, y: Math.SQRT1_2 });
  w.step(); assert.equal(e.x, 149); assert.ok(e.y > 180);
  assert.ok(e.moving); assert.ok(Math.abs(e.aim - Math.PI / 2) < 1e-6);
  nav.direction = () => ({ x: 1, y: 0 }); w.step(); assert.equal(e.moving, false);
});

test('敌人碰撞滑动时朝向实际位移，完全受阻时不原地播放行走', () => {
  const w = new CombatWorld(1, [{ x: 160, y: 64, width: 32, height: 256 }], 512, 512, { x: 400, y: 400 }, false);
  const z = { id: 999, x: 149, y: 128, health: 999, aim: 0, moving: false, attackCooldown: 0, hurt: 0, knockX: 0, knockY: 0, skin: 0 };
  w.zombies.push(z);
  // 模拟拥挤将单位挤至墙边，而规划方向仍为斜向的边界情况。
  w.navigation.direction = () => ({ x: Math.SQRT1_2, y: Math.SQRT1_2 });
  const input = { moveX: 0, moveY: 0, aim: { x: 400, y: 400 }, firing: false, sprinting: false };
  w.step(input); assert.equal(z.x, 149); assert.ok(z.y > 128);
  assert.ok(z.moving); assert.ok(Math.abs(z.aim - Math.PI / 2) < 1e-6);
  w.navigation.direction = () => ({ x: 1, y: 0 }); w.step(input);
  assert.equal(z.moving, false);
});

test('三档只小幅增加数量，困难前两夜仍逐步提升，不增加生命/伤害/速度', () => {
  const old = { easy: 0.75, normal: 1, hard: 1.25 };
  for (const d of ['easy', 'normal', 'hard'] as const) {
    assert.ok(DIFFICULTIES[d].count > old[d] && DIFFICULTIES[d].count <= old[d] * 1.031);
  }
  assert.deepEqual(['easy', 'normal', 'hard'].map(d => DIFFICULTIES[d as keyof typeof DIFFICULTIES].health), [0.75, 1, 1.2]);
  assert.deepEqual(['easy', 'normal', 'hard'].map(d => DIFFICULTIES[d as keyof typeof DIFFICULTIES].damage), [0.85, 1, 1.1]);
  assert.deepEqual(['easy', 'normal', 'hard'].map(d => DIFFICULTIES[d as keyof typeof DIFFICULTIES].speed), [0.95, 1, 1.04]);
  assert.ok(nightDifficulty('hard', 1).count < nightDifficulty('hard', 2).count);
  assert.ok(nightDifficulty('hard', 2).count < nightDifficulty('hard', 3).count);
});
