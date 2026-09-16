---
name: character-sprite-sheets
description: 为一个角色生成网页挂件所需的 2 张精灵图——5×5 鼠标跟随姿态图 + 3×3 点击表情图。含可直接复制的 prompt 模板、网格定义、几何约束与自检清单。
---

# 角色精灵图生成（2 张）

给网页做一个会跟着鼠标转头、戳一下会出表情的小伙伴，需要**两张**正方形图集。

| 文件 | 网格 | 用途 | 格子数 |
| --- | --- | --- | --- |
| `directions-25` | 5 × 5 | 鼠标跟随：横向 5 档转向 × 纵向 5 档俯仰 | 25 |
| `reactions` | 3 × 3 | 点击反馈：9 种表情 | 9 |

## 怎么用这份文件

1. 准备一张角色参考图（或一段足够具体的文字描述）。
2. 复制下面对应的 **prompt 模板**，把 `<角色描述>` 换成你的角色。
3. 把参考图 + prompt 一起交给你的图片生成工具（ChatGPT / Claude / Gemini / Midjourney / SD 等，取决于你手上的额度和偏好）。
4. 用文末的**自检清单**逐格检查；不合格就带着问题重新生成。
5. 两张图都通过后，到 **Buddy Lab** 页面上传验证：https://skentsun.github.io/buddy-lab/

本文件只提供规则与 prompt，不含模型额度。

## 输出规格（两张图都要满足）

- **正方形画布**，推荐 1536 × 1536（不小于 1024，不要超过 2048）。
- 均匀网格：5×5 的那张每格 307px（1536/5），3×3 的那张每格 512px。
- **透明背景**最佳；白底也可以（用页面上传前自行抠图，或交给工具处理）。
- 画面里**不能**有网格线、边框、文字、编号、水印、场景、道具或其它角色。
- 每个格子内容**独立完整**，不许跨到邻格。
- 两张图的画风、描边、配色、光照、身体尺度必须一致——它们看起来得是同一个角色、同一个镜头距离。

## 方向图网格：5 列 × 5 行

行优先编号 0–24（第 1 行 0–4，第 2 行 5–9 …… 第 5 行 20–24），**正中间第 12 格是平视正面**。

|  | 列 1 | 列 2 | 列 3 | 列 4 | 列 5 |
| --- | --- | --- | --- | --- | --- |
| **含义** | 朝画面左侧 90° | 左前 45° | 正面 0° | 右前 45° | 朝画面右侧 90° |

|  | 行 1 | 行 2 | 行 3 | 行 4 | 行 5 |
| --- | --- | --- | --- | --- | --- |
| **含义** | 明显抬头 +30° | 微抬头 +15° | 平视 0° | 微低头 −15° | 明显低头 −30° |

- 每一格 = 该行的俯仰 × 该列的转向。
- 左右一律以**观看者画面**为准（角色朝画面左边 = 列 1）。
- 25 格保持**同一个中性友好表情**；只用头部、视线、必要的颈部转动表达角度。
- 不要靠换嘴型或换情绪来冒充俯仰，也不要把 5 行画成 5 种随机表情。
- 躯干、肩膀、服装尽量固定，不新增道具。

## 表情图网格：3 列 × 3 行

全部**平视正面**，行优先编号 0–8。顺序必须与下表一致（播放器按这个索引取图）：

| 编号 | 表情 | 额外装饰 |
| --- | --- | --- |
| 0 | 眯眼笑 | 无 |
| 1 | 开心 | 头顶红色爱心 |
| 2 | 兴奋 | 头顶黄色星星 |
| 3 | 惊讶 | 大眼、O 型嘴；无装饰 |
| 4 | 星星眼 | 瞳孔为黄色四角星 |
| 5 | 害羞 | 闭眼微笑 + 粉色腮红 |
| 6 | 困倦 | 闭眼张嘴 + 头顶蓝色 Zzz |
| 7 | 晕眩 | 螺旋眼、波浪嘴 |
| 8 | 大笑 | 眯眼张嘴；无装饰 |

只在指定格子加装饰符号，别到处加。

## Prompt 模板

英文 prompt 对多数图片模型更稳；如果用中文工具，把同一份意思用中文表达即可。把 `<CHARACTER>` 换成你的角色描述（外貌、颜色、服装、画风），两张图用**完全相同**的这一段。

### 图 1 · 方向图（5×5）

