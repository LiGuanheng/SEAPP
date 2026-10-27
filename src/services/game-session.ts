import { decodeCampaign, loadCampaign, newCampaign, saveCampaign, type Campaign } from '../core/campaign.ts';
import { RankedRun } from '../core/ranking.ts';
import { DIFFICULTIES, difficultyFrom, type Difficulty } from '../config/difficulty.ts';
import { nextStage, validStage, type StageId } from '../config/progression.ts';

const params = new URLSearchParams(location.search);
export let rankedMode = params.get('ranked') === '1' && !params.has('mode');
export let difficulty = difficultyFrom(params.get('difficulty'));
export let rankedRun = new RankedRun(crypto.randomUUID(), difficulty, params.has('mode'));
export type GamePhase = 'day' | 'base' | 'night';
export interface StageCheckpoint { version: 1; stage: StageId; phase: GamePhase; difficulty: Difficulty; practice: boolean; campaign: Campaign; run: ReturnType<RankedRun['checkpoint']>; seed?: number; completed?: boolean }
export const STAGE_SAVE_KEY = 'last-light.stage-checkpoint.v1';
let stageCheckpoint: StageCheckpoint | null = null;
export function savedStage(): StageCheckpoint | null {
  if (stageCheckpoint) return structuredClone(stageCheckpoint);
  try {
    const value = JSON.parse(localStorage.getItem(STAGE_SAVE_KEY) ?? 'null') as StageCheckpoint;
    if (!value || value.version !== 1 || !validStage(value.stage) || !['day', 'base', 'night'].includes(value.phase) || !Object.hasOwn(DIFFICULTIES, value.difficulty) || !value.run) return null;
    value.campaign = decodeCampaign(JSON.stringify(value.campaign));
    const probe = new RankedRun('validation', value.difficulty, value.practice); probe.restoreCheckpoint(value.run, performance.now());
    return value;
  } catch { return null; }
}
export function startNewGame(selected: Difficulty): Campaign {
  difficulty = selected; rankedMode = false; rankedRun = new RankedRun(crypto.randomUUID(), selected); stageCheckpoint = null;
  const campaign = newCampaign(); try { saveGameCampaign(localStorage, campaign); } catch { /* 禁用存储时仍可开始。 */ }
  beginStage(campaign, 'day', 1); return campaign;
}
export function beginStage(campaign: Campaign, phase: GamePhase, stage: StageId = nextStage(campaign.clearedStage), seed?: number): void {
  if (stageCheckpoint?.stage === stage) {
    if (stageCheckpoint.phase === 'day' && stageCheckpoint.seed === undefined && seed !== undefined) { stageCheckpoint.seed = seed; try { localStorage.setItem(STAGE_SAVE_KEY, JSON.stringify(stageCheckpoint)); } catch { /* 会话检查点仍有效。 */ } }
    return;
  }
  stageCheckpoint = { version: 1, stage, phase, campaign: structuredClone(campaign), difficulty, practice: rankedRun.practice, run: rankedRun.checkpoint(performance.now()) };
  if (seed !== undefined) stageCheckpoint.seed = seed;
  try { localStorage.setItem(STAGE_SAVE_KEY, JSON.stringify(stageCheckpoint)); } catch { /* 当前页面仍可重开阶段。 */ }
}
export function restoreStage(): StageCheckpoint | null {
  const checkpoint = savedStage(); if (!checkpoint) return null;
  delete checkpoint.completed;
  difficulty = checkpoint.difficulty; rankedRun = new RankedRun(crypto.randomUUID(), difficulty, checkpoint.practice);
  rankedRun.restoreCheckpoint(checkpoint.run, performance.now()); stageCheckpoint = structuredClone(checkpoint);
  try { saveGameCampaign(localStorage, checkpoint.campaign); } catch { /* 本页重开不依赖存储。 */ } return checkpoint;
}
export function markCampaignComplete(): void { if (!stageCheckpoint) return; stageCheckpoint.completed = true; try { localStorage.setItem(STAGE_SAVE_KEY, JSON.stringify(stageCheckpoint)); } catch { /* 当前页面保留结果。 */ } }
export function loadContinue(): StageCheckpoint | null {
  if (savedStage()) return restoreStage();
  try {
    const raw = localStorage.getItem('last-light.campaign.v2'); if (!raw) return null;
    const campaign = decodeCampaign(raw); if ((campaign.clearedStage ?? 0) >= 5) return null;
    rankedRun = new RankedRun(crypto.randomUUID(), difficulty); beginStage(campaign, campaign.base ? 'base' : 'day'); return savedStage();
  } catch { return null; }
}
export function canContinue(): boolean {
  const saved = savedStage(); if (saved) return !saved.completed;
  try { return !!localStorage.getItem('last-light.campaign.v2') && (decodeCampaign(localStorage.getItem('last-light.campaign.v2')).clearedStage ?? 0) < 5; } catch { return false; }
}
export const RANKED_SAVE_KEY = 'last-light.ranked.campaign.v1';
export function loadGameCampaign(storage: Pick<Storage, 'getItem'>) {
  // 排名战役从空营地开始，刷新即重新开始；普通营地存档继续沿用原机制。
  return rankedMode ? { campaign: newCampaign(), warning: '新战役 · 守住五个阶段完成通关。' } : loadCampaign(storage);
}
export function saveGameCampaign(storage: Pick<Storage, 'setItem'>, campaign: Campaign): boolean {
  if (!rankedMode) return saveCampaign(storage, campaign);
  try { storage.setItem(RANKED_SAVE_KEY, JSON.stringify(campaign)); return true; } catch { return false; }
}
export function updateRun(active: boolean, speed: 1 | 2 | 3 = 1, phase: GamePhase = 'day'): void {
  rankedRun.update(active && !document.hidden, performance.now(), speed, phase);
}
export function advanceRun(phase: GamePhase, seconds: number): void {
  if (phase !== 'day' && stageCheckpoint) {
    const limit = phase === 'base' ? 30_000 : 120_000;
    const start = stageCheckpoint.run.phaseTimesMs[phase];
    seconds = Math.min(seconds, Math.max(0, (start + limit - rankedRun.phaseTimesMs[phase]) / 1000));
  }
  rankedRun.advancePhase(phase, seconds);
}
export function rankingSnapshot() {
  const times = rankedRun.phaseTimesMs;
  return { elapsedMs: times.day + times.base + times.night, dayElapsedMs: times.day, phaseTimesMs: { ...times }, totalElapsedMs: rankedRun.totalClock.read(performance.now()), clearedStages: rankedRun.stages.filter(s => s.cleared !== false).length };
}
