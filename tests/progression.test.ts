import test from 'node:test';
import assert from 'node:assert/strict';
import { BaseWorld } from '../src/core/base-world.ts';
import { NightWorld, type NightEnemy } from '../src/core/night-world.ts';
import { ExpeditionWorld, CAMP } from '../src/core/expedition.ts';
import { newCampaign, decodeCampaign, type Campaign } from '../src/core/campaign.ts';
import { BASE_WIDTH, BASE_HEIGHT, BUILDINGS, LIGHTHOUSE, GRID, validBasePlan } from '../src/config/base.ts';
import { Navigation } from '../src/core/navigation.ts';
import { INFECTED, MOB_KINDS, NIGHT_LIMITS, levelStats, wavesForStage, type InfectedKind } from '../src/config/night.ts';
import { nextStage, STAGES, STAGE_COUNT, validStage, type StageId } from '../src/config/progression.ts';
import { CombatWorld } from '../src/core/world.ts';
import { assaultPlan } from '../src/core/assault.ts';
import { DIFFICULTIES, difficultyFrom } from '../src/config/difficulty.ts';
import { canOccupy, distance } from '../src/core/geometry.ts';

const run = (w: NightWorld, seconds: number) => { for (let i = 0; i < Math.ceil(seconds * 60) && w.commanding; i++) w.step(); };
function campaign(stage: StageId = 3): Campaign { return { ...newCampaign(), clearedStage: stage - 1, depot: { materials: 200, energy: 100, medkits: 0 } }; }
function quiet(stage: StageId = 3) { const w = new NightWorld(campaign(stage)); for (const f of w.fighters.values()) f.health = 0; return w; }
function enemy(w: NightWorld, kind: InfectedKind, x = 1216, y = 832) {
  const stats = levelStats(kind, 1, w.stage);
  const e: NightEnemy = { id: 10000 + w.enemies.length, kind, x, y, health: stats.health, maxHealth: stats.health, level: 1, aim: 0, moving: false, cooldown: 999, hurt: 0, skillCooldown: 999, summonCooldown: 999 };
  w.enemies.push(e); return e;
}

