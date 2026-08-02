# 记忆星空系统

本文记录碎片宇宙 V1 的星空表现层、交互合同与数据边界。

## 数据快照

`queryStarMapSnapshot` 从非 deleted Fragment 和 FragmentNote 生成 `StarMapSnapshot`。每颗内容星使用 `fragmentId` 作为 `starId`。位置、颜色、亮度与尺寸均通过纯函数派生，不写入数据库。环境星使用固定种子生成，不读取用户内容。

## 稳定坐标

坐标输入只有 `fragmentId` 与 `layoutVersion`。哈希结果映射到受限三维空间，并避开中心不可读区域。相同 Fragment 在刷新、导出和恢复后得到相同位置。

禁止使用刷新时的 `Math.random()`、AI、语义或内容正文决定坐标。

## 亮度与转速

FragmentNote 数量映射为有上限的亮度和轻微尺寸变化。第一次追加最明显，后续增长逐渐收敛。编辑已有 Note 不增加计数。

内容星数量映射为有上限的自动旋转速度：

```text
speed = min + (max - min) × (1 - exp(-count / 32))
```

hover 时减速；打开摘要或详情、操作相机时暂停；页面 hidden 时停止时间累计；reduced motion 下自动运动为零。

## 渲染结构

```text
Scene
└─ starfieldRoot
   ├─ farField Points
   ├─ midField Points
   └─ contentField Points + ShaderMaterial

EffectComposer
└─ RenderPass → UnrealBloomPass → OutputPass
```

环境星与内容星都使用批量 Points。内容星 shader 绘制白色核心、彩色内盘、halo 和外圈微光。renderer 与 composer 的 DPR 均限制为 2。

## 命中与详情

- 只检测内容星。
- pointer move 与 click 时计算，不在每帧 raycast。
- 使用 18 CSS px 命中容差。
- 指针移动超过阈值视为拖拽。
- runtime 只返回 `fragmentId`，React 二次确认记录存在。
- 首次点击打开星旁紧凑摘要；展开后使用 modal 完整详情。
- 同一次 Canvas 点击原子区分星星与空白：点击其他星切换，点击空白关闭摘要。

## 创建交接

文字成功保存后，runtime 暂时隐藏刚写入快照的目标星。保存按钮形变为星并飞向 `getStarScreenPosition(fragmentId)` 返回的真实目标坐标；完成时解除隐藏，该真实内容星立即可点击。

链接和图片在 Provider 处理中使用黑洞等待态。任务转入后台后使用同一个状态组件。只有正式 Fragment 创建成功后才进行落星交接；失败只保留任务。

## 生命周期

每次挂载只创建一个 Canvas、一个 RAF 与一组监听。销毁时取消 RAF、断开 ResizeObserver、移除 pointer/visibility/media-query 监听，并 dispose controls、passes、composer、geometry、material、texture、render target 和 renderer，随后主动释放 WebGL context 并移除 Canvas。

初始化失败必须清理半初始化资源。`destroy()` 可重复调用。

## reduced motion

启用后：

- 自动旋转停止；
- 星星 idle 闪烁与出现/增亮脉冲停止；
- 保存和详情形变改为静态状态切换；
- OrbitControls 惯性关闭；
- 用户主动拖拽和缩放仍可用；
- 静态亮度、选中和错误状态保持可辨认。

## 测试重点

- 0、少量与大量内容星；
- 坐标稳定、亮度上限、转速上限；
- 点击正确 Fragment 与空白关闭；
- compact/expanded 往返无闪烁；
- 创建动画落到真实星；
- 前台与后台处理任务同步；
- Strict Mode 单 Canvas；
- resize、visibility、reduced motion 与 destroy；
- 备份恢复后位置和内容不变。
