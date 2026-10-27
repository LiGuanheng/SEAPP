# 六天理解与实操路线

目标是能启动系统、沿着代码解释一次成绩提交、管理数据库并演示部署，不是六天背完 TypeScript。每天建议 3–5 小时：先阅读/画图约 1 小时，亲自操作 1–2 小时，再用自己的话讲 15 分钟。遇到失败时记录命令、现象、原因和解决方法，不直接跳到 AI 给出的“成功结论”。

从 [BACKEND_GUIDE.md](BACKEND_GUIDE.md) 第 1–4 节开始，操作细节使用 [BACKEND_DEPLOYMENT.md](BACKEND_DEPLOYMENT.md)，实际自动化证据看 [BACKEND_VALIDATION.md](BACKEND_VALIDATION.md)。Windows 命令默认在 `D:\Projects\SEAPP` 运行；Linux 命令只在 WSL/VPS 中执行。没有实际云账号时可以在本地演练，云端验收继续标记“未执行”。

## Day 1：架构、HTTP、Node.js、Fastify

**必须理解：** 浏览器负责游戏，API 负责校验和保存请求，数据库负责持久化；HTTP 请求由方法、URL、请求头、正文组成，响应有状态码和 JSON。TypeScript 的 interface/type 描述数据形状，函数接收参数并返回结果；async/await 表示等待异步操作，不需要先学完整语法。

**重点文件：** `src/main.ts`、`src/scenes/BootScene.ts`、`server/src/index.ts`、`server/src/app.ts`、`server/src/config.ts`。先找到 new Phaser.Game 和三条 app.get/app.post，再看它们分别调用谁。

**亲自操作（PowerShell）：**

```powershell
cd D:\Projects\SEAPP
node --version
npm ci
npm ci --prefix server
Copy-Item .env.example .env
Copy-Item server/.env.example server/.env
npm run dev
# 第二个终端
npm run server:dev
# 第三个终端
Invoke-RestMethod http://127.0.0.1:3000/api/health
```

复制 env 仅在文件不存在时进行。此时如果数据库还没启动，health 返回 503 是预期，记录下来；API 端口仍应可访问。浏览器 F12 → Network 查看静态文件和排行榜 GET，区分“文件来自 Vite”和“JSON 来自 API”。

**当天验收：** 自己画出三层架构图；不用照读文档，说出 GET 和 POST 的用途；在 app.ts 中定位 health，并说明“进程启动成功”和“数据库健康”不是一回事。能解释 200/201/400/503 的大意。

**容易犯错：** 只装根目录依赖，忘记 server 独立依赖；把 server/.env 当成 Vite 配置；以为 TypeScript 类型会自动检查网络输入；把未启动数据库的 503 当成必须重装 Node。

## Day 2：PostgreSQL、SQL、DBeaver 与数据库管理

**必须理解：** 表、列、行、主键、唯一约束、CHECK、索引；SELECT/INSERT/UPDATE/DELETE；BEGIN/COMMIT/ROLLBACK。数据库的持久化文件和容器不是同一事物，Volume 保留数据，开发/测试/正式库必须区分。

**重点文件：** `server/sql/001_scores.sql`、`server/sql/seed.sql`、`server/src/migrate.ts`、`server/src/db.ts`、`compose.yaml`、`compose.dev.yaml`。

**亲自操作（Docker 可用时）：**

```powershell
docker compose -f compose.yaml -f compose.dev.yaml up -d db
npm --prefix server run migrate
npm --prefix server run seed
docker compose -f compose.yaml -f compose.dev.yaml exec db psql -U seapp -d seapp_dev
```

在 psql 或 DBeaver 中执行：

```sql
SELECT id,nickname,difficulty,duration_ms,score FROM scores;
SELECT * FROM schema_migrations;
BEGIN;
UPDATE scores SET nickname='练习改名' WHERE id='00000000-0000-4000-8000-000000000001';
SELECT nickname FROM scores WHERE id='00000000-0000-4000-8000-000000000001';
ROLLBACK;
```

按指南第 9 节连接 DBeaver，查看表、筛选昵称、执行两个排序查询。做一次仅包含演示 UUID 的 DELETE 后回滚。再停止和启动 db，确认数据仍在；按部署文档备份并恢复到新库，不覆盖原库。

**当天验收：** 能说出每列保存什么、UUID 为什么不能重复；能解释参数化 SQL 与字符串拼接的区别；能在 DBeaver 找到一条成绩，并用 ORDER BY 得到正确榜单。至少成功恢复一次自己的开发库备份。

