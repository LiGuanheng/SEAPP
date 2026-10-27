# 本地、VPS 与 Render / Neon 部署手册

本轮只准备配置并做本地验收，没有购买服务器、创建云服务、修改 DNS 或执行生产迁移。真实结果见 [BACKEND_VALIDATION.md](BACKEND_VALIDATION.md)。平台限制按 2026-10-26 官方文档核对，实际开通时重新检查套餐页面。

## 1. 环境变量与端口

| 变量 | 放置位置 | 示例/用途 |
| --- | --- | --- |
| VITE_API_BASE_URL | 本地根 `.env` / Pages 的 Actions Variable | `https://api.example.com`，只填来源，不加 `/api`；公开变量 |
| DATABASE_URL | `server/.env` / API 容器 / Render Secret | PostgreSQL 连接串；只能存在后端 |
| DATABASE_SSL | 后端 | 本地/VPS 容器内 `disable`，Neon `verify-full` |
| CORS_ORIGINS | 后端 | `https://liguanheng.github.io`；多个来源逗号分隔，无路径和末尾斜杠 |
| HOST / PORT | 后端 | 默认 `127.0.0.1:3000`；容器 `0.0.0.0`，Render 使用平台 PORT |
| TRUST_PROXY | 后端 | 直连 `0`；只经 Caddy/Render 入口时 `1`，信任最近一跳 |
| LOG_LEVEL | 后端 | `info`，排错可暂时用 `debug` |
| POSTGRES_PASSWORD / POSTGRES_DB | Compose | 生产强随机密码与 `seapp_prod`；初始化既有卷时不会自动改旧密码 |
| API_DOMAIN | Caddy | `api.example.com`，只有域名，不加协议 |
| TEST_DATABASE_URL | 集成测试 | 专用 `seapp_test`；测试会清空成绩表 |

`VITE_` 值会进入公开 JS。修改 API 地址必须重新构建和发布前端，运行时修改服务器 `.env` 不会改变已经下载到玩家浏览器的代码。

数据库 SSL 由 `db.ts` 统一处理，不接受通过关闭证书验证绕过错误。连接串中的 sslmode/证书参数被统一的 SSL 配置接管；连接串要求 TLS 而 DATABASE_SSL=disable 时直接报配置错误。私有 CA 场景需要额外配置受信任 CA，本期配置面向本地容器和使用公共证书的 Neon。

## 2. Windows / WSL / Docker 准备

当前开发机器有 Node.js 24.15.0 和 npm 11.12.1，未检测到 docker 命令；`wsl --status` 在受限环境返回访问拒绝，因此没有验证 WSL 发行版可用性。**这不表示已安装并启动了 Docker。**

后续由你在 Windows 管理员终端执行 `wsl --install`，按提示启用虚拟化、重启并安装 Ubuntu。安装 Docker Desktop for Windows，启用 WSL2 后端，启动 Desktop 后验证：

```powershell
wsl --status
docker --version
docker compose version
docker run --rm hello-world
```

