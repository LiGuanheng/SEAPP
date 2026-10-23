import Phaser from 'phaser';
import { BALANCE } from '../config/balance.ts';
import type { CombatWorld } from '../core/world.ts';
import type { CombatEvent } from '../core/types.ts';

interface Actor { sprite: Phaser.GameObjects.Sprite; shadow: Phaser.GameObjects.Ellipse }
interface Particle { image: Phaser.GameObjects.Image; vx: number; vy: number; age: number; life: number; angular: number }
interface Corpse { image: Phaser.GameObjects.Image; age: number; startAngle: number }
export function facing(angle: number): number {
  if (Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle))) return Math.cos(angle) > 0 ? 1 : 3;
  return Math.sin(angle) > 0 ? 0 : 2;
}
export class ActorView {
  readonly player: Actor;
  readonly gun: Phaser.GameObjects.Image;
  private zombies = new Map<number, Actor>();
  private bullets = new Map<number, Phaser.GameObjects.Image>();
  private particles: Particle[] = [];
  private corpses: Corpse[] = [];
  private recoil = 0;
  constructor(private scene: Phaser.Scene) {
    this.player = this.actor('player');
    this.gun = scene.add.image(0, 0, 'pistol').setOrigin(0.15, 0.5).setScale(0.85);
  }
  private actor(texture: string): Actor {
    return { sprite: this.scene.add.sprite(0, 0, texture, 1).setOrigin(0.5, 0.95).setScale(1.2), shadow: this.scene.add.ellipse(0, 0, 29, 12, 0x0a1115, 0.42) };
  }
  handle(events: readonly CombatEvent[]): void {
    for (const event of events) {
      if (event.type === 'shot') {
        this.recoil = 1;
        const image = this.scene.add.image(event.x, event.y, 'muzzle').setOrigin(0.1, 0.5).setRotation(event.angle).setDepth(event.y + 100).setScale(0.65);
        this.particles.push({ image, age: 0, life: 0.055, vx: 0, vy: 0, angular: 0 });
        this.scatter(event.x - Math.cos(event.angle) * 12, event.y - Math.sin(event.angle) * 12, 2, 0xd3b278, 35);
      } else if (event.type === 'hit') {
        this.scatter(event.x, event.y, 6, 0x9b7056, 65);
        const actor = this.zombies.get(event.id); actor?.sprite.setTintFill(0xe8dbb3);
      } else if (event.type === 'impact') this.scatter(event.x, event.y, 5, 0xe8c485, 90);
      else if (event.type === 'kill') {
        this.scatter(event.x, event.y - 12, 10, 0x987258, 80);
        const actor = this.zombies.get(event.id);
        const image = this.scene.add.image(event.x, event.y - 4, event.skin ? 'zombie-alt' : 'zombie', actor?.sprite.frame.name ?? 1).setOrigin(0.5, 0.8).setScale(1.2).setDepth(1).setTint(0x7b7864);
        this.corpses.push({ image, age: 0, startAngle: event.angle * 180 / Math.PI });
        if (this.corpses.length > BALANCE.maxCorpses) this.corpses.shift()!.image.destroy();
      }
    }
    while (this.particles.length > BALANCE.maxParticles) this.particles.shift()!.image.destroy();
  }
  private scatter(x: number, y: number, count: number, color: number, speed: number): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2, velocity = speed * (0.35 + Math.random() * 0.65), life = 0.15 + Math.random() * 0.3;
      const image = this.scene.add.image(x, y, 'pixel').setTint(color).setScale(0.6 + Math.random() * 0.7).setDepth(y + 70);
      this.particles.push({ image, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity, age: 0, life, angular: (Math.random() - 0.5) * 10 });
    }
  }
  update(world: CombatWorld, dt: number, paused: boolean): void {
    const p = world.player;
    if (this.gun.texture.key !== world.weaponId) this.gun.setTexture(world.weaponId);
    this.recoil = Math.max(0, this.recoil - dt * 14);
    this.syncActor(this.player, p.x, p.y, p.aim, p.moving && world.status === 'playing', paused, 'player');
    this.player.sprite.setAlpha(p.invulnerable > 0 && Math.floor(p.invulnerable * 24) % 2 ? 0.5 : 1);
    if (world.status === 'defeat') this.player.sprite.setAngle(90).setTint(0x8c8170);
    this.gun.setPosition(p.x - Math.cos(p.aim) * this.recoil * 4, p.y - 16 - Math.sin(p.aim) * this.recoil * 4).setRotation(p.aim).setFlipY(Math.cos(p.aim) < 0).setDepth(p.y + (Math.sin(p.aim) < 0 ? -1 : 2)).setVisible(world.status === 'playing');
    const alive = new Set<number>();
    for (const zombie of world.zombies) {
      alive.add(zombie.id);
      const key = zombie.skin ? 'zombie-alt' : 'zombie';
      let actor = this.zombies.get(zombie.id);
      if (!actor) { actor = this.actor(key); this.zombies.set(zombie.id, actor); }
      this.syncActor(actor, zombie.x, zombie.y, zombie.aim, zombie.moving, paused || world.status !== 'playing', key);
      if (zombie.hurt > 0) actor.sprite.setTintFill(0xded6b1); else actor.sprite.clearTint();
      if (zombie.health < BALANCE.zombie.health) actor.sprite.setAlpha(0.96);
    }
    for (const [id, actor] of this.zombies) if (!alive.has(id)) { actor.sprite.destroy(); actor.shadow.destroy(); this.zombies.delete(id); }
    const liveBullets = new Set<number>();
    for (const bullet of world.bullets) {
      liveBullets.add(bullet.id);
      let image = this.bullets.get(bullet.id);
      if (!image) { image = this.scene.add.image(bullet.x, bullet.y, 'bullet').setScale(0.9); this.bullets.set(bullet.id, image); }
      image.setPosition(bullet.x, bullet.y).setRotation(Math.atan2(bullet.vy, bullet.vx)).setDepth(bullet.y + 80);
    }
    for (const [id, image] of this.bullets) if (!liveBullets.has(id)) { image.destroy(); this.bullets.delete(id); }
    for (const particle of this.particles) {
      particle.age += dt;
      particle.image.x += particle.vx * dt; particle.image.y += particle.vy * dt;
      particle.image.rotation += particle.angular * dt; particle.image.setAlpha(Math.max(0, 1 - particle.age / particle.life));
      if (particle.age >= particle.life) particle.image.destroy();
    }
    this.particles = this.particles.filter(particle => particle.age < particle.life);
    for (const corpse of this.corpses) {
      corpse.age += dt;
      const fall = Math.min(1, corpse.age / 0.24);
      corpse.image.setAngle(corpse.startAngle + fall * 70).setScale(1.2, 1.2 - fall * 0.65).setAlpha(Math.max(0, 0.7 * Math.min(1, (30 - corpse.age) / 5)));
      if (corpse.age > 30) corpse.image.destroy();
    }
    this.corpses = this.corpses.filter(corpse => corpse.age <= 30);
  }
  private syncActor(actor: Actor, x: number, y: number, angle: number, moving: boolean, paused: boolean, texture: string): void {
    actor.shadow.setPosition(x, y + 2).setDepth(y - 2);
    actor.sprite.setPosition(x, y).setDepth(y);
    if (paused) { actor.sprite.anims.pause(); return; }
    actor.sprite.anims.resume();
    const direction = facing(angle);
    if (moving) actor.sprite.play(`${texture}-walk-${direction}`, true);
    else { actor.sprite.anims.stop(); actor.sprite.setFrame(direction * 3 + 1); }
  }
  counts() { return { actors: this.zombies.size + 1, bullets: this.bullets.size, particles: this.particles.length, corpses: this.corpses.length }; }
}
