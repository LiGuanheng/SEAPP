import { BALANCE } from './balance.ts';

export type WeaponId = 'pistol' | 'rifle' | 'axe' | 'bow';
export const WEAPONS: Record<WeaponId, { [K in keyof typeof BALANCE.weapon]: number } & { name: string }> = {
  pistol: { ...BALANCE.weapon, name: '9MM 手枪' },
  rifle: { ...BALANCE.weapon, name: 'AR 突击步枪', magazine: 24, interval: 0.09, damage: 22, bulletSpeed: 1150, reload: 1.4 },
  axe: { ...BALANCE.weapon, name: '消防斧', magazine: 1, interval: 0.6, damage: 48, bulletSpeed: 0, reload: 0 },
  bow: { ...BALANCE.weapon, name: '猎弓', magazine: 1, interval: 0.7, damage: 52, bulletSpeed: 650, bulletLifetime: 1.4, reload: 0.4 },
};
