import Phaser from 'phaser';
import { STORY_CHAPTERS, STORY_SECONDS, rememberStory } from '../config/story.ts';
import { MapView } from '../view/MapView.ts';
import { onlinePanel, bindOnlinePanel } from '../view/LeaderboardPanel.ts';

/** 独立叙事场景：此时尚未创建探索世界，不消耗 90 秒探索预算。 */
export class PrologueScene extends Phaser.Scene {
  private age = 0;
  private paused = false;
  private leaving = false;
  private title!: Phaser.GameObjects.Text;
  private body!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private fog!: Phaser.GameObjects.Graphics;
  private frame!: Phaser.GameObjects.Graphics;
  private light!: Phaser.GameObjects.Image;
  private actors: Phaser.GameObjects.Sprite[] = [];
  private returnToMenu = false;
  constructor() { super('Prologue'); }
  create(data: { returnToMenu?: boolean } = {}): void {
    this.returnToMenu = !!data.returnToMenu;
    this.age = 0; this.paused = false; this.leaving = false; this.actors = [];
    new MapView(this);
    this.light = this.add.image(880, 730, 'lighthouse').setOrigin(0.5, 0.94).setScale(1.5).setDepth(730);
    for (let i = 0; i < 4; i++) this.actors.push(this.add.sprite(960 + i * 36, 730, 'player', 1).setOrigin(0.5, 0.95).setScale(1.3).setTint(i ? 0xa7b99e : 0xe4c58c).setDepth(730));
    this.add.sprite(1400, 660, 'queen', 1).setScale(1.7).setAlpha(0.5).setDepth(660);
    this.add.sprite(560, 590, 'knight', 1).setScale(1.4).setAlpha(0.4).setDepth(590);
    this.fog = this.add.graphics().setDepth(90000);
    this.cameras.main.setBounds(0, 0, 2048, 1408).setZoom(0.9).centerOn(1000, 650);
    const root = this.add.container(0, 0).setDepth(100000);
    this.frame = this.add.graphics(); root.add(this.frame);
    const text = (x: number, y: number, value: string, size: number, color: string) => { const t = this.add.text(x, y, value, { fontFamily: 'Consolas, Microsoft YaHei, sans-serif', fontSize: `${size}px`, color, lineSpacing: 12 }); root.add(t); return t; };
    text(64, 28, 'THE LAST LIGHT / 最后一盏灯', 18, '#e6ca91').setLetterSpacing(3);
    this.title = text(64, 472, '', 34, '#f0d59b');
    this.body = text(64, 533, '', 20, '#c1cec1');
    this.hint = text(64, 652, '护住灯塔，让家园等到黎明。', 13, '#9eafa6');
    const skip = this.add.rectangle(1090, 660, 280, 42, 0x2e4642).setStrokeStyle(1, 0x9ba487).setInteractive({ useHandCursor: true }); root.add(skip);
    text(1090, 660, '开始行动 [Enter / Space]', 14, '#ecd59f').setOrigin(0.5);
    skip.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => { e.stopPropagation(); this.finish(); });
    this.cameras.main.ignore(root); const ui = this.cameras.add(0, 0, 1280, 720); ui.ignore(this.children.list.filter(o => o !== root));
    const key = (e: KeyboardEvent) => { if (onlinePanel.visible) return; if (['Space', 'Enter', 'Escape'].includes(e.code)) { e.preventDefault(); this.finish(); } else if (e.code === 'KeyP') this.paused = !this.paused; };
    const blur = () => { this.paused = true; };
    const hidden = () => { if (document.hidden) blur(); };
    const down = () => { if (this.paused && !onlinePanel.visible) this.paused = false; };
    const unbindOnline = bindOnlinePanel(() => this.paused, paused => { this.paused = paused; });
    this.input.keyboard!.on('keydown', key); this.input.on('pointerdown', down); window.addEventListener('blur', blur); document.addEventListener('visibilitychange', hidden);
    this.events.once('shutdown', () => { unbindOnline(); this.input.keyboard?.off('keydown', key); this.input.off('pointerdown', down); window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', hidden); delete window.__storyLight; });
    if (new URLSearchParams(location.search).get('test') === '1') window.__storyLight = Object.freeze({ snapshot: () => ({ elapsed: this.age, chapter: Math.min(2, Math.floor(this.age / 3)), paused: this.paused, ready: true }) });
    document.getElementById('loading')?.remove(); this.paint();
  }
  private finish(): void { if (this.leaving) return; this.leaving = true; rememberStory(); this.scene.start(this.returnToMenu ? 'MainMenu' : 'Combat'); }
  private paint(): void {
    const index = Math.min(2, Math.floor(this.age / 3)), chapter = STORY_CHAPTERS[index];
    const fade = Math.min(1, this.age % 3 * 3 + 0.15);
    this.title.setText(`${String(index + 1).padStart(2, '0')} / ${chapter.title}`).setAlpha(fade);
    this.body.setText(chapter.text).setAlpha(fade);
    this.hint.setText(this.paused ? '序章暂停 · 点击画面 / P 继续，Enter 直接开始' : '护住灯塔，让家园等到黎明。');
    this.frame.clear().fillStyle(0x07131c, 0.96).fillRect(0, 0, 1280, 72).fillRect(0, 447, 1280, 273);
    this.frame.fillStyle(0x33443f).fillRect(64, 704, 1152, 3).fillStyle(0xe3c58c).fillRect(64, 704, 1152 * this.age / STORY_SECONDS, 3);
    const g = this.fog.clear();
    g.fillStyle(0x0a1722, index === 0 ? 0.65 : 0.36).fillRect(0, 0, 2048, 1408);
    for (let i = 0; i < 10; i++) g.fillStyle(0x53656c, 0.11).fillEllipse(200 + ((i * 220 + this.age * (i % 2 ? 11 : -8) + 2048) % 2048), 460 + i % 4 * 95, 500, 140);
    const angle = this.age * 0.21 - 0.3;
    g.fillStyle(0xffd998, index === 0 ? 0.025 : 0.16).fillTriangle(880, 588, 880 + Math.cos(angle - 0.19) * 660, 588 + Math.sin(angle - 0.19) * 660, 880 + Math.cos(angle + 0.19) * 660, 588 + Math.sin(angle + 0.19) * 660);
    this.light.setAlpha(index === 0 ? 0.5 : 1);
    this.actors.forEach((s, i) => { s.setX(960 + i * 36 + (index === 2 ? Math.sin(this.age) * 18 : 0)); if (index === 2 && !this.paused) { s.anims.resume(); s.play('player-walk-1', true); } else s.anims.pause(); });
  }
  update(_time: number, delta: number): void {
    if (!this.paused && !this.leaving) { this.age = Math.min(STORY_SECONDS, this.age + Math.min(0.1, delta / 1000)); this.cameras.main.centerOn(1000 + this.age * 5, 650); }
    this.paint(); if (this.age >= STORY_SECONDS) this.finish();
  }
}
declare global { interface Window { __storyLight?: { snapshot: () => { elapsed: number; chapter: number; paused: boolean; ready: boolean } } } }
