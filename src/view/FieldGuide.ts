import Phaser from 'phaser';

const pages = {
  combat: {
    title: '战斗训练 · 熟悉移动与枪械',
    left: 'WASD / 方向键　移动\nShift　冲刺（消耗体力）\n鼠标瞄准 / 按住左键　攻击\nR　换弹；滚轮缩放\n3 消防斧；1 手枪\nM 全部声音 / L 配乐',
    right: '感染者持续追击并近身攻击\n命中有闪白、击退与粒子反馈\n墙体和车辆阻挡移动与子弹\n失焦自动暂停，回来主动继续\n战败 Enter　查看本局成绩\n底部按钮可明确重开阶段',
    tip: '独立训练入口没有搜刮、背包和返营流程。\n要展示完整昼夜，请打开默认地址（去掉 mode=combat）。',
  },
  city: {
    title: '白昼行动 · 找到补给，带队回营',
    left: 'WASD / Shift　移动 / 冲刺\n鼠标瞄准 / 左键　攻击\nR 换弹；滚轮缩放\n1 手枪 / 2 步枪（需拾取）\n3 消防斧 / 4 猎弓（药房）\nM 全部声音 / L 配乐',
    right: 'E　搜刮、营救、信标旁回营\nH　使用背包内的急救包\nTab / B　背包（暂停时间）\n金色光圈 / 箭头　当前目标\nEsc / P　暂停与继续\n回营摘要 Enter　进入基地',
    tip: '提灯照亮附近，走过的区域留下暗色地形记忆；敌人只有当前可见，墙体会遮挡灯光。\n街边金箱有聚光镜片，药房有高能灯芯：视野 240 → 320 → 400，安全回营保留。背包 48。',
  },
  base: {
    title: '黄昏布防 · 把补给变成防线',
    left: '1 路障 / 2 机枪 / 3 加农炮\n4 箭塔 / 5 城墙（按住拖建）\n6 电网 / 7 维修（阶段2）\n8 火焰 / 9 狙击（阶段3）\n选设施：U改装 / X出售\nEnter 入夜 / T 切换倍速',
    right: '左键 / 拖框　选兵\nShift　加选；Space　全选\n右键地面　编队移动\nG　就地驻守\nWASD / 滚轮　移动 / 缩放镜头\nC / 小地图　回灯塔 / 定位镜头',
    tip: '城墙按住拖建；保留通道。机枪塔阶段2可U改双联防空，加农炮阶段3可U改重型榴弹炮。\n改装消耗真实建材/电力；高射炮失去对地火力，榴弹炮射速慢。出售返全部已支付建材50%。',
  },
  night: {
    title: '灯塔守夜 · 生存到天亮',
    left: '左键 / 拖框 / Shift　选择部队\nSpace　全选生还守卫\n右键地面　编队移动\nG　停止并就地驻守\n士兵 / 机枪塔　自动攻击\n夜战中不能施工或拆除',
    right: 'F → 左键　视野内炮火支援\n右键 / Esc　取消支援落点\nWASD / 滚轮　镜头 / 缩放\nC / 小地图　锁回灯塔 / 浏览\nT 倍速；M 声音 / L 配乐\n胜利 Enter　下一阶段或总成绩',
    tip: '五阶段战役：前四夜可直接布防或探索补给，第五夜守到黎明即通关。死亡结束本次尝试。\n电网/火焰/近战/重炮只对地，机枪/箭塔/狙击可对空，留意Boss地面预警。\n榜单累计探索、布防、守夜；底部可重开阶段，丢弃本阶段进度、保留之前首胜。',
  },
} as const;

/** 纯 Phaser 帮助浮层；暂停与恢复策略由场景负责，避免恢复背包/失焦暂停。 */
export class FieldGuide {
  private panel: Phaser.GameObjects.Container;
  private button: Phaser.GameObjects.Text;
  get visible(): boolean { return this.panel.visible; }
  constructor(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, mode: keyof typeof pages, toggle: () => void) {
    const text = (x: number, y: number, value: string, size: number, color = '#c4d0bb') => scene.add.text(x, y, value, { fontFamily: 'Consolas, Microsoft YaHei, sans-serif', fontSize: `${size}px`, color, lineSpacing: 15 });
    const button = text(1040, 27, '指南 [F1]', 12, '#e4ca91').setOrigin(0.5).setPadding(10, 8).setBackgroundColor('#263d3b').setInteractive({ useHandCursor: true });
    const click = (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => { e.stopPropagation(); toggle(); };
    button.on('pointerdown', click); parent.add(button);
    this.button = button;
    this.panel = scene.add.container(0, 0).setVisible(false); parent.add(this.panel);
    const shade = scene.add.rectangle(640, 360, 1280, 720, 0x08141c).setInteractive();
    shade.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => e.stopPropagation());
    const page = pages[mode];
    const close = scene.add.rectangle(640, 624, 280, 42, 0xd9bd83).setInteractive({ useHandCursor: true }); close.on('pointerdown', click);
    this.panel.add([shade, text(640, 74, 'FIELD MANUAL / 时间已暂停', 12, '#9fb9a5').setOrigin(0.5), text(640, 125, page.title, 27, '#ebd4a3').setOrigin(0.5),
      text(180, 199, page.left, 16), text(690, 199, page.right, 16), text(640, 523, page.tip, 14, '#d9c894').setOrigin(0.5).setAlign('center'),
      close, text(640, 624, '关闭指南 [F1 / Esc]', 14, '#19322e').setOrigin(0.5)]);
  }
  show(value: boolean): void { this.panel.setVisible(value); }
  available(value: boolean): void { this.button.setVisible(value); }
}
