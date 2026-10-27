import { performance } from 'node:perf_hooks';
import { mkdirSync, writeFileSync } from 'node:fs';
import { BaseWorld } from '../src/core/base-world.ts';
import { NightWorld } from '../src/core/night-world.ts';
import { newCampaign, decodeCampaign } from '../src/core/campaign.ts';
import { NIGHT_LIMITS } from '../src/config/night.ts';
import { canOccupy } from '../src/core/geometry.ts';
mkdirSync('artifacts', { recursive: true });

export function siegeFixture(name, stage = 3) {
  const c = newCampaign(), ordinary = name === 'ordinary';
  c.clearedStage = ordinary ? 0 : stage - 1;
  c.depot = { materials: ordinary ? 16 : 1800, energy: ordinary ? 2 : 500, medkits: 0 };
  c.survivors = ordinary ? ['engineer'] : ['engineer', 'captain', 'ranger', 'brawler', 'guardian', 'gunner', 'medic'];
  c.weapons.push('rifle'); const b = new BaseWorld(c);
  for (const [kind, x, y] of [['turret', 832, 352], ['arrowtower', 608, 640], ['arrowtower', 864, 640], ['barricade', 960, 640]]) b.build(kind, { x, y }, kind === 'barricade' ? 1 : 0);
  if (!ordinary) {
    const positions = [[576, 320], [960, 320], [512, 640], [1024, 640], [640, 192], [896, 800], [416, 384], [1152, 384], [416, 736], [1088, 960], [544, 960], [1024, 192]];
    positions.forEach(([x, y], i) => b.build(['cannon', 'grid', 'flame', 'repair', 'sniper', 'turret'][i % 6], { x, y }));
    for (let x = 416; x <= 1152; x += 32) for (const y of [256, 864]) b.build('wall', { x, y });
    if (name === 'fortified') for (let y = 128; y <= 1088 && b.plan.buildings.length < 120; y += 96) for (let x = 352; x <= 1760 && b.plan.buildings.length < 120; x += 96) b.build(['wall', 'wall', 'turret', 'grid', 'cannon', 'repair'][b.plan.buildings.length % 6], { x, y });
    // Guard the core from four angles; neither teleport nor grant combat health.
    b.plan.soldiers.forEach((s, i) => { const points = [[688, 592], [848, 592], [688, 432], [848, 432], [656, 512], [880, 512], [768, 640], [768, 400]], p = { x: points[i][0], y: points[i][1] }; if (canOccupy(p, 13, b.obstacles, 2048, 1408)) Object.assign(s, p); });
  }
  if (!ordinary) for (const kind of ['turret', 'cannon']) { const tower = b.plan.buildings.find(b => b.kind === kind); if (tower) b.refit(tower.id); }
  b.finish(); decodeCampaign(JSON.stringify(b.campaign)); return b.campaign;
}
if (process.argv[1]?.replaceAll('\\', '/').endsWith('/validate-siege.mjs')) {
const results = [];
for (const name of ['ordinary', 'fortified', 'encirclement']) {
  const campaign = siegeFixture(name), w = new NightWorld(campaign), timings = [], coverage = new Set(); let maxDirections = 0, fourWaySeconds = 0;
  writeFileSync(`artifacts/siege-${name}-campaign.json`, JSON.stringify(campaign));
  const started = performance.now();
  for (let i = 0; i < 7201 && w.commanding; i++) {
    if (w.charges && w.supportCooldown === 0 && w.elapsed > 50) { const e = w.enemies.find(e => w.canSee(e) && ['brute', 'bomber', 'blighter'].includes(e.kind)); if (e) w.callStrike(e); }
    const time = performance.now(); w.step(); timings.push(performance.now() - time);
    const n = w.pressure.filter((p, i) => { if (p >= 3) coverage.add(i); return p >= 3; }).length;
    maxDirections = Math.max(maxDirections, n); if (n === 4) fourWaySeconds += 1 / 60;
    if (w.enemies.length > NIGHT_LIMITS.enemies) throw Error('Enemy cap violated');
  }
  const simulatedMs = performance.now() - started; timings.sort((a, b) => a - b);
  const result = { name, stage: w.stage, initialBuildings: campaign.base.buildings.length, summary: w.summary(), buildingLosses: campaign.base.buildings.length - w.plan.buildings.length, peakEnemies: w.peakEnemies, coverage: [...coverage].sort(), maxDirections, fourWaySeconds, spawnedByGate: w.spawnedByGate, pending: w.nightSnapshot().pendingEnemies, simulatedMs, stepMs: { mean: timings.reduce((a, b) => a + b, 0) / timings.length, p95: timings[Math.floor(timings.length * 0.95)], max: timings.at(-1) } };
  results.push(result); console.log(JSON.stringify(result));
}
writeFileSync('artifacts/siege-model.json', JSON.stringify(results, null, 2));
if (results[0].summary.outcome !== 'victory' || results[2].maxDirections !== 4 || results[2].peakEnemies < 65) throw Error('Siege acceptance failed');
}
