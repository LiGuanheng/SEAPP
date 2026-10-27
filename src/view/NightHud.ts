import Phaser from 'phaser';
import { buildingStats, type BuildingKind } from '../config/base.ts';
import { BOSS_ABILITIES, INFECTED, LAMP_HEALTH, NIGHT_SECONDS, type BossKind } from '../config/night.ts';
import { STAGES, STAGE_COUNT } from '../config/progression.ts';
import { DIFFICULTIES } from '../config/difficulty.ts';
import type { BaseWorld } from '../core/base-world.ts';
import { NightWorld } from '../core/night-world.ts';
import { ASSAULT_NAMES } from '../core/assault.ts';

const font = 'Consolas, Microsoft YaHei, sans-serif';
export class NightHud {
  cinematic = false;
  readonly root: Phaser.GameObjects.Container;
  saveWarning = '';
  private graphics: Phaser.GameObjects.Graphics;
  private info: Phaser.GameObjects.Text;
  private status: Phaser.GameObjects.Text;
  private forecast: Phaser.GameObjects.Text;
  private selection: Phaser.GameObjects.Text;
  private charges: Phaser.GameObjects.Text;
  private sound: Phaser.GameObjects.Text;
  private toast: Phaser.GameObjects.Text;
  private toastTime = 0;
  private overlay: Phaser.GameObjects.Container;
  private title: Phaser.GameObjects.Text;
  private body: Phaser.GameObjects.Text;
  private primary: Phaser.GameObjects.Text;
  private exit: Phaser.GameObjects.Text;
  private ready = false;
  private support = false;
  private muted = false;
  private bosses: Phaser.GameObjects.Text[] = [];
  private bossRows = 0;
  constructor(scene: Phaser.Scene, hold: () => void, strike: () => void, mute: () => void, pause: () => void, resume: () => void, explore: () => void) {
    this.root = scene.add.container(0, 0).setDepth(100000);
    const text = (x: number, y: number, value: string, size = 13, color = '#c5cfbc') => { const t = scene.add.text(x, y, value, { fontFamily: font, fontSize: `${size}px`, color }); this.root.add(t); return t; };
    this.graphics = scene.add.graphics(); this.root.add(this.graphics);
    text(26, 16, 'THE LAST LIGHT / 北境守夜', 14, '#e4c58c').setLetterSpacing(2);
    this.info = text(26, 45, '', 13, '#e7d3a2');
    this.status = text(425, 24, '', 14, '#ead19b');
    this.forecast = text(425, 56, '', 11, '#a8bba6');
    const button = (x: number, y: number, width: number, label: string, action: () => void) => {
      const bg = scene.add.rectangle(x, y, width, 36, 0x2b4542).setStrokeStyle(1, 0x7c8e72).setInteractive({ useHandCursor: true });
      bg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => { e.stopPropagation(); action(); }); this.root.add(bg);
      return text(x, y, label, 12, '#e6d4a1').setOrigin(0.5);
    };
    button(1198, 27, 110, '暂停 [P]', pause); this.sound = button(1198, 70, 110, '声音 [M]', mute);
    this.selection = text(26, 611, '', 13, '#e0cda0');
    button(112, 663, 190, '就地驻守 [G]', hold);
    this.charges = button(350, 663, 240, '炮火支援 [F]', strike);
    text(660, 652, '左键 / 拖框选兵 · Shift 加选 · Space 全选', 12, '#b8c8aa');
    text(660, 680, '右键移动 · WASD 镜头 · 滚轮缩放 · Esc 取消支援 / 暂停', 11, '#9fb09f');
    this.toast = text(640, 565, '', 13, '#f1d497').setOrigin(0.5).setBackgroundColor('#10252c').setPadding(9, 6).setVisible(false);
    for (let i = 0; i < 5; i++) this.bosses.push(text(640, 113 + i * 29, '', 12, '#f0c1b1').setOrigin(0.5).setVisible(false));
    this.overlay = scene.add.container(0, 0).setVisible(false); this.root.add(this.overlay);
    const shade = scene.add.rectangle(640, 360, 1280, 720, 0x07141f, 0.94).setInteractive();
    shade.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => e.stopPropagation()); this.overlay.add(shade);
    this.title = scene.add.text(640, 233, '', { fontFamily: font, fontSize: '32px', color: '#ead3a1' }).setOrigin(0.5);
    this.body = scene.add.text(640, 359, '', { fontFamily: font, fontSize: '14px', color: '#bacbb2', align: 'center', lineSpacing: 11 }).setOrigin(0.5);
    const primary = scene.add.rectangle(640, 505, 270, 44, 0xd6b879).setInteractive({ useHandCursor: true });
    primary.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => { e.stopPropagation(); resume(); });
    this.primary = scene.add.text(640, 505, '', { fontFamily: font, fontSize: '14px', color: '#18312d' }).setOrigin(0.5);
    this.exit = scene.add.text(640, 558, '可选：进入街区搜集补给 →', { fontFamily: font, fontSize: '13px', color: '#b5c9ac' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.exit.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => { e.stopPropagation(); if (this.ready) explore(); });
    this.overlay.add([this.title, this.body, primary, this.primary, this.exit]);
  }
  setModes(support: boolean, muted: boolean): void { this.support = support; this.muted = muted; }
  blocks(x: number, y: number): boolean { return this.overlay.visible || x < 0 || x > 1280 || x >= 1080 && y < 290 || y < 94 || y >= 596 || this.bossRows > 0 && x >= 320 && x <= 960 && y < 105 + this.bossRows * 29; }
  notify(message: string): void { this.toast.setText(message); this.toastTime = 4.5; }
  update(base: BaseWorld, ids: Set<number>, buildingId: number | null, _buildKind: BuildingKind | null, paused: boolean, dt: number): void {
    const w = base as NightWorld, g = this.graphics.clear();
    g.fillStyle(0x081722, 0.97).fillRect(0, 0, 1280, 94).fillRect(0, 596, 1280, 124);
    g.fillStyle(0x273e3b).fillRect(26, 73, 305, 6).fillRect(425, 79, 560, 3);
    g.fillStyle(w.lampHealth > 95 ? 0xdac28d : 0xd58b77).fillRect(26, 73, 305 * w.lampHealth / LAMP_HEALTH, 6);
    g.fillStyle(0xb6bfa0).fillRect(425, 79, 560 * Math.min(1, w.elapsed / NIGHT_SECONDS), 3);
    if (w.lampHurt > 0) g.lineStyle(16, 0xd07761, w.lampHurt).strokeRect(0, 0, 1280, 720);
    const alerts = [[640, 113], [1260, 346], [640, 580], [20, 346]];
    w.pressure.forEach((count, i) => {
      if (count < 3 || !w.commanding || paused) return;
      const [x, y] = alerts[i], hot = count >= 14, color = hot ? 0xd17359 : 0xb9a077, pulse = 0.55 + Math.sin(w.elapsed * 4) * 0.15;
      g.fillStyle(color, pulse).fillTriangle(x, y + (i === 0 ? -8 : i === 2 ? 8 : 0), x + (i % 2 ? (i === 1 ? -8 : 8) : -7), y + (i === 0 ? 5 : i === 2 ? -5 : -7), x + (i % 2 ? (i === 1 ? -8 : 8) : 7), y + (i === 0 ? 5 : i === 2 ? -5 : 7));
      g.lineStyle(2, color, pulse * 0.4).strokeCircle(x, y, 14 + Math.min(count, 30) / 5);
    });
    this.info.setText(`灯塔耐久 ${w.lampHealth} / ${LAMP_HEALTH}`);
    this.status.setText(`阶段${w.stage}/${STAGE_COUNT} · 天亮 ${Math.ceil(w.remaining)}s · ${w.wave}/${w.waves.length}波 · 击杀${w.kills}`);
    const next = w.waves[w.wave];
    this.forecast.setText(`${ASSAULT_NAMES[Math.max(0, w.wave - 1)]} · ${w.pressure.filter(n => n >= 3).length}向受压${w.pressure.filter(n => n >= 14).length >= 3 ? ' · 多线告急' : ''} · ${DIFFICULTIES[w.difficulty].name} · ${next ? `下一轮 ${Math.ceil(Math.max(0, next.at - w.elapsed))}s` : '末段高潮，坚守至黎明'}`);
    const bosses = w.enemies.filter(e => INFECTED[e.kind].boss && e.health > 0).slice(0, 5); this.bossRows = bosses.length;
    this.bosses.forEach((label, i) => {
      const e = bosses[i]; label.setVisible(!!e && !paused && w.commanding); if (!e) return;
      const y = 100 + i * 29, max = e.maxHealth ?? INFECTED[e.kind].health;
      g.fillStyle(0x10202a, 0.94).fillRoundedRect(350, y, 580, 27, 3).fillStyle(0x573947).fillRect(358, y + 23, 564, 3).fillStyle(0xce8793).fillRect(358, y + 23, 564 * e.health / max, 3);
      const skill = e.windup ? ` · 蓄力 ${e.windup.remaining.toFixed(1)}s，离开预警圈` : ` · ${BOSS_ABILITIES[e.kind as BossKind]}`;
      label.setText(`${INFECTED[e.kind].name}　${Math.ceil(e.health)}/${max}${skill}`);
    });
    const b = w.plan.buildings.find(b => b.id === buildingId);
    this.selection.setText(this.support ? '火力支援：左键选择视野内落点，0.65 秒后爆炸；右键 / Esc 取消，不伤己方' : b ? `${buildingStats(b).name} · 耐久 ${b.health}/${buildingStats(b).health} · 夜战中不能施工、改装或出售` : `守备 ${w.livingSoldiers.length}/${w.plan.soldiers.length} 人　/　已选 ${ids.size} 人　/　尸群 ${w.enemies.length}（空军 ${w.enemies.filter(e => INFECTED[e.kind].flying).length}）　/　自动射击，注意交叉火力`);
    this.charges.setText(`炮火支援 [F]　${w.charges} 次${w.supportCooldown > 0 ? ` / ${Math.ceil(w.supportCooldown)}s` : ''}`);
    this.sound.setText(this.muted ? '静音 [M]' : '声音 [M]');
    this.toastTime = Math.max(0, this.toastTime - dt); this.toast.setVisible(this.toastTime > 0);
    this.ready = !w.commanding; this.overlay.setVisible(paused || this.ready && !this.cinematic); this.exit.setVisible(this.ready && w.status === 'victory' && w.stage < STAGE_COUNT);
    if (paused || this.ready) {
      this.title.setText(!this.ready ? '指挥暂停' : w.status === 'victory' ? '天亮了，最后一盏灯仍在。' : '灯塔熄灭，防线失守。');
      const firstClear = w.stage > (w.checkpoint.clearedStage ?? 0), reward = STAGES[w.stage].reward;
      this.body.setText(this.ready ? `阶段 ${w.stage}/${STAGE_COUNT} · ${STAGES[w.stage].name} · 守夜 ${Math.floor(w.elapsed)}秒\n击杀 ${w.kills} · Boss 击败 ${w.bossKills}/${w.bossCount} · 灯塔 ${w.lampHealth}/${LAMP_HEALTH}\n生还守卫 ${w.livingSoldiers.length} 人 · 留存设施 ${w.plan.buildings.length} 座\n${w.status === 'victory' ? firstClear ? `首次守住：建材+${reward.materials} / 电力+${reward.energy}\n${STAGES[w.stage].unlock}` : '本阶段已通关，重复守夜不重复发放补给。' : '本局结束，击杀与已守住的阶段计入挑战成绩。'}\n${w.status === 'victory' && w.stage < STAGE_COUNT ? 'Enter 直接进入下一阶段 · 布防 30 秒后自动开战\n守夜前阵地免费修复，街区探索可以跳过。' : '查看总分与排行榜，可选择开始全新战役。'}` : '部队、尸潮、技能和计时均已暂停。\n按 P / Esc 或点击继续。');
      if (this.saveWarning) this.body.setText(this.body.text + '\n' + this.saveWarning);
      this.primary.setText(this.ready ? w.status === 'victory' && w.stage < STAGE_COUNT ? '下一阶段：布置防御 [Enter]' : '查看本局成绩 [Enter]' : '继续指挥 [P]');
    }
  }
}
