import { BASE_HEIGHT, BASE_OBSTACLES, BASE_WIDTH, BUILDINGS, GRID, LIGHTHOUSE, LIGHTHOUSE_FOOT, buildingRect } from '../config/base.ts';
import { GATES, INFECTED, LAMP_HEALTH, NIGHT_LIMITS, NIGHT_SECONDS, WAVES, type InfectedKind } from '../config/night.ts';
import { BaseWorld } from './base-world.ts';
import { cloneCampaign, type Campaign } from './campaign.ts';
import { canOccupy, distance, firstWall, moveWithCollision, normalized, segmentCircle } from './geometry.ts';
import { Navigation } from './navigation.ts';
import type { Rect, Vec } from './types.ts';
import type { ActionResult } from './expedition.ts';

export interface NightEnemy extends Vec { id: number; kind: InfectedKind; health: number; aim: number; moving: boolean; cooldown: number; hurt: number }
export interface NightBullet extends Vec { id: number; vx: number; vy: number; damage: number; life: number }
export type NightEvent = { type: 'fire' | 'hit' | 'kill' | 'attack' | 'unit-death' | 'structure-death' | 'lamp-hit' | 'explosion' | 'heal' | 'wave' | 'victory' | 'defeat'; x: number; y: number; angle?: number; kind?: InfectedKind; id?: number };
export interface NightResult { outcome: 'victory' | 'defeat'; duration: number; kills: number; lampHealth: number; soldiers: number; buildings: number; strikes: number }
interface Fighter { health: number; cooldown: number; hurt: number }
const edgePoint = (p: Vec, r: Rect): Vec => ({ x: Math.max(r.x, Math.min(p.x, r.x + r.width)), y: Math.max(r.y, Math.min(p.y, r.y + r.height)) });

