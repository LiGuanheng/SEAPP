# 阶段计划与 Git 提交指南

## 原则

所有提交对应真实新增、修改和验证。由用户在阶段完成后自行提交与推送；AI 不代做提交，不伪造历史日期、提交频次或已完成功能。一次提交保持一个完整目的。

已知远端：`https://github.com/LiGuanheng/SEAPP.git`。本次已在本地初始化 `main` 分支并配置该远端，没有创建提交或推送。后续初始化前核对远端与本地目录；不强制推送、不覆盖已有历史。

## 阶段与建议提交

| 阶段 | 交付物 | 建议提交信息 |
| --- | --- | --- |
| 1 选题与文档初稿 | README、需求、设计、开发计划、协作决策 | `docs: define Last Light requirements and architecture` |
| 2 基础可玩版 | 工程、地图、探索、建设、五夜防守、强化、存档、验证 | `feat: add playable five-night survival prototype` |
| 3 任务书适配 | 对照任务书补充需求、设计及实现 | 在实际完成后确定 |
| 4 体验与测试 | 试玩反馈、数值、兼容性、缺陷修复 | 在实际完成后确定 |
| 5 部署交付 | 部署地址、使用说明、验收记录 | 在实际完成后确定 |

阶段 1 和 2 可在首次交付时分别提交，随后按具体任务继续。文档中的测试步骤不等于已经执行，实际结果记入测试说明。

## 2026-10-22 交付记录

阶段 1、2 已完成本地交付：需求/设计及协作记录；可运行五夜游戏；按用户补充加入丧尸分型、特殊武器、三位专家与三个守备防区；静态构建和手动发布工作流。实际验证为 18 项规则测试、5 项生产构建浏览器测试通过，详见测试说明。

当前没有 Git 提交或推送，也没有线上发布。请用户先试玩，然后按下面两笔提交保存阶段成果。大规模军团、首领战、多地图和更丰富美术属于下一阶段候选。

同日用户要求复查缺陷，已修复五类问题：能源耗尽/旧存档亮度、燃烧尾步计伤、战败特效残留、战斗面板刷新打断焦点/点击、能源显示取整。新增回归后 22 项规则测试、7 项生产浏览器测试及构建通过。详情见 [修复记录](07-bugfixes.md)。因本地尚无提交，修复包含在下述基础版待提交文件中，无需人为拆造第三笔历史。

## 首次提交（用户执行）

本次本地仓库已初始化；以下初始化命令仅供其他全新目录参考，不必在当前目录重复执行：

```bash
git init -b main
git remote add origin https://github.com/LiGuanheng/SEAPP.git
```

先提交文档：

```bash
git add README.md docs
git diff --cached --stat
git commit -m "docs: define Last Light requirements and architecture"
```

再提交基础游戏：

```bash
git add .gitignore package.json package-lock.json tsconfig.json index.html public src tests playwright.config.ts .github
git diff --cached --stat
git commit -m "feat: add playable five-night survival prototype"
git push -u origin main
```

`node_modules`、`dist`、测试截图与临时输出不提交。如果 Git 提示身份未配置，使用你自己的真实姓名/昵称与 GitHub 认可的邮箱配置。若推送提示远端已有历史，先检查并正常合并；不要用 `--force`。

## 每次迭代

先明确需求与验收 → 改文档或代码 → 执行相关测试 → 审查差异 → 用户提交与推送 → 记录反馈。必要时在 GitHub 建立对应 Issue，后续任务书的具体要求逐项追踪。
