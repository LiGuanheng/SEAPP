import { BaseWorld } from '../src/core/base-world.ts';
import { NightWorld } from '../src/core/night-world.ts';
import { newCampaign } from '../src/core/campaign.ts';

for (const setup of ['unprepared', 'guide', 'crossfire']) {
  const campaign = newCampaign(); campaign.depot = { materials: 12, energy: 2, medkits: 0 }; campaign.survivors = ['engineer']; campaign.weapons.push('rifle');
  const base = new BaseWorld(campaign);
  if (setup !== 'unprepared') { base.build('turret', { x: 832, y: 352 }); base.build('barricade', { x: 960, y: 640 }, 1); }
  if (setup === 'crossfire') { base.move([1], { x: 656, y: 432 }); base.move([3], { x: 880, y: 560 }); for (let i = 0; i < 180; i++) base.step(); }
  base.finish();
  const night = new NightWorld(base.campaign);
  for (let i = 0; i < 7201 && night.commanding; i++) {
    if (night.charges && night.supportCooldown === 0 && night.elapsed > 55) { const heavy = night.enemies.find(e => e.kind === 'brute' && night.canSee(e)); if (heavy) night.callStrike(heavy); }
    night.step();
  }
  console.log(setup, JSON.stringify(night.summary()));
}
