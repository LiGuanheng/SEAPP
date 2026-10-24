import Phaser from 'phaser';
import type { ExpeditionWorld } from '../core/expedition.ts';

/** 半分辨率有记忆的地形遮罩，来自模型同一份视野；不会替代实体可见性检查。 */
export class ExplorationFog {
  private texture: Phaser.Textures.CanvasTexture;
  private glow: Phaser.GameObjects.Graphics;
  private lastRevision = -1;
  private lamp: Phaser.GameObjects.Image;
  private mask: HTMLCanvasElement;
  constructor(scene: Phaser.Scene, world: ExpeditionWorld) {
    const key = 'exploration-fog';
    if (scene.textures.exists(key)) scene.textures.remove(key);
    this.texture = scene.textures.createCanvas(key, world.width / 2, world.height / 2)!;
    this.mask = document.createElement('canvas'); this.mask.width = world.width / 2; this.mask.height = world.height / 2;
    scene.add.image(0, 0, key).setOrigin(0).setScale(2).setDepth(95000);
    this.glow = scene.add.graphics().setDepth(94000);
    this.lamp = scene.add.image(0, 0, 'lantern').setOrigin(0.5, 0.6).setScale(0.75).setDepth(95001);
    scene.events.once('shutdown', () => { scene.textures.remove(key); this.mask.width = 1; this.mask.height = 1; });
  }
  update(world: ExpeditionWorld): void {
    this.glow.clear().fillStyle(0xffd893, 0.045).fillCircle(world.player.x, world.player.y, world.lightRadius * 0.7);
    this.lamp.setPosition(world.player.x + 15, world.player.y - 15).setAlpha(world.status === 'playing' ? 1 : 0.7);
    if (world.vision.revision === this.lastRevision) return;
    this.lastRevision = world.vision.revision;
    const c = this.mask.getContext('2d')!, v = world.vision, size = v.cell / 2;
    c.clearRect(0, 0, world.width / 2, world.height / 2); c.fillStyle = '#09131c'; c.fillRect(0, 0, world.width / 2, world.height / 2);
    for (let index = 0; index < v.seen.length; index++) {
      if (!v.seen[index]) continue;
      const x = index % v.cols * size, y = Math.floor(index / v.cols) * size;
      const t = Math.hypot((x + size / 2) * 2 - world.player.x, (y + size / 2) * 2 - world.player.y) / world.lightRadius;
      const alpha = v.visible[index] ? 0.07 + 0.58 * Math.pow(Math.min(1, t), 3) : 0.83;
      c.clearRect(x, y, size, size); c.fillStyle = `rgba(9,19,28,${alpha})`; c.fillRect(x, y, size, size);
    }
    const target = this.texture.context;
    target.clearRect(0, 0, this.mask.width, this.mask.height); target.filter = 'blur(9px)'; target.drawImage(this.mask, 0, 0); target.filter = 'none';
    // 模糊画布边缘仍保持黑雾，避免地图四周出现透明亮边。
    target.strokeStyle = '#09131c'; target.lineWidth = 12; target.strokeRect(0, 0, this.mask.width, this.mask.height);
    this.texture.refresh();
  }
}
