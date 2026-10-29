import type { Rect, Vec } from '../core/types.ts';
import { canOccupy } from '../core/geometry.ts';
import { STAGE_COUNT, STAGES, validStage, type StageId } from './progression.ts';

export const BASE_WIDTH = 2048, BASE_HEIGHT = 1408, GRID = 32;
export const BUILD_AREA: Rect = STAGES[STAGE_COUNT].area;
export const LIGHTHOUSE = { x: BASE_WIDTH / 2, y: BASE_HEIGHT / 2 };
export const LIGHTHOUSE_FOOT: Rect = { x: LIGHTHOUSE.x - 32, y: LIGHTHOUSE.y - 32, width: 64, height: 64 };
export const BASE_OBSTACLES: readonly Rect[] = [LIGHTHOUSE_FOOT,
  { x: 160, y: 128, width: 192, height: 128 }, { x: 1696, y: 1088, width: 192, height: 128 }];
export const RESERVED_ROUTES: readonly Rect[] = [
  { x: BUILD_AREA.x, y: LIGHTHOUSE.y - 32, width: BUILD_AREA.width, height: 96 }, { x: LIGHTHOUSE.x - 48, y: BUILD_AREA.y, width: 96, height: BUILD_AREA.height },
];
// 十字通道直达四向入口，无需另占外侧施工条带。
export const OUTER_ENTRY_AREAS: readonly Rect[] = [];
export const BUILDINGS = {
  barricade: { name: '沙袋路障', width: 64, height: 32, materials: 3, energy: 0, health: 160, range: 0, stage: 1, tint: 0xb9a47e, description: '耐久掩体 · 可旋转 · 拖延地面敌人' },
  turret: { name: '机枪塔', width: 64, height: 64, materials: 6, energy: 2, health: 100, range: 260, stage: 1, tint: 0x9db8a4, description: '对空/地 · 20伤害 / 0.18s · 快速单体' },
  cannon: { name: '加农炮', width: 64, height: 64, materials: 7, energy: 3, health: 105, range: 310, stage: 1, tint: 0xc2ac83, description: '仅对地 · 68伤害 / 1.8s · 62范围爆炸' },
  arrowtower: { name: '箭塔', width: 64, height: 64, materials: 5, energy: 0, health: 90, range: 340, stage: 1, tint: 0xb4ba88, description: '对空/地 · 32伤害 / 0.72s · 无电力' },
  wall: { name: '木栅城墙', width: 32, height: 32, materials: 1, energy: 0, health: 80, range: 0, stage: 1, tint: 0xb79c7a, description: '低价阻挡 · 可被攻破 · 配合外围火力' },
  grid: { name: '电网装置', width: 64, height: 64, materials: 6, energy: 3, health: 110, range: 150, stage: 2, tint: 0x80c9d0, description: '仅对地 · 每0.6s范围4伤害 · 减速45%持续0.9s' },
  repair: { name: '维修站', width: 64, height: 64, materials: 7, energy: 3, health: 125, range: 180, stage: 2, tint: 0x94cfb1, description: '支援 · 每3s修复附近其他设施8耐久 · 不修灯塔' },
  flame: { name: '火焰塔', width: 64, height: 64, materials: 8, energy: 3, health: 140, range: 145, stage: 3, tint: 0xe1a06b, description: '仅对地 · 每0.3s范围12伤害 · 克制密集蛛群' },
  sniper: { name: '重型狙击塔', width: 64, height: 64, materials: 24, energy: 8, health: 210, range: 600, stage: 4, tint: 0xb6b9d4, description: '对空/地 · 230伤害 / 1.8s · 优先Boss · 脆弱' },
  antiair: { name: '防空火炮', width: 64, height: 64, materials: 9, energy: 4, health: 125, range: 430, stage: 2, tint: 0x9ccfe3, description: '仅对空 · 75伤害 / 0.9s · 70范围破片，不攻击地面' },
  pounder: { name: '震地锤', width: 64, height: 64, materials: 15, energy: 4, health: 320, range: 130, stage: 3, tint: 0xc6a17a, description: '仅对地 · 100范围伤害/1.4秒 · 近身震击减速' },
  inferno: { name: '灼光塔', width: 64, height: 64, materials: 30, energy: 12, health: 250, range: 350, stage: 4, tint: 0xee9160, description: '对空/地 · 持续锁定升温 · 克制重甲与Boss' },
  eagle: { name: '苍穹重炮', width: 64, height: 64, materials: 48, energy: 18, health: 360, range: 820, stage: 5, tint: 0xe5ce89, description: '仅对地 · 240伤害/3.6秒 · 110范围远程炮击' },
} as const;
export type BuildingKind = keyof typeof BUILDINGS;
export const TOWER_ATTACKS = {
  turret: { damage: 20, interval: 0.18, speed: 850, splash: 0, projectile: 'bullet' },
  cannon: { damage: 68, interval: 1.8, speed: 340, splash: 62, projectile: 'shell' },
  arrowtower: { damage: 32, interval: 0.72, speed: 760, splash: 0, projectile: 'arrow' },
  sniper: { damage: 230, interval: 1.8, speed: 1200, splash: 0, projectile: 'bullet' },
  eagle: { damage: 240, interval: 3.6, speed: 520, splash: 110, projectile: 'shell' },
  antiair: { damage: 75, interval: 0.9, speed: 720, splash: 70, projectile: 'flak' },
} as const;
export const FIELD_SYSTEMS = { grid: { interval: 0.6, damage: 4, slow: 0.9 }, flame: { interval: 0.3, damage: 12 }, repair: { interval: 3, heal: 8 } } as const;
export const BUILDING_KEYS = ['barricade', 'turret', 'cannon', 'arrowtower', 'wall', 'grid', 'repair', 'flame', 'sniper', 'antiair', 'pounder', 'inferno', 'eagle'] as const;
export const REFITS = {
  flak: { kind: 'turret', name: '双联高射炮', stage: 2, materials: 6, energy: 2, health: 125, range: 340, tint: 0xa8bfa9, description: '仅对空 · 28伤害/0.65秒 · 56范围破片' },
  howitzer: { kind: 'cannon', name: '重型榴弹炮', stage: 3, materials: 10, energy: 4, health: 145, range: 460, tint: 0xc9ae82, description: '仅对地 · 110伤害/3.2秒 · 100范围爆炸' },
} as const;
export type RefitKind = keyof typeof REFITS;
export interface BaseBuilding { id: number; kind: BuildingKind; x: number; y: number; rotation: 0 | 1; health: number; paid: { materials: number; energy: number }; upgrade?: RefitKind; upgradePaid?: { materials: number; energy: number } }
export const refitFor = (kind: BuildingKind): RefitKind | undefined => kind === 'turret' ? 'flak' : kind === 'cannon' ? 'howitzer' : undefined;
export const buildingStats = (b: Pick<BaseBuilding, 'kind' | 'upgrade'>) => b.upgrade ? { ...BUILDINGS[b.kind], ...REFITS[b.upgrade] } : BUILDINGS[b.kind];
export const saleRefund = (b: Pick<BaseBuilding, 'paid' | 'upgradePaid'>): number => Math.max(1, Math.floor((b.paid.materials + (b.upgradePaid?.materials ?? 0)) / 2));
export interface Soldier extends Vec { id: number; destination: Vec | null; stance: 'move' | 'hold'; moving: boolean; aim: number; role?: 'rifle' | 'archer' | 'vanguard' | 'guardian' | 'gunner' | 'sentinel' | 'striker' }
export interface BasePlan { version: 1 | 2; stage?: StageId; status: 'preparing' | 'ready'; elapsed: number; buildings: BaseBuilding[]; soldiers: Soldier[] }
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
  if (![1, 2].includes(p.version) || !['preparing', 'ready'].includes(p.status) || !Number.isFinite(p.elapsed) || p.elapsed < 0 ||
    (p.stage !== undefined && !validStage(p.stage)) || !Array.isArray(p.buildings) || !Array.isArray(p.soldiers) || p.soldiers.length < 3 || p.soldiers.length > 12) return false;
  const ids = new Set<number>();
  for (const b of p.buildings) {
    if (!b || !Object.hasOwn(BUILDINGS, b.kind) || !Number.isSafeInteger(b.id) || b.id <= 0 || b.id > 1_000_000 || ids.has(b.id) ||
      !Number.isFinite(b.x) || !Number.isFinite(b.y) || b.x % GRID || b.y % GRID || ![0, 1].includes(b.rotation)) return false;
    if (b.upgrade !== undefined && (!Object.hasOwn(REFITS, b.upgrade) || REFITS[b.upgrade].kind !== b.kind || !b.upgradePaid || !Number.isInteger(b.upgradePaid.materials) || b.upgradePaid.materials < REFITS[b.upgrade].materials - 1 || b.upgradePaid.materials > REFITS[b.upgrade].materials || b.upgradePaid.energy !== REFITS[b.upgrade].energy)) return false;
    if (b.upgrade === undefined && b.upgradePaid !== undefined) return false;
    if (b.upgrade && p.stage !== undefined && REFITS[b.upgrade].stage > p.stage) return false;
    const c = BUILDINGS[b.kind], r = buildingRect(b);
    if (!Number.isFinite(b.health) || b.health <= 0 || b.health > buildingStats(b).health || !b.paid || !Number.isInteger(b.paid.materials) ||
      b.paid.materials < 1 || b.paid.materials > c.materials || !Number.isInteger(b.paid.energy) || b.paid.energy < 0 || b.paid.energy > c.energy ||
      r.x < BUILD_AREA.x || r.y < BUILD_AREA.y || r.x + r.width > BUILD_AREA.x + BUILD_AREA.width || r.y + r.height > BUILD_AREA.y + BUILD_AREA.height ||
      [...BASE_OBSTACLES, ...RESERVED_ROUTES, ...p.buildings.filter(other => !!other && other !== b && Object.hasOwn(BUILDINGS, other.kind)).map(buildingRect)].some(o => overlaps(r, o))) return false;
    ids.add(b.id);
  }
  ids.clear();
  for (const s of p.soldiers) {
    if (!s || !validPoint(s) || (s.role !== undefined && !['rifle', 'archer', 'vanguard', 'guardian', 'gunner', 'sentinel', 'striker'].includes(s.role)) || !Number.isSafeInteger(s.id) || s.id < 1 || s.id > p.soldiers.length || ids.has(s.id) || !['move', 'hold'].includes(s.stance) ||
      (s.destination !== null && !validPoint(s.destination)) || typeof s.moving !== 'boolean' || !Number.isFinite(s.aim) ||
      (s.stance === 'hold' && (s.destination !== null || s.moving)) || (s.stance === 'move' && s.destination === null) || (p.status === 'ready' && s.moving) ||
      !canOccupy(s, 11, [...BASE_OBSTACLES, ...p.buildings.map(buildingRect)], BASE_WIDTH, BASE_HEIGHT) ||
      (s.destination && !canOccupy(s.destination, 11, [...BASE_OBSTACLES, ...p.buildings.map(buildingRect)], BASE_WIDTH, BASE_HEIGHT))) return false;
    ids.add(s.id);
  }
  return true;
}