test('三阶段敌人数与基础强度递增，Boss逐步开放，最终波真正排队两位Boss', () => {
  const totals = ([1, 2, 3] as const).map(stage => wavesForStage(stage).reduce((n, w) => n + MOB_KINDS.reduce((m, k) => m + w[k], 0) + w.bosses.length, 0));
  assert.ok(totals[0] < totals[1] && totals[1] < totals[2]);
  assert.deepEqual(wavesForStage(1).flatMap(w => w.bosses), ['axeman']);
  assert.deepEqual(wavesForStage(2).flatMap(w => w.bosses), ['queen', 'blighter']);
  assert.deepEqual(wavesForStage(3)[4].bosses, ['queen', 'blighter']);
  const a = levelStats('walker', 5, 1), b = levelStats('walker', 5, 3); assert.ok(b.health > a.health && b.damage > a.damage && b.speed > a.speed);
  const w = quiet(); w.elapsed = 94; run(w, 0.4); assert.ok(w.bossesSeen.has('queen') && w.bossesSeen.has('blighter'));
});
test('完整战役扩展至五阶段，第三阶段继续成长，阶段与补给存档兼容', () => {
  assert.equal(STAGE_COUNT, 5); assert.equal(nextStage(2), 3); assert.equal(nextStage(3), 4); assert.equal(nextStage(4), 5); assert.equal(nextStage(5), 5);
  assert.equal(validStage(5), true); assert.equal(validStage(6), false);
  const ids = [1, 2, 3, 4, 5] as const;
  const bosses = ids.map(stage => wavesForStage(stage).reduce((n, w) => n + w.bosses.length, 0));
  assert.deepEqual(bosses, [1, 2, 5, 5, 6]);
  for (const stage of ids) {
    const c = campaign(stage); assert.equal(new BaseWorld(decodeCampaign(JSON.stringify(c))).stage, stage);
    if (stage > 1) { assert.ok(STAGES[stage].lightRadius > STAGES[(stage - 1) as StageId].lightRadius); assert.ok(STAGES[stage].area.width * STAGES[stage].area.height > STAGES[(stage - 1) as StageId].area.width * STAGES[(stage - 1) as StageId].area.height); }
  }
  const old = new BaseWorld(campaign(3)); old.build('flame', { x: 1856, y: 1216 }); old.finish();
  old.campaign.clearedStage = 3; const fourth = new BaseWorld(decodeCampaign(JSON.stringify(old.campaign))); fourth.resume();
  assert.equal(fourth.stage, 4); assert.equal(fourth.plan.buildings.length, 1); assert.ok(fourth.build('wall', { x: 1952, y: 1248 }).ok);
  fourth.campaign.clearedStage = 4; fourth.resume(); assert.equal(fourth.stage, 5); assert.ok(fourth.build('wall', { x: 2016, y: 1376 }).ok);
  assert.ok(validBasePlan(fourth.plan)); assert.equal(decodeCampaign(JSON.stringify({ ...fourth.campaign, clearedStage: 5 })).clearedStage, 5);
});
test('三种难度在白天与夜晚真实改变敌人生命和数量，普通旧数值不变', () => {
  assert.equal(difficultyFrom('easy'), 'easy'); assert.equal(difficultyFrom('hard'), 'hard'); assert.equal(difficultyFrom('unknown'), 'normal');
  const difficulties = ['easy', 'normal', 'hard'] as const;
  const days = difficulties.map(d => new CombatWorld(123, [], 2048, 1408, { x: 1024, y: 704 }, true, d));
  assert.ok(days[0].zombies.length < days[1].zombies.length && days[1].zombies.length < days[2].zombies.length);
  assert.deepEqual(days.map(w => w.zombies[0].health), difficulties.map(d => Math.round(64 * DIFFICULTIES[d].health)));
  const expeditions = difficulties.map(d => new ExpeditionWorld(campaign(4), true, 1000, d));
  assert.ok(expeditions[0].zombies.length < expeditions[1].zombies.length && expeditions[1].zombies.length < expeditions[2].zombies.length);
  assert.deepEqual(expeditions.map(w => w.zombies[0].health), days.map(w => w.zombies[0].health));
  const totals = difficulties.map(d => assaultPlan(5, 123, d).length); assert.ok(totals[0] < totals[1] && totals[1] < totals[2]);
  const nights = difficulties.map(d => { const w = new NightWorld(campaign(4), d); w.elapsed = 3; w.step(); return w; });
  assert.deepEqual(nights.map(w => w.enemies[0].health), difficulties.map(d => levelStats('walker', 1, 4, d).health));
  assert.ok(nights[0].enemies[0].health < nights[1].enemies[0].health && nights[1].enemies[0].health < nights[2].enemies[0].health);
});
test('四、五阶段新开放区域保留尸潮入口，不扣费，实际刷新仍能进入战场', () => {
  for (const stage of [4, 5] as const) {
    const b = new BaseWorld(campaign(stage)), before = { ...b.campaign.depot };
    for (const point of [{ x: 2144, y: 544 }, { x: 2144, y: 832 }, { x: 864, y: 1440 }, { x: 1152, y: 1440 }]) {
      const r = b.build('wall', point); assert.equal(r.ok, false); assert.match(r.message, /通道|虚线/);
    }
    assert.deepEqual(b.campaign.depot, before); assert.equal(b.plan.buildings.length, 0);
    assert.ok(b.build('wall', { x: 1888, y: 960 }).ok);
    const w = new NightWorld(b.campaign); w.elapsed = 82; w.step();
    assert.ok(w.enemies.some(e => e.gate === 1)); assert.ok(w.enemies.some(e => e.gate === 2));
    const nav = new Navigation(BASE_WIDTH, BASE_HEIGHT, GRID, b.obstacles, 11); nav.rebuild({ x: LIGHTHOUSE.x, y: LIGHTHOUSE.y + 80 });
    for (const e of w.enemies.filter(e => !INFECTED[e.kind].flying)) {
      assert.ok(canOccupy(e, INFECTED[e.kind].radius, b.obstacles, BASE_WIDTH, BASE_HEIGHT));
      assert.ok(nav.field[Math.floor(e.y / GRID) * nav.cols + Math.floor(e.x / GRID)] >= 0);
    }
  }
});

