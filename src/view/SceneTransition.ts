import Phaser from 'phaser';

/** 短叠化，不延长阶段、不拦截键鼠；容器保留到离场，避免结算对象数抖动。 */
export class SceneTransition {
  private age = 1;
  private root: Phaser.GameObjects.Container;
  private g: Phaser.GameObjects.Graphics;
  private title: Phaser.GameObjects.Text;
  private subtitle: Phaser.GameObjects.Text;
  constructor(scene: Phaser.Scene, parent: Phaser.GameObjects.Container) {
    this.root = scene.add.container(0, 0); parent.add(this.root);
    this.g = scene.add.graphics(); this.root.add(this.g);
    this.title = scene.add.text(640, 315, '', { fontFamily: 'Microsoft YaHei, sans-serif', fontSize: '30px', color: '#ecd29a' }).setOrigin(0.5);
    this.subtitle = scene.add.text(640, 366, '', { fontFamily: 'Microsoft YaHei, sans-serif', fontSize: '14px', color: '#c2cfba' }).setOrigin(0.5);
    this.root.add([this.title, this.subtitle]); this.root.setVisible(false);
  }
  play(title: string, subtitle: string): void { this.age = 0; this.title.setText(title); this.subtitle.setText(subtitle); this.root.setVisible(true); }
  snapshot() { return { active: this.age < 1, progress: this.age, title: this.title.text }; }
  update(dt: number, enabled = true): void {
    this.age = Math.min(1, this.age + dt / 0.7); const t = this.age;
    this.root.setVisible(enabled && t < 1).setAlpha(1 - t);
    this.g.clear().fillStyle(0x081722, 0.78).fillRect(0, 0, 1280, 720).fillStyle(0x07131b).fillRect(0, 0, 1280, 64 * (1 - t)).fillRect(0, 720 - 64 * (1 - t), 1280, 64 * (1 - t));
    this.title.setY(315 - t * 18); this.subtitle.setY(366 - t * 18);
  }
}
