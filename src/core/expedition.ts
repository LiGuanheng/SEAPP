import { BALANCE as B } from '../config/balance.ts';
import { PLAYER_SPAWN, WORLD_HEIGHT, WORLD_WIDTH, roomAt, roomDoor, roomRect } from '../config/map.ts';
import { WEAPONS, type WeaponId } from '../config/weapons.ts';
import { cloneCampaign, emptyCargo, newCampaign, type Campaign, type Cargo, type ExpeditionSummary } from './campaign.ts';
import { canOccupy, distance, firstWall, moveWithCollision } from './geometry.ts';
import type { InputState, Vec } from './types.ts';
import { CombatWorld } from './world.ts';
import { explorationLayout, freeLayoutPoint, type ExplorationLayout } from './exploration-layout.ts';
import { ExplorationVision, LIGHT_RADII } from './exploration-vision.ts';
import { SURVIVOR_PROFILES, type SurvivorId } from '../config/survivors.ts';
import { nextStage } from '../config/progression.ts';
import { DIFFICULTIES, type Difficulty } from '../config/difficulty.ts';
import { chooseDistrict, districtCount, districtSeed, DISTRICTS, explorationState, type ExplorationState } from './exploration-state.ts';
export { SURVIVOR_PROFILES, type SurvivorId } from '../config/survivors.ts';

