# 最后一盏灯 · The Last Light

软件工程课程项目，正在从网页面板原型重构为 Phaser 2D 末日生存 + RTS 塔防游戏。

**当前版本 v0.3：阶段 2 探索闭环。** 已有实时战斗、搜刮、步枪拾取、背包、职业幸存者跟随与回营入库。单次探索最多 **90 秒**，也能提前回营，方便课程现场演示。基地建设、军队指挥和完整夜战属于后续阶段，尚未接入。

## 启动与操作

需要 Node.js 24+。

```bash
npm ci
npm run dev
```

打开终端中的本地地址直接进入城市探索，点击画面获得焦点。推荐桌面键鼠。跟随顶部目标和地图光圈：搜刮工具箱 → 拾取步枪 → 营救工程师 → 返回暖黄色信标按 E。无需等待倒计时结束。

| 操作 | 按键 |
| --- | --- |
| 移动 | WASD / 方向键 |
| 瞄准与射击 | 鼠标瞄准，按住左键射击 |
| 换弹 | R；空弹匣后自动换弹 |
| 冲刺 | 按住 Shift，消耗体力 |
| 暂停 / 继续 | Esc / P，或右上角按钮 |
| 搜刮 / 营救 / 信标回营 | 靠近目标按 E |
| 武器切换 | 1 手枪 / 2 步枪（需先找到武器箱） |
| 背包 | Tab / B，打开时暂停计时；Esc 关闭 |
| 治疗 | H，受伤且有急救包时恢复最多 50 生命 |
| 再次出发 | 战败或回营后 Enter / 按钮 |

工程师返营额外回收建材，医护员救援时治疗，教官随队加快换弹。背包负重上限 24，搜刮整箱放不下时保留原箱。无限备用弹药用于当前演示，枪械仍有弹匣、射速和换弹限制。

到 90 秒自动黄昏收队；提前回营需到信标附近按 E，等队员跟上。只有结束时距主角 150 像素内的已汇合队员计入营救。失败不会带回本轮物资。回营后写入独立 `last-light.campaign.v2` 营地存档，刷新可查看累计库存；探索中途刷新会丢失本轮进度，旧 `last-light.save.v1` 不读写。每次出发固定从手枪开始，步枪营地解锁记录暂不用于出发配装。

原阶段 1 训练场仍可通过 `/?mode=combat` 打开。完整昼夜后续计划约 4 分钟（探索 90 秒、建设 30 秒、夜战 120 秒），目前只交付探索部分。

## 验证

```bash
npm test
npm run build
npm run test:e2e
npm run test:legacy
```

浏览器测试默认使用本机 Chrome。无 Chrome 时执行 `npx playwright install chromium`，设置 `PLAYWRIGHT_CHROMIUM=1`。生产产物验证先构建，再设置 `E2E_PRODUCTION=1` 运行浏览器测试，详见测试文档。

## 文档

- [需求分析](docs/01-requirements.md)
- [游戏设计](docs/02-game-design.md)
- [技术架构与旧版处置](docs/03-architecture.md)
- [路线与 Git 提交](docs/04-roadmap.md)
- [测试、追溯与人工验收](docs/05-testing.md)
- [真实协作与决策](docs/06-decisions.md)
- [素材来源与许可](docs/07-assets.md)
- [现场演示与阶段 2 验收](docs/08-stage2-demo.md)

## 目录

```text
src/config/       地图、角色、枪械、素材配置
src/core/         独立于 Phaser 的战斗、碰撞、寻路与状态
src/scenes/       Phaser 载入、输入、镜头和循环
src/view/         地图对象、角色动画、特效与 HUD
public/assets/    本地游戏素材和许可
tests/            当前规则与浏览器测试
legacy/v0.1/      旧版源代码和测试，不进入新入口
docs/legacy-v0.1/ 旧版历史文档
```

分支：`codex/expedition-stage-2`。原仓库尚无首笔提交；本轮未代用户提交或推送。完成试玩后请及时提交真实阶段成果，命令见路线文档。

Phaser 3.90.0、TypeScript、Vite。美术来自 Kenney 与 Curt 的 CC0 像素素材，来源与使用范围见素材文档。运行时不依赖 CDN。
