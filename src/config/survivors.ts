export const SURVIVOR_PROFILES = {
  engineer: { name: '林岚', role: '工程师', ability: '返营额外回收 4 建材；施工少耗 1 建材', tint: 0xe8c07c, stage: 1, hero: false },
  medic: { name: '陈安', role: '医护员', ability: '营救恢复 20 生命；夜间每 8 秒治疗一名守卫 8 点', tint: 0x9cdbcb, stage: 1, hero: false },
  captain: { name: '周野', role: '教官', ability: '随队换弹快 20%；返营增加枪手', tint: 0xacc9ef, stage: 1, hero: false },
  ranger: { name: '叶青', role: '弓手', ability: '随队射箭；返营增加弓手守卫', tint: 0x99bf77, stage: 1, hero: false },
  brawler: { name: '石川', role: '先锋', ability: '随队挥斧；返营增加近战先锋', tint: 0xd49b7c, stage: 1, hero: false },
  electrician: { name: '许舟', role: '电工', ability: '安全返营额外回收 3 电力；每轮限一次', tint: 0xd7c888, stage: 2, hero: false },
  guardian: { name: '苏禾', role: '英雄·战地医师', ability: '返营加入守军：180 范围每 6 秒治疗 10；白袍医疗背包', tint: 0x8bd6bc, stage: 2, hero: true, texture: 'hero-guardian' },
  gunner: { name: '韩烬', role: '英雄·重炮手', ability: '返营加入守军：地面范围炮击；重甲与肩扛重炮', tint: 0xdca077, stage: 3, hero: true, texture: 'hero-gunner' },
  sentinel: { name: '罗铠', role: '英雄·磐石卫士', ability: '返营加入守军：260生命，减伤45%，近战护盾横扫', tint: 0x88b9e7, stage: 4, hero: true, texture: 'hero-sentinel' },
  striker: { name: '叶霁', role: '英雄·逐空猎手', ability: '返营加入守军：优先攻击空中敌人；双翼披风与追踪弩', tint: 0xc7b0ed, stage: 5, hero: true, texture: 'hero-striker' },
} as const;
export type SurvivorId = keyof typeof SURVIVOR_PROFILES;
export const SURVIVOR_IDS = Object.keys(SURVIVOR_PROFILES);
export const HERO_IDS = ['guardian', 'gunner', 'sentinel', 'striker'] as const;
export type HeroId = typeof HERO_IDS[number];
export const isHero = (role: unknown): role is HeroId => HERO_IDS.includes(role as HeroId);