export class NightWorld extends BaseWorld {
  readonly checkpoint: Campaign;
  status: 'playing' | 'victory' | 'defeat' = 'playing';
  elapsed = 0; kills = 0; lampHealth = LAMP_HEALTH; lampHurt = 0; wave = 0;
  enemies: NightEnemy[] = []; bullets: NightBullet[] = []; events: NightEvent[] = [];
  readonly fighters = new Map<number, Fighter>();
  readonly turrets = new Map<number, { cooldown: number; aim: number }>();
  readonly strikes: { x: number; y: number; delay: number }[] = [];
  charges: number; supportCooldown = 0; strikesUsed = 0;
  private result: Campaign | null = null;
  private enemyNavigation: Navigation;
  private queue: { kind: InfectedKind; gate: number }[] = [];
  private spawnTimer = 0;
  private nextEnemyId = 1; private nextBulletId = 1; private healTimer = 8;
  constructor(campaign: Campaign) {
    super(campaign); super.finish();
    this.checkpoint = cloneCampaign(this.campaign);
    for (const s of this.plan.soldiers) this.fighters.set(s.id, { health: 90, cooldown: 0, hurt: 0 });
    for (const b of this.plan.buildings) if (b.kind === 'turret') this.turrets.set(b.id, { cooldown: 0, aim: -Math.PI / 2 });
    this.charges = this.campaign.weapons.includes('rifle') ? 2 : 1;
    this.enemyNavigation = this.makeEnemyNavigation();
  }
  override get commanding(): boolean { return this.status === 'playing'; }
  override get livingSoldiers() { return this.plan.soldiers.filter(s => (this.fighters.get(s.id)?.health ?? 0) > 0); }
  override get remaining(): number { return Math.max(0, NIGHT_SECONDS - this.elapsed); }
  override turretAim(id: number): number { return this.turrets.get(id)?.aim ?? -Math.PI / 2; }
  private makeEnemyNavigation(): Navigation {
    const nav = new Navigation(BASE_WIDTH, BASE_HEIGHT, GRID, this.obstacles, 11); nav.rebuild({ x: LIGHTHOUSE.x, y: LIGHTHOUSE.y + 80 }); return nav;
  }
  canSee(p: Vec): boolean {
    return distance(p, LIGHTHOUSE) < 390 || this.livingSoldiers.some(s => distance(p, s) < 270) ||
      this.plan.buildings.some(b => b.kind === 'turret' && distance(p, { x: b.x + 32, y: b.y + 32 }) < 300);
  }
  callStrike(p: Vec): ActionResult {
    if (!this.commanding || this.charges <= 0 || this.supportCooldown > 0) return { ok: false, message: '支援不可用：信号弹已用完或正在冷却' };
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 20 || p.y < 20 || p.x > BASE_WIDTH - 20 || p.y > BASE_HEIGHT - 20 || !this.canSee(p)) return { ok: false, message: '只能向己方视野内呼叫火力支援' };
    this.charges--; this.strikesUsed++; this.supportCooldown = 8; this.strikes.push({ ...p, delay: 0.65 });
    return { ok: true, message: '信号确认，0.65 秒后炮火覆盖；不会伤及己方' };
  }
  private fire(from: Vec, target: NightEnemy, damage: number): void {
    if (this.bullets.length >= NIGHT_LIMITS.bullets) return;
    const aim = Math.atan2(target.y - 16 - from.y, target.x - from.x);
    const muzzle = { x: from.x + Math.cos(aim) * 19, y: from.y + Math.sin(aim) * 19 };
    if (firstWall(from, muzzle, BASE_OBSTACLES) !== null) return;
    this.bullets.push({ ...muzzle, id: this.nextBulletId++, vx: Math.cos(aim) * 850, vy: Math.sin(aim) * 850, damage, life: 0.8 });
    this.events.push({ type: 'fire', ...muzzle, angle: aim });
  }
  private target(from: Vec, range: number): NightEnemy | undefined {
    return this.enemies.filter(e => e.health > 0 && distance(e, from) <= range && firstWall(from, { x: e.x, y: e.y - 16 }, BASE_OBSTACLES) === null)
      .sort((a, b) => distance(a, from) - distance(b, from))[0];
  }
  private damageEnemy(e: NightEnemy, damage: number): void {
    if (e.health <= 0) return;
    e.health = Math.max(0, e.health - damage); e.hurt = 0.14;
    this.events.push({ type: 'hit', x: e.x, y: e.y - 16, id: e.id, kind: e.kind });
    if (e.health === 0) { this.kills++; this.events.push({ type: 'kill', x: e.x, y: e.y, id: e.id, kind: e.kind, angle: e.aim }); }
  }
  private end(outcome: 'victory' | 'defeat'): void {
    if (this.status !== 'playing') return;
    if (outcome === 'victory') this.elapsed = NIGHT_SECONDS;
    this.status = outcome; this.bullets = []; this.strikes.length = 0; this.queue.length = 0;
    for (const s of this.plan.soldiers) s.moving = false;
    for (const e of this.enemies) e.moving = false;
    this.events.push({ type: outcome, ...LIGHTHOUSE });
  }
  summary(): NightResult {
    return { outcome: this.status === 'victory' ? 'victory' : 'defeat', duration: this.elapsed, kills: this.kills,
      lampHealth: this.lampHealth, soldiers: this.livingSoldiers.length, buildings: this.plan.buildings.length, strikes: this.strikesUsed };
  }
  resultCampaign(): Campaign {
    if (this.status === 'playing') return cloneCampaign(this.checkpoint);
    if (!this.result) {
      this.result = cloneCampaign(this.checkpoint); this.result.lastNight = this.summary();
      this.result.nightsWon = (this.result.nightsWon ?? 0) + Number(this.status === 'victory');
    }
    return cloneCampaign(this.result);
  }
  override step(dt = 1 / 60): void {
    this.events = [];
    if (!this.commanding || !Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 0.05, Math.max(0, NIGHT_SECONDS - this.elapsed)); this.elapsed += dt; this.lampHurt = Math.max(0, this.lampHurt - dt); this.supportCooldown = Math.max(0, this.supportCooldown - dt);
    while (this.wave < WAVES.length && this.elapsed >= WAVES[this.wave].at) {
      const w = WAVES[this.wave++];
      for (const kind of ['walker', 'runner', 'brute'] as const) for (let i = 0; i < w[kind]; i++) this.queue.push({ kind, gate: (i + this.wave + (kind === 'runner' ? 1 : 0)) % GATES.length });
      this.events.push({ type: 'wave', ...LIGHTHOUSE });
    }
    this.spawnTimer -= dt;
    if (this.queue.length && this.spawnTimer <= 0 && this.enemies.length < NIGHT_LIMITS.enemies) {
      const next = this.queue.shift()!, gate = GATES[next.gate], offset = ((this.nextEnemyId % 3) - 1) * 24;
      const point = { x: gate.x + (next.gate % 2 === 0 ? offset : 0), y: gate.y + (next.gate % 2 ? offset : 0) };
      if (canOccupy(point, 11, this.obstacles, BASE_WIDTH, BASE_HEIGHT)) this.enemies.push({ ...point, id: this.nextEnemyId++, kind: next.kind, health: INFECTED[next.kind].health, aim: 0, moving: true, cooldown: 0, hurt: 0 });
      this.spawnTimer = 0.35;
    }
    this.stepSoldiers(dt);
    for (const s of this.livingSoldiers) {
      const state = this.fighters.get(s.id)!; state.cooldown = Math.max(0, state.cooldown - dt); state.hurt = Math.max(0, state.hurt - dt);
      const origin = { x: s.x, y: s.y - 16 }, target = this.target(origin, 260);
      if (target) { s.aim = Math.atan2(target.y - 16 - origin.y, target.x - origin.x); if (state.cooldown === 0) { this.fire(origin, target, 18); state.cooldown = 0.5; } }
    }
    for (const b of this.plan.buildings) if (b.kind === 'turret') {
      const turret = this.turrets.get(b.id)!, origin = { x: b.x + 32, y: b.y + 12 }, target = this.target(origin, BUILDINGS.turret.range);
      turret.cooldown = Math.max(0, turret.cooldown - dt);
      if (target) { turret.aim = Math.atan2(target.y - 16 - origin.y, target.x - origin.x); if (turret.cooldown === 0) { this.fire(origin, target, 20); turret.cooldown = 0.18; } }
    }
    for (const strike of this.strikes) { strike.delay -= dt; if (strike.delay <= 0) {
      for (const e of this.enemies) if (distance(e, strike) <= 98) this.damageEnemy(e, 130 * Math.max(0.4, 1 - distance(e, strike) / 150));
      this.events.push({ type: 'explosion', x: strike.x, y: strike.y });
    } }
    for (let i = this.strikes.length - 1; i >= 0; i--) if (this.strikes[i].delay <= 0) this.strikes.splice(i, 1);
    for (const bullet of this.bullets) {
      const end = { x: bullet.x + bullet.vx * dt, y: bullet.y + bullet.vy * dt };
      let closest = firstWall(bullet, end, BASE_OBSTACLES) ?? Infinity, victim: NightEnemy | undefined;
      for (const e of this.enemies) if (e.health > 0) { const t = segmentCircle(bullet, end, { x: e.x, y: e.y - 16 }, e.kind === 'brute' ? 20 : 14); if (t !== null && t < closest) { closest = t; victim = e; } }
      if (closest !== Infinity) { bullet.life = 0; if (victim) this.damageEnemy(victim, bullet.damage); }
      else { bullet.x = end.x; bullet.y = end.y; bullet.life -= dt; }
    }
    this.bullets = this.bullets.filter(b => b.life > 0);
    this.enemies = this.enemies.filter(e => e.health > 0);
    let geometryChanged = false;
    for (const e of this.enemies) {
      e.cooldown = Math.max(0, e.cooldown - dt); e.hurt = Math.max(0, e.hurt - dt);
      const type = INFECTED[e.kind], lampPoint = edgePoint(e, LIGHTHOUSE_FOOT);
      const soldier = this.livingSoldiers.filter(s => distance(e, s) < 115 && firstWall(e, s, this.obstacles) === null).sort((a, b) => distance(e, a) - distance(e, b))[0];
      const building = this.plan.buildings.filter(b => b.health > 0 && distance(e, edgePoint(e, buildingRect(b))) < 50).sort((a, b) => distance(e, edgePoint(e, buildingRect(a))) - distance(e, edgePoint(e, buildingRect(b))))[0];
      const target = soldier ?? (building ? edgePoint(e, buildingRect(building)) : lampPoint);
      const inRange = distance(e, target) <= (soldier ? 27 : 24);
      const direction = soldier || building ? normalized(target.x - e.x, target.y - e.y) : this.enemyNavigation.direction(e, { x: LIGHTHOUSE.x, y: LIGHTHOUSE.y + 80 });
      e.aim = Math.atan2(direction.y, direction.x); e.moving = !inRange;
      if (!inRange) moveWithCollision(e, direction.x * type.speed * dt, direction.y * type.speed * dt, 11, this.obstacles, BASE_WIDTH, BASE_HEIGHT);
      if (inRange && e.cooldown === 0) {
        e.cooldown = type.interval; this.events.push({ type: 'attack', x: target.x, y: target.y });
        if (soldier) {
          const f = this.fighters.get(soldier.id)!; f.health = Math.max(0, f.health - type.damage); f.hurt = 0.2;
          if (f.health === 0) { soldier.destination = null; soldier.stance = 'hold'; soldier.moving = false; this.events.push({ type: 'unit-death', x: soldier.x, y: soldier.y, id: soldier.id }); }
        } else if (building) {
          building.health = Math.max(0, building.health - type.damage);
          if (building.health === 0) { geometryChanged = true; this.events.push({ type: 'structure-death', x: building.x + 32, y: building.y + 16, id: building.id }); }
        } else { this.lampHealth = Math.max(0, this.lampHealth - type.damage); this.lampHurt = 0.3; this.events.push({ type: 'lamp-hit', ...LIGHTHOUSE }); }
      }
      if (this.lampHealth === 0) { this.end('defeat'); break; }
    }
    if (geometryChanged) { this.plan.buildings = this.plan.buildings.filter(b => b.health > 0); this.enemyNavigation = this.makeEnemyNavigation(); this.rebuildNavigation(); }
    for (let i = 0; i < this.enemies.length; i++) for (let j = i + 1; j < this.enemies.length; j++) {
      const a = this.enemies[i], b = this.enemies[j], d = distance(a, b); if (d >= 22) continue;
      const v = d > 0.001 ? normalized(a.x - b.x, a.y - b.y) : { x: 1, y: 0 };
      moveWithCollision(a, v.x * (22 - d) / 2, v.y * (22 - d) / 2, 11, this.obstacles, BASE_WIDTH, BASE_HEIGHT);
      moveWithCollision(b, -v.x * (22 - d) / 2, -v.y * (22 - d) / 2, 11, this.obstacles, BASE_WIDTH, BASE_HEIGHT);
    }
    if (!this.commanding) return;
    this.healTimer -= dt;
    if (this.healTimer <= 0 && this.campaign.survivors.includes('medic')) {
      const s = this.livingSoldiers.filter(s => this.fighters.get(s.id)!.health < 90).sort((a, b) => this.fighters.get(a.id)!.health - this.fighters.get(b.id)!.health)[0];
      if (s) { const f = this.fighters.get(s.id)!; f.health = Math.min(90, f.health + 8); this.events.push({ type: 'heal', ...s }); }
      this.healTimer = 8;
    }
    if (this.remaining < 1e-6) this.end('victory');
  }
  nightSnapshot() { return { ...super.snapshot(), phase: 'night' as const, status: this.status, elapsed: this.elapsed, remaining: this.remaining, lampHealth: this.lampHealth, wave: this.wave,
    kills: this.kills, enemies: structuredClone(this.enemies), bullets: structuredClone(this.bullets), fighters: [...this.fighters].map(([id, f]) => ({ id, ...f })),
    charges: this.charges, supportCooldown: this.supportCooldown, pendingStrikes: structuredClone(this.strikes), summary: this.status === 'playing' ? null : this.summary() }; }
}
