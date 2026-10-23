import Phaser from 'phaser';
import { BASE_HEIGHT, BASE_WIDTH, GRID, LIGHTHOUSE, buildingRect, type BuildingKind } from '../config/base.ts';
import { BaseWorld } from '../core/base-world.ts';
import { loadCampaign, newCampaign, saveCampaign, type Campaign } from '../core/campaign.ts';
import { distance } from '../core/geometry.ts';
import type { Rect, Vec } from '../core/types.ts';
import type { ActionResult } from '../core/expedition.ts';
import { BaseHud } from '../view/BaseHud.ts';
import { BaseView, type Placement } from '../view/BaseView.ts';
import { NightWorld } from '../core/night-world.ts';
import { NightView } from '../view/NightView.ts';
import { NightHud } from '../view/NightHud.ts';
import { SoundBus } from '../view/SoundBus.ts';
import { FieldGuide } from '../view/FieldGuide.ts';
import { TacticalRadar } from '../view/TacticalRadar.ts';
import { INFECTED } from '../config/night.ts';

const contains = (r: Rect, p: Vec): boolean => p.x >= r.x && p.y >= r.y && p.x <= r.x + r.width && p.y <= r.y + r.height;

export class BaseScene extends Phaser.Scene {
  private world!: BaseWorld;
  private view!: BaseView;
  private hud!: BaseHud | NightHud;
  private nightView: NightView | null = null;
  private audio: SoundBus | null = null;
  private support = false;
  private practice = false;
  private selected = new Set<number>();
  private selectedBuilding: number | null = null;
  private kind: BuildingKind | null = null;
  private rotation: 0 | 1 = 0;
  private held = new Set<string>();
  private paused = false;
  private drag: { world: Vec; screen: Vec; additive: boolean } | null = null;
  private accumulator = 0;
  private savedReady = false;
  private pointerActive = false;
  private guide!: FieldGuide;
  private radar!: TacticalRadar;
  private guideWasPaused = false;
  private speed: 1 | 2 | 3 = 1;
  private speedLabel!: Phaser.GameObjects.Text;
  private musicLabel!: Phaser.GameObjects.Text;
  constructor() { super('Base'); }
  create(data: { campaign?: Campaign; fresh?: boolean; battle?: boolean } = {}): void {
    let campaign = data.campaign ?? newCampaign(), warning = '';
    if (!data.campaign) try { const loaded = loadCampaign(localStorage); campaign = loaded.campaign; warning = loaded.warning; } catch { warning = '存储不可用，基地仍可操作。'; }
    this.world = data.battle ? new NightWorld(campaign) : new BaseWorld(campaign); if (data.fresh && !data.battle) this.world.resume();
    const params = new URLSearchParams(location.search); this.practice = params.get('mode') === 'base' || params.get('practice') === 'base';
    this.support = false; this.audio = new SoundBus(!!data.battle); this.speed = 1;
    this.selected.clear(); this.held.clear(); this.kind = null; this.rotation = 0; this.selectedBuilding = null;
    this.paused = false; this.drag = null; this.accumulator = 0; this.savedReady = false; this.pointerActive = false;
    const camera = this.cameras.main;
    camera.setBounds(0, 0, BASE_WIDTH, BASE_HEIGHT).setZoom(0.9).centerOn(LIGHTHOUSE.x, LIGHTHOUSE.y).setRoundPixels(true);
    this.view = new BaseView(this);
    this.nightView = this.world instanceof NightWorld ? new NightView(this, this.view.root) : null;
    this.hud = data.battle ? new NightHud(this, () => this.action(this.world.hold([...this.selected])), () => this.toggleSupport(), () => this.audio?.toggle(), () => this.setPaused(!this.paused), () => this.resume(), () => this.explore()) :
      new BaseHud(this, k => this.setKind(k), () => this.action(this.world.hold([...this.selected])), () => this.finish(), () => this.setPaused(!this.paused), () => this.resume(), () => this.explore());
    this.radar = new TacticalRadar(this, this.hud.root, (x, y) => { if (!this.paused && this.world.commanding) { camera.centerOn(x, y); this.drag = null; } });
    const home = this.add.text(1040, 70, '回灯塔 [C]', { fontFamily: 'Microsoft YaHei', fontSize: '12px', color: '#e4ca91', backgroundColor: '#263d3b', padding: { x: 10, y: 8 } }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    home.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => { e.stopPropagation(); this.home(); }); this.hud.root.add(home);
    const control = (y: number, action: () => void) => { const t = this.add.text(930, y, '', { fontFamily: 'Microsoft YaHei', fontSize: '12px', color: '#e4ca91', backgroundColor: '#263d3b', padding: { x: 7, y: 8 } }).setOrigin(0.5).setInteractive({ useHandCursor: true }); t.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => { e.stopPropagation(); action(); }); this.hud.root.add(t); return t; };
    this.speedLabel = control(27, () => this.cycleSpeed()); this.musicLabel = control(70, () => this.audio?.toggleMusic());
    this.guide = new FieldGuide(this, this.hud.root, data.battle ? 'night' : 'base', () => this.toggleGuide());
    camera.ignore(this.hud.root);
    const ui = this.cameras.add(0, 0, 1280, 720).setName('BaseUI'); ui.ignore(this.view.root);
    if (warning) this.hud.notify(warning);
    this.input.mouse?.disableContextMenu();
    const keyDown = (e: KeyboardEvent) => {
      this.audio?.unlock();
      if (['F1', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Delete', 'Tab'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      if (e.code === 'F1') { this.toggleGuide(); return; }
      if (this.guide.visible) { if (['Escape', 'KeyP'].includes(e.code)) this.toggleGuide(); return; }
      if (e.code === 'KeyP') { this.setPaused(!this.paused); return; }
      if (e.code === 'KeyM') { this.audio?.toggle(); return; }
      if (e.code === 'KeyL') { this.audio?.toggleMusic(); return; }
      if (e.code === 'Escape') { if (this.kind || this.drag || this.support) { this.kind = null; this.drag = null; this.support = false; } else this.setPaused(!this.paused); return; }
      if (e.code === 'KeyN' && !(this.world instanceof NightWorld) && this.world.plan.status === 'ready') { this.startNight(); return; }
      if (this.world instanceof NightWorld && e.code === 'Enter') { if (!this.world.commanding) this.resume(); return; }
      if (e.code === 'Enter') { this.world.plan.status === 'ready' ? this.resume() : this.finish(); return; }
      if (this.paused || !this.world.commanding) return;
      if (e.code === 'KeyC') { this.home(); return; }
      if (e.code === 'KeyT') { this.cycleSpeed(); return; }
      if (e.code === 'Digit1') this.setKind('barricade');
      if (e.code === 'Digit2') this.setKind('turret');
      if (e.code === 'Digit3') this.setKind('cannon');
      if (e.code === 'Digit4') this.setKind('arrowtower');
      if (e.code === 'Digit5') this.setKind('wall');
      if (e.code === 'KeyR' && this.kind === 'barricade') this.rotation = this.rotation === 0 ? 1 : 0;
      if (e.code === 'Space') { this.selected = new Set(this.world.livingSoldiers.map(s => s.id)); this.kind = null; this.selectedBuilding = null; this.support = false; }
      if (e.code === 'KeyF') this.toggleSupport();
      if (e.code === 'KeyG') this.action(this.world.hold([...this.selected]));
      if (e.code === 'Delete' && this.selectedBuilding !== null && !(this.world instanceof NightWorld)) { this.action(this.world.demolish(this.selectedBuilding)); this.selectedBuilding = null; }
      this.held.add(e.code);
    };
    const keyUp = (e: KeyboardEvent) => this.held.delete(e.code);
    const down = (p: Phaser.Input.Pointer) => {
      this.audio?.unlock();
      this.pointerActive = true;
      if (this.paused || !this.world.commanding || this.hud.blocks(p.x, p.y)) return;
      const point = this.point(p);
      if (p.rightButtonDown()) {
        if (this.kind || this.support) { this.kind = null; this.support = false; return; }
        this.action(this.world.move([...this.selected], point)); return;
      }
      if (!p.leftButtonDown()) return;
      if (this.support && this.world instanceof NightWorld) { const result = this.world.callStrike(point); this.action(result); if (result.ok) this.support = false; return; }
      if (this.kind) { const placement = this.placement()!; this.action(this.world.build(placement.kind, placement.point, placement.rotation)); return; }
      this.drag = { world: point, screen: { x: p.x, y: p.y }, additive: this.held.has('ShiftLeft') || this.held.has('ShiftRight') };
    };
    const up = (p: Phaser.Input.Pointer) => {
      if (!this.drag) return;
      if (this.paused || !this.world.commanding || this.hud.blocks(p.x, p.y)) { this.drag = null; return; }
      const drag = this.drag, point = this.point(p), marquee = distance(drag.screen, p) > 7;
      const rectangle = this.rectangle(drag.world, point);
      if (!drag.additive) this.selected.clear();
      this.selectedBuilding = null;
      if (marquee) for (const soldier of this.world.livingSoldiers) { if (contains(rectangle, soldier)) this.selected.add(soldier.id); }
      else {
        const soldier = this.world.livingSoldiers.find(s => distance({ x: s.x, y: s.y - 20 }, point) < 28 || distance(s, point) < 20);
        if (soldier) { if (drag.additive && this.selected.has(soldier.id)) this.selected.delete(soldier.id); else this.selected.add(soldier.id); }
        else { const b = this.world.plan.buildings.find(b => contains(buildingRect(b), point)); if (b) { this.selectedBuilding = b.id; this.selected.clear(); } }
      }
      this.drag = null;
    };
    const wheel = (p: Phaser.Input.Pointer, _objects: Phaser.GameObjects.GameObject[], _dx: number, dy: number) => {
      if (this.paused || !this.world.commanding || this.hud.blocks(p.x, p.y)) return;
      const center = { x: camera.midPoint.x, y: camera.midPoint.y };
      camera.setZoom(Phaser.Math.Clamp(camera.zoom * (dy > 0 ? 0.9 : 1.1), 0.55, 1.3)).centerOn(center.x, center.y);
      this.drag = null;
    };
    const move = () => { this.pointerActive = true; };
    const blur = () => { if (this.guide.visible) this.guideWasPaused = true; this.setPaused(true); };
    const hidden = () => { if (document.hidden) blur(); };
    const leave = () => { this.pointerActive = false; this.drag = null; };
    this.input.keyboard!.on('keydown', keyDown); this.input.keyboard!.on('keyup', keyUp);
    this.input.on('pointerdown', down); this.input.on('pointerup', up); this.input.on('pointermove', move); this.input.on('wheel', wheel);
    window.addEventListener('blur', blur); document.addEventListener('visibilitychange', hidden); this.game.canvas.addEventListener('pointerleave', leave);
    this.events.once('shutdown', () => {
      this.input.keyboard?.off('keydown', keyDown); this.input.keyboard?.off('keyup', keyUp);
      this.input.off('pointerdown', down); this.input.off('pointerup', up); this.input.off('pointermove', move); this.input.off('wheel', wheel);
      window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', hidden); this.game.canvas.removeEventListener('pointerleave', leave); delete window.__baseLight; delete window.__nightLight; this.audio?.destroy();
    });
    if (params.get('test') === '1') {
      if (this.world instanceof NightWorld) window.__nightLight = Object.freeze({ snapshot: () => ({ ...(this.world as NightWorld).nightSnapshot(), selected: [...this.selected], paused: this.paused, guide: this.guide.visible, speed: this.speed, musicMuted: this.audio?.musicMuted ?? false, ready: true, support: this.support, muted: this.audio?.muted ?? true, view: { ...this.view.counts(), ...this.nightView!.counts() }, camera: { x: camera.worldView.x, y: camera.worldView.y, zoom: camera.zoom } }) });
      else window.__baseLight = Object.freeze({ snapshot: () => ({ ...this.world.snapshot(), selected: [...this.selected], selectedBuilding: this.selectedBuilding, placement: this.kind, rotation: this.rotation, paused: this.paused, guide: this.guide.visible, speed: this.speed, musicMuted: this.audio?.musicMuted ?? false, ready: true, view: this.view.counts(), camera: { x: camera.worldView.x, y: camera.worldView.y, zoom: camera.zoom } }) });
    }
    document.getElementById('loading')?.remove();
  }
  private point(p = this.input.activePointer): Vec { const v = p.positionToCamera(this.cameras.main) as Phaser.Math.Vector2; return { x: v.x, y: v.y }; }
  private rectangle(a: Vec, b: Vec): Rect { return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) }; }
  private placement(): Placement | null {
    if (!this.kind || !this.pointerActive || this.hud.blocks(this.input.activePointer.x, this.input.activePointer.y)) return null;
    const p = this.point(); return { kind: this.kind, point: { x: Math.floor(p.x / GRID) * GRID, y: Math.floor(p.y / GRID) * GRID }, rotation: this.rotation };
  }
  private action(result: ActionResult): void { this.audio?.unlock(); this.hud.notify(result.message); if (result.ok) this.persist(); }
  private persist(): void {
    if (this.world instanceof NightWorld && this.world.commanding) return;
    const campaign = this.world instanceof NightWorld ? this.world.resultCampaign() : this.world.campaign;
    try { if (saveCampaign(localStorage, campaign)) { this.hud.saveWarning = ''; return; } } catch { /* 私密模式等禁用存储时保持当前阵地可用。 */ }
    this.hud.saveWarning = '未能保存基地；当前可继续操作，刷新后变更可能丢失。';
  }
  private setKind(kind: BuildingKind): void {
    if (this.paused || this.world.plan.status !== 'preparing' || this.world instanceof NightWorld) return;
    this.kind = this.kind === kind ? null : kind; this.rotation = 0; this.drag = null; this.selectedBuilding = null;
  }
  private setPaused(paused: boolean): void { this.paused = paused; this.held.clear(); this.drag = null; this.accumulator = 0; this.cameras.main.shakeEffect.reset(); this.audio?.pause(paused); }
  private home(): void { if (!this.paused && this.world.commanding) { this.cameras.main.centerOn(LIGHTHOUSE.x, LIGHTHOUSE.y); this.drag = null; } }
  private cycleSpeed(): void { if (!this.paused && this.world.commanding && !this.guide.visible) { this.speed = this.speed === 3 ? 1 : this.speed === 2 ? 3 : 2; } }
  private toggleGuide(): void {
    if (!this.world.commanding) return;
    if (this.guide.visible) { this.guide.show(false); this.setPaused(this.guideWasPaused); }
    else { this.guideWasPaused = this.paused; this.guide.show(true); this.setPaused(true); }
  }
  private toggleSupport(): void { if (this.paused || !(this.world instanceof NightWorld) || !this.world.commanding) return; this.audio?.unlock(); this.support = !this.support; this.drag = null; }
  private startNight(): void { this.persist(); this.scene.restart({ campaign: this.world.campaign, battle: true }); }
  private finish(): void { if (this.paused || this.world.plan.status !== 'preparing' || this.world instanceof NightWorld) return; this.world.finish(); this.kind = null; this.drag = null; this.held.clear(); this.persist(); this.savedReady = true; if (!this.practice) this.startNight(); }
  private resume(): void {
    if (this.world instanceof NightWorld) { if (!this.world.commanding) this.scene.restart({ campaign: this.world.resultCampaign(), battle: true }); else this.setPaused(false); return; }
    this.setPaused(false); if (this.world.plan.status === 'ready') { this.world.resume(); this.savedReady = false; this.persist(); }
  }
  private explore(): void { this.persist(); this.scene.start('Combat', { campaign: this.world instanceof NightWorld ? this.world.resultCampaign() : this.world.campaign }); }
  update(_time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 0.1), active = !this.paused && this.world.commanding;
    let simulated = 0;
    if (active) {
      this.accumulator = Math.min(this.accumulator + dt * this.speed, 0.35);
      while (this.accumulator >= 1 / 60 && this.world.commanding) {
        this.world.step(); this.accumulator -= 1 / 60; simulated += 1 / 60;
        if (this.world instanceof NightWorld) {
          this.nightView!.handle(this.world.events); this.audio?.handle(this.world.events);
          if (this.world.events.some(e => e.type === 'explosion')) this.cameras.main.shake(150, 0.0025);
          if (this.world.events.some(e => e.type === 'wave')) this.hud.notify(`第 ${this.world.wave} 波尸潮来袭 · 强度逐级提升`);
          const boss = this.world.events.find(e => e.type === 'boss' || e.type === 'boss-defeated');
          if (boss?.kind) this.hud.notify(`${boss.type === 'boss' ? '警报' : '击败'} · ${INFECTED[boss.kind].name}${boss.type === 'boss' ? '，留意地面预警与随从' : ''}`);
        }
      }
      const camera = this.cameras.main;
      const x = Number(this.held.has('KeyD') || this.held.has('ArrowRight')) - Number(this.held.has('KeyA') || this.held.has('ArrowLeft'));
      const y = Number(this.held.has('KeyS') || this.held.has('ArrowDown')) - Number(this.held.has('KeyW') || this.held.has('ArrowUp'));
      if (x || y) camera.centerOn(camera.midPoint.x + x * dt * 600 / camera.zoom, camera.midPoint.y + y * dt * 600 / camera.zoom);
    }
    if ((this.world instanceof NightWorld ? !this.world.commanding : this.world.plan.status === 'ready') && !this.savedReady) {
      this.kind = null; this.drag = null; this.held.clear(); this.support = false; this.persist(); this.savedReady = true;
      if (this.world instanceof NightWorld) this.audio?.pause(true); else if (!this.practice) { this.startNight(); return; }
    }
    const living = new Set(this.world.livingSoldiers.map(s => s.id)); this.selected = new Set([...this.selected].filter(id => living.has(id)));
    const marquee = this.drag && distance(this.drag.screen, this.input.activePointer) > 7 ? this.rectangle(this.drag.world, this.point()) : null;
    this.view.update(this.world, this.selected, this.selectedBuilding, this.placement(), marquee, this.paused);
    if (this.world instanceof NightWorld) this.nightView!.update(this.world, simulated, this.paused, this.support && this.pointerActive ? this.point() : null);
    if (this.hud instanceof NightHud) this.hud.setModes(this.support, this.audio?.muted ?? true);
    this.hud.update(this.world, this.selected, this.selectedBuilding, this.kind, this.paused, active ? dt : 0);
    this.radar.update(this.world, this.cameras.main, this.paused);
    this.guide.available(this.world.commanding);
    this.speedLabel.setText(`×${this.speed} 倍速 [T]`); this.musicLabel.setText(this.audio?.musicMuted ? '配乐关 [L]' : '配乐开 [L]');
  }
}

declare global { interface Window {
  __baseLight?: { snapshot: () => ReturnType<BaseWorld['snapshot']> & { selected: number[]; selectedBuilding: number | null; placement: BuildingKind | null; rotation: number; paused: boolean; guide: boolean; speed: number; musicMuted: boolean; ready: boolean; camera: { x: number; y: number; zoom: number }; view: { soldiers: number; buildings: number; objects: number } } };
  __nightLight?: { snapshot: () => ReturnType<NightWorld['nightSnapshot']> & { selected: number[]; paused: boolean; guide: boolean; speed: number; musicMuted: boolean; ready: boolean; support: boolean; muted: boolean; camera: { x: number; y: number; zoom: number }; view: { soldiers: number; buildings: number; objects: number; enemies: number; bullets: number; particles: number; corpses: number } } };
} }
