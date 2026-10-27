import { calculateScore, GAME_VERSION, SCORE_VERSION, type RankDifficulty, type ScoreSubmission, type StageScore } from './scoring.ts';

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
}
export class RankedRun {
  readonly clock = new ActivePlayClock();
  readonly stages: StageScore[] = [];
  maxSpeed: 1 | 2 | 3 = 1;
  result: Omit<ScoreSubmission, 'nickname'> | null = null;
  invalidReason = '';
  readonly runId: string;
  readonly difficulty: RankDifficulty;
  constructor(runId: string, difficulty: RankDifficulty) { this.runId = runId; this.difficulty = difficulty; }
  update(active: boolean, now: number, speed: 1 | 2 | 3 = 1): void {
    if (this.result) return;
    this.clock.update(active, now);
    if (active) this.maxSpeed = Math.max(this.maxSpeed, speed) as 1 | 2 | 3;
  }
  finishNight(summary: StageScore & { outcome: 'victory' | 'defeat' }, now: number): void {
    this.update(false, now);
    if (this.result || summary.outcome !== 'victory' || summary.stage !== this.stages.length + 1) return;
    const { outcome: _outcome, ...stage } = summary; this.stages.push(stage);
    if (this.stages.length !== 3) return;
    const durationMs = this.clock.read(now);
    let score: number;
    try { score = calculateScore(this.stages, durationMs).total; }
    catch { this.invalidReason = '本次计时或结算超出排行榜范围，仍保留游戏通关结果。'; return; }
    this.result = { runId: this.runId, difficulty: this.difficulty, completed: true, durationMs, score,
      stages: structuredClone(this.stages), maxSpeed: this.maxSpeed, scoreVersion: SCORE_VERSION, gameVersion: GAME_VERSION };
  }
}
