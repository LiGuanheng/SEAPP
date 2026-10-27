import type { Rect } from '../core/types.ts';

export type StageId = 1 | 2 | 3;
export const STAGES = {
  1: { name: '余烬初守', description: '建立交叉火力，迎击首位巨汉', area: { x: 64, y: 96, width: 1408, height: 832 }, lightRadius: 390, reward: { materials: 24, energy: 10 }, unlock: '照明与施工扩展 · 电网、维修站 · 可直接进入下一阶段布防' },
  2: { name: '雾潮围城', description: '控场与维修协作，防备蛛群和毒池', area: { x: 0, y: 0, width: 1664, height: 1056 }, lightRadius: 530, reward: { materials: 36, energy: 12 }, unlock: '照明与施工扩展 · 火焰塔、狙击塔 · 可直接进入最终布防' },
  3: { name: '长夜决战', description: '空地混合攻势，最终双 Boss 夹击', area: { x: 0, y: 0, width: 1856, height: 1184 }, lightRadius: 690, reward: { materials: 20, energy: 8 }, unlock: '三阶段战役完成，查看总成绩与排行榜' },
} as const satisfies Record<StageId, { name: string; description: string; area: Rect; lightRadius: number; reward: { materials: number; energy: number }; unlock: string }>;
export const nextStage = (clearedStage = 0): StageId => Math.min(3, clearedStage + 1) as StageId;
export const validStage = (v: unknown): v is StageId => v === 1 || v === 2 || v === 3;
