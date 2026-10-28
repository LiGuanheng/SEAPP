import { performance } from 'node:perf_hooks';
import { BaseWorld } from '../src/core/base-world.ts';
import { NightWorld } from '../src/core/night-world.ts';
import { newCampaign } from '../src/core/campaign.ts';
import { NIGHT_LIMITS } from '../src/config/night.ts';
import { STAGE_COUNT } from '../src/config/progression.ts';
import { INFECTED, levelStats } from '../src/config/night.ts';
import { RankedRun } from '../src/core/ranking.ts';
import { calculateScore } from '../src/core/scoring.ts';
import { mkdirSync, writeFileSync } from 'node:fs';
mkdirSync('artifacts', { recursive: true });

// 模型场景：每阶段一次可在48负重内取得的补给；不声称是键鼠实玩或低配GPU测试。
let campaign = newCampaign(); campaign.survivors = ['engineer']; campaign.weapons.push('rifle');
const ranking = new RankedRun('model-fixture', 'normal');
const builds = [
  [['turret', 832, 352], ['arrowtower', 608, 640], ['arrowtower', 864, 640], ['barricade', 960, 640]],
  [['grid', 1024, 576], ['repair', 928, 736], ['cannon', 960, 352], ['arrowtower', 608, 352], ['cannon', 448, 352], ['arrowtower', 480, 640], ['antiair', 1024, 352]],
  [['flame', 576, 416], ['sniper', 1120, 352], ['turret', 832, 800], ['wall', 576, 256], ['wall', 608, 256], ['wall', 640, 256], ['flame', 576, 736], ['flame', 960, 800], ['grid', 544, 640], ['antiair', 608, 800]],
];
for (let stage = 1; stage <= STAGE_COUNT; stage++) {
  ranking.update(true, (stage - 1) * 100000, 3);
  ranking.advancePhase('day', stage >= 4 ? 360 : stage === 3 ? 180 : 90);
  ranking.advancePhase('base', 30);
  campaign.depot.materials += stage === 1 ? 16 : stage === 3 ? 36 : 24; campaign.depot.energy += stage === 1 ? 2 : stage === 3 ? 12 : 10;
  if (stage === 2) campaign.survivors.push('guardian', 'medic'); if (stage === 3) campaign.survivors.push('gunner', 'captain', 'ranger', 'brawler');
  if (stage === 4) campaign.survivors.push('sentinel'); if (stage === 5) campaign.survivors.push('striker');
  const base = new BaseWorld(campaign); base.resume();
  for (const [kind, x, y] of builds[stage - 1] ?? []) { const r = base.build(kind, { x, y }, kind === 'barricade' ? 1 : 0); if (!r.ok) throw new Error(`${kind}: ${r.message}`); }
  if (stage === 3) {
    // 最终围城前再出发一次，带回24建材；单趟仍受48负重限制，没有免费施工。
    base.campaign.depot.materials += 24;
    base.build('turret', { x: 1056, y: 640 });
    for (const x of [512, 544, 576, 608, 640, 672]) base.build('wall', { x, y: 864 });
    for (const x of [896, 928, 960, 992]) base.build('wall', { x, y: 256 });
    for (const x of [416, 1152]) for (let y = 288; y <= 448; y += 32) base.build('wall', { x, y });
    for (const x of [896, 928, 960, 992, 1024, 1056]) base.build('wall', { x, y: 864 });
    for (const x of [352, 384, 416, 448, 1056, 1088]) base.build('wall', { x, y: 256 });
    // 新增重甲会吸收地面火力，余下库存用于补机枪交叉火力，不虚增资源。
    for (const [x, y] of [[896, 352], [640, 736], [960, 704], [416, 640], [1088, 704]]) base.build('turret', { x, y });
  }
  if (stage >= 4) {
    // 后两阶段在基础一趟之外增加三趟探索物资（各36建材/12电力）；计时共360秒，不作为键鼠通关证据。
    base.campaign.depot.materials += 108; base.campaign.depot.energy += 36;
    const target = stage === 4 ? 76 : 104, candidates = [];
    for (let y = 192; y <= 1024; y += 32) for (let x = 320; x <= 1344; x += 32) candidates.push({ x, y });
    // 围绕灯塔形成紧凑火力环，避免新增火力全部堆在北侧。
    candidates.sort((a, b) => Math.abs(Math.hypot(a.x + 32 - 768, a.y + 32 - 512) - 330) - Math.abs(Math.hypot(b.x + 32 - 768, b.y + 32 - 512) - 330));
    for (const point of candidates) {
      if (base.plan.buildings.length >= target) break;
      const kind = ['turret', 'sniper', 'cannon', 'repair', 'turret'][base.plan.buildings.length % 5];
      const built = base.build(kind, point);
      if (!built.ok && base.campaign.depot.energy < base.cost(kind).energy) base.build('arrowtower', point);
    }
  }
  if (stage >= 2) {
    base.plan.soldiers.forEach((s, i) => {
      const points = [[688, 592], [848, 592], [688, 432], [848, 432], [656, 512], [880, 512], [768, 640], [768, 400]];
      const p = s.role === 'gunner' ? [768, 400] : s.role === 'guardian' ? [768, 608] : points[i];
      base.move([s.id], { x: p[0], y: p[1] });
    });
    for (let i = 0; i < 600; i++) base.step();
  }
  base.finish(); const night = new NightWorld(base.campaign), times = [], peak = { enemies: 0, bullets: 0, zones: 0 };
  for (let i = 0; i < 7201 && night.commanding; i++) {
    if (night.charges && night.supportCooldown === 0 && night.elapsed > 55) { const target = night.enemies.find(e => night.canSee(e) && ['bomber', 'blighter', 'brute'].includes(e.kind)); if (target) night.callStrike(target); }
    const t = performance.now(); night.step(); times.push(performance.now() - t);
    peak.enemies = Math.max(peak.enemies, night.enemies.length); peak.bullets = Math.max(peak.bullets, night.bullets.length); peak.zones = Math.max(peak.zones, night.hazards.length);
    if (peak.enemies > NIGHT_LIMITS.enemies || peak.bullets > NIGHT_LIMITS.bullets || peak.zones > NIGHT_LIMITS.zones) throw new Error('实体上限失效');
  }
  times.sort((a, b) => a - b);
  console.log(JSON.stringify({ stage, summary: night.summary(), bosses: [...night.bossesSeen], peak, modelStepMs: { mean: times.reduce((a, b) => a + b, 0) / times.length, p95: times[Math.floor(times.length * 0.95)], max: times.at(-1) }, depot: base.campaign.depot }));
  if (night.status !== 'victory') throw new Error(`阶段${stage}参考阵地失守，需调整布防或数值`);
  // 从真实模型结算取数据；此处虚拟墙钟只验证连接关系，不作为实玩通关成绩提交。
  ranking.advancePhase('night', night.elapsed);
  const summary = night.summary();
  ranking.finishNight({ stage, outcome: summary.outcome, kills: summary.kills, bossKills: summary.bossKills ?? 0, lampHealth: summary.lampHealth, soldiers: summary.soldiers }, stage * 100000);
  if (stage === 3 && peak.enemies < 40) throw new Error('后期尸潮密度不足：参考阵地应观察到至少40名敌人同时逼近');
  campaign = night.resultCampaign();
}
if (!ranking.result || ranking.result.score !== calculateScore(ranking.stages, ranking.result.durationMs, ranking.result).total) throw new Error('完整战役结算未接入统一评分');
console.log(JSON.stringify({ rankingFixture: true, score: ranking.result.score, stages: ranking.stages.length, durationMs: ranking.result.durationMs, phaseTimesMs: ranking.result.phaseTimesMs }));

