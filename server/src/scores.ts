import { z } from 'zod';
import { calculateScore, GAME_VERSION, SCORE_VERSION, SCORE_RULES, normalizeNickname, validNickname, validStages, validPhaseTimes } from '../../src/core/scoring.ts';

const stageSchema = z.strictObject({
  stage: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  kills: z.number().int().min(0).max(1000), bossKills: z.number().int().min(0).max(6),
  lampHealth: z.number().int().min(0).max(380), soldiers: z.number().int().min(0).max(8), cleared: z.boolean().default(true),
});
export const submissionSchema = z.strictObject({
  runId: z.uuid(), nickname: z.string().max(64).transform(normalizeNickname).refine(validNickname, '昵称需为2–16个中英文字、数字、空格、_、-或·'),
  difficulty: z.enum(['easy', 'normal', 'hard']), completed: z.boolean(),
  outcome: z.enum(['victory', 'defeat', 'retired']), scope: z.enum(['clear', 'challenge']),
  exploration: z.strictObject({ kills: z.number().int().min(0).max(1000), caches: z.number().int().min(0).max(200), rescued: z.number().int().min(0).max(8) }),
  maxSpeed: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  durationMs: z.number().int().min(0).max(SCORE_RULES.maxDurationMs),
  totalDurationMs: z.number().int().min(0).max(SCORE_RULES.maxDurationMs),
  phaseTimesMs: z.strictObject({ day: z.number().int().min(0).max(SCORE_RULES.maxDurationMs), base: z.number().int().min(0).max(150_000), night: z.number().int().min(0).max(600_000) }),
  score: z.number().int().min(0).max(SCORE_RULES.maxScore),
  stages: z.array(stageSchema).max(5),
  scoreVersion: z.literal(SCORE_VERSION), gameVersion: z.literal(GAME_VERSION),
}).superRefine((value, ctx) => {
  if (value.completed !== (value.outcome === 'victory') || value.scope === 'clear' && !value.completed) ctx.addIssue({ code: 'custom', path: ['outcome'], message: '结算结果与榜单不一致' });
  if (!validStages(value.stages, value.completed)) { ctx.addIssue({ code: 'custom', path: ['stages'], message: '阶段结算无效或重复' }); return; }
  if (!validPhaseTimes(value.phaseTimesMs, value.durationMs, value.completed)) { ctx.addIssue({ code: 'custom', path: ['phaseTimesMs'], message: '游戏时长必须等于探索、布防与守夜之和；五阶段通关包含固定150秒布防和600秒守夜' }); return; }
  try { if (value.score !== calculateScore(value.stages, value.durationMs, value).total) ctx.addIssue({ code: 'custom', path: ['score'], message: '分数与结算数据不一致' }); }
  catch { ctx.addIssue({ code: 'custom', path: ['score'], message: '成绩超出范围' }); }
});
export const leaderboardQuery = z.strictObject({
  board: z.enum(['speed', 'score']).default('speed'),
  difficulty: z.enum(['easy', 'normal', 'hard']).default('normal'),
  scope: z.enum(['clear', 'challenge']).default('clear'),
  limit: z.coerce.number().int().min(1).max(20).default(20),
}).refine(q => q.scope === 'clear' || q.board === 'score', '极速榜只查询正式完整通关成绩');
