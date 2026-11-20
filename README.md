# Note Block Studio — 网页重制版

用 **HTML + 原生 JavaScript**（无框架、无构建步骤）重制的 [Minecraft Note Block Studio](https://github.com/OpenNBS/NoteBlockStudio)。
界面布局、操作方式、`.nbs` 文件格式都对齐桌面版 3.11.0，全部绘制逻辑与数据操作是照着 GML 源码（`control_draw()`、`open_song_nbs()`、`save_song()`、`selection_*`、`macro_*` 等）逐段移植的。

> 作者：ZeroRaltal · 以 MIT License 开源

## 在线使用

直接用浏览器打开仓库根目录的单文件版即可，无需服务器、无需安装：

- **<https://zero-raltal.github.io/NBS-On-Web/>** —— 单文件压缩版（`.min.html` 内容，HTML/CSS/JS 全部内联并压缩，所有素材以 LZ77 + base91 编码内嵌，打开即用）

也可以把根目录的 `index.html` 下载到本地双击打开，功能完全一致。

## 从源码运行

浏览器出于安全限制不能直接读本地文件，需要用一个静态服务器打开：

```bash
cd src
python -m http.server 8123
# 然后访问 http://localhost:8123/index.html
```

用 Chrome / Edge / Firefox 打开即可，无需安装。

## 目录

```
index.html              单文件压缩版（全部内联，直接打开即用）
src/index.html          开发版入口（按需加载 src/js/*.js）
src/css/style.css       样式
src/js/core.js          画布/输入/文本/图元
src/js/theme.js         主题与配色（经典 + 暗黑 + 复古 + Fluent）
src/js/assets.js        图集与音色载入
src/js/song.js          歌曲数据模型与增删改（对应 add_block 等）
src/js/history.js       撤销栈
src/js/selection.js     选区（对应 selection_*）
src/js/macros.js        宏（对应 macro_*）
src/js/audio.js         Web Audio 播放引擎
src/js/nbs.js           .nbs / .nbp 读写
src/js/midi.js          MIDI 解析与导入
src/js/schematic.js     schematic / 数据包导出（对应 export_schematic_*）
src/js/ui.js            控件库、菜单、消息框
src/js/editor.js        主编辑器绘制与交互（对应 control_draw）
src/js/dialogs.js       菜单动作与各类窗口
src/js/main.js          启动与首选项持久化
src/assets/atlas        从原项目提取的精灵图集（运行时使用）
src/assets/sounds       原版音色（运行时使用）
```

> 图集 `src/assets/atlas/` 由原项目 `sprites/` 下的逐帧 PNG 打包而成，已是运行时所需的最终形态，因此原始逐帧素材未纳入本仓库。需要重新生成图集时，从 [OpenNBS/NoteBlockStudio](https://github.com/OpenNBS/NoteBlockStudio) 取 `sprites/` 即可。

## 已实现

**界面（四套主题，对齐 NBS 3.11.0）**
- Fluent / 暗黑 / 复古 / 经典四套主题，配色与绘制细节逐项对照 GML
- 264px 图层面板 / 52px 顶栏 / 32px 网格单元 / 底部钢琴键盘，坐标与 `control_draw` 完全一致
- 菜单栏（文件/编辑/设置/帮助）、工具栏全部图标、可展开音色盒、主音量、兼容性指示（完全兼容 / 仅限数据包 / 仅限资源包）
- 时间轴：时间刻度 + 小节格号 + 播放标记拖动 + 区间（section）标记
- 状态栏：音色 / 音 / 音量 / 声道 / 音高 / 位置 / 层 / 已选择 / 悬停方块信息
- 原生位图素材直接取自原项目（方块、琴键、图标、时间轴），像素级还原

**编辑**
- 左键放置/修改、右键删除、右键拖拽擦除、中键吸管、Ctrl+拖拽追加选区、拖拽移动选区
- 选区为「悬浮」语义（选中时方块从歌曲抬起），支持全选/反选/扩展/压缩/复制/剪切/粘贴/删除
- 分页式右键编辑菜单（60 项，对照 `control_draw.gml:606-690`）：选择右侧/左侧所有、按音色选择、更改音色子菜单、扩展/压缩选区、15 个宏子菜单
- 撤销 / 重做（300 步）
- 20 个宏：Tremolo / Stereo / Arpeggio / Portamento / Vibrato / Stagger / Chorus / Volume LFO / 淡入 / 淡出 / 替换音 / 设定音量·声道·音高 / 重置属性 / 转换超范围音符
- 图层：命名、音量、声道、静音、独奏、选择整层、增删、上移下移
- 钢琴：鼠标弹奏、键盘键位（1 Q 2 W 3 E R 5 T 6 Y U 8 I 9 O 0 P Z S X D C V G）、右键改键位、滚动换八度、超出范围高亮、音名/键号显示

**播放**
- Web Audio 播放，音高公式与 `play_sound` 一致：`0.5 × 2^((key + ins.key + pit/100 − 78)/12)`
- 音量 / 声道（立体声）/ 微分音高、层音量与层声道叠加、静音与独奏
- 速度（t/s 与 BPM 双显示，可拖拽/输入）、节拍器、循环、录制、快进快退
- 进度跟随三模式：按页 / 按刻 / 按帧（按帧为亚格连续滚动）

**文件**
- `.nbs` 读取（v0–v5，含自定义音色、层名、层锁定/音量/声道）与写出（可选 v1–v5）
- `.nbp` 片段导入导出、最近歌曲（浏览器本地缓存，可直接重新打开）
- MIDI 导入（SMF 0/1，轨道勾选、音色指配、力度映射、PPQ 换算、BPM→t/s 保留两位小数）
- **schematic（.schem）导出**：直轨/环线/分支布局、中继器充能时序、矿车轨道
- **数据包（datapack）导出**：逐音符函数文件、`pack.mcmeta`、版本选择
- 拖放文件打开

**对话框**：歌曲信息、歌曲属性、歌曲数据、音色设置（可上传自定义音频作为音色）、首选项（5 个分页：通用/界面/外观/访问/播放，与原版同构）、保存选项、MIDI 导入、速度测量器、关于，以及全部宏参数窗口

**持久化**：首选项全部设置项（含界面缩放）保存到浏览器本地；歌曲自动恢复

**MIDI 导入规则**（对齐 `import_midi.gml` + `midi_instruments.gml` 映射表，见 `src/js/midi-map.js`）：按 **MIDI 通道** 分组、每通道占据「最大同时发声数」高度的连续层带、`一格 = (division/4)/(precision+1)` 个 tick、
音高 = note − 21、速度 = bpm×(precision+1)/15（保留两位小数）、打击乐按 GM 鼓组映射到内置音色、可按音色命名图层

## 交互细节（已对齐原版）

- 顶部菜单：**点一下展开、再点收起**，点菜单外或按 Esc 关闭；菜单展开期间下层控件完全不响应（不会误拖速度滑块）
- 右键：空白处 / 选区上单击弹出编辑菜单；在方块上单击删除；按住拖动连续擦除；在选区上拖动从选区擦除
- 滚动条：按下后指针移出滑轨仍继续拖动；点轨道空白处跳到该位置；滚动范围可真正到达末尾
- 只有真正的对话框才画遮罩/锁交互；拖标记、拖区间、拉音量条等内部状态不会被误当成弹窗（原版 `window` 值混用，这里用 `isDialogWindow()` 区分）
- 关闭菜单/消息框的那一次点击会被吞掉（`swallowPress`，含松开那一帧），不会穿透到画布放置音符
- 快进/快退是「按住生效」，方向键松开即归零
- 播放标记的三角与竖线按源码同 x 绘制（`spr_marker` 帧 0 + 帧 1 纵向拉伸）
- 琴键按下时额外叠一层加法黄色高亮：GameMaker 的 `color` 参数是乘法混合，深色黑键几乎看不出变化，这一处是为可读性做的有意增强
- 鼠标停在「可按住上下拖动改数值」的输入框上时显示上下双箭头（`ns-resize`），与原版一致
- 画布上鼠标为普通箭头（不是十字准星）

## 与源码的有意差异

移植过程中发现以下几处源码行为在浏览器里会造成明显问题，做了最小改动并在代码里就地注释说明：

1. **`draw_sprite` 越界帧**：GameMaker 对超出 `image_number` 的子图序号取模回绕（不是"不画"、也不是夹取）。`core.js` 的 `frame()` 按取模实现，否则导出对话框的宣传图会整块消失。
2. **播放标记竖线叠放次序**：源码先画三角后画竖线，线正好压在三角正中。这里改成先画线后画三角，几何位置完全一致，只是避免线在三角上切一刀。
3. **`note_offset` 取样源**：源码用 `frac(marker_pos)`，前提是 `starta` 与 `marker_pos` 整数相位一致。浏览器里 `starta` 会被 `median` 夹取、累积浮点误差，相位一旦错开，按帧跟随会出现「每前进一刻画面被拉回一格」。改为 `frac(starta)` 并用 `floor` 取整（而非四舍五入），保证 `note_offset ∈ [0,31]`、进位只由 `floor(starta)` 承担。
4. **时间轴基准**：按刻/按页模式用 `floor(starta)`、按帧模式用连续 `starta`，且都不再额外减 `note_offset`（`xx` 式已含小数），否则小数被计算两次。

## 已知缺口

- MIDI 输入设备（Web MIDI）未接入，只支持文件导入。
- 音频导出（MP3/WAV 渲染）未实现。
- schematic / 数据包导出已实现，但仅在 NBT 结构与 zip CRC 层面验证过，**未在真实 Minecraft 中加载测试**。

## 单文件版是怎么做的

根目录的 `index.html` 是 `src/` 的完整内联版本：

- 所有 JS / CSS 合并进一个 `<script>` / `<style>`
- `src/assets/` 下的图集与音色（88 个文件）先用 **LZ77** 压缩，再用 **base91** 编码成纯文本嵌入
- 页面内置 LZ77 解码器与 base91 解码器，并在 `fetch` 层做了内存文件系统垫片，所以 `assets/...` 路径照常可用、无需改动业务代码
- base91 字母表刻意排除了 `<`，因此数据块可以放进裸 `<script>` 而不需要任何转义

原始素材 425 KB → LZ77 后 380 KB（89.3%）→ base91 后 466 K 字符；整个单文件 716 KB。

## 许可

界面素材与原始实现来自 [OpenNBS/NoteBlockStudio](https://github.com/OpenNBS/NoteBlockStudio)（MIT License © 2024 OpenNBS）。
本项目同样以 MIT License 开源。
