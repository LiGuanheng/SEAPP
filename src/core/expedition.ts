import { BALANCE as B } from '../config/balance.ts';
import { OBSTACLES, PLAYER_SPAWN, WORLD_HEIGHT, WORLD_WIDTH } from '../config/map.ts';
import { cloneCampaign, emptyCargo, newCampaign, type Campaign, type Cargo, type ExpeditionSummary } from './campaign.ts';
import { canOccupy, distance, firstWall, moveWithCollision } from './geometry.ts';
import type { InputState, Vec } from './types.ts';
import { CombatWorld } from './world.ts';

export const EXPEDITION_SECONDS = 90;
export const CAPACITY = 24;
export const CAMP = { x: 920, y: 760, radius: 66 };
export const SURVIVOR_PROFILES = {
  engineer: { name: '林岚', role: '工程师', ability: '返营额外回收 4 建材', tint: 0xe8c07c },
  medic: { name: '陈安', role: '医护员', ability: '营救时立即恢复 20 生命', tint: 0x9cdbcb },
  captain: { name: '周野', role: '教官', ability: '随队时换弹时间减少 20%', tint: 0xacc9ef },
} as const;
export type SurvivorId = keyof typeof SURVIVOR_PROFILES;
export interface Survivor extends Vec { id: SurvivorId; state: 'waiting' | 'following' | 'secured'; moving: boolean; aim: number }
export interface Cache extends Vec { id: string; name: string; cargo: Cargo; rifle?: boolean; opened: boolean }
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
  ];
  campaign: Campaign;
  summary: ExpeditionSummary | null = null;
  private enemiesEnabled: boolean;
  constructor(campaign = newCampaign(), enemies = true) {
    super(20261023, OBSTACLES, WORLD_WIDTH, WORLD_HEIGHT, PLAYER_SPAWN, false);
    this.campaign = cloneCampaign(campaign); this.enemiesEnabled = enemies;
    if (enemies) for (const point of [{ x: 1450, y: 680 }, { x: 720, y: 520 }, { x: 1440, y: 970 }]) {
      if (canOccupy(point, B.zombie.radius, this.obstacles, this.width, this.height)) this.addZombie(point);
    }
  }
  protected override get spawnInterval(): number { return 6; }
  protected override get maxZombies(): number { return this.enemiesEnabled ? 10 : 0; }
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
    if (this.survivors[0].state === 'waiting') return { text: '营救工程师 · 靠近后按 E', point: this.survivors[0] };
    return { text: '返回信标 · 带物资与幸存者回营 [E]', point: CAMP };
  }
  prompt(): string {
    const item = this.nearby();
    if (item) return 'cargo' in item ? `[E] 搜刮 ${item.name}` : `[E] 营救 ${SURVIVOR_PROFILES[item.id].role} ${SURVIVOR_PROFILES[item.id].name}`;
    if (distance(this.player, CAMP) <= CAMP.radius) return this.hasFinds ? '[E] 提前回营 / 结算本次探索' : '回营信标 · 先带回一些物资或幸存者';
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
      return { ok: true, message: item.rifle ? '获得 AR 突击步枪！按 1 / 2 切换武器' : `已搜刮 ${item.name} · 建材 +${item.cargo.materials} / 电力 +${item.cargo.energy} / 急救包 +${item.cargo.medkits}` };
    }
    if (item && 'state' in item) {
      item.state = 'following';
      if (item.id === 'medic') this.player.health = Math.min(B.player.health, this.player.health + 20);
      const profile = SURVIVOR_PROFILES[item.id];
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
    this.campaign.survivors = [...new Set([...this.campaign.survivors, ...rescued.map(s => s.id)])];
    this.campaign.weapons = [...new Set([...this.campaign.weapons, ...this.ownedWeapons])];
    this.campaign.lastSummary = structuredClone(this.summary);
    for (const s of rescued) s.state = 'secured';
    this.status = 'complete'; this.player.moving = false; this.player.sprinting = false;
    for (const s of this.survivors) s.moving = false;
  }
  override step(input: InputState, dt = B.step): void {
    const before = this.elapsed;
    super.step(input, dt);
    if (this.status !== 'playing' || before === this.elapsed) return;
    const step = this.elapsed - before;
    this.followers.forEach((s, i) => {
      const close = distance(s, this.player) <= 45 + i * 19;
      const direction = this.navigation.direction(s, this.player);
      s.moving = !close; s.aim = Math.atan2(direction.y, direction.x);
      if (!close) moveWithCollision(s, direction.x * 200 * step, direction.y * 200 * step, 10, this.obstacles, this.width, this.height);
    });
    if (this.remaining <= 1e-6) this.finish('sunset');
  }
  override snapshot() {
    return { ...super.snapshot(), expedition: { remaining: this.remaining, capacity: CAPACITY, weight: this.weight, inventory: { ...this.inventory },
      caches: structuredClone(this.caches), survivors: structuredClone(this.survivors), camp: { ...CAMP }, objective: structuredClone(this.objective()),
      summary: structuredClone(this.summary), campaign: cloneCampaign(this.campaign), prompt: this.prompt() } };
  }
}
