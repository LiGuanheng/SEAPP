import Phaser from 'phaser';
import { BALANCE } from '../config/balance.ts';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../config/map.ts';
import { CombatWorld } from '../core/world.ts';
import type { InputState } from '../core/types.ts';
import { ActorView } from '../view/ActorView.ts';
import { Hud } from '../view/Hud.ts';
import { MapView } from '../view/MapView.ts';
import { ExpeditionWorld } from '../core/expedition.ts';
import { cloneCampaign, loadCampaign, newCampaign, saveCampaign, type Campaign } from '../core/campaign.ts';
import { ExpeditionView } from '../view/ExpeditionView.ts';
import { SoundBus } from '../view/SoundBus.ts';
import { FieldGuide } from '../view/FieldGuide.ts';

export class CombatScene extends Phaser.Scene {
  private world!: CombatWorld;
  private actors!: ActorView;
  private hud!: Hud;
  private crosshair!: Phaser.GameObjects.Graphics;
  private held = new Set<string>();
  private firing = false;
  private pointerActive = false;
  private paused = false;
  private accumulator = 0;
  private expeditionView: ExpeditionView | null = null;
  private bag = false;
  private persisted = false;
  private audio!: SoundBus;
  private guide!: FieldGuide;
  private guideWasPaused = false;
  private mapView!: MapView;
  private musicLabel!: Phaser.GameObjects.Text;
  constructor() { super('Combat'); }
  create(data: { campaign?: Campaign } = {}): void {
    const training = new URLSearchParams(location.search).get('mode') === 'combat';
    let warning = '';
    let campaign = data.campaign ? cloneCampaign(data.campaign) : newCampaign();
    if (!training && !data.campaign) {
      try { const loaded = loadCampaign(window.localStorage); campaign = loaded.campaign; warning = loaded.warning; }
      catch { warning = '浏览器不允许存档，本次探索仍可正常进行。'; }
    }
    this.world = training ? new CombatWorld() : new ExpeditionWorld(campaign);
    this.held.clear(); this.firing = false; this.paused = false; this.pointerActive = false; this.accumulator = 0; this.bag = false; this.persisted = false;
    this.mapView = new MapView(this);
    this.expeditionView = this.world instanceof ExpeditionWorld ? new ExpeditionView(this, this.world) : null;
    this.actors = new ActorView(this);
    this.audio = new SoundBus(false);
    this.hud = new Hud(this, () => this.togglePause(), () => this.advance(), () => this.audio.toggle());
    this.guide = new FieldGuide(this, this.hud.root, training ? 'combat' : 'city', () => this.toggleGuide());
    this.musicLabel = this.add.text(1030, 107, '', { fontFamily: 'Microsoft YaHei', fontSize: '11px', color: '#d8c796', backgroundColor: '#193030', padding: { x: 7, y: 6 } }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.musicLabel.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => { e.stopPropagation(); this.audio.toggleMusic(); }); this.hud.root.add(this.musicLabel);
    if (warning) this.hud.notify(warning);
    this.crosshair = this.add.graphics().setDepth(99999);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT).centerOn(this.world.player.x, this.world.player.y - 60).setRoundPixels(true);
    // 固定 HUD 使用独立相机，让嵌套浮层的显示坐标与命中坐标一致。
    this.cameras.main.ignore(this.hud.root);
    const ui = this.cameras.add(0, 0, 1280, 720).setName('CombatUI');
    ui.ignore(this.children.list.filter(object => object !== this.hud.root));
    const added = (object: Phaser.GameObjects.GameObject) => ui.ignore(object);
    this.events.on(Phaser.Scenes.Events.ADDED_TO_SCENE, added);
    this.input.mouse?.disableContextMenu();
    const keyDown = (event: KeyboardEvent) => {
      this.audio.unlock();
      if (['F1', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(event.code)) event.preventDefault();
      if (event.repeat) return;
      if (event.code === 'F1') { this.toggleGuide(); return; }
      if (event.code === 'KeyM') { this.audio.toggle(); return; }
      if (event.code === 'KeyL') { this.audio.toggleMusic(); return; }
      if (this.guide.visible) { if (['Escape', 'KeyP'].includes(event.code)) this.toggleGuide(); return; }
      if (event.code === 'Escape' || event.code === 'KeyP') { this.togglePause(); return; }
      if (event.code === 'Enter' && this.world.status !== 'playing') { this.advance(); return; }
      if (['Tab', 'KeyB'].includes(event.code) && this.world instanceof ExpeditionWorld && this.world.status === 'playing') {
        this.bag = !this.bag; this.setPaused(this.bag); return;
      }
      if (this.paused || this.world.status !== 'playing') return;
      if (event.code === 'KeyR') this.world.requestReload();
      if (event.code === 'Digit1') this.world.switchWeapon('pistol');
      if (event.code === 'Digit3') { this.world.switchWeapon('axe'); this.hud.notify('消防斧 · 朝鼠标方向挥砍，无弹药消耗'); }
      if (event.code === 'Digit4') { if (this.world.ownedWeapons.includes('bow')) this.world.switchWeapon('bow'); else this.hud.notify('药房室内储藏箱可找到猎弓，弓手也在那里等待营救'); }
      if (event.code === 'Digit2') {
        if (this.world.ownedWeapons.includes('rifle')) { this.world.switchWeapon('rifle'); this.hud.notify('已装备 AR 突击步枪'); }
        else this.hud.notify('先找到军用武器箱，才能装备步枪');
      }
      if (this.world instanceof ExpeditionWorld) {
        if (event.code === 'KeyE' || event.code === 'KeyH') { const result = event.code === 'KeyE' ? this.world.interact() : this.world.useMedkit(); this.hud.notify(result.message); if (result.ok) this.audio.pickup(); }
        this.persistResult();
      }
      this.held.add(event.code);
    };
    const keyUp = (event: KeyboardEvent) => this.held.delete(event.code);
    const down = (pointer: Phaser.Input.Pointer) => {
      this.audio.unlock();
      this.pointerActive = true;
      if (pointer.leftButtonDown() && !this.paused && !this.hud.blocksInput(pointer.x, pointer.y)) this.firing = true;
    };
    const up = () => { this.firing = false; };
    const move = () => { this.pointerActive = true; };
    const wheel = (p: Phaser.Input.Pointer, _objects: Phaser.GameObjects.GameObject[], _dx: number, dy: number) => {
      if (this.paused || this.world.status !== 'playing' || this.hud.blocksInput(p.x, p.y)) return;
      const camera = this.cameras.main; camera.setZoom(Phaser.Math.Clamp(camera.zoom * (dy > 0 ? 0.9 : 1.1), 0.65, 1.5)).centerOn(this.world.player.x, this.world.player.y - 55);
    };
    this.input.keyboard!.on('keydown', keyDown); this.input.keyboard!.on('keyup', keyUp);
    this.input.on('pointerdown', down); this.input.on('pointerup', up); this.input.on('pointermove', move);
    this.input.on('wheel', wheel);
    const loseFocus = () => { if (this.guide.visible) this.guideWasPaused = true; if (this.world.status === 'playing') this.setPaused(true); };
    const hidden = () => { if (document.hidden) loseFocus(); };
    const leaveCanvas = () => { this.firing = false; this.pointerActive = false; };
    window.addEventListener('blur', loseFocus); document.addEventListener('visibilitychange', hidden);
    this.game.canvas.addEventListener('pointerleave', leaveCanvas);
    this.events.once('shutdown', () => {
      this.events.off(Phaser.Scenes.Events.ADDED_TO_SCENE, added);
      this.input.keyboard?.off('keydown', keyDown); this.input.keyboard?.off('keyup', keyUp);
      this.input.off('pointerdown', down); this.input.off('pointerup', up); this.input.off('pointermove', move);
      this.input.off('wheel', wheel);
      window.removeEventListener('blur', loseFocus); document.removeEventListener('visibilitychange', hidden);
      this.game.canvas.removeEventListener('pointerleave', leaveCanvas);
      delete window.__lastLight;
      this.audio.destroy();
    });
    if (new URLSearchParams(location.search).get('test') === '1') {
      window.__lastLight = Object.freeze({ snapshot: () => ({ ...this.world.snapshot(), paused: this.paused, guide: this.guide.visible, muted: this.audio.muted, musicMuted: this.audio.musicMuted, view: this.actors.counts(), objects: this.children.length, camera: { x: this.cameras.main.worldView.x, y: this.cameras.main.worldView.y, zoom: this.cameras.main.zoom }, ready: true }) });
    }
    this.actors.update(this.world, 0, false); this.expeditionView?.update(this.world as ExpeditionWorld, false); this.hud.update(this.world, false, 0);
    document.getElementById('loading')?.remove();
  }
  private setPaused(paused: boolean): void { this.paused = paused; this.held.clear(); this.firing = false; this.accumulator = 0; this.cameras.main.shakeEffect.reset(); this.audio.pause(paused); }
  private toggleGuide(): void {
    if (this.world.status !== 'playing') return;
    if (this.guide.visible) { this.guide.show(false); this.setPaused(this.guideWasPaused); }
    else { this.guideWasPaused = this.paused; this.guide.show(true); this.setPaused(true); }
  }
  private advance(): void {
    if (this.world instanceof ExpeditionWorld && this.world.status === 'complete') this.scene.start('Base', { campaign: this.world.campaign, fresh: true });
    else if (this.world.status === 'defeat') this.scene.restart(this.world instanceof ExpeditionWorld ? { campaign: this.world.campaign } : undefined);
    else this.togglePause();
  }
  private togglePause(): void { if (this.world.status === 'playing') { this.bag = false; this.setPaused(!this.paused); } }
  private persistResult(): void {
    if (!(this.world instanceof ExpeditionWorld) || this.world.status !== 'complete' || this.persisted) return;
    this.persisted = true;
    try { if (saveCampaign(window.localStorage, this.world.campaign)) return; } catch { /* 存储被禁用时保留本次结算画面。 */ }
    this.hud.saveWarning = '存档未写入：浏览器禁用了存储，本次结果仅保留在画面中。';
  }
  private inputState(): InputState {
    const p = this.world.player, pointer = this.input.activePointer;
    const worldPoint = this.pointerActive ? pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2 : { x: p.x + 300, y: p.y - 16 };
    return {
      moveX: Number(this.held.has('KeyD') || this.held.has('ArrowRight')) - Number(this.held.has('KeyA') || this.held.has('ArrowLeft')),
      moveY: Number(this.held.has('KeyS') || this.held.has('ArrowDown')) - Number(this.held.has('KeyW') || this.held.has('ArrowUp')),
      aim: worldPoint,
      firing: this.firing && pointer.leftButtonDown() && !this.hud.blocksInput(pointer.x, pointer.y),
      sprinting: this.held.has('ShiftLeft') || this.held.has('ShiftRight'),
    };
  }
  update(_time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 0.12), active = !this.paused && this.world.status === 'playing';
    if (active) {
      this.accumulator = Math.min(0.15, this.accumulator + dt);
      while (this.accumulator >= BALANCE.step && this.world.status === 'playing') {
        this.world.step(this.inputState(), BALANCE.step); this.accumulator -= BALANCE.step;
        this.actors.handle(this.world.events);
        this.audio.combat(this.world.events);
        if (this.world.events.some(e => e.type === 'hurt')) { this.hud.flashHurt(); this.cameras.main.shake(75, 0.0017); }
      }
      const p = this.world.player, camera = this.cameras.main;
      const targetX = p.x + Math.cos(p.aim) * 55, targetY = p.y - 55 + Math.sin(p.aim) * 30;
      const factor = 1 - Math.exp(-6 * dt);
      camera.centerOn(Phaser.Math.Linear(camera.midPoint.x, targetX, factor), Phaser.Math.Linear(camera.midPoint.y, targetY, factor));
    }
    const visualDt = active ? dt : 0;
    this.persistResult();
    this.actors.update(this.world, visualDt, this.paused);
    if (this.world instanceof ExpeditionWorld) this.expeditionView?.update(this.world, this.paused);
    this.hud.update(this.world, this.paused, visualDt, this.bag);
    this.hud.setMuted(this.audio.muted);
    this.musicLabel.setText(this.audio.musicMuted ? '配乐关闭 [L]' : '配乐开启 [L]');
    this.mapView.update(this.world.player);
    this.guide.available(this.world.status === 'playing');
    if (this.world.status !== 'playing') this.audio.pause(true);
    const input = this.inputState();
    this.crosshair.clear().setVisible(this.pointerActive && active && !this.hud.blocksInput(this.input.activePointer.x, this.input.activePointer.y));
    this.crosshair.lineStyle(1, 0xe8d6a1, 0.9).strokeCircle(input.aim.x, input.aim.y, 7);
    this.crosshair.beginPath().moveTo(input.aim.x - 12, input.aim.y).lineTo(input.aim.x - 5, input.aim.y).moveTo(input.aim.x + 5, input.aim.y).lineTo(input.aim.x + 12, input.aim.y).moveTo(input.aim.x, input.aim.y - 12).lineTo(input.aim.x, input.aim.y - 5).moveTo(input.aim.x, input.aim.y + 5).lineTo(input.aim.x, input.aim.y + 12).strokePath();
  }
}

declare global {
  interface Window { __lastLight?: { snapshot: () => ReturnType<CombatWorld['snapshot']> & { paused: boolean; guide: boolean; muted: boolean; musicMuted: boolean; ready: boolean; objects: number; view: { actors: number; bullets: number; particles: number; corpses: number }; camera: { x: number; y: number; zoom: number } } } }
}
