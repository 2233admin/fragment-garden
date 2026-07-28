# 花园地图素材来源

本文只记录《碎片花园》实际采用的最小地图素材。项目运行不依赖本地参考素材目录，也不包含参考仓库的完整图集或压缩包。

原始素材仓库：

```text
https://github.com/Huu-Yuu/StardewValley-Assets
```

所有裁切由 `scripts/build-garden-map-assets.ps1` 完成。脚本使用 nearest-neighbor 放大 2 倍，只在开发者手动传入参考素材根目录时执行，不参与安装、测试或构建。

## `public/assets/garden/tiles/garden-terrain.png`

- 用途：低噪点春季草地、花坛泥土和少量石板
- 原始文件：
  - `Maps/spring_outdoorsTileSheet..png`，400×1264
  - `TerrainFeatures/Flooring..png`，256×256
- 原始裁切：
  - 草地：`(16,208,16,16)`、`(32,208,16,16)`、`(16,224,16,16)`、`(32,224,16,16)`
  - 石板：`(192,64,64,64)`
  - 泥土：`(64,64,64,64)`
- 缩放方式：nearest-neighbor 2×
- 最终尺寸：256×160
- 使用方式：32×32 Tile

## `public/assets/garden/tiles/garden-path.png`

- 用途：从南侧入口连到花园小屋、长椅和池塘的连续泥土小路
- 原始文件：无直接裁切；由项目脚本使用受限的泥土与踏石色板程序化绘制
- 原始裁切：不适用
- 生成方式：以 2px 像素块生成 16 个上下左右连接变体，透明草边保留不规则过渡
- 最终尺寸：128×128
- 使用方式：32×32 Tile；只改变园路视觉，不改变 Tiled 路径拓扑和导航

## `public/assets/garden/tiles/garden-water.png`

- 用途：自然池塘内部的静态水面
- 原始文件：`Maps/spring_beach..png`，272×496
- 原始裁切：`(0,0,128,16)`
- 缩放方式：nearest-neighbor 2×
- 最终尺寸：256×32
- 使用方式：32×32 Tile

## `public/assets/garden/tiles/garden-fence.png`

- 用途：南侧入口两边的短木围栏
- 原始文件：`LooseSprites/Fence1..png`，48×192
- 原始裁切：`(0,0,48,96)`
- 缩放方式：nearest-neighbor 2×
- 最终尺寸：96×192
- 使用方式：32×32 Tile

## `public/assets/garden/decor/garden-trees.png`

- 用途：庭院边界、树干和前景树冠
- 原始文件：
  - `TerrainFeatures/tree1_spring..png`，48×160
  - `TerrainFeatures/tree2_spring..png`，48×160
- 原始裁切：两张图片均为 `(0,0,48,96)`
- 缩放方式：nearest-neighbor 2×
- 最终尺寸：192×192
- 使用方式：32×32 Tile；每棵树占 3×6 Tile
- 备注：树冠与树干分层渲染，只有树干附近进入固定碰撞

## `public/assets/garden/decor/garden-bushes.png`

- 用途：树林、池塘和庭院边缘的中层灌木
- 原始文件：`TileSheets/bushes..png`，128×256
- 原始裁切：`(0,0,32,32)`、`(32,0,32,32)`
- 缩放方式：nearest-neighbor 2×
- 最终尺寸：128×64
- 使用方式：32×32 Tile；每株灌木占 2×2 Tile

## `public/assets/garden/decor/garden-details.png`

- 用途：长椅和少量石头
- 原始文件：
  - `Maps/springobjects..png`，384×544
  - `TileSheets/furniture..png`，512×1024
- 原始裁切：
  - 石头：`(0,448,32,32)`
  - 长椅：`(0,96,48,32)`
- 缩放方式：nearest-neighbor 2×
- 最终尺寸：160×64
- 使用方式：32×32 Tile

## `public/assets/garden/decor/garden-pond.png`

- 用途：右上池塘的连续自然岸边、树根和水边植物
- 原始文件：无直接裁切；由项目脚本按既有水面色板程序化生成
- 原始裁切：不适用
- 生成方式：2px 像素块绘制不规则岸边、水纹、芦苇、睡莲和少量非拟人水边小花
- 最终尺寸：160×160
- 使用方式：32×32 Tile；5×5 Tile 的透明岸边覆盖层
- 备注：外围采用不规则椭圆透明裁边，不再显示矩形岸块

## `public/assets/garden/decor/garden-centerpiece.png`

