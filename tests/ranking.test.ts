import test from 'node:test';
import assert from 'node:assert/strict';
import { ActivePlayClock, RankedRun } from '../src/core/ranking.ts';
import { calculateScore, normalizeNickname, validNickname, formatDuration, validPhaseTimes, type StageScore } from '../src/core/scoring.ts';

const stages: StageScore[] = ([1, 2, 3, 4, 5] as const).map(stage => ({ stage, kills: 1000, bossKills: [1, 2, 5, 5, 6][stage - 1], lampHealth: 380, soldiers: 8 }));
test('实际时钟排除暂停、菜单、失焦及离线时间，恢复无补算且不受时钟倒退影响', () => {
  const clock = new ActivePlayClock(); clock.update(true, 100); clock.update(false, 1100); clock.update(false, 100_000); clock.update(true, 200_000); clock.update(false, 202_000);
  assert.equal(clock.read(999_999), 3000); clock.update(true, 300_000); clock.update(true, 299_900); clock.update(false, 300_000);
  assert.equal(clock.read(300_000), 3000);
});
test('完整评分分解、击杀与Boss上限、效率边界及非法输入', () => {
  const score = calculateScore(stages, 750_000, { phaseTimesMs: { day: 0, base: 150000, night: 600000 } });
  assert.deepEqual(score, { victory: 14000, combat: 8100, bosses: 4750, lighthouse: 5000, defenders: 4000, exploration: 0, efficiency: 2250, total: 38100 });
  assert.equal(calculateScore(stages, 86_400_000).efficiency, 0);
  for (const duration of [-1, NaN, Infinity, 86_400_001, 120000.5]) assert.throws(() => calculateScore(stages, duration));
  assert.throws(() => calculateScore(stages.slice(0, 2), 120000));
  assert.throws(() => calculateScore([stages[1], stages[0], stages[2]], 120000));
  assert.throws(() => calculateScore([{ ...stages[0], lampHealth: 0 }, ...stages.slice(1)], 120000));
});
test('五次首胜才完成战役，第三夜仍继续，重复结算不刷分，最终结果冻结', () => {
  const run = new RankedRun('run', 'hard');
  for (const [i, stage] of stages.entries()) {
    run.update(true, i * 50000, 3, 'base'); run.advancePhase('base', 30);
    run.update(true, i * 50000 + 10000, 3, 'night'); run.advancePhase('night', 120);
    run.finishNight({ ...stage, outcome: 'victory' }, (i + 1) * 50000);
    if (i === 2) assert.equal(run.result, null);
    const length = run.stages.length; run.finishNight({ ...stage, outcome: 'victory' }, (i + 1) * 50000); assert.equal(run.stages.length, length);
  }
  assert.equal(run.result?.durationMs, 750000); assert.equal(run.result?.totalDurationMs, 250000); assert.equal(run.result?.difficulty, 'hard'); assert.equal(run.result?.maxSpeed, 3);
  assert.deepEqual(run.result?.phaseTimesMs, { day: 0, base: 150000, night: 600000 });
  const final = structuredClone(run.result); run.update(true, 999999); run.advancePhase('day', 90); run.finishNight({ ...stages[4], outcome: 'victory' }, 999999); assert.deepEqual(run.result, final);
});
test('死亡立即结算，当前击杀保留、未通过关卡不领胜利奖励，后续不能复活刷分', () => {
  const run = new RankedRun('death', 'normal'); run.update(true, 0);
  run.finishNight({ stage: 1, kills: 12, bossKills: 0, lampHealth: 0, soldiers: 0, outcome: 'defeat' }, 30000);
  assert.equal(run.result?.scope, 'challenge'); assert.equal(run.result?.outcome, 'defeat'); assert.equal(run.result?.score, 60);
  const final = structuredClone(run.result); run.finishNight({ ...stages[0], outcome: 'victory' }, 60000); assert.deepEqual(run.result, final);
});
test('主动结算支持零阶段、探索与部分通关，练习归挑战榜，重复结算幂等', () => {
  const empty = new RankedRun('empty', 'normal'); empty.finishRun('retired', 0); assert.equal(empty.result?.score, 0);
  const practice = new RankedRun('practice', 'normal', true); practice.recordExploration(5, 2, ['engineer', 'engineer']);
  practice.update(true, 0); practice.advancePhase('day', 40); practice.finishNight({ ...stages[0], outcome: 'victory' }, 40000); practice.finishRun('retired', 50000);
  assert.equal(practice.result?.scope, 'challenge'); assert.equal(practice.result?.completed, false);
  const parts = calculateScore(practice.stages, 40000, { completed: false, exploration: practice.exploration });
  assert.equal(parts.victory, 2000); assert.equal(parts.efficiency, 0); assert.equal(parts.exploration, 110); assert.equal(practice.result?.score, parts.total);
  practice.finishRun('defeat', 100000); assert.equal(practice.result?.outcome, 'retired');
});
test('倍速只记录最高使用值，不把模拟秒当实际秒；新战役不继承旧计时', () => {
  const a = new RankedRun('a', 'normal'); a.update(true, 0, 1); a.update(true, 10000, 3); a.update(false, 20000, 1);
  assert.equal(a.clock.read(30000), 20000); assert.equal(a.maxSpeed, 3);
  const b = new RankedRun('b', 'normal'); assert.equal(b.clock.read(30000), 0); assert.equal(b.stages.length, 0);
});
test('一帧1/60秒累计不丢余数，倍速不缩短固定布防和夜战的排行榜用时', () => {
  for (const speed of [1, 3] as const) {
    const run = new RankedRun('speed-' + speed, 'normal'); run.update(true, 0, speed);
    for (let i = 0; i < 1800; i++) run.advancePhase('base', 1 / 60);
    for (let i = 0; i < 7200; i++) run.advancePhase('night', 1 / 60);
    run.advancePhase('day', 45); run.finishRun('retired', 195000 / speed);
    assert.equal(run.result?.durationMs, 195000); assert.equal(run.result?.totalDurationMs, 195000 / speed);
    assert.deepEqual(run.result?.phaseTimesMs, { day: 45000, base: 30000, night: 120000 });
  }
  assert.equal(validPhaseTimes({ day: 0, base: 150000, night: 599999 }, 749999, true), false);
  assert.equal(validPhaseTimes({ day: 1, base: 0, night: 0 }, 0), false);
});
test('放弃当前阶段恢复检查点，移除本阶段耗时、积分、营救和终局状态，恢复不补算离线时间', () => {
  const run = new RankedRun('restart', 'easy'); run.update(true, 0); run.advancePhase('day', 20); run.recordExploration(3, 1, ['engineer']);
  run.advancePhase('base', 30); run.advancePhase('night', 120); run.finishNight({ ...stages[0], outcome: 'victory' }, 170000);
  const checkpoint = run.checkpoint(170000);
  run.update(true, 200000, 3); run.advancePhase('day', 50); run.recordExploration(10, 2, ['captain']);
  run.finishRun('defeat', 250000); assert.equal(run.result?.outcome, 'defeat');
  run.restoreCheckpoint(JSON.parse(JSON.stringify(checkpoint)), 900000);
  assert.equal(run.result, null); assert.equal(run.stages.length, 1); assert.equal(run.durationMs, 170000);
  assert.deepEqual(run.exploration, { kills: 3, caches: 1, rescued: 1 }); assert.equal(run.clock.read(999999), 170000); assert.equal(run.maxSpeed, 1);
  assert.throws(() => run.restoreCheckpoint({ ...checkpoint, phaseTimesMs: { ...checkpoint.phaseTimesMs, day: -1 } }, 1000000));
});
test('昵称归一化、恶意字符拒绝，毫秒格式明确', () => {
  assert.equal(normalizeNickname('  ＡＢ守灯人  '), 'AB守灯人');
  for (const nickname of ['', 'a', '<script>', '名\n字', '灯\u202e人', 'a'.repeat(17), 'a  b', "a';DROP TABLE"]) assert.equal(validNickname(nickname), false, nickname);
  assert.equal(validNickname('守灯人 02'), true); assert.equal(formatDuration(125678), '02:05.67');
});