test('设施阶段锁在模型中生效，扩建保留旧阵地且新增区域可施工/行军/保存', () => {
  const b = new BaseWorld(campaign(1)), depot = { ...b.campaign.depot };
  assert.equal(b.build('grid', { x: 1216, y: 832 }).ok, false); assert.deepEqual(b.campaign.depot, depot);
  assert.equal(b.build('wall', { x: 2016, y: 1312 }).ok, false);
  assert.ok(b.build('wall', { x: 1216, y: 832 }).ok); b.finish(); b.campaign.clearedStage = 2;
  assert.equal(b.stage, 1); b.resume(); assert.equal(b.stage, 3);
  assert.ok(b.build('pounder', { x: 1856, y: 1216 }).ok); assert.ok(b.move([1], { x: 1600, y: 1248 }).ok);
  for (let i = 0; i < 180; i++) b.step();
  assert.ok(b.plan.soldiers[0].x > 800); assert.ok(validBasePlan(b.plan)); assert.deepEqual(decodeCampaign(JSON.stringify(b.campaign)).base, b.plan);
  assert.ok(STAGES[3].area.width * STAGES[3].area.height > STAGES[1].area.width * STAGES[1].area.height * 1.8);
});
test('守夜进度扩大真实灯塔视野与施工许可，未解锁区域不扣费', () => {
  const first = new NightWorld(campaign(1)), second = new NightWorld(campaign(2)), third = new NightWorld(campaign(3));
  const p = { x: 464, y: 704 }, far = { x: 304, y: 704 };
  assert.equal(first.canSee(p), false); assert.equal(second.canSee(p), true);
  assert.equal(second.canSee(far), false); assert.equal(third.canSee(far), true);
  const b = new BaseWorld(campaign(1)), before = { ...b.campaign.depot };
  assert.equal(b.build('turret', { x: 1760, y: 832 }).ok, false); assert.deepEqual(b.campaign.depot, before);
  b.campaign.clearedStage = 1; b.resume(); assert.equal(b.lightRadius, 640); assert.equal(b.remaining, 0);
  assert.equal(b.build('turret', { x: 1760, y: 832 }).ok, true);
});

test('胜利解锁及补给只发一次，重试锁原阶段，失败不推进，旧v2不按历史胜次跳关', () => {
  const old = decodeCampaign(JSON.stringify({ ...newCampaign(), nightsWon: 99 })); assert.equal(new BaseWorld(old).stage, 1);
  const b = new BaseWorld(campaign(1)); for (const [kind, x, y] of [['turret', 1088, 544], ['arrowtower', 864, 832], ['arrowtower', 1120, 832], ['barricade', 1216, 832]] as const) assert.ok(b.build(kind, { x, y }).ok); b.finish();
  const w = new NightWorld(b.campaign), before = { ...w.checkpoint.depot }; run(w, 120.1); assert.equal(w.status, 'victory');
  const result = w.resultCampaign(); assert.equal(result.clearedStage, 1); assert.equal(result.depot.materials, before.materials + 24); assert.equal(result.depot.energy, before.energy + 10);
  assert.deepEqual(w.resultCampaign(), result); assert.deepEqual(decodeCampaign(JSON.stringify(result)), result);
  const retry = new NightWorld(result); assert.equal(retry.stage, 1); run(retry, 120.1); assert.equal(retry.status, 'victory'); assert.deepEqual(retry.resultCampaign().depot, result.depot);
  const next = new BaseWorld(result); next.resume(); assert.equal(next.stage, 2);
  const loss = quiet(2); loss.lampHealth = 1; enemy(loss, 'walker', 1068, 704).cooldown = 0; loss.step(); assert.equal(loss.status, 'defeat'); assert.equal(loss.resultCampaign().clearedStage, 1);
  assert.equal(nextStage(3), 4); assert.equal(nextStage(5), 5);
});

test('电网真实减速并范围伤害，不对空；移出电网后状态到期恢复速度', () => {
  const b = new BaseWorld(campaign(2)); assert.ok(b.build('grid', { x: 1216, y: 832 }).ok);
  const w = new NightWorld(b.campaign); for (const f of w.fighters.values()) f.health = 0;
  const ground = enemy(w, 'brute', 1336, 892), air = enemy(w, 'crow', 1336, 892), airHP = air.health;
  const hp = ground.health, p = { x: ground.x, y: ground.y }; w.step(); assert.ok(ground.health < hp && ground.slowed! > 0); assert.equal(air.health, airHP); assert.equal(air.slowed, 0);
  assert.ok(distance(p, ground) < levelStats('brute', 1, 2).speed / 60 * 0.6);
  ground.x = 1556; ground.y = 892; run(w, 1); assert.equal(ground.slowed, 0);
});

