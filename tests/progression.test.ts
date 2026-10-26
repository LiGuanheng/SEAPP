import test from 'node:test';
import assert from 'node:assert/strict';
import { BaseWorld } from '../src/core/base-world.ts';
import { NightWorld, type NightEnemy } from '../src/core/night-world.ts';
import { ExpeditionWorld, CAMP } from '../src/core/expedition.ts';
import { newCampaign, decodeCampaign, type Campaign } from '../src/core/campaign.ts';
import { BASE_WIDTH, BASE_HEIGHT, BUILDINGS, validBasePlan } from '../src/config/base.ts';
import { INFECTED, MOB_KINDS, NIGHT_LIMITS, levelStats, wavesForStage, type InfectedKind } from '../src/config/night.ts';
import { nextStage, STAGES, type StageId } from '../src/config/progression.ts';
import { canOccupy, distance } from '../src/core/geometry.ts';

const run = (w: NightWorld, seconds: number) => { for (let i = 0; i < Math.ceil(seconds * 60) && w.commanding; i++) w.step(); };
function campaign(stage: StageId = 3): Campaign { return { ...newCampaign(), clearedStage: stage - 1, depot: { materials: 200, energy: 100, medkits: 0 } }; }
function quiet(stage: StageId = 3) { const w = new NightWorld(campaign(stage)); for (const f of w.fighters.values()) f.health = 0; return w; }
function enemy(w: NightWorld, kind: InfectedKind, x = 960, y = 640) {
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

test('设施阶段锁在模型中生效，扩建保留旧阵地且新增区域可施工/行军/保存', () => {
  const b = new BaseWorld(campaign(1)), depot = { ...b.campaign.depot };
  assert.equal(b.build('grid', { x: 960, y: 640 }).ok, false); assert.deepEqual(b.campaign.depot, depot);
  assert.equal(b.build('wall', { x: 1760, y: 1120 }).ok, false);
  assert.ok(b.build('wall', { x: 960, y: 640 }).ok); b.finish(); b.campaign.clearedStage = 2;
  assert.equal(b.stage, 1); b.resume(); assert.equal(b.stage, 3);
  assert.ok(b.build('sniper', { x: 1760, y: 1088 }).ok); assert.ok(b.move([1], { x: 1712, y: 1136 }).ok);
  for (let i = 0; i < 180; i++) b.step();
  assert.ok(b.plan.soldiers[0].x > 800); assert.ok(validBasePlan(b.plan)); assert.deepEqual(decodeCampaign(JSON.stringify(b.campaign)).base, b.plan);
  assert.ok(STAGES[3].area.width * STAGES[3].area.height > STAGES[1].area.width * STAGES[1].area.height * 1.8);
});

test('胜利解锁及补给只发一次，重试锁原阶段，失败不推进，旧v2不按历史胜次跳关', () => {
  const old = decodeCampaign(JSON.stringify({ ...newCampaign(), nightsWon: 99 })); assert.equal(new BaseWorld(old).stage, 1);
  const b = new BaseWorld(campaign(1)); for (const [kind, x, y] of [['turret', 832, 352], ['arrowtower', 608, 640], ['arrowtower', 864, 640], ['barricade', 960, 640]] as const) assert.ok(b.build(kind, { x, y }).ok); b.finish();
  const w = new NightWorld(b.campaign), before = { ...w.checkpoint.depot }; run(w, 120.1); assert.equal(w.status, 'victory');
  const result = w.resultCampaign(); assert.equal(result.clearedStage, 1); assert.equal(result.depot.materials, before.materials + 12); assert.equal(result.depot.energy, before.energy + 4);
  assert.deepEqual(w.resultCampaign(), result); assert.deepEqual(decodeCampaign(JSON.stringify(result)), result);
  const retry = new NightWorld(result); assert.equal(retry.stage, 1); run(retry, 120.1); assert.equal(retry.status, 'victory'); assert.deepEqual(retry.resultCampaign().depot, result.depot);
  const next = new BaseWorld(result); next.resume(); assert.equal(next.stage, 2);
  const loss = quiet(2); loss.lampHealth = 1; enemy(loss, 'walker', 812, 512).cooldown = 0; loss.step(); assert.equal(loss.status, 'defeat'); assert.equal(loss.resultCampaign().clearedStage, 1);
  assert.equal(nextStage(3), 3);
});

test('电网真实减速并范围伤害，不对空；移出电网后状态到期恢复速度', () => {
  const b = new BaseWorld(campaign(2)); assert.ok(b.build('grid', { x: 960, y: 640 }).ok);
  const w = new NightWorld(b.campaign); for (const f of w.fighters.values()) f.health = 0;
  const ground = enemy(w, 'brute', 1080, 700), air = enemy(w, 'crow', 1080, 700), airHP = air.health;
  const hp = ground.health, p = { x: ground.x, y: ground.y }; w.step(); assert.ok(ground.health < hp && ground.slowed! > 0); assert.equal(air.health, airHP); assert.equal(air.slowed, 0);
  assert.ok(distance(p, ground) < levelStats('brute', 1, 2).speed / 60 * 0.6);
  ground.x = 1300; ground.y = 700; run(w, 1); assert.equal(ground.slowed, 0);
});

test('火焰塔按冷却范围清群且不对空，不穿静态建筑', () => {
  const b = new BaseWorld(campaign()); assert.ok(b.build('flame', { x: 960, y: 640 }).ok);
  const w = new NightWorld(b.campaign); for (const f of w.fighters.values()) f.health = 0;
  const a = enemy(w, 'brute', 1050, 700), c = enemy(w, 'brute', 1070, 700), air = enemy(w, 'bird', 1050, 700), hp = a.health, airHP = air.health;
  w.step(); assert.equal(a.health, hp - 12); assert.equal(c.health, hp - 12); assert.equal(air.health, airHP);
  run(w, 0.1); assert.equal(a.health, hp - 12);
  const behind = new BaseWorld(campaign()); assert.ok(behind.build('flame', { x: 832, y: 416 }).ok);
  const blocked = new NightWorld(behind.campaign); for (const f of blocked.fighters.values()) f.health = 0;
  const hidden = enemy(blocked, 'walker', 784, 560), before = hidden.health; blocked.step(); assert.equal(hidden.health, before);
});

test('Boss蓄力期间减速仍按模拟时间到期，技能不会冻结状态计时', () => {
  const w = quiet(), e = enemy(w, 'bomber', 1300, 900); e.slowed = 0.9;
  e.windup = { kind: 'detonate', point: { x: 1300, y: 900 }, duration: 1.6, remaining: 1.6, radius: 125 };
  run(w, 1); assert.equal(e.slowed, 0); assert.ok(e.windup && e.windup.remaining > 0);
});

test('维修站仅恢复范围内其他存活设施，不修自己/灯塔，不复活被毁设施', () => {
  const b = new BaseWorld(campaign(2)); b.build('repair', { x: 960, y: 640 }); b.build('wall', { x: 1056, y: 640 }); b.build('wall', { x: 1408, y: 640 });
  const w = new NightWorld(b.campaign); const [repair, near, far] = w.plan.buildings; repair.health = 90; near.health = 75; far.health = 20; w.lampHealth = 300;
  w.step(); assert.equal(near.health, 80); assert.equal(far.health, 20); assert.equal(repair.health, 90); assert.equal(w.lampHealth, 300);
  near.health = 0; run(w, 3); assert.equal(near.health, 0);
});

test('狙击塔优先远处Boss、真实弹道命中且低射速，两类目标都可攻击', () => {
  const b = new BaseWorld(campaign()); b.build('sniper', { x: 960, y: 640 }); const w = new NightWorld(b.campaign); for (const f of w.fighters.values()) f.health = 0;
  const mob = enemy(w, 'walker', 1100, 700), boss = enemy(w, 'bird', 1350, 600), hp = boss.health;
  run(w, 0.5); assert.ok(boss.health < hp); assert.equal(mob.health, levelStats('walker', 1, 3).health); assert.equal(w.bullets.length, 0);
  const after = boss.health; run(w, 1); assert.equal(boss.health, after);
});

test('喷毒Boss有远程落点读条，固定毒池持续伤害，可通过移动躲开', () => {
  for (const dodge of [false, true]) {
    const w = quiet(2), s = w.plan.soldiers[0], f = w.fighters.get(s.id)!; Object.assign(s, { x: 1000, y: 640 }); Object.assign(f, { health: 90, cooldown: 999 });
    enemy(w, 'blighter', 1260, 640).skillCooldown = 0; w.step(); assert.equal(w.enemies[0].windup?.kind, 'poison'); assert.equal(w.hazards.length, 0);
    if (dodge) assert.ok(w.move([s.id], { x: 1000, y: 900 }).ok);
    run(w, 2); assert.equal(w.hazards[0].kind, 'poison'); assert.equal(f.health < 90, !dodge);
  }
});

test('自爆Boss蓄力可击杀打断；未打断则爆炸并消失，不凭空计作玩家击杀', () => {
  for (const interrupt of [false, true]) {
    const w = quiet(), e = enemy(w, 'bomber', 840, 560); e.skillCooldown = 0; w.step(); assert.equal(e.windup?.kind, 'detonate');
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
  const hero = w.plan.soldiers.find(s => s.role === 'guardian')!; Object.assign(hero, { x: 1200, y: 900 });
  Object.assign(w.plan.soldiers[0], { x: 1230, y: 900 }); w.fighters.get(1)!.health = 20; w.fighters.get(2)!.health = 20; w.fighters.get(3)!.health = 0; run(w, 6.1);
  assert.equal(w.fighters.get(1)!.health, 30); assert.equal(w.fighters.get(2)!.health, 20); assert.equal(w.fighters.get(3)!.health, 0);
  const battle = new NightWorld(b.campaign), gunner = battle.plan.soldiers.find(s => s.role === 'gunner')!; Object.assign(gunner, { x: 1500, y: 1000 });
  for (const [id, f] of battle.fighters) if (id !== gunner.id) f.health = 0;
  const air = enemy(battle, 'crow', 1550, 1000); battle.step(); assert.equal(battle.bullets.length, 0); const ground = enemy(battle, 'brute', 1650, 1000), hp = ground.health;
  battle.step(); assert.ok(battle.bullets.some(b => b.projectile === 'shell' && b.splash === 52)); run(battle, 0.5); assert.ok(ground.health < hp); assert.equal(air.health, levelStats('crow', 1, 3).health);
});

test('非法阶段/结算字段拒绝，旧灯级/库存/坐标不丢失，终局重试没有新资源', () => {
  for (const invalid of [-1, 4, 1.5, '2', null]) assert.throws(() => decodeCampaign(JSON.stringify({ ...newCampaign(), clearedStage: invalid })));
  const b = new BaseWorld(campaign()); b.build('flame', { x: 1728, y: 1056 }); b.finish(); const raw = JSON.stringify(b.campaign); assert.deepEqual(decodeCampaign(raw), b.campaign);
  const bad = JSON.parse(raw); bad.base.stage = 4; assert.throws(() => decodeCampaign(JSON.stringify(bad)));
  assert.ok(BASE_WIDTH >= 2048 && BASE_HEIGHT >= 1408); assert.ok(NIGHT_LIMITS.enemies <= 96 && BUILDINGS.sniper.energy > BUILDINGS.arrowtower.energy);
});