- 用途：顶部偏中央的“灵感花屋”视觉中心
- 原始文件：`Buildings/Shed..png`
- 原始裁切：`(0,0,112,128)`
- 缩放方式：保持 1× 像素，不插值；脚本补充少量常春藤与非拟人小花
- 最终尺寸：128×128
- 使用方式：32×32 Tile；4×4 Tile
- 备注：只作为环境装饰，本阶段没有点击功能

## `public/assets/garden/decor/garden-ground-details.png`

- 用途：花床边缘和庭院边界的低矮草簇
- 原始文件：`TerrainFeatures/grass..png`，66×120
- 原始裁切：春季首行的 `(0,0,16,16)`、`(16,0,16,16)`、`(32,0,16,16)`、`(48,0,16,16)`
- 缩放方式：nearest-neighbor 2×，并轻微收敛到春季暖绿色
- 最终尺寸：128×32
- 使用方式：32×32 Tile；只成组放在低层，不作为随机高杆作物散布

## `public/assets/garden/decor/garden-flowerbeds.png`

- 用途：两块主花床、林下花带、池塘花带和入口花带的连续轮廓与渐进花毯
- 原始文件：无直接裁切；由项目脚本使用受限的春季叶片、粉黄花和蓝紫花色板程序化生成
- 原始裁切：不适用
- 生成方式：以透明 32×32 单元生成基础地表、自然边缘和 2×2 连续花毯块；不使用成熟 crop 帧
- 最终尺寸：2688×32（84 个 32×32 Tile）
- 使用方式：逻辑 Zone 继续使用 2×2 花毯块；正式全局成长画面使用下方 960×640 低层叠图
- 备注：组合图案刻意避免成对亮点、圆形头部和头身轮廓；Slot 中心允许低矮花毯作为背景，interaction coordinate、主路、出生点和伙伴区域保持清空

## `public/assets/garden/decor/garden-hedges.png`

- 用途：花屋两侧和成熟花床边缘的连续中层绿篱
- 原始文件：无直接裁切；由项目脚本程序化生成连续叶片色带
- 原始裁切：不适用
- 生成方式：2px 像素块、受限绿色色板
- 最终尺寸：128×32
- 使用方式：32×32 Tile；成对或成段连接，不覆盖内容植物和交互安全区

## `public/assets/garden/decor/garden-vines.png`

- 用途：花屋周围和最高成熟阶段的少量低矮藤叶过渡
- 原始文件：`Maps/spring_outdoorsTileSheet..png`，400×1264
- 原始裁切：`(272,640,16,16)`、`(288,640,16,16)`、`(272,656,16,16)`、`(288,656,16,16)`
- 缩放方式：nearest-neighbor 2×
- 最终尺寸：128×32
- 使用方式：32×32 Tile；只用于连续边缘，不作为独立角色状物件

## `garden-growth-base.png` 与 `garden-growth-stage1.png`～`stage4.png`

- 用途：Stage 0 的完整基础庭院，以及 Stage 1～4 逐步填充的主花床、池塘花带、长椅角落和入口花带
- 原始文件：无直接裁切；由项目脚本使用与最小花坛图集相同的受限植物色板程序化生成
- 原始裁切：不适用
- 生成方式：960×640 透明低层叠图；花色按小区域成组，叶毯形成连续不规则的“面”
- 最终尺寸：每张 960×640
- 使用方式：基础叠图始终显示；四张成长叠图由 `GardenGrowthSystem` 依次控制显隐
- 安全边界：生成时读取 `garden-map.json`，自动清空道路、水面、中高层装饰、碰撞格，以及 36 个 interaction point、玩家出生点和伙伴位置周围的 20×20 区域
- 备注：Tiled 的全局成长 Layer 继续作为稳定数据契约和 fallback；正式视觉由这些全图低层叠图组织，避免重复 32px 图标造成散点噪声

## `public/assets/garden/plants/content-plants.png`

- 用途：真实卡片对应的三族内容植物；每族包含 `seedling`、`growing`、`budding`、`blooming` 与 `permanent_bloom`
- 原始文件：`TileSheets/crops..png`，256×672
- 暖阳花裁切：序列起点 `(0,480)`；使用帧 `2,3,4,5`，盛开阶段单独放大花冠，永久盛开组合为一朵主花与一朵较低侧花
- 蓝紫绒球花裁切：序列起点 `(128,416)`；花冠使用帧 `6` 并以受限蓝紫色板合成，成熟阶段补入叶片基座，永久盛开组成高低错落的三簇花冠
- 粉白星花裁切：序列起点 `(128,448)`；茎叶使用帧 `2,3,4`，花冠使用帧 `6` 并以受限粉白色板合成，永久盛开组成不对称开花灌木
- 原始单帧：16×32
- 缩放方式：按阶段使用 nearest-neighbor 2×～5×裁切重组，所有组件保持整数倍像素，不使用平滑插值
- 最终尺寸：320×240；每帧 64×80，5 列 × 3 行
- 使用方式：Phaser spritesheet；花种和成长阶段的 frame 映射集中在 `game/config/content-plant-species.ts`
- 备注：成熟作物仍不得作为非交互环境散点；三个永久盛开结构分别采用主花加侧花、多簇花冠和开花灌木，不使用统一双花模板

