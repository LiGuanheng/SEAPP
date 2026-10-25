import { BALANCE as B } from '../config/balance.ts';
import { BUILDINGS, OBSTACLES, PLAYER_SPAWN, WORLD_HEIGHT, WORLD_WIDTH, roomAt, roomDoor, roomRect } from '../config/map.ts';
import { WEAPONS, type WeaponId } from '../config/weapons.ts';
import { cloneCampaign, emptyCargo, newCampaign, type Campaign, type Cargo, type ExpeditionSummary } from './campaign.ts';
import { canOccupy, distance, firstWall, moveWithCollision } from './geometry.ts';
import type { InputState, Vec } from './types.ts';
import { CombatWorld } from './world.ts';
import { explorationLayout, type ExplorationLayout } from './exploration-layout.ts';
import { ExplorationVision, LIGHT_RADII } from './exploration-vision.ts';
import { SURVIVOR_PROFILES, type SurvivorId } from '../config/survivors.ts';
import { nextStage } from '../config/progression.ts';
export { SURVIVOR_PROFILES, type SurvivorId } from '../config/survivors.ts';

export const EXPEDITION_SECONDS = 90;
export const CAPACITY = 48;
export const CAMP = { x: 920, y: 760, radius: 66 };
export interface Survivor extends Vec { id: SurvivorId; state: 'waiting' | 'following' | 'secured'; moving: boolean; aim: number }
export interface Cache extends Vec { id: string; name: string; cargo: Cargo; rifle?: boolean; weapon?: WeaponId; lampLevel?: 1 | 2; opened: boolean }
export interface ActionResult { ok: boolean; message: string }
export const cargoWeight = (c: Cargo): number => c.materials + c.energy + c.medkits * 2;

