/** Shared difficulty presets used by both exploration and lighthouse defense. */
export type Difficulty = 'easy' | 'normal' | 'hard';
export const DIFFICULTIES = {
  easy: { name: '简单', description: '感染者生命与数量减少，适合熟悉探索和布防。', health: 0.75, count: 0.75 },
  normal: { name: '普通', description: '标准生命与尸潮数量，资源规划和交叉火力同样重要。', health: 1, count: 1 },
  hard: { name: '困难', description: '感染者生命提高25%，数量增加18%，需要更紧密的防线。', health: 1.25, count: 1.18 },
} as const satisfies Record<Difficulty, { name: string; description: string; health: number; count: number }>;
export const difficultyFrom = (value: unknown): Difficulty => value === 'easy' || value === 'hard' ? value : 'normal';
