import type { Rect, Vec } from '../core/types.ts';
import { canOccupy } from '../core/geometry.ts';

export const BASE_WIDTH = 1536, BASE_HEIGHT = 1024, GRID = 32, PREPARATION_SECONDS = 30;
export const BUILD_AREA: Rect = { x: 320, y: 256, width: 896, height: 512 };
export const LIGHTHOUSE = { x: 768, y: 512 };
export const LIGHTHOUSE_FOOT: Rect = { x: 736, y: 480, width: 64, height: 64 };
export const BASE_OBSTACLES: readonly Rect[] = [LIGHTHOUSE_FOOT,
  { x: 128, y: 128, width: 192, height: 128 }, { x: 1216, y: 800, width: 192, height: 128 }];
export const RESERVED_ROUTES: readonly Rect[] = [
  { x: 320, y: 480, width: 896, height: 96 }, { x: 720, y: 256, width: 96, height: 512 },
];
export const BUILDINGS = {
  barricade: { name: '沙袋路障', width: 64, height: 32, materials: 3, energy: 0, health: 160, range: 0 },
  turret: { name: '机枪塔', width: 64, height: 64, materials: 6, energy: 2, health: 100, range: 260 },
} as const;
export type BuildingKind = keyof typeof BUILDINGS;
export interface BaseBuilding { id: number; kind: BuildingKind; x: number; y: number; rotation: 0 | 1; health: number; paid: { materials: number; energy: number } }
export interface Soldier extends Vec { id: number; destination: Vec | null; stance: 'move' | 'hold'; moving: boolean; aim: number }
export interface BasePlan { version: 1; status: 'preparing' | 'ready'; elapsed: number; buildings: BaseBuilding[]; soldiers: Soldier[] }
export function buildingRect(b: Pick<BaseBuilding, 'kind' | 'x' | 'y' | 'rotation'>): Rect {
  const c = BUILDINGS[b.kind], rotate = b.kind === 'barricade' && b.rotation === 1;
  return { x: b.x, y: b.y, width: rotate ? c.height : c.width, height: rotate ? c.width : c.height };
}
export const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
export const validPoint = (v: unknown): v is Vec => !!v && typeof v === 'object' &&
  Number.isFinite((v as Vec).x) && Number.isFinite((v as Vec).y) && (v as Vec).x >= 12 && (v as Vec).y >= 12 && (v as Vec).x <= BASE_WIDTH - 12 && (v as Vec).y <= BASE_HEIGHT - 12;

export function validBasePlan(value: unknown): value is BasePlan {
  if (!value || typeof value !== 'object') return false;
  const p = value as BasePlan;
  if (p.version !== 1 || !['preparing', 'ready'].includes(p.status) || !Number.isFinite(p.elapsed) || p.elapsed < 0 || p.elapsed > PREPARATION_SECONDS ||
    (p.status === 'ready' && p.elapsed !== PREPARATION_SECONDS) || !Array.isArray(p.buildings) || p.buildings.length > 14 || !Array.isArray(p.soldiers) || p.soldiers.length < 3 || p.soldiers.length > 4) return false;
  const ids = new Set<number>();
  for (const b of p.buildings) {
    if (!b || !Object.hasOwn(BUILDINGS, b.kind) || !Number.isSafeInteger(b.id) || b.id <= 0 || b.id > 1_000_000 || ids.has(b.id) ||
      !Number.isFinite(b.x) || !Number.isFinite(b.y) || b.x % GRID || b.y % GRID || ![0, 1].includes(b.rotation)) return false;
    const c = BUILDINGS[b.kind], r = buildingRect(b);
    if (!Number.isFinite(b.health) || b.health <= 0 || b.health > c.health || !b.paid || !Number.isInteger(b.paid.materials) ||
      b.paid.materials < c.materials - 1 || b.paid.materials > c.materials || b.paid.energy !== c.energy ||
      r.x < BUILD_AREA.x || r.y < BUILD_AREA.y || r.x + r.width > BUILD_AREA.x + BUILD_AREA.width || r.y + r.height > BUILD_AREA.y + BUILD_AREA.height ||
      [...BASE_OBSTACLES, ...RESERVED_ROUTES, ...p.buildings.filter(other => !!other && other !== b && Object.hasOwn(BUILDINGS, other.kind)).map(buildingRect)].some(o => overlaps(r, o))) return false;
    ids.add(b.id);
  }
  ids.clear();
  for (const s of p.soldiers) {
    if (!s || !validPoint(s) || !Number.isSafeInteger(s.id) || s.id < 1 || s.id > p.soldiers.length || ids.has(s.id) || !['move', 'hold'].includes(s.stance) ||
      (s.destination !== null && !validPoint(s.destination)) || typeof s.moving !== 'boolean' || !Number.isFinite(s.aim) ||
      (s.stance === 'hold' && (s.destination !== null || s.moving)) || (s.stance === 'move' && s.destination === null) || (p.status === 'ready' && s.moving) ||
      !canOccupy(s, 11, [...BASE_OBSTACLES, ...p.buildings.map(buildingRect)], BASE_WIDTH, BASE_HEIGHT) ||
      (s.destination && !canOccupy(s.destination, 11, [...BASE_OBSTACLES, ...p.buildings.map(buildingRect)], BASE_WIDTH, BASE_HEIGHT))) return false;
    ids.add(s.id);
  }
  return true;
}