**容易犯错：** UPDATE/DELETE 没有 WHERE；在正式连接上练习；以为改 POSTGRES_PASSWORD 环境变量会改旧卷密码；用 `down -v` 清掉数据；把 CSV 当完整数据库备份。

## Day 3：排行榜 API、前后端调用与源码追踪

**必须理解：** fetch、JSON、CORS、运行时校验、幂等键、重试；模拟时间与实际活动时间；昵称不是身份。理解分数构成和三次首胜，不必背公式中的每个常量。

**重点文件：** `src/core/ranking.ts`、`src/core/scoring.ts`、`src/services/game-session.ts`、`src/services/leaderboard.ts`、`src/view/LeaderboardPanel.ts`、`server/src/scores.ts`、`server/src/app.ts`、`server/src/db.ts`。

**亲自操作：**

```powershell
npm test
npm --prefix server test
npm --prefix server run typecheck
npm --prefix server run build
Invoke-RestMethod 'http://127.0.0.1:3000/api/leaderboard?board=score&difficulty=normal'
```

同时运行前端、API、数据库，在浏览器查看两种榜单和两种难度。按指南中的完整 JSON，在开发库用 DBeaver HTTP 工具或浏览器开发者工具发 POST；同一个 UUID 同内容再发一次，应返回 duplicate=true，表中仍一条；修改昵称再发同 UUID，应是 409。样例成绩只能用于开发/测试展示，不能当作真实手玩成绩提交正式榜。

自己从空营地开始一次排名战役，观察暂停、背包和指南；阅读 BaseScene.persist → RankedRun.finishNight → calculateScore，再沿 submitScore → app.post → createStore.submit 追踪。断开 API，确认游戏能继续、榜单有错误反馈，恢复后重试。

**当天验收：** 用 3–5 分钟讲完一次成绩从游戏到 SQL 的过程；准确指出至少 8 个核心文件。能回答“超时后能不能改昵称”“为什么不用昵称作主键”“为什么 CORS 不是防作弊”。

**容易犯错：** 把响应丢失当成未写入；重试换 UUID 造成新记录；只看前端校验，忘记后端还要重算；把夜战 120 模拟秒当真实通关时间；以为刷新能保留本次排名计时。

## Day 4：Linux、WSL、Docker、Compose 与 SSH

**必须理解：** 当前目录、文件路径、环境变量、文件权限、进程与端口；镜像/容器/Volume/网络；SSH 登录与隧道；Dockerfile 的构建阶段和运行阶段。

**重点文件：** `server/Dockerfile`、`.dockerignore`、`compose.yaml`、`compose.dev.yaml`、`compose.prod.yaml`、`deploy/Caddyfile`。阅读部署文档第 1–5 节。

先按官方教程安装 WSL2 与 Docker Desktop，必要时重启。亲自验证 docker 和 compose 版本后：

```powershell
docker compose -f compose.yaml -f compose.dev.yaml config --quiet
docker compose -f compose.yaml -f compose.dev.yaml up -d --build
docker compose -f compose.yaml -f compose.dev.yaml ps
docker compose -f compose.yaml -f compose.dev.yaml logs --tail=100 api db
Invoke-RestMethod http://127.0.0.1:3000/api/health
docker compose -f compose.yaml -f compose.dev.yaml stop
```

在 WSL Ubuntu 练习 `pwd`、`ls -la`、`cd`、`cat`、`less`、`mkdir`、`chmod`、`ps`、`ss -lnt`。本机有可用 SSH 服务/测试机时再练习 `ssh user@host`，没有服务器时先理解命令，不编造登录结果。

**当天验收：** 用 Compose 真正启动三层系统，能查看日志、停止、重启并证明数据保留；说明容器中的 db:5432 与主机的 127.0.0.1:5432 不同。能指出为什么生产不加载 dev 文件。

**容易犯错：** Docker Desktop 未启动；Node API 和容器 API 同时抢 3000；在 Windows 终端直接运行 apt；把 Linux 容器路径当 Windows 盘符；在服务器上只依赖 UFW 而误发布数据库端口。

## Day 5：短期 VPS、Caddy、HTTPS、日志与备份

**必须理解：** DNS、域名/IP、HTTPS 证书、反向代理、云安全组与主机防火墙；只公开需要的入口；备份能恢复才算有效。

**重点文件：** `deploy/.env.production.example`、`deploy/Caddyfile`、`compose.prod.yaml`、`.github/workflows/deploy.yml`，部署文档第 3–6 节。

