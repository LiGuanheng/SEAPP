import test from 'node:test';
import assert from 'node:assert/strict';
import { BASE_HEIGHT, BASE_WIDTH, buildingRect, validBasePlan } from '../src/config/base.ts';
import { BaseWorld } from '../src/core/base-world.ts';
import { decodeCampaign, newCampaign } from '../src/core/campaign.ts';
import { canOccupy, distance } from '../src/core/geometry.ts';

function world(engineer = false, captain = false) {
  const c = newCampaign(); c.depot = { materials: 100, energy: 30, medkits: 0 };
  if (engineer) c.survivors.push('engineer'); if (captain) c.survivors.push('captain');
  return new BaseWorld(c);
}
function run(w: BaseWorld, seconds: number) { for (let i = 0; i < seconds * 60; i++) w.step(); }

test('基地接收真实库存与职业，独立克隆，不凭空生成建设资源', () => {
  const c = newCampaign(), w = new BaseWorld(c);
  assert.equal(w.plan.soldiers.length, 3); assert.equal(w.build('turret', { x: 1216, y: 544 }).ok, false);
  assert.equal(c.base, null); assert.equal(w.campaign.depot.materials, 0);
  const improved = world(true, true); assert.equal(improved.plan.soldiers.length, 4);
  assert.deepEqual(improved.cost('turret'), { materials: 5, energy: 2 }); assert.equal(improved.cost('barricade').materials, 2);
});
test('有效建造原子扣费；重叠/越界/通道/脚下/目的地/非网格与超预算均拒绝', () => {
  const w = world(); assert.equal(w.build('turret', { x: 1216, y: 544 }).ok, true);
  assert.equal(w.campaign.depot.materials, 94); assert.equal(w.campaign.depot.energy, 28);
  for (const p of [{ x: 1216, y: 544 }, { x: 160, y: 160 }, { x: 1024, y: 544 }, { x: 1216, y: 704 }, { x: 944, y: 816 }, { x: NaN, y: 544 }, { x: 1217, y: 544 }]) {
    const before = w.snapshot(); assert.equal(w.build('turret', p).ok, false, JSON.stringify(p)); assert.deepEqual(w.snapshot(), before);
  }
  assert.equal(w.move([1], { x: 1264, y: 880 }).ok, true);
  assert.equal(w.build('barricade', { x: 1248, y: 864 }).ok, false);
  w.campaign.depot.energy = 0; assert.equal(w.build('turret', { x: 1312, y: 544 }).ok, false);
});
test('旋转沙袋改变实体占地；拆除按实际支付的一半返还建材且不返电力', () => {
  const w = world(true); assert.equal(w.build('barricade', { x: 1216, y: 544 }, 1).ok, true);
  assert.deepEqual(buildingRect(w.plan.buildings[0]), { x: 1216, y: 544, width: 32, height: 64 });
  assert.equal(w.campaign.depot.materials, 98); w.demolish(w.plan.buildings[0].id); assert.equal(w.campaign.depot.materials, 99);
  w.build('turret', { x: 1216, y: 544 }); const id = w.plan.buildings[0].id;
  assert.equal(w.demolish(id).ok, true); assert.equal(w.campaign.depot.energy, 28);
  const before = w.snapshot(); assert.equal(w.demolish(id).ok, false); assert.deepEqual(w.snapshot(), before);
});
test('最后一段墙会围困士兵时拒绝施工，不扣费，不改变已有阵地', () => {
  const w = world(); Object.assign(w.plan.soldiers[0], { x: 752, y: 528 });
  assert.equal(w.build('barricade', { x: 704, y: 480 }).ok, true);
  assert.equal(w.build('barricade', { x: 704, y: 544 }).ok, true);
  assert.equal(w.build('barricade', { x: 672, y: 512 }, 1).ok, true);
  const before = w.snapshot(), result = w.build('barricade', { x: 768, y: 512 }, 1);
  assert.equal(result.ok, false); assert.match(result.message, /困住/); assert.deepEqual(w.snapshot(), before);
});
test('多选移动分配独立队形，真实绕过设施，不穿墙且最终就位驻守', () => {
  const w = world(); w.build('barricade', { x: 1152, y: 832 }, 1);
  const before = w.plan.soldiers.map(s => ({ ...s }));
  assert.equal(w.move([1, 2, 3], { x: 1296, y: 816 }).ok, true);
  const destinations = w.plan.soldiers.map(s => s.destination!); assert.equal(new Set(destinations.map(p => `${p.x},${p.y}`)).size, 3);
  for (let i = 0; i < 10 * 60; i++) {
    w.step(); for (const s of w.plan.soldiers) assert.ok(canOccupy(s, 11, w.obstacles, BASE_WIDTH, BASE_HEIGHT));
  }
  for (let i = 0; i < 3; i++) { assert.ok(distance(w.plan.soldiers[i], destinations[i]) < 6); assert.equal(w.plan.soldiers[i].stance, 'hold'); assert.ok(distance(w.plan.soldiers[i], before[i]) > 100); }
});
test('无选择或不可通行目标拒绝；驻守立即取消目的地并停止移动', () => {
  const w = world(); assert.equal(w.move([], { x: 1256, y: 892 }).ok, false);
  assert.equal(w.move([1], { x: 1024, y: 704 }).ok, false);
  assert.equal(w.move([1], { x: Infinity, y: 704 }).ok, false);
  w.move([1], { x: 1356, y: 892 }); run(w, 0.5); w.hold([1]); const pos = { x: w.plan.soldiers[0].x, y: w.plan.soldiers[0].y };
  run(w, 1); assert.equal(distance(w.plan.soldiers[0], pos), 0); assert.equal(w.plan.soldiers[0].destination, null);
});
test('不限时布防，只有手动完成才冻结，继续调整保留累计时间与阵地', () => {
  const w = world(); w.build('turret', { x: 1216, y: 544 }); w.move([1], { x: 1312, y: 892 }); run(w, 30);
  assert.equal(w.remaining, 0); assert.ok(w.plan.elapsed > 29.9); assert.equal(w.plan.status, 'preparing'); w.finish();
  const before = w.snapshot(); run(w, 5); w.build('barricade', { x: 1312, y: 544 }); w.move([1], { x: 1256, y: 892 }); w.hold([1]); w.demolish(1);
  assert.deepEqual(w.snapshot(), before);
  w.resume(); assert.ok(w.plan.elapsed > 29.9); assert.equal(w.plan.buildings.length, 1); assert.equal(w.campaign.depot.materials, 94);
  w.finish(); assert.equal(w.plan.status, 'ready');
});
test('旧 v2 存档无基地字段可迁移，布局与资源同一 JSON 往返；非法布局拒绝', () => {
  const c = newCampaign(); const { base: _base, ...old } = c;
  assert.equal(decodeCampaign(JSON.stringify(old)).base, null);
  const w = world(true, true); w.build('turret', { x: 1216, y: 544 }); w.move([1, 2], { x: 1312, y: 892 }); run(w, 1);
  const restored = new BaseWorld(decodeCampaign(JSON.stringify(w.campaign)));
  assert.deepEqual(restored.snapshot(), w.snapshot()); assert.equal(validBasePlan(restored.plan), true);
  for (const mutate of [
    (p: any) => { p.buildings[0].paid.materials = 999; },
    (p: any) => { p.buildings[0].x = -32; },
    (p: any) => { p.soldiers[0].x = 1024; p.soldiers[0].y = 704; },
    (p: any) => { p.soldiers[1].id = p.soldiers[0].id; },
    (p: any) => { p.elapsed = -1; },
  ]) { const bad = structuredClone(w.campaign); mutate(bad.base); assert.throws(() => decodeCampaign(JSON.stringify(bad))); }
});
