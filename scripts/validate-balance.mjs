// 有限资源模型，不替代键鼠实玩。每关一趟物资、真实扣费，不修改战斗生命或伤害。
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { BaseWorld } from '../src/core/base-world.ts';
import { NightWorld } from '../src/core/night-world.ts';
import { newCampaign } from '../src/core/campaign.ts';
import { LIGHTHOUSE, validBasePlan } from '../src/config/base.ts';
import { capacityFor } from '../src/config/growth.ts';
import { NIGHT_LIMITS } from '../src/config/night.ts';
import { cargoWeight } from '../src/core/expedition.ts';

const supplies = [[16, 2], [38, 12], [56, 18], [78, 26], [104, 34]];
const recruits = [[], ['guardian', 'medic', 'captain'], ['gunner', 'ranger', 'brawler'], ['sentinel'], ['striker']];
const builds = [
  ['turret', 'arrowtower', 'arrowtower', 'barricade'],
  ['antiair', 'cannon', 'turret', 'repair', 'arrowtower'],
  ['pounder', 'flame', 'antiair', 'grid', 'turret'],
  ['inferno', 'sniper', 'repair', 'turret', 'cannon'],
  ['eagle', 'inferno', 'sniper', 'antiair', 'repair'],
];
export function prepareStage(campaign, stage, seed = 0, layout = 'balanced', difficulty = 'normal') {
  // 困难首夜多收一组火力物资，仍只用一趟且不满背包。
  const [materials, energy] = difficulty === 'hard' && stage === 1 ? [28, 8] : supplies[stage - 1];
  assert.ok(cargoWeight({ materials, energy, medkits: 0 }) <= capacityFor(stage), '物资不得超出单趟负重');
  campaign.depot.materials += materials; campaign.depot.energy += energy;
  campaign.survivors.push(...recruits[stage - 1]); campaign.expeditions = seed + stage;
  const base = new BaseWorld(campaign); base.resume();
  const points = [];
  for (let y = 352; y <= 1056; y += 32) for (let x = 640; x <= 1408; x += 32) points.push({ x, y });
  const choices = [...builds[stage - 1], ...(difficulty === 'hard' && stage === 1 ? ['turret', 'cannon'] : [])];
  choices.forEach((kind, i) => {
    const angle = ((i + stage + seed) % 4) * Math.PI / 2 + Math.PI / 4;
    const target = layout === 'cluster' ? { x: 720, y: 400 } : {
      x: LIGHTHOUSE.x - 32 + Math.cos(angle) * 220,
      y: LIGHTHOUSE.y - 32 + Math.sin(angle) * 220,
    };
    points.sort((a, b) => Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y));
    assert.ok(points.some(p => base.build(kind, p).ok), `阶段${stage}无法建设${kind}`);
  });
  base.finish(); assert.ok(validBasePlan(base.plan)); return base.campaign;
}
export function simulateCampaign(difficulty, seed = 0, layout = 'balanced', support = true) {
  let campaign = newCampaign(); campaign.survivors = ['engineer']; campaign.weapons.push('rifle');
  const results = [];
  for (let stage = 1; stage <= 5; stage++) {
    campaign = prepareStage(campaign, stage, seed, layout, difficulty);
    const world = runNight(campaign, difficulty, support);
    results.push({ ...world.summary(), peak: world.peakEnemies, skills: world.skillCasts, built: campaign.base.buildings.length });
    if (world.status !== 'victory') break;
    campaign = world.resultCampaign();
  }
  return { difficulty, seed, layout, support, results };
}
function runNight(campaign, difficulty, support = true) {
  const world = new NightWorld(campaign, difficulty);
  for (let i = 0; i < 7201 && world.commanding; i++) {
    if (support && world.elapsed > 55 && world.charges && world.supportCooldown === 0) {
      const target = world.enemies.find(e => ['tank', 'bomber', 'blighter', 'brute'].includes(e.kind) && world.canSee(e));
      if (target) world.callStrike(target);
    }
    world.step(); assert.ok(world.enemies.length <= NIGHT_LIMITS.enemies);
  }
  return world;
}
/** 浏览器夹具从真实前几夜结算取得奖励、阶段和阵地，避免手填资源。 */
export function campaignForStage(stage, difficulty = 'normal') {
  let campaign = newCampaign(); campaign.survivors = ['engineer']; campaign.weapons.push('rifle');
  for (let current = 1; current <= stage; current++) {
    campaign = prepareStage(campaign, current, 0, 'balanced', difficulty);
    if (current < stage) {
      const world = runNight(campaign, difficulty); assert.equal(world.status, 'victory');
      campaign = world.resultCampaign();
    }
  }
  return campaign;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const results = [];
  for (const difficulty of ['easy', 'normal', 'hard']) for (const seed of [0, 1, 2]) {
    const result = simulateCampaign(difficulty, seed); results.push(result); console.log(JSON.stringify(result));
  }
  results.push(simulateCampaign('normal', 0, 'balanced', false), simulateCampaign('hard', 0, 'cluster'));
  mkdirSync('artifacts', { recursive: true }); writeFileSync('artifacts/balance-report.json', JSON.stringify(results, null, 2));
  if (!process.argv.includes('--baseline')) {
    for (const r of results.filter(r => r.layout === 'balanced')) {
      assert.equal(r.results.length, 5, `${r.difficulty}/${r.seed}未到第五阶段`);
      assert.ok(r.results.every(s => s.outcome === 'victory'), `${r.difficulty}/${r.seed}参考布防未通关`);
    }
    assert.ok(results.at(-1).results.some(s => s.outcome === 'defeat'), '困难偏置阵型应仍有失守风险');
  }
}
