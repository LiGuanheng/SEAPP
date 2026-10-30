import Phaser from 'phaser';
import { BASE_HEIGHT, BASE_WIDTH, BUILDINGS, LIGHTHOUSE, buildingRect, buildingStats } from '../config/base.ts';
import { INFECTED, NIGHT_LIMITS } from '../config/night.ts';
import type { NightEnemy, NightEvent, NightWorld } from '../core/night-world.ts';
import type { Vec } from '../core/types.ts';
import { facing } from './ActorView.ts';
import { effects } from './SceneTransition.ts';

interface EnemyView { sprite: Phaser.GameObjects.Sprite; shadow: Phaser.GameObjects.Ellipse }
interface Particle { image: Phaser.GameObjects.Image; age: number; life: number; vx: number; vy: number; size: number }
interface Corpse { image: Phaser.GameObjects.Image; age: number }
export class NightView {
  private enemies = new Map<number, EnemyView>();
  private bullets = new Map<number, Phaser.GameObjects.Image>();
  private particles: Particle[] = [];
  private corpses: Corpse[] = [];
  private graphics: Phaser.GameObjects.Graphics;
  private fog: Phaser.Textures.CanvasTexture;
  private fogKey: string;
  private fogTimer = 1;
  private lastOutcome = '';
  private age = 0;
  private outcomeAge = 0;
  private rubble: Vec[] = [];
  private lightMask: HTMLCanvasElement;
  private blasts: { x: number; y: number; age: number; scale: number }[] = [];
  private swings: { x: number; y: number; angle: number; age: number }[] = [];
  private beams: { x: number; y: number; tx: number; ty: number; heat: number; life: number }[] = [];
  private pulses: { x: number; y: number; age: number; kind: 'flame' | 'shock' }[] = [];
  constructor(private scene: Phaser.Scene, private root: Phaser.GameObjects.Container) {
    this.fogKey = `night-fog-${scene.sys.settings.key}`;
    if (scene.textures.exists(this.fogKey)) scene.textures.remove(this.fogKey);
    this.fog = scene.textures.createCanvas(this.fogKey, BASE_WIDTH / 2, BASE_HEIGHT / 2)!;
    this.lightMask = document.createElement('canvas'); this.lightMask.width = this.lightMask.height = 256;
    const mask = this.lightMask.getContext('2d')!, gradient = mask.createRadialGradient(128, 128, 19, 128, 128, 128);
    gradient.addColorStop(0, 'rgba(0,0,0,1)'); gradient.addColorStop(1, 'rgba(0,0,0,0)'); mask.fillStyle = gradient; mask.fillRect(0, 0, 256, 256);
    root.add(scene.add.image(0, 0, this.fogKey).setOrigin(0).setScale(2).setDepth(7000));
    this.graphics = scene.add.graphics().setDepth(8500); root.add(this.graphics);
    scene.events.once('shutdown', () => scene.textures.remove(this.fogKey));
  }
  private addParticle(x: number, y: number, color: number, size: number, life: number, vx = 0, vy = 0): void {
    const image = this.scene.add.image(x, y, 'pixel').setTint(color).setScale(size / 3).setDepth(8200); this.root.add(image);
    this.particles.push({ image, age: 0, life, vx, vy, size });
    while (this.particles.length > NIGHT_LIMITS.particles) this.particles.shift()!.image.destroy();
  }
  handle(events: readonly NightEvent[]): void {
    for (const e of events) {
      if (e.type === 'beam') { this.beams.push({ x: e.x, y: e.y, tx: e.tx!, ty: e.ty!, heat: e.heat ?? 0, life: 0.09 }); if (this.beams.length > 32) this.beams.shift(); }
      else if (e.type === 'flame' || e.type === 'shock') { this.pulses.push({ x: e.x, y: e.y, age: 0, kind: e.type }); if (this.pulses.length > 24) this.pulses.shift(); }
      else if (e.type === 'boss-defeated') { for (let i = 0; i < 16; i++) this.addParticle(e.x, e.y - 28, 0xe8c68b, 5, 0.65, Math.cos(i) * 90, Math.sin(i) * 90); }
      else if (e.type === 'swing') { this.swings.push({ ...e, angle: e.angle ?? 0, age: 0 }); if (this.swings.length > 12) this.swings.shift(); }
      else if (e.type === 'fire') {
        const image = this.scene.add.image(e.x, e.y, 'muzzle').setOrigin(0.1, 0.5).setRotation(e.angle ?? 0).setScale(0.65).setDepth(8200); this.root.add(image);
        this.particles.push({ image, age: 0, life: 0.06, vx: 0, vy: 0, size: 15 });
      } else if (e.type === 'kill' || e.type === 'unit-death') {
        const config = e.kind ? INFECTED[e.kind] : null;
        const image = this.scene.add.image(e.x, e.y - 7, config?.texture ?? 'player', 1).setScale(config?.scale ?? 1.2, 0.6).setAngle(65 + (e.angle ?? 0) * 180 / Math.PI).setTint(0x626a61).setAlpha(0.6).setDepth(2);
        this.root.add(image); this.corpses.push({ image, age: 0 });
        while (this.corpses.length > NIGHT_LIMITS.corpses) this.corpses.shift()!.image.destroy();
      } else if (e.type === 'explosion' || e.type === 'structure-death') {
        if (e.type === 'structure-death') { this.rubble.push({ x: e.x, y: e.y }); if (this.rubble.length > 64) this.rubble.shift(); }
        this.blasts.push({ x: e.x, y: e.y, age: 0, scale: e.projectile === 'flak' ? 0.45 : 1 }); if (this.blasts.length > 8) this.blasts.shift();
        for (let i = 0; i < (effects.reduced || e.projectile === 'flak' ? 8 : 20); i++) { const a = i * Math.PI * 2 / 20, speed = 40 + Math.random() * 160; this.addParticle(e.x, e.y, e.projectile === 'flak' ? 0xb8c4b3 : i % 3 ? 0xd89c59 : 0x89918a, 3 + Math.random() * 5, 0.3 + Math.random() * 0.45, Math.cos(a) * speed, Math.sin(a) * speed); }
      } else if (e.type === 'hit' || e.type === 'attack') {
        for (let i = 0; i < 3; i++) this.addParticle(e.x, e.y, e.type === 'hit' ? 0xb69971 : 0xd27f67, 3, 0.2, (Math.random() - 0.5) * 90, (Math.random() - 0.5) * 90);
      } else if (e.type === 'heal') this.addParticle(e.x, e.y - 24, 0x9de1bb, 10, 0.6, 0, -22);
    }
  }
  private syncEnemy(v: EnemyView, e: NightEnemy, paused: boolean): void {
    const config = INFECTED[e.kind];
    v.sprite.setPosition(e.x, e.y).setDepth(e.y + (config.flying ? 3000 : 0)).setVisible(true); v.shadow.setPosition(e.x, e.y + 2).setDepth(e.y - 2);
    v.sprite.setAlpha(e.windup ? 0.65 + Math.sin(this.age * 18) * 0.25 : 1);
    if (e.hurt > 0) v.sprite.setTintFill(0xf4dbc1); else v.sprite.setTint(config.tint);
    if (paused) v.sprite.anims.pause();
    else { v.sprite.anims.resume(); if (e.moving || config.flying) v.sprite.play(`${config.texture}-walk-${facing(e.aim)}`, true); else { v.sprite.anims.stop(); v.sprite.setFrame(config.texture === 'zombie' || config.texture === 'zombie-alt' ? facing(e.aim) * 3 + 1 : 1); } }
  }
  update(world: NightWorld, dt: number, paused: boolean, support: Vec | null): void {
    if (world.status !== 'playing' && this.lastOutcome === 'playing') {
      for (const p of this.particles) p.image.destroy(); this.particles = []; this.blasts = []; this.pulses = []; this.swings = [];
    }
    if (world.status !== 'playing') this.outcomeAge = Math.min(1, this.outcomeAge + dt / 2.5);
    const dusk = Math.min(1, world.elapsed / 2.7), dawn = world.status === 'victory' ? this.outcomeAge : 0;
    (this.root.getByName('lighthouse') as Phaser.GameObjects.Image).setTint(world.status === 'defeat' ? Phaser.Display.Color.GetColor(255 - this.outcomeAge * 204, 255 - this.outcomeAge * 186, 255 - this.outcomeAge * 175) : 0xffffff);
    this.age += dt; this.fogTimer += dt;
    if (this.fogTimer >= 0.1 || this.lastOutcome !== world.status) {
      this.fogTimer = 0;
      this.lastOutcome = world.status;
      const c = this.fog.context; c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, BASE_WIDTH / 2, BASE_HEIGHT / 2); c.fillStyle = '#071421'; c.globalAlpha = (0.22 + dusk * 0.58) * (1 - dawn * 0.84); c.fillRect(0, 0, BASE_WIDTH / 2, BASE_HEIGHT / 2); c.globalAlpha = 1;
      c.globalCompositeOperation = 'destination-out';
      const light = (p: Vec, radius: number, power: number) => {
        const x = p.x / 2, y = p.y / 2, r = radius / 2;
        c.globalAlpha = power; c.drawImage(this.lightMask, x - r, y - r, radius, radius);
      };
      light(LIGHTHOUSE, world.lightRadius + 60, world.status === 'defeat' ? 0.92 * (1 - this.outcomeAge) : 0.92);
      for (const s of world.livingSoldiers) light(s, 290, 0.78);
      const litCells = new Set<string>();
      for (const b of world.plan.buildings) if (BUILDINGS[b.kind].range) {
        const key = `${Math.floor((b.x + 32) / 128)},${Math.floor((b.y + 32) / 128)}`;
        if (!litCells.has(key)) { light({ x: b.x + 32, y: b.y + 32 }, 300, 0.7); litCells.add(key); }
      }
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; this.fog.refresh();
    }
    const live = new Set(world.enemies.map(e => e.id));
    for (const [id, v] of this.enemies) if (!live.has(id)) { v.sprite.destroy(); v.shadow.destroy(); this.enemies.delete(id); }
    const g = this.graphics.clear();
    for (const r of this.rubble) {
      g.fillStyle(0x111c20, 0.85).fillEllipse(r.x, r.y + 5, 58, 24);
      for (let i = 0; i < 7; i++) g.fillStyle(i % 2 ? 0x645e50 : 0x343f3e, 0.85).fillRect(r.x - 24 + i * 7, r.y - i % 3 * 7, 9, 5);
    }
    // 暖光与缓慢旋转的灯束，所有效果均在实际世界坐标中。
    if (world.status !== 'defeat') {
      g.fillStyle(0xf1c77a, 0.035).fillCircle(LIGHTHOUSE.x, LIGHTHOUSE.y, 160);
      const angle = this.age * 0.26, x = LIGHTHOUSE.x, y = LIGHTHOUSE.y - 80;
      g.fillStyle(0xffdb8b, 0.055).fillTriangle(x, y, x + Math.cos(angle - 0.12) * 440, y + Math.sin(angle - 0.12) * 440, x + Math.cos(angle + 0.12) * 440, y + Math.sin(angle + 0.12) * 440);
    }
    for (const e of world.enemies) {
      let v = this.enemies.get(e.id);
      if (!v) {
        const config = INFECTED[e.kind], large = config.boss || e.kind === 'tank'; v = { sprite: this.scene.add.sprite(e.x, e.y, config.texture, 1).setOrigin(0.5, config.texture === 'zombie' || config.texture === 'zombie-alt' ? 0.95 : 0.82).setScale(config.scale), shadow: this.scene.add.ellipse(e.x, e.y, large ? 62 : 28, large ? 22 : 11, 0x020c13, 0.5) };
        this.root.add([v.sprite, v.shadow]); this.enemies.set(e.id, v);
      }
      this.syncEnemy(v, e, paused || !world.commanding);
      const visible = world.canSee(e); v.shadow.setVisible(visible);
      // Distant silhouettes remain real enemies: no decorative fake horde or target reveal.
      v.sprite.setVisible(true);
      if (!visible) v.sprite.setDepth(7100 + e.y / BASE_HEIGHT).setTintFill(0x596360).setAlpha(world.status === 'victory' ? 0.2 * (1 - dawn) : 0.48);
      const max = e.maxHealth ?? INFECTED[e.kind].health, boss = INFECTED[e.kind].boss, width = boss ? 70 : e.kind === 'tank' ? 56 : 32, y = e.y - (e.kind === 'tank' ? 118 : boss ? 108 : 60);
      if (visible && boss) g.lineStyle(2, 0xd6a776, 0.7).strokeEllipse(e.x, e.y + 2, 72, 26);
      if (visible && world.difficulty === 'hard' && e.kind === 'tank') g.lineStyle(1, 0x9dc7c5, 0.22).strokeCircle(e.x, e.y, 145);
      if (visible && world.tankCovered(e)) g.lineStyle(2, 0xa5d7db, 0.8).strokeEllipse(e.x, e.y - 24, 28, 40);
      if (visible && (e.slowed ?? 0) > 0) g.lineStyle(2, 0x80c9d0, 0.8).strokeEllipse(e.x, e.y + 3, 32, 12);
      if (visible && (e.health < max || e.kind === 'brute' || e.kind === 'tank' || boss)) g.fillStyle(0x2c3833).fillRect(e.x - width / 2, y, width, 4).fillStyle(boss ? 0xd28188 : e.kind === 'tank' ? 0xabc1a1 : 0xb7957d).fillRect(e.x - width / 2, y, width * e.health / max, 4);
      if (e.windup && world.canSee(e.windup.point)) {
        const w = e.windup, p = w.point, t = Math.max(0, w.remaining / w.duration), color = w.kind === 'slam' || w.kind === 'detonate' || w.kind === 'breach' ? 0xf1a16f : w.kind === 'poison' ? 0xb1d077 : w.kind === 'web' ? 0xd5b6d4 : 0xb18feb;
        g.fillStyle(color, 0.09).fillCircle(p.x, p.y, w.radius).lineStyle(2, color, 0.9).strokeCircle(p.x, p.y, w.radius);
        g.lineStyle(2, color).lineBetween(p.x - 9, p.y - 9, p.x + 9, p.y + 9).lineBetween(p.x + 9, p.y - 9, p.x - 9, p.y + 9);
        g.lineStyle(4, color).beginPath().arc(p.x, p.y, w.radius - 5, -Math.PI / 2, -Math.PI / 2 + (1 - t) * Math.PI * 2).strokePath();
      }
    }
    for (const h of world.hazards) if (world.canSee(h)) {
      const color = h.kind === 'poison' ? 0xa9c579 : h.kind === 'web' ? 0xbeb8c7 : 0xa68bd6;
      g.fillStyle(color, 0.10).fillCircle(h.x, h.y, h.radius).lineStyle(1, color, Math.min(0.65, h.remaining / 3));
      for (let r = 22; r < h.radius; r += 22) g.strokeCircle(h.x, h.y, r);
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + (h.kind === 'storm' ? this.age * 2 : 0); g.lineBetween(h.x, h.y, h.x + Math.cos(a) * h.radius, h.y + Math.sin(a) * h.radius); }
    }
    for (const b of this.beams) { if (!paused) b.life -= dt; g.lineStyle(2 + b.heat, 0xf7b069, 0.65).lineBetween(b.x, b.y - 35, b.tx, b.ty); g.lineStyle(1, 0xffebba).lineBetween(b.x, b.y - 35, b.tx, b.ty); } this.beams = this.beams.filter(b => b.life > 0);
    for (const s of world.livingSoldiers) { const f = world.fighters.get(s.id)!, max = world.maxSoldierHealth(s), y = s.role === 'guardian' || s.role === 'gunner' || s.role === 'sentinel' || s.role === 'striker' ? s.y - 77 : s.y - 63; if (f.health < max) g.fillStyle(0x34473c).fillRect(s.x - 16, y, 32, 3).fillStyle(f.hurt > 0 ? 0xe5a38b : 0xb4d29f).fillRect(s.x - 16, y, 32 * f.health / max, 3); }
    for (const b of world.plan.buildings) if (b.health < buildingStats(b).health) { const r = buildingRect(b); g.fillStyle(0x31423e).fillRect(b.x, b.y - 20, r.width, 4).fillStyle(0xd8b478).fillRect(b.x, b.y - 20, r.width * b.health / buildingStats(b).health, 4); }
    for (const b of world.plan.buildings) if (world.buildingSuppressed(b)) g.lineStyle(2, 0xc0d483, 0.9).strokeRect(b.x + 2, b.y + 2, 60, 60).lineBetween(b.x + 20, b.y - 25, b.x + 44, b.y - 13).lineBetween(b.x + 44, b.y - 25, b.x + 20, b.y - 13);
    const bulletIds = new Set(world.bullets.map(b => b.id));
    for (const [id, image] of this.bullets) if (!bulletIds.has(id)) { image.destroy(); this.bullets.delete(id); }
    for (const b of world.bullets) { let image = this.bullets.get(b.id); if (!image) { image = this.scene.add.image(b.x, b.y, b.projectile === 'arrow' ? 'arrow' : 'bullet').setDepth(8150).setScale(b.projectile === 'shell' ? 2 : 1).setTint(b.projectile === 'shell' ? 0xffbf78 : 0xffffff); this.root.add(image); this.bullets.set(b.id, image); } image.setPosition(b.x, b.y).setRotation(Math.atan2(b.vy, b.vx)); }
    for (const s of this.swings) { s.age += dt; g.lineStyle(4, 0xe5d8a9, Math.max(0, 1 - s.age / 0.22)).beginPath().arc(s.x, s.y, 65, s.angle - 1, s.angle + 1).strokePath(); }
    this.swings = this.swings.filter(s => s.age < 0.22);
    for (const pulse of this.pulses) {
      pulse.age += dt;
      const t = pulse.age / 0.3, radius = pulse.kind === 'flame' ? 145 : 150, color = pulse.kind === 'flame' ? 0xe7a05c : 0x80c9d0;
      g.lineStyle(2, color, Math.max(0, 0.65 - t * 0.65)).strokeCircle(pulse.x, pulse.y, radius * (0.55 + Math.min(1, t) * 0.45));
      for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; g.fillStyle(color, Math.max(0, 0.7 - t)).fillRect(pulse.x + Math.cos(a) * radius * t - 3, pulse.y + Math.sin(a) * radius * t - 3, 6, 6); }
    }
    this.pulses = this.pulses.filter(p => p.age < 0.3);
    for (const s of world.strikes) g.lineStyle(2, 0xefc68a, 0.8).strokeCircle(s.x, s.y, 98 * (0.55 + s.delay * 0.5)).lineBetween(s.x - 14, s.y, s.x + 14, s.y).lineBetween(s.x, s.y - 14, s.x, s.y + 14);
    for (const blast of this.blasts) { blast.age += dt; const t = Math.min(1, blast.age / 0.55); g.fillStyle(blast.scale < 1 ? 0xc4c4ac : 0xffc77e, (1 - t) * 0.45).fillCircle(blast.x, blast.y, (28 + t * 70) * blast.scale).lineStyle(3 * (1 - t), 0xffe1a0, 1 - t).strokeCircle(blast.x, blast.y, (20 + t * 95) * blast.scale); }
    this.blasts = this.blasts.filter(b => b.age < 0.55);
    if (support) g.lineStyle(1, world.canSee(support) ? 0xf1d098 : 0xd38173, 0.9).strokeCircle(support.x, support.y, 98);
    for (const p of this.particles) { p.age += dt; p.image.x += p.vx * dt; p.image.y += p.vy * dt; p.image.setAlpha(Math.max(0, 1 - p.age / p.life)); if (p.age >= p.life) p.image.destroy(); }
    this.particles = this.particles.filter(p => p.age < p.life);
    while (this.particles.length > NIGHT_LIMITS.particles) this.particles.shift()!.image.destroy();
    for (const corpse of this.corpses) { corpse.age += world.commanding ? dt : 0; corpse.image.setAlpha(Math.max(0, 0.6 * (1 - corpse.age / 25))); if (corpse.age > 25) corpse.image.destroy(); }
    this.corpses = this.corpses.filter(c => c.age <= 25);
    this.root.sort('depth');
  }
  counts() { return { enemies: this.enemies.size, bullets: this.bullets.size, particles: this.particles.length, corpses: this.corpses.length }; }
}
