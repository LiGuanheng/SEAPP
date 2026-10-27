import { z } from 'zod';
import { calculateScore, GAME_VERSION, SCORE_VERSION, SCORE_RULES, normalizeNickname, validNickname, validStages } from '../../src/core/scoring.ts';

const stageSchema = z.strictObject({
  stage: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  kills: z.number().int().min(0).max(1000), bossKills: z.number().int().min(0).max(5),
  lampHealth: z.number().int().min(1).max(380), soldiers: z.number().int().min(0).max(8),
});
export const submissionSchema = z.strictObject({
  runId: z.uuid(), nickname: z.string().max(64).transform(normalizeNickname).refine(validNickname, '昵称需为2–16个中英文字、数字、空格、_、-或·'),
  difficulty: z.enum(['normal', 'hard']), completed: z.literal(true),
  maxSpeed: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  durationMs: z.number().int().min(120_000).max(SCORE_RULES.maxDurationMs),
  score: z.number().int().min(10_000).max(23_800),
  stages: z.array(stageSchema).length(3).refine(validStages, '必须按顺序完成三个阶段'),
  scoreVersion: z.literal(SCORE_VERSION), gameVersion: z.literal(GAME_VERSION),
}).superRefine((value, ctx) => {
  if (validStages(value.stages) && Number.isSafeInteger(value.durationMs) && value.durationMs >= 120_000 && value.durationMs <= SCORE_RULES.maxDurationMs) {
    if (value.durationMs < Math.floor(360_000 / value.maxSpeed)) ctx.addIssue({ code: 'custom', path: ['durationMs'], message: '低于三夜在该倍速下的最短时间' });
    if (value.score !== calculateScore(value.stages, value.durationMs).total) ctx.addIssue({ code: 'custom', path: ['score'], message: '分数与结算数据不一致' });
  }
});
export const leaderboardQuery = z.strictObject({
  board: z.enum(['speed', 'score']).default('speed'),
  difficulty: z.enum(['normal', 'hard']).default('normal'),
  limit: z.coerce.number().int().min(1).max(20).default(20),
});