## `public/assets/garden/plants/content-plant-shadow.png`

- 用途：内容植物脚底的克制像素阴影
- 原始文件：无直接裁切；由 `scripts/build-content-plant-assets.ps1` 使用受限透明色块生成
- 生成方式：无模糊、无平滑插值
- 最终尺寸：64×16；各花种通过纯配置 `shadowScale` 做克制宽度差异

### 内容植物候选拒绝记录

- 拒绝 `crops..png (0,576,128,32)`：更像低矮结果作物，与环境花毯的视觉优先级接近
- 拒绝 `crops..png (128,320,128,32)`：果实灌木作物感较强，三个阶段之间的花苞语义不清
- 拒绝 `crops..png (128,608,128,32)`：紫色分叉轮廓具有角色和怪物联想风险
- 拒绝将 `crops..png (128,416,128,32)` 与 `(128,448,128,32)` 的花冠帧单独使用：脱离茎叶会像悬浮图标；正式图集将花冠与原序列茎叶合成

## 已拒绝的环境作物帧

旧 `garden-growth.png` 已删除。以下来自 `TileSheets/crops..png` 的成熟单株裁切不再进入环境层：

```text
(224,192,16,32)
(224,224,16,32)
(80,480,16,32)
(224,320,16,32)
(208,608,16,32)
(96,256,16,32)
(224,576,16,32)
(96,640,16,32)
```

这些单株在 2× 放大并独立散布后会形成高对比圆形中心、头身轮廓或角色感，不适合作为非交互环境植物。正式环境图集只使用草簇、花毯、叶丛、绿篱和藤叶。

## `public/assets/garden/characters/player.png`

- 用途：花园主人的四方向 idle / walk 正式像素角色。
- 原始素材：`Characters/Leah..png`（64×384）。
- 原始裁切：顶部 `(0,0,64,128)`，包含 4×4 个 16×32 方向帧；行顺序为下、右、上、左。
- 缩放方式：nearest-neighbor 2×。
- 最终尺寸：128×256；Phaser 单帧 32×64。
- 使用边界：只保留移动所需的 16 帧，不复制完整 NPC 图集；运行时不读取参考素材目录。

## `public/assets/garden/characters/companion-cat.png`

- 用途：固定猫伙伴的轻微正面待机动画。
- 原始素材：`Animals/cat..png`（128×256）。
- 原始裁切：第五个 32px 行；每帧从 `(frameX+4,134,24,26)` 裁切。
- 缩放方式：nearest-neighbor 2×。
- 最终尺寸：192×52；Phaser 单帧 48×52。
- 使用边界：伙伴保持固定位置，不接入自由寻路。

## `public/assets/garden/characters/companion-dog.png`

- 用途：与猫共用功能逻辑的固定狗伙伴待机动画。
- 原始素材：`Animals/dog..png`（128×288）。
- 原始裁切：第五个 32px 行；每帧从 `(frameX+4,134,24,26)` 裁切。
- 缩放方式：nearest-neighbor 2×。
- 最终尺寸：192×52；Phaser 单帧 48×52。
- 使用边界：猫狗只有外观不同，点击事件和 React 功能链路完全一致。

## `public/assets/garden/characters/entity-shadow.png`

- 用途：玩家和伙伴脚底的克制像素阴影。
- 原始素材：无直接裁切；由 `scripts/build-garden-character-assets.ps1` 程序化生成。
- 生成方式：48×12 透明 PNG，使用硬边椭圆像素，无模糊和插值。

## 使用边界

- 未复制原始 `.rar`、完整 Tileset、角色、NPC、季节资源或 UI 图集
- 未将参考仓库设为 submodule
- 地图运行只读取 `public/assets/garden` 中的最小生成资源
- 这些参考素材只用于当前个人、非商业作品集验证
- 项目外作品集截图不进入 Git，也不作为可再分发素材包
- 公开分发或商业化前需要重新确认授权，并优先替换为原创或明确授权资源
- 视觉层、运行边界和后续替换计划见 [`GARDEN_VISUAL_SYSTEM.md`](./GARDEN_VISUAL_SYSTEM.md)
