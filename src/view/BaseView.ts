import Phaser from 'phaser';
import { BASE_HEIGHT, BASE_OBSTACLES, BASE_WIDTH, BUILD_AREA, BUILDINGS, GRID, LIGHTHOUSE, RESERVED_ROUTES, buildingRect, type BuildingKind } from '../config/base.ts';
import type { BaseWorld } from '../core/base-world.ts';
import type { Rect, Vec } from '../core/types.ts';
import { facing } from './ActorView.ts';

interface SoldierView { sprite: Phaser.GameObjects.Sprite; shadow: Phaser.GameObjects.Ellipse; helmet: Phaser.GameObjects.Image; gun: Phaser.GameObjects.Image }
export interface Placement { kind: BuildingKind; point: Vec; rotation: 0 | 1 }
export class BaseView {
  readonly root: Phaser.GameObjects.Container;
  private graphics: Phaser.GameObjects.Graphics;
  private soldiers = new Map<number, SoldierView>();
  private buildings = new Map<number, Phaser.GameObjects.Container>();
  private previewImage: Phaser.GameObjects.Image;
  private hint: Phaser.GameObjects.Text;
  constructor(private scene: Phaser.Scene) {
    this.root = scene.add.container(0, 0);
    const add = <T extends Phaser.GameObjects.GameObject>(object: T): T => { this.root.add(object); return object; };
    const data = Array.from({ length: BASE_HEIGHT / GRID }, (_, y) => Array.from({ length: BASE_WIDTH / GRID }, (_, x) =>
      x >= 10 && x < 38 && y >= 8 && y < 24 ? ((x * 13 + y * 7) % 17 === 0 ? 777 : 704) : 889));
    const map = scene.make.tilemap({ data, tileWidth: 16, tileHeight: 16 });
    const tiles = map.addTilesetImage('city', 'city', 16, 16, 0, 0)!;
    add(map.createLayer(0, tiles, 0, 0)!.setScale(2).setTint(0x849086).setDepth(-100));
    const ground = add(scene.add.graphics().setDepth(-80));
    ground.fillStyle(0x192f32, 0.35).fillRect(320, 480, 896, 96).fillRect(720, 256, 96, 512);
    ground.lineStyle(2, 0xb7ad77, 0.6);
    for (let x = BUILD_AREA.x; x < BUILD_AREA.x + BUILD_AREA.width; x += 28) ground.lineBetween(x, BUILD_AREA.y, x + 13, BUILD_AREA.y).lineBetween(x, 768, x + 13, 768);
    for (let y = BUILD_AREA.y; y < 768; y += 28) ground.lineBetween(320, y, 320, y + 13).lineBetween(1216, y, 1216, y + 13);
    const tile = (x: number, y: number, frame: number, depth: number) => add(scene.add.image(x, y, 'city', frame).setOrigin(0).setScale(2).setTint(0x8e998a).setDepth(depth));
    for (const hut of BASE_OBSTACLES.slice(1)) {
      for (let y = 0; y < 4; y++) for (let x = 0; x < 6; x++) tile(hut.x + x * GRID, hut.y + y * GRID, y === 3 ? (x === 3 ? 641 : 190) : 8 + (y === 0 ? 0 : 37) + (x === 0 ? 0 : x === 5 ? 2 : 1), hut.y + hut.height);
      add(scene.add.text(hut.x + hut.width / 2, hut.y + hut.height + 14, '北境守备 / 后勤站', { fontSize: '12px', fontFamily: 'Microsoft YaHei', color: '#a9b7a0' }).setOrigin(0.5).setDepth(hut.y + hut.height + 1));
    }
    for (const x of [64, 1440]) for (let y = 64; y < 970; y += 96) { tile(x, y, 403, y + 64); tile(x, y + 32, 440, y + 64); }
    for (const x of [416, 1056]) for (const y of [192, 816]) add(scene.add.image(x, y, 'supply').setScale(1.5).setDepth(y));
    add(scene.add.ellipse(LIGHTHOUSE.x, LIGHTHOUSE.y + 24, 132, 46, 0x0b2026, 0.5).setDepth(LIGHTHOUSE.y - 2));
    add(scene.add.image(LIGHTHOUSE.x, LIGHTHOUSE.y + 30, 'lighthouse').setName('lighthouse').setOrigin(0.5, 0.94).setDepth(LIGHTHOUSE.y));
    add(scene.add.text(LIGHTHOUSE.x, LIGHTHOUSE.y - 145, '最后一盏灯', { fontFamily: 'Microsoft YaHei', fontSize: '14px', color: '#ead49b', letterSpacing: 3 }).setOrigin(0.5).setDepth(LIGHTHOUSE.y + 2));
    this.graphics = add(scene.add.graphics().setDepth(9000));
    this.previewImage = add(scene.add.image(0, 0, 'barricade').setAlpha(0.68).setDepth(9001).setVisible(false));
    this.hint = add(scene.add.text(0, 0, '', { fontFamily: 'Microsoft YaHei', fontSize: '12px', color: '#e9d298', backgroundColor: '#11262c', padding: { x: 7, y: 5 } }).setDepth(9002).setOrigin(0.5));
  }
  update(world: BaseWorld, selected: Set<number>, buildingId: number | null, placement: Placement | null, marquee: Rect | null, paused: boolean): void {
    const g = this.graphics.clear();
    const living = new Set(world.livingSoldiers.map(s => s.id));
    for (const [id, v] of this.soldiers) if (!living.has(id)) { v.sprite.destroy(); v.shadow.destroy(); v.helmet.destroy(); v.gun.destroy(); this.soldiers.delete(id); }
    for (const s of world.livingSoldiers) {
      let v = this.soldiers.get(s.id);
      if (!v) {
        v = { sprite: this.scene.add.sprite(s.x, s.y, 'player', 1).setOrigin(0.5, 0.95).setScale(1.2).setTint(0x9eaf91),
          shadow: this.scene.add.ellipse(0, 0, 30, 12, 0x0a2026, 0.45), helmet: this.scene.add.image(0, 0, 'helmet').setScale(1.1), gun: this.scene.add.image(0, 0, 'rifle').setScale(0.72).setOrigin(0.15, 0.5) };
        this.root.add([v.shadow, v.sprite, v.helmet, v.gun]); this.soldiers.set(s.id, v);
      }
      v.sprite.setPosition(s.x, s.y).setDepth(s.y);
      v.shadow.setPosition(s.x, s.y + 2).setDepth(s.y - 2);
      v.helmet.setPosition(s.x, s.y - 37).setDepth(s.y + 1);
      v.gun.setTexture(s.role === 'archer' ? 'bow' : s.role === 'vanguard' ? 'axe' : 'rifle').setPosition(s.x, s.y - 16).setRotation(s.aim).setFlipY(Math.cos(s.aim) < 0).setDepth(s.y + 2);
      v.sprite.setTint(s.role === 'archer' ? 0xa5c182 : s.role === 'vanguard' ? 0xd0a087 : 0x9eaf91);
      if (paused || !world.commanding) v.sprite.anims.pause();
      else {
        v.sprite.anims.resume();
        if (s.moving) v.sprite.play(`player-walk-${facing(s.aim)}`, true);
        else { v.sprite.anims.stop(); v.sprite.setFrame(facing(s.aim) * 3 + 1); }
      }
      if (selected.has(s.id)) {
        g.lineStyle(2, 0xd7d89c, 0.95).strokeEllipse(s.x, s.y + 1, 38, 17);
        if (s.destination) { g.lineStyle(1, 0xb8c69b, 0.6).lineBetween(s.x, s.y + 3, s.destination.x, s.destination.y).strokeCircle(s.destination.x, s.destination.y, 9); }
        else g.lineStyle(2, 0xd9bc82).strokeRect(s.x - 3, s.y - 62, 6, 6);
      }
    }
    const live = new Set(world.plan.buildings.map(b => b.id));
    for (const [id, view] of this.buildings) if (!live.has(id)) { view.destroy(); this.buildings.delete(id); }
    for (const b of world.plan.buildings) {
      const r = buildingRect(b);
      if (!this.buildings.has(b.id)) {
        const view = this.scene.add.container(r.x + r.width / 2, r.y + r.height / 2).setDepth(r.y + r.height);
        view.add(this.scene.add.ellipse(4, 11, r.width + 8, r.height, 0x0b2025, 0.35));
        view.add(this.scene.add.image(0, b.kind === 'wall' ? -10 : b.kind === 'arrowtower' ? -20 : -7, b.kind).setAngle(b.rotation * 90));
        if (b.kind === 'turret') view.add(this.scene.add.image(0, -19, 'rifle').setName('barrel').setOrigin(0.15, 0.5).setRotation(-Math.PI / 2).setScale(1.1));
        if (b.kind === 'cannon') view.add(this.scene.add.image(0, -15, 'cannon-barrel').setName('barrel').setOrigin(0.15, 0.5).setRotation(-Math.PI / 2));
        if (b.kind === 'arrowtower') view.add(this.scene.add.image(0, -43, 'bow').setName('barrel').setOrigin(0.15, 0.5).setRotation(-Math.PI / 2).setScale(0.85));
        this.root.add(view); this.buildings.set(b.id, view);
      }
      const barrel = this.buildings.get(b.id)!.getByName('barrel') as Phaser.GameObjects.Image | null;
      barrel?.setRotation(world.turretAim(b.id));
      if (buildingId === b.id) {
        g.lineStyle(2, 0xe4c98f).strokeRect(r.x - 2, r.y - 2, r.width + 4, r.height + 4);
        const range = BUILDINGS[b.kind].range;
        if (range) g.lineStyle(1, 0xc9c590, 0.3).strokeCircle(r.x + r.width / 2, r.y + r.height / 2, range);
      }
    }
    this.previewImage.setVisible(!!placement && !paused); this.hint.setVisible(!!placement && !paused);
    if (placement && !paused) {
      const { kind, point, rotation } = placement, r = buildingRect({ kind, ...point, rotation }), validity = world.preview(kind, point, rotation);
      g.lineStyle(1, 0x9db59a, 0.16);
      for (let x = BUILD_AREA.x; x <= 1216; x += GRID) g.lineBetween(x, 256, x, 768);
      for (let y = BUILD_AREA.y; y <= 768; y += GRID) g.lineBetween(320, y, 1216, y);
      for (const route of RESERVED_ROUTES) g.fillStyle(0xe1b66a, 0.09).fillRect(route.x, route.y, route.width, route.height);
      g.fillStyle(validity.ok ? 0xa4c69b : 0xd47865, 0.25).fillRect(r.x, r.y, r.width, r.height);
      g.lineStyle(2, validity.ok ? 0xb9d9ab : 0xe18c75).strokeRect(r.x, r.y, r.width, r.height);
      this.previewImage.setTexture(kind).setPosition(r.x + r.width / 2, r.y + r.height / 2 - 4).setAngle(rotation * 90).setTint(validity.ok ? 0xd7e3be : 0xe08f7e);
      this.hint.setText(validity.message).setPosition(r.x + r.width / 2, r.y + r.height + 22);
    }
    if (marquee) g.fillStyle(0xcbd6a6, 0.08).fillRect(marquee.x, marquee.y, marquee.width, marquee.height).lineStyle(1, 0xcbd6a6).strokeRect(marquee.x, marquee.y, marquee.width, marquee.height);
    this.root.sort('depth');
  }
  counts() { return { soldiers: this.soldiers.size, buildings: this.buildings.size, objects: this.root.length }; }
}