只有你自己决定购买/使用 VPS 后才执行真实云操作。先核对发布分支已包含本轮代码，SSH 登录，按手册安装 Docker、设置生产环境与 DNS。主要命令：

```bash
ssh your_user@YOUR_VPS_IP
git log -1 --oneline
docker compose -f compose.yaml -f compose.prod.yaml up -d --build
docker compose -f compose.yaml -f compose.prod.yaml logs --tail=100 api caddy db
curl -fsS https://api.example.com/api/health
```

随后在 GitHub 配置公开 VITE_API_BASE_URL 并手动发布正确分支。浏览器 Network 验证 HTTPS 和 CORS，按手册做 pg_dump、复制到本地、恢复到新库、核对行数与榜单。记录一个旧应用版本，理解如何回滚应用以及为什么不能随意回滚数据库。

**当天验收：** 用另一台设备/网络访问 Pages 与 API，提交一条真实演示成绩（若手玩尚未通关，则只在独立演示/测试库使用夹具并明确标注）。从日志定位一次故意写错 CORS 的失败，再恢复；备份成功恢复到新库。没有 VPS 时用本地 Caddy/Compose 演练并标记未完成公网 HTTPS 验收。

**容易犯错：** clone 旧默认分支；把 /SEAPP/ 写进 CORS Origin；Pages 的 HTTPS 请求 HTTP API 导致混合内容阻断；把私钥发给 AI；开放 5432；把 .env 或 dump 推上 Git。

## Day 6：Render / Neon 迁移、完整验收与模拟答辩

**必须理解：** 同一后端换运行平台、数据库迁移、冷启动、免费额度、维护窗口、数据核对与回退。先验证新系统，再考虑停用旧服务器。

**重点文件：** `render.yaml`、`server/src/config.ts`、`server/src/db.ts`、`server/src/migrate.ts`、`docs/BACKEND_VALIDATION.md`；部署文档第 7 节、指南第 11–12 节。

自己登录 Neon/Render，在空的兼容数据库恢复备份，配置 TLS 和 CORS，以同一 Dockerfile 部署。更新 Pages 的 API 地址后分别查询两个难度和两种榜单；检查数据行数、逐 ID 字段和排序结果。绝不把删除 VPS 作为迁移脚本的一步。

本地最终检查：

```powershell
npm test
npm run test:legacy
npm run build
npm --prefix server run typecheck
npm --prefix server run build
npm --prefix server test
npm --prefix server run test:integration
npm run test:e2e
```

最后两项分别需要专用测试库与正确浏览器/API 配置；只运行普通 e2e 而未设置 E2E_REAL_API 时，真实 API 案例会明确跳过。可用临时 PostgreSQL 一键验收替代：`node --experimental-strip-types scripts/test-with-local-postgres.mjs --e2e --all`。这会重新构建带本地 API 的测试产物，发布前必须改回正式地址重新 build。

模拟答辩建议 12–15 分钟：2 分钟画架构，3 分钟演示游戏与双榜，3 分钟追一次 POST 和 SQL，2 分钟讲计时/幂等/安全局限，2–5 分钟随机回答指南中的问题。请同学随机点功能，让你现场找真实文件和函数，不按预先背好的顺序讲。

**当天验收：** 能独立启动、查库、定位 API、说明失败并回退；能说出至少三个真实限制和哪些检查没有执行。完整保留自己的操作日志、截图、课程演示数据和备份。AI 实现与自己亲自验证的内容分别如实记录，不把自动化夹具说成自己手玩或独立编码。

**容易犯错：** 未恢复验证就停 VPS；Neon 新库先 migrate 后又恢复完整 schema 导致冲突；关闭 SSL 证书检查；忘记免费休眠导致课堂首个请求超时；拿“写了配置”冒充“云端部署完成”。

## 学习结束后应能独立完成的事

- 用自己的话解释架构图，区分前端文件托管、API 进程和数据库。
- 沿一个按钮准确找到 UI、fetch、路由、校验与 SQL。
- 解释三阶段首胜、真实活动时间、得分构成、难度隔离和倍速规则。
- 使用 DBeaver 查记录，在测试库中安全修改/回滚，并恢复一个备份。
- 启动/停止 Compose，通过日志分清数据库错误、CORS、TLS 和免费服务冷启动。
- 如实说明 AI 辅助内容、尚未完成的操作和本系统的防作弊边界。
