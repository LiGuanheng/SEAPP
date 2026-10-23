import { BUILDINGS, OBSTACLES, WORLD_HEIGHT, WORLD_WIDTH, roomAt } from '../config/map.ts';
import { canOccupy, distance } from './geometry.ts';
import type { Rect, Vec } from './types.ts';

export interface ExplorationLayout { seed: number; theme: '落尘街区' | '雨后街区' | '青苔街区'; tint: number; debris: (Rect & { frame: number })[]; stashes: Vec[]; roomSides: number[]; medicOffset: number; captainOffset: number }
/** 主干道路、门口和教学路线不变；种子控制小型障碍、支线奖励、室内摆位与色调。 */
export function explorationLayout(seed: number): ExplorationLayout {
  let state = (seed >>> 0) || 1;
  const random = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; };
  const theme = Math.floor(random() * 3), debris: ExplorationLayout['debris'] = [], stashes: Vec[] = [];
  const candidates = [{ x: 496, y: 752 }, { x: 624, y: 912 }, { x: 1360, y: 608 }, { x: 1520, y: 880 }, { x: 1648, y: 560 }, { x: 432, y: 544 }, { x: 624, y: 1136 }, { x: 1360, y: 1136 }];
  for (const p of candidates) {
    const x = p.x + Math.floor(random() * 17) - 8, y = p.y + Math.floor(random() * 17) - 8;
    if (random() > 0.55 && debris.length < 4 && canOccupy({ x, y }, 35, OBSTACLES, WORLD_WIDTH, WORLD_HEIGHT) && roomAt({ x, y }) < 0) debris.push({ x: x - 16, y: y - 16, width: 32, height: 32, frame: random() > 0.5 ? 496 : 545 });
    else if (stashes.length < 3 && canOccupy({ x, y }, 14, OBSTACLES, WORLD_WIDTH, WORLD_HEIGHT)) stashes.push({ x, y });
  }
  // 奖励不能出现在新增障碍内，或与建筑门洞/碰撞相重叠。
  const obstacles = [...OBSTACLES, ...debris];
  return { seed: seed >>> 0, theme: (['落尘街区', '雨后街区', '青苔街区'] as const)[theme], tint: [0x969287, 0x82959c, 0x83977e][theme], debris,
    stashes: stashes.filter(p => canOccupy(p, 12, obstacles, WORLD_WIDTH, WORLD_HEIGHT) && debris.every(d => distance(p, { x: d.x + 16, y: d.y + 16 }) > 80)),
    roomSides: BUILDINGS.map((_, i) => i === 1 ? -1 : random() > 0.5 ? 1 : -1), medicOffset: Math.floor(random() * 3 - 1) * 16, captainOffset: Math.floor(random() * 3 - 1) * 16 };
}
