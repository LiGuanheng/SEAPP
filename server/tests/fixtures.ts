import { randomUUID } from 'node:crypto';
import { calculateScore, GAME_VERSION, SCORE_VERSION, type ScoreSubmission, type StageScore } from '../../src/core/scoring.ts';
export function payload(overrides: Partial<ScoreSubmission> = {}): ScoreSubmission {
  const stages: StageScore[] = ([1, 2, 3] as const).map(stage => ({ stage, kills: stage * 50, bossKills: 1, lampHealth: 300, soldiers: 3 }));
  const value = { runId: randomUUID(), nickname: '测试守灯人', difficulty: 'normal' as const, durationMs: 480000, maxSpeed: 3 as const, completed: true as const, stages, scoreVersion: SCORE_VERSION, gameVersion: GAME_VERSION, ...overrides };
  return { ...value, score: overrides.score ?? calculateScore(value.stages, value.durationMs).total };
}
