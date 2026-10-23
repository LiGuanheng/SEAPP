import { BALANCE } from './balance.ts';

export type WeaponId = 'pistol' | 'rifle';
export const WEAPONS: Record<WeaponId, { [K in keyof typeof BALANCE.weapon]: number } & { name: string }> = {
  pistol: { ...BALANCE.weapon, name: '9MM 手枪' },
  rifle: { ...BALANCE.weapon, name: 'AR 突击步枪', magazine: 24, interval: 0.09, damage: 22, bulletSpeed: 1150, reload: 1.4 },
};
