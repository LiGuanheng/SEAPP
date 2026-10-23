import Phaser from 'phaser';

const pages = {
  combat: {
    title: '战斗训练 · 熟悉移动与枪械',
    left: 'WASD / 方向键　移动\nShift　冲刺（消耗体力）\n鼠标瞄准 / 按住左键　射击\nR　换弹；空弹匣自动换弹\nM　声音开关\nEsc / P　暂停与继续',
    right: '感染者持续追击并近身攻击\n命中有闪白、击退与粒子反馈\n墙体和车辆阻挡移动与子弹\n失焦自动暂停，回来主动继续\n战败 Enter　重新开始训练\nF1　随时查看本指南',
    tip: '独立训练入口没有搜刮、背包和返营流程。\n要展示完整昼夜，请打开默认地址（去掉 mode=combat）。',
  },
  city: {
    title: '白昼行动 · 找到补给，带队回营',
    left: 'WASD / 方向键　移动\nShift　冲刺（消耗体力）\n鼠标瞄准 / 按住左键　射击\nR　换弹；空弹匣自动换弹\n1 / 2　手枪 / 已找到的步枪\nM　声音开关',
    right: 'E　搜刮、营救、信标旁回营\nH　使用背包内的急救包\nTab / B　背包（暂停时间）\n金色光圈 / 箭头　当前目标\nEsc / P　暂停与继续\n回营摘要 Enter　进入基地',
    tip: '演示路线：工具箱 → 武器箱 → 工程师 → 暖黄色回营信标。\n无需等满 90 秒；先等随队人员跟上，再按 E 回营。失败不带回本轮物资。',
  },
  base: {
    title: '黄昏布防 · 把补给变成防线',
    left: '1 / 2　沙袋路障 / 机枪塔\n左键地面　放置设施\nR　旋转沙袋\nEsc / 右键　取消建造\n选中设施 + Delete　拆除\nEnter　提前入夜',
    right: '左键 / 拖框　选兵\nShift　加选；Space　全选\n右键地面　编队移动\nG　就地驻守\nWASD / 滚轮　移动 / 缩放镜头\nC / 小地图　回灯塔 / 定位镜头',
    tip: '30 秒后自动入夜；查看指南时暂停。保留十字通道，避免把士兵围住。\n建议先在灯塔附近部署机枪塔，再把部队分散驻守；施工消耗真实探索库存。',
  },
  night: {
    title: '灯塔守夜 · 生存到天亮',
    left: '左键 / 拖框 / Shift　选择部队\nSpace　全选生还守卫\n右键地面　编队移动\nG　停止并就地驻守\n士兵 / 机枪塔　自动攻击\n夜战中不能施工或拆除',
    right: 'F → 左键　视野内炮火支援\n右键 / Esc　取消支援落点\nWASD / 滚轮　移动 / 缩放镜头\nC / 小地图　回灯塔 / 定位镜头\nM　声音开关；P　暂停\n终局 Enter　以原阵地重试',
    tip: '绿点是守卫，金点是设施，红点是视野内感染者；小地图白框是当前视野。\n支援不伤己方；普通、疾行和重装感染者各具威胁。灯塔撑过 120 秒即获胜。',
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
