import { BASE_HEIGHT, BASE_OBSTACLES, BASE_WIDTH, BUILDINGS, GRID, LIGHTHOUSE, RESERVED_ROUTES, OUTER_ENTRY_AREAS, REFITS, refitFor, buildingRect, overlaps, saleRefund, type BasePlan, type BuildingKind, type Soldier, validPoint } from '../config/base.ts';
import { cloneCampaign, type Campaign } from './campaign.ts';
import { canOccupy, circleOverlapsRect, distance, moveWithCollision, normalized } from './geometry.ts';
import { Navigation } from './navigation.ts';
import type { Rect, Vec } from './types.ts';
import type { ActionResult } from './expedition.ts';
import { nextStage, STAGES, type StageId } from '../config/progression.ts';
import { migrateBase } from './base-migration.ts';
import { armyLimit } from '../config/growth.ts';
import { HERO_IDS, isHero } from '../config/survivors.ts';

export class BaseWorld {
  readonly campaign: Campaign;
  readonly plan: BasePlan;
  private navigation = new Map<number, Navigation>();
  private nextId = 1;
  constructor(campaign: Campaign) {
    this.campaign = cloneCampaign(campaign);
    this.plan = this.campaign.base ? migrateBase(this.campaign.base) : { version: 2, status: 'preparing', elapsed: 0, buildings: [], soldiers: [
      { id: 1, x: LIGHTHOUSE.x - 80, y: LIGHTHOUSE.y + 112, aim: -Math.PI / 2, destination: null, stance: 'hold', moving: false },
      { id: 2, x: LIGHTHOUSE.x - 16, y: LIGHTHOUSE.y + 112, aim: -Math.PI / 2, destination: null, stance: 'hold', moving: false },
      { id: 3, x: LIGHTHOUSE.x + 48, y: LIGHTHOUSE.y + 112, aim: -Math.PI / 2, destination: null, stance: 'hold', moving: false },
    ] };
    this.plan.stage ??= nextStage(campaign.clearedStage);
    const recruit = (role: NonNullable<Soldier['role']>) => {
      if (this.plan.soldiers.length >= armyLimit(this.stage)) {
        // 满编时英雄优先替换一名普通步枪手，保留独有英雄。
        if (isHero(role)) { const reserve = [...this.plan.soldiers].reverse().find(s => !s.role || s.role === 'rifle'); if (reserve) reserve.role = role; }
        return;
      }
      const id = this.plan.soldiers.length + 1;
      const candidate = { id, x: LIGHTHOUSE.x + 112, y: LIGHTHOUSE.y + 112, aim: -Math.PI / 2, destination: null, stance: 'hold' as const, moving: false, role };
      // 旧阵地可能已占用新兵集结点；寻找真实可通行位置。
      const free = (p: Vec) => canOccupy(p, 13, this.obstacles, BASE_WIDTH, BASE_HEIGHT) && this.plan.soldiers.every(s => distance(s, p) > (isHero(role) || isHero(s.role) ? 48 : 28));
      if (!free(candidate)) for (let radius = 32, found = false; radius <= 320 && !found; radius += 32) for (let n = 0; n < 8; n++) {
        const p = { x: LIGHTHOUSE.x + 112 + Math.cos(n * Math.PI / 4) * radius, y: LIGHTHOUSE.y + 112 + Math.sin(n * Math.PI / 4) * radius };
        if (free(p)) { candidate.x = p.x; candidate.y = p.y; found = true; break; }
      }
      if (free(candidate) && this.plan.soldiers.length < armyLimit(this.stage)) this.plan.soldiers.push(candidate);
    };
    if (this.campaign.survivors.includes('captain') && this.plan.soldiers.filter(s => !s.role || s.role === 'rifle').length < 4) recruit('rifle');
    for (const [profile, role] of [['ranger', 'archer'], ['brawler', 'vanguard']] as const) if (this.campaign.survivors.includes(profile) && !this.plan.soldiers.some(s => s.role === role)) recruit(role);
    for (const role of HERO_IDS) if (this.campaign.survivors.includes(role) && !this.plan.soldiers.some(s => s.role === role)) recruit(role);
    if (this.campaign.reserves) for (const role of ['rifle', 'archer', 'vanguard'] as const) while (this.campaign.reserves[role] > 0 && this.plan.soldiers.length < armyLimit(this.stage)) { const before = this.plan.soldiers.length; recruit(role); if (this.plan.soldiers.length === before) break; this.campaign.reserves[role]--; }
    this.campaign.base = this.plan;
    this.nextId = Math.max(0, ...this.plan.buildings.map(b => b.id)) + 1;
    this.rebuildNavigation();
  }
  get remaining(): number { return 0; }
  get stage(): StageId { return this.plan.stage ?? nextStage(this.campaign.clearedStage); }
  get buildArea(): Rect { return STAGES[this.stage].area; }
  get lightRadius(): number { return STAGES[this.stage].lightRadius; }
  unlocked(kind: BuildingKind): boolean { return BUILDINGS[kind].stage <= this.stage; }
  get commanding(): boolean { return this.plan.status === 'preparing'; }
  get livingSoldiers(): Soldier[] { return this.plan.soldiers; }
  turretAim(_id: number): number { return -Math.PI / 2; }
  turretRecoil(_id: number): number { return 0; }
  get obstacles(): Rect[] { return [...BASE_OBSTACLES, ...this.plan.buildings.map(buildingRect)]; }
  cost(kind: BuildingKind) {
    const config = BUILDINGS[kind];
    return { materials: Math.max(1, config.materials - Number(this.campaign.survivors.includes('engineer'))), energy: config.energy };
  }
  preview(kind: BuildingKind, point: Vec, rotation: 0 | 1): ActionResult {
    if (this.plan.status !== 'preparing') return { ok: false, message: '布防已完成，点击继续调整可重新部署' };
    if (!this.unlocked(kind)) return { ok: false, message: `${BUILDINGS[kind].name} 在第 ${BUILDINGS[kind].stage} 阶段解锁` };
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x % GRID || point.y % GRID) return { ok: false, message: '请选择有效网格' };
    const r = buildingRect({ kind, ...point, rotation });
    const area = this.buildArea;
    if (r.x < area.x || r.y < area.y || r.x + r.width > area.x + area.width || r.y + r.height > area.y + area.height) return { ok: false, message: '仅可在本阶段虚线布防区内建设；守夜胜利可扩建' };
    if (RESERVED_ROUTES.some(o => overlaps(r, o))) return { ok: false, message: '保留十字通道，不能封锁出入口' };
    if (this.stage >= 4 && OUTER_ENTRY_AREAS.some(o => overlaps(r, o))) return { ok: false, message: '尸潮入口，必须留通道' };
    if (this.obstacles.some(o => overlaps(r, o))) return { ok: false, message: '地基与已有设施重叠' };
    if (this.plan.soldiers.some(s => circleOverlapsRect(s, 13, r))) return { ok: false, message: '地基上有士兵，请先移开' };
    if (this.plan.soldiers.some(s => s.destination && circleOverlapsRect(s.destination, 13, r))) return { ok: false, message: '地基占用了部队目的地，请先更改指令' };
    const cost = this.cost(kind);
    if (this.campaign.depot.materials < cost.materials || this.campaign.depot.energy < cost.energy) return { ok: false, message: `库存不足：需要建材 ${cost.materials} / 电力 ${cost.energy}` };
    return { ok: true, message: `左键建造 ${BUILDINGS[kind].name} · 建材 ${cost.materials} / 电力 ${cost.energy}` };
  }
  build(kind: BuildingKind, point: Vec, rotation: 0 | 1 = 0): ActionResult {
    const valid = this.preview(kind, point, rotation); if (!valid.ok) return valid;
    const candidate = buildingRect({ kind, ...point, rotation });
    const nav = new Navigation(BASE_WIDTH, BASE_HEIGHT, GRID, [...this.obstacles, candidate], 11); nav.rebuild({ x: LIGHTHOUSE.x, y: LIGHTHOUSE.y + 80 });
    if (this.plan.soldiers.some(s => nav.field[Math.floor(s.y / GRID) * nav.cols + Math.floor(s.x / GRID)] < 0)) return { ok: false, message: '此处建设会困住士兵，请保留通路' };
    const paid = this.cost(kind);
    this.campaign.depot.materials -= paid.materials; this.campaign.depot.energy -= paid.energy;
    this.plan.buildings.push({ id: this.nextId++, kind, ...point, rotation, health: BUILDINGS[kind].health, paid });
    this.rebuildNavigation();
    return { ok: true, message: `${BUILDINGS[kind].name} 已建成` };
  }
  demolish(id: number): ActionResult {
    if (this.plan.status !== 'preparing') return { ok: false, message: '请先继续调整阵地' };
    const index = this.plan.buildings.findIndex(b => b.id === id);
    if (index < 0) return { ok: false, message: '请先选择设施' };
    const building = this.plan.buildings[index], refund = saleRefund(building);
    this.campaign.depot.materials += refund; this.plan.buildings.splice(index, 1); this.rebuildNavigation();
    return { ok: true, message: `已出售，返还 ${refund} 建材；电力不返还` };
  }
  refit(id: number): ActionResult {
    if (this.plan.status !== 'preparing') return { ok: false, message: '只能在黄昏布防时改装' };
    const b = this.plan.buildings.find(b => b.id === id), kind = b && refitFor(b.kind);
    if (!b || !kind || b.upgrade) return { ok: false, message: '选择尚未改装的机枪塔或加农炮' };
    const config = REFITS[kind], materials = config.materials - Number(this.campaign.survivors.includes('engineer'));
    if (this.stage < config.stage) return { ok: false, message: `${config.name} · 阶段${config.stage}解锁` };
    if (this.campaign.depot.materials < materials || this.campaign.depot.energy < config.energy) return { ok: false, message: `改装需要建材${materials} / 电力${config.energy}` };
    this.campaign.depot.materials -= materials; this.campaign.depot.energy -= config.energy;
    b.upgrade = kind; b.upgradePaid = { materials, energy: config.energy }; b.health += config.health - BUILDINGS[b.kind].health;
    return { ok: true, message: `${config.name} 改装完成 · ${config.description}` };
  }
  buildWalls(points: readonly Vec[]): ActionResult & { built: number } {
    let built = 0, blocked = '';
    for (const point of points) { const result = this.build('wall', point); if (result.ok) built++; else blocked = result.message; }
    return { ok: built > 0, built, message: built ? `连续建墙 ${built} 段${blocked ? ' · 不合法或已占用的格子已跳过' : ''}` : blocked || '请拖动到新的网格' };
  }
  protected rebuildNavigation(): void {
    this.navigation.clear();
    for (const soldier of this.plan.soldiers) if (soldier.destination) {
      const nav = new Navigation(BASE_WIDTH, BASE_HEIGHT, GRID, this.obstacles, 11); nav.rebuild(soldier.destination); this.navigation.set(soldier.id, nav);
    }
  }
  move(ids: readonly number[], target: Vec): ActionResult {
    if (!this.commanding) return { ok: false, message: '当前不能向部队下令' };
    const selected = this.livingSoldiers.filter(s => ids.includes(s.id));
    if (!selected.length) return { ok: false, message: '先左键选中或框选士兵，再右键移动' };
    const obstacles = this.obstacles;
    if (!validPoint(target) || !canOccupy(target, 11, obstacles, BASE_WIDTH, BASE_HEIGHT)) return { ok: false, message: '目标位置不可通行' };
    const assignments: { soldier: Soldier; target: Vec; nav: Navigation }[] = [];
    for (let i = 0; i < selected.length; i++) {
      const offset = selected.length === 1 ? { x: 0, y: 0 } : { x: (i % 2 - 1) * GRID, y: (Math.floor(i / 2) - 1) * GRID };
      const desired = { x: Math.floor(target.x / GRID) * GRID + GRID / 2 + offset.x, y: Math.floor(target.y / GRID) * GRID + GRID / 2 + offset.y };
      let assignment: typeof assignments[number] | null = null;
      for (let ring = 0; ring <= 3 && !assignment; ring++) {
        for (let y = -ring; y <= ring && !assignment; y++) for (let x = -ring; x <= ring; x++) {
          if (Math.max(Math.abs(x), Math.abs(y)) !== ring) continue;
          const point = { x: desired.x + x * GRID, y: desired.y + y * GRID };
          if (!validPoint(point) || !canOccupy(point, 13, obstacles, BASE_WIDTH, BASE_HEIGHT) || assignments.some(a => distance(a.target, point) < 28)) continue;
          const nav = new Navigation(BASE_WIDTH, BASE_HEIGHT, GRID, obstacles, 11); nav.rebuild(point);
          const soldier = selected[i], index = Math.floor(soldier.y / GRID) * nav.cols + Math.floor(soldier.x / GRID);
          if (nav.field[index] < 0) continue;
          assignment = { soldier, target: point, nav }; break;
        }
      }
      if (!assignment) return { ok: false, message: '队形无法到达该区域，原指令保留' };
      assignments.push(assignment);
    }
    for (const a of assignments) { a.soldier.destination = a.target; a.soldier.stance = 'move'; this.navigation.set(a.soldier.id, a.nav); }
    return { ok: true, message: `${selected.length} 名士兵向指定位置移动` };
  }
  hold(ids: readonly number[]): ActionResult {
    if (!this.commanding) return { ok: false, message: '当前不能向部队下令' };
    const selected = this.livingSoldiers.filter(s => ids.includes(s.id));
    if (!selected.length) return { ok: false, message: '请先选中士兵' };
    for (const s of selected) { s.destination = null; s.stance = 'hold'; s.moving = false; this.navigation.delete(s.id); }
    return { ok: true, message: `${selected.length} 名士兵就地驻守` };
  }
  finish(): void {
    if (this.plan.status !== 'preparing') return;
    this.plan.status = 'ready';
    for (const s of this.plan.soldiers) s.moving = false;
  }
  resume(): void { this.plan.status = 'preparing'; this.plan.stage = nextStage(this.campaign.clearedStage); }
  step(dt = 1 / 60): void {
    if (this.plan.status !== 'preparing' || !Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 0.05); this.plan.elapsed += dt;
    this.stepSoldiers(dt);

  }
  protected stepSoldiers(dt: number): void {
    const obstacles = this.obstacles;
    const soldiers = this.livingSoldiers;
    for (const s of soldiers) {
      if (!s.destination) { s.moving = false; continue; }
      if (distance(s, s.destination) < 5) { s.destination = null; s.stance = 'hold'; s.moving = false; this.navigation.delete(s.id); continue; }
      const nav = this.navigation.get(s.id)!;
      const direction = nav.direction(s, s.destination); s.aim = Math.atan2(direction.y, direction.x);
      const before = { x: s.x, y: s.y };
      const speed = this.soldierSpeed(s);
      moveWithCollision(s, direction.x * speed * dt, direction.y * speed * dt, 11, obstacles, BASE_WIDTH, BASE_HEIGHT);
      s.moving = distance(before, s) > 0.01;
    }
    for (let i = 0; i < soldiers.length; i++) for (let j = i + 1; j < soldiers.length; j++) {
      const a = soldiers[i], b = soldiers[j], d = distance(a, b);
      if (d >= 23) continue;
      const v = d > 0.001 ? normalized(a.x - b.x, a.y - b.y) : { x: 1, y: 0 };
      moveWithCollision(a, v.x * (23 - d) / 2, v.y * (23 - d) / 2, 11, obstacles, BASE_WIDTH, BASE_HEIGHT);
      moveWithCollision(b, -v.x * (23 - d) / 2, -v.y * (23 - d) / 2, 11, obstacles, BASE_WIDTH, BASE_HEIGHT);
    }
  }
  protected soldierSpeed(_s: Soldier): number { return 140; }
  snapshot() { return { phase: 'base' as const, remaining: this.remaining, lightRadius: this.lightRadius, buildArea: { ...this.buildArea }, plan: structuredClone(this.plan), campaign: cloneCampaign(this.campaign) }; }
}
