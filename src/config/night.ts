import type { StageId } from './progression.ts';
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
export const ENEMY_SPRITES = { queen: 96, axeman: 96, knight: 96, bird: 96, blighter: 96, bomber: 96, crow: 64, undead: 64, spiderling: 64 } as const;
export const MOB_KINDS = ['walker', 'runner', 'brute', 'spiderling', 'undead', 'crow'] as const;
export type Wave = { at: number; bosses: readonly BossKind[] } & Record<typeof MOB_KINDS[number], number>;
const wave = (at: number, walker: number, runner = 0, brute = 0, spiderling = 0, undead = 0, crow = 0, bosses: BossKind[] = []): Wave => ({ at, walker, runner, brute, spiderling, undead, crow, bosses });
const STAGE_WAVES: Record<StageId, readonly Wave[]> = {
  1: [wave(3, 8, 1), wave(24, 10, 4, 0, 0, 0, 2), wave(46, 12, 5, 1, 0, 0, 3), wave(70, 13, 6, 2, 0, 0, 4), wave(94, 14, 7, 2, 0, 0, 5, ['axeman'])],
  2: [wave(3, 10, 3, 1, 0, 0, 2), wave(24, 12, 5, 2, 3, 0, 4), wave(46, 13, 7, 3, 5, 0, 5, ['queen']), wave(70, 14, 8, 3, 6, 2, 6), wave(94, 16, 10, 4, 6, 2, 8, ['blighter'])],
  3: [wave(3, 12, 5, 2, 0, 3, 4), wave(24, 14, 7, 3, 3, 4, 6, ['knight']), wave(46, 16, 9, 4, 6, 3, 8, ['bird']), wave(70, 18, 11, 4, 5, 5, 10, ['bomber']), wave(94, 20, 12, 5, 8, 6, 12, ['queen', 'blighter'])],
};
export const wavesForStage = (stage: StageId): readonly Wave[] => STAGE_WAVES[stage];
export const ASSAULT_CADENCE = { 1: { batch: 3, interval: 0.9 }, 2: { batch: 4, interval: 0.8 }, 3: { batch: 5, interval: 0.72 } } as const;
export const WAVES = STAGE_WAVES[1];
export const GATES = [{ x: 768, y: 112 }, { x: 1536, y: 512 }, { x: 768, y: 992 }, { x: 128, y: 512 }];
export const gatesForStage = (stage: StageId) => stage === 1 ? GATES : stage === 2 ? [{ x: 768, y: 80 }, { x: 1696, y: 512 }, { x: 768, y: 1120 }, { x: 96, y: 512 }] : [{ x: 768, y: 48 }, { x: 1920, y: 512 }, { x: 768, y: 1248 }, { x: 64, y: 512 }];
export function levelStats(kind: InfectedKind, level = 1, stage: StageId = 1) {
  const c = INFECTED[kind], tier = Math.max(0, Math.min(4, level - 1));
  return { health: Math.round(c.health * (1 + tier * 0.10) * (1 + (stage - 1) * 0.18)), damage: Math.round(c.damage * (1 + tier * 0.06) * (1 + (stage - 1) * 0.12)), speed: c.speed * (1 + tier * 0.035) * (1 + (stage - 1) * 0.05) };
}
