import type { Rect } from '../core/types.ts';

export const STAGE_COUNT = 5;
export type StageId = 1 | 2 | 3 | 4 | 5;
export const STAGES = {
  1: { name: '余烬初守', description: '建立交叉火力，迎击首位巨汉', area: { x: 64, y: 96, width: 1408, height: 832 }, lightRadius: 390, reward: { materials: 24, energy: 10 }, unlock: '照明与施工扩展 · 电网、维修站 · 可直接进入下一阶段布防' },
  2: { name: '雾潮围城', description: '控场与维修协作，防备蛛群和毒池', area: { x: 0, y: 0, width: 1664, height: 1056 }, lightRadius: 530, reward: { materials: 36, energy: 12 }, unlock: '照明与施工扩展 · 火焰塔、狙击塔 · 进入第三阶段' },
  3: { name: '腐羽侵袭', description: '空地混合攻势，阻挡腐羽与双 Boss 夹击', area: { x: 0, y: 0, width: 1856, height: 1184 }, lightRadius: 690, reward: { materials: 48, energy: 18 }, unlock: '照明与施工扩展 · 深入熔潮防线 · 进入第四阶段' },
  4: { name: '熔潮突围', description: '交替压制地面与空中威胁，守住扩展防线', area: { x: 0, y: 0, width: 1952, height: 1312 }, lightRadius: 800, reward: { materials: 64, energy: 24 }, unlock: '灯光覆盖全境 · 最终尸潮即将抵达 · 进入第五阶段' },
  5: { name: '破晓终战', description: '六类首领轮番冲击，守住最后一夜迎接破晓', area: { x: 0, y: 0, width: 2048, height: 1408 }, lightRadius: 930, reward: { materials: 20, energy: 8 }, unlock: '五阶段全部完成，最后一盏灯迎来黎明' },
} as const satisfies Record<StageId, { name: string; description: string; area: Rect; lightRadius: number; reward: { materials: number; energy: number }; unlock: string }>;
export const nextStage = (clearedStage = 0): StageId => Math.min(STAGE_COUNT, clearedStage + 1) as StageId;
export const validStage = (v: unknown): v is StageId => Number.isInteger(v) && typeof v === 'number' && v >= 1 && v <= STAGE_COUNT;