test('火焰塔按冷却范围清群且不对空，不穿静态建筑', () => {
  const b = new BaseWorld(campaign()); assert.ok(b.build('flame', { x: 1216, y: 832 }).ok);
  const w = new NightWorld(b.campaign); for (const f of w.fighters.values()) f.health = 0;
  const a = enemy(w, 'brute', 1306, 892), c = enemy(w, 'brute', 1326, 892), air = enemy(w, 'bird', 1306, 892), hp = a.health, airHP = air.health;
  w.step(); assert.equal(a.health, hp - 12); assert.equal(c.health, hp - 12); assert.equal(air.health, airHP);
  run(w, 0.1); assert.equal(a.health, hp - 12);
  const behind = new BaseWorld(campaign()); assert.ok(behind.build('flame', { x: 1088, y: 608 }).ok);
  const blocked = new NightWorld(behind.campaign); for (const f of blocked.fighters.values()) f.health = 0;
  const hidden = enemy(blocked, 'walker', 1040, 752), before = hidden.health; blocked.step(); assert.equal(hidden.health, before);
});

test('Boss蓄力期间减速仍按模拟时间到期，技能不会冻结状态计时', () => {
  const w = quiet(), e = enemy(w, 'bomber', 1556, 1092); e.slowed = 0.9;
  e.windup = { kind: 'detonate', point: { x: 1556, y: 1092 }, duration: 1.6, remaining: 1.6, radius: 125 };
  run(w, 1); assert.equal(e.slowed, 0); assert.ok(e.windup && e.windup.remaining > 0);
});

test('维修站仅恢复范围内其他存活设施，不修自己/灯塔，不复活被毁设施', () => {
  const b = new BaseWorld(campaign(2)); b.build('repair', { x: 1216, y: 832 }); b.build('wall', { x: 1312, y: 832 }); b.build('wall', { x: 1664, y: 832 });
  const w = new NightWorld(b.campaign); const [repair, near, far] = w.plan.buildings; repair.health = 90; near.health = 75; far.health = 20; w.lampHealth = 300;
  w.step(); assert.equal(near.health, 80); assert.equal(far.health, 20); assert.equal(repair.health, 90); assert.equal(w.lampHealth, 300);
  near.health = 0; run(w, 3); assert.equal(near.health, 0);
});

test('狙击塔优先远处Boss、真实弹道命中且低射速，两类目标都可攻击', () => {
  const b = new BaseWorld(campaign(4)); b.build('sniper', { x: 1216, y: 832 }); const w = new NightWorld(b.campaign); for (const f of w.fighters.values()) f.health = 0;
  const mob = enemy(w, 'walker', 1356, 892), boss = enemy(w, 'bird', 1606, 792), hp = boss.health;
  run(w, 0.5); assert.ok(boss.health < hp); assert.equal(mob.health, levelStats('walker', 1, 4).health); assert.equal(w.bullets.length, 0);
  const after = boss.health; run(w, 1); assert.equal(boss.health, after);
});

test('喷毒Boss有远程落点读条，固定毒池持续伤害，可通过移动躲开', () => {
  for (const dodge of [false, true]) {
    const w = quiet(2), s = w.plan.soldiers[0], f = w.fighters.get(s.id)!; Object.assign(s, { x: 1256, y: 832 }); Object.assign(f, { health: 90, cooldown: 999 });
    enemy(w, 'blighter', 1516, 832).skillCooldown = 0; w.step(); assert.equal(w.enemies[0].windup?.kind, 'poison'); assert.equal(w.hazards.length, 0);
    if (dodge) assert.ok(w.move([s.id], { x: 1256, y: 1092 }).ok);
    run(w, 2); assert.equal(w.hazards[0].kind, 'poison'); assert.equal(f.health < 90, !dodge);
  }
});

test('自爆Boss蓄力可击杀打断；未打断则爆炸并消失，不凭空计作玩家击杀', () => {
  for (const interrupt of [false, true]) {
    const w = quiet(), e = enemy(w, 'bomber', 1096, 752); e.skillCooldown = 0; w.step(); assert.equal(e.windup?.kind, 'detonate');
    const hp = w.lampHealth;
    if (interrupt) w.bullets.push({ id: 99, x: e.x, y: e.y - 16, vx: 1, vy: 0, damage: 10000, life: 1 });
    run(w, 1.7); assert.ok(!w.enemies.includes(e)); assert.equal(w.lampHealth < hp, !interrupt); assert.equal(w.bossKills, interrupt ? 1 : 0);
  }
});

