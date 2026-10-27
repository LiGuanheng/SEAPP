/** 前后端共用的纯函数：只给三个阶段的首次胜利计分，不改变战斗规则。 */
export const SCORE_VERSION = 1;
export const GAME_VERSION = '0.12.0';
export type RankDifficulty = 'normal' | 'hard';
export type BoardType = 'speed' | 'score';
export interface StageScore {
  stage: 1 | 2 | 3;
  kills: number;
  bossKills: number;
  lampHealth: number;
  soldiers: number;
}
export const SCORE_RULES = {
  victory: 10_000, kill: 5, killCaps: [120, 220, 340],
  boss: 250, bossCaps: [1, 2, 5], lampPerStage: 1000,
  soldier: 100, efficiency: 3000, maxDurationMs: 86_400_000,
} as const;
export interface ScoreBreakdown { victory: number; combat: number; bosses: number; lighthouse: number; defenders: number; efficiency: number; total: number }
export function validStages(value: unknown): value is StageScore[] {
  return Array.isArray(value) && value.length === 3 && value.every((s: StageScore, i) =>
    !!s && s.stage === i + 1 && Number.isInteger(s.kills) && s.kills >= 0 && s.kills <= 1000 &&
    Number.isInteger(s.bossKills) && s.bossKills >= 0 && s.bossKills <= SCORE_RULES.bossCaps[i] && s.bossKills <= s.kills &&
    Number.isInteger(s.lampHealth) && s.lampHealth >= 1 && s.lampHealth <= 380 &&
    Number.isInteger(s.soldiers) && s.soldiers >= 0 && s.soldiers <= 8);
}
export function calculateScore(stages: StageScore[], durationMs: number): ScoreBreakdown {
  if (!validStages(stages) || !Number.isSafeInteger(durationMs) || durationMs < 120_000 || durationMs > SCORE_RULES.maxDurationMs) throw new Error('无效的完整战役成绩');
  const r = SCORE_RULES;
  const parts = {
    victory: r.victory,
    combat: stages.reduce((n, s, i) => n + Math.min(s.kills - s.bossKills, r.killCaps[i]) * r.kill, 0),
    bosses: stages.reduce((n, s) => n + s.bossKills * r.boss, 0),
    lighthouse: stages.reduce((n, s) => n + Math.floor(s.lampHealth * r.lampPerStage / 380), 0),
    defenders: stages.reduce((n, s) => n + s.soldiers * r.soldier, 0),
    efficiency: Math.max(0, r.efficiency - Math.floor(durationMs / 1000)),
  };
  return { ...parts, total: Object.values(parts).reduce((a, b) => a + b, 0) };
}
export function normalizeNickname(value: string): string { return value.normalize('NFKC').trim(); }
export function validNickname(value: string): boolean { return /^[\p{L}\p{N}_\-· ]{2,16}$/u.test(value) && !/  /.test(value); }
export interface ScoreSubmission {
  runId: string; nickname: string; difficulty: RankDifficulty; durationMs: number;
  score: number; stages: StageScore[]; maxSpeed: 1 | 2 | 3;
  completed: true; scoreVersion: number; gameVersion: string;
}
export interface LeaderboardEntry {
  id: string; nickname: string; difficulty: RankDifficulty; durationMs: number; score: number;
  maxSpeed: number; submittedAt: string;
}
export interface LeaderboardResponse { board: BoardType; difficulty: RankDifficulty; scoreVersion: number; entries: LeaderboardEntry[] }
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}.${Math.floor(ms % 1000 / 10).toString().padStart(2, '0')}`;
}
