export const NIGHT_SECONDS = 120, LAMP_HEALTH = 380;
export const NIGHT_LIMITS = { enemies: 72, bullets: 160, corpses: 40, particles: 240, zones: 8 };
interface Creature { name: string; health: number; speed: number; damage: number; interval: number; scale?: number; tint?: number; texture?: string; boss?: boolean; flying?: boolean; radius?: number; armor?: number }
const creature = (c: Creature) => ({ scale: 1.2, tint: 0xffffff, texture: 'zombie', boss: false, flying: false, radius: 11, armor: 0, ...c });
export const INFECTED = {
  walker: creature({ name: '游荡者', health: 60, speed: 40, damage: 9, interval: 1.2, tint: 0x9bb693 }),
  runner: creature({ name: '疾行者', health: 40, speed: 76, damage: 6, interval: 0.85, scale: 1, tint: 0xc28d87, texture: 'zombie-alt' }),
  brute: creature({ name: '重装感染者', health: 220, speed: 28, damage: 22, interval: 1.65, scale: 1.65, tint: 0xb09e76, radius: 16 }),
  spiderling: creature({ name: '蜘蛛幼体', health: 24, speed: 90, damage: 4, interval: 0.8, scale: 0.65, texture: 'spiderling', radius: 9 }),
  undead: creature({ name: '亡灵侍从', health: 74, speed: 44, damage: 10, interval: 1.1, scale: 0.85, texture: 'undead', armor: 0.1 }),
  crow: creature({ name: '腐鸦', health: 35, speed: 68, damage: 5, interval: 1.1, scale: 0.85, texture: 'crow', flying: true }),
  axeman: creature({ name: '裂颅巨汉', health: 440, speed: 34, damage: 22, interval: 1.8, scale: 1.05, texture: 'axeman', boss: true, radius: 22 }),
  queen: creature({ name: '蜘蛛女皇', health: 480, speed: 38, damage: 12, interval: 1.4, scale: 1.15, texture: 'queen', boss: true, radius: 22 }),
  knight: creature({ name: '亡灵骑士', health: 600, speed: 36, damage: 18, interval: 1.6, scale: 1.1, texture: 'knight', boss: true, radius: 21, armor: 0.25 }),
  bird: creature({ name: '腐羽巨鸟', health: 540, speed: 42, damage: 12, interval: 1.5, scale: 1.25, texture: 'bird', boss: true, flying: true, radius: 22 }),
} as const;
export type InfectedKind = keyof typeof INFECTED;
export type BossKind = 'axeman' | 'queen' | 'knight' | 'bird';
export const ENEMY_SPRITES = { queen: 96, axeman: 96, knight: 96, bird: 96, crow: 64, undead: 64, spiderling: 64 } as const;
export const MOB_KINDS = ['walker', 'runner', 'brute', 'spiderling', 'undead', 'crow'] as const;
export const WAVES: readonly ({ at: number; boss: BossKind | null } & Record<typeof MOB_KINDS[number], number>)[] = [
  { at: 3, walker: 8, runner: 0, brute: 0, spiderling: 0, undead: 0, crow: 0, boss: null },
  { at: 24, walker: 8, runner: 4, brute: 1, spiderling: 0, undead: 0, crow: 2, boss: 'axeman' },
  { at: 46, walker: 10, runner: 6, brute: 2, spiderling: 4, undead: 0, crow: 0, boss: 'queen' },
  { at: 70, walker: 12, runner: 8, brute: 3, spiderling: 0, undead: 4, crow: 3, boss: 'knight' },
  { at: 94, walker: 16, runner: 12, brute: 4, spiderling: 4, undead: 4, crow: 4, boss: 'bird' },
];
export const GATES = [{ x: 768, y: 112 }, { x: 1536, y: 512 }, { x: 768, y: 992 }, { x: 128, y: 512 }];
export function levelStats(kind: InfectedKind, level = 1) {
  const c = INFECTED[kind], tier = Math.max(0, Math.min(4, level - 1));
  return { health: Math.round(c.health * (1 + tier * 0.08)), damage: Math.round(c.damage * (1 + tier * 0.06)), speed: c.speed * (1 + tier * 0.025) };
}