export class ExpeditionWorld extends CombatWorld {
  readonly inventory = emptyCargo();
  readonly caches: Cache[] = [
    { id: 'salvage', name: '维修工具箱', x: 1056, y: 736, cargo: { materials: 8, energy: 2, medkits: 0 }, opened: false },
    { id: 'weapon', name: '军用武器箱', x: 1200, y: 780, cargo: emptyCargo(), rifle: true, opened: false },
    { id: 'medical', name: '急救补给箱', x: 1264, y: 704, cargo: { materials: 4, energy: 0, medkits: 1 }, opened: false },
    { id: 'battery', name: '应急电池箱', x: 1400, y: 816, cargo: { materials: 0, energy: 6, medkits: 0 }, opened: false },
    { id: 'warehouse', name: '仓库遗留箱', x: 768, y: 784, cargo: { materials: 10, energy: 0, medkits: 0 }, opened: false },
  ];
  readonly survivors: Survivor[] = [
    { id: 'engineer', x: 1104, y: 852, state: 'waiting', moving: false, aim: -Math.PI / 2 },
    { id: 'medic', x: 800, y: 560, state: 'waiting', moving: false, aim: 0 },
    { id: 'captain', x: 1400, y: 744, state: 'waiting', moving: false, aim: Math.PI },
    { id: 'ranger', x: 1136, y: 400, state: 'waiting', moving: false, aim: Math.PI / 2 },
    { id: 'brawler', x: 1136, y: 1168, state: 'waiting', moving: false, aim: -Math.PI / 2 },
    { id: 'electrician', x: 1824, y: 352, state: 'waiting', moving: false, aim: 0 },
    { id: 'guardian', x: 352, y: 368, state: 'waiting', moving: false, aim: 0 },
    { id: 'gunner', x: 1824, y: 1168, state: 'waiting', moving: false, aim: 0 },
  ];
  campaign: Campaign;
  summary: ExpeditionSummary | null = null;
  private enemiesEnabled: boolean;
  readonly exploredRooms = new Set<number>();
  private allyCooldowns = new Map<string, number>();
  readonly layout: ExplorationLayout;
  readonly vision: ExplorationVision;
  lanternLevel = 0;
  private visionTimer = 0;
  get lightRadius(): number { return LIGHT_RADII[this.lanternLevel]; }
  canSee(p: Vec): boolean { return this.vision.canSee(p); }
  get currentRoom(): number { return roomAt(this.player); }
  constructor(campaign = newCampaign(), enemies = true, seed = 20261023 + campaign.expeditions * 7919) {
    const layout = explorationLayout(seed);
    super(seed, [...OBSTACLES, ...layout.debris], WORLD_WIDTH, WORLD_HEIGHT, PLAYER_SPAWN, false);
    this.layout = layout;
    this.campaign = cloneCampaign(campaign); this.enemiesEnabled = enemies;
    this.survivors[1].x += layout.medicOffset; this.survivors[2].x += layout.captainOffset;
    const stage = nextStage(campaign.clearedStage);
    for (let i = this.survivors.length - 1; i >= 0; i--) {
      const s = this.survivors[i], p = SURVIVOR_PROFILES[s.id];
      if (p.stage > stage || p.hero && campaign.survivors.includes(s.id)) this.survivors.splice(i, 1);
    }
    for (let i = 0; i < BUILDINGS.length; i++) {
      const d = roomDoor(BUILDINGS[i]);
      this.caches.push({ id: `room-${i}`, name: `${BUILDINGS[i].label} 储藏箱`, x: d.x + layout.roomSides[i] * 48, y: d.y - 80, cargo: { materials: 4, energy: i % 2 ? 2 : 0, medkits: i === 1 ? 1 : 0 }, weapon: i === 1 ? 'bow' : undefined, lampLevel: i === 1 ? 2 : undefined, opened: false });
    }
    layout.stashes.forEach((p, i) => this.caches.push({ ...p, id: `scout-${i}`, name: '游荡商队遗留补给', cargo: { materials: 3 + i % 2, energy: i % 2, medkits: 0 }, opened: false }));
    this.caches.push({ id: 'lantern-lens', name: '聚光镜片 · 提灯升级', x: 1152, y: 688, cargo: emptyCargo(), lampLevel: 1, opened: false });
    if (stage >= 2) this.caches.push({ id: 'relief', name: '高危区域 · 工程储备', x: 352, y: 400, cargo: { materials: 6, energy: 4, medkits: 0 }, opened: false });
    this.lanternLevel = campaign.lanternLevel ?? 0;
    this.vision = new ExplorationVision(this.width, this.height, this.obstacles); this.vision.update(this.player, this.lightRadius);
    if (enemies) for (const point of [{ x: 1450, y: 680 }, { x: 720, y: 520 }, { x: 1440, y: 970 }]) {
      if (canOccupy(point, B.zombie.radius, this.obstacles, this.width, this.height)) this.addZombie(point);
    }
  }
  protected override get spawnInterval(): number { return 6 - (nextStage(this.campaign?.clearedStage) - 1) * 0.6; }
  protected override get maxZombies(): number { return this.enemiesEnabled ? 10 + (nextStage(this.campaign.clearedStage) - 1) * 2 : 0; }
  override get reloadDuration(): number { return this.weapon.reload * (this.survivors.some(s => s.id === 'captain' && s.state === 'following') ? 0.8 : 1); }
  get remaining(): number { return Math.max(0, EXPEDITION_SECONDS - this.elapsed); }
  get weight(): number { return cargoWeight(this.inventory); }
  get followers(): Survivor[] { return this.survivors.filter(s => s.state === 'following'); }
  get hasFinds(): boolean { return this.caches.some(c => c.opened) || this.followers.length > 0; }
  nearby(): Cache | Survivor | null {
    const nearby = [...this.caches.filter(c => !c.opened), ...this.survivors.filter(s => s.state === 'waiting')]
      .filter(item => distance(this.player, item) <= 64 && firstWall(this.player, item, this.obstacles) === null)
      .sort((a, b) => distance(this.player, a) - distance(this.player, b));
    return nearby[0] ?? null;
  }
  objective(): { text: string; point: Vec } {
    if (!this.caches[0].opened) return { text: '搜刮工具箱 · 靠近后按 E', point: this.caches[0] };
    if (!this.caches[1].opened) return { text: '寻找步枪 · 靠近武器箱按 E', point: this.caches[1] };
    const hero = this.survivors.find(s => SURVIVOR_PROFILES[s.id].hero && s.state === 'waiting');
    if (hero) return { text: `高危搜救 · ${SURVIVOR_PROFILES[hero.id].role} [E]`, point: hero };
    if (this.survivors[0].state === 'waiting') return { text: '营救工程师 · 靠近后按 E', point: this.survivors[0] };
    return { text: '返回信标 · 带物资与幸存者回营 [E]', point: CAMP };
  }
  prompt(): string {
    const item = this.nearby();
    if (item) return 'cargo' in item ? `[E] 搜刮 ${item.name}` : `[E] 营救 ${SURVIVOR_PROFILES[item.id].role} ${SURVIVOR_PROFILES[item.id].name}`;
    if (distance(this.player, CAMP) <= CAMP.radius) return this.hasFinds ? '[E] 提前回营 / 结算本次探索' : '回营信标 · 先带回一些物资或幸存者';
    const entrance = BUILDINGS.find(b => distance(this.player, roomDoor(b)) < 72);
    if (entrance) return `${entrance.label} · 从门口直接走入，屋顶自动隐藏`;
    return '';
  }
  interact(): ActionResult {
    if (this.status !== 'playing') return { ok: false, message: '本次探索已结束' };
    const item = this.nearby();
    if (item && 'cargo' in item) {
      if (this.weight + cargoWeight(item.cargo) > CAPACITY) return { ok: false, message: `背包已满 (${this.weight}/${CAPACITY})，可使用急救包腾出空间或先回营` };
      for (const key of ['materials', 'energy', 'medkits'] as const) this.inventory[key] += item.cargo[key];
      item.opened = true;
      if (item.rifle) this.acquireWeapon('rifle');
      if (item.weapon) this.acquireWeapon(item.weapon);
      const upgraded = item.lampLevel !== undefined && item.lampLevel > this.lanternLevel;
      if (upgraded) { this.lanternLevel = item.lampLevel!; this.vision.update(this.player, this.lightRadius); }
      return { ok: true, message: `${item.weapon ? `获得 ${WEAPONS[item.weapon].name} · 4 装备猎弓` : item.rifle ? '获得 AR 突击步枪！按 1 / 2 切换武器' : `已搜刮 ${item.name} · 建材 +${item.cargo.materials} / 电力 +${item.cargo.energy} / 急救包 +${item.cargo.medkits}`}${upgraded ? ` · 提灯 ${this.lanternLevel} 级 / 视野 ${this.lightRadius}` : ''}` };
    }
    if (item && 'state' in item) {
      item.state = 'following';
      if (item.id === 'medic') this.player.health = Math.min(B.player.health, this.player.health + 20);
      const profile = SURVIVOR_PROFILES[item.id];
      if (profile.hero && this.enemiesEnabled) for (const dx of [-96, 96]) {
        const point = { x: item.x + dx, y: item.y - 48 };
        if (this.zombies.length < 16 && distance(point, this.player) > 64 && canOccupy(point, 11, this.obstacles, this.width, this.height)) this.addZombie(point);
      }
      return { ok: true, message: `${profile.name} 已加入队伍 · ${profile.ability}` };
    }
    if (distance(this.player, CAMP) <= CAMP.radius && this.hasFinds) {
      if (this.followers.some(s => distance(this.player, s) > 150)) return { ok: false, message: '有队员尚未跟上，请在信标附近等待汇合后再按 E' };
      this.finish('return'); return { ok: true, message: '队伍已返回营地，物资入库' };
    }
    return { ok: false, message: '靠近物资箱或幸存者后按 E；在信标旁可提前回营' };
  }
  useMedkit(): ActionResult {
    if (this.status !== 'playing' || !this.inventory.medkits || this.player.health >= B.player.health) return { ok: false, message: '需要受伤且背包中有急救包才能使用' };
    this.inventory.medkits--; this.player.health = Math.min(B.player.health, this.player.health + 50);
    return { ok: true, message: '使用急救包 · 恢复 50 生命（不超过上限）' };
  }
  private finish(reason: ExpeditionSummary['reason']): void {
    if (this.status !== 'playing') return;
    // 固定步长的浮点累积可能略小于 90；结算统一到精确截止时间。
    if (reason === 'sunset') this.elapsed = EXPEDITION_SECONDS;
    // 黄昏自动收队只带回已汇合、仍在队长附近的队员，避免远程营救。
    const rescued = this.followers.filter(s => distance(this.player, s) <= 150);
    const engineerBonus = rescued.some(s => s.id === 'engineer') ? 4 : 0;
    this.summary = { reason, duration: Math.min(EXPEDITION_SECONDS, this.elapsed), kills: this.kills,
      caches: this.caches.filter(c => c.opened).length, rescued: rescued.map(s => s.id), cargo: { ...this.inventory }, engineerBonus };
    this.campaign.expeditions++;
    for (const key of ['materials', 'energy', 'medkits'] as const) this.campaign.depot[key] += this.inventory[key];
    this.campaign.depot.materials += engineerBonus;
    if (rescued.some(s => s.id === 'electrician')) { this.campaign.depot.energy += 3; this.summary.specialistBonus = 3; }
    this.campaign.survivors = [...new Set([...this.campaign.survivors, ...rescued.map(s => s.id)])];
    this.campaign.weapons = [...new Set([...this.campaign.weapons, ...this.ownedWeapons])];
    this.campaign.lastSummary = structuredClone(this.summary);
    this.campaign.lanternLevel = this.lanternLevel;
    for (const s of rescued) s.state = 'secured';
    this.status = 'complete'; this.player.moving = false; this.player.sprinting = false;
    for (const s of this.survivors) s.moving = false;
  }
  override step(input: InputState, dt = B.step): void {
    const before = this.elapsed;
    super.step(input, dt);
    if (this.status !== 'playing' || before === this.elapsed) return;
    const step = this.elapsed - before;
    this.visionTimer -= step;
    if (this.visionTimer <= 0) { this.vision.update(this.player, this.lightRadius); this.visionTimer = 0.1; }
    const room = this.currentRoom;
    if (room >= 0 && !this.exploredRooms.has(room)) {
      this.exploredRooms.add(room);
      if (this.enemiesEnabled) {
        const r = roomRect(BUILDINGS[room]);
        for (const offset of [128, 192]) { const p = { x: r.x + offset, y: r.y + 144 }; if (this.zombies.length < 16 && canOccupy(p, 11, this.obstacles, this.width, this.height)) this.addZombie(p); }
      }
    }
    this.followers.forEach((s, i) => {
      const close = distance(s, this.player) <= 45 + i * 19;
      const direction = this.navigation.direction(s, this.player);
      s.moving = !close; s.aim = Math.atan2(direction.y, direction.x);
      if (!close) moveWithCollision(s, direction.x * 200 * step, direction.y * 200 * step, 10, this.obstacles, this.width, this.height);
      if (s.id === 'ranger' || s.id === 'brawler') {
        const cooldown = Math.max(0, (this.allyCooldowns.get(s.id) ?? 0) - step); this.allyCooldowns.set(s.id, cooldown);
        const target = this.zombies.filter(z => z.health > 0 && distance(s, z) < (s.id === 'ranger' ? 270 : 72) && firstWall(s, z, this.obstacles) === null).sort((a, b) => distance(s, a) - distance(s, b))[0];
        if (target && cooldown === 0) { s.aim = Math.atan2(target.y - s.y, target.x - s.x); this.allyAttack(s, target, s.id === 'brawler'); this.allyCooldowns.set(s.id, s.id === 'ranger' ? 0.85 : 0.7); }
      }
    });
    if (this.remaining <= 1e-6) this.finish('sunset');
  }
  override snapshot() {
    return { ...super.snapshot(), expedition: { remaining: this.remaining, capacity: CAPACITY, weight: this.weight, inventory: { ...this.inventory },
      caches: structuredClone(this.caches), survivors: structuredClone(this.survivors), camp: { ...CAMP }, objective: structuredClone(this.objective()),
      summary: structuredClone(this.summary), campaign: cloneCampaign(this.campaign), prompt: this.prompt(), currentRoom: this.currentRoom, exploredRooms: [...this.exploredRooms], layout: structuredClone(this.layout),
      lanternLevel: this.lanternLevel, lightRadius: this.lightRadius, vision: { explored: this.vision.explored, revision: this.vision.revision, visibleEnemies: this.zombies.filter(z => this.canSee(z)).map(z => z.id), visibleCaches: this.caches.filter(c => this.canSee(c)).map(c => c.id), visibleSurvivors: this.survivors.filter(s => this.canSee(s)).map(s => s.id) } } };
  }
}
