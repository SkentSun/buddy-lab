# 小伴 / Buddy Lab

让你的页面住进一个小伙伴。

浏览器端吉祥物挂件：一个会跟着鼠标转头的小家伙，戳一下会出表情，点一下就换角色。

**在线体验**：https://skentsun.github.io/buddy-lab/

原生 HTML / CSS / JavaScript，零依赖，无构建步骤。

## 跑起来

ES 模块不能用 `file://` 直接打开，需要本地服务：

```sh
python3 serve.py        # 多线程 + no-store
```

然后打开 http://127.0.0.1:8793/?mascot=cat

> 别用 `python3 -m http.server`：它是单线程的，一个卡住的请求会堵死后面所有请求，素材加载挂起时整个页面会静止不动。

## 12 个角色

| id | 角色 | id | 角色 |
| --- | --- | --- | --- |
| `cat` | 小猫（默认） | `ragdoll` | 布偶猫 |
| `shinchan` | 小新 | `kirby` | 卡比 |
| `hamster` | 仓鼠 | `shiba` | 柴犬 |
| `cheerleader` | 啦啦队女孩 | `capybara` | 水豚 |
| `hanfu` | 汉服小女孩 | `paimon` | 派蒙 |
| `coder` | 社恐程序员 | `magicalgirl` | 魔法少女 |

换角色改 URL 参数即可：`?mascot=kirby`。页面下方的头像矩阵（4 列 × 3 行）也能直接点——**不刷新页面**，新素材测量完成后主舞台一次性换图；地址栏用 `history.pushState` 同步，前进 / 后退同样走这条路径。

每个头像都是该角色自己的 5×5 姿态图实时渲染，各自按自己的位置算朝向，所以鼠标移动时小头像跟着转头，和主舞台同频。

## 加一个新角色

1. 用 `tools/cutout.py` 把白底 PNG 抠成透明底 WebP（1536px）：
   ```sh
   python3 tools/cutout.py          # 全部
   python3 tools/cutout.py 仓鼠     # 只处理名字含"仓鼠"的
   ```
2. 在 `mascot.js` 顶部的 `characters` 里加一行：
   ```js
   { id: 'hamster', name: '仓鼠', directions: 'assets/characters/hamster-directions-25.webp', reactions: 'assets/characters/hamster-reactions.webp' },
   ```

`id` 就是 URL 参数，`directions` 是 5×5 姿态图，`reactions` 是 3×3 表情图。网格自动排布，不用改 CSS。

头像尺寸不用手调：`sprite-alignment.js` 的 `avatarFrames()` 按**正面姿态**归一化（`AVATAR_TARGET`，当前 0.50），12 个角色视觉大小自动一致。

## 目录

```
index.html              页面与精灵图样式
mascot.js               角色表、朝向计算、点击时序、无刷新切换
sprite-alignment.js     素材测量、统一缩放 / 统一裁切
upload.js               自定义素材上传
alignment-check.html    逐帧对齐检查页
serve.py                本地服务
assets/characters/      12 角色 × 2 张（directions-25 / reactions）
assets/legacy/          早期宇航员素材，无自定义素材时的兜底
assets/originals/       PNG 原稿，本地留底，不入库
assets/archive/         已下架但保留的素材
media/                  演示录屏
tools/                  离线脚本（抠图、组静态站、校验、录屏）
```

## 素材对齐

原始图集不能假定每格内容已对齐——实测行距与等分格子有约 10px 偏差，直接按格切会串入相邻帧（第二行头顶的黑线就是上一行脚底的描边）。

`sprite-alignment.js` 按**一套素材一套参数**处理，不逐帧找边界：

- **统一缩放**：以「肩宽 ÷ 格子」为基准，每张图一个缩放值，切换网格或出表情时角色大小不变。
- **统一裁切**：由最高最宽的一帧（含悬浮的爱心、星星）算出所需空间，再用行列实际间距封顶，全图共用一个 inset。
- **每帧锚点**：肩宽中心对齐 50%，脚底对齐 93%——唯一逐帧的量，只影响位置。

换素材时变的是测量值，规则不动。打开 `alignment-check.html` 可逐帧查看（红线是脚底基线，虚线是裁切范围）。

## 交互

- **跟随**：鼠标位置映射到 5×5 朝向（或 3×3），角色一直看着光标。
- **点击**：0ms 闭眼 → 120ms 爱心 / 闪光 / 开心轮换 → 560ms 恢复朝向，同时播放 420ms 挤压回弹。
- **兜底**：每张素材独立测量，单张 8 秒超时，失败只影响自己；没对齐时回退按格切图，鼠标照样跟随。
- 尊重系统的「减少动态效果」设置：关闭挤压动画，保留表情反馈。

## License

[MIT](LICENSE) · By Skent (@SkentSun)

角色素材为 AI 生成，仅用于本项目演示。
