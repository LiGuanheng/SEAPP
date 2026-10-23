import type { Rect, Vec } from '../core/types.ts';

export const TILE = 32, COLS = 64, ROWS = 44;
export const WORLD_WIDTH = COLS * TILE, WORLD_HEIGHT = ROWS * TILE;
export const PLAYER_SPAWN: Vec = { x: 30.5 * TILE, y: 22.5 * TILE };
export interface Building { x: number; y: number; width: number; height: number; theme: number; label: string }
export const BUILDINGS: Building[] = [
  { x: 3, y: 4, width: 10, height: 11, theme: 8, label: '北境维修站' },
  { x: 28, y: 5, width: 11, height: 11, theme: 0, label: '旧城药房' },
  { x: 53, y: 5, width: 8, height: 10, theme: 16, label: '供电管理' },
  { x: 3, y: 29, width: 10, height: 11, theme: 0, label: '工业仓库' },
  { x: 28, y: 29, width: 11, height: 11, theme: 8, label: '无人便利店' },
  { x: 53, y: 29, width: 8, height: 11, theme: 24, label: '旧公寓' },
];
export const CARS = [
  { x: 12, y: 19, style: 'gray' }, { x: 36, y: 18, style: 'green' },
  { x: 45, y: 10, style: 'gray' }, { x: 18, y: 32, style: 'green' },
  { x: 52, y: 23, style: 'gray' }, { x: 7, y: 24, style: 'green' },
] as const;
export interface Decoration { x: number; y: number; kind: 'tree' | 'bin' | 'litter' | 'grass' }
export const DECORATIONS: Decoration[] = [];
for (let y = 2; y < ROWS - 2; y++) for (let x = 2; x < COLS - 2; x++) {
  const hash = (x * 137 + y * 79 + x * y * 3) % 83;
  if (BUILDINGS.some(b => x >= b.x - 1 && x <= b.x + b.width && y >= b.y - 1 && y <= b.y + b.height)) continue;
  if (CARS.some(c => x >= c.x - 1 && x <= c.x + 3 && y >= c.y - 1 && y <= c.y + 2)) continue;
  if (!isRoad(x, y) && hash < 3) DECORATIONS.push({ x, y, kind: 'tree' });
  else if (!isRoad(x, y) && hash === 7) DECORATIONS.push({ x, y, kind: 'bin' });
  else if (hash === 12) DECORATIONS.push({ x, y, kind: 'litter' });
  else if (hash === 19 && !isRoad(x, y)) DECORATIONS.push({ x, y, kind: 'grass' });
}
export const OBSTACLES: Rect[] = [
  ...BUILDINGS.map(b => ({ x: b.x * TILE, y: b.y * TILE, width: b.width * TILE, height: b.height * TILE })),
  ...CARS.map(c => ({ x: c.x * TILE + 4, y: c.y * TILE + 12, width: TILE * 3 - 8, height: TILE * 2 - 16 })),
  ...DECORATIONS.filter(d => d.kind === 'tree' || d.kind === 'bin').map(d => ({ x: d.x * TILE + 11, y: d.y * TILE + 17, width: 10, height: 12 })),
];
export function isRoad(x: number, y: number): boolean { return y >= 18 && y <= 25 || x >= 17 && x <= 24 || x >= 43 && x <= 50; }
export function groundTile(x: number, y: number): number {
  if (isRoad(x, y)) {
    if (y === 21 && !((x >= 17 && x <= 24) || (x >= 43 && x <= 50))) return 716;
    if ((x === 20 || x === 46) && !(y >= 18 && y <= 25)) return 791;
    if ((x === 16 || x === 42) && y >= 19 && y <= 24) return 824;
    return 714;
  }
  if (x < 2 || x > 61 || y < 2 || y > 41) return (x + y) % 7 === 0 ? 966 : 964;
  return (x * 13 + y * 7) % 29 === 0 ? 777 : 704;
}
