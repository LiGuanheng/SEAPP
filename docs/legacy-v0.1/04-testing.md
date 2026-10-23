# 测试说明

## 执行方法

```bash
npm ci
npm test
npm run build
npm run test:e2e
```

规则测试使用 Node 内置测试框架，测试真实命令、边界和整局模拟；不依赖页面。类型检查包含在 build 中。端到端测试使用 Playwright，启动独立 Vite 服务，检查页面交互、自动存档、弹窗暂停及窄屏。

浏览器测试默认通过 `channel: 'chrome'` 使用本机 Chrome。没有 Chrome 的设备执行：

```bash
npx playwright install chromium
```

随后设置 `PLAYWRIGHT_CHROMIUM=1` 再运行 `npm run test:e2e`。PowerShell：`$env:PLAYWRIGHT_CHROMIUM='1'`；Linux/macOS：`PLAYWRIGHT_CHROMIUM=1 npm run test:e2e`。CI 自动使用 Chromium。

如需验证构建后的产物，先执行 `npm run build`，再设置 `E2E_PRODUCTION=1` 运行浏览器测试；测试会改用 Vite preview。PowerShell：`$env:E2E_PRODUCTION='1'; npm run test:e2e`。CI 采用此方式。

## 覆盖目标

- 建造、拆除、探索、维修的合法操作与资源不足/阶段不符。
- 固定种子随机结果一致，夜间清场前不提前结算。
- 设施索敌、击杀奖励、范围伤害和减速。
- 脉冲冷却、能源不足及无能源回退。
- 五夜完整推进、强化只能选一次、失败终止。
- 存档往返、损坏/超界/阶段矛盾数据拒绝、存储不可用。
- 页面建造、探索、开战、暂停、刷新恢复、窄屏无横向溢出。

## 手工验收清单

- [ ] 用户首次试玩并确认玩法与视觉方向。
- [ ] 实际游玩一整局，反馈难度、节奏与提示是否清楚。
- [ ] 在目标设备测试音效与键盘操作。
- [ ] Edge、Firefox、Safari 兼容性验证。
- [ ] 部署后验证 HTTPS、仓库子路径资源和刷新。

## 本次执行结果

日期：2026-10-22。环境：Windows、Node.js 24.15.0、本机 Chrome；测试时音效默认关闭。

| 验证 | 结果 | 范围 |
| --- | --- | --- |
| `npm test` | 22 / 22 通过 | 游戏命令、资源边界、武器/专家/小队、失败状态、存档校验；5 个固定种子均完成五夜通关模拟；新增耗尽能源、旧存档、完整灼烧时长与战败效果回归 |
| `npm run build` | 通过 | TypeScript 严格检查、Vite 生产构建；入口约 51KB JS / 27KB CSS，未压缩传输大小 |
| `E2E_PRODUCTION=1 npm run test:e2e` | 7 / 7 通过 | 实际生产产物中的探索救援、建设小队、暂停恢复、设置、坏存档/存储禁用、手机布局、第一夜到第二天及武器使用；新增按钮焦点/持续点击与能源显示回归 |
| 桌面与窄屏截图检查 | 已检查 | 1440px 桌面、390px 手机宽度，无横向溢出；手机标题和资源栏已调整 |

浏览器案例包含通过真实按钮守过第一夜，规则层模拟覆盖五夜；不等同于用户已手工游玩整局。其他浏览器、在线部署和真实用户试玩仍待完成。

自动截图位于忽略目录 `artifacts/`：`outpost-desktop.png`、`outpost-mobile.png`、`night-battle.png`、`paused-battle.png`。首次浏览器测试曾遇到本地网络沙箱限制；在允许访问本地服务后执行。新增战斗截图案例最初截取时间过晚，第一波已经结束，调整为战斗中截取后通过。

基础版首次交付为 18 项规则测试、5 项浏览器测试。用户要求复查后，先用新增失败案例确认缺陷，再完成修复；当前结果更新为上述 22 项、7 项，详见 [缺陷复查记录](07-bugfixes.md)。本轮浏览器测试使用最终重新构建的产物，7 项全部通过，耗时约 29 秒。
