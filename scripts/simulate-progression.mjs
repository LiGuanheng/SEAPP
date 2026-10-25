import { performance } from 'node:perf_hooks';
import { BaseWorld } from '../src/core/base-world.ts';
import { NightWorld } from '../src/core/night-world.ts';
import { newCampaign } from '../src/core/campaign.ts';
import { NIGHT_LIMITS } from '../src/config/night.ts';
import { INFECTED, levelStats } from '../src/config/night.ts';
import { mkdirSync, writeFileSync } from 'node:fs';
mkdirSync('artifacts', { recursive: true });

// 模型场景：每阶段一次可在48负重内取得的补给；不声称是键鼠实玩或低配GPU测试。
let campaign = newCampaign(); campaign.survivors = ['engineer']; campaign.weapons.push('rifle');
const builds = [
  [['turret', 832, 352], ['arrowtower', 608, 640], ['arrowtower', 864, 640], ['barricade', 960, 640]],
  [['grid', 1024, 576], ['repair', 928, 736], ['cannon', 960, 352], ['arrowtower', 608, 352]],
  [['flame', 576, 416], ['sniper', 1056, 352], ['turret', 832, 800], ['wall', 576, 256], ['wall', 608, 256], ['wall', 640, 256]],
];
for (let stage = 1; stage <= 3; stage++) {
  campaign.depot.materials += stage === 1 ? 16 : 24; campaign.depot.energy += stage === 1 ? 2 : 10;
  if (stage === 2) campaign.survivors.push('guardian', 'medic'); if (stage === 3) campaign.survivors.push('gunner', 'captain', 'ranger', 'brawler');
  const base = new BaseWorld(campaign); base.resume();
  for (const [kind, x, y] of builds[stage - 1]) { const r = base.build(kind, { x, y }, kind === 'barricade' ? 1 : 0); if (!r.ok) throw new Error(`${kind}: ${r.message}`); }
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
  campaign = night.resultCampaign();
}

const stressCampaign = structuredClone(campaign); stressCampaign.depot = { materials: 5000, energy: 2000, medkits: 0 };
const stressBase = new BaseWorld(stressCampaign); stressBase.resume();
const types = ['wall', 'wall', 'turret', 'grid', 'flame', 'sniper', 'repair'];
for (let y = 160; y <= 1120 && stressBase.plan.buildings.length < 120; y += 96) for (let x = 352; x <= 1760 && stressBase.plan.buildings.length < 120; x += 96) stressBase.build(types[stressBase.plan.buildings.length % types.length], { x, y });
stressBase.finish(); writeFileSync('artifacts/performance-campaign.json', JSON.stringify(stressBase.campaign));
const stress = new NightWorld(stressBase.campaign);
// 合成满载夹具，仅压测模型；不作为真实战役刷新或人工试玩证据。
for (let i = 0; i < NIGHT_LIMITS.enemies; i++) {
  const kind = i % 3 === 0 ? 'crow' : i % 3 === 1 ? 'brute' : 'walker', stats = levelStats(kind, 5, 3);
  stress.enemies.push({ id: 10000 + i, x: 1888 + i % 4 * 32, y: 320 + Math.floor(i / 4) * 32, kind, health: stats.health, maxHealth: stats.health, level: 5, aim: 0, moving: true, cooldown: INFECTED[kind].interval, hurt: 0 });
}
const samples = [];
for (let i = 0; i < 600 && stress.commanding; i++) { const t = performance.now(); stress.step(); samples.push(performance.now() - t); }
samples.sort((a, b) => a - b);
console.log(JSON.stringify({ stress: true, buildings: stressBase.plan.buildings.length, initialEnemies: NIGHT_LIMITS.enemies, steps: samples.length, modelStepMs: { mean: samples.reduce((a, b) => a + b, 0) / samples.length, p95: samples[Math.floor(samples.length * 0.95)], max: samples.at(-1) } }));
