import { calculateScore, GAME_VERSION, SCORE_VERSION, SCORE_RULES, validStages, type ExplorationScore, type PhaseTimesMs, type RankDifficulty, type RunOutcome, type ScoreSubmission, type StageScore } from './scoring.ts';
import { STAGE_COUNT } from '../config/progression.ts';

/** 单调时钟独立于游戏模拟步长，因此三倍速、掉帧和系统时间调整不会改写实际用时。 */
export class ActivePlayClock {
  private total = 0;
  private last: number | null = null;
  private running = false;
  update(active: boolean, now: number): void {
    if (!Number.isFinite(now)) return;
    if (this.running && this.last !== null) this.total += Math.max(0, now - this.last);
    this.last = Math.max(now, this.last ?? now); this.running = active;
  }
  read(now: number): number { this.update(this.running, now); return Math.floor(this.total); }
  snapshot(now?: number): number { return now === undefined ? Math.floor(this.total) : this.read(now); }
  restore(totalMs: number, now: number): void {
    if (!Number.isSafeInteger(totalMs) || totalMs < 0 || totalMs > SCORE_RULES.maxDurationMs || !Number.isFinite(now)) throw new Error('无效的阶段计时检查点');
    this.total = totalMs; this.last = now; this.running = false;
  }
}
export type RunPhase = keyof PhaseTimesMs;
export interface RunCheckpoint {
  version: 2; difficulty: RankDifficulty; stages: StageScore[]; exploration: ExplorationScore;
  rescued: string[]; phaseTimesMs: PhaseTimesMs; totalMs: number; maxSpeed: 1 | 2 | 3;
}
export class RankedRun {
  /** 实际活动墙钟用于附加展示，排行榜主要时长由模型推进量累计。 */
  readonly clock = new ActivePlayClock();
  readonly totalClock = this.clock;
  private phaseTotals: PhaseTimesMs = { day: 0, base: 0, night: 0 };
  readonly stages: StageScore[] = [];
  maxSpeed: 1 | 2 | 3 = 1;
  result: Omit<ScoreSubmission, 'nickname'> | null = null;
  invalidReason = '';
  readonly runId: string;
  readonly difficulty: RankDifficulty;
  readonly practice: boolean;
  readonly exploration: ExplorationScore = { kills: 0, caches: 0, rescued: 0 };
  private rescued = new Set<string>();
  constructor(runId: string, difficulty: RankDifficulty, practice = false) { this.runId = runId; this.difficulty = difficulty; this.practice = practice; }
  update(active: boolean, now: number, speed: 1 | 2 | 3 = 1, _phase: RunPhase = 'day'): void {
    if (this.result) return;
    this.clock.update(active, now);
    if (active) this.maxSpeed = Math.max(this.maxSpeed, speed) as 1 | 2 | 3;
  }
  get phaseTimesMs(): PhaseTimesMs { return { day: Math.round(this.phaseTotals.day), base: Math.round(this.phaseTotals.base), night: Math.round(this.phaseTotals.night) }; }
  get durationMs(): number { const p = this.phaseTimesMs; return p.day + p.base + p.night; }
  advancePhase(phase: RunPhase, seconds: number): void {
    if (this.result || !Number.isFinite(seconds) || seconds <= 0 || !Object.hasOwn(this.phaseTotals, phase)) return;
    // 保留浮点余数，避免每个1/60秒模型步长都被截断成16毫秒。
    this.phaseTotals[phase] += seconds * 1000;
  }
  finishNight(summary: StageScore & { outcome: 'victory' | 'defeat' }, now: number): void {
    this.update(false, now);
    if (this.result) return;
    if (summary.outcome === 'defeat') { this.finishRun('defeat', now, { ...summary, cleared: false }); return; }
    if (!this.stages.some(s => s.stage === summary.stage)) {
      const { outcome: _outcome, ...stage } = summary; this.stages.push({ ...stage, cleared: true }); this.stages.sort((a, b) => a.stage - b.stage);
    }
    if (summary.stage === STAGE_COUNT) this.finishRun('victory', now);
  }
  recordExploration(kills: number, caches: number, rescued: string[]): void {
    if (this.result) return;
    this.exploration.kills = Math.min(1000, this.exploration.kills + kills);
    this.exploration.caches = Math.min(200, this.exploration.caches + caches);
    rescued.forEach(id => this.rescued.add(id)); this.exploration.rescued = Math.min(8, this.rescued.size);
  }
  checkpoint(now?: number): RunCheckpoint {
    return { version: 2, difficulty: this.difficulty, stages: structuredClone(this.stages), exploration: { ...this.exploration },
      rescued: [...this.rescued], phaseTimesMs: this.phaseTimesMs, totalMs: this.clock.snapshot(now), maxSpeed: this.maxSpeed };
  }
  restoreCheckpoint(snapshot: RunCheckpoint, now: number): void {
    if (!snapshot || snapshot.version !== 2 || snapshot.difficulty !== this.difficulty || !validStages(snapshot.stages, false) ||
      snapshot.stages.some(s => s.cleared === false) || ![1, 2, 3].includes(snapshot.maxSpeed) || !Array.isArray(snapshot.rescued) || snapshot.rescued.length > 8 ||
      new Set(snapshot.rescued).size !== snapshot.rescued.length || snapshot.rescued.some(id => typeof id !== 'string' || id.length > 64) ||
      snapshot.exploration?.rescued !== snapshot.rescued.length) throw new Error('无效的阶段成绩检查点');
    const p = snapshot.phaseTimesMs, durationMs = p?.day + p?.base + p?.night;
    calculateScore(snapshot.stages, durationMs, { completed: false, exploration: snapshot.exploration, totalDurationMs: snapshot.totalMs, phaseTimesMs: p });
    this.clock.restore(snapshot.totalMs, now); this.phaseTotals = { ...p };
    this.stages.splice(0, this.stages.length, ...structuredClone(snapshot.stages));
    Object.assign(this.exploration, snapshot.exploration); this.rescued = new Set(snapshot.rescued); this.maxSpeed = snapshot.maxSpeed;
    this.result = null; this.invalidReason = '';
  }
  finishRun(outcome: RunOutcome, now: number, current?: StageScore): void {
    this.update(false, now);
    if (this.result) return;
    if (current && !this.stages.some(s => s.stage === current.stage)) {
      const { stage, kills, bossKills, lampHealth, soldiers } = current;
      this.stages.push({ stage, kills, bossKills, lampHealth, soldiers, cleared: false }); this.stages.sort((a, b) => a.stage - b.stage);
    }
    const completed = outcome === 'victory' && validStages(this.stages);
    if (outcome === 'victory' && !completed) outcome = 'retired';
    const phaseTimesMs = this.phaseTimesMs, durationMs = this.durationMs;
    const totalDurationMs = Math.min(SCORE_RULES.maxDurationMs, this.clock.read(now));
    let score: number;
    try { score = calculateScore(this.stages, durationMs, { completed, exploration: this.exploration, totalDurationMs, phaseTimesMs }).total; }
    catch { this.invalidReason = '本次计时或结算超出排行榜范围，仍保留游戏通关结果。'; return; }
    this.result = { runId: this.runId, difficulty: this.difficulty, completed, outcome, scope: completed && !this.practice ? 'clear' : 'challenge', durationMs, totalDurationMs, phaseTimesMs, score,
      exploration: { ...this.exploration }, stages: structuredClone(this.stages), maxSpeed: this.maxSpeed, scoreVersion: SCORE_VERSION, gameVersion: GAME_VERSION };
  }
}
