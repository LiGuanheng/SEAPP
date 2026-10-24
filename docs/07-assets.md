# 素材来源与许可

核查日期：2026-10-22。使用免费、许可允许本项目的素材；全部随游戏本地加载。

| 素材 | 作者与来源 | 本地文件与用途 | 许可 |
| --- | --- | --- | --- |
| Roguelike Modern City | Kenney，[官方页](https://kenney.nl/assets/roguelike-modern-city) | assets/city/tilemap.png，原 packed 16×16 图集，组合地面、建筑、车与植被；运行时着色，不改原图 | CC0，原始 License.txt 保留 |
| Boy1 角色 | Curt，[发布页](https://opengameart.org/content/characters-zombies-and-weapons-oh-my) | assets/characters/survivor.png，原 120×160 PNG，四方向三帧动画；不使用包中 Crawl 武器/物件 | 作者于 2016-09-28 明确改为 CC0 |
| Zombie RPG sprites | Curt，[发布页](https://opengameart.org/content/zombie-rpg-sprites) | assets/characters/zombie.png 与 zombie-alt.png，Zombies.zip 内 1/2ZombieSpriteSheet.png，原始图片注册帧 | 作者于 2016-09-28 明确改为 CC0 |
| 枪械、补给箱、信标、路障、机枪塔、灯塔、军盔、子弹与效果 | 本项目原创 | assets/weapons 内十份 SVG 与场景 FX，统一像素轮廓和配色 | 原创美术资源按 CC0 提供，随附说明 |

[CC0 1.0 官方说明](https://creativecommons.org/publicdomain/zero/1.0/)。保留作者身份，不把第三方美术署名为 AI 创作。依赖许可证各自独立，Phaser 为 MIT。

Phaser 原始 MIT 许可已从所安装的 phaser 包完整复制到 `public/assets/licenses/phaser-MIT.txt`，随静态构建发布。CC0 来源记录位于同目录。

下载定位：城市官方 zip 的 Tilemap/tilemap_packed.png；人物发布页的 `https://opengameart.org/sites/default/files/Boy1.png`；丧尸 `https://opengameart.org/sites/default/files/Zombies.zip`。

下载档案与图集索引只存忽略的 artifacts/。最终使用文件及许可随 public/assets 提交，scripts/ 中记录实际 SHA-256 清单。

2026-10-23：阶段 2 复用角色四方向动画，运行时着色区分工程师/医护员/教官，没有改动第三方原始 PNG。新增 rifle.svg、supply.svg、beacon.svg 为本项目原创代码美术，未下载新第三方素材；项目美术许可与 SHA-256 清单同步更新。

阶段 3：新增 barricade.svg、turret.svg、lighthouse.svg、helmet.svg，均为原创像素网格 SVG，按同一 CC0 美术说明提供。基地地面、后勤站与植被复用 Kenney 图集；士兵复用 Curt 角色动画并叠加原创军盔和步枪，保留第三方署名。未添加未知许可素材，校验清单已更新。

阶段 4：三类感染者复用原 Curt 精灵并按比例/配色区分，没有加入新的第三方图像。迷雾、灯束、弹道、爆炸由 Phaser/Canvas 运行时绘制。SoundBus 中枪声/爆炸/波次低鸣是原创 Web Audio 合成，不使用外部音乐、音频包或网络流；不把第三方美术归为原创。静态素材文件与许可没有变更，原校验清单仍适用。

v0.6：战术地图、指南与目标指引为 Phaser 场内图形/文字，白天交互反馈为原创合成音色；城市外围改用已有 Kenney 草地内部瓦片。没有新增或修改第三方资源文件，素材校验清单无需重写。

v0.7：新增 axe.svg、bow.svg、arrow.svg、cannon.svg、cannon-barrel.svg、arrowtower.svg、wall.svg、desk.svg、bed.svg 九份原创像素网格 SVG，纳入 project-art.txt 的 CC0 说明与静态 SHA-256 清单。室内地面/外墙继续复用 Kenney 图集，人物继续复用 Curt 四方向动画，武器装备/配色区分角色。没有使用参考游戏的素材。

MusicTrack.ts 的日/夜旋律、和弦、低音节奏为本项目原创 Web Audio 编配，不含外部录音、歌曲或第三方音乐包。音频由代码合成，没有新的音频下载来源或隐藏 CDN 依赖。音量/听感仍需人工验收。


v0.8（2026-10-24）：新增 public/assets/enemies 下 queen.svg、axeman.svg、knight.svg、bird.svg、crow.svg、undead.svg、spiderling.svg 七份原创三帧图集，由 scripts/enemy-art.mjs 生成。Boss 每帧 96×96，随从每帧 64×64；使用像素轮廓和既有末日配色，不采用参考游戏的图像。原创图像纳入 project-art.txt 的 CC0 声明和 SHA-256 清单；第三方城市/人物/丧尸 PNG 未修改，保留原署名和许可。可运行 node scripts/enemy-art.mjs 与 node scripts/asset-manifest.mjs 复现文件并更新校验。

素材字节保留：.gitattributes 对 public/assets/** 设置 -text，避免 Git 在 Windows/Linux 检出时转换 SVG/许可文本换行并使 SHA-256 不一致。两份原许可证在暂存区恢复为工作区原件字节，内容与署名未改；提交前按暂存区逐项核对清单通过。


v0.9（2026-10-25）：新增 weapons/lantern.svg 为本项目原创像素网格提灯，纳入 project-art.txt 的 CC0 声明与 SHA-256 清单。序章复用现有城市、人物、四 Boss 和灯塔素材，移动雾层/灯束/字幕与叠化由 Phaser 绘制；探索雾层为运行时 CanvasTexture，无新外部图片/音乐来源，原第三方署名与 PNG 不变。
