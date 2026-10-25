import Phaser from 'phaser';
import { BUILDINGS, BUILDING_KEYS, type BuildingKind } from '../config/base.ts';
import type { BaseWorld } from '../core/base-world.ts';
import { STAGES } from '../config/progression.ts';

const font = 'Consolas, Microsoft YaHei, sans-serif';
export class BaseHud {
  readonly root: Phaser.GameObjects.Container;
  saveWarning = '';
  private info: Phaser.GameObjects.Text;
  private selection: Phaser.GameObjects.Text;
  private timer: Phaser.GameObjects.Text;
  private storage: Phaser.GameObjects.Text;
  private costs = new Map<BuildingKind, Phaser.GameObjects.Text>();
  private mode: Phaser.GameObjects.Text;
  private toast: Phaser.GameObjects.Text;
  private toastTime = 0;
  private overlay: Phaser.GameObjects.Container;
  private title: Phaser.GameObjects.Text;
  private body: Phaser.GameObjects.Text;
  private buttonLabel: Phaser.GameObjects.Text;
  constructor(scene: Phaser.Scene, build: (kind: BuildingKind) => void, hold: () => void, finish: () => void, pause: () => void, resume: () => void, explore: () => void) {
    this.root = scene.add.container(0, 0).setDepth(100000);
    const text = (x: number, y: number, value: string, size = 13, color = '#c3d0ba') => {
      const t = scene.add.text(x, y, value, { fontFamily: font, fontSize: `${size}px`, color }); this.root.add(t); return t;
    };
    const button = (x: number, y: number, width: number, label: string, action: () => void) => {
      const bg = scene.add.rectangle(x, y, width, 36, 0x3a5149).setStrokeStyle(1, 0x7c8e72).setInteractive({ useHandCursor: true });
      bg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => { e.stopPropagation(); action(); });
      this.root.add(bg); text(x, y, label, 12, '#e0d4a8').setOrigin(0.5);
    };
    const g = scene.add.graphics(); this.root.add(g);
    g.fillStyle(0x0b1c24, 0.96).fillRect(0, 0, 1280, 94).fillRect(0, 596, 1280, 124);
    g.lineStyle(1, 0x5b7161, 0.7).lineBetween(20, 94, 1260, 94).lineBetween(20, 596, 1260, 596);
    text(26, 17, 'THE LAST LIGHT / 最后一盏灯', 13, '#dfc68d').setLetterSpacing(2);
    text(26, 44, '北境灯塔 · 黄昏布防', 18, '#e8d59f');
    this.info = text(440, 23, '', 12, '#c9d1b3');
    this.timer = text(440, 51, '', 12, '#cfbb8d');
    this.storage = text(440, 78, '', 10, '#e4a689');
    button(1198, 27, 110, '暂停 [P]', pause);
    button(1198, 70, 110, '再次探索', explore);
    this.selection = text(26, 609, '', 13, '#e5d09a');
    BUILDING_KEYS.forEach((kind, i) => {
      const x = 65 + i * 112;
      button(x, 665, 106, `[${i + 1}] ${BUILDINGS[kind].name}`, () => build(kind));
      this.costs.set(kind, text(x, 691, '', 10, '#a9b8a0').setOrigin(0.5));
    });
    button(1128, 641, 238, '完成布防 [Enter]', finish);
    button(1128, 684, 238, '就地驻守 [G]', hold);
    this.mode = text(26, 630, '', 11, '#aabd9f');
    text(640, 708, '左键/框选 · 右键移动 · WASD/滚轮 镜头 · Space 全选 · T 倍速 · L 配乐 · 锁定设施守夜胜利后开放', 10, '#a2b39d').setOrigin(0.5);
    this.toast = text(640, 565, '', 13, '#eddaa3').setOrigin(0.5).setBackgroundColor('#0c2027').setPadding(9, 6).setVisible(false);
    this.overlay = scene.add.container(0, 0).setVisible(false); this.root.add(this.overlay);
    const shade = scene.add.rectangle(640, 360, 1280, 720, 0x081b22, 0.94).setInteractive();
    shade.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => e.stopPropagation());
    this.overlay.add(shade);
    this.title = scene.add.text(640, 238, '', { fontFamily: font, fontSize: '30px', color: '#ecd5a0' }).setOrigin(0.5);
    this.body = scene.add.text(640, 355, '', { fontFamily: font, fontSize: '14px', color: '#bacdb3', align: 'center', lineSpacing: 12 }).setOrigin(0.5);
    const bg = scene.add.rectangle(640, 495, 260, 44, 0xdbbb7e).setInteractive({ useHandCursor: true });
    bg.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => { e.stopPropagation(); resume(); });
    this.buttonLabel = scene.add.text(640, 495, '', { fontFamily: font, fontSize: '14px', color: '#18312d' }).setOrigin(0.5);
    const back = scene.add.text(640, 551, '返回城市，再次探索 →', { fontFamily: font, fontSize: '13px', color: '#b8c9ad' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    back.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => { e.stopPropagation(); explore(); });
    this.overlay.add([this.title, this.body, bg, this.buttonLabel, back]);
  }
  blocks(x: number, y: number): boolean { return this.overlay.visible || x < 0 || x > 1280 || y < 94 || y >= 596 || x >= 1080 && y < 244; }
  notify(message: string): void { this.toast.setText(message); this.toastTime = 4.5; }
  update(world: BaseWorld, ids: Set<number>, selectedBuilding: number | null, buildKind: BuildingKind | null, paused: boolean, dt: number): void {
    const c = world.campaign, b = world.plan.buildings.find(b => b.id === selectedBuilding);
    this.info.setText(`营地库存　建材 ${c.depot.materials}　电力 ${c.depot.energy}　急救包 ${c.depot.medkits}`);
    this.timer.setText(`阶段 ${world.stage}/3 ${STAGES[world.stage].name} · 布防 ${Math.ceil(world.remaining)}s · 设施 ${world.plan.buildings.length} · 守备 ${world.plan.soldiers.length}`);
    this.selection.setText(b ? `${BUILDINGS[b.kind].name} · 耐久 ${Math.ceil(b.health)}/${BUILDINGS[b.kind].health} · 射程 ${BUILDINGS[b.kind].range} · Delete 返 ${Math.floor(b.paid.materials / 2)} 建材` : buildKind ? `${BUILDINGS[buildKind].name} · ${BUILDINGS[buildKind].description} · 耐久${BUILDINGS[buildKind].health} / 射程${BUILDINGS[buildKind].range}` : ids.size ? `已选 ${ids.size} 名士兵 · 右键移动 / G驻守 · 英雄：重炮手慢速对地，医师180范围治疗` : '外围拖延 → 中层火力 → 灯塔核心 · 6 电网 7 维修站（阶段2） · 8 火焰 9 狙击（阶段3）');
    this.mode.setText(buildKind ? `${buildKind === 'barricade' ? 'R 旋转 · ' : ''}左键放置 · Esc/右键取消` : `本阶段 ${world.buildArea.width / 32}×${world.buildArea.height / 32} 格 · ${STAGES[world.stage].description}`);
    for (const [kind, text] of this.costs) { const cost = world.cost(kind); text.setText(world.unlocked(kind) ? `建材${cost.materials} / 电${cost.energy}` : `阶段 ${BUILDINGS[kind].stage} 解锁`).setColor(world.unlocked(kind) ? '#b9c5a5' : '#7d8c88'); }
    this.toastTime = Math.max(0, this.toastTime - dt); this.toast.setVisible(this.toastTime > 0);
    this.storage.setText(this.saveWarning);
    const ready = world.plan.status === 'ready'; this.overlay.setVisible(paused || ready);
    if (paused || ready) {
      this.title.setText(ready ? '布防完成，阵地已经就绪。' : '指挥暂停');
      this.body.setText(ready ? `沙袋路障 ${world.plan.buildings.filter(b => b.kind === 'barricade').length} 座 · 机枪塔 ${world.plan.buildings.filter(b => b.kind === 'turret').length} 座\n守备士兵 ${world.plan.soldiers.length} 人 · 驻守 ${world.plan.soldiers.filter(s => s.stance === 'hold').length} 人\n剩余建材 ${c.depot.materials} / 电力 ${c.depot.energy}\n训练模式 · 按 N 开始守夜，Enter 继续调整。` : '镜头、部队和布防计时已暂停。\n按 P / Esc 或点击下方按钮继续。');
      if (this.saveWarning) this.body.setText(this.body.text + '\n' + this.saveWarning);
      this.buttonLabel.setText(ready ? '继续调整阵地 [Enter]' : '继续指挥 [P]');
    }
  }
}
