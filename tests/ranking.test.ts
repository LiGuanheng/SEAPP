import test from 'node:test';
import assert from 'node:assert/strict';
import { ActivePlayClock, RankedRun } from '../src/core/ranking.ts';
import { calculateScore, normalizeNickname, validNickname, formatDuration, type StageScore } from '../src/core/scoring.ts';

const stages: StageScore[] = [1, 2, 3].map(stage => ({ stage: stage as 1 | 2 | 3, kills: 1000, bossKills: [1, 2, 5][stage - 1], lampHealth: 380, soldiers: 8 }));
test('实际时钟排除暂停、菜单、失焦及离线时间，恢复无补算且不受时钟倒退影响', () => {
  const clock = new ActivePlayClock(); clock.update(true, 100); clock.update(false, 1100); clock.update(false, 100_000); clock.update(true, 200_000); clock.update(false, 202_000);
  assert.equal(clock.read(999_999), 3000); clock.update(true, 300_000); clock.update(true, 299_900); clock.update(false, 300_000);
  assert.equal(clock.read(300_000), 3000);
});
test('完整评分分解、击杀与Boss上限、效率边界及非法输入', () => {
  const score = calculateScore(stages, 120_000);
  assert.deepEqual(score, { victory: 10000, combat: 3400, bosses: 2000, lighthouse: 3000, defenders: 2400, efficiency: 2880, total: 23680 });
  assert.equal(calculateScore(stages, 86_400_000).efficiency, 0);
  for (const duration of [0, NaN, Infinity, 119_999, 86_400_001, 120000.5]) assert.throws(() => calculateScore(stages, duration));
  assert.throws(() => calculateScore(stages.slice(0, 2), 120000));
  assert.throws(() => calculateScore([stages[1], stages[0], stages[2]], 120000));
  assert.throws(() => calculateScore([{ ...stages[0], lampHealth: 0 }, ...stages.slice(1)], 120000));
});
test('三次首胜才完成战役，失败与重复关卡不刷分；重试耗时累计，最终结果冻结', () => {
  const run = new RankedRun('run', 'hard');
  run.update(true, 0, 3); run.finishNight({ ...stages[0], outcome: 'defeat' }, 20000); assert.equal(run.stages.length, 0);
  run.update(true, 100000, 3); run.finishNight({ ...stages[0], outcome: 'victory' }, 140000); assert.equal(run.result, null);
  run.update(true, 200000, 3); run.finishNight({ ...stages[0], outcome: 'victory' }, 240000); assert.equal(run.stages.length, 1);
  run.update(true, 300000, 3); run.finishNight({ ...stages[1], outcome: 'victory' }, 340000);
  run.update(true, 400000, 3); run.finishNight({ ...stages[2], outcome: 'victory' }, 440000);
  assert.equal(run.result?.durationMs, 180000); assert.equal(run.result?.difficulty, 'hard'); assert.equal(run.result?.maxSpeed, 3);
  const final = structuredClone(run.result); run.update(true, 999999); run.finishNight({ ...stages[2], outcome: 'victory' }, 999999); assert.deepEqual(run.result, final);
});
test('倍速只记录最高使用值，不把模拟秒当实际秒；新战役不继承旧计时', () => {
  const a = new RankedRun('a', 'normal'); a.update(true, 0, 1); a.update(true, 10000, 3); a.update(false, 20000, 1);
  assert.equal(a.clock.read(30000), 20000); assert.equal(a.maxSpeed, 3);
  const b = new RankedRun('b', 'normal'); assert.equal(b.clock.read(30000), 0); assert.equal(b.stages.length, 0);
});
test('昵称归一化、恶意字符拒绝，毫秒格式明确', () => {
  assert.equal(normalizeNickname('  ＡＢ守灯人  '), 'AB守灯人');
  for (const nickname of ['', 'a', '<script>', '名\n字', '灯\u202e人', 'a'.repeat(17), 'a  b', "a';DROP TABLE"]) assert.equal(validNickname(nickname), false, nickname);
  assert.equal(validNickname('守灯人 02'), true); assert.equal(formatDuration(125678), '02:05.67');
});
