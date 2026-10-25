import type { Rect } from '../core/types.ts';

export type StageId = 1 | 2 | 3;
export const STAGES = {
  1: { name: '余烬初守', description: '建立交叉火力，迎击首位巨汉', area: { x: 192, y: 160, width: 1280, height: 768 }, reward: { materials: 12, energy: 4 }, unlock: '电网、维修站；电工与医疗英雄' },
  2: { name: '雾潮围城', description: '控场与维修协作，防备蛛群和毒池', area: { x: 160, y: 128, width: 1472, height: 928 }, reward: { materials: 16, energy: 6 }, unlock: '火焰塔、狙击塔；重火力英雄' },
  3: { name: '长夜决战', description: '空地混合攻势，最终双 Boss 夹击', area: { x: 128, y: 96, width: 1728, height: 1088 }, reward: { materials: 20, energy: 8 }, unlock: '三阶段战役完成，可重试阵地或继续探索' },
} as const satisfies Record<StageId, { name: string; description: string; area: Rect; reward: { materials: number; energy: number }; unlock: string }>;
export const nextStage = (clearedStage = 0): StageId => Math.min(3, clearedStage + 1) as StageId;
export const validStage = (v: unknown): v is StageId => v === 1 || v === 2 || v === 3;