test('新人物按阶段出现，英雄可达且重复出发不重复招募，救援仍须护送返营', () => {
  for (const stage of [1, 2, 3] as const) for (let seed = 1; seed <= 20; seed++) {
    const w = new ExpeditionWorld(campaign(stage), false, seed); w.navigation.rebuild(CAMP);
    assert.equal(w.survivors.some(s => s.id === 'guardian'), stage >= 2); assert.equal(w.survivors.some(s => s.id === 'gunner'), stage === 3);
    for (const p of [...w.survivors, ...w.caches]) { assert.ok(canOccupy(p, 10, w.obstacles, w.width, w.height)); assert.ok(w.navigation.field[Math.floor(p.y / 32) * w.navigation.cols + Math.floor(p.x / 32)] >= 0); }
  }
  const c = campaign(2), w = new ExpeditionWorld(c, false), s = w.survivors.find(s => s.id === 'guardian')!; Object.assign(w.player, s); assert.ok(w.interact().ok);
  Object.assign(w.player, CAMP); assert.equal(w.interact().ok, false); Object.assign(s, { x: CAMP.x - 30, y: CAMP.y }); assert.ok(w.interact().ok);
  assert.ok(w.campaign.survivors.includes('guardian')); assert.equal(new ExpeditionWorld(w.campaign, false).survivors.some(s => s.id === 'guardian'), false);
  assert.equal(new BaseWorld(w.campaign).plan.soldiers.filter(s => s.role === 'guardian').length, 1);
});

test('电工返营额外电力只结算一次，英雄搜救触发有界伏击', () => {
  const w = new ExpeditionWorld(campaign(2), false), e = w.survivors.find(s => s.id === 'electrician')!, energy = w.campaign.depot.energy;
  Object.assign(w.player, e); w.interact(); Object.assign(e, { x: CAMP.x - 30, y: CAMP.y }); Object.assign(w.player, CAMP); w.interact(); w.interact();
  assert.equal(w.campaign.depot.energy, energy + 3); assert.equal(w.summary?.specialistBonus, 3); assert.ok(decodeCampaign(JSON.stringify(w.campaign)));
  const danger = new ExpeditionWorld(campaign(3), true), hero = danger.survivors.find(s => s.id === 'gunner')!; Object.assign(danger.player, hero); const before = danger.zombies.length; danger.interact();
  assert.ok(danger.zombies.length > before && danger.zombies.length <= 16);
});

test('医疗英雄仅治疗附近生还守卫，重炮英雄发范围炮弹且不对空，英雄阵地可保存', () => {
  const c = campaign(); c.survivors = ['captain', 'ranger', 'brawler', 'guardian', 'gunner']; const b = new BaseWorld(c);
  assert.equal(b.plan.soldiers.length, 8); assert.ok(validBasePlan(b.plan)); const w = new NightWorld(b.campaign);
  const hero = w.plan.soldiers.find(s => s.role === 'guardian')!; Object.assign(hero, { x: 1456, y: 1092 });
  Object.assign(w.plan.soldiers[0], { x: 1486, y: 1092 }); w.fighters.get(1)!.health = 20; w.fighters.get(2)!.health = 20; w.fighters.get(3)!.health = 0; run(w, 6.1);
  assert.equal(w.fighters.get(1)!.health, 35); assert.equal(w.fighters.get(2)!.health, 20); assert.equal(w.fighters.get(3)!.health, 0);
  const battle = new NightWorld(b.campaign), gunner = battle.plan.soldiers.find(s => s.role === 'gunner')!; Object.assign(gunner, { x: 1500, y: 1000 });
  for (const [id, f] of battle.fighters) if (id !== gunner.id) f.health = 0;
  const air = enemy(battle, 'crow', 1550, 1000); battle.step(); assert.equal(battle.bullets.length, 0); const ground = enemy(battle, 'brute', 1650, 1000), hp = ground.health;
  battle.step(); assert.ok(battle.bullets.some(b => b.projectile === 'shell' && b.splash === 52)); run(battle, 0.5); assert.ok(ground.health < hp); assert.equal(air.health, levelStats('crow', 1, 3).health);
});

test('非法阶段/结算字段拒绝，旧灯级/库存/坐标不丢失，终局重试没有新资源', () => {
  for (const invalid of [-1, 6, 1.5, '2', null]) assert.throws(() => decodeCampaign(JSON.stringify({ ...newCampaign(), clearedStage: invalid })));
  const b = new BaseWorld(campaign()); b.build('flame', { x: 1984, y: 1248 }); b.finish(); const raw = JSON.stringify(b.campaign); assert.deepEqual(decodeCampaign(raw), b.campaign);
  const bad = JSON.parse(raw); bad.base.stage = 6; assert.throws(() => decodeCampaign(JSON.stringify(bad)));
  assert.ok(BASE_WIDTH >= 2048 && BASE_HEIGHT >= 1408); assert.ok(NIGHT_LIMITS.enemies <= 96 && BUILDINGS.sniper.energy > BUILDINGS.arrowtower.energy);
});
