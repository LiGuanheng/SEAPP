import type { StageId } from '../config/progression.ts';

export const DISTRICTS = ['灯塔外街', '废弃商街', '供电园区', '旧港仓区', '北境医院', '高架残城'] as const;
export interface ExplorationState { version: 1; seed: number; visits: number[]; looted: string[][]; lastDistrict: number; exhausted?: number[] }
export function explorationState(value: ExplorationState | undefined, seed: number): ExplorationState {
  return value ? structuredClone(value) : { version: 1, seed: seed >>> 0, visits: Array(6).fill(0), looted: Array.from({ length: 6 }, () => []), lastDistrict: -1 };
}
export function validExplorationState(v: unknown): v is ExplorationState {
  if (!v || typeof v !== 'object') return false;
  const s = v as ExplorationState;
  return s.version === 1 && (s.exhausted === undefined || Array.isArray(s.exhausted) && s.exhausted.length <= 6 && new Set(s.exhausted).size === s.exhausted.length && s.exhausted.every(i => Number.isInteger(i) && i >= 0 && i < 6)) && Number.isInteger(s.seed) && s.seed >= 0 && s.seed <= 4294967295 && Number.isInteger(s.lastDistrict) && s.lastDistrict >= -1 && s.lastDistrict < 6 &&
    Array.isArray(s.visits) && s.visits.length === 6 && s.visits.every(n => Number.isSafeInteger(n) && n >= 0 && n <= 1000000) &&
    Array.isArray(s.looted) && s.looted.length === 6 && s.looted.every(ids => Array.isArray(ids) && ids.length <= 48 && new Set(ids).size === ids.length && ids.every(id => typeof id === 'string' && /^[a-z0-9-]{1,40}$/.test(id)));
}
export const districtCount = (stage: StageId): number => stage + 1;
export function chooseDistrict(s: ExplorationState, stage: StageId): number {
  const count = districtCount(stage);
  if (stage === 1 && s.visits.every(n => n === 0)) return 0;
  // 新阶段优先去新开放区域；之后优先尚未搜尽、较少访问的街区。
  for (let i = count - 1; i >= 0; i--) if (s.visits[i] === 0) return i;
  return Array.from({ length: count }, (_, i) => i).sort((a, b) => Number(s.exhausted?.includes(a) ?? false) - Number(s.exhausted?.includes(b) ?? false) || s.visits[a] - s.visits[b] || Number(a === s.lastDistrict) - Number(b === s.lastDistrict) || a - b)[0];
}
export function districtSeed(s: ExplorationState, district: number): number { return district === 0 ? s.seed : (s.seed ^ Math.imul(district + 1, 2654435761)) >>> 0; }