const stressCampaign = structuredClone(campaign); stressCampaign.depot = { materials: 5000, energy: 2000, medkits: 0 };
const stressBase = new BaseWorld(stressCampaign); stressBase.resume();
const types = ['wall', 'wall', 'turret', 'grid', 'flame', 'sniper', 'repair'];
for (let y = 160; y <= 1120 && stressBase.plan.buildings.length < 120; y += 96) for (let x = 352; x <= 1760 && stressBase.plan.buildings.length < 120; x += 96) stressBase.build(types[stressBase.plan.buildings.length % types.length], { x, y });
stressBase.finish(); writeFileSync('artifacts/performance-campaign.json', JSON.stringify(stressBase.campaign));
const stress = new NightWorld(stressBase.campaign);
// 合成满载夹具，仅压测模型；不作为真实战役刷新或人工试玩证据。
for (let i = 0; i < NIGHT_LIMITS.enemies; i++) {
  const kind = i % 3 === 0 ? 'crow' : i % 3 === 1 ? 'brute' : 'walker', stats = levelStats(kind, 5, 5);
  stress.enemies.push({ id: 10000 + i, x: 1888 + i % 4 * 32, y: 320 + Math.floor(i / 4) * 32, kind, health: stats.health, maxHealth: stats.health, level: 5, aim: 0, moving: true, cooldown: INFECTED[kind].interval, hurt: 0 });
}
const samples = [];
for (let i = 0; i < 600 && stress.commanding; i++) { const t = performance.now(); stress.step(); samples.push(performance.now() - t); }
samples.sort((a, b) => a - b);
console.log(JSON.stringify({ stress: true, buildings: stressBase.plan.buildings.length, initialEnemies: NIGHT_LIMITS.enemies, steps: samples.length, modelStepMs: { mean: samples.reduce((a, b) => a + b, 0) / samples.length, p95: samples[Math.floor(samples.length * 0.95)], max: samples.at(-1) } }));
