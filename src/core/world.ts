import { BALANCE as B } from '../config/balance.ts';
import { WEAPONS, type WeaponId } from '../config/weapons.ts';
import { OBSTACLES, PLAYER_SPAWN, TILE, WORLD_HEIGHT, WORLD_WIDTH } from '../config/map.ts';
import { canOccupy, distance, firstWall, moveWithCollision, normalized, segmentCircle } from './geometry.ts';
import { Navigation } from './navigation.ts';
import type { Bullet, CombatEvent, InputState, Player, Rect, Vec, Zombie } from './types.ts';

export class CombatWorld {
  readonly player: Player;
  readonly navigation: Navigation;
  zombies: Zombie[] = [];
  bullets: Bullet[] = [];
  events: CombatEvent[] = [];
  elapsed = 0; kills = 0; status: 'playing' | 'defeat' | 'complete' = 'playing';
  weaponId: WeaponId = 'pistol';
  readonly ownedWeapons: WeaponId[] = ['pistol', 'axe'];
  private magazines: Partial<Record<WeaponId, number>> = {};
  get weapon() { return WEAPONS[this.weaponId]; }
  get reloadDuration(): number { return this.weapon.reload; }
  protected get spawnInterval(): number { return B.zombie.spawnInterval; }
  protected get maxZombies(): number { return B.zombie.maxAlive; }
  private seed: number; private nextId = 1; private spawnTimer = 3;
  private sprintExhausted = false;
  readonly obstacles: readonly Rect[];
  readonly width: number;
  readonly height: number;
  constructor(seed = 20261022, obstacles: readonly Rect[] = OBSTACLES, width = WORLD_WIDTH, height = WORLD_HEIGHT, spawn: Vec = PLAYER_SPAWN, initialEnemies = true) {
    this.obstacles = obstacles; this.width = width; this.height = height;
    this.seed = (seed >>> 0) || 1;
    this.player = { ...spawn, health: B.player.health, stamina: B.player.stamina, ammo: B.weapon.magazine, aim: 0, reload: 0, shotCooldown: 0, invulnerable: 0, moving: false, sprinting: false, shots: 0 };
    this.navigation = new Navigation(width, height, TILE, obstacles, B.zombie.radius);
    this.navigation.rebuild(spawn);
    if (initialEnemies) for (const offset of [{ x: 335, y: 10 }, { x: -310, y: 70 }, { x: 130, y: -175 }, { x: 440, y: -150 }, { x: -420, y: -130 }, { x: 340, y: 160 }]) {
      const point = { x: spawn.x + offset.x, y: spawn.y + offset.y };
      if (canOccupy(point, B.zombie.radius, obstacles, width, height)) this.addZombie(point);
    }
  }
  private random(): number { let x = this.seed; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.seed = x >>> 0; return this.seed / 4294967296; }
  protected addZombie(point: Vec): void {
    this.zombies.push({ ...point, id: this.nextId++, health: B.zombie.health, aim: 0, moving: false, attackCooldown: 0, hurt: 0, knockX: 0, knockY: 0, skin: this.nextId % 2 });
  }
  requestReload(): boolean {
    const p = this.player;
    if (this.weaponId === 'axe' || this.status !== 'playing' || p.reload > 0 || p.ammo >= this.weapon.magazine) return false;
    p.reload = this.reloadDuration;
    return true;
  }
  acquireWeapon(id: WeaponId): boolean {
    if (this.status !== 'playing' || this.ownedWeapons.includes(id)) return false;
    this.ownedWeapons.push(id); this.magazines[id] = WEAPONS[id].magazine;
    this.switchWeapon(id); return true;
  }
  switchWeapon(id: WeaponId): boolean {
    if (this.status !== 'playing' || id === this.weaponId || !this.ownedWeapons.includes(id)) return false;
    this.magazines[this.weaponId] = this.player.ammo;
    this.weaponId = id; this.player.ammo = this.magazines[id] ?? 0; this.player.reload = 0;
    this.player.shotCooldown = Math.max(this.player.shotCooldown, this.weapon.interval);
    if (this.player.ammo === 0) this.requestReload();
    return true;
  }
  private spawnZombie(): void {
    if (this.zombies.length >= this.maxZombies) return;
    for (let i = 0; i < 48; i++) {
      const angle = this.random() * Math.PI * 2, radius = B.zombie.minSpawnDistance + this.random() * 210;
      const point = { x: this.player.x + Math.cos(angle) * radius, y: this.player.y + Math.sin(angle) * radius };
      if (canOccupy(point, B.zombie.radius, this.obstacles, this.width, this.height)) { this.addZombie(point); return; }
    }
  }
  protected strike(from: Vec, angle: number, damage: number, reach = 70): void {
    this.events.push({ type: 'swing', ...from, angle });
    for (const z of this.zombies) {
      const target = { x: z.x, y: z.y - 16 }, dx = target.x - from.x, dy = target.y - from.y, d = Math.hypot(dx, dy);
      if (z.health <= 0 || d > reach || (d > 0 && (dx * Math.cos(angle) + dy * Math.sin(angle)) / d < 0.45) || firstWall(from, target, this.obstacles) !== null) continue;
      this.damageZombie(z, damage, angle, target);
    }
  }
  private damageZombie(z: Zombie, damage: number, angle: number, point: Vec): void {
    if (z.health <= 0) return;
    z.health -= damage; z.hurt = 0.14; z.knockX += Math.cos(angle) * 85; z.knockY += Math.sin(angle) * 85;
    this.events.push({ type: 'hit', ...point, id: z.id, angle });
    if (z.health <= 0) { this.kills++; this.events.push({ type: 'kill', x: z.x, y: z.y, id: z.id, angle, skin: z.skin }); }
  }
  protected allyAttack(from: Vec, target: Zombie, melee: boolean): void {
    const pivot = { x: from.x, y: from.y - 16 }, angle = Math.atan2(target.y - 16 - pivot.y, target.x - pivot.x);
    if (melee) this.strike(pivot, angle, 42, 72);
    else if (this.bullets.length < B.maxBullets) {
      this.bullets.push({ ...pivot, id: this.nextId++, vx: Math.cos(angle) * 650, vy: Math.sin(angle) * 650, damage: 36, lifetime: 0.8, arrow: true });
      this.events.push({ type: 'ally-shot', ...pivot, angle });
    }
  }
  step(input: InputState, dt = B.step): void {
    this.events = [];
    if (this.status !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 0.05); this.elapsed += dt;
    const p = this.player;
    p.invulnerable = Math.max(0, p.invulnerable - dt);
    p.shotCooldown = Math.max(0, p.shotCooldown - dt);
    const wasReloading = p.reload > 0;
    p.reload = Math.max(0, p.reload - dt);
    if (wasReloading && p.reload === 0) { p.ammo = this.weapon.magazine; this.events.push({ type: 'reloaded', x: p.x, y: p.y }); }
    const move = normalized(input.moveX, input.moveY);
    p.moving = move.x !== 0 || move.y !== 0;
    if (!input.sprinting || p.stamina >= B.player.sprintRecoveryThreshold) this.sprintExhausted = false;
    if (p.stamina <= 1) this.sprintExhausted = true;
    p.sprinting = input.sprinting && p.moving && !this.sprintExhausted;
    p.stamina = Math.max(0, Math.min(B.player.stamina, p.stamina + (p.sprinting ? -B.player.staminaDrain : B.player.staminaRecovery) * dt));
    const speed = p.sprinting ? B.player.sprintSpeed : B.player.speed;
    moveWithCollision(p, move.x * speed * dt, move.y * speed * dt, B.player.radius, this.obstacles, this.width, this.height);
    p.aim = Math.atan2(input.aim.y - (p.y - 16), input.aim.x - p.x);
    if (input.firing && p.reload === 0 && p.shotCooldown <= 1e-9) {
      if (this.weaponId === 'axe') { p.shots++; p.shotCooldown = this.weapon.interval; this.strike({ x: p.x, y: p.y - 16 }, p.aim, this.weapon.damage); }
      else if (p.ammo === 0) this.requestReload();
      else if (this.bullets.length < B.maxBullets) {
        p.ammo--; p.shots++; p.shotCooldown = this.weapon.interval;
        const pivot = { x: p.x, y: p.y - 16 };
        const muzzle = { x: pivot.x + Math.cos(p.aim) * B.weapon.muzzleDistance, y: pivot.y + Math.sin(p.aim) * B.weapon.muzzleDistance };
        // 枪口若伸进墙里，弹体不能从墙另一侧穿出。
        const obstruction = firstWall(pivot, muzzle, this.obstacles);
        if (obstruction !== null) this.events.push({ type: 'impact', x: pivot.x + (muzzle.x - pivot.x) * obstruction, y: pivot.y + (muzzle.y - pivot.y) * obstruction });
        else this.bullets.push({ ...muzzle, id: this.nextId++, vx: Math.cos(p.aim) * this.weapon.bulletSpeed, vy: Math.sin(p.aim) * this.weapon.bulletSpeed, lifetime: this.weapon.bulletLifetime, damage: this.weapon.damage, arrow: this.weaponId === 'bow' });
        this.events.push({ type: 'shot', ...muzzle, angle: p.aim });
        if (p.ammo === 0) this.requestReload();
      }
    }
    this.navigation.rebuild(p);
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) { this.spawnZombie(); this.spawnTimer = this.spawnInterval; }
    for (const bullet of this.bullets) {
      const end = { x: bullet.x + bullet.vx * dt, y: bullet.y + bullet.vy * dt };
      let closest = firstWall(bullet, end, this.obstacles) ?? Infinity;
      let victim: Zombie | null = null;
      for (const zombie of this.zombies) {
        if (zombie.health <= 0) continue;
        const t = segmentCircle(bullet, end, { x: zombie.x, y: zombie.y - 16 }, 15);
        if (t !== null && t < closest) { closest = t; victim = zombie; }
      }
      if (closest !== Infinity) {
        bullet.x += (end.x - bullet.x) * closest; bullet.y += (end.y - bullet.y) * closest; bullet.lifetime = 0;
        if (victim) {
          const angle = Math.atan2(bullet.vy, bullet.vx);
          this.damageZombie(victim, bullet.damage, angle, bullet);
        } else this.events.push({ type: 'impact', x: bullet.x, y: bullet.y });
      } else { bullet.x = end.x; bullet.y = end.y; bullet.lifetime -= dt; }
    }
    this.bullets = this.bullets.filter(b => b.lifetime > 0 && b.x >= 0 && b.y >= 0 && b.x < this.width && b.y < this.height);
    this.zombies = this.zombies.filter(z => z.health > 0);
    for (const zombie of this.zombies) {
      zombie.attackCooldown = Math.max(0, zombie.attackCooldown - dt); zombie.hurt = Math.max(0, zombie.hurt - dt);
      const direction = this.navigation.direction(zombie, p), close = distance(zombie, p) <= B.zombie.contactDistance;
      zombie.moving = !close; zombie.aim = Math.atan2(direction.y, direction.x);
      moveWithCollision(zombie, ((!close ? direction.x * B.zombie.speed : 0) + zombie.knockX) * dt, ((!close ? direction.y * B.zombie.speed : 0) + zombie.knockY) * dt, B.zombie.radius, this.obstacles, this.width, this.height);
      zombie.knockX *= Math.exp(-9 * dt); zombie.knockY *= Math.exp(-9 * dt);
      if (close && firstWall(zombie, p, this.obstacles) === null && zombie.attackCooldown <= 1e-9) {
        zombie.attackCooldown = B.zombie.attackInterval;
        if (p.invulnerable === 0) {
          p.health = Math.max(0, p.health - B.zombie.damage); p.invulnerable = B.player.invulnerability;
          this.events.push({ type: 'hurt', x: p.x, y: p.y });
          if (p.health === 0) { this.status = 'defeat'; p.moving = false; p.sprinting = false; this.events.push({ type: 'defeat', x: p.x, y: p.y }); break; }
        }
      }
    }
    if (this.status === 'playing') this.separateBodies();
  }
  private separateBodies(): void {
    const radius = B.zombie.radius;
    for (let i = 0; i < this.zombies.length; i++) for (let j = i + 1; j < this.zombies.length; j++) {
      const a = this.zombies[i], b = this.zombies[j], d = distance(a, b);
      if (d >= radius * 2) continue;
      const angle = (a.id * 31 + b.id * 17) % 360 * Math.PI / 180;
      const direction = d > 0.001 ? normalized(a.x - b.x, a.y - b.y) : { x: Math.cos(angle), y: Math.sin(angle) };
      const push = (radius * 2 - d) / 2;
      moveWithCollision(a, direction.x * push, direction.y * push, radius, this.obstacles, this.width, this.height);
      moveWithCollision(b, -direction.x * push, -direction.y * push, radius, this.obstacles, this.width, this.height);
    }
    for (const zombie of this.zombies) {
      const d = distance(zombie, this.player), minimum = radius + B.player.radius;
      if (d >= minimum) continue;
      const direction = d > 0.001 ? normalized(zombie.x - this.player.x, zombie.y - this.player.y) : { x: 1, y: 0 };
      moveWithCollision(zombie, direction.x * (minimum - d), direction.y * (minimum - d), radius, this.obstacles, this.width, this.height);
    }
  }
  snapshot() {
    return { status: this.status, elapsed: this.elapsed, kills: this.kills, weaponId: this.weaponId, ownedWeapons: [...this.ownedWeapons], player: { ...this.player }, zombies: this.zombies.map(z => ({ ...z })), bullets: this.bullets.map(b => ({ ...b })) };
  }
}
