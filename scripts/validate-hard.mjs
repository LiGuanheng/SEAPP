// 可重复的同资源阵型对照，不代表人工探索通关。真实施工扣费、调兵与夜战模拟。
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { BaseWorld } from '../src/core/base-world.ts';
import { NightWorld } from '../src/core/night-world.ts';
import { newCampaign } from '../src/core/campaign.ts';
import { LIGHTHOUSE } from '../src/config/base.ts';
import { assaultPlan } from '../src/core/assault.ts';

export function hardFixture(layout = 'balanced') {
  const c = newCampaign(); c.clearedStage = 4; c.expeditions = 8;
  c.depot = { materials: 650, energy: 260, medkits: 0 };
  c.survivors = ['engineer', 'medic', 'captain', 'ranger', 'brawler', 'guardian', 'gunner', 'sentinel', 'striker'];
  c.reserves = { rifle: 20, archer: 4, vanguard: 4 }; c.weapons.push('rifle');
  const base = new BaseWorld(c);
  const kinds = [
    ...Array(2).fill('eagle'), ...Array(4).fill('inferno'), ...Array(4).fill('sniper'),
    ...Array(7).fill('antiair'), ...Array(4).fill('cannon'), ...Array(4).fill('pounder'),
    ...Array(4).fill('repair'), ...Array(4).fill('grid'), ...Array(26).fill('turret'), ...Array(24).fill('wall'),
  ];
  kinds.forEach((kind, i) => {
    const points = [];
    for (let y = 192; y < 1240; y += 32) for (let x = 192; x < 1856; x += 32) points.push({ x, y });
    const target = layout === 'cluster' ? { x: 512 + i % 4 * 80, y: 320 + Math.floor(i / 4) * 64 } : {
      x: LIGHTHOUSE.x + Math.cos(i * 2.4) * (i < 59 ? 220 : 400),
      y: LIGHTHOUSE.y + Math.sin(i * 2.4) * (i < 59 ? 200 : 380),
    };
    points.sort((a, b) => Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y));
    assert.ok(points.some(p => base.build(kind, p).ok), `没有足够合法位置或库存建设${kind}`);
  });
  if (layout === 'balanced') {
    const stations = [];
    base.plan.soldiers.forEach((s, i) => {
      const a = i % 4;
      const target = { x: LIGHTHOUSE.x + (a % 2 ? -1 : 1) * (160 + Math.floor(i / 4) * 32), y: LIGHTHOUSE.y + (a < 2 ? -1 : 1) * 160 };
      const points = [];
      for (let y = 400; y <= 1024; y += 32) for (let x = 608; x <= 1440; x += 32) points.push({ x, y });
      points.sort((a, b) => Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y));
      const station = points.find(p => stations.every(s => Math.hypot(s.x - p.x, s.y - p.y) >= 52) && base.move([s.id], p).ok);
      assert.ok(station, '没有合法可达的守军驻点'); stations.push(station);
    });
    for (let i = 0; i < 480; i++) base.step();
  }
  base.finish(); return base.campaign;
}

export function runHardReference(layout) {
  const campaign = hardFixture(layout), world = new NightWorld(campaign, 'hard'); let skills = 0;
  for (let i = 0; i < 7201 && world.commanding; i++) {
    if (world.charges && world.supportCooldown === 0 && world.elapsed > 20) {
      const target = world.enemies.find(e => ['tank', 'bomber', 'blighter', 'brute'].includes(e.kind) && world.canSee(e));
      if (target) world.callStrike(target);
    }
    world.step(); skills += world.events.filter(e => e.type === 'cast').length;
  }
  return { layout, ...world.summary(), peakEnemies: world.peakEnemies, skills, remainingDepot: campaign.depot };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const stage of [1, 2, 3, 4, 5]) console.log(JSON.stringify({ stage, normal: assaultPlan(stage, 3).length, hard: assaultPlan(stage, 3, 'hard').length }));
  const balanced = runHardReference('balanced'), cluster = runHardReference('cluster');
  console.log(JSON.stringify({ balanced, cluster }));
  assert.deepEqual(balanced.remainingDepot, cluster.remainingDepot);
  assert.equal(balanced.outcome, 'victory'); assert.equal(cluster.outcome, 'defeat');
}