```
Generate ONE square image (1536x1536) containing a 5 columns x 5 rows grid of
the SAME character, 25 cells total, evenly spaced, transparent background.

Character (identical in every cell): <CHARACTER>

Grid mapping:
- Columns, left to right: facing screen-left 90°, left-front 45°, front 0°,
  right-front 45°, facing screen-right 90°.
- Rows, top to bottom: looking up 30°, looking up 15°, level 0°,
  looking down 15°, looking down 30°.
- Centre cell (row 3, column 3) is a neutral front-facing portrait.

Rules:
- Only the head, gaze and minimal neck rotation change. Keep torso, shoulders,
  outfit and scale identical in all 25 cells.
- Same neutral friendly expression everywhere. Do NOT vary emotion, mouth
  shape or props to fake the tilt.
- Portrait framing, head and shoulders, character fully inside its own cell.
- Body bottom sits at about 90% of each cell's height; leave headroom at top.
- No grid lines, no borders, no text, no numbers, no background scene,
  no other characters, no props.
- One art style, one lighting direction, one line weight throughout.
```

### 图 2 · 表情图（3×3）

```
Generate ONE square image (1536x1536) containing a 3 columns x 3 rows grid of
the SAME character, 9 cells total, evenly spaced, transparent background.
All cells are level front-facing portraits, same scale and framing as each other.

Character (identical in every cell): <CHARACTER>

Row 1: 0 = closed-eye smile (no symbol), 1 = happy with a red heart above the
head, 2 = excited with a yellow star above the head.
Row 2: 3 = surprised, wide eyes and O-shaped mouth (no symbol), 4 = star eyes
with yellow four-point pupils, 5 = shy, closed-eye smile with pink blush lines.
Row 3: 6 = sleepy, closed eyes and open mouth with blue "Zzz" above the head,
7 = dizzy with spiral eyes and a wavy mouth, 8 = laughing, squinting eyes and
open mouth (no symbol).

Rules:
- Add the listed symbol only in its own cell, nowhere else.
- Same head position, same scale, same framing in all 9 cells.
- Body bottom sits at about 90% of each cell's height; leave headroom at top.
- No grid lines, no borders, no text, no numbers, no background scene,
  no other characters.
- One art style, one lighting direction, one line weight throughout.
```

> 两张图**分开两次生成**，不要一次要两张。生成第二张时，可以把第一张作为「版式参考」附上，但角色身份始终以你的参考图为准。

## 几何约束（决定能不能直接用）

- 统一的是**身体尺度与身体底部基线**，不是含装饰的外接框。爱心、星星、耳朵、呆毛不能把身体挤小或整体下移。
- 身体底部落在格子高度约 **90%** 处；所有可见内容距格边至少 5%；头顶留白给装饰。
- **按身体中心对齐**，不是按爱心/尾巴的外接框居中。
- 两张图格子尺寸不同，但身体占格子的比例要一致（否则切换时角色忽大忽小）。

## 自检清单

逐格过一遍，任何一条不过就该重生成：

- [ ] 身份一致：25 格 / 9 格看起来都是同一个角色，没有变形或换脸。
- [ ] 角度成梯度：转向和俯仰是平滑变化，不是随机摆pose。
- [ ] 表情顺序：与上面 0–8 的表一一对应，没有错位。
- [ ] 装饰完整：爱心、星星、Zzz 没被格边切掉。
- [ ] 身体尺度一致：各格大小一致，没有某格明显缩水。
- [ ] 底部基线一致：所有格子的脚底在同一水平线。
- [ ] 无串格：没有内容越界到邻格（相邻帧粘在一起会导致对齐失败）。
- [ ] 背景干净：无网格线、文字、水印、场景。

提示词无法保证精确网格——**必须真的看图检查**。单格小问题可以整张重生成；一轮修正后仍不合格，就换更简单的角色描述或减少装饰再试。

## 交付与后处理

- 交付方向图与表情图各一张，**保留原稿**。
- 网页用**透明静态图**（PNG 或 WebP）。白底稿需要抠图：用边缘泛洪/前景分割，**不要**把所有白色像素透明化——那会连白毛、眼白、白衣服一起挖掉。
- 转 WebP 时透明通道无损、颜色质量 85 起测；压缩后重新检查透明区域和切框。
- 没有可靠抠图工具时，就交付白底版本并说明「待抠图」，不要声称已经透明。

## 边界说明

这套素材是**由指针位置/点击选择状态**的静态图集，不按 0→24 顺序播放。APNG、GIF、逐帧视频都不能直接替代；也不要指望栅格图能自动变成矢量 Lottie。