按 [Docker Desktop Windows 安装文档](https://docs.docker.com/desktop/setup/install/windows-install/) 检查系统要求；本轮没有替你安装系统组件。普通本地启动见 [指南第 8 节](BACKEND_GUIDE.md#8-从零本地运行windows-powershell)。

## 3. Ubuntu VPS：从登录到 HTTPS

以下由你获得 VPS 后亲自执行，不在当前机器上运行。推荐先用 Ubuntu 24.04 LTS 做练习；公网域名、可用 DNS 和服务器地址需要你准备。

### 3.1 SSH 与 Docker

在本机使用自己的账户登录：

```bash
ssh your_user@YOUR_VPS_IP
```

第一次连接核对服务商给出的主机指纹。使用你本机生成的密钥登录，不把 SSH 私钥贴给 AI，不把私钥放进仓库。

下面按 Docker 官方 apt 仓库方式安装，适合干净的 Ubuntu。已有 Docker 时先读官方文档处理版本冲突，不要照抄删除已有服务。

```bash
sudo apt update
sudo apt install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
sudo tee /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "$VERSION_CODENAME")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker run --rm hello-world
sudo docker compose version
```

安装步骤来源：[Docker Engine on Ubuntu](https://docs.docker.com/engine/install/ubuntu/)。后面的命令假设你已按官方安装后说明设置 Docker 访问权限；否则在 docker 前加 sudo。docker 用户组具有很高的系统权限，只给自己的可信账户使用。

### 3.2 拉取正确版本

**远程默认分支目前是旧版。** 本轮全栈代码按用户后续授权上传至 `codex/story-lantern-and-fog`，克隆时明确选择该分支，并核对它包含 `server/` 与本轮文档；不要直接克隆旧默认分支用于部署。

```bash
mkdir -p ~/apps
cd ~/apps
git clone --branch codex/story-lantern-and-fog https://github.com/LiGuanheng/SEAPP.git
cd SEAPP
git log -1 --oneline
test -f server/Dockerfile
test -f src/core/scoring.ts
```

如果后续改用其他分支，把命令里的分支替换为你实际发布的版本。也可以通过 scp 上传代码，但不要打包 node_modules、真实 .env 或本地数据库。

### 3.3 生产配置和启动

```bash
cp deploy/.env.production.example .env
chmod 600 .env
openssl rand -hex 24
nano .env
```

将随机十六进制字符串填入 POSTGRES_PASSWORD，避免连接串中的特殊字符需要额外转义。填写 `POSTGRES_DB=seapp_prod`、真实 API_DOMAIN 和准确的前端 Origin。GitHub Pages 项目页即使路径是 `/SEAPP/`，Origin 仍是 `https://liguanheng.github.io`。

DNS 中为 API 域名配置 A 记录指向 VPS；如果配置 AAAA，IPv6 也必须实际可达。云安全组和主机防火墙先允许你使用的 SSH 端口，再开放 80/TCP、443/TCP；可选开放 443/UDP 供 HTTP/3。不要开放 3000 或 5432。启用 UFW 前先确认 SSH 规则，保留当前连接，避免锁住自己。

```bash
docker compose -f compose.yaml -f compose.prod.yaml config --quiet
docker compose -f compose.yaml -f compose.prod.yaml up -d --build
docker compose -f compose.yaml -f compose.prod.yaml ps
docker compose -f compose.yaml -f compose.prod.yaml logs --tail=100 api caddy db
curl -fsS https://api.example.com/api/health
curl -fsS 'https://api.example.com/api/leaderboard?board=speed&difficulty=normal'
```

API 的 Docker CMD 先跑迁移再启动，失败就不会给出假健康。Caddy 会根据域名自动申请/续期证书，前提是域名解析与 80/443 的公网访问正确；证书与账户保存在独立命名卷中。[Caddy 自动 HTTPS 文档](https://caddyserver.com/docs/automatic-https)

**VPS 不加载 compose.dev.yaml。** 基础配置没有 db/api 的主机端口，只有 Caddy 对公网开放。Docker 发布端口有自己的网络转发规则，不要只依赖 UFW 以为能隔离误发布的数据库。

### 3.4 让 Pages 前端连接 API

GitHub 仓库 Settings → Secrets and variables → Actions → Variables，新增公开变量 `VITE_API_BASE_URL=https://api.example.com`。这是 API 的公开地址，不是数据库 Secret。Actions → Deploy Pages → 手动运行，选择本轮最新代码所在分支。

工作流仍只上传根目录 dist，`npm run build --base=./` 保持项目页兼容性，不把 server 代码上传为可运行服务。未设置变量时在线面板显示未配置，单机仍可玩。上线后用浏览器 Network 检查 GET 的地址、HTTPS、CORS 和 JSON；仅命令行 curl 成功还不能证明浏览器跨域成功。

## 4. 日志、健康检查和常见故障

```bash
docker compose -f compose.yaml -f compose.prod.yaml logs -f --tail=100 api
docker compose -f compose.yaml -f compose.prod.yaml logs --tail=100 caddy db
docker compose -f compose.yaml -f compose.prod.yaml exec db pg_isready -U seapp -d seapp_prod
docker compose -f compose.yaml -f compose.prod.yaml exec db psql -U seapp -d seapp_prod
```

| 现象 | 先查什么 |
| --- | --- |
| 502 | Caddy 能否找到 api:3000，API 是否因配置或迁移退出，HOST 是否 0.0.0.0 |
| 503 / database not ready | 数据库健康、连接串、账号权限、迁移是否成功；health 真正查询 scores 表 |
| 403 / 浏览器 CORS | 来源是协议+主机+端口，不含路径；localhost 与 127.0.0.1 是不同来源 |
| 页面仍请求旧 API | VITE 变量只在构建时注入；重新发布并检查浏览器缓存 |
| 免费服务首次超时 | 等待服务唤醒后重试；同一载荷/UUID 不重复写入 |
| 429 | 等 Retry-After，避免连续点刷新；学校共用公网 IP 可能共享额度 |
| 409 | 同一战役 ID 被不同内容提交；保留首次载荷重试，不能通过更换 UUID 掩盖真实冲突 |
| TLS 错误 | DATABASE_SSL=verify-full、主机名和证书链；不要关闭证书验证 |
| 修改 .env 密码后仍失败 | 已存在的数据库卷保留原角色密码，环境变量不是 ALTER ROLE |

Fastify 写请求 ID、方法、状态码和耗时，应用错误只记录名称/错误码，不回显数据库凭据。容器日志设置 10MB × 3 文件上限。不要把包含真实环境变量的 `docker compose config` 完整结果贴到公开文档，用 `--quiet` 做配置检查。

## 5. 备份、恢复和数据核对

### 5.1 备份本地或 VPS

下面是 VPS 例子；本地把 prod 文件换成 dev、数据库名换成 seapp_dev。

```bash
mkdir -p backups
docker compose -f compose.yaml -f compose.prod.yaml exec -T db pg_dump -U seapp -d seapp_prod -Fc -f /tmp/seapp.dump
docker compose -f compose.yaml -f compose.prod.yaml cp db:/tmp/seapp.dump ./backups/seapp-before-update.dump
sha256sum ./backups/seapp-before-update.dump
```

重要数据备份再通过 scp 下载到另一台机器。备份可能含玩家昵称，按自己的课程数据管理；不要提交到 Git。Windows PowerShell 也使用“容器内写文件 + docker compose cp”，不要依赖旧版 PowerShell 的 `>` 重定向保存二进制 custom dump，避免编码破坏。

### 5.2 恢复到新测试库，先证明备份可用

```bash
docker compose -f compose.yaml -f compose.prod.yaml exec db createdb -U seapp seapp_restore_test
docker compose -f compose.yaml -f compose.prod.yaml cp ./backups/seapp-before-update.dump db:/tmp/restore.dump
docker compose -f compose.yaml -f compose.prod.yaml exec -T db pg_restore --exit-on-error --no-owner --no-acl -U seapp -d seapp_restore_test /tmp/restore.dump
docker compose -f compose.yaml -f compose.prod.yaml exec db psql -U seapp -d seapp_restore_test -c 'SELECT count(*),min(submitted_at),max(submitted_at),sum(score) FROM scores;'
```

目标库应为空且没有先执行 migrate，否则已有表可能冲突。备份包含 scores、索引、约束和 schema_migrations。核对不止行数：按 ID 排序检查关键字段，运行两种 ORDER BY，比较前 20 条、难度分布及汇总值。源库仍在持续写入时，先约定短暂维护窗口再做最终导出，避免比对的时间点不同。

### 5.3 DBeaver 访问 VPS

VPS 默认不映射 5432。先在服务器查询数据库容器的内网 IP：

```bash
docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$(docker compose -f compose.yaml -f compose.prod.yaml ps -q db)"
```

在 DBeaver 新建 PostgreSQL 连接：Main 中填上面的容器 IP、5432、seapp_prod 和数据库用户；SSH 标签启用隧道，Host 填 VPS IP，User 填 SSH 用户，密钥选择本地文件。SSH 转发的目标是从 VPS 能访问的容器地址，不是你电脑的 localhost。容器重建后 IP 可能变化，需要重新查询；不必为此把数据库公开到公网。正式库连接设为只读，修改与删除练习使用单独测试库。

## 6. 更新与回滚 VPS

1. 按上节备份并在新库恢复验证，记录当前 `git rev-parse HEAD` 和镜像 ID。确认没有本地未提交的生产定制配置。
2. 拉取明确的目标分支/提交，查看 SQL 迁移，禁止修改已运行的 `001_scores.sql`；新结构写 `002_...sql`。迁移使用事务和咨询锁，校验和变化会拒绝启动。
3. 构建再替换 API，检查 health 和实际 GET/POST；Caddy 和 PostgreSQL 通常无须重建。

```bash
git status --short
git rev-parse HEAD
git pull --ff-only origin codex/story-lantern-and-fog
docker compose -f compose.yaml -f compose.prod.yaml build api
docker compose -f compose.yaml -f compose.prod.yaml up -d --no-deps api
curl -fsS https://api.example.com/api/health
```

故障时切回已记录的应用提交并重新构建 API，或使用你预先保存/标记的旧镜像。应用回滚不会自动回滚数据库。当前只有初始建表迁移，没有自动向下删表脚本；后续不兼容数据库变化要在维护窗口内选择前向修复或恢复到新数据库再切换连接，不能随意覆盖正在写入的正式库。

## 7. 免费托管：Render + Neon

### 7.1 准备 Neon

1. 自己登录 Neon，创建免费项目，在同一区域准备生产数据库；开发/测试使用不同数据库或分支。选择与源数据库兼容的 PostgreSQL 版本。
2. 获取 direct connection（直连）用于 pg_dump/pg_restore 和迁移，保存在你本机环境变量/密码管理器中。常驻小连接池也可使用直连；如果用 pooled endpoint，要核对连接行为，不能把数据库密码交给浏览器。
3. 新项目没有数据时，可以让首次 API 启动自动迁移；**迁移现有 VPS 数据时，先恢复完整备份到空库，不要提前建同名表。**
4. Render 中设置 DATABASE_URL 和 DATABASE_SSL=verify-full，CORS_ORIGINS 为 Pages 的准确来源。后端只用 pg，不需要改为另一套数据库 SDK。[Neon Node.js 连接说明](https://neon.com/docs/guides/node)、[node-postgres SSL 说明](https://node-postgres.com/features/ssl)

### 7.2 从 VPS 导出，恢复到 Neon

先做一次演练，最终切换再约定维护窗口。下载第 5 节生成的 custom dump。在安装 PostgreSQL 客户端的可信电脑上执行（Bash 示例，不要把实际连接串写进公开截图）：

```bash
read -rs -p '输入 Neon 直连 URL（使用 sslmode=verify-full）: ' NEON_DATABASE_URL
export NEON_DATABASE_URL
pg_restore --exit-on-error --no-owner --no-acl --dbname="$NEON_DATABASE_URL" ./backups/seapp-before-update.dump
psql "$NEON_DATABASE_URL" -c 'SELECT count(*),min(submitted_at),max(submitted_at),sum(score) FROM scores;'
psql "$NEON_DATABASE_URL" -c 'SELECT difficulty,count(*) FROM scores GROUP BY difficulty;'
```

客户端 pg_dump/pg_restore 版本至少要能读取源 PostgreSQL 版本；目标库版本应兼容源格式，不做向旧版本恢复。`--no-owner --no-acl` 避免把 VPS 的角色与权限照搬到 Neon。表、约束和迁移记录来自 dump，不要再重复导入 seed.sql。

分别在源库和 Neon 执行：

```sql
SELECT id,nickname,difficulty,duration_ms,score,max_speed,score_version,game_version,submitted_at
FROM scores ORDER BY id;
SELECT nickname,score,duration_ms FROM scores WHERE difficulty='normal' AND score_version=1
ORDER BY score DESC,duration_ms ASC,submitted_at ASC,id ASC LIMIT 20;
SELECT nickname,duration_ms,score FROM scores WHERE difficulty='hard' AND score_version=1
ORDER BY duration_ms ASC,score DESC,submitted_at ASC,id ASC LIMIT 20;
```

数据量小时用 DBeaver 导出两边查询结果逐行核对；有时间戳显示差异先统一时区，不要误以为数据变了。分数汇总相同不能取代逐 ID 核对。

### 7.3 准备 Render

1. 把本轮已验收代码推到自己选定的分支后，Render 连接该仓库并使用根目录 `render.yaml`。检查分支，不能误用旧默认分支。
2. Blueprint 使用 runtime docker、plan free、仓库根构建上下文、server/Dockerfile。DATABASE_URL 和 CORS_ORIGINS 由你在平台 Secret/环境变量中设置；DATABASE_SSL 已设 verify-full。自动部署关闭，先手动控制更新。
3. 同一个镜像启动时执行迁移，然后监听 `0.0.0.0:$PORT`。SQL 文件已经随构建复制，healthCheckPath 是 /api/health；不依赖免费套餐的一次性 shell 或 pre-deploy 功能。
4. 使用 Render 提供的 HTTPS URL 验证 health、GET、POST、重试和 CORS。然后修改 GitHub Actions Variable 并重新发布 Pages。
5. 再做一次浏览器完整联调和数据库核对，保留 VPS 和备份作为回退。确认稳定后，由你单独决定是否停用/删除 VPS；本项目没有自动删除服务器的步骤。

字段依据 [Render Blueprint 说明](https://render.com/docs/blueprint-spec)。本轮只对配置作静态检查，没有在 Render 上创建服务或验证云端构建。

### 7.4 免费限制和课堂演示

Render Free 在连续 15 分钟没有入站流量后休眠，再请求通常需要约一分钟唤醒；工作区每月免费实例小时数有限，文件系统是临时的，不能把 PostgreSQL 数据写在 API 容器文件里。免费服务可能重启，带宽和构建分钟也有额度，运行前查看控制台；不要用定时访问去绕过休眠。[Render 免费服务限制](https://render.com/docs/free)

Neon Free 当前文档包含每项目每月 100 CU-hours、每项目 1GB PostgreSQL 存储与 5GB 公网流量等限制；计算在空闲约 5 分钟后自动挂起，额度耗尽可能暂停计算。套餐会变动，实际以开通当日控制台为准，不能把“免费”理解为无限服务或长期可用性承诺。[Neon 套餐说明](https://neon.com/docs/introduction/plans)

课堂演示提前访问健康检查并实际打开排行榜，让服务有时间唤醒；这只是演示前验证，不是循环保活。前端 12 秒超时会给出重试提示，保留同一战役载荷，服务准备好后再提交。若网络不稳定，展示本地三层运行与测试证据，不把冷启动失败说成已验证成功。
