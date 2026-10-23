import Phaser from 'phaser';
import { BASE_WIDTH, BASE_HEIGHT, BASE_OBSTACLES, LIGHTHOUSE, buildingRect } from '../config/base.ts';
import type { BaseWorld } from '../core/base-world.ts';
import { NightWorld } from '../core/night-world.ts';
import { INFECTED } from '../config/night.ts';

/** 固定 HUD 小地图，只显示己方与当前可见敌人；点击只移动镜头。 */
export class TacticalRadar {
  private root: Phaser.GameObjects.Container;
  private graphics: Phaser.GameObjects.Graphics;
  constructor(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, focus: (x: number, y: number) => void) {
    this.root = scene.add.container(1090, 108); parent.add(this.root);
    this.graphics = scene.add.graphics(); this.root.add(this.graphics);
    const zone = scene.add.zone(85, 57, 170, 114).setInteractive({ useHandCursor: true });
    zone.on('pointerdown', (p: Phaser.Input.Pointer, x: number, y: number, e: Phaser.Types.Input.EventData) => { e.stopPropagation(); if (p.leftButtonDown()) focus(x / 170 * BASE_WIDTH, y / 114 * BASE_HEIGHT); });
    this.root.add(zone);
    this.root.add(scene.add.text(0, 119, '战术地图 · 点击定位 / C 回中', { fontFamily: 'Microsoft YaHei', fontSize: '10px', color: '#b6c9b0', backgroundColor: '#10232c' }));
  }
  update(w: BaseWorld, camera: Phaser.Cameras.Scene2D.Camera, paused: boolean): void {
    this.root.setVisible(!paused && w.commanding);
    const g = this.graphics.clear(), sx = 170 / BASE_WIDTH, sy = 114 / BASE_HEIGHT;
    g.fillStyle(0x10232c, 0.95).fillRect(0, 0, 170, 114);
    for (const b of BASE_OBSTACLES) g.fillStyle(0x41534b).fillRect(b.x * sx, b.y * sy, b.width * sx, b.height * sy);
    for (const b of w.plan.buildings) { const r = buildingRect(b); g.fillStyle(0xe2be7e).fillRect(r.x * sx, r.y * sy, r.width * sx, r.height * sy); }
    if (w instanceof NightWorld) for (const e of w.enemies) if (w.canSee(e)) g.fillStyle(INFECTED[e.kind].boss ? 0xf1b58a : INFECTED[e.kind].flying ? 0xb49ce1 : 0xc86460).fillCircle(e.x * sx, e.y * sy, INFECTED[e.kind].boss ? 3.5 : 1.5);
    for (const s of w.livingSoldiers) g.fillStyle(0xaacfa1).fillCircle(s.x * sx, s.y * sy, 2);
    g.lineStyle(1, 0xf0d696).strokeCircle(LIGHTHOUSE.x * sx, LIGHTHOUSE.y * sy, 4);
    const v = camera.worldView, left = Math.max(0, v.x), top = Math.max(0, v.y), right = Math.min(BASE_WIDTH, v.right), bottom = Math.min(BASE_HEIGHT, v.bottom);
    g.lineStyle(1, 0xc4dbd0, 0.85).strokeRect(left * sx, top * sy, (right - left) * sx, (bottom - top) * sy);
    g.lineStyle(1, 0x729182).strokeRect(0, 0, 170, 114);
  }
}
