import { GAME_VERSION, SCORE_VERSION, calculateScore, normalizeNickname, validNickname, type LeaderboardResponse, type BoardType, type RankDifficulty, type ScoreSubmission, type ScoreScope, type ScoreRanks } from '../core/scoring.ts';

export const NICKNAME_KEY = 'last-light.nickname.v1';
export const PENDING_KEY = 'last-light.pending-score.v1';
const configured = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/$/, '');
const base = configured || (import.meta.env.DEV ? 'http://127.0.0.1:3000' : '');
export const apiConfigured = Boolean(base);
export class ApiError extends Error { constructor(message: string, readonly status = 0) { super(message); } }
async function request<T>(path: string, init: RequestInit = {}, timeoutMs = 12_000): Promise<T> {
  if (!base) throw new ApiError('尚未配置在线服务，单机游戏仍可正常游玩。');
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(base + path, { ...init, signal: controller.signal });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new ApiError(body?.error?.message ?? `服务暂不可用（HTTP ${response.status}）`, response.status);
    if (!body) throw new ApiError('服务返回了无效响应，请稍后重试。');
    return body as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('连接失败或超时；免费服务首次唤醒可能较慢，请稍后重试。');
  } finally { clearTimeout(timer); }
}
export function getLeaderboard(board: BoardType, difficulty: RankDifficulty, scope: ScoreScope = 'clear'): Promise<LeaderboardResponse> {
  return request(`/api/leaderboard?board=${board}&difficulty=${difficulty}&scope=${scope}&limit=20`);
}
export function submitScore(payload: ScoreSubmission): Promise<{ entry: { id: string }; duplicate: boolean; ranks?: ScoreRanks }> {
  return request('/api/scores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
}
export function readLocal(key: string): string { try { return localStorage.getItem(key) ?? ''; } catch { return ''; } }
export function writeLocal(key: string, value: string): boolean { try { localStorage.setItem(key, value); return true; } catch { return false; } }
export interface PendingScore { result: Omit<ScoreSubmission, 'nickname'>; payload?: ScoreSubmission; submitted?: boolean; ranks?: ScoreRanks; campaignComplete?: boolean }
export function loadPending(): PendingScore | null {
  try {
    const value: PendingScore = JSON.parse(readLocal(PENDING_KEY)), r = value.result;
    if (typeof r.completed !== 'boolean' || r.completed !== (r.outcome === 'victory') || !['clear', 'challenge'].includes(r.scope) || !['victory', 'defeat', 'retired'].includes(r.outcome) ||
      r.scoreVersion !== SCORE_VERSION || r.gameVersion !== GAME_VERSION || !['easy', 'normal', 'hard'].includes(r.difficulty) || ![1, 2, 3].includes(r.maxSpeed) || !/^[0-9a-f-]{36}$/i.test(r.runId) || !r.phaseTimesMs || calculateScore(r.stages, r.durationMs, r).total !== r.score) return null;
    if (value.payload && (!validNickname(normalizeNickname(value.payload.nickname)) || JSON.stringify({ ...value.payload, nickname: undefined }) !== JSON.stringify({ ...r, nickname: undefined }))) return null;
    return value;
  } catch { return null; }
}
