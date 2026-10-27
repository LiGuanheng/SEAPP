import { calculateScore, GAME_VERSION, SCORE_VERSION, SCORE_RULES, validStages, type ExplorationScore, type RankDifficulty, type RunOutcome, type ScoreSubmission, type StageScore } from './scoring.ts';

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
  readonly demo: boolean;
  readonly exploration: ExplorationScore = { kills: 0, caches: 0, rescued: 0 };
  private rescued = new Set<string>();
  constructor(runId: string, difficulty: RankDifficulty, demo = false) { this.runId = runId; this.difficulty = difficulty; this.demo = demo; }
  update(active: boolean, now: number, speed: 1 | 2 | 3 = 1): void {
    if (this.result) return;
    this.clock.update(active, now);
    if (active) this.maxSpeed = Math.max(this.maxSpeed, speed) as 1 | 2 | 3;
  }
  finishNight(summary: StageScore & { outcome: 'victory' | 'defeat' }, now: number): void {
    this.update(false, now);
    if (this.result) return;
    if (summary.outcome === 'defeat') { this.finishRun('defeat', now, { ...summary, cleared: false }); return; }
    if (!this.stages.some(s => s.stage === summary.stage)) {
      const { outcome: _outcome, ...stage } = summary; this.stages.push({ ...stage, cleared: true }); this.stages.sort((a, b) => a.stage - b.stage);
    }
    if (summary.stage === 3) this.finishRun('victory', now);
  }
  recordExploration(kills: number, caches: number, rescued: string[]): void {
    if (this.result) return;
    this.exploration.kills = Math.min(1000, this.exploration.kills + kills);
    this.exploration.caches = Math.min(200, this.exploration.caches + caches);
    rescued.forEach(id => this.rescued.add(id)); this.exploration.rescued = Math.min(8, this.rescued.size);
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
    const durationMs = Math.min(SCORE_RULES.maxDurationMs, this.clock.read(now));
    let score: number;
    try { score = calculateScore(this.stages, durationMs, { completed, exploration: this.exploration }).total; }
    catch { this.invalidReason = '本次计时或结算超出排行榜范围，仍保留游戏通关结果。'; return; }
    this.result = { runId: this.runId, difficulty: this.difficulty, completed, outcome, scope: this.demo ? 'demo' : completed ? 'clear' : 'challenge', durationMs, score,
      exploration: { ...this.exploration }, stages: structuredClone(this.stages), maxSpeed: this.maxSpeed, scoreVersion: SCORE_VERSION, gameVersion: GAME_VERSION };
  }
}
