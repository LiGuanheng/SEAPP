import { loadCampaign, newCampaign, saveCampaign, type Campaign } from '../core/campaign.ts';
import { RankedRun } from '../core/ranking.ts';
import { createDemoCampaign } from '../core/demo.ts';

const params = new URLSearchParams(location.search);
export const rankedMode = params.get('ranked') === '1' && !params.has('mode');
export const demoMode = params.get('demo') === '1';
export let rankedRun = new RankedRun(crypto.randomUUID(), params.get('difficulty') === 'hard' ? 'hard' : 'normal', demoMode || params.has('mode'));
export function restartRun(): void { rankedRun = new RankedRun(crypto.randomUUID(), rankedRun.difficulty, rankedRun.demo); }
export const RANKED_SAVE_KEY = 'last-light.ranked.campaign.v1';
export function loadGameCampaign(storage: Pick<Storage, 'getItem'>) {
  // 排名战役从空营地开始，刷新即重新开始；普通营地存档继续沿用原机制。
  if (demoMode) return { campaign: createDemoCampaign(), warning: '课堂演示 · 已备好阵地；可随时结束结算，成绩进入演示榜。' };
  return rankedMode ? { campaign: newCampaign(), warning: '排名战役 · 三阶段首胜后可提交；刷新将重新开始，原营地保留。' } : loadCampaign(storage);
}
export function saveGameCampaign(storage: Pick<Storage, 'setItem'>, campaign: Campaign): boolean {
  if (!rankedMode && !demoMode) return saveCampaign(storage, campaign);
  try { storage.setItem(RANKED_SAVE_KEY, JSON.stringify(campaign)); return true; } catch { return false; }
}
export function updateRun(active: boolean, speed: 1 | 2 | 3 = 1): void {
  rankedRun.update(active && !document.hidden, performance.now(), speed);
}
export function rankingSnapshot(): { elapsedMs: number; clearedStages: number } | null {
  return rankedRun ? { elapsedMs: rankedRun.clock.read(performance.now()), clearedStages: rankedRun.stages.length } : null;
}
