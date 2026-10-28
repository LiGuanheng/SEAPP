import type { StageId } from './progression.ts';
import { DIFFICULTIES, type Difficulty } from './difficulty.ts';
export const NIGHT_SECONDS = 120, LAMP_HEALTH = 380;
export const NIGHT_LIMITS = { enemies: 96, bullets: 160, corpses: 40, particles: 200, zones: 8 };
interface Creature { name: string; health: number; speed: number; damage: number; interval: number; scale?: number; tint?: number; texture?: string; boss?: boolean; flying?: boolean; radius?: number; armor?: number }
const creature = (c: Creature) => ({ scale: 1.2, tint: 0xffffff, texture: 'zombie', boss: false, flying: false, radius: 11, armor: 0, ...c });
export const INFECTED = {
  walker: creature({ name: '游荡者', health: 60, speed: 40, damage: 9, interval: 1.2, tint: 0x9bb693 }),
  runner: creature({ name: '疾行者', health: 40, speed: 76, damage: 6, interval: 0.85, scale: 1, tint: 0xc28d87, texture: 'zombie-alt' }),
  brute: creature({ name: '重装感染者', health: 220, speed: 28, damage: 22, interval: 1.65, scale: 1.65, tint: 0xb09e76, radius: 16 }),
  tank: creature({ name: '铁甲巨尸', health: 900, speed: 22, damage: 30, interval: 2.2, scale: 1.35, texture: 'tank', radius: 22, armor: 0.45 }),
  spiderling: creature({ name: '蜘蛛幼体', health: 24, speed: 90, damage: 4, interval: 0.8, scale: 0.65, texture: 'spiderling', radius: 9 }),
  undead: creature({ name: '亡灵侍从', health: 74, speed: 44, damage: 10, interval: 1.1, scale: 0.85, texture: 'undead', armor: 0.1 }),
  crow: creature({ name: '腐鸦', health: 54, speed: 76, damage: 5, interval: 1.1, scale: 0.85, texture: 'crow', flying: true }),
  axeman: creature({ name: '裂颅巨汉', health: 440, speed: 34, damage: 22, interval: 1.8, scale: 1.05, texture: 'axeman', boss: true, radius: 22 }),
  queen: creature({ name: '蜘蛛女皇', health: 480, speed: 38, damage: 12, interval: 1.4, scale: 1.15, texture: 'queen', boss: true, radius: 22 }),
  knight: creature({ name: '亡灵骑士', health: 600, speed: 36, damage: 18, interval: 1.6, scale: 1.1, texture: 'knight', boss: true, radius: 21, armor: 0.25 }),
  bird: creature({ name: '腐羽巨鸟', health: 540, speed: 42, damage: 12, interval: 1.5, scale: 1.25, texture: 'bird', boss: true, flying: true, radius: 22 }),
  blighter: creature({ name: '蚀雾喷吐者', health: 500, speed: 31, damage: 12, interval: 1.6, scale: 1.05, texture: 'blighter', boss: true, radius: 21 }),
  bomber: creature({ name: '熔囊巨怪', health: 620, speed: 46, damage: 18, interval: 1.7, scale: 1.1, texture: 'bomber', boss: true, radius: 22 }),
} as const;
export type InfectedKind = keyof typeof INFECTED;
export type BossKind = 'axeman' | 'queen' | 'knight' | 'bird' | 'blighter' | 'bomber';
export const BOSS_ABILITIES: Record<BossKind, string> = {
  axeman: '蓄力重斧 · 离开落点', queen: '织网减速 / 蜘蛛随从', knight: '25%护甲 / 亡灵召唤', bird: '飞行 / 腐羽风暴',
  blighter: '远程毒池 · 持续伤害，调兵躲开', bomber: '近身自爆 · 1.6s蓄力可击杀打断',
};
export const BOSS_SKILLS = {
  axeman: { kind: 'slam', range: 100, windup: 0.95, radius: 82, cooldown: 8 },
  queen: { kind: 'web', range: 230, windup: 1.1, radius: 92, cooldown: 10 },
  bird: { kind: 'storm', range: 230, windup: 1.1, radius: 92, cooldown: 10 },
  blighter: { kind: 'poison', range: 360, windup: 1.1, radius: 92, cooldown: 10 },
  bomber: { kind: 'detonate', range: 100, windup: 1.6, radius: 125, cooldown: 10 },
} as const;
export const ENEMY_SPRITES = { queen: 96, axeman: 96, knight: 96, bird: 96, blighter: 96, bomber: 96, crow: 64, undead: 64, spiderling: 64, tank: 96 } as const;
export const MOB_KINDS = ['tank', 'walker', 'runner', 'brute', 'spiderling', 'undead', 'crow'] as const;
export type Wave = { at: number; bosses: readonly BossKind[] } & Record<typeof MOB_KINDS[number], number>;
const wave = (at: number, walker: number, runner = 0, brute = 0, spiderling = 0, undead = 0, crow = 0, bosses: BossKind[] = []): Wave => ({ at, walker, runner, brute, spiderling, undead, crow, bosses, tank: 0 });
const STAGE_WAVES: Record<StageId, readonly Wave[]> = {
  1: [wave(3, 6, 2), wave(22, 16, 4, 0, 0, 0, 2), wave(42, 20, 7, 1, 0, 0, 3), wave(64, 24, 6, 2, 0, 0, 4), wave(84, 27, 7, 2, 0, 0, 5, ['axeman'])],
  2: [wave(3, 12, 5, 1, 0, 0, 3), wave(22, 25, 8, 2, 4, 0, 5), wave(42, 28, 9, 3, 7, 0, 6, ['queen']), wave(64, 30, 10, 4, 6, 3, 7), wave(84, 34, 12, 4, 8, 3, 9, ['blighter'])],
  3: [wave(3, 18, 6, 2, 0, 3, 4), wave(22, 32, 10, 3, 4, 4, 6, ['knight']), wave(42, 36, 12, 4, 8, 4, 8, ['bird']), wave(64, 40, 14, 5, 7, 6, 10, ['bomber']), wave(82, 44, 16, 6, 10, 6, 12, ['queen', 'blighter'])],
  4: [wave(3, 24, 9, 3, 4, 4, 6), wave(21, 38, 12, 4, 9, 5, 8, ['queen']), wave(40, 42, 14, 5, 8, 7, 10, ['knight']), wave(61, 46, 16, 6, 10, 8, 12, ['blighter']), wave(81, 50, 18, 7, 12, 9, 14, ['axeman', 'bird'])],
  5: [wave(3, 28, 10, 4, 5, 5, 8, ['axeman']), wave(20, 42, 14, 5, 10, 7, 10, ['queen']), wave(39, 46, 16, 6, 11, 8, 12, ['knight']), wave(59, 50, 18, 7, 12, 9, 14, ['bird']), wave(79, 56, 20, 8, 14, 10, 16, ['blighter', 'bomber'])],
};
const DEVELOPED_WAVES = Object.fromEntries(Object.entries(STAGE_WAVES).map(([stage, waves]) => [stage, waves.map((w, i) => ({ ...w, tank: Number(stage) < 2 || i < 2 ? 0 : Number(stage) >= 4 ? 2 : 1 }))])) as unknown as Record<StageId, readonly Wave[]>;
export const wavesForStage = (stage: StageId): readonly Wave[] => DEVELOPED_WAVES[stage];
export const WAVES = STAGE_WAVES[1];
export const GATES = [{ x: 768, y: 112 }, { x: 1536, y: 512 }, { x: 768, y: 992 }, { x: 128, y: 512 }];
export const gatesForStage = (stage: StageId) => stage === 1 ? GATES : stage === 2 ? [{ x: 768, y: 80 }, { x: 1696, y: 512 }, { x: 768, y: 1120 }, { x: 96, y: 512 }] : [{ x: 768, y: 48 }, { x: 1920, y: 512 }, { x: 768, y: 1248 }, { x: 64, y: 512 }];
export function levelStats(kind: InfectedKind, level = 1, stage: StageId = 1, difficulty: Difficulty = 'normal') {
  const c = INFECTED[kind], tier = Math.max(0, Math.min(4, level - 1));
  return { health: Math.round(c.health * (1 + tier * 0.10) * (1 + (stage - 1) * 0.18) * DIFFICULTIES[difficulty].health), damage: Math.round(c.damage * (1 + tier * 0.06) * (1 + (stage - 1) * 0.12)), speed: c.speed * (1 + tier * 0.035) * (1 + (stage - 1) * 0.05) };
}
