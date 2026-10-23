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
    new MapView(this);
    this.expeditionView = this.world instanceof ExpeditionWorld ? new ExpeditionView(this, this.world) : null;
    this.actors = new ActorView(this);
    this.hud = new Hud(this, () => this.togglePause(), () => this.advance());
    if (warning) this.hud.notify(warning);
    this.crosshair = this.add.graphics().setDepth(99999);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT).centerOn(this.world.player.x, this.world.player.y - 60).setRoundPixels(true);
    this.input.mouse?.disableContextMenu();
    const keyDown = (event: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(event.code)) event.preventDefault();
      if (event.repeat) return;
      if (event.code === 'Escape' || event.code === 'KeyP') { this.togglePause(); return; }
      if (event.code === 'Enter' && this.world.status !== 'playing') { this.advance(); return; }
      if (['Tab', 'KeyB'].includes(event.code) && this.world instanceof ExpeditionWorld && this.world.status === 'playing') {
        this.bag = !this.bag; this.setPaused(this.bag); return;
      }
      if (this.paused || this.world.status !== 'playing') return;
      if (event.code === 'KeyR') this.world.requestReload();
      if (event.code === 'Digit1') this.world.switchWeapon('pistol');
      if (event.code === 'Digit2') {
        if (this.world.ownedWeapons.includes('rifle')) { this.world.switchWeapon('rifle'); this.hud.notify('已装备 AR 突击步枪'); }
        else this.hud.notify('先找到军用武器箱，才能装备步枪');
      }
      if (this.world instanceof ExpeditionWorld) {
        if (event.code === 'KeyE') this.hud.notify(this.world.interact().message);
        if (event.code === 'KeyH') this.hud.notify(this.world.useMedkit().message);
        this.persistResult();
      }
      this.held.add(event.code);
    };
    const keyUp = (event: KeyboardEvent) => this.held.delete(event.code);
    const down = (pointer: Phaser.Input.Pointer) => {
      this.pointerActive = true;
      if (pointer.leftButtonDown() && !this.paused && !this.hud.blocksInput(pointer.x, pointer.y)) this.firing = true;
    };
    const up = () => { this.firing = false; };
    const move = () => { this.pointerActive = true; };
    this.input.keyboard!.on('keydown', keyDown); this.input.keyboard!.on('keyup', keyUp);
    this.input.on('pointerdown', down); this.input.on('pointerup', up); this.input.on('pointermove', move);
    const loseFocus = () => { if (this.world.status === 'playing') this.setPaused(true); };
    const hidden = () => { if (document.hidden) loseFocus(); };
    const leaveCanvas = () => { this.firing = false; this.pointerActive = false; };
    window.addEventListener('blur', loseFocus); document.addEventListener('visibilitychange', hidden);
    this.game.canvas.addEventListener('pointerleave', leaveCanvas);
    this.events.once('shutdown', () => {
      this.input.keyboard?.off('keydown', keyDown); this.input.keyboard?.off('keyup', keyUp);
      this.input.off('pointerdown', down); this.input.off('pointerup', up); this.input.off('pointermove', move);
      window.removeEventListener('blur', loseFocus); document.removeEventListener('visibilitychange', hidden);
      this.game.canvas.removeEventListener('pointerleave', leaveCanvas);
      delete window.__lastLight;
    });
    if (new URLSearchParams(location.search).get('test') === '1') {
      window.__lastLight = Object.freeze({ snapshot: () => ({ ...this.world.snapshot(), paused: this.paused, view: this.actors.counts(), objects: this.children.length, camera: { x: this.cameras.main.scrollX, y: this.cameras.main.scrollY }, ready: true }) });
    }
    this.actors.update(this.world, 0, false); this.expeditionView?.update(this.world as ExpeditionWorld, false); this.hud.update(this.world, false, 0);
    document.getElementById('loading')?.remove();
  }
  private setPaused(paused: boolean): void { this.paused = paused; this.held.clear(); this.firing = false; this.accumulator = 0; this.cameras.main.shakeEffect.reset(); }
  private advance(): void {
    if (this.world instanceof ExpeditionWorld && this.world.status === 'complete') this.scene.start('Base', { campaign: this.world.campaign, fresh: true });
    else if (this.world.status === 'defeat') this.scene.restart();
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
    const input = this.inputState();
    this.crosshair.clear().setVisible(this.pointerActive && active && !this.hud.blocksInput(this.input.activePointer.x, this.input.activePointer.y));
    this.crosshair.lineStyle(1, 0xe8d6a1, 0.9).strokeCircle(input.aim.x, input.aim.y, 7);
    this.crosshair.beginPath().moveTo(input.aim.x - 12, input.aim.y).lineTo(input.aim.x - 5, input.aim.y).moveTo(input.aim.x + 5, input.aim.y).lineTo(input.aim.x + 12, input.aim.y).moveTo(input.aim.x, input.aim.y - 12).lineTo(input.aim.x, input.aim.y - 5).moveTo(input.aim.x, input.aim.y + 5).lineTo(input.aim.x, input.aim.y + 12).strokePath();
  }
}

declare global {
  interface Window { __lastLight?: { snapshot: () => ReturnType<CombatWorld['snapshot']> & { paused: boolean; ready: boolean; objects: number; view: { actors: number; bullets: number; particles: number; corpses: number }; camera: { x: number; y: number } } } }
}
