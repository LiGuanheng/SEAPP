/** 前后端共用的纯函数：只给三个阶段的首次胜利计分，不改变战斗规则。 */
export const SCORE_VERSION = 2;
export const GAME_VERSION = '0.13.0';
export type RankDifficulty = 'normal' | 'hard';
export type BoardType = 'speed' | 'score';
export type ScoreScope = 'clear' | 'challenge' | 'demo';
export type RunOutcome = 'victory' | 'defeat' | 'retired';
export const SCOPE_NAMES: Record<ScoreScope, string> = { clear: '正式通关榜', challenge: '挑战成绩榜', demo: '课堂演示榜' };
export const OUTCOME_NAMES: Record<RunOutcome, string> = { victory: '完整通关', defeat: '本局失败', retired: '主动结算' };
export interface ExplorationScore { kills: number; caches: number; rescued: number }
export interface StageScore {
  stage: 1 | 2 | 3;
  kills: number;
  bossKills: number;
  lampHealth: number;
  soldiers: number;
  cleared?: boolean;
}
export const SCORE_RULES = {
  victory: 10_000, kill: 5, killCaps: [120, 220, 340],
  boss: 250, bossCaps: [1, 2, 5], lampPerStage: 1000,
  soldier: 100, efficiency: 3000, maxDurationMs: 86_400_000,
} as const;
export interface ScoreBreakdown { victory: number; combat: number; bosses: number; lighthouse: number; defenders: number; exploration: number; efficiency: number; total: number }
export function validStages(value: unknown, completed = true): value is StageScore[] {
  return Array.isArray(value) && value.length <= 3 && (!completed || value.length === 3) && value.every((s: StageScore, i) =>
    !!s && [1, 2, 3].includes(s.stage) && (i === 0 || s.stage > value[i - 1].stage) && (!completed || s.stage === i + 1 && s.cleared !== false) &&
    (s.cleared === undefined || typeof s.cleared === 'boolean') && Number.isInteger(s.kills) && s.kills >= 0 && s.kills <= 1000 &&
    Number.isInteger(s.bossKills) && s.bossKills >= 0 && s.bossKills <= SCORE_RULES.bossCaps[s.stage - 1] && s.bossKills <= s.kills &&
    Number.isInteger(s.lampHealth) && s.lampHealth >= (s.cleared === false ? 0 : 1) && s.lampHealth <= 380 &&
    Number.isInteger(s.soldiers) && s.soldiers >= 0 && s.soldiers <= 8);
}
export function calculateScore(stages: StageScore[], durationMs: number, options: { completed?: boolean; exploration?: ExplorationScore } = {}): ScoreBreakdown {
  const completed = options.completed ?? true, e = options.exploration ?? { kills: 0, caches: 0, rescued: 0 };
  if (!validStages(stages, completed) || !Number.isSafeInteger(durationMs) || durationMs < (completed ? 120_000 : 0) || durationMs > SCORE_RULES.maxDurationMs ||
    ![e.kills, e.caches, e.rescued].every(n => Number.isSafeInteger(n) && n >= 0) || e.kills > 1000 || e.caches > 200 || e.rescued > 8) throw new Error('无效的战役成绩');
  const r = SCORE_RULES;
  const parts = {
    victory: stages.filter(s => s.cleared !== false).length * 2000 + (completed ? 4000 : 0),
    combat: stages.reduce((n, s) => n + Math.min(s.kills - s.bossKills, r.killCaps[s.stage - 1]) * r.kill, 0),
    bosses: stages.reduce((n, s) => n + s.bossKills * r.boss, 0),
    lighthouse: stages.reduce((n, s) => n + (s.cleared === false ? 0 : Math.floor(s.lampHealth * r.lampPerStage / 380)), 0),
    defenders: stages.reduce((n, s) => n + (s.cleared === false ? 0 : s.soldiers * r.soldier), 0),
    exploration: Math.min(e.kills, 100) * 2 + Math.min(e.caches, 10) * 25 + e.rescued * 50,
    efficiency: completed ? Math.max(0, r.efficiency - Math.floor(durationMs / 1000)) : 0,
  };
  return { ...parts, total: Object.values(parts).reduce((a, b) => a + b, 0) };
}
export function normalizeNickname(value: string): string { return value.normalize('NFKC').trim(); }
export function validNickname(value: string): boolean { return /^[\p{L}\p{N}_\-· ]{2,16}$/u.test(value) && !/  /.test(value); }
export interface ScoreSubmission {
  runId: string; nickname: string; difficulty: RankDifficulty; durationMs: number;
  score: number; stages: StageScore[]; maxSpeed: 1 | 2 | 3;
  completed: boolean; scope: ScoreScope; outcome: RunOutcome; exploration: ExplorationScore;
  scoreVersion: number; gameVersion: string;
}
export interface LeaderboardEntry {
  id: string; nickname: string; difficulty: RankDifficulty; durationMs: number; score: number;
  maxSpeed: number; submittedAt: string;
  scope?: ScoreScope; outcome?: RunOutcome;
}
export interface LeaderboardResponse { board: BoardType; difficulty: RankDifficulty; scope?: ScoreScope; scoreVersion: number; entries: LeaderboardEntry[] }
export interface ScoreRanks { speed: number | null; score: number }
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}.${Math.floor(ms % 1000 / 10).toString().padStart(2, '0')}`;
}
