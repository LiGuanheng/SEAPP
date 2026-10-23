export type Phase = 'preparation' | 'night' | 'upgrade' | 'victory' | 'defeat';
export type TowerKind = 'sentry' | 'frost' | 'mortar';
export type EnemyKind = 'drifter' | 'runner' | 'brute';
export type LightLevel = 'low' | 'normal' | 'high';
export type LocationId = 'ruins' | 'station' | 'warehouse';
export type UpgradeId = 'optics' | 'ammunition' | 'capacitor' | 'scavenger' | 'fortify' | 'supply';
export type SurvivorId = 'engineer' | 'medic' | 'captain';
export type WeaponId = 'molotov' | 'emp';
export interface Point { x: number; y: number }
export interface Tower {
  id: number; padId: number; kind: TowerKind; cooldown: number;
  flash: number; aim: Point | null;
}
export interface Enemy {
  id: number; kind: EnemyKind; distance: number; health: number;
  maxHealth: number; slowUntil: number; flash: number;
}
export interface Squad {
  id: number; spotId: number; cooldown: number; flash: number; aim: Point | null;
}
export interface GameState {
  version: 1; seed: number; nextId: number; day: number; phase: Phase;
  health: number; materials: number; energy: number; light: LightLevel;
  explored: boolean; towers: Tower[]; enemies: Enemy[]; squads: Squad[];
  survivors: SurvivorId[]; weapons: Record<WeaponId, number>;
  battle: {
    elapsed: number; spawned: number; total: number; spawnTimer: number;
    pulseCooldown: number; pulseFlash: number; fireUntil: number; weaponFlash: number;
  };
  modifiers: { damage: number; range: number; efficiency: number; exploration: number; maxHealth: number };
  stats: { kills: number; explorations: number; built: number; nightsSurvived: number; score: number };
  upgradeChoices: UpgradeId[];
  logs: { text: string; kind: 'info' | 'good' | 'warn' }[];
}
export interface CommandResult { ok: boolean; message: string }
export interface Settings { volume: number; muted: boolean }
