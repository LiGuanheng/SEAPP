import type { WeaponId } from '../config/weapons.ts';

export interface Cargo { materials: number; energy: number; medkits: number }
export interface ExpeditionSummary {
  reason: 'return' | 'sunset'; duration: number; kills: number; caches: number;
  rescued: string[]; cargo: Cargo; engineerBonus: number;
}
export interface Campaign {
  version: 2; expeditions: number; depot: Cargo; survivors: string[]; weapons: WeaponId[];
  lastSummary: ExpeditionSummary | null;
}
export const SAVE_KEY = 'last-light.campaign.v2';
export const emptyCargo = (): Cargo => ({ materials: 0, energy: 0, medkits: 0 });
export const newCampaign = (): Campaign => ({ version: 2, expeditions: 0, depot: emptyCargo(), survivors: [], weapons: ['pistol'], lastSummary: null });
export const cloneCampaign = (campaign: Campaign): Campaign => structuredClone(campaign);
const count = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 && n <= 1_000_000;
const cargoValid = (v: unknown): v is Cargo => !!v && typeof v === 'object' && ['materials', 'energy', 'medkits'].every(k => count((v as Record<string, unknown>)[k]));
const idsValid = (v: unknown, allowed: string[]): v is string[] => Array.isArray(v) && v.length <= allowed.length && new Set(v).size === v.length && v.every(x => allowed.includes(x));
export function decodeCampaign(raw: string | null): Campaign {
  if (!raw) return newCampaign();
  const data: unknown = JSON.parse(raw);
  if (!data || typeof data !== 'object') throw new Error('无效存档');
  const c = data as Campaign;
  if (c.version !== 2 || !count(c.expeditions) || !cargoValid(c.depot) ||
      !idsValid(c.survivors, ['engineer', 'medic', 'captain']) || !idsValid(c.weapons, ['pistol', 'rifle']) || !c.weapons.includes('pistol')) throw new Error('存档结构不匹配');
  const s = c.lastSummary;
  if (s !== null && (!s || !['return', 'sunset'].includes(s.reason) || !Number.isFinite(s.duration) || s.duration < 0 || s.duration > 90.1 ||
    !count(s.kills) || !count(s.caches) || !count(s.engineerBonus) || !cargoValid(s.cargo) || !idsValid(s.rescued, ['engineer', 'medic', 'captain']))) throw new Error('结算记录无效');
  return cloneCampaign(c);
}
export function loadCampaign(storage: Pick<Storage, 'getItem'>): { campaign: Campaign; warning: string } {
  try { return { campaign: decodeCampaign(storage.getItem(SAVE_KEY)), warning: '' }; }
  catch { return { campaign: newCampaign(), warning: '存档不可用，已使用新营地；原存档未覆盖。' }; }
}
export function saveCampaign(storage: Pick<Storage, 'setItem'>, campaign: Campaign): boolean {
  try { storage.setItem(SAVE_KEY, JSON.stringify(campaign)); return true; } catch { return false; }
}
