import type { EnemyKind, LightLevel, LocationId, Point, SurvivorId, TowerKind, UpgradeId, WeaponId } from './types.ts';

export const COLS = 14;
export const ROWS = 9;
export const LAST_DAY = 5;
export const PATH: Point[] = [
  { x: 0, y: 4 }, { x: 3, y: 4 }, { x: 3, y: 2 }, { x: 7, y: 2 },
  { x: 7, y: 6 }, { x: 10, y: 6 }, { x: 10, y: 4 }, { x: 12, y: 4 },
];
export const PADS: Point[] = [
  { x: 1, y: 3 }, { x: 2, y: 5 }, { x: 2, y: 2 }, { x: 4, y: 3 },
  { x: 5, y: 1 }, { x: 6, y: 3 }, { x: 6, y: 5 }, { x: 8, y: 3 },
  { x: 8, y: 5 }, { x: 9, y: 7 }, { x: 11, y: 5 }, { x: 11, y: 3 },
];
export const SQUAD_SPOTS: Point[] = [{ x: 4, y: 5 }, { x: 8, y: 7 }, { x: 9, y: 3 }];
export const SQUAD_COST = 45;
export const SURVIVORS: Record<SurvivorId, { name: string; role: string; description: string }> = {
  engineer: { name: '林岚', role: '工程师', description: '此后每次探索额外带回 8 材料。' },
  medic: { name: '陈安', role: '战地医生', description: '每次守夜成功后，修复灯塔 12 耐久。' },
  captain: { name: '周野', role: '退役队长', description: '所有守备小队伤害提高 25%。' },
};
export const WEAPONS: Record<WeaponId, { name: string; description: string }> = {
  molotov: { name: '燃烧瓶', description: '全场感染者立即受到 20 伤害，持续 4 秒每秒灼烧 12 伤害。' },
  emp: { name: '震荡弹', description: '全场感染者受到 15 伤害，并减速 55%，持续 5 秒。' },
};
export const PATH_LENGTH = PATH.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - PATH[i].x, p.y - PATH[i].y), 0);
export function positionAt(distance: number): Point {
  let left = Math.max(0, distance);
  for (let i = 1; i < PATH.length; i++) {
    const a = PATH[i - 1], b = PATH[i];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= length) return { x: a.x + (b.x - a.x) * left / length, y: a.y + (b.y - a.y) * left / length };
    left -= length;
  }
  return { ...PATH[PATH.length - 1] };
}
export const TOWERS: Record<TowerKind, { name: string; short: string; cost: number; damage: number; range: number; interval: number; color: string; description: string }> = {
  sentry: { name: '哨戒塔', short: '哨', cost: 32, damage: 18, range: 2.65, interval: 0.85, color: '#8fc9b7', description: '稳定单体火力 · 优先攻击前方敌人' },
  frost: { name: '霜冻塔', short: '霜', cost: 40, damage: 9, range: 2.4, interval: 1.15, color: '#99bedb', description: '命中减速 55% · 持续 2 秒' },
  mortar: { name: '爆破塔', short: '爆', cost: 55, damage: 30, range: 2.8, interval: 1.9, color: '#e8ad7a', description: '范围爆破 · 命中周围 1.1 格敌人' },
};
export const ENEMIES: Record<EnemyKind, { name: string; health: number; speed: number; damage: number; reward: number; color: string }> = {
  drifter: { name: '普通感染者', health: 32, speed: 0.85, damage: 10, reward: 3, color: '#a5ad7e' },
  runner: { name: '疾奔感染者', health: 23, speed: 1.48, damage: 8, reward: 3, color: '#c2a377' },
  brute: { name: '重型变异体', health: 90, speed: 0.58, damage: 22, reward: 7, color: '#ab8194' },
};
export const LIGHTS: Record<LightLevel, { name: string; subtitle: string; drain: number; range: number; reward: number; attraction: number }> = {
  low: { name: '微光', subtitle: '节能 · 射程 −15%', drain: 0.22, range: 0.85, reward: 0.85, attraction: -2 },
  normal: { name: '标准', subtitle: '均衡 · 标准收益', drain: 0.45, range: 1, reward: 1, attraction: 0 },
  high: { name: '强光', subtitle: '射程 +20% · 敌人 +3', drain: 0.78, range: 1.2, reward: 1.2, attraction: 3 },
};
export const LOCATIONS: Record<LocationId, { name: string; subtitle: string; description: string; materials: number; energy: number; risk: number; icon: string }> = {
  ruins: { name: '旧城废墟', subtitle: '材料补给', description: '材料 28–38 · 风险 15%', materials: 28, energy: 5, risk: 0.15, icon: 'ruins' },
  station: { name: '废弃电站', subtitle: '能源补给', description: '能源 27–37 · 风险 20%', materials: 10, energy: 27, risk: 0.2, icon: 'energy' },
  warehouse: { name: '迷雾仓库', subtitle: '高风险 / 高收益', description: '材料 40–50 · 能源 18–28 · 风险 40%', materials: 40, energy: 18, risk: 0.4, icon: 'box' },
};
export const UPGRADES: Record<UpgradeId, { name: string; description: string; tag: string }> = {
  ammunition: { name: '改良弹药', description: '所有防御设施伤害 +20%。', tag: '火力' },
  optics: { name: '远距透镜', description: '所有防御设施基础射程 +0.35 格。', tag: '射程' },
  capacitor: { name: '节能电容', description: '夜间灯光耗能减少 20%，获得 15 能源。', tag: '能源' },
  scavenger: { name: '拾荒指南', description: '探索收益 +20%，立即获得 15 材料。', tag: '探索' },
  fortify: { name: '灯塔加固', description: '最大耐久 +20，立即恢复 30 耐久。', tag: '生存' },
  supply: { name: '应急储备', description: '立即获得 40 材料和 20 能源。', tag: '补给' },
};
