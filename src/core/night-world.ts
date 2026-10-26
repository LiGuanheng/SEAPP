import { BASE_HEIGHT, BASE_OBSTACLES, BASE_WIDTH, BUILDINGS, FIELD_SYSTEMS, GRID, LIGHTHOUSE, LIGHTHOUSE_FOOT, TOWER_ATTACKS, buildingRect, type BaseBuilding, type Soldier } from '../config/base.ts';
import { BOSS_SKILLS, INFECTED, LAMP_HEALTH, NIGHT_LIMITS, NIGHT_SECONDS, gatesForStage, wavesForStage, levelStats, type InfectedKind } from '../config/night.ts';
import { ASSAULT_TUNING, assaultPlan, type AssaultOrder, type Difficulty } from './assault.ts';
import { SpatialIndex } from './spatial.ts';
import { STAGES, type StageId } from '../config/progression.ts';
import { BaseWorld } from './base-world.ts';
import { cloneCampaign, type Campaign } from './campaign.ts';
import { canOccupy, distance, firstWall, moveWithCollision, normalized, segmentCircle } from './geometry.ts';
import { Navigation } from './navigation.ts';
import type { Rect, Vec } from './types.ts';
import type { ActionResult } from './expedition.ts';

export interface Windup { kind: 'slam' | 'web' | 'storm' | 'poison' | 'detonate'; point: Vec; remaining: number; duration: number; radius: number }
export interface NightEnemy extends Vec { id: number; kind: InfectedKind; health: number; aim: number; moving: boolean; cooldown: number; hurt: number; maxHealth?: number; level?: number; skillCooldown?: number; summonCooldown?: number; windup?: Windup; slowed?: number; gate?: number; stalled?: number }
export interface Hazard extends Vec { id: number; kind: 'web' | 'storm' | 'poison'; radius: number; remaining: number; tick: number; damage: number }
export interface NightBullet extends Vec { id: number; vx: number; vy: number; damage: number; life: number; splash?: number; projectile?: 'bullet' | 'arrow' | 'shell' }
export type NightEvent = { type: 'fire' | 'flame' | 'shock' | 'swing' | 'hit' | 'kill' | 'attack' | 'unit-death' | 'structure-death' | 'lamp-hit' | 'explosion' | 'heal' | 'wave' | 'victory' | 'defeat' | 'boss' | 'boss-defeated' | 'cast' | 'summon'; x: number; y: number; angle?: number; kind?: InfectedKind; id?: number; projectile?: 'bullet' | 'arrow' | 'shell' };
export interface NightResult { stage?: StageId; outcome: 'victory' | 'defeat'; duration: number; kills: number; lampHealth: number; soldiers: number; buildings: number; strikes: number; bossKills?: number }
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
  bossKills = 0;
  readonly bossesSeen = new Set<InfectedKind>();
  readonly hazards: Hazard[] = [];
  private result: Campaign | null = null;
  private enemyNavigation: Navigation;
  private queue: AssaultOrder[] = [];
  readonly difficulty: Difficulty;
  private siegeNavigation: Navigation;
  private enemyIndex = new SpatialIndex<NightEnemy>();
  private buildingIndex = new SpatialIndex<BaseBuilding>();
  readonly pressure = [0, 0, 0, 0];
  readonly spawnedByGate = [0, 0, 0, 0];
  peakEnemies = 0;
  private nextHazardId = 1;
  private spawnTimer = 0;
  private nextEnemyId = 1; private nextBulletId = 1; private healTimer = 8;
  private heroHealTimer = 6;
  get waves() { return wavesForStage(this.stage); }
  get bossCount(): number { return this.waves.reduce((n, w) => n + w.bosses.length, 0); }
  constructor(campaign: Campaign, difficulty: Difficulty = 'normal') {
    super(campaign); super.finish();
    this.checkpoint = cloneCampaign(this.campaign);
    for (const s of this.plan.soldiers) this.fighters.set(s.id, { health: 90, cooldown: 0, hurt: 0 });
    for (const b of this.plan.buildings) if (BUILDINGS[b.kind].range) this.turrets.set(b.id, { cooldown: 0, aim: -Math.PI / 2 });
    this.charges = this.campaign.weapons.includes('rifle') ? 2 : 1;
    this.enemyNavigation = this.makeEnemyNavigation();
    this.siegeNavigation = new Navigation(BASE_WIDTH, BASE_HEIGHT, GRID, BASE_OBSTACLES, 22);
    this.siegeNavigation.rebuild({ x: LIGHTHOUSE.x, y: LIGHTHOUSE.y + 80 });
    this.difficulty = difficulty;
    this.queue = assaultPlan(this.stage, this.stage === 1 ? 20261057 : (campaign.expeditions * 7919 + this.stage * 31 + 20261026) >>> 0, difficulty);
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
      this.plan.buildings.some(b => BUILDINGS[b.kind].range > 0 && distance(p, { x: b.x + 32, y: b.y + 32 }) < 300);
  }
  callStrike(p: Vec): ActionResult {
    if (!this.commanding || this.charges <= 0 || this.supportCooldown > 0) return { ok: false, message: '支援不可用：信号弹已用完或正在冷却' };
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 20 || p.y < 20 || p.x > BASE_WIDTH - 20 || p.y > BASE_HEIGHT - 20 || !this.canSee(p)) return { ok: false, message: '只能向己方视野内呼叫火力支援' };
    this.charges--; this.strikesUsed++; this.supportCooldown = 8; this.strikes.push({ ...p, delay: 0.65 });
    return { ok: true, message: '信号确认，0.65 秒后炮火覆盖；不会伤及己方' };
  }
  private fire(from: Vec, target: NightEnemy, damage: number, speed = 850, splash = 0, projectile: 'bullet' | 'arrow' | 'shell' = 'bullet'): void {
    if (this.bullets.length >= NIGHT_LIMITS.bullets) return;
    const aim = Math.atan2(target.y - 16 - from.y, target.x - from.x);
    const muzzle = { x: from.x + Math.cos(aim) * 19, y: from.y + Math.sin(aim) * 19 };
    if (firstWall(from, muzzle, BASE_OBSTACLES) !== null) return;
    this.bullets.push({ ...muzzle, id: this.nextBulletId++, vx: Math.cos(aim) * speed, vy: Math.sin(aim) * speed, damage, life: projectile === 'shell' ? 1.3 : 0.8, splash, projectile });
    this.events.push({ type: 'fire', ...muzzle, angle: aim, projectile });
  }
  private target(from: Vec, range: number, groundOnly = false): NightEnemy | undefined {
    let target: NightEnemy | undefined, best = range * range;
    for (const e of this.enemyIndex.near(from, range)) {
      const d = (e.x - from.x) ** 2 + (e.y - from.y) ** 2;
      if (e.health <= 0 || groundOnly && INFECTED[e.kind].flying || d > best || firstWall(from, { x: e.x, y: e.y - 16 }, BASE_OBSTACLES) !== null) continue;
      best = d; target = e;
    }
    return target;
  }
  private damageEnemy(e: NightEnemy, damage: number): void {
    if (e.health <= 0) return;
    e.health = Math.max(0, e.health - damage * (1 - INFECTED[e.kind].armor)); e.hurt = 0.14;
    this.events.push({ type: 'hit', x: e.x, y: e.y - 16, id: e.id, kind: e.kind });
    if (e.health === 0) { this.kills++; this.events.push({ type: 'kill', x: e.x, y: e.y, id: e.id, kind: e.kind, angle: e.aim }); if (INFECTED[e.kind].boss) { this.bossKills++; this.events.push({ type: 'boss-defeated', ...e }); } }
  }
  private spawnEnemy(kind: InfectedKind, p: Vec, level: number): boolean {
    if (this.enemies.length >= NIGHT_LIMITS.enemies || !canOccupy(p, INFECTED[kind].radius, INFECTED[kind].flying ? [] : this.obstacles, BASE_WIDTH, BASE_HEIGHT)) return false;
    const stats = levelStats(kind, level, this.stage);
    this.enemies.push({ ...p, id: this.nextEnemyId++, kind, health: stats.health, maxHealth: stats.health, level, aim: 0, moving: true, cooldown: 0, hurt: 0, skillCooldown: 3, summonCooldown: 6 });
    if (INFECTED[kind].boss) { this.bossesSeen.add(kind); this.events.push({ type: 'boss', ...p, kind }); }
    return true;
  }
  private hurtSoldier(s: Soldier, amount: number): void {
    const f = this.fighters.get(s.id)!; if (f.health <= 0) return;
    f.health = Math.max(0, f.health - Math.ceil(amount)); f.hurt = 0.2;
    if (f.health === 0) { s.destination = null; s.stance = 'hold'; s.moving = false; this.events.push({ type: 'unit-death', ...s }); }
  }
  private hurtBuilding(b: BaseBuilding, amount: number): boolean {
    if (b.health <= 0) return false;
    b.health = Math.max(0, b.health - Math.ceil(amount));
    if (b.health > 0) return false;
    const r = buildingRect(b); this.events.push({ type: 'structure-death', x: r.x + r.width / 2, y: r.y + r.height / 2, id: b.id }); return true;
  }
  private hurtArea(p: Vec, radius: number, damage: number): boolean {
    let changed = false;
    for (const s of this.livingSoldiers) if (distance(s, p) <= radius + 11) this.hurtSoldier(s, damage);
    for (const b of this.plan.buildings) if (distance(p, edgePoint(p, buildingRect(b))) <= radius) changed = this.hurtBuilding(b, damage) || changed;
    if (distance(p, edgePoint(p, LIGHTHOUSE_FOOT)) <= radius) { this.lampHealth = Math.max(0, this.lampHealth - Math.ceil(damage)); this.lampHurt = 0.3; this.events.push({ type: 'lamp-hit', ...LIGHTHOUSE }); }
    return changed;
  }
  protected override soldierSpeed(s: Soldier): number {
    return (s.role === 'gunner' ? 100 : 140) * (this.hazards.some(h => h.kind === 'web' && distance(s, h) <= h.radius) ? 0.55 : 1);
  }
  private updateThreats(dt: number): boolean {
    let changed = false;
    for (const h of this.hazards) { h.remaining -= dt; h.tick -= dt; if (h.tick <= 0 && h.remaining > 0) { h.tick += 0.5; changed = this.hurtArea(h, h.radius, h.damage) || changed; } }
    for (let i = this.hazards.length - 1; i >= 0; i--) if (this.hazards[i].remaining <= 0) this.hazards.splice(i, 1);
    for (const e of [...this.enemies]) {
      if (!INFECTED[e.kind].boss || e.health <= 0) continue;
      e.skillCooldown = Math.max(0, (e.skillCooldown ?? 3) - dt); e.summonCooldown = Math.max(0, (e.summonCooldown ?? 6) - dt);
      if ((e.kind === 'queen' || e.kind === 'knight') && e.summonCooldown === 0) {
        const kind = e.kind === 'queen' ? 'spiderling' : 'undead';
        for (const dx of [-40, 40]) this.spawnEnemy(kind, { x: e.x + dx, y: e.y + 32 }, e.level ?? 1);
        e.summonCooldown = e.kind === 'queen' ? 8 : 10; this.events.push({ type: 'summon', ...e });
      }
      if (e.windup) {
        e.windup.remaining -= dt;
        if (e.windup.remaining <= 0) {
          const w = e.windup; delete e.windup; e.cooldown = Math.max(e.cooldown, 0.5); this.events.push({ type: 'cast', ...w.point, kind: e.kind });
          if (w.kind === 'slam' || w.kind === 'detonate') {
            changed = this.hurtArea(w.point, w.radius, Math.round((w.kind === 'detonate' ? 95 : 32) * (1 + ((e.level ?? 1) - 1) * 0.06) * (1 + (this.stage - 1) * 0.12))) || changed;
            this.events.push({ type: 'explosion', ...w.point });
            if (w.kind === 'detonate') { e.health = 0; this.events.push({ type: 'kill', ...e }); }
          }
          else { if (this.hazards.length >= NIGHT_LIMITS.zones) this.hazards.shift(); this.hazards.push({ ...w.point, id: this.nextHazardId++, kind: w.kind, radius: w.radius, remaining: 5, tick: 0.5, damage: (w.kind === 'web' ? 2 : w.kind === 'poison' ? 3 : 4) + this.stage - 1 }); }
        }
        continue;
      }
      if (e.skillCooldown > 0 || e.kind === 'knight') continue;
      const skill = BOSS_SKILLS[e.kind as keyof typeof BOSS_SKILLS];
      const unit = this.livingSoldiers.filter(s => distance(e, s) <= skill.range).sort((a, b) => distance(e, a) - distance(e, b))[0];
      const building = this.plan.buildings.filter(b => b.health > 0).sort((a, b) => distance(e, edgePoint(e, buildingRect(a))) - distance(e, edgePoint(e, buildingRect(b))))[0];
      const point = unit ? { x: unit.x, y: unit.y } : building && distance(e, edgePoint(e, buildingRect(building))) < distance(e, LIGHTHOUSE) ? edgePoint(e, buildingRect(building)) : { ...LIGHTHOUSE };
      if (distance(e, point) > skill.range) continue;
      e.windup = { kind: skill.kind, point: skill.kind === 'detonate' ? { x: e.x, y: e.y } : point, remaining: skill.windup, duration: skill.windup, radius: skill.radius }; e.moving = false; e.skillCooldown = skill.cooldown;
    }
    return changed;
  }
  private end(outcome: 'victory' | 'defeat'): void {
    if (this.status !== 'playing') return;
    if (outcome === 'victory') this.elapsed = NIGHT_SECONDS;
    this.status = outcome; this.bullets = []; this.strikes.length = 0; this.queue.length = 0; this.hazards.length = 0;
    this.plan.buildings = this.plan.buildings.filter(b => b.health > 0);
    for (const s of this.plan.soldiers) s.moving = false;
    for (const e of this.enemies) { e.moving = false; delete e.windup; }
    this.events.push({ type: outcome, ...LIGHTHOUSE });
  }
  summary(): NightResult {
    return { stage: this.stage, outcome: this.status === 'victory' ? 'victory' : 'defeat', duration: this.elapsed, kills: this.kills,
      lampHealth: this.lampHealth, soldiers: this.livingSoldiers.length, buildings: this.plan.buildings.length, strikes: this.strikesUsed, bossKills: this.bossKills };
  }
  resultCampaign(): Campaign {
    if (this.status === 'playing') return cloneCampaign(this.checkpoint);
    if (!this.result) {
      this.result = cloneCampaign(this.checkpoint); this.result.lastNight = this.summary();
      this.result.nightsWon = (this.result.nightsWon ?? 0) + Number(this.status === 'victory');
      if (this.status === 'victory' && this.stage > (this.result.clearedStage ?? 0)) {
        this.result.clearedStage = this.stage;
        const reward = STAGES[this.stage].reward;
        this.result.depot.materials += reward.materials; this.result.depot.energy += reward.energy;
      }
    }
    return cloneCampaign(this.result);
  }
  override step(dt = 1 / 60): void {
    this.events = [];
    if (!this.commanding || !Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 0.05, Math.max(0, NIGHT_SECONDS - this.elapsed)); this.elapsed += dt; this.lampHurt = Math.max(0, this.lampHurt - dt); this.supportCooldown = Math.max(0, this.supportCooldown - dt);
    let obstacles = this.obstacles;
    while (this.wave < this.waves.length && this.elapsed >= this.waves[this.wave].at) {
      this.wave++;
      this.events.push({ type: 'wave', ...LIGHTHOUSE });
    }
    this.spawnTimer -= dt;
    if (this.queue[0]?.at <= this.elapsed && this.spawnTimer <= 0) {
      const cadence = ASSAULT_TUNING[this.stage];
      for (let i = 0; i < cadence.batch && this.queue[0]?.at <= this.elapsed && this.enemies.length < NIGHT_LIMITS.enemies; i++) {
        const boss = this.queue.findIndex(o => o.at <= this.elapsed && INFECTED[o.kind].boss);
        const fronts = [0, 0, 0, 0]; for (const e of this.enemies) if (e.gate !== undefined) fronts[e.gate]++;
        let balanced = 0, smallest = Infinity;
        for (let j = 0; j < this.queue.length && this.queue[j].at <= this.elapsed; j++) if (fronts[this.queue[j].gate] < smallest) { balanced = j; smallest = fronts[this.queue[j].gate]; }
        const index = boss < 0 ? balanced : boss, next = this.queue[index], gate = gatesForStage(this.stage)[next.gate];
        const offset = next.lane * 90 + ((this.nextEnemyId % 6) - 2.5) * 24;
        const point = { x: gate.x + (next.gate % 2 === 0 ? offset : 0), y: gate.y + (next.gate % 2 ? offset : 0) };
        if (this.spawnEnemy(next.kind, point, next.level)) {
          this.enemies[this.enemies.length - 1].gate = next.gate; this.spawnedByGate[next.gate]++;
          this.queue.splice(index, 1);
        } else { next.at += 0.5; this.queue.sort((a, b) => a.at - b.at); }
      }
      this.spawnTimer = cadence.interval;
    }
    this.enemyIndex.rebuild(this.enemies); this.buildingIndex.rebuild(this.plan.buildings);
    this.peakEnemies = Math.max(this.peakEnemies, this.enemies.length);
    this.stepSoldiers(dt);
    for (const s of this.livingSoldiers) {
      const state = this.fighters.get(s.id)!; state.cooldown = Math.max(0, state.cooldown - dt); state.hurt = Math.max(0, state.hurt - dt);
      const melee = s.role === 'vanguard', archer = s.role === 'archer', gunner = s.role === 'gunner', guardian = s.role === 'guardian';
      const origin = { x: s.x, y: s.y - 16 }, target = this.target(origin, melee ? 72 : archer ? 310 : gunner ? 290 : 260, melee || gunner);
      if (target) { s.aim = Math.atan2(target.y - 16 - origin.y, target.x - origin.x); if (state.cooldown === 0) {
        if (melee) { this.events.push({ type: 'swing', ...origin, angle: s.aim }); for (const e of this.enemies) if (!INFECTED[e.kind].flying && distance(e, s) < 72 && firstWall(s, e, obstacles) === null) this.damageEnemy(e, 42); }
        else this.fire(origin, target, gunner ? 55 : guardian ? 10 : archer ? 36 : 18, gunner ? 380 : archer ? 650 : 850, gunner ? 52 : 0, gunner ? 'shell' : archer ? 'arrow' : 'bullet'); state.cooldown = gunner ? 1.2 : guardian ? 0.9 : melee ? 0.7 : archer ? 0.85 : 0.5;
      } }
    }
    for (const b of this.plan.buildings) if (b.kind === 'turret' || b.kind === 'cannon' || b.kind === 'arrowtower' || b.kind === 'sniper') {
      const config = TOWER_ATTACKS[b.kind];
      const turret = this.turrets.get(b.id)!, origin = { x: b.x + 32, y: b.y + 12 };
      const priority = b.kind === 'sniper' ? this.enemies.find(e => e.health > 0 && INFECTED[e.kind].boss && distance(e, origin) <= BUILDINGS[b.kind].range && firstWall(origin, { x: e.x, y: e.y - 16 }, BASE_OBSTACLES) === null) : undefined;
      const target = priority ?? this.target(origin, BUILDINGS[b.kind].range, b.kind === 'cannon');
      turret.cooldown = Math.max(0, turret.cooldown - dt);
      if (target) { turret.aim = Math.atan2(target.y - 16 - origin.y, target.x - origin.x); if (turret.cooldown === 0) { this.fire(origin, target, config.damage, config.speed, config.splash, config.projectile); turret.cooldown = config.interval; } }
    }
    for (const b of this.plan.buildings) if (b.kind === 'flame' || b.kind === 'grid' || b.kind === 'repair') {
      const state = this.turrets.get(b.id)!; state.cooldown = Math.max(0, state.cooldown - dt);
      if (state.cooldown > 0) continue;
      const origin = { x: b.x + 32, y: b.y + 32 }, range = BUILDINGS[b.kind].range;
      if (b.kind === 'repair') {
        for (const other of this.plan.buildings) if (other.id !== b.id && other.health > 0 && other.health < BUILDINGS[other.kind].health && distance(origin, { x: other.x + BUILDINGS[other.kind].width / 2, y: other.y + BUILDINGS[other.kind].height / 2 }) <= range) {
          other.health = Math.min(BUILDINGS[other.kind].health, other.health + FIELD_SYSTEMS.repair.heal); this.events.push({ type: 'heal', x: other.x + 32, y: other.y + 16 });
        }
      } else {
        const victims = this.enemies.filter(e => e.health > 0 && !INFECTED[e.kind].flying && distance(e, origin) <= range && firstWall(origin, e, BASE_OBSTACLES) === null);
        for (const e of victims) { this.damageEnemy(e, FIELD_SYSTEMS[b.kind].damage); if (b.kind === 'grid') e.slowed = FIELD_SYSTEMS.grid.slow; }
        if (victims.length) this.events.push({ type: b.kind === 'flame' ? 'flame' : 'shock', ...origin });
      }
      state.cooldown = FIELD_SYSTEMS[b.kind].interval;
    }
    for (const strike of this.strikes) { strike.delay -= dt; if (strike.delay <= 0) {
      for (const e of this.enemies) if (distance(e, strike) <= 98) this.damageEnemy(e, 130 * Math.max(0.4, 1 - distance(e, strike) / 150));
      this.events.push({ type: 'explosion', x: strike.x, y: strike.y });
    } }
    for (let i = this.strikes.length - 1; i >= 0; i--) if (this.strikes[i].delay <= 0) this.strikes.splice(i, 1);
    for (const bullet of this.bullets) {
      const end = { x: bullet.x + bullet.vx * dt, y: bullet.y + bullet.vy * dt };
      let closest = firstWall(bullet, end, BASE_OBSTACLES) ?? Infinity, victim: NightEnemy | undefined;
      for (const e of this.enemyIndex.near(bullet, 50 + Math.hypot(bullet.vx, bullet.vy) * dt)) if (e.health > 0 && (bullet.projectile !== 'shell' || !INFECTED[e.kind].flying)) { const t = segmentCircle(bullet, end, { x: e.x, y: e.y - 16 }, INFECTED[e.kind].boss ? 24 : e.kind === 'brute' ? 20 : 14); if (t !== null && t < closest) { closest = t; victim = e; } }
      if (closest !== Infinity) {
        bullet.x += (end.x - bullet.x) * closest; bullet.y += (end.y - bullet.y) * closest; bullet.life = 0;
        if (bullet.splash) { for (const e of this.enemies) if (!INFECTED[e.kind].flying && distance({ x: e.x, y: e.y - 16 }, bullet) <= bullet.splash && firstWall(bullet, { x: e.x, y: e.y - 16 }, BASE_OBSTACLES) === null) this.damageEnemy(e, bullet.damage); this.events.push({ type: 'explosion', x: bullet.x, y: bullet.y }); }
        else if (victim) this.damageEnemy(victim, bullet.damage);
      }
      else { bullet.x = end.x; bullet.y = end.y; bullet.life -= dt; }
    }
    this.bullets = this.bullets.filter(b => b.life > 0);
    this.enemies = this.enemies.filter(e => e.health > 0);
    let geometryChanged = this.updateThreats(dt);
    this.enemies = this.enemies.filter(e => e.health > 0);
    if (this.lampHealth === 0) this.end('defeat');
    if (!this.commanding) return;
    for (const e of this.enemies) {
      e.cooldown = Math.max(0, e.cooldown - dt); e.hurt = Math.max(0, e.hurt - dt);
      e.slowed = Math.max(0, (e.slowed ?? 0) - dt);
      if (e.windup) { e.moving = false; continue; }
      const type = INFECTED[e.kind], stats = levelStats(e.kind, e.level, this.stage), lampPoint = edgePoint(e, LIGHTHOUSE_FOOT);
      if (e.slowed > 0) stats.speed *= 0.55;
      const soldier = this.livingSoldiers.filter(s => distance(e, s) < 115 && (type.flying || firstWall(e, s, obstacles) === null)).sort((a, b) => distance(e, a) - distance(e, b))[0];
      let building: BaseBuilding | undefined, nearest = (e.stalled ?? 0) > 0.7 ? 100 : 50;
      if (!type.flying) for (const b of this.buildingIndex.near(e, 166)) {
        const p = edgePoint(e, buildingRect(b)), d = distance(e, p);
        if (b.health > 0 && d < nearest && firstWall(e, p, BASE_OBSTACLES) === null) { nearest = d; building = b; }
      }
      const target = soldier ?? (building ? edgePoint(e, buildingRect(building)) : lampPoint);
      const inRange = distance(e, target) <= (type.flying ? 55 : soldier ? 27 : 24);
      let direction = type.flying || soldier || building ? normalized(target.x - e.x, target.y - e.y) : this.enemyNavigation.direction(e, { x: LIGHTHOUSE.x, y: LIGHTHOUSE.y + 80 });
      if (!type.flying && !soldier && !building && (Math.abs(direction.x) + Math.abs(direction.y) < 0.01 || (e.stalled ?? 0) > 0.7 || e.kind === 'brute')) direction = this.siegeNavigation.direction(e, { x: LIGHTHOUSE.x, y: LIGHTHOUSE.y + 80 });
      e.aim = Math.atan2(direction.y, direction.x); e.moving = !inRange;
      if (!inRange) {
        const x = e.x, y = e.y;
        moveWithCollision(e, direction.x * stats.speed * dt, direction.y * stats.speed * dt, type.radius, type.flying ? [] : obstacles, BASE_WIDTH, BASE_HEIGHT);
        e.stalled = Math.hypot(e.x - x, e.y - y) < stats.speed * dt * 0.15 ? (e.stalled ?? 0) + dt : 0;
      }
      if (inRange && e.cooldown === 0) {
        e.cooldown = type.interval; this.events.push({ type: 'attack', x: target.x, y: target.y });
        if (soldier) {
          this.hurtSoldier(soldier, stats.damage);
        } else if (building) {
          geometryChanged = this.hurtBuilding(building, stats.damage) || geometryChanged;
        } else { this.lampHealth = Math.max(0, this.lampHealth - stats.damage); this.lampHurt = 0.3; this.events.push({ type: 'lamp-hit', ...LIGHTHOUSE }); }
      }
      if (this.lampHealth === 0) { this.end('defeat'); break; }
    }
    if (geometryChanged) { this.plan.buildings = this.plan.buildings.filter(b => b.health > 0); obstacles = this.obstacles; this.enemyNavigation = this.makeEnemyNavigation(); this.rebuildNavigation(); }
    this.enemyIndex.rebuild(this.enemies);
    for (const a of this.enemies) for (const b of this.enemyIndex.near(a, 24)) {
      if (a.id >= b.id) continue;
      const d = distance(a, b); if (d >= 22 || INFECTED[a.kind].flying !== INFECTED[b.kind].flying) continue;
      const v = d > 0.001 ? normalized(a.x - b.x, a.y - b.y) : { x: 1, y: 0 };
      moveWithCollision(a, v.x * (22 - d) / 2, v.y * (22 - d) / 2, INFECTED[a.kind].radius, INFECTED[a.kind].flying ? [] : obstacles, BASE_WIDTH, BASE_HEIGHT);
      moveWithCollision(b, -v.x * (22 - d) / 2, -v.y * (22 - d) / 2, INFECTED[b.kind].radius, INFECTED[b.kind].flying ? [] : obstacles, BASE_WIDTH, BASE_HEIGHT);
    }
    if (!this.commanding) return;
    this.pressure.fill(0);
    for (const e of this.enemies) if (e.gate !== undefined) this.pressure[e.gate]++;
    this.heroHealTimer -= dt;
    if (this.heroHealTimer <= 0) {
      this.heroHealTimer = 6;
      for (const hero of this.livingSoldiers.filter(s => s.role === 'guardian')) for (const s of this.livingSoldiers) if (distance(hero, s) <= 180) {
        const f = this.fighters.get(s.id)!; if (f.health < 90) { f.health = Math.min(90, f.health + 10); this.events.push({ type: 'heal', ...s }); }
      }
    }
    this.healTimer -= dt;
    if (this.healTimer <= 0 && this.campaign.survivors.includes('medic')) {
      const s = this.livingSoldiers.filter(s => this.fighters.get(s.id)!.health < 90).sort((a, b) => this.fighters.get(a.id)!.health - this.fighters.get(b.id)!.health)[0];
      if (s) { const f = this.fighters.get(s.id)!; f.health = Math.min(90, f.health + 8); this.events.push({ type: 'heal', ...s }); }
      this.healTimer = 8;
    }
    if (this.remaining < 1e-6) this.end('victory');
  }
  nightSnapshot() { return { ...super.snapshot(), stage: this.stage, phase: 'night' as const, status: this.status, elapsed: this.elapsed, remaining: this.remaining, lampHealth: this.lampHealth, wave: this.wave,
    kills: this.kills, enemies: structuredClone(this.enemies), bullets: structuredClone(this.bullets), fighters: [...this.fighters].map(([id, f]) => ({ id, ...f })),
    charges: this.charges, supportCooldown: this.supportCooldown, pendingStrikes: structuredClone(this.strikes), hazards: structuredClone(this.hazards), bossesSeen: [...this.bossesSeen], bossKills: this.bossKills, pressure: [...this.pressure], spawnedByGate: [...this.spawnedByGate], peakEnemies: this.peakEnemies, pendingEnemies: this.queue.length, difficulty: this.difficulty, summary: this.status === 'playing' ? null : this.summary() }; }
}
