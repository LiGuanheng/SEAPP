import { randomUUID } from 'node:crypto';
import { calculateScore, GAME_VERSION, SCORE_VERSION, type ScoreSubmission, type StageScore } from '../../src/core/scoring.ts';
export function payload(overrides: Partial<ScoreSubmission> = {}): ScoreSubmission {
  const stages: StageScore[] = ([1, 2, 3, 4, 5] as const).map(stage => ({ stage, kills: stage * 50, bossKills: 1, lampHealth: 300, soldiers: 3 }));
  const completed = overrides.completed ?? true, durationMs = overrides.durationMs ?? 900000;
  const phaseTimesMs = overrides.phaseTimesMs ?? (completed ? { day: durationMs - 750000, base: 150000, night: 600000 } : { day: durationMs, base: 0, night: 0 });
  const value = { runId: randomUUID(), nickname: '测试守灯人', difficulty: 'normal' as const, durationMs, totalDurationMs: 500000, phaseTimesMs, maxSpeed: 3 as const, completed, scope: 'clear' as const, outcome: 'victory' as const, exploration: { kills: 0, caches: 0, rescued: 0 }, stages, scoreVersion: SCORE_VERSION, gameVersion: GAME_VERSION, ...overrides };
  return { ...value, score: overrides.score ?? calculateScore(value.stages, value.durationMs, value).total };
}
