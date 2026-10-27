import type { WeaponId } from '../config/weapons.ts';
import { validBasePlan, type BasePlan } from '../config/base.ts';
import type { NightResult } from './night-world.ts';
import { SURVIVOR_IDS } from '../config/survivors.ts';
import { STAGE_COUNT, validStage } from '../config/progression.ts';

export interface Cargo { materials: number; energy: number; medkits: number }
export interface ExpeditionSummary {
  reason: 'return' | 'sunset'; duration: number; kills: number; caches: number;
  rescued: string[]; cargo: Cargo; engineerBonus: number; specialistBonus?: number;
  seed?: number;
}
export interface Campaign {
  version: 2; expeditions: number; depot: Cargo; survivors: string[]; weapons: WeaponId[];
  lastSummary: ExpeditionSummary | null;
  base: BasePlan | null;
  nightsWon?: number; lastNight?: NightResult | null;
  lanternLevel?: number;
  clearedStage?: number;
}
export const SAVE_KEY = 'last-light.campaign.v2';
export const emptyCargo = (): Cargo => ({ materials: 0, energy: 0, medkits: 0 });
export const newCampaign = (): Campaign => ({ version: 2, expeditions: 0, depot: emptyCargo(), survivors: [], weapons: ['pistol'], lastSummary: null, base: null });
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
      !idsValid(c.survivors, SURVIVOR_IDS) || !idsValid(c.weapons, ['pistol', 'rifle', 'axe', 'bow']) || !c.weapons.includes('pistol')) throw new Error('存档结构不匹配');
  const s = c.lastSummary;
  if (s !== null && (!s || !['return', 'sunset'].includes(s.reason) || !Number.isFinite(s.duration) || s.duration < 0 || s.duration > 90.1 ||
    !count(s.kills) || !count(s.caches) || !count(s.engineerBonus) || (s.seed !== undefined && (!Number.isInteger(s.seed) || s.seed < 0 || s.seed > 4294967295)) || (s.specialistBonus !== undefined && s.specialistBonus !== 3) || !cargoValid(s.cargo) || !idsValid(s.rescued, SURVIVOR_IDS))) throw new Error('结算记录无效');
  if (c.base !== undefined && c.base !== null && !validBasePlan(c.base)) throw new Error('基地布防存档无效');
  if (c.nightsWon !== undefined && !count(c.nightsWon)) throw new Error('守夜次数无效');
  if (c.clearedStage !== undefined && (!count(c.clearedStage) || c.clearedStage > STAGE_COUNT)) throw new Error('战役阶段无效');
  if (c.lanternLevel !== undefined && (!count(c.lanternLevel) || c.lanternLevel > 2)) throw new Error('提灯升级无效');
  const n = c.lastNight;
  if (n !== undefined && n !== null && (!n || !['victory', 'defeat'].includes(n.outcome) || !Number.isFinite(n.duration) || n.duration < 0 || n.duration > 120 ||
    !count(n.kills) || !count(n.lampHealth) || n.lampHealth > 380 || !count(n.soldiers) || n.soldiers > 8 || !count(n.buildings) || !count(n.strikes) || n.strikes > 2 ||
    (n.stage !== undefined && !validStage(n.stage)) || (n.bossKills !== undefined && (!count(n.bossKills) || n.bossKills > 6)) || (n.outcome === 'victory' && (n.duration !== 120 || n.lampHealth === 0)) || (n.outcome === 'defeat' && n.lampHealth !== 0))) throw new Error('守夜结算无效');
  return cloneCampaign({ ...c, base: c.base ?? null });
}
export function loadCampaign(storage: Pick<Storage, 'getItem'>): { campaign: Campaign; warning: string } {
  try { return { campaign: decodeCampaign(storage.getItem(SAVE_KEY)), warning: '' }; }
  catch { return { campaign: newCampaign(), warning: '存档不可用，已使用新营地；原存档未覆盖。' }; }
}
export function saveCampaign(storage: Pick<Storage, 'setItem'>, campaign: Campaign): boolean {
  try { storage.setItem(SAVE_KEY, JSON.stringify(campaign)); return true; } catch { return false; }
}
