# main 分支改名与回归检查（2026-11-01）

- GitHub 默认分支和本地分支由 `codex/story-lantern-and-fog` 改为 `main`，远程只保留 `main`，原有提交历史完整保留。
- Docker 工作流分支过滤、Render Blueprint 的 `branch`、当前部署文档改为 `main`。历史验收文档中的旧分支名称作为历史记录保留。
- GitHub Pages 使用 Actions 发布；将 github-pages 环境原先对应旧分支的允许规则改为 `main`，保留环境保护。改名前后网页地址相同。
- Render 现有服务的分支绑定由用户在控制台改为 `main` 并确认；仓库配置不能替代现有服务设置的核对。
- 不操作线上 Neon 表结构，不向线上排行榜写入测试成绩；数据库集成验证只使用临时本地 PostgreSQL。

## 验证方式

```powershell
npm test
npm run test:legacy
npm --prefix server test
npm run build
npm --prefix server run build
node scripts/test-with-local-postgres.mjs
```

生产构建的浏览器检查需要在构建时传入测试用 API 地址。不要用无 API 配置的生产包验证提交/榜单网络交互；那种构建会按设计显示“尚未配置在线服务”，请求不会进入 Playwright 的网络拦截器。完整本地数据库联调可执行：

```powershell
node scripts/test-with-local-postgres.mjs --e2e --all
```

排行榜计时测试固定浏览器自动时钟后再采样，排除并行机器负载下按键调用本身的墙钟开销。重甲动画用例按波次配置等待首次重甲出现，不再使用平衡更新前的52.5秒等待窗口。

浏览器覆盖探索、搜刮、救援、地图更新、背包、存档、武器、布防/出售/改装、军队移动、五阶段与英雄、普通与困难守夜、暂停/失焦、音效、显示兼容、主菜单、重开、结束结算和双排行榜。自动化结果不代表不存在任何未覆盖的缺陷。

## 验收结果

| 检查 | 结果 |
| --- | --- |
| 当前游戏模型 | 130/130 通过 |
| 早期独立版本 | 22/22 通过 |
| API | 9/9 通过 |
| 临时 PostgreSQL 集成 | 13/13 通过 |
| 浏览器不同用例 | 66 项均取得通过结果；全量首轮60项通过，修正测试配置/时钟/重甲等待窗口后，7项定向联调通过（含1项重复覆盖与首轮跳过的真实API写入） |
| 前后端生产构建 | 通过 |
| main 上的 Docker 镜像构建及 ESM 导入 | 通过，Actions run 41294095120 |
| main 上的 Pages 发布 | 通过，Actions run 41294161942 |
| 线上 API | /api/health 与普通难度双排行榜读取均 HTTP 200，允许 GitHub Pages 的准确跨域来源 |

本轮修正两处测试：冻结时钟采样后在页面重载前恢复推进；按当前波次配置等待重甲。没有修改游戏计时、得分、难度或线上成绩。
