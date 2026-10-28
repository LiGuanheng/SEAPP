import { BUILDINGS, OBSTACLES, WORLD_HEIGHT, WORLD_WIDTH, roomAt, roomRect, roomWalls, roomFurniture, roomDoor, type Building } from '../config/map.ts';
import { canOccupy, distance } from './geometry.ts';
import type { Rect, Vec } from './types.ts';

export function freeLayoutPoint(p: Vec, obstacles: readonly Rect[], radius = 12): Vec {
  for (let r = 0; r <= 96; r += 32) for (const [dx, dy] of [[0, r], [r, 0], [-r, 0], [0, -r], [r, r], [-r, r]]) {
    const candidate = { x: p.x + dx, y: p.y + dy };
    if (canOccupy(candidate, radius, obstacles, WORLD_WIDTH, WORLD_HEIGHT)) return candidate;
  }
  throw new Error('城市模块缺少合法落点');
}

export interface ExplorationLayout { seed: number; theme: '落尘街区' | '雨后街区' | '青苔街区'; tint: number; debris: (Rect & { frame: number })[]; stashes: Vec[]; roomSides: number[]; medicOffset: number; captainOffset: number; buildings: Building[]; obstacles: Rect[]; template: '疏散通道' | '隔离街垒' | '货运绕行'; barricades: Rect[]; event: { kind: 'supply' | 'rescue' | 'clinic'; point: Vec; reward: { materials: number; energy: number; medkits: number } } }
/** 保留教学首街；其他街区由种子打乱房屋分区、尺寸、门位与街道模块。 */
export function explorationLayout(seed: number, varied = false): ExplorationLayout {
  let state = (seed >>> 0) || 1;
  const random = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; };
  const theme = Math.floor(random() * 3), debris: ExplorationLayout['debris'] = [], stashes: Vec[] = [];
  const variant = Math.floor(random() * 3), buildings = BUILDINGS.map(b => ({ ...b }));
  // 教学街区保留药房/工程师路线；后续街区再进行独立结构随机。
  if (variant === 1) {
    Object.assign(buildings[2], { x: 52, y: 4, width: 9, height: 9, doorColumn: 2 });
    Object.assign(buildings[3], { x: 4, y: 30, width: 8, height: 10, doorColumn: 2 });
    Object.assign(buildings[5], { x: 52, y: 28, width: 10, height: 12, doorColumn: 7 });
  } else if (variant === 2) {
    Object.assign(buildings[2], { x: 54, y: 6, width: 7, height: 9, doorColumn: 4 });
    Object.assign(buildings[3], { x: 2, y: 28, width: 12, height: 10, doorColumn: 8 });
    Object.assign(buildings[5], { x: 54, y: 30, width: 7, height: 10, doorColumn: 2 });
  }
  if (varied) {
    const slots = [{ x: 2, y: 3 }, { x: 27, y: 3 }, { x: 52, y: 3 }, { x: 2, y: 28 }, { x: 27, y: 28 }, { x: 52, y: 28 }];
    for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]]; }
    buildings.forEach((b, i) => {
      const width = 8 + Math.floor(random() * 4), height = 8 + Math.floor(random() * 4);
      Object.assign(b, { x: slots[i].x + Math.floor(random() * 2), y: slots[i].y + Math.floor(random() * 2), width, height, doorColumn: 1 + Math.floor(random() * (width - 2)) });
    });
  }
  const barricades: Rect[] = variant === 1 ? [{ x: 448, y: 848, width: 192, height: 32 }, { x: 1376, y: 960, width: 32, height: 160 }] : variant === 2 ? [{ x: 480, y: 944, width: 32, height: 192 }, { x: 1408, y: 864, width: 160, height: 32 }] : [{ x: 1472, y: 1056, width: 96, height: 32 }];
  const fixed = OBSTACLES.slice(BUILDINGS.reduce((n, b) => n + roomWalls(b).length + roomFurniture(b).length, 0)).filter(o => !buildings.some(b => {
    const r = roomRect(b), d = roomDoor(b); return o.x < r.x + r.width + 12 && o.x + o.width > r.x - 12 && o.y < r.y + r.height + 12 && o.y + o.height > r.y - 12 || distance({ x: o.x + o.width / 2, y: o.y + o.height / 2 }, d) < 82;
  }));
  const structure = [...buildings.flatMap(b => [...roomWalls(b), ...roomFurniture(b)]), ...fixed, ...barricades];
  const candidates = [{ x: 496, y: 752 }, { x: 624, y: 912 }, { x: 1360, y: 608 }, { x: 1520, y: 880 }, { x: 1648, y: 560 }, { x: 432, y: 544 }, { x: 624, y: 1136 }, { x: 1360, y: 1136 }];
  for (const p of candidates) {
    const x = p.x + Math.floor(random() * 17) - 8, y = p.y + Math.floor(random() * 17) - 8;
    if (random() > 0.55 && debris.length < 4 && canOccupy({ x, y }, 35, structure, WORLD_WIDTH, WORLD_HEIGHT) && roomAt({ x, y }, buildings) < 0) debris.push({ x: x - 16, y: y - 16, width: 32, height: 32, frame: random() > 0.5 ? 496 : 545 });
    else if (stashes.length < 3 && canOccupy({ x, y }, 14, structure, WORLD_WIDTH, WORLD_HEIGHT)) stashes.push({ x, y });
  }
  // 奖励不能出现在新增障碍内，或与建筑门洞/碰撞相重叠。
  const obstacles = [...structure, ...debris];
  const eventKind = (['supply', 'rescue', 'clinic'] as const)[Math.floor(random() * 3)], eventRoom = eventKind === 'supply' ? 3 : eventKind === 'rescue' ? 5 : 2;
  const eventDoor = roomDoor(buildings[eventRoom]), point = freeLayoutPoint({ x: eventDoor.x, y: eventDoor.y + 48 }, obstacles);
  return { seed: seed >>> 0, theme: (['落尘街区', '雨后街区', '青苔街区'] as const)[theme], tint: [0x969287, 0x82959c, 0x83977e][theme], debris,
    stashes: stashes.filter(p => canOccupy(p, 12, obstacles, WORLD_WIDTH, WORLD_HEIGHT) && debris.every(d => distance(p, { x: d.x + 16, y: d.y + 16 }) > 80)),
    roomSides: BUILDINGS.map((_, i) => i === 1 ? -1 : random() > 0.5 ? 1 : -1), medicOffset: Math.floor(random() * 3 - 1) * 16, captainOffset: Math.floor(random() * 3 - 1) * 16,
    buildings, obstacles, barricades, template: (['疏散通道', '隔离街垒', '货运绕行'] as const)[variant],
    event: { kind: eventKind, point, reward: eventKind === 'supply' ? { materials: 10, energy: 4, medkits: 0 } : eventKind === 'clinic' ? { materials: 3, energy: 1, medkits: 2 } : { materials: 5, energy: 3, medkits: 1 } } };
}
