export interface Vec { x: number; y: number }
export interface Rect { x: number; y: number; width: number; height: number }
export interface InputState { moveX: number; moveY: number; aim: Vec; firing: boolean; sprinting: boolean }
export interface Player extends Vec {
  health: number; stamina: number; ammo: number; aim: number; reload: number; shotCooldown: number;
  invulnerable: number; moving: boolean; sprinting: boolean; shots: number;
}
export interface Zombie extends Vec {
  id: number; health: number; aim: number; moving: boolean; attackCooldown: number;
  hurt: number; knockX: number; knockY: number; skin: number;
}
export interface Bullet extends Vec { id: number; vx: number; vy: number; lifetime: number; damage: number; arrow?: boolean }
export type CombatEvent =
  | { type: 'swing' | 'ally-shot'; x: number; y: number; angle: number }
  | { type: 'shot'; x: number; y: number; angle: number }
  | { type: 'impact'; x: number; y: number }
  | { type: 'hit'; x: number; y: number; id: number; angle: number }
  | { type: 'kill'; x: number; y: number; id: number; angle: number; skin: number }
  | { type: 'hurt'; x: number; y: number }
  | { type: 'reload' | 'reloaded' | 'defeat'; x: number; y: number };
