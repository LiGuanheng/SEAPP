import { loadCampaign, newCampaign, saveCampaign, type Campaign } from '../core/campaign.ts';
import { RankedRun } from '../core/ranking.ts';

const params = new URLSearchParams(location.search);
export const rankedRun = params.get('ranked') === '1' && !params.has('mode') ?
  new RankedRun(crypto.randomUUID(), params.get('difficulty') === 'hard' ? 'hard' : 'normal') : null;
export const RANKED_SAVE_KEY = 'last-light.ranked.campaign.v1';
export function loadGameCampaign(storage: Pick<Storage, 'getItem'>) {
  // 排名战役从空营地开始，刷新即重新开始；普通营地存档继续沿用原机制。
  return rankedRun ? { campaign: newCampaign(), warning: '排名战役 · 三阶段首胜后可提交；刷新将重新开始，原营地保留。' } : loadCampaign(storage);
}
export function saveGameCampaign(storage: Pick<Storage, 'setItem'>, campaign: Campaign): boolean {
  if (!rankedRun) return saveCampaign(storage, campaign);
  try { storage.setItem(RANKED_SAVE_KEY, JSON.stringify(campaign)); return true; } catch { return false; }
}
export function updateRun(active: boolean, speed: 1 | 2 | 3 = 1): void {
  rankedRun?.update(active && !document.hidden, performance.now(), speed);
}
export function rankingSnapshot(): { elapsedMs: number; clearedStages: number } | null {
  return rankedRun ? { elapsedMs: rankedRun.clock.read(performance.now()), clearedStages: rankedRun.stages.length } : null;
}
