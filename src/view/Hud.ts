import Phaser from 'phaser';
import { BALANCE as B } from '../config/balance.ts';
import { BUILDINGS, WORLD_HEIGHT, WORLD_WIDTH } from '../config/map.ts';
import type { CombatWorld } from '../core/world.ts';
import { CAMP, CAPACITY, ExpeditionWorld, SURVIVOR_PROFILES } from '../core/expedition.ts';

const font = 'Consolas, Microsoft YaHei, sans-serif';
export class Hud {
  saveWarning = '';
  private root: Phaser.GameObjects.Container;
  private graphics: Phaser.GameObjects.Graphics;
  private ammo: Phaser.GameObjects.Text;
  private health: Phaser.GameObjects.Text;
  private stats: Phaser.GameObjects.Text;
  private reload: Phaser.GameObjects.Text;
  private overlay: Phaser.GameObjects.Container;
  private overlayTitle: Phaser.GameObjects.Text;
  private overlayBody: Phaser.GameObjects.Text;
  private overlayButton: Phaser.GameObjects.Text;
  private pauseLabel: Phaser.GameObjects.Text;
  private mission: Phaser.GameObjects.Text;
  private cargo: Phaser.GameObjects.Text;
  private caption: Phaser.GameObjects.Text;
  private controls: Phaser.GameObjects.Text;
  private phase: Phaser.GameObjects.Text;
  private toast: Phaser.GameObjects.Text;
  private toastTime = 0;
  private hurt = 0;
  private isOverlay = false;
  constructor(scene: Phaser.Scene, pause: () => void, resumeOrRetry: () => void) {
    this.root = scene.add.container(0, 0).setScrollFactor(0).setDepth(100000);
    this.graphics = scene.add.graphics(); this.root.add(this.graphics);
    const text = (x: number, y: number, value: string, size: number, color = '#c8d1c1') => {
      const label = scene.add.text(x, y, value, { fontFamily: font, fontSize: `${size}px`, color }); this.root.add(label); return label;
    };
    text(28, 18, 'THE LAST LIGHT', 15, '#e1c184').setLetterSpacing(3);
    text(28, 41, '最后一盏灯 / 北境旧城区', 11, '#aab6a4');
    this.health = text(28, 70, '', 12);
    text(28, 112, 'STAMINA', 9, '#93a595').setLetterSpacing(2);
    text(1150, 28, 'DAY 01', 13, '#e4c991');
    this.pauseLabel = text(1198, 59, 'Ⅱ 暂停', 12, '#bdc9b2');
    const pauseZone = scene.add.zone(1220, 67, 100, 36).setInteractive({ useHandCursor: true });
    pauseZone.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => { event.stopPropagation(); pause(); });
    this.root.add(pauseZone);
    text(1100, 91, 'SECTOR 07', 9, '#a7b39d').setLetterSpacing(2);
    this.stats = text(28, 674, '', 12, '#c6c6ab');
    this.controls = text(28, 698, '', 10, '#a7b3a0');
    this.phase = text(1250, 696, '', 10, '#b6b5a0').setOrigin(1, 0);
    this.mission = text(640, 28, '', 14, '#e6ce94').setOrigin(0.5, 0);
    this.cargo = text(640, 54, '', 11, '#bacdb4').setOrigin(0.5, 0);
    this.toast = text(640, 590, '', 13, '#f0d397').setOrigin(0.5).setBackgroundColor('#112a2d').setPadding(10, 7).setVisible(false);
    this.ammo = text(1250, 618, '', 28, '#ebd8a4').setOrigin(1, 0);
    this.caption = text(1250, 656, '', 10, '#a9b9a2').setOrigin(1, 0);
    this.reload = text(640, 513, '', 13, '#e3c58a').setOrigin(0.5);
    this.overlay = scene.add.container(0, 0).setVisible(false); this.root.add(this.overlay);
    this.overlay.add(scene.add.rectangle(640, 360, 1280, 720, 0x091217, 0.94));
    this.overlay.add(scene.add.text(640, 180, 'NORTH DISTRICT / 07', { fontFamily: font, fontSize: '11px', color: '#b5b69b', letterSpacing: 3 }).setOrigin(0.5));
    this.overlayTitle = scene.add.text(640, 230, '', { fontFamily: font, fontSize: '32px', color: '#e8d2a2' }).setOrigin(0.5);
    this.overlayBody = scene.add.text(640, 370, '', { fontFamily: font, fontSize: '14px', color: '#b2c0ac', align: 'center', lineSpacing: 10 }).setOrigin(0.5);
    const background = scene.add.rectangle(640, 540, 240, 45, 0xd9ba7d).setInteractive({ useHandCursor: true });
    background.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => { event.stopPropagation(); resumeOrRetry(); });
    this.overlayButton = scene.add.text(640, 540, '', { fontFamily: font, fontSize: '14px', color: '#18282a' }).setOrigin(0.5);
    this.overlay.add([this.overlayTitle, this.overlayBody, background, this.overlayButton]);
  }
  flashHurt(): void { this.hurt = 0.24; }
  notify(message: string): void { this.toast.setText(message).setVisible(true); this.toastTime = 4.5; }
  blocksInput(x: number, y: number): boolean { return this.isOverlay || y < 93 || x > 1090 && y < 235; }
  update(world: CombatWorld, paused: boolean, dt: number, bag = false): void {
    const p = world.player, g = this.graphics;
    const expedition = world instanceof ExpeditionWorld ? world : null;
    this.toastTime = Math.max(0, this.toastTime - dt); this.toast.setVisible(this.toastTime > 0);
    this.hurt = Math.max(0, this.hurt - dt);
    g.clear();
    g.fillStyle(0x081318, 0.8).fillRect(0, 0, 1280, 10).fillRect(0, 645, 1280, 75);
    g.fillStyle(0x081318, 0.62).fillRect(18, 13, 238, 118).fillRect(1088, 84, 174, 154);
    if (expedition) g.fillStyle(0x081318, 0.72).fillRoundedRect(300, 16, 680, 64, 4);
    g.fillStyle(0x263c3a).fillRect(28, 94, 205, 6).fillRect(93, 114, 140, 4);
    g.fillStyle(p.health > 30 ? 0xa9c69b : 0xd68d79).fillRect(28, 94, 205 * p.health / B.player.health, 6);
    g.fillStyle(0xd9bd85).fillRect(93, 114, 140 * p.stamina / B.player.stamina, 4);
    this.health.setText(`守灯人   ${p.health} / ${B.player.health}`);
    this.ammo.setText(`${String(p.ammo).padStart(2, '0')}  /  ${world.weapon.magazine}`);
    this.caption.setText(`${world.weapon.name} / 无限备用弹药`);
    this.phase.setText(expedition ? '白昼行动 / 90s' : '战斗训练 / 北境旧城');
    this.controls.setText(expedition ? 'WASD 移动  SHIFT 冲刺  鼠标射击  E 互动  R 换弹  1/2 武器  H 治疗  TAB 背包  ESC 暂停' : 'WASD 移动   SHIFT 冲刺   鼠标瞄准 / 左键射击   R 换弹   ESC 暂停');
    this.mission.setText(expedition ? `${Math.ceil(expedition.remaining)}s  /  ${expedition.objective().text}` : '');
    this.cargo.setText(expedition ? `建材 ${expedition.inventory.materials}   电力 ${expedition.inventory.energy}   急救包 ${expedition.inventory.medkits}   负重 ${expedition.weight}/${CAPACITY}   随队 ${expedition.followers.length}` : '');
    this.stats.setText(`击杀 ${String(world.kills).padStart(2, '0')}   /   存活 ${Math.floor(world.elapsed / 60)}:${String(Math.floor(world.elapsed % 60)).padStart(2, '0')}   /   在场感染者 ${world.zombies.length}`);
    const reloadProgress = Math.max(0, Math.min(1, 1 - p.reload / world.reloadDuration));
    this.reload.setText(p.reload > 0 ? `正在换弹  ${(100 * reloadProgress).toFixed(0)}%` : '');
    if (p.reload > 0) { g.fillStyle(0x263c3a).fillRect(580, 537, 120, 3); g.fillStyle(0xe6c184).fillRect(580, 537, 120 * reloadProgress, 3); }
    const mx = 1100, my = 111, mw = 150, mh = 113;
    g.fillStyle(0x213430).fillRect(mx, my, mw, mh);
    for (const b of BUILDINGS) g.fillStyle(0x4a5c50).fillRect(mx + b.x * 32 / WORLD_WIDTH * mw, my + b.y * 32 / WORLD_HEIGHT * mh, b.width * 32 / WORLD_WIDTH * mw, b.height * 32 / WORLD_HEIGHT * mh);
    for (const zombie of world.zombies) g.fillStyle(0xba8d70).fillRect(mx + zombie.x / WORLD_WIDTH * mw - 1, my + zombie.y / WORLD_HEIGHT * mh - 1, 2, 2);
    if (expedition) {
      for (const c of expedition.caches) if (!c.opened) g.fillStyle(0xa5c6a0).fillRect(mx + c.x / WORLD_WIDTH * mw - 1.5, my + c.y / WORLD_HEIGHT * mh - 1.5, 3, 3);
      for (const s of expedition.survivors) g.fillStyle(0x8bc9d1).fillCircle(mx + s.x / WORLD_WIDTH * mw, my + s.y / WORLD_HEIGHT * mh, 2);
      g.lineStyle(1, 0xe7d5a0).strokeCircle(mx + CAMP.x / WORLD_WIDTH * mw, my + CAMP.y / WORLD_HEIGHT * mh, 4);
    }
    g.fillStyle(0xe5c384).fillCircle(mx + p.x / WORLD_WIDTH * mw, my + p.y / WORLD_HEIGHT * mh, 3);
    if (this.hurt > 0) {
      g.lineStyle(20, 0xc45e43, this.hurt * 1.4).strokeRect(0, 0, 1280, 720);
    }
    const overlay = paused || world.status !== 'playing';
    this.isOverlay = overlay; this.overlay.setVisible(overlay);
    this.pauseLabel.setText(paused ? '▶ 继续' : 'Ⅱ 暂停');
    if (overlay) {
      this.overlayTitle.setText(world.status === 'defeat' ? '灯火暂熄，希望仍在。' : '守灯人，稍作休整。');
      this.overlayBody.setText(world.status === 'defeat' ? `存活 ${Math.floor(world.elapsed)} 秒 · 击杀 ${world.kills} 只感染者\n按 Enter 或点击重试，重新进入街区。` : '战斗已暂停。按 Esc / P 或点击继续。\n窗口失焦后不会自动恢复开火与移动。');
      this.overlayButton.setText(world.status === 'defeat' ? '重新出发  →' : '继续战斗  →');
      if (bag && expedition) {
        this.overlayTitle.setText('行军背包');
        this.overlayBody.setText(`负重 ${expedition.weight} / ${CAPACITY} · 物资返营后入库\n建材 ${expedition.inventory.materials}　电力 ${expedition.inventory.energy}　急救包 ${expedition.inventory.medkits}\n营地库存：建材 ${expedition.campaign.depot.materials} / 电力 ${expedition.campaign.depot.energy} / 急救包 ${expedition.campaign.depot.medkits}\n装备：${world.ownedWeapons.map(id => id === 'pistol' ? '9MM 手枪 [1]' : 'AR 步枪 [2]').join(' / ')}\n随队：${expedition.followers.map(s => SURVIVOR_PROFILES[s.id].name).join('、') || '暂无'}\n按 H 使用急救包（关闭背包后）\n时间已暂停 · Tab / B / Esc 关闭`);
        this.overlayButton.setText('返回街区  →');
      }
      if (expedition?.summary) {
        const s = expedition.summary, names = s.rescued.map(id => SURVIVOR_PROFILES[id as keyof typeof SURVIVOR_PROFILES].name).join('、') || '暂无';
        this.overlayTitle.setText(s.reason === 'sunset' ? '黄昏收队，带着希望回营。' : '顺利回营，灯火有了补给。');
        this.overlayBody.setText(`探索 ${Math.floor(s.duration)} 秒 · 击杀 ${s.kills} · 搜刮 ${s.caches} 处\n带回：建材 ${s.cargo.materials} / 电力 ${s.cargo.energy} / 急救包 ${s.cargo.medkits}\n营救：${names}${s.engineerBonus ? ` · 工程师额外回收 +${s.engineerBonus} 建材` : ''}\n营地库存：建材 ${expedition.campaign.depot.materials} / 电力 ${expedition.campaign.depot.energy} / 急救包 ${expedition.campaign.depot.medkits}\n战利品已送入仓库，准备部署防线。\n按 Enter 进入基地布防`);
        if (this.saveWarning) this.overlayBody.setText(this.overlayBody.text + '\n' + this.saveWarning);
        this.overlayButton.setText('进入基地布防  →');
      }
    }
  }
}
