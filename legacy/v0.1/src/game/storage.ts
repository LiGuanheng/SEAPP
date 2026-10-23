import { ENEMIES, LAST_DAY, LIGHTS, PADS, PATH_LENGTH, SQUAD_SPOTS, SURVIVORS, TOWERS, UPGRADES } from './data.ts';
import type { GameState, Settings } from './types.ts';

export const SAVE_KEY = 'last-light.save.v1';
export const DEFAULT_SETTINGS: Settings = { volume: 0.35, muted: true };
type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue => value !== null && typeof value === 'object' && !Array.isArray(value);
const number = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const integer = (value: unknown, min: number, max: number): value is number => number(value, min, max) && Number.isInteger(value);
const key = (value: unknown, source: object): value is string => typeof value === 'string' && Object.hasOwn(source, value);

/** 存档来自浏览器存储，必须先检查结构与关联，不能直接断言为 GameState。 */
export function isGameState(value: unknown): value is GameState {
  if (!record(value) || value.version !== 1 || !integer(value.seed, 1, 4294967295) || !integer(value.nextId, 1, 1e9)) return false;
  if (!integer(value.day, 1, LAST_DAY) || !['preparation', 'night', 'upgrade', 'victory', 'defeat'].includes(String(value.phase))) return false;
  if (typeof value.phase !== 'string' || typeof value.explored !== 'boolean' || !key(value.light, LIGHTS)) return false;
  if (!integer(value.materials, 0, 1e6) || !number(value.energy, 0, 1e6) || !number(value.health, 0, 180)) return false;
  const m = value.modifiers;
  if (!record(m) || !number(m.damage, 1, 1.801) || !number(m.range, 0, 1.401) || !number(m.efficiency, 0.4095, 1)
    || !number(m.exploration, 1, 1.801) || !integer(m.maxHealth, 100, 180) || value.health > m.maxHealth) return false;
  const b = value.battle;
  if (!record(b) || !number(b.elapsed, 0, 3600) || !integer(b.total, 0, 26) || !integer(b.spawned, 0, b.total)
    || !number(b.spawnTimer, 0, 2) || !number(b.pulseCooldown, 0, 18) || !number(b.pulseFlash, 0, 0.7)
    || !number(b.fireUntil, 0, b.elapsed + 4.001) || !number(b.weaponFlash, 0, 0.8)) return false;
  const s = value.stats;
  if (!record(s) || !integer(s.kills, 0, 130) || !integer(s.explorations, 0, 5) || !integer(s.built, 0, 100000)
    || !integer(s.nightsSurvived, 0, 5) || !integer(s.score, 0, 1e7)) return false;
  const completed = ['upgrade', 'victory'].includes(value.phase) ? value.day : value.day - 1;
  if (s.nightsSurvived !== completed || (value.phase === 'victory' && value.day !== 5)
    || (value.phase === 'upgrade' && value.day >= 5) || (value.phase === 'defeat' ? value.health !== 0 : value.health <= 0)) return false;
  if (!Array.isArray(value.towers) || value.towers.length > PADS.length || !Array.isArray(value.enemies) || value.enemies.length > b.spawned) return false;
  const ids = new Set<number>(), pads = new Set<number>();
  for (const tower of value.towers) {
    if (!record(tower) || !integer(tower.id, 1, value.nextId - 1) || ids.has(tower.id) || !integer(tower.padId, 0, PADS.length - 1)
      || pads.has(tower.padId) || !key(tower.kind, TOWERS) || !number(tower.cooldown, 0, 2) || !number(tower.flash, 0, 0.15)) return false;
    if (tower.aim !== null && (!record(tower.aim) || !number(tower.aim.x, 0, 13) || !number(tower.aim.y, 0, 8))) return false;
    ids.add(tower.id); pads.add(tower.padId);
  }
  for (const enemy of value.enemies) {
    if (!record(enemy) || !integer(enemy.id, 1, value.nextId - 1) || ids.has(enemy.id) || !key(enemy.kind, ENEMIES)
      || !number(enemy.distance, 0, PATH_LENGTH - Number.EPSILON) || !number(enemy.maxHealth, 1, 150)
      || !number(enemy.health, Number.MIN_VALUE, enemy.maxHealth) || !number(enemy.slowUntil, 0, b.elapsed + 5.001)
      || !number(enemy.flash, 0, 0.2)) return false;
    ids.add(enemy.id);
  }
  if (!Array.isArray(value.squads) || value.squads.length > SQUAD_SPOTS.length) return false;
  const spots = new Set<number>();
  for (const squad of value.squads) {
    if (!record(squad) || !integer(squad.id, 1, value.nextId - 1) || ids.has(squad.id) || !integer(squad.spotId, 0, SQUAD_SPOTS.length - 1)
      || spots.has(squad.spotId) || !number(squad.cooldown, 0, 0.65) || !number(squad.flash, 0, 0.12)) return false;
    if (squad.aim !== null && (!record(squad.aim) || !number(squad.aim.x, 0, 13) || !number(squad.aim.y, 0, 8))) return false;
    ids.add(squad.id); spots.add(squad.spotId);
  }
  if (!Array.isArray(value.survivors) || value.survivors.length > 3 || !value.survivors.every(id => key(id, SURVIVORS))
    || new Set(value.survivors).size !== value.survivors.length) return false;
  if (!record(value.weapons) || !integer(value.weapons.molotov, 0, 5) || !integer(value.weapons.emp, 0, 5)) return false;
  if (['preparation', 'upgrade', 'victory'].includes(value.phase) && value.enemies.length !== 0) return false;
  if (value.phase === 'night' && b.total < 9) return false;
  if (['upgrade', 'victory'].includes(value.phase) && b.spawned !== b.total) return false;
  const choices = value.upgradeChoices;
  if (!Array.isArray(choices) || choices.length !== (value.phase === 'upgrade' ? 3 : 0)
    || !choices.every(c => key(c, UPGRADES)) || new Set(choices).size !== choices.length) return false;
  if (!Array.isArray(value.logs) || value.logs.length > 12 || !value.logs.every(entry => record(entry)
    && typeof entry.text === 'string' && entry.text.length <= 500 && ['info', 'good', 'warn'].includes(String(entry.kind)))) return false;
  return true;
}

