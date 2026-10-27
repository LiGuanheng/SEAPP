import { newCampaign, type Campaign } from './campaign.ts';
import { BaseWorld } from './base-world.ts';

/** 公开的课堂演示入口：真实施工/战斗模型，成绩只能进入演示榜，不改普通存档。 */
export function createDemoCampaign(): Campaign {
  const c = newCampaign(); c.depot = { materials: 60, energy: 20, medkits: 2 };
  c.survivors = ['engineer', 'captain', 'medic']; c.weapons = ['pistol', 'rifle'];
  const b = new BaseWorld(c);
  for (const [kind, x, y] of [['turret', 832, 352], ['arrowtower', 608, 640], ['arrowtower', 864, 640], ['barricade', 960, 640]] as const) b.build(kind, { x, y }, kind === 'barricade' ? 1 : 0);
  return b.campaign;
}
