import Phaser from 'phaser';
import type { Vec } from '../core/types.ts';
import type { SoundBus } from './SoundBus.ts';

export type TransitionKind = 'departure' | 'return' | 'camp' | 'night' | 'boss' | 'dawn' | 'defeat';
const durations = { departure: 2.3, return: 2.1, camp: 1.5, night: 2.7, boss: 1.25, dawn: 2.5, defeat: 2.2 };
export const effects = { reduced: false };
try { effects.reduced = localStorage.getItem('last-light.reduced-effects') === '1' || matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* Optional preference. */ }
export function toggleEffects(): boolean {
  effects.reduced = !effects.reduced;
  try { localStorage.setItem('last-light.reduced-effects', effects.reduced ? '1' : '0'); } catch { /* Session preference. */ }
  return effects.reduced;
}

/** Real map choreography, advanced only by unscaled presentation time. */
export class SceneTransition {
  private age = 99;
  private kind: TransitionKind = 'camp';
  private root: Phaser.GameObjects.Container;
  private frame: Phaser.GameObjects.Graphics;
  private world: Phaser.GameObjects.Graphics;
  private title: Phaser.GameObjects.Text;
  private subtitle: Phaser.GameObjects.Text;
  private anchor: Vec = { x: 768, y: 512 };
  private origin: Vec = { x: 768, y: 512 };
  private zoom = 0.9;
  private sound: SoundBus | null = null;
  private cueAt = -1;
  private silhouette: Phaser.GameObjects.Image;
  private campLight: Phaser.GameObjects.Image;
  constructor(private scene: Phaser.Scene, parent: Phaser.GameObjects.Container, worldRoot?: Phaser.GameObjects.Container) {
    this.root = scene.add.container(0, 0); parent.add(this.root);
    this.frame = scene.add.graphics(); this.root.add(this.frame);
    this.world = scene.add.graphics().setDepth(worldRoot ? 8800 : 97000);
    this.silhouette = scene.add.image(0, 0, 'zombie', 1).setDepth(worldRoot ? 8801 : 97001).setVisible(false);
    this.campLight = scene.add.image(0, 0, 'lighthouse').setOrigin(0.5, 0.94).setDepth(worldRoot ? 8802 : 97002).setVisible(false);
    worldRoot?.add([this.world, this.silhouette, this.campLight]);
    this.title = scene.add.text(44, 498, '', { fontFamily: 'Consolas, Microsoft YaHei, sans-serif', fontSize: '20px', color: '#e6ce9c', letterSpacing: 3 });
    this.subtitle = scene.add.text(44, 531, '', { fontFamily: 'Microsoft YaHei, sans-serif', fontSize: '11px', color: '#a6b4ae' });
    this.root.add([this.title, this.subtitle]); this.root.setVisible(false);
    scene.events.once('shutdown', () => this.sound?.endCue());
  }
  get active(): boolean { return this.age < durations[this.kind]; }
  get ending(): boolean { return this.active && ['dawn', 'defeat', 'return'].includes(this.kind); }
  play(title: string, subtitle: string, kind: TransitionKind = 'camp', anchor?: Vec, sound?: SoundBus | null, texture?: string): void {
    this.skip(); this.kind = kind; this.age = 0; this.cueAt = -1;
    this.title.setText(title); this.subtitle.setText(subtitle + '   ·   Space 跳过 / V 减少动态');
    this.anchor = anchor ?? { x: 768, y: 512 };
    const c = this.scene.cameras.main;
    this.origin = { x: c.midPoint.x || this.anchor.x, y: c.midPoint.y || this.anchor.y }; this.zoom = c.zoom;
    this.sound = sound ?? null;
    if (texture) this.silhouette.setTexture(texture, 1).setPosition(this.anchor.x, this.anchor.y - 34).setScale(1.4).setTintFill(0x15191c);
    this.root.setVisible(true);
  }
  skip(): void {
    if (this.active && ['night', 'departure', 'camp'].includes(this.kind)) this.scene.cameras.main.setZoom(this.zoom).centerOn(this.anchor.x, this.anchor.y);
    this.age = 99; this.root.setVisible(false); this.world.clear(); this.silhouette.setVisible(false); this.campLight.setVisible(false); this.sound?.endCue();
  }
  snapshot() { return { active: this.active, progress: Math.min(1, this.age / durations[this.kind]), title: this.title.text, kind: this.kind, reduced: effects.reduced }; }
  update(dt: number, enabled = true): void {
    if (!enabled) { this.root.setVisible(false); this.world.setVisible(false); this.silhouette.setVisible(false); this.campLight.setVisible(false); return; }
    this.world.setVisible(true);
    if (!this.active) { this.root.setVisible(false); return; }
    this.age += dt;
    if (!this.active) { this.age = durations[this.kind] - 0.001; this.skip(); return; }
    const t = this.age / durations[this.kind], ease = t * t * (3 - 2 * t), envelope = Math.min(1, t * 7, (1 - t) * 5), g = this.world.clear(), f = this.frame.clear();
    const { x, y } = this.anchor, kind = this.kind, cold = kind === 'night' || kind === 'defeat', dawn = kind === 'dawn';
    this.root.setVisible(true); this.title.setAlpha(envelope); this.subtitle.setAlpha(envelope * 0.85);
    const color = cold ? 0xa34c3d : dawn ? 0xe9cf91 : 0xd2a471;
    f.fillStyle(0x071117, 0.32 * envelope).fillRect(32, 487, 560, 65).fillStyle(color, envelope * 0.8).fillRect(32, 491, 2, 53);
    f.fillStyle(0x050d15, envelope * 0.62).fillRect(0, 94, 1280, 13).fillRect(0, 583, 1280, 13);
    const c = this.scene.cameras.main;
    if (!effects.reduced && ['night', 'departure', 'camp'].includes(kind)) {
      c.setZoom(this.zoom + Math.sin(t * Math.PI) * (kind === 'night' ? -0.13 : 0.07));
      c.centerOn(Phaser.Math.Linear(this.origin.x, x, ease) + (kind === 'night' ? Math.sin(t * Math.PI * 2) * 95 : 0), Phaser.Math.Linear(this.origin.y, y, ease) - Math.sin(t * Math.PI) * 48);
    }
    for (let i = 0; i < 24; i++) {
      const offset = (i * 73) % 150, drift = effects.reduced ? 0 : this.age * 28;
      g.fillStyle(cold ? 0x080f18 : 0x566064, envelope * (cold ? 0.055 : 0.035));
      g.fillEllipse(x - 1000 + ((i * 173 + drift) % 2000), y - 500 + i % 8 * 128, 350 + offset, 50 + i % 4 * 16);
      if (i < (effects.reduced ? 6 : 20)) g.fillStyle(dawn ? 0xefd29a : 0xa99b81, envelope * 0.4).fillRect(x - 700 + (i * 131 + this.age * 12) % 1400, y - 300 + (i * 79 - this.age * 15 + 700) % 650, 2, 2);
    }
    if (kind !== 'boss') {
      const power = kind === 'defeat' ? 1 - ease : kind === 'night' ? ease : dawn ? ease : 0.65;
      g.fillStyle(0xf5ca7c, power * 0.07).fillCircle(x, y, 180 + (dawn ? ease * 380 : 0));
      const angle = kind === 'night' ? -Math.PI + ease * Math.PI * 2 : this.age * 0.2;
      g.fillStyle(0xffd991, power * 0.15).fillTriangle(x, y - 90, x + Math.cos(angle - 0.1) * 700, y - 90 + Math.sin(angle - 0.1) * 700, x + Math.cos(angle + 0.1) * 700, y - 90 + Math.sin(angle + 0.1) * 700);
      if (kind === 'departure' || kind === 'return') this.campLight.setPosition(x - 105, y + 14).setScale(0.85).setVisible(true).setAlpha(kind === 'departure' ? 1 - ease : ease);
    }
    if (kind === 'night') {
      for (const [dx, dy] of [[0, -350], [600, 0], [0, 410], [-600, 0]]) {
        const pulse = envelope * (0.35 + Math.sin(this.age * 5) * 0.15);
        g.fillStyle(0xb74735, pulse).fillRect(x + dx - 3, y + dy - 18, 6, 8).fillStyle(0xcc8c60, pulse * 0.6).fillCircle(x + dx, y + dy - 14, 18);
      }
      f.fillStyle(0x283b4d, envelope * 0.09).fillRect(0, 107, 1280, 476);
    } else if (kind === 'boss') {
      this.silhouette.setVisible(true).setAlpha(envelope * 0.85).setScale(1.4 + Math.sin(t * Math.PI) * 0.08);
      g.lineStyle(2, color, envelope * 0.65).strokeEllipse(x, y, 100 + ease * 36, 35 + ease * 12);
      g.fillStyle(color, envelope * 0.07).fillTriangle(x - 90, y - 180, x + 90, y - 180, x, y + 5);
    } else if (kind === 'defeat') {
      for (let i = 0; i < 20; i++) {
        const width = ease * (150 + i % 4 * 35);
        f.fillStyle(0x030a10, 0.62 * ease).fillRect(0, 105 + i * 24, width, 25).fillRect(1280 - width, 105 + i * 24, width, 25);
      }
    } else if (dawn || kind === 'return') for (let i = 0; i < 8; i++) g.fillStyle(0xecc28a, ease * (1 - i / 8) * 0.028).fillRect(x - 1600, y - 600 + i * 55, 3200, 65);
    if (this.cueAt < 0) { this.cueAt = 0; this.sound?.cue(kind); }
    if (kind === 'night' && this.cueAt === 0 && t > 0.58) { this.cueAt = 1; this.sound?.cue('boss'); }
  }
}