export interface SaveResult { ok: boolean; message: string }
interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void }
export function saveGame(state: GameState, settings: Settings, storage?: StorageLike): SaveResult {
  try {
    (storage ?? localStorage).setItem(SAVE_KEY, JSON.stringify({ version: 1, savedAt: new Date().toISOString(), state, settings }));
    return { ok: true, message: '本机进度已保存' };
  } catch {
    return { ok: false, message: '浏览器无法保存进度，本次游戏仍可继续；关闭页面后进度可能丢失。' };
  }
}
export function loadGame(storage?: StorageLike): { state: GameState | null; settings: Settings; message: string } {
  const fallback = { state: null, settings: { ...DEFAULT_SETTINGS }, message: '' };
  try {
    const raw = (storage ?? localStorage).getItem(SAVE_KEY);
    if (!raw) return fallback;
    if (raw.length > 400000) return { ...fallback, message: '本机存档过大，已新建游戏。' };
    const parsed: unknown = JSON.parse(raw);
    if (!record(parsed) || parsed.version !== 1 || !isGameState(parsed.state)) return { ...fallback, message: '本机存档损坏或版本不兼容，已新建游戏。' };
    // 兼容早期脉冲耗尽能源却仍保存旧亮度的 v1 存档。
    if (parsed.state.energy === 0) parsed.state.light = 'low';
    const settings = parsed.settings;
    return {
      state: parsed.state,
      settings: record(settings) && number(settings.volume, 0, 1) && typeof settings.muted === 'boolean'
        ? { volume: settings.volume, muted: settings.muted } : { ...DEFAULT_SETTINGS },
      message: '已恢复本机进度。',
    };
  } catch {
    return { ...fallback, message: '无法读取本机存档，已新建游戏；进度可能无法保存。' };
  }
}
