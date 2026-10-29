import type { Rect } from '../core/types.ts';

export const STAGE_COUNT = 5;
export type StageId = 1 | 2 | 3 | 4 | 5;
export const STAGES = {
  1: { name: '余烬初守', description: '建立交叉火力，迎击首位巨汉', area: { x: 320, y: 288, width: 1408, height: 832 }, lightRadius: 480, reward: { materials: 24, energy: 10 }, unlock: '照明与施工扩展 · 防空火炮、电网、维修站 · 可直接进入下一阶段布防' },
  2: { name: '雾潮围城', description: '控场与维修协作，防备蛛群和毒池', area: { x: 192, y: 160, width: 1664, height: 1088 }, lightRadius: 640, reward: { materials: 40, energy: 16 }, unlock: '照明与施工扩展 · 火焰塔、震地锤 · 进入第三阶段' },
  3: { name: '腐羽侵袭', description: '空地混合攻势，阻挡腐羽与双 Boss 夹击', area: { x: 96, y: 96, width: 1856, height: 1216 }, lightRadius: 800, reward: { materials: 64, energy: 24 }, unlock: '照明与施工扩展 · 重型狙击塔、灼光塔 · 进入第四阶段' },
  4: { name: '熔潮突围', description: '交替压制地面与空中威胁，守住扩展防线', area: { x: 32, y: 32, width: 1984, height: 1344 }, lightRadius: 960, reward: { materials: 90, energy: 36 }, unlock: '灯光覆盖全境 · 苍穹重炮开放 · 最终尸潮即将抵达 · 进入第五阶段' },
  5: { name: '破晓终战', description: '六类首领轮番冲击，守住最后一夜迎接破晓', area: { x: 0, y: 0, width: 2048, height: 1408 }, lightRadius: 1120, reward: { materials: 20, energy: 8 }, unlock: '五阶段全部完成，最后一盏灯迎来黎明' },
} as const satisfies Record<StageId, { name: string; description: string; area: Rect; lightRadius: number; reward: { materials: number; energy: number }; unlock: string }>;
export const nextStage = (clearedStage = 0): StageId => Math.min(STAGE_COUNT, clearedStage + 1) as StageId;
export const validStage = (v: unknown): v is StageId => Number.isInteger(v) && typeof v === 'number' && v >= 1 && v <= STAGE_COUNT;
