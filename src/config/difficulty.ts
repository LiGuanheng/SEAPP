/** Shared difficulty presets used by both exploration and lighthouse defense. */
export type Difficulty = 'easy' | 'normal' | 'hard';
export const DIFFICULTIES = {
  easy: { name: '简单', description: '敌人生命和数量减少25%，伤害降低15%，移动稍慢，适合熟悉五阶段战役。', health: 0.75, count: 0.75, damage: 0.85, speed: 0.95 },
  normal: { name: '普通', description: '循序渐进的标准战役；兼顾地面火力、防空与维修，合理收集即可推进。', health: 1, count: 1, damage: 1, speed: 1 },
  hard: { name: '困难', description: '生命最多+20%、数量约+25%、伤害+10%、移动+4%；前两夜逐步提升，第三阶段起启用重甲掩护、震击、腐蚀压制及最后20秒加速。', health: 1.2, count: 1.25, damage: 1.1, speed: 1.04 },
} as const satisfies Record<Difficulty, { name: string; description: string; health: number; count: number; damage: number; speed: number }>;
export const difficultyFrom = (value: unknown): Difficulty => value === 'easy' || value === 'hard' ? value : 'normal';

/** 困难前两夜先熟悉新设施，第三夜起才使用完整困难倍率。白天保留所选难度。 */
export function nightDifficulty(difficulty: Difficulty, stage: number) {
  const preset = DIFFICULTIES[difficulty];
  const ramp = difficulty === 'hard' ? stage === 1 ? 0.25 : stage === 2 ? 0.6 : 1 : 1;
  return { health: 1 + (preset.health - 1) * ramp, count: 1 + (preset.count - 1) * ramp,
    damage: 1 + (preset.damage - 1) * ramp, speed: 1 + (preset.speed - 1) * ramp };
}