export const EXPEDITION_SECONDS = 90;
export const CAPACITY = 48;
export const CAMP = { x: 920, y: 760, radius: 66 };
export interface Survivor extends Vec { id: SurvivorId; state: 'waiting' | 'following' | 'secured'; moving: boolean; aim: number }
export interface Cache extends Vec { id: string; name: string; cargo: Cargo; rifle?: boolean; weapon?: WeaponId; lampLevel?: 1 | 2; opened: boolean; depleted?: boolean }
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
    { id: 'sentinel', x: 624, y: 1120, state: 'waiting', moving: false, aim: 0 },
    { id: 'striker', x: 1536, y: 400, state: 'waiting', moving: false, aim: 0 },
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
  private eventTriggered = false;
  readonly district: number;
  readonly worldState: ExplorationState;
  private openedThisTrip = new Set<string>();
  get lightRadius(): number { return LIGHT_RADII[this.lanternLevel]; }
  canSee(p: Vec): boolean { return this.vision.canSee(p); }
  get currentRoom(): number { return roomAt(this.player, this.layout.buildings); }
  constructor(campaign = newCampaign(), enemies = true, seed = 20261023 + campaign.expeditions * 7919, difficulty: Difficulty = 'normal') {
    const state = explorationState(campaign.exploration, seed), stage = nextStage(campaign.clearedStage), district = chooseDistrict(state, stage);
    const layout = explorationLayout(districtSeed(state, district), district !== 0);
    super(layout.seed, layout.obstacles, WORLD_WIDTH, WORLD_HEIGHT, PLAYER_SPAWN, false, difficulty);
    this.district = district; this.worldState = state;
    this.layout = layout;
    this.campaign = cloneCampaign(campaign); this.enemiesEnabled = enemies;
    for (const weapon of campaign.weapons) this.acquireWeapon(weapon);
    this.survivors[1].x += layout.medicOffset; this.survivors[2].x += layout.captainOffset;
    for (const [id, room] of [['electrician', 2], ['gunner', 5]] as const) {
      const s = this.survivors.find(s => s.id === id)!, door = roomDoor(layout.buildings[room]);
      s.x = door.x; s.y = door.y - 80;
    }
    for (let i = 0; i < layout.buildings.length; i++) {
      const d = roomDoor(layout.buildings[i]);
      this.caches.push({ id: `room-${i}`, name: `${layout.buildings[i].label} 储藏箱`, x: d.x + layout.roomSides[i] * (i === 1 ? 48 : 40), y: d.y - 80, cargo: { materials: i === 1 ? 4 : 3 + ((layout.seed >>> (i * 3)) % 5), energy: i % 2 ? 2 : ((layout.seed >>> i) % 3), medkits: i === 1 ? 1 : 0 }, weapon: i === 1 ? 'bow' : undefined, lampLevel: i === 1 ? 2 : undefined, opened: false });
    }
    layout.stashes.forEach((p, i) => this.caches.push({ ...p, id: `scout-${i}`, name: '游荡商队遗留补给', cargo: { materials: 3 + i % 2, energy: i % 2, medkits: 0 }, opened: false }));
    this.caches.push({ id: 'lantern-lens', name: '聚光镜片 · 提灯升级', x: 1152, y: 688, cargo: emptyCargo(), lampLevel: 1, opened: false });
    if (stage >= 2) this.caches.push({ id: 'relief', name: '高危区域 · 工程储备', x: 352, y: 400, cargo: { materials: 6, energy: 4, medkits: 0 }, opened: false });
    this.caches.push({ id: 'event', name: layout.event.kind === 'supply' ? '危险货仓' : layout.event.kind === 'clinic' ? '感染救护点' : '受困车队', ...layout.event.point, cargo: { ...layout.event.reward }, rifle: layout.event.kind === 'supply', weapon: layout.event.kind === 'clinic' ? 'bow' : undefined, opened: false });
    if (layout.event.kind === 'rescue') { const s = this.survivors.find(s => s.id === 'captain'); if (s) { s.x = layout.event.point.x + 32; s.y = layout.event.point.y; } }
    if (district !== 0) {
      // 每片新街区的物资、人物跟随各自建筑与种子分布，营地周围不再固定摆满奖励。
      this.caches.forEach((c, i) => {
        if (c.id.startsWith('room-') || c.id.startsWith('scout-') || c.id === 'event') return;
        const d = roomDoor(layout.buildings[(i + district) % layout.buildings.length]); c.x = d.x + (i % 2 ? 44 : -44); c.y = d.y - 62;
      });
      this.survivors.forEach((s, i) => { const d = roomDoor(layout.buildings[(i + district) % layout.buildings.length]); s.x = d.x + (i % 2 ? 36 : -36); s.y = d.y - 118 - Math.floor(i / 6) * 80; });
    }
    for (const p of [...this.caches, ...this.survivors]) if (!canOccupy(p, 12, this.obstacles, this.width, this.height)) Object.assign(p, freeLayoutPoint(p, this.obstacles));
    for (let i = 0; i < this.survivors.length; i++) {
      const person = this.survivors[i], free = (p: Vec) => canOccupy(p, 12, this.obstacles, this.width, this.height) && this.survivors.slice(0, i).every(s => distance(s, p) >= 36) && this.caches.every(c => distance(c, p) >= 20);
      if (!free(person)) { const start = { ...person }; let found = false; for (let r = 32; r <= 192 && !found; r += 32) for (const [dx, dy] of [[0, r], [r, 0], [-r, 0], [0, -r], [r, r], [-r, -r]]) { const p = { x: start.x + dx, y: start.y + dy }; if (free(p)) { Object.assign(person, p); found = true; break; } } }
    }
    // 先为完整人员表确定落点，再隐藏已救/未解锁人物；救走一人不会挪动其他人的位置。
    for (let i = this.survivors.length - 1; i >= 0; i--) {
      const s = this.survivors[i];
      if (SURVIVOR_PROFILES[s.id].stage > stage || campaign.survivors.includes(s.id)) this.survivors.splice(i, 1);
    }
    const spent = new Set(state.looted[district]); for (const c of this.caches) { c.opened = spent.has(c.id); c.depleted = c.opened; }
    this.lanternLevel = campaign.lanternLevel ?? 0;
    this.vision = new ExplorationVision(this.width, this.height, this.obstacles); this.vision.update(this.player, this.lightRadius);
    const initialPoints = [{ x: 1450, y: 680 }, { x: 720, y: 520 }, { x: 1440, y: 970 }, { x: 624, y: 960 }, { x: 1536, y: 1104 }];
    if (enemies) for (const point of initialPoints.slice(0, Math.round(3 * DIFFICULTIES[difficulty].count))) {
      if (canOccupy(point, B.zombie.radius, this.obstacles, this.width, this.height)) this.addZombie(point);
    }
  }
  protected override get spawnInterval(): number { return (6 - (nextStage(this.campaign?.clearedStage) - 1) * 0.6) / DIFFICULTIES[this.difficulty].count; }
  protected override get maxZombies(): number { return this.enemiesEnabled ? Math.round((10 + (nextStage(this.campaign.clearedStage) - 1) * 2) * DIFFICULTIES[this.difficulty].count) : 0; }
  override get reloadDuration(): number { return this.weapon.reload * (this.campaign.survivors.includes('captain') || this.survivors.some(s => s.id === 'captain' && s.state === 'following') ? 0.8 : 1); }
  get remaining(): number { return Math.max(0, EXPEDITION_SECONDS - this.elapsed); }
  get weight(): number { return cargoWeight(this.inventory); }
  get followers(): Survivor[] { return this.survivors.filter(s => s.state === 'following'); }
  get hasFinds(): boolean { return this.openedThisTrip.size > 0 || this.followers.length > 0; }
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
    const waiting = this.survivors.find(s => s.state === 'waiting');
    if (waiting) return { text: `营救${SURVIVOR_PROFILES[waiting.id].role} · 靠近后按 E`, point: waiting };
    const supply = this.caches.find(c => !c.opened); if (supply) return { text: `搜刮${supply.name} · 靠近后按 E`, point: supply };
    return { text: '返回信标 · 带物资与幸存者回营 [E]', point: CAMP };
  }
  prompt(): string {
    const item = this.nearby();
    if (item) return 'cargo' in item ? `[E] 搜刮 ${item.name}` : `[E] 营救 ${SURVIVOR_PROFILES[item.id].role} ${SURVIVOR_PROFILES[item.id].name}`;
    if (distance(this.player, CAMP) <= CAMP.radius) return this.hasFinds ? '[E] 提前回营 / 结算本次探索' : this.campaign.expeditions > 0 || this.caches.every(c => c.opened) ? '[E] 空手回营 / 更换搜救街区' : '回营信标 · 先带回一些物资或幸存者';
    const entrance = this.layout.buildings.find(b => distance(this.player, roomDoor(b)) < 72);
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
      this.openedThisTrip.add(item.id);
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
    if (distance(this.player, CAMP) <= CAMP.radius && (this.hasFinds || this.campaign.expeditions > 0 || this.caches.every(c => c.opened))) {
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
      caches: this.openedThisTrip.size, rescued: rescued.map(s => s.id), cargo: { ...this.inventory }, engineerBonus, seed: this.layout.seed };
    this.worldState.looted[this.district] = [...new Set([...this.worldState.looted[this.district], ...this.openedThisTrip])];
    if (this.caches.every(c => c.opened) && this.survivors.every(s => s.state !== 'waiting')) this.worldState.exhausted = [...new Set([...(this.worldState.exhausted ?? []), this.district])];
    this.worldState.visits[this.district]++; this.worldState.lastDistrict = this.district; this.campaign.exploration = structuredClone(this.worldState);
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
        const r = roomRect(this.layout.buildings[room]);
        for (const offset of [128, 192]) { const p = { x: r.x + offset, y: r.y + 144 }; if (this.zombies.length < 16 && canOccupy(p, 11, this.obstacles, this.width, this.height)) this.addZombie(p); }
      }
    }
    const event = this.layout.event;
    if (this.enemiesEnabled && !this.eventTriggered && distance(this.player, event.point) < 190) {
      this.eventTriggered = true;
      for (const offset of [{ x: -80, y: 40 }, { x: 80, y: 40 }, { x: 0, y: 100 }]) {
        const p = { x: event.point.x + offset.x, y: event.point.y + offset.y };
        if (this.zombies.length < 16 && canOccupy(p, 11, this.obstacles, this.width, this.height)) this.addZombie(p);
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
      summary: structuredClone(this.summary), campaign: cloneCampaign(this.campaign), prompt: this.prompt(), currentRoom: this.currentRoom, exploredRooms: [...this.exploredRooms], layout: structuredClone(this.layout), eventTriggered: this.eventTriggered,
      district: this.district, districtName: DISTRICTS[this.district], unlockedDistricts: districtCount(nextStage(this.campaign.clearedStage)), depletedCaches: this.caches.filter(c => c.depleted).length,
      lanternLevel: this.lanternLevel, lightRadius: this.lightRadius, vision: { explored: this.vision.explored, revision: this.vision.revision, visibleEnemies: this.zombies.filter(z => this.canSee(z)).map(z => z.id), visibleCaches: this.caches.filter(c => this.canSee(c)).map(c => c.id), visibleSurvivors: this.survivors.filter(s => this.canSee(s)).map(s => s.id) } } };
  }
}
