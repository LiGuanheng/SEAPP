import type { Rect, Vec } from '../core/types.ts';
import { canOccupy } from '../core/geometry.ts';
import { STAGES, validStage, type StageId } from './progression.ts';

export const BASE_WIDTH = 2048, BASE_HEIGHT = 1408, GRID = 32, PREPARATION_SECONDS = 30;
export const BUILD_AREA: Rect = STAGES[3].area;
export const LIGHTHOUSE = { x: 768, y: 512 };
export const LIGHTHOUSE_FOOT: Rect = { x: 736, y: 480, width: 64, height: 64 };
export const BASE_OBSTACLES: readonly Rect[] = [LIGHTHOUSE_FOOT,
  { x: 128, y: 128, width: 192, height: 128 }, { x: 1216, y: 800, width: 192, height: 128 }];
export const RESERVED_ROUTES: readonly Rect[] = [
  { x: BUILD_AREA.x, y: 480, width: BUILD_AREA.width, height: 96 }, { x: 720, y: BUILD_AREA.y, width: 96, height: BUILD_AREA.height },
];
export const BUILDINGS = {
  barricade: { name: '沙袋路障', width: 64, height: 32, materials: 3, energy: 0, health: 160, range: 0, stage: 1, tint: 0xb9a47e, description: '耐久掩体 · 可旋转 · 拖延地面敌人' },
  turret: { name: '机枪塔', width: 64, height: 64, materials: 6, energy: 2, health: 100, range: 260, stage: 1, tint: 0x9db8a4, description: '对空/地 · 20伤害 / 0.18s · 快速单体' },
  cannon: { name: '加农炮', width: 64, height: 64, materials: 7, energy: 3, health: 105, range: 310, stage: 1, tint: 0xc2ac83, description: '仅对地 · 68伤害 / 1.8s · 62范围爆炸' },
  arrowtower: { name: '箭塔', width: 64, height: 64, materials: 5, energy: 0, health: 90, range: 340, stage: 1, tint: 0xb4ba88, description: '对空/地 · 32伤害 / 0.72s · 无电力' },
  wall: { name: '木栅城墙', width: 32, height: 32, materials: 1, energy: 0, health: 80, range: 0, stage: 1, tint: 0xb79c7a, description: '低价阻挡 · 可被攻破 · 配合外围火力' },
  grid: { name: '电网装置', width: 64, height: 64, materials: 6, energy: 3, health: 110, range: 150, stage: 2, tint: 0x80c9d0, description: '仅对地 · 每0.6s范围4伤害 · 减速45%持续0.9s' },
  repair: { name: '维修站', width: 64, height: 64, materials: 7, energy: 3, health: 125, range: 180, stage: 2, tint: 0x94cfb1, description: '支援 · 每3s修复附近其他设施8耐久 · 不修灯塔' },
  flame: { name: '火焰塔', width: 64, height: 64, materials: 8, energy: 3, health: 140, range: 145, stage: 3, tint: 0xe1a06b, description: '仅对地 · 每0.3s范围12伤害 · 克制密集蛛群' },
  sniper: { name: '狙击塔', width: 64, height: 64, materials: 10, energy: 4, health: 85, range: 520, stage: 3, tint: 0xb6b9d4, description: '对空/地 · 115伤害 / 2.4s · 优先Boss · 脆弱' },
} as const;
export type BuildingKind = keyof typeof BUILDINGS;
export const TOWER_ATTACKS = {
  turret: { damage: 20, interval: 0.18, speed: 850, splash: 0, projectile: 'bullet' },
  cannon: { damage: 68, interval: 1.8, speed: 340, splash: 62, projectile: 'shell' },
  arrowtower: { damage: 32, interval: 0.72, speed: 760, splash: 0, projectile: 'arrow' },
  sniper: { damage: 115, interval: 2.4, speed: 1200, splash: 0, projectile: 'bullet' },
} as const;
export const FIELD_SYSTEMS = { grid: { interval: 0.6, damage: 4, slow: 0.9 }, flame: { interval: 0.3, damage: 12 }, repair: { interval: 3, heal: 8 } } as const;
export const BUILDING_KEYS = ['barricade', 'turret', 'cannon', 'arrowtower', 'wall', 'grid', 'repair', 'flame', 'sniper'] as const;
export interface BaseBuilding { id: number; kind: BuildingKind; x: number; y: number; rotation: 0 | 1; health: number; paid: { materials: number; energy: number } }
export const saleRefund = (b: Pick<BaseBuilding, 'paid'>): number => Math.max(1, Math.floor(b.paid.materials / 2));
export interface Soldier extends Vec { id: number; destination: Vec | null; stance: 'move' | 'hold'; moving: boolean; aim: number; role?: 'rifle' | 'archer' | 'vanguard' | 'guardian' | 'gunner' }
export interface BasePlan { version: 1; stage?: StageId; status: 'preparing' | 'ready'; elapsed: number; buildings: BaseBuilding[]; soldiers: Soldier[] }
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
    (p.stage !== undefined && !validStage(p.stage)) || (p.status === 'ready' && p.elapsed !== PREPARATION_SECONDS) || !Array.isArray(p.buildings) || !Array.isArray(p.soldiers) || p.soldiers.length < 3 || p.soldiers.length > 8) return false;
  const ids = new Set<number>();
  for (const b of p.buildings) {
    if (!b || !Object.hasOwn(BUILDINGS, b.kind) || !Number.isSafeInteger(b.id) || b.id <= 0 || b.id > 1_000_000 || ids.has(b.id) ||
      !Number.isFinite(b.x) || !Number.isFinite(b.y) || b.x % GRID || b.y % GRID || ![0, 1].includes(b.rotation)) return false;
    const c = BUILDINGS[b.kind], r = buildingRect(b);
    if (!Number.isFinite(b.health) || b.health <= 0 || b.health > c.health || !b.paid || !Number.isInteger(b.paid.materials) ||
      b.paid.materials < Math.max(1, c.materials - 1) || b.paid.materials > c.materials || b.paid.energy !== c.energy ||
      r.x < BUILD_AREA.x || r.y < BUILD_AREA.y || r.x + r.width > BUILD_AREA.x + BUILD_AREA.width || r.y + r.height > BUILD_AREA.y + BUILD_AREA.height ||
      [...BASE_OBSTACLES, ...RESERVED_ROUTES, ...p.buildings.filter(other => !!other && other !== b && Object.hasOwn(BUILDINGS, other.kind)).map(buildingRect)].some(o => overlaps(r, o))) return false;
    ids.add(b.id);
  }
  ids.clear();
  for (const s of p.soldiers) {
    if (!s || !validPoint(s) || (s.role !== undefined && !['rifle', 'archer', 'vanguard', 'guardian', 'gunner'].includes(s.role)) || !Number.isSafeInteger(s.id) || s.id < 1 || s.id > p.soldiers.length || ids.has(s.id) || !['move', 'hold'].includes(s.stance) ||
      (s.destination !== null && !validPoint(s.destination)) || typeof s.moving !== 'boolean' || !Number.isFinite(s.aim) ||
      (s.stance === 'hold' && (s.destination !== null || s.moving)) || (s.stance === 'move' && s.destination === null) || (p.status === 'ready' && s.moving) ||
      !canOccupy(s, 11, [...BASE_OBSTACLES, ...p.buildings.map(buildingRect)], BASE_WIDTH, BASE_HEIGHT) ||
      (s.destination && !canOccupy(s.destination, 11, [...BASE_OBSTACLES, ...p.buildings.map(buildingRect)], BASE_WIDTH, BASE_HEIGHT))) return false;
    ids.add(s.id);
  }
  return true;
}
