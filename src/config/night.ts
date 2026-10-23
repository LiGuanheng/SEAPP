export const NIGHT_SECONDS = 120, LAMP_HEALTH = 380;
export const NIGHT_LIMITS = { enemies: 48, bullets: 160, corpses: 40, particles: 240 };
export const INFECTED = {
  walker: { name: '游荡者', health: 60, speed: 40, damage: 9, interval: 1.2, scale: 1.2, tint: 0x9bb693, texture: 'zombie' },
  runner: { name: '疾行者', health: 40, speed: 76, damage: 6, interval: 0.85, scale: 1, tint: 0xc28d87, texture: 'zombie-alt' },
  brute: { name: '重装感染者', health: 220, speed: 28, damage: 22, interval: 1.65, scale: 1.65, tint: 0xb09e76, texture: 'zombie' },
} as const;
export type InfectedKind = keyof typeof INFECTED;
export const WAVES: readonly { at: number; walker: number; runner: number; brute: number }[] = [
  { at: 3, walker: 6, runner: 0, brute: 0 }, { at: 25, walker: 7, runner: 3, brute: 0 },
  { at: 50, walker: 8, runner: 4, brute: 1 }, { at: 76, walker: 12, runner: 8, brute: 2 },
  { at: 100, walker: 16, runner: 10, brute: 4 },
];
export const GATES = [{ x: 768, y: 176 }, { x: 1296, y: 512 }, { x: 768, y: 848 }, { x: 240, y: 512 }];
