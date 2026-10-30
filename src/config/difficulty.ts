/** Shared difficulty presets used by both exploration and lighthouse defense. */
export type Difficulty = 'easy' | 'normal' | 'hard';
export const DIFFICULTIES = {
  easy: { name: '简单', description: '感染者生命与数量减少，适合熟悉探索和布防。', health: 0.75, count: 0.75, damage: 1, speed: 1 },
  normal: { name: '普通', description: '标准生命与尸潮数量，资源规划和交叉火力同样重要。', health: 1, count: 1, damage: 1, speed: 1 },
  hard: { name: '困难', description: '生命+50%、数量+55%、伤害+25%、移动+12%；多向提前进攻，重甲掩护、攻城震击、腐蚀压制，最后30秒狂暴。', health: 1.5, count: 1.55, damage: 1.25, speed: 1.12 },
} as const satisfies Record<Difficulty, { name: string; description: string; health: number; count: number; damage: number; speed: number }>;
export const difficultyFrom = (value: unknown): Difficulty => value === 'easy' || value === 'hard' ? value : 'normal';
