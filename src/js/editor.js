/* =========================================================================
   editor.js — 主编辑器：绘制与交互
   严格对照 GML 的 control_draw()：
     图层面板 264px / 顶栏 52px / 网格 32px 单元 / 底部钢琴
   ========================================================================= */
'use strict';

/* 窗口 ID（对应 macros.gml 的 w_*） */
/* 全屏"返回"按钮的几何（对照 control_draw.gml 右下角返回按钮）。
   【必须定义在文件顶部】editorFrame 要在 handleGridInput 之前用它们拦按下，
   而 editorFrame 在文件前部；放后面会撞上 const 的暂时性死区（ReferenceError）。 */
const FS_EXIT_SIZE = 48;      // 按钮视觉尺寸
const FS_EXIT_MARGIN = 10;    // 距屏幕右下角的边距
const FS_EXIT_PAD = 4;        // 命中区在视觉尺寸外再扩的容差

const W_MENU = 100, W_RELEASE = 29, W_INSBOX = 42, W_DRAGVOL = 27, W_DRAGSTEREO = 41,
  W_DRAGSECTION_END = 26, W_DRAGSECTION_START = 25, W_DRAGSELECTION = 24, W_DRAGMARKER = 23,
  W_DRAGTEMPO = 22, W_SONGINFOEDIT = 11, W_SONGINFO = 10, W_PROPERTIES = 7, W_STATS = 6,
  W_INSTRUMENTS = 3, W_PREFERENCES = 2, W_SAVEOPTIONS = 36, W_MIDI = 5, W_SCHEMATIC = 4,
  W_ABOUT = 12, W_GREETING = 1, W_STEREO = 20, W_ARPEGGIO = 32, W_TREMOLO = 33,
  W_STAGGER = 34, W_PORTAMENTO = 35, W_SETVELOCITY = 37, W_SETPANNING = 38,
  W_SETPITCH = 39, W_SETTEMPO = 43, W_TEMPOTAPPER = 44, W_COMPATIBILITY = 31,
  W_TRACKEXPORT = 46, W_BRANCHEXPORT = 40, W_MIDIDEVICES = 28, W_CLIPEDITOR = 19,
  W_DRAG = 21,   // 滚动条拖拽中（window = w_drag）
  // 对照 macros.gml：w_schematic_export = 14、w_datapack_export = 30。
  // 30 在旧代码里被「兼容性」窗口占了，这次把兼容性挪到 31，
  // 两个导出窗口用回原版 ID（这样和 GML 的窗口编号保持一致）。
  W_SCHEMATIC_EXPORT = 14, W_DATAPACK_EXPORT = 30;

/* 音频导出选项窗口（W_AUDIOEXPORT = 45，45 这个原窗口编号未被占用）。
   对照 draw_window_audio_export.gml：原版会弹出一个窗口，让用户选
   输出格式 / 采样率 / 声道 / 是否包括已静音的层。
   原版没有为它分配独立的 window 状态值（窗口由菜单流程直接绘制），
   这里给一个独立状态，以便走统一的模态与遮罩机制。 */
const W_AUDIOEXPORT = 45;

/* 这些 window 值只是内部拖拽/瞬时状态，不是真正的对话框：
   不能画灰色遮罩，也不能屏蔽下层交互（对照 GML：draw_windows 只画已知窗口） */
const TRANSIENT_WINDOWS = [W_RELEASE, W_DRAG, W_DRAGMARKER, W_DRAGSELECTION, W_DRAGVOL,
  W_DRAGSTEREO, W_DRAGSECTION_START, W_DRAGSECTION_END, W_DRAGTEMPO, W_INSBOX];
function isDialogWindow(w) {
  return w !== 0 && TRANSIENT_WINDOWS.indexOf(w) < 0;
}

/* ---------------------------------------------------------------- 初始化 */
function editorInit() {
  S.piano_key = new Array(88).fill(0);
  let k = 33;
  const seq = '1Q2W3ER5T6YU8I9O0PZSXDCVG';
  for (const ch of seq) S.piano_key[k++] = ch.charCodeAt(0);
  S.key_press = new Array(88).fill(0);
  S.key_click = new Array(88).fill(0);
  S.key_played = new Float64Array(88);
  S.key_midipress = new Array(88).fill(0);
  S.startkey = 0; S.sharpkeys = 0; S.keysshow = 0;
  S.instrument = 0;
  S.trem_spacing = 1; S.stereo_width = 50; S.stereo_reverse = 0;
  S.port_cent = 0; S.porta_reverse = 0;
  S.setvel = 100; S.setpan = 0; S.setpit = 0; S.percentvel = 0;
  /* 【Tremolo 模式与参数，对照 control_create.gml:548-552 / reset.gml:136-140】
     tremolotype: 0 = 无音量变化，1 = 淡入，2 = 淡出
     fade_auto:   1 = 自动音量（由音符长度决定），0 = 手动音量（用 leg_dec/leg_sus）
     leg_dec / leg_sus: 手动模式下的衰减与延长（触发-延长-间隔）
     这些原先没有初值，draw_window_macro_tremolo 里的单选框读不到状态，
     会一直停在 undefined 上。 */
  S.tremolotype = 0; S.leg_dec = 20; S.leg_sus = 20;
  /* 「设定音高」的加法模式开关，对照 control_create.gml（addpitch = 0） */
  S.addpitch = 0;
  S.arp_pattern = '0|4|7'; S.stag_pattern = '0|1';
  S.fade_auto = 1;
  S.selected_layers = [];
  S.window_scale = 1;
  S.save_version = 5;
  S.user_instruments = 0;
  S.hires = false;
  /* 触屏 / 竖屏状态。portrait 由 computeLayout 每帧按实时宽高比重算，
     这里只是给个初值，避免第一帧读到 undefined。 */
  S.portrait = 0;
  S.touch_mode = 0;
  S.drawer = '';          // 当前展开的抽屉：'' / 'layers' / 'piano' / 'props'
  S.drawer_scroll = 0;
  S.piano_oct = 0;        // 抽屉琴键的八度偏移
  S.drawer_piano_flat = 0; // 抽屉琴键关掉两端淡出（键太少时，见 drawDrawerPiano）
  S.toolbar_h = 52;       // 顶栏实测高度（竖屏折行后会长出来）
  S.info_h = 0;           // 竖屏时间/速度条的高度
  reset();
}

/* ---------------------------------------------------------------- 布局 */
function computeLayout() {
  const rw = S.rw, rh = S.rh;

  /* 【竖屏判定】按实时宽高比，而不是按设备型号/UA。
     窗口一改成竖长条就立刻变竖屏布局，转回横屏立刻恢复 —— 用户提到的
     "直接检测页面长宽比例，实时变化"就是这里。
     阈值取 1.15 而不是 1.0：方块状窗口（比如 DevTools 并排时）按桌面布局
     排布更舒服，只有明显竖长才切抽屉模式。
      注意这里【不排除 fullscreen】。原来的写法是
         S.portrait = (!S.fullscreen && rh >= rw * 1.15) ? 1 : 0;
      于是竖屏下点抽屉里的「编辑区域」（它把 S.fullscreen 置 1）会同步让
      portrait 失效、掉进桌面分支：桌面分支固定扣掉 270px 的图层面板，
      390 宽的屏幕上网格只剩 3 列，工具栏和状态栏也按横屏摆放，
      整个界面就进入一种说不清的错乱状态。「编辑区域」的本意只是把网格铺满，
      不应该改变竖屏/横屏的布局模式，所以竖屏判定只看宽高比。 */
  S.portrait = (rh >= rw * 1.15) ? 1 : 0;

  if (S.portrait) {
    /* 竖屏：宽度是最稀缺的资源。
       桌面布局里图层面板固定吃掉 270 逻辑像素 —— 手机竖屏总共才 300 左右，
       那样网格只剩一两列，完全没法编辑。所以竖屏下：
         · 图层面板和钢琴都改成【浮层抽屉】，不再参与布局计算；
         · 网格吃满整个宽度；
         · 底部只给滚动条/抽屉标签/状态栏留 130。
       抽屉打开时靠 scrim 挡住下层点击（见 editorFrame 的 blocked）。 */
    if (S.dropmode) S.totalcols = floor(rh / 32) + 1;
    else S.totalcols = floor(rw / 32) + 1;
    S.x1 = -2;
    /* 【竖屏的纵向预算要从 y1 倒推，不能再用固定的 rhval】
       桌面布局里 rhval（270/130）是"底部留多少"，因为顶栏高度是常量 52。
       竖屏下顶栏会折行、高度是浮动的一两百，时间/速度条还占一条 34 的带，
       如果再按 rhval 从 rh 往回留，网格底部就会算到屏幕外，
       横向滚动条和抽屉标签条会互相压住（实测确实叠在一起）。
       所以这里改成：
         y1 = 折行顶栏高度 + 信息条高度
         totalrows 由 (rh - (y1+34) - 底部固定占用) 反推
       底部固定占用 = 横向滚动条 16 + 状态栏 24 + 抽屉标签条 30 + 余量。 */
    S.info_h = 40;
    S.y1 = (S.toolbar_h || 52) + S.info_h;
    /* 【竖屏下的「编辑区域」（fullscreen）】
       抽屉里的「编辑区域」按钮把 S.fullscreen 置 1，意图是"让网格铺满"。
       桌面分支靠 rhval = 32 实现（只留 32px 底边）；
       竖屏这里同样处理：把顶部信息条和底部固定占用都收掉，
       只留顶栏 + 一圈余量，让网格尽可能大。
       之前竖屏分支完全没有读 S.fullscreen，所以点了之后布局一点没变，
       却因为 portrait 被排除而整体掉进桌面分支 —— 那个"莫名其妙的状态"。 */
    if (S.fullscreen) {
      S.info_h = 0;
      S.y1 = 4;
      S.totalcols = floor(rw / 32) + 1;
      S.totalrows = Math.max(1, floor((rh - 8) / 32));
    } else {
      const bottomFixed = 16 + 24 + 30 + 22;
      S.totalrows = Math.max(1, floor((rh - (S.y1 + 34) - bottomFixed) / 32));
    }
  } else {
    S.info_h = 0;
    if (!S.fullscreen && S.show_layers) S.totalcols = floor((rw - 8 - 270) / 32);
    else if (S.dropmode) S.totalcols = floor(rh / 32) + 1;
    else S.totalcols = floor(rw / 32) + 1;
    S.rhval = 270;
    if (!S.show_piano) S.rhval = 130;
    if (S.fullscreen) S.rhval = 32;
    S.totalrows = floor((rh - S.rhval) / 32);
    if (S.fullscreen) S.totalrows += 1;
    S.x1 = (!S.fullscreen && S.show_layers) ? 264 : -2;
    S.y1 = S.fullscreen ? -2 : 52;
  }
  if (S.totalrows < 1) S.totalrows = 1;

  const keysFit = Math.min(S.keysmax, floor((rw - 32) / 39));
  if (keysFit !== S.keysshow) {
    S.startkey = 27 - floor(keysFit / 2);
    S.sharpkeys = 0;
    for (let a = 0; a < S.startkey; a++) {
      const b = a % 7;
      if (b !== 1 && b !== 4) S.sharpkeys++;
    }
  }
  S.keysshow = keysFit;
  S.gx = S.x1 + 2;
  S.gy = S.y1 + 34;
}

/* ---------------------------------------------------------------- 主帧 */
function editorFrame(dt) {
  G.cursor = 'default';
  UI.clickConsumed = false;
  // 拖拽结束后的“释放鼠标”状态复原
  if (S.window === W_RELEASE && !G.mb[0]) S.window = 0;
  S.cursmarker = 0;
  S.popupQueue = [];
  UI.popup = null;
  computeLayout();

  /* volume_scroll —— 对照 control_create.gml:163 与 control_draw.gml:1939-1945：
     指针停在【主音量条】上时置 1，使两条滚动条的滚轮分支整体失效
     （draw_scrollbar.gml:21 / :160 里乘 (!volume_scroll)），滚轮只改主音量。
     之前没有这个标志，于是「在主音量条上滚一下」会同时改音量和滚动视图 ——
     用户很难察觉自己把视图滚走了。
     音量条的矩形是在 drawTopBar 里算出来的，而 drawTopBar 画在滚动条【之后】，
     所以这里用上一帧缓存的矩形来判定（布局逐帧稳定，1 帧滞后不可感知）。 */
  const volbr = S.volbar_rect;
  S.volume_scroll = (volbr && mouseRectangle(volbr.x, volbr.y, volbr.w, volbr.h)) ? 1 : 0;

  const rw = S.rw, rh = S.rh;
  const x1 = S.x1, y1 = S.y1, gx = S.gx, gy = S.gy;
  const totalcols = S.totalcols, totalrows = S.totalrows;

  // 计时/编辑相关
  S.editline = (S.editline + 30 * dt) % 60;
  if (S.delay > 0) S.delay = Math.max(0, S.delay - dt * 20);
  S.work_mins += dt / 60;
  // 自动保存
  if (S.autosave && S.totalblocks > 0) {
    if (S.tonextsave === undefined || S.tonextsave > (S.autosavemins || 10)) S.tonextsave = S.autosavemins || 10;
    S.tonextsave -= dt / 60;
    if (S.tonextsave <= 0) { S.tonextsave = S.autosavemins || 10; autosaveWrite(); }
  }

  // 网格指针
  S.sela = -1; S.selb = -1; S.selbx = -1; S.selby = -1;
  const inGrid = mouseRectangle(gx, gy, totalcols * 32, totalrows * 32);
  if (inGrid) {
    S.sela = floor((G.mouse.x - gx) / 32);
    S.selb = floor((G.mouse.y - gy) / 32);
    if (S.sela >= 0 && S.selb >= 0) {
      S.selbx = floor(S.starta) + S.sela;
      S.selby = floor(S.startb) + S.selb;
      S.hover.x = S.selbx; S.hover.y = S.selby;
      /* 【有选区时 exist 必须为 0 —— 对照 control_draw.gml:278】
             if (select = 0 && selected = 0 && selbx < arraylength && selby < arrayheight) {
                 exist = song_exists[selbx, selby]
         原版这一行有三个前提：没在框选、**没有选区**、坐标在界内。
         我们漏掉了 `selected = 0`，于是「先框选一块，再去右键其中一个音符」时
         exist 仍然为 1，后续 `if (selected = 0 && exist) remove_block_manual(...)`
         之外的分支就乱了：
           · handleGridInput 的右键按下分支里，selected > 0 时本来不该删方块，
             但因为 exist 误判，RightPress 走到了删除逻辑；
           · 结果 removed = true → 松手那帧判定「已经删过了」→ **菜单不弹**。
         这正是用户报的「选中音符块的情况下右键无法弹出菜单」。
         注意用户说的"选中音符块"是【框选之后】的状态：
         单个音符只点一下并不会形成选区（要拖动才形成），
         所以单点右键弹菜单一直是好的，只有框选后才失效。 */
      S.hover.exist = (S.selected === 0 && S.window === 0 &&
        S.selbx < S.arraylength && S.selby < S.arrayheight)
        ? gExists(S.selbx, S.selby) : 0;
      // 按用户要求：画布上不再显示十字（加号）形光标，用普通箭头。
      // GameMaker 桌面版没有这个十字光标，浏览器里它反而显得突兀。
      G.cursor = 'default';
    }
  } else {
    S.hover.exist = 0;
  }
  // 兼容性
  if (S.selected === 0) {
    if (S.block_outside === 0 && S.block_custom === 0) {
      S.compatible = (S.tempo === 10 || S.tempo === 5 || S.tempo === 2.5) && S.block_pitched === 0 ? 1 : 2;
    } else S.compatible = 0;
  }

  // 图层锁定状态
  for (let b = 0; b <= totalrows; b++) {
    const layer = floor(S.startb) + b;
    S.lockedlayer[layer] = 0;
    if (S.solostr !== '') {
      if (S.solostr.indexOf('|' + layer + '|') < 0) S.lockedlayer[layer] = 1;
      else if (S.layerlock[layer] === 1) S.lockedlayer[layer] = 1;
    } else if (layer < S.endb2) {
      if (S.layerlock[layer] === 1) S.lockedlayer[layer] = 1;
    }
  }

  // 菜单 / 消息框打开时，编辑器层不应响应鼠标
  const rawMb = G.mb.slice(), rawMbp = G.mbp.slice(), rawMbr = G.mbr.slice(), rawWheel = G.wheel;
  // 关闭菜单/消息框的那一次按下要被"吞掉"，直到松开（含松开那一帧），避免穿透到下层控件
  /* 竖屏抽屉打开时同样屏蔽下层：抽屉是浮层，底下的网格仍画在那里，
     不拦的话点抽屉里的按钮会顺手在网格上落一个音符。 */
  /* 【拖拽锁定：按下之后到松手之前，其它控件一律不响应】
     用户报的一连串"乱套"都出自同一个缺口：一次按住拖动，只有"起点"被正确消费，
     "终点"却仍然是一次全新的按下/松开，于是沿途经过的控件把它当成独立点击。
     具体表现：
       · 画布上按住左键选区，拖到钢琴上 → 钢琴收到 mbr，发出声音；
       · 拖到顶部工具栏松手 → 松手位置下面的按钮被触发；
       · 拖速度滑块时松手位置有按钮 → 那个按钮被触发（滑块拖动本身没问题，
         问题在于松手那一帧 mbr 没有被吞掉）；
       · 画布拖选区经过速度滑块 → 滑块收到 mbr 开始改速，和选区同时进行。
     【注意：dragHeld 不参与 blocked】
       第一版把 dragHeld 直接并进了 blocked，结果把正在拖的那个控件自己也屏蔽了：
       blocked 会清零 G.mb/G.mbp/G.mbr，而 drawEditor 里的滚动条、drawWindows
       里的滑块都在 blocked 之后才绘制 —— 它们拿到的全是 false，
       于是"按下滚动条的那一帧之后，后面每一帧都收不到按住状态"，
       表现就是【滚动条只能点一下、不能拖】。
       拖拽期间需要被屏蔽的是"别的控件"，不是发起拖拽的那个控件本身。
       所以 dragHeld 单独列出来，只用于下面 drawWindows() 那一处的前置清零
       （窗口控件 = 由 drawWindows 绘制的那些），画布/滚动条/piano 照常收输入。 */
  /* 【拖拽判据必须不依赖 G.mb[0]】
     前一版写成 `G.mb[0] && (拖拽状态…)`，在真机上手就失效：
     触屏的 touchFireLongPress() 会在按住约 450ms 时把 G.mb[0] 置 false
     （长按→右键的实现，见 touch.js），于是"手指还按着、G.mb[0] 已是 false"，
     整个 dragHeld 变成 false —— 钢琴、顶栏按钮、速度滑块全部解除屏蔽，
     结果就是"拖到钢琴上能按响""松手触发按钮""一边选区一边改速度"全部复发。
     而 SB.drag / S.select / S.window=W_DRAG* 这些【拖拽状态变量】仍然准确，
     它们不受长按逻辑影响，所以判据只用状态变量。
     清除时机由各控件自己在松手帧负责，不需要在这里判按钮。 */
  const dragHeld = (
    S.window === W_DRAGSELECTION || S.window === W_DRAGMARKER ||
    S.window === W_DRAGSECTION_START || S.window === W_DRAGSECTION_END ||
    S.window === W_DRAGVOL || S.window === W_DRAGSTEREO || S.window === W_DRAGTEMPO ||
    S.window === W_DRAG || S.select > 0 ||
    /* 【速度滑块拖动 / 刚松手那一帧】
       用户报："在速度滑块上面按住拖动的时候，只要松开鼠标的位置有按钮，
       一松开鼠标就会触发。"
       速度滑块不像滚动条那样有 S.window 状态变量，它靠 S.tempoDrag。
       而松手那一帧末尾 `if (!G.mb[0]) S.tempoDrag = null` 会【当场清掉】它，
       但同一帧里后面的 drawWindows / drawIcon 才刚要读 G.mbr[0] 做点击判定 ——
       于是"拖完滑块松手 → 松手位置下面的按钮被触发"。
       UI.tempoDragged 在按下和每一帧拖动时置 1，由 editorFrame 在
       【按键真正抬起后的下一帧】清掉（见函数末尾），
       保证松手那一帧也算在"拖拽中"，按钮看不到这次松开。 */
    !!UI.tempoDragged
  );
  const blocked = isDialogWindow(S.window) || !!UI.menu || !!UI.modal || !!UI.swallowPress ||
    (typeof drawerOpen === 'function' && drawerOpen());
  UI.dragHeld = dragHeld;
  /* 保存【清零前】的原始输入快照。
     抽屉是浮层，它在 blocked 生效之后才绘制，必须能看到真实输入，
     所以除了 rawMbr / rawMbp，rawMb 也要存（钢琴的按下靠它判断）。 */
  UI.rawMb = rawMb; UI.rawMbr = rawMbr; UI.rawMbp = rawMbp; UI.blocked = blocked;
  if (blocked) {
    G.mb = [false, false, false]; G.mbp = [false, false, false];
    G.mbr = [false, false, false]; G.wheel = 0;
  }
  S.cursmarker = 0;
  handleGlobalKeys();
  handleCtrlWheelZoom();
  handlePlayback(dt);
  /* 【抽屉打开时彻底跳过下层输入】
     blocked 只是把 G.mb/G.mbp/G.mbr 清零，但 handleTimelineInput /
     handleGridInput / handlePianoInput 里还有一批逻辑【不依赖鼠标按钮】：
       · handleTimelineInput 会读 G.mouse 位置做标记拖动、滚动判定
       · handleGridInput     会读 S.select / S.drag 这类【跨帧残留状态】
       · handlePianoInput    会读键盘、并且 G.cursor 判定用的是 mouseRectangle
     于是抽屉打开时手指在琴键上滑动，仍然会喂给底下的画布逻辑 ——
     表现为「琴键上滑动会穿透到画布」。清零按钮状态挡不住这一半。
     所以抽屉打开时直接不进这几个 handler，从根上断掉。

     【但「拖拽进行中」必须继续喂输入】
     dragHeld 也会让 blocked 为真（见上面的说明），如果把这条路径也一并
     跳过，正在进行的拖动就会立刻断掉（选区不动了、滑块不跟手了）。
     所以这里分两种情况：
       · dragHeld  → 用【清零前】的原始快照恢复 G.mb/mbp/mbr 再跑这三个 handler，
                     让拖拽继续，但同时【已经】通过 blocked 屏蔽了所有窗口控件
                     （drawWindows 拿到的是清零后的值）；
       · 其它      → 照旧跳过，防止穿透。 */
  const drawerIsOpen = (typeof drawerOpen === 'function' && drawerOpen());
  /* 【全屏退出按钮：按下帧就要在画布逻辑之前拦住】
     用户报："退出全屏的按钮会穿透，点击之后虽然可以退出全屏，
     但也会放置出一个音符。"
     editorFrame 的顺序是 handleGridInput(先) → drawEditor(后)，
     按钮在 drawEditor 里，等它处理时画布已经把这次松开当落音符用掉了。
     所以在这里（两个 handler 之前）用按钮的几何矩形直接判一次，
     不依赖 drawEditor 上一帧算出的 hover —— 避免"鼠标瞬移过去点"时慢一帧。
     只吃按下：按下不落音符，松手时按钮自己那条 `hov && G.mbr[0]` 照常退出全屏。 */
  if (S.fullscreen && G.mbp[0]) {
    const fsz = FS_EXIT_SIZE, fm = FS_EXIT_MARGIN, fp = FS_EXIT_PAD;
    const fx = S.rw - fsz - fm, fy = S.rh - fsz - fm;
    if (mouseRectangle(fx - fp, fy - fp, fsz + fp * 2, fsz + fp * 2)) {
      G.mbp[0] = false;
      S.clickinarea = 0;
      S.dontplace = 1;
    }
  }
  if (dragHeld || !drawerIsOpen) {
    /* 【拖拽进行中要用原始输入喂给 canvas 层，且必须一直喂到 drawEditor 结束】
       为什么把两个分支合并到这里、并且不清零：
       滚动条、拖动条、选区拖拽这些控件都是【在 drawEditor 里绘制并处理输入】
       的，不是 drawWindows。早先写成：
           if (dragHeld) {
             G.mb = rawMb.slice();            // 恢复
             handleTimeline/Grid/PianoInput(); // 跑 handler
             G.mb = [false,false,false];       // ← 又清零
           }
           drawEditor(dt);                     // ← 滚动条拿到的是清零后的 false
       结果就是：按下滚动条那一帧能进拖动（那时还在 blocked 分支之外），
       但【之后每一帧滚动条都收不到「按住」】，于是它以为用户松手了，
       立刻执行 SB.drag = -1 —— 用户看到的就是"滚动条只能点一下，拖不动"。
       现在不再清零，让 drawEditor 也能看到真实输入；
       真正需要屏蔽的是 drawWindows（窗口控件），那一处单独处理（见下面 needMask）。 */
    if (dragHeld) {
      G.mb = rawMb.slice(); G.mbp = rawMbp.slice(); G.mbr = rawMbr.slice();
    }
    handleDragAutoscroll();
    handleTimelineInput();
    handleGridInput();
    handlePianoInput();
  }
  drawEditor(dt);
  G.mb = rawMb; G.mbp = rawMbp; G.mbr = rawMbr; G.wheel = rawWheel;
  /* 【菜单打开时，窗口控件不能消费这次输入】
     用户反馈："点了下拉框的一个选项后，下拉框背后的东西也会被点到"。
     根因就在这个顺序上：
        · 上面把 G.mbr 恢复成【原始值】之后才调 drawWindows()；
        · 菜单（下拉框的列表）是在 drawWindows() 之后由 drawMenu() 画的；
        · 于是同一帧里，背后的窗口控件先用这次松开做了一次点击判定
          （按下背后的按钮 / 又开了一个下拉框 / 选中了一行），
          紧接着 drawMenu() 才用同一次松开关掉菜单并执行菜单项。
     结果就是"一次点击，两处生效"。
     GML 里没有这个问题：obj_menu 是一个独立常驻对象，菜单展开时
     它的 Step 优先级高于窗口逻辑，会先消费掉这次输入。
     这里用同样的办法：菜单打开期间，先把 G.mb/G.mbp/G.mbr 清零再画窗口，
     画完再恢复给 drawMenu 用 —— 窗口看不到这次输入，菜单照常响应。 */
  const menuOpen = !!UI.menu;
  /* 【拖拽进行中：窗口控件看不到这次输入】
     这就是用户报的那一串"拖拽穿透"的正解：
     画布上按住拖动时，鼠标可能掠过速度滑块、钢琴、工具栏按钮，
     这些控件如果拿到 G.mb/G.mbr，就会把"掠过"当成"点击"。
     拖拽期间它们在语义上都不该响应 —— 一次按住只能有一个操作对象。
     但【只屏蔽 drawWindows 这一个入口】：
       · 画布/滚动条由 drawEditor 绘制，它们可能是拖拽的发起者，必须继续收输入；
       · piano 由 handlePianoInput 处理，那边另有 dragHeld 判断。
     清零发生在 drawWindows 之前、drawMenu 之后恢复，所以对菜单无影响。 */
  const needMask = menuOpen || UI.dragHeld;
  if (needMask) {
    G.mb = [false, false, false]; G.mbp = [false, false, false];
    G.mbr = [false, false, false]; G.wheel = 0;
  }
  drawWindows();
  if (needMask) {
    G.mb = rawMb; G.mbp = rawMbp; G.mbr = rawMbr; G.wheel = rawWheel;
  }
  /* 拖控件锁的兜底释放。
     注意时机：drawWindows() 里滑块/拖动条已经跑过一次 ——
     若左键仍按着，dragLock 是有效的，不能清；
     若这一帧左键已经松开（!G.mb[0]），控件本该在那一帧自己清掉它；
     但不巧控件那一帧没被绘制（窗口被关、面板滚走）就会残留，
     画布将永久收不到输入。所以只在"已经松开"时兜底清一次。 */
  if (dragLocked() && !G.mb[0] && !G.mbp[0]) {
    UI.dragLock = -1;
    UI.dragbarId = null;
    if (UI.drag) UI.drag.id = -1;
  }
  drawMenu();
  drawMessageBox();
  drawPopup();
  if (G.mbp[0] && UI.textFocus >= 0 && !UI.clickConsumed) blurText();
  /* 帧末才解除"吞点击"：松开那一帧仍算被吞 */
  if (UI.swallowPress && !G.mb[0] && !G.mbp[0] && !G.mbr[0]) UI.swallowPress = false;
  /* 速度滑块的"刚拖动过"标记：必须在【按键真正抬起、且没有新的按下/松开】
     的帧末才清。松手那一帧 mbr 还是 true，此时清掉就白做了
     （后面的 drawWindows / drawIcon 还要用 dragHeld 屏蔽点击）。 */
  if (UI.tempoDragged && !G.mb[0] && !G.mbp[0] && !G.mbr[0]) UI.tempoDragged = false;
  G.hiddenInput.style.cursor = G.cursor;
  G.canvas.style.cursor = G.cursor;
}

/* ---------------------------------------------------------------- 全局按键 */
function handleGlobalKeys() {
  if (UI.textFocus >= 0 || UI.modal || UI.menu) return;
  const K = G.keysPressed;
  const KM = G.keysPressedMod || {};
  /* 取"某个键在按下那一刻"的修饰键状态。
     keydown 与 keyup 经常落在同一帧内，keyup 会把 G.ctrl 清成 false，
     等这一帧处理时实时值已经不可靠了（Ctrl+A / Ctrl+E 全部失效）。
     有快照就用快照，没有才退回实时值（兼容"先按住 Ctrl 再点鼠标"这类操作）。 */
  const modOf = (k) => KM[k] || { ctrl: G.ctrl, shift: G.shift, alt: G.alt };
  const modAny = () => {
    // 本帧有按键时，按第一个按键的快照决定主修饰状态
    const ks = Object.keys(K);
    if (ks.length) return modOf(ks[0]);
    return { ctrl: G.ctrl, shift: G.shift, alt: G.alt };
  };
  // 方向键与快进快退按钮都是"按住才生效"，每帧先归零
  if (S.window !== W_DRAGMARKER) {
    S.forward = 0;
    if (G.keys['ArrowRight']) S.forward = 1;
    else if (G.keys['ArrowLeft']) S.forward = -1;
  }
  if (S.key_edit > -1) {
    const kk = Object.keys(K)[0];
    if (kk === 'Escape' || kk === 'Enter' || kk === ' ') { S.piano_key[S.key_edit] = 0; S.key_edit = -1; saveSettings(); }
    else if (kk && kk.length === 1) { S.piano_key[S.key_edit] = kk.toUpperCase().charCodeAt(0); S.key_edit = -1; saveSettings(); }
    return;
  }
  const mainMod = modAny();
  const ctrl = mainMod.ctrl, shift = mainMod.shift;

  if (K['F11']) { S.fullscreen = !S.fullscreen; setMsg(S.fullscreen ? '全屏模式 => 开启' : '全屏模式 => 关闭'); }
  if (K['F10']) { S.blackout = !S.blackout; setMsg(S.blackout ? '全黑模式 => 开启' : '全黑模式 => 关闭'); }

  if (S.playing === 0) {
    if (ctrl && !shift) {
      if (K['n']) newSong();
      if (K['o']) loadSongDialog();
      if (K['s']) saveSongFile(false);
      if (K['a']) selectAll(-1, 0);
      if (K['i']) selectionInvert();
      if (K['c']) actionCopy();
      if (K['x']) actionCut();
      if (K['v']) actionPaste(S.selbx > -1 ? S.selbx : S.starta, S.selby > -1 ? S.selby : S.startb);
      if (K['z']) actionUndo();
      if (K['y']) actionRedo();
      if (K['e']) modeAction(1);
      if (K['d']) modeAction(2);
      if (K['r']) modeAction(3);
      if (K['f']) modeAction(4);
      if (S.editmode !== 0 && K['t']) modeAction(5);
      if (S.editmode !== 0 && K['g']) modeAction(6);
      if (K['p']) S.window = W_PREFERENCES;
      if (K['0']) { S.window_scale = 1; layoutResize(); setMsg('窗口缩放 => 100%'); }
      if (K['='] || K['+']) zoomIn();
      if (K['-']) zoomOut();
      // 音色快捷键 Ctrl+1..9 / Ctrl+Shift+1..7
      if (!shift) {
        for (let a = 1; a <= 9; a++) {
          if (K[String(a)]) {
            S.instrument = a - 1;
            S.selected_vel = 100; S.selected_pan = 100; S.selected_pit = 0;
            if (INSTRUMENTS[S.instrument]) playSound(INSTRUMENTS[S.instrument], S.selected_key, 100, 100, 0);
          }
        }
      } else {
        for (let a = 1; a <= 7; a++) {
          if (K[String(a)]) {
            S.instrument = a + 8;
            S.selected_vel = 100; S.selected_pan = 100; S.selected_pit = 0;
            if (INSTRUMENTS[S.instrument]) playSound(INSTRUMENTS[S.instrument], S.selected_key, 100, 100, 0);
          }
        }
        // 宏快捷键
        if (S.selected !== 0) {
          if (K['a']) S.window = W_TREMOLO;
          if (K['s']) S.window = W_STEREO;
          if (K['d']) S.window = W_ARPEGGIO;
          if (K['f']) S.window = W_PORTAMENTO;
          if (K['g']) { macroVibrato(); }
          if (K['h']) S.window = W_STAGGER;
          if (K['j']) { macroChorus(); }
          if (K['k']) { macroVelocityLFO(); }
          if (K['q']) { macroFade(true); }
          if (K['w']) { macroFade(false); }
          if (K['e']) { macroReplaceKey(); }
          if (K['r']) S.window = W_SETVELOCITY;
          if (K['t']) S.window = W_SETPANNING;
          if (K['y']) S.window = W_SETPITCH;
          if (K['u']) { macroReset(); }
        }
      }
    }
    if (K['Delete'] && S.selected > 0) { actionDelete(); }
    if (K['Home']) { S.starta = 0; }
    if (K['End']) { S.starta = S.enda; }
    if (K['PageUp']) S.starta = Math.min(S.enda, S.starta + S.totalcols);
    if (K['PageDown']) S.starta = Math.max(0, S.starta - S.totalcols);
  }
  if (K['Enter']) { S.playing = 0; S.marker_pos = 0; S.marker_prevpos = 0; stopScheduledAudio(); }
  if (K[' ']) { togglePlaying(S.totalcols); }
  if (K['F7']) setMsg('帧率上限切换');
  if (K[' '] || K['ArrowLeft'] || K['ArrowRight'] || K['Home'] || K['End']) { }
}

function zoomIn() {
  const steps = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 3.5, 4];
  for (const s of steps) if (s > S.window_scale + 0.001) { S.window_scale = s; break; }
  layoutResize();
  setMsg('窗口缩放 => ' + Math.round(S.window_scale * 100) + '%');
}
function zoomOut() {
  const steps = [4, 3.5, 3, 2.5, 2, 1.75, 1.5, 1.25, 1, 0.9, 0.8, 0.75, 0.67, 0.5];
  for (const s of steps) if (s < S.window_scale - 0.001) { S.window_scale = s; break; }
  layoutResize();
  setMsg('窗口缩放 => ' + Math.round(S.window_scale * 100) + '%');
}
function layoutResize() {
  resizeCanvas();
  computeLayout();
  // 缩放变了就落盘：缩放有多条修改路径（首选项滑块、Ctrl+滚轮、快捷键、重置按钮），
  // 逐个补 saveSettings() 容易漏。这里统一在布局重算后保存一次，
  // 保证「刷新后缩放变回 100%」不再发生。
  if (typeof saveSettings === 'function') saveSettings();
}

/* ---------------------------------------------------------------- 播放推进 */
/* 播放位置的时间基准。
 *
 * 为什么不用「S.marker_pos += tempo * dt」：
 *   窗口最小化/切到后台时，rAF 完全停摆，浏览器把 setInterval 降频到约 1 次/秒，
 *   而 startLoop 里 dt 上限是 0.5s。于是每 1 秒真实时间只推进 0.5 秒播放 ——
 *   最小化后播放速度正好减半（用户听到的就是「变慢」）。
 *   上限不能简单调大：长时间挂起后恢复时，一次 tick 会把几十秒一次性跳过。
 *
 * 解法：用 Web Audio 的 ctx.currentTime 作时间基准。
 *   这个时钟由音频硬件驱动，后台不降频、不受 rAF/定时器影响。
 *   起播时记下「锚点 = (音频时钟, 曲内位置)」，之后任意时刻：
 *       位置 = 锚点位置 + (音频时钟 - 锚点时钟) * tempo
 *   无论回调来得多稀疏，位置都严格跟着真实时间走。
 *
 * 需要重建锚点的时机：变速、跳转、循环、起播/暂停。
 */
function setPlayAnchor(pos) {
  if (!AU.ctx) return;
  S.play_anchor_pos = pos;
  S.play_anchor_time = AU.ctx.currentTime;
  S.play_anchor_tempo = S.tempo;
  S.play_anchor_expected = pos;   // 上一帧算出的位置，用于检测外部改动
}

function advanceByAudioClock() {
  // 没有音频上下文（未初始化/被挂起）时退回 dt 累加，保证仍能播放
  if (!AU.ctx || AU.ctx.state !== 'running') {
    S.marker_pos += S.tempo * G.dt;
    return S.marker_pos;
  }
  const expected = (S.play_anchor_expected === undefined) ? S.marker_pos : S.play_anchor_expected;
  const drift = Math.abs(S.marker_pos - expected);

  /* 【锚点过期就重建，不能拿旧锚点硬算】
     锚点可能因为外部直接改状态而变得很旧（测试/调试，或某些跳转路径只改了
     S.playing 而没有重锚）。这时 elapsed 会是个很大的数，一外推位置就飞出去，
     表现为"恢复播放后速率完全不对"。
     阈值取 5 秒：正常后台兜底定时器最慢 1 次/秒，最多也就 1~2 秒；
     超过 5 秒说明这个锚点已经跟当前时刻彻底脱节（比如外部直接改了状态），
     此时"以当前位置重建"比"按旧锚点硬算"安全得多。 */
  if (typeof S.play_anchor_time === 'number' && AU.ctx.currentTime - S.play_anchor_time > 5) {
    setPlayAnchor(S.marker_pos);
  }

  /* ---------------- 变速：平滑重锚，不要"往回跳" ----------------
     原来把"tempo 变了"和"位置被外部拖动过"塞进同一个分支，一律以
     S.marker_pos 重新锚定。可那一刻 S.marker_pos 还是【上一帧】的值，
     于是每一帧调速都把位置往回拽一点点 —— 听起来就是卡顿、发涩、跳音。
     正确做法分两步：
       1. 先按【旧锚点的速度】把位置算到"此刻"；
       2. 再以这个"此刻位置"作为新锚点，换新速度继续走。
     位置因此是连续的（不回跳），只是斜率变了 —— 和原版拖速度滑块的手感一致。
   */
  if (typeof S.play_anchor_time === 'number' && S.play_anchor_tempo !== S.tempo) {
    const el0 = Math.max(0, AU.ctx.currentTime - S.play_anchor_time);
    const posNow = S.play_anchor_pos + el0 * (S.play_anchor_tempo || S.tempo);
    setPlayAnchor(posNow);
    S.marker_pos = posNow;
    /* 【变速时绝不重置 S.sched_col】
       游标一旦回退，scheduleAhead 会把已经播过的列重新排一遍 ——
       这正是"进度条正好压在某个音符块上时调速，那个块被重复触发好几次"的原因。
       游标只前进，由 scheduleAhead 自己按时间推进。 */
    return S.marker_pos;
  }

  if (typeof S.play_anchor_time !== 'number' || drift > 0.5) {
    setPlayAnchor(S.marker_pos);
    /* 位置被外部挪动（拖动标记/点时间轴/按 Home），排期游标要跟过去，
       否则 scheduleAhead 会从旧位置继续补排，把已经过去的列又播一遍。
       【但游标绝不能回退】——密集变速的段落里（Rush E 有 180 个变速事件，
       相邻速度差可达 7 倍）drift 会频繁超过 0.5，每次都把游标拽回
       floor(marker_pos) 就等于把已经播过的列重新排期：
       听感正是"卡在某个变速标记上、同一 tick 的音以极快速度反复响"。
       只有"位置确实向后挪了"（用户在拖标记）才允许回退。 */
    const target = floor(S.marker_pos);
    if (target > S.sched_col) S.sched_col = target;
  }
  const el = Math.max(0, AU.ctx.currentTime - S.play_anchor_time);
  S.marker_pos = S.play_anchor_pos + el * S.tempo;
  S.play_anchor_expected = S.marker_pos;
  return S.marker_pos;
}

function handlePlayback(dt) {
  const totalcols = S.totalcols;
  if (S.playing === 1 || S.forward !== 0) {
    if (S.playing === 1) {
      advanceByAudioClock();
    }
    if (S.forward !== 0) {
      // 快进/快退是「按住生效」，本来就该跟手，用 dt 累加即可
      S.marker_pos += S.tempo * dt * (S.forward - (S.forward < 0 && S.playing === 1 ? 1 : 0));
      if (S.playing === 1) setPlayAnchor(S.marker_pos);   // 手动挪过位置，重锚
    }

    // 节拍器（对照 control_draw.gml:1047-1064）
    // 注意：源码用的是 play_sound(soundmetronome...)，【不是】界面音效，
    // 所以它不受「界面音效」开关影响 —— 之前走 playUISound() 会先判 S.windowsound，
    // 关掉界面音效后节拍器就彻底没声音了。
    if (S.metronome) {
      let pos = floor(S.marker_pos - 0.1);
      if (S.tempo === 30) pos -= 1;
      if (pos % 4 === 0 && S.metronome_played < pos) {
        if (pos % (4 * S.timesignature) === 0) {
          // 循环时避免重复敲
          if (!(S.loop_session === 1 && pos >= S.enda + 1)) playUISoundRaw('metronome_click');
        } else {
          playUISoundRaw('metronome');
        }
        S.metronome_played = pos + 1;
      }
    }
    // 循环
    if (S.loop_session === 1 && S.marker_pos > S.enda + 1) {
      S.timestoloop--;
      S.starta = S.loopstart;
      S.marker_pos = S.starta;
      /* 循环回绕：上一轮可能已经把「曲尾之后」的音符排进未来时间轴了
         （排期游标会一直往前推）。这里必须撤销，否则回绕瞬间会有一串
         属于上一轮尾巴的音符冒出来，和本轮开头的音重叠。 */
      stopScheduledAudio();
      setPlayAnchor(S.marker_pos);   // 跳回循环起点，重建音频锚点
      S.sched_col = floor(S.marker_pos);   // 排期游标跟着回到循环起点
      S.metronome_played = -1;
      if (S.sb_val) S.sb_val[0] = S.starta;
      if (S.loopmax !== 0 && S.timestoloop < 0) {
        S.playing = 0; S.marker_pos = 0; S.marker_prevpos = 0; S.timestoloop = S.loopmax;
        stopScheduledAudio();
      }
    }
    if (S.marker_pos > S.enda + totalcols) { S.marker_pos = S.enda + totalcols; S.playing = 0; stopScheduledAudio(); }
    if (S.marker_end && S.marker_pos >= S.section_end && S.marker_prevpos < S.section_end) {
      S.marker_pos = S.section_end; S.playing = 0; stopScheduledAudio();
    }
    // 跟随进度条（对照 control_draw.gml:1090-1106）
    // 注意源码只有两个分支：pagebypage = 1（按页）走「翻页」逻辑，
    // 其它值（0 按刻 / 2 按帧）统统走 else 的「居中跟随」。
    // 也就是说「按帧」和「按刻」的滚动位置公式完全一样，
    // 区别只在 note_offset（控制_draw.gml:375）——按帧时会把不足一格的小数部分
    // 用像素偏移平滑掉，看起来是连续滑动而不是一格一格跳。
    // 之前按帧走了「按页」那支，导致每帧都在翻页边界来回，进度条和时间轴一起抽搐。
    if (S.marker_follow === 1) {
      if (S.marker_pagebypage === 1) {
        if (floor(S.marker_pos) >= S.starta + totalcols - 1 && S.starta < S.enda) {
          S.starta = median(0, S.marker_pos - 1, S.enda);
          if (S.sb_val) S.sb_val[0] = S.starta;
        }
        if (floor(S.marker_pos) < S.starta + 1 && S.forward === -1 && S.starta > 0) {
          S.starta = median(0, floor(S.marker_pos) - totalcols + 1, S.enda);
          if (S.sb_val) S.sb_val[0] = S.starta;
        }
      } else {
        S.starta = median(0, S.marker_pos - ceil(totalcols / 2), S.enda);
        if (S.sb_val) S.sb_val[0] = S.starta;
      }
    }
  }
  const clamped = median(0, S.marker_pos, S.enda + totalcols);
  /* 位置被夹取（跑到曲尾/曲首外）说明和锚点已经脱节，重锚一次，
     否则下一帧 advanceByAudioClock 会算出同样的越界值，一直空转。 */
  if (clamped !== S.marker_pos) setPlayAnchor(clamped);
  S.marker_pos = clamped;
}

/* ---------------------------------------------------------------- 播放排期
 *
 * 只锚定位置还不够：窗口最小化后浏览器把定时器降到 1 次/秒，
 * 一次回调就跨过 10 列（tempo=10 时），「标记走到哪列就播哪列」的写法
 * 只能播到最后一列，中间 9 列的音频被整段丢掉 —— 听感上就是音符缺失、
 * 节奏打嗝。
 *
 * 所以改成 Web Audio 的标准做法：**提前排期**。
 *   把未来一小段时间内要响的音符，按精确时刻 src.start(when) 交给音频引擎。
 *   之后无论 JS 回调来得多稀疏，音符都在正确的时刻发声，一个不丢。
 *
 * 前瞻窗口是动态的：
 *   前台 rAF 每帧都来（~16ms），窗口 0.25s 足够，延迟低；
 *   检测到回调被降频（上一帧间隔 > 200ms）后拉到 1.5s，
 *   保证下一次回调到来之前，这段时间的音符已经全部排好。
 */
const LOOKAHEAD_FG = 0.25;
const LOOKAHEAD_BG = 1.5;

/* 把 [从 sched_col 开始、落在前瞻窗口内] 的列排期出去。
   返回排期到的列号（不含）。 */
function scheduleAhead() {
  if (!AU.ctx || AU.ctx.state !== 'running') return S.sched_col;
  if (S.playing !== 1 || S.forward !== 0) return S.sched_col;
  if (typeof S.play_anchor_time !== 'number') return S.sched_col;

  const now = AU.ctx.currentTime;
  const gap = S.last_tick_gap || 0;
  const lookahead = gap > 0.2 ? LOOKAHEAD_BG : LOOKAHEAD_FG;
  const horizon = now + lookahead;
  /* 用【当前锚点自己的速度】算"现在播到第几列"，而不是直接读 S.tempo。
     变速的那一帧，advanceByAudioClock 已经用「旧速度」把位置推到此刻、
     再以此刻为新锚点换了新速度；锚点里记的 tempo 才是这段区间的正确斜率。
     直接读 S.tempo 会在新旧速度交接的那一帧算出偏移量，导致游标前跳/后退，
     进而重复排期同一列（听感就是那个音符被触发好几次）。 */
  const anchorTempo = Math.max(0.25, S.play_anchor_tempo || S.tempo);
  const tempo = Math.max(0.25, S.tempo);

  const cur = floor(S.play_anchor_pos + (now - S.play_anchor_time) * anchorTempo);
  /* 游标落后于当前位置时【不要跳过中间的列】——
     那些列的音符还没发过声。最小化期间定时器可能几秒才来一次，
     如果在这里直接 S.sched_col = cur，中间几百列就被整段丢掉了
     （实测最小化 4 秒漏掉 22 列）。
     正确做法是把它们以「立即发声」的方式补上：when 会被 clamp 到 now，
     声音会挤在一起但不会丢，听感上是从后台切回来时把落下的音补齐。 */
  /* 【游标只进不退】
     变速时如果让游标后退，已经播过的列会被重新排期 ——
     进度条正压在某个音符块上调速时，那个块就会连响好几次。
     所以这里只处理"落后很多需要追赶"的情形，绝不回退游标。 */
  if (S.sched_col < cur - 1) {
    // 落后太多（切回前台时可能积压上百列）就只补最近的一小段，避免一次性爆音
    const MAX_CATCHUP = 200;
    if (cur - S.sched_col > MAX_CATCHUP) S.sched_col = cur - MAX_CATCHUP;
  }
  /* 游标跑到了当前位置前面很多（比如变速把时间轴整体提前），
     说明这些列已经在旧速度下排过期了；不要因为"位置还没到"就重复排，
     只在确定没排过时才继续。用 max 保证单调。 */
  if (S.sched_col < 0) S.sched_col = 0;

  let guard = 0;
  while (S.sched_col <= S.enda && guard++ < 512) {
    const col = S.sched_col;
    /* 【每一轮都必须重新读锚点与速度】
       原来 tempo / anchor 只在循环外读一次，可是变速列（下面的 hasTempo 分支）
       会在循环【内部】改写 S.play_anchor_pos / _time / _tempo 与 S.tempo。
       于是后面的列拿着"新锚点 + 旧速度"算 when，算出来远小于 now，
       被判定"早就该响"，一连串列被瞬间排空 —— 第 128 列
       （Rush E 里 462BPM→64BPM 的骤降点）之后 sched 从 128 直接跳到 132，
       中间三列根本没播。用户听到的就是"卡在那个标记上疯狂重复"。
       · 位置用【锚点速度】推进：锚点记的是这段区间的真实斜率，读 S.tempo 会在
         交接帧算出偏移，导致游标前跳/后退。
       · when 也要用锚点速度换算成真实时刻。 */
    const anchorTempo = Math.max(0.25, S.play_anchor_tempo || S.tempo);
    const when = S.play_anchor_time + (col - S.play_anchor_pos) / anchorTempo;
    if (when > horizon) break;

    /* Tempo Changer 会改变播放速度，提前排期会让变速提前生效。
       遇到这种列就不提前排了，留给即时触发处理（见下面的分支）。
       【但"即时触发"必须真的存在，否则这一列永远不播、速度永远不变】 */
    let hasTempo = false;
    if (colamount[col] > 0) {
      for (let b = colfirst[col]; b <= collast[col]; b++) {
        if (!gExists(col, b)) continue;
        const ins = INSTRUMENTS[gIns(col, b)];
        if (ins && ins.name === 'Tempo Changer') { hasTempo = true; break; }
      }
    }
    if (hasTempo) {
      /* 【变速列怎么排期】
         它不能像普通列那样"提前 0.25 秒带 audioWhen 排出去"，
         因为 playColumnRange 会立刻改 S.tempo，而声音要到 when 才响 ——
         变速会提前生效，整段时值都算错。
         但也不能简单 break 掉不管：那样这一列永远不播、S.tempo 永远不变，
         用户看到的"变速不生效"就是这么来的。
         正确做法：
           · 还没到点（when > now）→ break，S.sched_col 停在它身上，下一帧再看；
           · 到点（when <= now）→ 当场播它（playColumnRange 里会把 S.tempo 改掉），
             游标前进一格，然后【用新速度把锚点整体前移到"当前时刻"】。
         【关于重锚】第一次我写成 setPlayAnchor(S.sched_col)，
         但那样锚点位置 = col+1、锚点时间 = now，与实际时刻 (col + (now-when)*tempo)
         不一致，下一帧算出 cur 偏小、判定游标落后，于是同一列被反复重排
         （实测第 6 列被播了 49 次）。
         正确做法是先按【旧速度】把位置外推到 now 得到精确的当前列位置，
         再用【新速度】以那个位置为起点重锚。 */
      if (when <= now + 0.02) {
        /* 先把时间轴按【旧速度】推进到此刻，得到这一列的精确起始位置。
           注意 upper bound 要夹到 col，不能让 posNow 越过这一列 ——
           否则变速方块所在的列会被算到"已经过去"，画面和声音都会跳。 */
        const posNow = S.play_anchor_pos + (now - S.play_anchor_time) * anchorTempo;
        playColumnRange(col, col);          // ← 这一列会把 S.tempo 改成新值
        S.sched_col = col + 1;
        /* 【重锚：位置绝不能向前拉】
           原来写 Math.max(posNow, col) —— 这会把锚点位置强行推到 col。
           遇到"速度骤降"的段落（Rush E 里 x=126 处 462BPM、x=128 处 64BPM，
           相邻速度差 7 倍）时，posNow 往往略小于 col（还没走完这一列的零头），
           被推到 col 之后相当于【凭空吞掉一部分时间】，
           而 scheduleAhead 下一帧又按新速度从 col 继续推进 ——
           两边的位置口径打架，游标反复回退/重排，
           表现就是用户说的"卡在某个变速标记上、同一 tick 的音以极快速度重复播放"。
           正确做法：位置只取按时间真实外推出的 posNow，绝不 max 到 col。
           若 posNow 因浮点误差略大于 col+1，也只夹到 col+1 为止。 */
        const anchorPos = Math.min(posNow, col + 1);
        S.play_anchor_pos = anchorPos;
        S.play_anchor_time = now;
        S.play_anchor_tempo = Math.max(0.25, S.tempo);
        S.play_anchor_expected = anchorPos;
        /* 播放位置也要跟锚点对齐，否则 marker_pos 与 anchor_pos 的口径不一致，
           advanceByAudioClock 里的 drift 判定会被反复触发。 */
        S.marker_pos = anchorPos;
        continue;
      }
      break;
    }

    playColumnRange(col, col, Math.max(when, now));
    S.sched_col = col + 1;
  }
  return S.sched_col;
}

/* 播放当前列（floor(marker_pos) 变化时）。
   audioWhen 可选：该列在 Web Audio 时间轴上的绝对时刻（秒）。
   播放器做「提前排期」时会传它，让音频引擎按精确时刻发声；
   试听/拖动/录制等即时场景不传，立即发声。 */
function playColumnRange(start, end, audioWhen) {
  for (let xx = start; xx <= end; xx++) {
    if (xx < 0) continue;
    if (colamount[xx] > 0) {
      for (let b = colfirst[xx]; b <= collast[xx]; b++) {
        if (!gExists(xx, b)) continue;
        /* 默认值必须是"满音量"，不能是 1。
           这里的 c/d/e 是【绝对】音量/声道/音高，不是倍率：
           下面 c = (layervol/100) * gVel(...)，gVel 是 0..100 的音量值。
           之前把 c 初始化成 1 —— 一旦走进 b >= S.endb2 的分支（该层的音量设置
           数组还没覆盖到），c 就停在 1，等于 1/100 的音量，
           听感上"几乎听不到"。而键盘预览走的是 playSound(..., 100, ...) 固定 100。
           这就是「手机上点键盘试听很正常，落到画布再播放却小得几乎听不见」的原因。
           d（声道）同理，默认应为 100（居中），e（音高）默认 0。 */
        let a = 1, c = 100, d = 100, e = 0;
        if (b < S.endb2) {
          c = (S.layervol[b] / 100) * gVel(xx, b);
          d = S.layerstereo[b] === 100 ? gPan(xx, b) : (S.layerstereo[b] + gPan(xx, b)) / 2;
          e = gPit(xx, b);
        } else {
          /* 该层不在 endb2 范围内（图层参数数组还没覆盖到它）：
             退化成"直接用这个音符自己的属性"，音量仍然是 0..100。 */
          c = gVel(xx, b);
          d = gPan(xx, b);
          e = gPit(xx, b);
        }
        if (S.solostr !== '') {
          if (S.solostr.indexOf('|' + b + '|') < 0) a = 0;
          else if (S.layerlock[b] === 1) a = 0;
        } else if (b < S.endb2) {
          if (S.layerlock[b] === 1) a = 0;
        }
        if (S.record === 1 && S.playing === 1) {
          if ((G.time - S.grid.added[gidx(xx, b)]) * 1000 < 1000) a = 0;
        }
        if (a) {
          const ins = INSTRUMENTS[gIns(xx, b)];
          if (ins && ins.loaded) playSound(ins, gKey(xx, b), c, d, e, audioWhen);
          if (ins && ins.name === 'Tempo Changer') S.tempo = floor(Math.abs(e)) / 15;
          if (ins && ins.press) S.key_played[gKey(xx, b)] = G.time;
          /* 闪光时间戳必须记「这个音应该在什么时候响」，而不是「这行代码什么时候执行」。
             播放器为了后台不掉音会【提前】0.25~1.5 秒排期（见 scheduleAhead），
             而这里如果写 G.time，音符块就在声音实际发出前 0.25~1.5 秒开始闪光 ——
             表现为「刻度线离那个格子还有一段距离，方块却先亮了」。
             audioWhen 是 Web Audio 时间轴上的绝对时刻，换算成 G.time 口径即可：
               G.time 在调用时刻对应 AU.ctx.currentTime，两者差一个固定偏移。 */
          S.grid.played[gidx(xx, b)] = (typeof audioWhen === 'number')
            ? G.time + (audioWhen - AU.ctx.currentTime)
            : G.time;
        }
      }
    }
  }
}

/* 暂停/跳转/停止时调用：撤销已排进未来的音符。
   播放器会提前 0.25~1.5 秒把音符交给音频引擎（为了后台降频不漏音），
   所以任何让播放位置「不再往前走」或「跳到别处」的操作都必须撤掉这些排期，
   否则会出现「点了暂停还在响」「刻度线没到就播了那个音」。
   详见 audio.js 的 audioCancelScheduled。 */
function stopScheduledAudio() {
  if (typeof audioCancelScheduled === 'function') audioCancelScheduled();
}

function togglePlaying(cols) {
  const wasPlaying = S.playing;
  S.playing = S.playing ? 0 : 1;
  if (S.playing === 1) {
    if (S.marker_pos === S.enda + cols) S.marker_pos = 0;
    if (S.marker_start && S.section_exists) S.marker_pos = S.section_start;
    if (S.marker_follow === 1) {
      if (S.marker_pagebypage === 1 && (S.starta + cols - 2 < S.marker_pos || S.starta > S.marker_pos)) {
        S.starta = median(0, S.marker_pos - 1, S.enda);
      }
      if (S.marker_pagebypage === 0 || S.marker_pagebypage === 2) {
        S.starta = median(0, S.marker_pos - floor(cols / 2), S.enda);
      }
    }
    S.marker_prevpos = S.marker_pos;
    S.metronome_played = -1;
    // 起播时以音频时钟为基准重新锚定，后台运行也不会跑偏
    if (AU.ctx && AU.ctx.state === 'suspended') AU.ctx.resume();
    setPlayAnchor(S.marker_pos);
    /* 【起播不要重播"标记停在哪一列"的那一列】
       原版 GML 的 toggle_playing 会立刻 play 一遍 floor(marker_pos) 那一列：
       从头开始播时这没问题，但从暂停处继续时，那一列在暂停前【已经响过了】，
       再来一遍听起来就是"恢复了却先多响一下"，和原版手感不一致
       （用户明确要求对齐原版：停在某个音符上恢复播放，不该再播那个音符）。

       所以区分两种起播：
         · 从头/跳转后起播（暂停时没有记录、或位置被外部改动过）→ 照旧唱这一列；
         · 从暂停处继续（暂停时记下了同一列）→ 从下一列开始，不重播。
       为了不放过"暂停在半路、这一列其实没唱过"的情况，
       暂停时记录 S.pause_col 与这一列是否已发声过（S.pause_col_played）。 */
    const resumeCol = floor(S.marker_pos);
    const fromPause = (S.pause_col === resumeCol) && S.pause_col_played;
    S.sched_col = fromPause ? resumeCol + 1 : resumeCol;
    if (!fromPause) {
      const xx = resumeCol;
      if (xx <= S.enda) playColumnRange(xx, xx);
      S.sched_col = xx + 1;
    }
    S.pause_col = -1;
    S.pause_col_played = 0;
  } else {
    S.timestoloop = S.loopmax;
    /* 暂停：记下停在哪一列、以及这一列此刻是否已经响过。
       判断依据是 S.grid.played 的时间戳：<= 现在 说明已经发声（或正在发声），
       恢复时就不该再唱一遍。 */
    const pc = floor(S.marker_pos);
    let played = 0;
    if (pc >= 0 && pc < S.arraylength) {
      for (let b = 0; b < S.endb2; b++) {
        const tt = S.grid.played[gidx(pc, b)];
        if (tt && tt <= G.time + 0.02) { played = 1; break; }
      }
    }
    S.pause_col = pc;
    S.pause_col_played = played;
    /* 暂停：必须撤掉已经提前排进未来时间轴的音符。
       不撤的话，暂停后还会继续响一小段（最多前瞻窗口那么长），
       而且那些音的刻位比当前刻度线更靠后 —— 正是「没到那个音符却响了」。
       正在响的音保持自然衰减，与原版「暂停只是不再投递新音符」的语义一致。 */
    if (wasPlaying) stopScheduledAudio();
  }
}

/* ---------------------------------------------------------------- 网格交互 */
/* ============================================================================
 * 拖拽到画布边缘时的自动滚屏 —— 完整对照 control_draw.gml:1116-1153
 *
 * 【为什么必须补】
 * 原版在「拖选 / 拖选区 / 拖区间端点 / 正在框选」时，只要鼠标越过网格边缘，
 * 视图就会持续滚动，选区锚点同步补偿，因此可以【一次拖过整首歌】。
 * 我们之前完全没有这段，选区只在可见范围内生效，超过一屏就选不到 ——
 * 这是原版最基本的编辑手感之一。
 *
 * 【速度为什么要"累加 + ceil"而不是按距离线性】
 *   if (refreshrate >= 2) dragincxr += 0.025 else dragincxr += 0.1
 *   dragincxr = min(dragincxr, 4)
 *   starta += ceil(dragincxr)
 * 每帧只加一点点、再取 ceil，于是「刚越界时慢慢挪、越久越快」，
 * 上限 4 格/帧。指针回到网格内就把累加量清零，下次再越界重新从慢速起步。
 *
 * 【选区的补偿】
 *   if (select > 0) {
 *       select_pressx += 32 * (a - starta)
 *       select_pressy += 32 * (b - startb)
 *   }
 * 视图平移了多少，锚点就反向平移多少（像素单位，所以乘 32），
 * 这样"起点"在歌曲坐标系里保持不动 —— 否则一滚动选区起点就跟着跑。
 *
 * 【为什么不夹 enda/endb】
 *   GML 夹的是 `median(0, starta, enda)` / `median(0, startb, endb)`，
 *   也就是【可以用拖拽把视图推到歌曲末尾之后】。我们沿用同一夹法。
 * ========================================================================== */
function handleDragAutoscroll() {
  const dragging = (S.window === W_DRAGSELECTION || S.window === W_DRAGSECTION_START ||
    S.window === W_DRAGSECTION_END || S.select > 0);
  if (!dragging) {
    /* 不在拖拽状态时把四个累加量归零，下次越界从慢速重新起步。
       （GML 是靠 else 分支每条各自清零，效果等价。） */
    S.dragincxr = 0; S.dragincxl = 0; S.dragincyd = 0; S.dragincyu = 0;
    return;
  }
  const gx = S.gx, gy = S.gy;
  const totalcols = S.totalcols, totalrows = S.totalrows;
  /* 对照 GML 的 refreshrate >= 2 分支：高清/高刷屏上加速要更缓，
     否则一越界就瞬间飞出去。S.hires 对应原版的 hires 开关。 */
  const step = S.hires ? 0.025 : 0.1;
  const a0 = S.starta, b0 = S.startb;

  /* 右侧：mouse_x > x1 + 2 + 32 * totalcols - 32 */
  if (G.mouse.x > gx + 32 * totalcols - 32) {
    S.dragincxr = Math.min((S.dragincxr || 0) + step, 4);
    S.starta += Math.ceil(S.dragincxr);
  } else S.dragincxr = 0;

  /* 左侧：mouse_x < x1 + 32 */
  if (G.mouse.x < gx + 32) {
    S.dragincxl = Math.min((S.dragincxl || 0) + step, 4);
    S.starta -= Math.ceil(S.dragincxl);
  } else S.dragincxl = 0;

  /* 下侧：mouse_y > y1 + 34 + totalrows * 32（gy 已经是 y1+34，故直接用 gy） */
  if (G.mouse.y > gy + totalrows * 32) {
    S.dragincyd = Math.min((S.dragincyd || 0) + step, 4);
    S.startb += Math.ceil(S.dragincyd);
  } else S.dragincyd = 0;

  /* 上侧：mouse_y < y1 + 34 + 32 */
  if (G.mouse.y < gy + 32) {
    S.dragincyu = Math.min((S.dragincyu || 0) + step, 4);
    S.startb -= Math.ceil(S.dragincyu);
  } else S.dragincyu = 0;

  S.starta = median(0, S.starta, Math.max(0, S.enda));
  S.startb = median(0, S.startb, Math.max(0, S.endb));

  /* 框选/拖动选区时，锚点反向补偿（像素） */
  if (S.select > 0) {
    if (S.select_pressx !== -1) S.select_pressx += 32 * (a0 - S.starta);
    if (S.select_pressy !== -1) S.select_pressy += 32 * (b0 - S.startb);
  }
  /* 同步滚动条状态 —— 否则拖块位置与实际视口不符 */
  SB.val[0] = S.starta;
  SB.val[1] = S.startb;
}

function handleGridInput() {
  const gx = S.gx, gy = S.gy;
  const totalcols = S.totalcols, totalrows = S.totalrows;
  /* sela/selb 在"拖出边缘继续框选"时会被夹回网格内，所以必须 let */
  let sela = S.sela, selb = S.selb;

  if (S.window === W_DRAGSELECTION) {
    // 对照 control_draw.gml:516-533：
    //   selection_x = starta + floor((mouse_x - (x1+2)) / 32) - select_pressa
    //   selection_y = startb + floor((mouse_y - (y1+34)) / 32) - select_pressb
    // 这里 x1+2 = gx、y1+34 = gy，用的都是【未经取整】的 starta/startb，
    // 只对鼠标偏移做 floor —— 之前两边都 floor 过，逐页滚动剩小数时会差一格。
    /* 【必须把结果夹在网格范围内】
       原版 GML 依赖"鼠标出不了游戏窗口"这个前提，drag 时算出来最多溢出一两格。
       网页端鼠标可以随便拖到钢琴、工具栏、状态栏上，于是：
         · 往下拖到钢琴区 → floor((mouseY - gy)/32) 变成很大的正数，
           选区被甩到几十层之外，selectionExpandLayers() 再把层号一路撑开，
           原本的音符就被挤出有效范围、看起来像"被删掉了"；
         · 往上拖到工具栏 → 负偏移，虽然取了 Math.max(0,...) 但横向没夹，
           同样会把选区推到不存在的位置。
       夹的范围：列 0..enda、层 0..endb2（endb2 是已分配的层数，
       这样拖到最下面也不会凭空扩张层数）。 */
    /* 【横向不能夹到 enda —— 这是"拖动时被莫名往左拉几格、拖不回来"的根因】
       GML control_draw.gml:517-518 完全没有夹紧：
           selection_x = starta + floor((mouse_x - (x1+2)) / 32) - select_pressa
           selection_y = startb + floor((mouse_y - (y1+34)) / 32) - select_pressb
       只在松手那一刻（:527-528）取 `max(0, selection_x)`。
       原版之所以敢不夹：鼠标出不了游戏窗口，算出来的值最多溢出一点点。

       我们之前把拖动中的结果夹到 `0..S.enda`。问题在于：
         · S.enda 是【最后一个音符所在的列】，不是网格右边界。
           用户框选一块后想往右拖到空白区（很常见的操作：
           把一小节复制到后面几小节的空位），一旦越过 enda，
           目标列被夹回 enda —— 选区"啪"地弹回左边几格，
           看起来就是被莫名其妙往左拉；
         · 更糟的是它同时被夹在 0..enda 之间，指针再往右也没用，
           而往左移动时命中测试又依赖 SEL 位置 —— 于是"拖不回去"。

       正确做法（与 GML 的可见行为一致）：
         · 下限夹到 0（原版松手时才夹，拖动中允许负值，但负值没有意义，
           且会让命中测试区域消失，实践上夹 0 更稳）；
         · 上限放到【网格右缘 + 一个总列数】这种"足够远"的范围，
           而不是 enda。选区的合法性由 selectionExpandLayersSafe() 在
           松手时负责（它会按需把数组撑大到能容纳新位置）。
         · 层方向的 endb2 同理放宽到"当前已分配层数"，与横向对称。 */
    const maxA = Math.max(0, S.enda) + S.totalcols + 64;
    const maxB = Math.max(0, S.endb2 - 1);
    const nx = clamp(S.starta + floor((G.mouse.x - gx) / 32) - S.select_pressa, 0, maxA);
    const ny = clamp(S.startb + floor((G.mouse.y - gy) / 32) - S.select_pressb, 0, maxB);
    SEL.x = floor(nx); SEL.y = floor(ny);
    G.cursor = 'move';
    if (!G.mb[0]) {
      // 对照 control_draw.gml:526-532：松手时把坐标夹到 >=0，写历史，再 selection_expand_layers()
      S.window = W_RELEASE;
      const ox = S.selection_sx0, oy = S.selection_sy0;
      const fx = SEL.x, fy = SEL.y;
      if (ox !== fx || oy !== fy) {
        historyPush(() => { SEL.x = ox; SEL.y = oy; }, () => { SEL.x = fx; SEL.y = fy; });
        S.changed = 1;
      }
      selectionExpandLayersSafe();
    }
    return;
  }
  if (S.select > 0) {
    /* 【拖选结束时，终点必须落在网格内】
       用户报："在画布上按住左键选区，拖到钢琴上松手 → 音符少了一半"。
       原因是拖到网格外面之后 S.selbx / S.selby 会变成 -1
       （"指针不在任何格子上"的哨兵值），而松手那一帧直接拿它当终点：
           selectionAdd(select_pressa, select_pressb, -1, -1)
       于是矩形被压成左上角一格（Math.min(2,-1) = -1 → clip 成 0，
       median(0, -1, enda) = 0），原本覆盖 6 个音符的拖选只选中了 1 个 ——
       selectionAdd 会按新矩形重建内容，范围外的音符就"消失"了。
       正确处理：终点出界时，退回【最后一个有效格子】，
       也就是"拖到边界外 = 拖到边界"，这是所有选区工具的通行行为。

       注意 select_lastA/B 必须在读之前先更新（放在本块开头），
       否则读到的是上一帧的值，回退会慢一格；
       若一次都没进过网格（起点就在外面），才退回起始点。 */
    if (S.selbx >= 0 && S.selby >= 0) { S.select_lastA = S.selbx; S.select_lastB = S.selby; }
    const outOfGrid = (S.selbx < 0 || S.selby < 0);
    const endA = outOfGrid
      ? (typeof S.select_lastA === 'number' ? S.select_lastA : S.select_pressa)
      : S.selbx;
    const endB = outOfGrid
      ? (typeof S.select_lastB === 'number' ? S.select_lastB : S.select_pressb)
      : S.selby;
    // 拖选
    if (S.select === 1 && !G.mb[0]) {
      selectionAdd(S.select_pressa, S.select_pressb, endA, endB, G.alt, false);
      S.window = W_RELEASE; S.select = 0;
      S.select_pressx = -1; S.select_pressy = -1; S.select_pressa = -1; S.select_pressb = -1;
      S.select_lastA = undefined; S.select_lastB = undefined;
    }
    if (S.select === 2 && !G.mb[2]) {
      selectionRemove(S.select_pressa, S.select_pressb, endA, endB, false, false);
      S.window = W_RELEASE; S.select = 0;
      S.select_pressx = -1; S.select_pressy = -1; S.select_pressa = -1; S.select_pressb = -1;
      S.select_lastA = undefined; S.select_lastB = undefined;
    }
    // 同上：拖拽选区时也用普通箭头，不显示十字光标
    if (sela > -1 && selb > -1) G.cursor = 'default';
    return;
  }
  // 有拖拽状态（滚动条/标记/区间）或指针停在标记手柄上时，网格不响应
  // 注意：先放行「拖动选区」——它要在 window=0 时把自己的 window 抢过来。
  if (S.window === 0 && !S.playing && UI.textFocus < 0 && S.selected > 0) {
    const hit = selectionDragHitTest(gx, gy, totalcols, totalrows);
    if (hit) {
      G.cursor = 'move';
      if (G.mbp[0]) {
        // 对照 selection_draw.gml:66-71：进入拖拽，记下鼠标相对选区的偏移与起始位置
        S.window = W_DRAGSELECTION;
        S.select_pressa = hit.sa;
        S.select_pressb = hit.sb;
        S.selection_sx0 = SEL.x;
        S.selection_sy0 = SEL.y;
        return;
      }
    }
  }
  if (S.window !== 0 || S.playing || UI.textFocus >= 0) return;
  /* 【指针移出网格后不能直接 return —— 正在框选/拖动时必须继续跑】
     对照 control_draw.gml:211-217：
         if ((window = 0 || select > 0) && playing = 0 && !isplayer) {
             if (mouse_rectangle(网格) || select > 0) {
                 sela = floor(...); selb = floor(...); curs = cr_handpoint
             }
     原版的 sela/selb 在 `select > 0` 时【即使指针已在网格外也照常计算】，
     并继续往下走框选逻辑；配合 :1116-1153 的自动滚屏，才能"拖出边缘
     → 视图滚动 → 选区继续扩张"。
     我们之前在 `sela < 0 || selb < 0` 时直接 return，于是：
       · 指针一出网格，handleGridInput 整块跳过；
       · S.select 永远起不来（要等 selbx 变化，但它已经变成 -1）；
       · 而自动滚屏又要求 select > 0 / W_DRAG* 才生效 —— 死锁，
         拖出去什么都不会发生，选不到一屏之外的内容。
     现在：只有在【没有正在进行的框选】时才允许提前返回；正在框选时
     把指针坐标夹到网格边界内继续参与计算（等价于原版"鼠标出不了窗口"）。 */
  if (sela < 0 || selb < 0) {
    /* 【指针移出网格、但鼠标仍按着 → 可能是"拖出边缘"的开始，必须先把
       框选激活，不能直接 return】
       否则第一次越过边缘时 S.select 还是 0，这里就返回了，
       下面启动框选的判定（要 selbx !== select_pressa）永远没机会执行 ——
       S.select 起不来 → 自动滚屏也起不来，死锁。 */
    if (G.mb[0] && S.select_pressx !== -1 && S.window === 0) {
      /* 按着左键、且按下点在网格内（select_pressx 有值）→ 这就是拖出边缘，
         先激活框选，把坐标夹到边界内继续。 */
      S.select = 1;
    }
    if (!(S.select > 0) && S.window !== W_DRAGSELECTION) {
      // 既没在框选、也不是拖出边缘：网格外只处理滚轮
      handleWheel();
      return;
    }
    /* 正在框选/拖选区：坐标夹进网格内，继续走下面的判定与结算。
       自动滚屏（handleDragAutoscroll）已经在前面移动过 starta/startb，
       所以下一帧夹出来的列号会自然增大 —— 这就是"拖出去能继续选"。 */
    sela = clamp(sela, 0, Math.max(0, totalcols - 1));
    selb = clamp(selb, 0, Math.max(0, totalrows - 1));
    S.sela = sela; S.selb = selb;
    S.selbx = floor(S.starta) + sela;
    S.selby = floor(S.startb) + selb;
  }

  if (S.cursmarker) return;
  const exist = S.hover.exist;

  // 滚轮改属性
  if (exist && S.changepitch && G.wheel && S.editmode >= 0) {
    let diff = G.wheel * (G.shift && S.editmode === 0 ? 12 : (G.shift ? 1 : 10));
    const x = S.selbx, y = S.selby;
    let key = gKey(x, y), vel = gVel(x, y), pan = gPan(x, y), pit = gPit(x, y);
    if (S.editmode === 0) key = median(0, key + diff, 87);
    else if (S.editmode === 1) vel = median(0, vel + diff, 100);
    else if (S.editmode === 2) pan = median(0, pan + diff, 200);
    else if (S.editmode === 3) {
      const insName = INSTRUMENTS[gIns(x, y)] && INSTRUMENTS[gIns(x, y)].name;
      pit = insName === 'Tempo Changer' ? pit + diff : median(-1200, pit + diff, 1200);
    }
    changeBlockManual(x, y, gIns(x, y), key, vel, pan, pit);
    return;
  }
  handleWheel();

  // 按下
  /* 【画布输入必须"从画布开始"才算数】
     判据是按下那一刻指针在不在画布上，而不是松开时在不在。
     否则在滑块/按钮上按下、拖到画布上松手时，这一帧指针恰好在画布内，
     G.mbr[0] 为真、clickinarea 又为 1 —— 凭空落一个音符。

     另外 dragLocked() 表示"正在拖某个控件"（滑块/拖动条）：
     这类控件在拖动过程中指针经常会掠过画布，此时任何按下/松开都不该算画布操作。 */
  if (dragLocked()) {
    S.clickinarea = 0;
    return;
  }
  if (G.mbp[0] || G.mbp[2] || G.mbp[1]) S.clickinarea = 1;
  if (G.mbp[0]) {
    if (S.selected > 0 && !G.ctrl) { selectionPlace(false); S.dontplace = 1; }
    if (G.ctrl) selectionAdd(S.selbx, S.selby, S.selbx, S.selby, false, false);
    S.select_pressx = G.mouse.x; S.select_pressy = G.mouse.y;
    S.select_pressa = S.selbx; S.select_pressb = S.selby;
  }
  if (G.mb[0]) {
    if ((S.selbx !== S.select_pressa || S.selby !== S.select_pressb) && S.select_pressx !== -1) S.select = 1;
  }
  // 对照 control_draw.gml:578-594：只有中键按下才「吸管 + 试听」。
  // 右键在这段源码里纯粹是删除/擦除，从头到尾没有 play_sound，
  // 之前把试听挂在 G.mbp[2]（右键）上，所以右键删除音符会响一声——不是原版行为。
  if (G.mbp[1]) {
    // 中键吸管
    if (exist) {
      S.selected_key = gKey(S.selbx, S.selby);
      S.instrument = gIns(S.selbx, S.selby);
      if (G.ctrl) {
        S.selected_vel = gVel(S.selbx, S.selby);
        S.selected_pan = gPan(S.selbx, S.selby);
        S.selected_pit = gPit(S.selbx, S.selby);
      } else { S.selected_vel = 100; S.selected_pan = 100; S.selected_pit = 0; }
      if (INSTRUMENTS[S.instrument]) playSound(INSTRUMENTS[S.instrument], S.selected_key, S.selected_vel, S.selected_pan, S.selected_pit);
    }
  }
  if (G.mbp[2] && G.ctrl) { selectionRemove(S.selbx, S.selby, S.selbx, S.selby, false, false); }

  // 右键：按下记录起点；单击（不拖动且没删到方块）→ 弹出菜单；拖动 → 擦除 / 从选区移除
  /* 【对照 control_draw.gml:596-608】
       if (mouse_check_button(mb_right) && !keyboard_check(vk_control)) {
           if ((starta+sela != select_pressa || startb+selb != select_pressb) && select_pressx != -1) {
               select = 2
           } else if (exist = 1) {
               remove_block_manual(selbx, selby)
               select_pressx = -1
           }
       }
       if (mouse_check_button_released(mb_right)) {
           if (starta+sela = select_pressa && startb+selb = select_pressb && select_pressx != -1 && !ctrl) {
               ... 组装并 show_menu_ext("editext", ...) ...
           }
       }
     关键点：
       1. 原版删方块的前提是 `exist = 1`，而 exist 在 selected > 0 时恒为 0
          （:278），所以**有选区时右键绝不会删掉方块**。
       2. 删过方块之后原版会把 select_pressx 置 -1，
          于是下一个 `select_pressx != -1` 的判定为假 → 不弹菜单。
          单点右键删音符不弹菜单是【原版设计】，不是 bug。
       3. 有选区时 select_pressx 保持有效（因为没删），松手就弹菜单。
     我们之前的实现：
       - 用 `S.selected === 0 && exist` 判断删除（这一条是对的），
       - 但 exist 在 selected > 0 时也被误判为 1（已在上方修掉），
       - 并且 removed 标记没有同时清 select_pressx，导致状态不一致。 */
  if (G.mbp[2] && !G.ctrl) {
    S.rightPress = { x: S.selbx, y: S.selby, removed: false, moved: false };
    if (S.selected === 0 && exist) {
      removeBlockManual(S.selbx, S.selby);
      S.rightPress.removed = true;
      /* 对照 :601 —— 删过就把按下点作废，松手时不再弹菜单 */
      S.select_pressx = -1; S.select_pressy = -1;
    }
  }
  if (G.mb[2] && !G.ctrl && S.rightPress) {
    if (S.selbx !== S.rightPress.x || S.selby !== S.rightPress.y) {
      S.rightPress.moved = true;
      if (S.selected > 0) S.select = 2;          // 在选区上右键拖动 → 从选区擦除
      else if (exist) removeBlockManual(S.selbx, S.selby);   // 空区域右键拖动 → 连续擦除
    }
  }
  if (G.mbr[0] && S.clickinarea) {
    if (S.selected === 0) {
      if (!S.dontplace) {
        if (exist) {
          const ins = S.instrument;
          const cur = gIns(S.selbx, S.selby);
          if (cur !== ins || gKey(S.selbx, S.selby) !== S.selected_key ||
            gVel(S.selbx, S.selby) !== S.selected_vel || gPan(S.selbx, S.selby) !== S.selected_pan ||
            gPit(S.selbx, S.selby) !== S.selected_pit) {
            changeBlockManual(S.selbx, S.selby, ins, S.selected_key, S.selected_vel, S.selected_pan, S.selected_pit);
          }
        } else {
          addBlockManual(floor(S.starta) + sela, floor(S.startb) + selb, S.instrument, S.selected_key, S.selected_vel, S.selected_pan, S.selected_pit);
        }
      }
    } else if (S.select === 0 && !G.ctrl) {
      selectionPlace(false);
    }
    S.dontplace = 0;
    S.select = 0;
    S.select_pressx = -1; S.select_pressy = -1;
    S.select_pressa = -1; S.select_pressb = -1;
    /* 松开后立刻清掉"按下点在画布内"的标记。
       不清的话它会残留到下一次交互，与别的控件（滑块、按钮）的松开撞在一起。 */
    S.clickinarea = 0;
  }
  if (G.mbr[2]) {
    if (S.rightPress && !S.rightPress.moved && !S.rightPress.removed && !G.ctrl) {
      openEditContextMenu();
    }
    S.rightPress = null;
    S.select_pressx = -1;
  }
}

function handleWheel() {
  if (!G.wheel) return;
  /* 【滚轮语义取决于首选项 S.mousewheel —— 对照 control_draw.gml:310-344】
     GML 是三个互斥分支：
       :310  if (mousewheel = 1 && window = 0 && (exist = 0 || changepitch = 0)
                  && !isplayer && !volume_scroll)   → 换音色
       :329  if (mousewheel = 2 && …同上前提…)      → 换基准音（钢琴音调）
       （mousewheel = 0 时两个分支都不执行，滚轮只交给滚动条）
     注意原版【没有 Shift 修饰键】—— 用不用 Shift 是早期我们自己发明的分派方式，
     而且完全没有读 mousewheel，于是默认配置（0 = 滚轮移动位置）下
     滚一下滚轮就会静默改掉当前音色，与首选项里的选项正好相反，
     且不进入撤销历史。
     调用点保证了「改音符属性」的分支已经先跑过（handleGridInput 里
     exist && changepitch 的情况会提前 return），所以这里等价于
     GML 的 (exist = 0 || changepitch = 0) 前提。 */
  if (S.window !== 0 || S.playing || S.volume_scroll) return;
  const mw = S.mousewheel | 0;
  if (mw === 1) {
    /* 音色：G.wheel > 0（向下滚）→ 索引 -1；< 0（向上滚）→ +1。
       对照 :312-327 里 mouse_wheel_down() 减、mouse_wheel_up() 加。 */
    const idx = clamp(S.instrument - G.wheel, 0, INSTRUMENTS.length - 1);
    if (idx !== S.instrument) {
      S.instrument = idx;
      S.selected_vel = 100; S.selected_pan = 100; S.selected_pit = 0;
      if (INSTRUMENTS[idx]) playSound(INSTRUMENTS[idx], S.selected_key, 100, 100, 0);
    }
  } else if (mw === 2) {
    /* 基准音：对照 :330-343，向下滚 -1、向上滚 +1，范围 0..87 */
    if (G.wheel > 0 && S.selected_key > 0) {
      S.selected_key--;
      S.selected_vel = 100; S.selected_pan = 100; S.selected_pit = 0;
      playSound(INSTRUMENTS[S.instrument], S.selected_key, 100, 100, 0);
    }
    if (G.wheel < 0 && S.selected_key < 87) {
      S.selected_key++;
      S.selected_vel = 100; S.selected_pan = 100; S.selected_pit = 0;
      playSound(INSTRUMENTS[S.instrument], S.selected_key, 100, 100, 0);
    }
  }
  // mw === 0：滚轮用于滚动歌曲（由 draw_scrollbar 里的悬停分支处理），这里什么都不做
}

/* 对照 control_draw.gml:736-767：Ctrl + 滚轮 缩放窗口。
   原版这一段在 `window = 0 && text_focus = -1 && playing = 0 &&
   keyboard_check(vk_control) && !keyboard_check(vk_shift)` 里面，
   所以【必须按住 Ctrl】才不会和滚动条抢滚轮。之前完全没实现滚轮缩放。 */
function handleCtrlWheelZoom() {
  if (!G.wheel) return;
  if (S.window !== 0 || S.playing || UI.textFocus >= 0) return;
  if (!G.ctrl || G.shift) return;
  if (G.wheel < 0) zoomIn(); else zoomOut();
}

/* 时间轴 / 标记 / 区间交互（对照 control_draw:207-270 与 1109-1175） */
function handleTimelineInput() {
  const gx = S.gx, y1 = S.y1;
  const totalcols = S.totalcols, totalrows = S.totalrows;

  // 正在拖播放标记
  if (S.window === W_DRAGMARKER) {
    /* 【必须在 0..enda 之间夹紧 —— 用户报"播放刻度线可以被拖到负数"】
       原来是 (mouse_x - gx)/32 + floor(starta)，没有任何边界检查。
       鼠标往画布左边一拖（mouse_x < gx）就是负值，于是：
         · 刻度线画到画布外面（看不到，像是"消失了"）；
         · S.marker_pos 变负，后续所有按它算的列号/播放位置全部错乱
           （marker_pos 参与 note_offset、播放起点、区间运算）。
       对照 GML control_draw:1109 附近，原版是 `max(0, …)` 起步的，
       而且 enda 上限在别处另有 clamp；这里统一夹到 [0, enda]，
       让"拖到最左 = 第 0 列、拖到最右 = 最后一列"，符合通用预期。 */
    /* 【上限是 enda + totalcols，不是 enda】
       用户报："为什么现在刻度线没有办法被拖到最后一个音符后面了？"
       因为我第一次修"可以拖到负数"时把上限写成了 S.enda，
       那正好等于【最后一个音符所在的列】，于是刻度线被卡死在最后一个音符上，
       再往右一格都拖不过去 —— 而 GML 允许拖到整屏之后。
       对照 control_draw.gml：
         :1110  拖动时  marker_pos = (mouse_x - x1 + 2)/32 + starta   ← 不夹紧
         :1192  每帧末  marker_pos = median(0, marker_pos, enda + totalcols)  ← 夹紧
       所以正确范围是 [0, enda + totalcols]：左边从头开始，
       右边允许一直延伸到"当前视图再往后一整屏"。 */
    const raw = (G.mouse.x - gx) / 32 + floor(S.starta);
    S.marker_pos = median(0, raw, Math.max(0, S.enda + totalcols));
    /* 【千万不要在这里同步 marker_prevpos】
       这里曾经写过 `S.marker_prevpos = S.marker_pos;`，本意是"拖动时别让
       prevpos 落后"，结果把拖动试听整个弄哑了：
       drawEditor 的即时触发条件是
           floor(marker_pos) !== floor(marker_prevpos)   → 跨格了才发一列音
       把 prevpos 同步成 marker_pos 之后两者永远相等，跨格检测恒为 false，
       于是【拖动刻度线一个音都不响】—— 就是用户报的
       "手动拖动播放刻度线，无法播放音符"。
       prevpos 只应该由播放推进和正常跳转去更新，拖动过程中必须保持旧值，
       这样每拖过一列才能被检测到并播出来。 */
    /* 拖动标记会移动播放位置，已排期的未来音符必须作废，
       否则拖动后那些旧排期还会在原来的时刻响起。 */
    stopScheduledAudio();
    G.cursor = 'ew-resize';
    if (!G.mb[0]) S.window = W_RELEASE;
    return;
  }
  // 正在拖区间端点（松手时才整理顺序，但绘制时按 section_end<section_start 立即翻转）
  if (S.window === W_DRAGSECTION_START || S.window === W_DRAGSECTION_END) {
    const col = floor(S.starta) + round((G.mouse.x - gx) / 32);
    if (S.window === W_DRAGSECTION_START) S.section_start = col;
    else S.section_end = col;
    G.cursor = 'ew-resize';
    if (!G.mb[0]) {
      S.window = W_RELEASE;
      if (S.section_end === S.section_start) S.section_exists = 0;
      else {
        const a = S.section_start;
        S.section_start = Math.min(S.section_start, S.section_end);
        S.section_end = Math.max(a, S.section_end);
      }
    }
    return;
  }
  if (S.playing === 1 || S.window !== 0) return;
  if (S.select > 0) return;

  const mx = gx + floor(S.marker_pos * 32 - floor(S.starta) * 32);
  const inGridCol = mouseRectangle(gx, y1 + 2, totalcols * 32, totalrows * 32 + 64);

  // 播放标记手柄（跨整列高度，优先于区间手柄）
  if (mouseRectangle(mx - 8, y1, 16, totalrows * 32 + 32) && inGridCol) {
    S.cursmarker = 1;
    G.cursor = 'ew-resize';
    if (G.mb[0]) { S.window = W_DRAGMARKER; return; }
  }
  // 区间端点手柄
  if (S.section_exists && !S.cursmarker) {
    const sx = gx + floor(S.section_start * 32 - floor(S.starta) * 32);
    const ex = gx + floor(S.section_end * 32 - floor(S.starta) * 32);
    if (mouseRectangle(sx - 8, y1, 16, totalrows * 32 + 32) && inGridCol) {
      S.cursmarker = 1; G.cursor = 'ew-resize';
      if (G.mb[0]) { S.window = W_DRAGSECTION_START; return; }
    } else if (mouseRectangle(ex - 8, y1, 16, totalrows * 32 + 32) && inGridCol) {
      S.cursmarker = 1; G.cursor = 'ew-resize';
      if (G.mb[0]) { S.window = W_DRAGSECTION_END; return; }
    }
  }

  // 时间轴刻度条本体
  if (mouseRectangle(gx, y1 + 2, totalcols * 32, 32)) {
    if (S.select === 0 && G.mbp[2] && !S.cursmarker) openSectionMenu();
    if (G.mbp[0] && !S.cursmarker) S.timeline_pressa = floor(S.starta) + floor((G.mouse.x - gx) / 32);
    if (G.mbr[0] && !S.cursmarker) {
      /* 夹到 [0, enda + totalcols] —— 同拖动分支，对照 control_draw.gml:1192。
         左边防止点到时间轴外侧时算出负数；右边允许落到最后一个音符之后。 */
      S.marker_pos = median(0, floor(S.starta) + (G.mouse.x - gx) / 32,
        Math.max(0, S.enda + totalcols));
      // 点了时间轴 = 跳转播放位置，作废已排期的未来音符
      stopScheduledAudio();
      S.timeline_pressa = -1;
    }
    if (G.mb[0] && !S.cursmarker && S.timeline_pressa > -1) {
      const cur = floor(S.starta) + floor((G.mouse.x - gx) / 32);
      if (cur !== S.timeline_pressa) {
        S.window = W_DRAGSECTION_END;
        S.section_exists = 1;
        S.section_end = cur;
        S.section_start = S.timeline_pressa;
        S.timeline_pressa = -1;
      }
    }
  }
}

/* 钢琴 */
function handlePianoInput() {
  /* 【必须用 S.window === 0，不能用 isDialogWindow】
     对照 draw_piano.gml:141：
         if (window = 0 && text_focus = -1 && key_edit = -1 && !keyboard_check(vk_control))
     isDialogWindow(w) 对 TRANSIENT_WINDOWS（W_DRAG/W_DRAGMARKER/W_DRAGSELECTION/
     W_DRAGSECTION_START/W_DRAGSECTION_END/W_DRAGVOL/W_DRAGSTEREO/W_DRAGTEMPO/
     W_DRAGMARKER/W_RELEASE/W_INSBOX）返回 false，也就是这些拖拽状态下
     钢琴输入照常生效 —— 表现为「按住鼠标拖选/拖标记的同时敲钢琴快捷键，
     会一边拖一边录制音符」。这里改成严格等于 0，与原版一致。
     （同文件的 pianoInputOpen() 早就是正确写法，本函数之前漏了。） */
  if (!S.show_piano || S.fullscreen || S.window !== 0) return;
  const kc = S.dropmode ? 52 : S.keysshow;
  const px = floor(S.rw / 2 - (kc * 39) / 2);
  const py = S.rh - 154;
  /* 对照 control_draw.gml:2379：光标提示也要 window = 0。
     外层已经用 S.window !== 0 早退，所以这里能到达就说明 window === 0。 */
  if (mouseRectangle(px, py - 8, kc * 39, 136)) G.cursor = 'pointer';
  // 键盘按键
  if (UI.textFocus < 0 && S.key_edit === -1 && !G.ctrl) {
    for (let a = 0; a <= 87; a++) {
      const code = S.piano_key[a];
      if (!code) continue;
      const ch = String.fromCharCode(code);
      const want = G.keys[ch.toLowerCase()] || G.keys[ch.toUpperCase()];
      if (!S.key_press[a] && want) {
        if (S.select_lastpressed) { S.selected_key = a; S.selected_vel = 100; S.selected_pan = 100; S.selected_pit = 0; }
        if (!S.record) playSound(INSTRUMENTS[S.instrument], a, 100, 100, 0);
        if (S.playing === 0.25) togglePlaying(S.totalcols);
        if (S.playing && S.record) {
          let b = 0;
          while (!addBlockManual(ceil(S.marker_pos), b, S.instrument, a, 100, 100, 0)) b++;
        }
        S.key_press[a] = 1;
      } else if (!want) {
        S.key_press[a] = 0;
      }
    }
  }
}

/* ---------------------------------------------------------------- 绘制 */
/* Tempo Changer 方块的屏幕位置队列（对照 control_draw.gml:377 的
   tempo_changer_display_queue）。
   drawEditor() 里收集、drawTimeline() 里绘制，所以必须是模块级变量。
   每次 drawEditor 开始时清空。 */
const tempoQueue = [];

function drawEditor(dt) {  const c = G.ctx;
  const rw = S.rw, rh = S.rh;
  const x1 = S.x1, y1 = S.y1, gx = S.gx, gy = S.gy;
  const totalcols = S.totalcols, totalrows = S.totalrows;
  // 滚动位置可能是小数（逐帧跟随），索引一律取整，另用 note_offset 做亚格平滑。
  // 对照 control_draw.gml:375：
  //   note_offset = floor(((marker_pos - floor(marker_pos + 0.5 * !isplayer)) * 32) + 0.5)
  //                 * ((playing && marker_follow && marker_pagebypage = 2
  //                    && marker_pos - floor(totalcols/2 + 0.5) < enda + 1
  //                    && marker_pos - floor(totalcols/2 + 0.5) > 0) || isplayer)
  // 编辑器里 isplayer = 0，所以 `floor(marker_pos + 0.5 * 0)` 就是 floor(marker_pos)。
  // （注意别顺手写成 floor(marker_pos + 0.5)——那个 0.5 只在播放器模式下才存在，
  //  加上它会整整差一格，note_offset 在正负之间来回跳。）
  // 偏移量取自【starta 的小数部分】。
  //
  // 为什么不能用 frac(marker_pos)（原版 control_draw.gml:375 的写法）：
  //   画布把某一列画在  32*a - note_offset  处，其中 a = 列号 - floor(starta)。
  //   要让这一列随 starta 连续左移，就必须满足
  //       32*(列 - starta) ≈ 32*a - note_offset
  //   ⇒ note_offset 必须 ≈ 32*frac(starta)。
  //   原版用 frac(marker_pos) 也能对上，前提是 starta 与 marker_pos 的整数相位一致
  //   （按帧时 starta = marker_pos - ceil(totalcols/2)，只差一个【整数】，相位确实一致）。
  //
  //   但在浏览器里 starta 会被 median(0, …, enda) 夹住、每帧由播放推进累积浮点误差，
  //   一旦 starta 的整数相位与 marker_pos 错开，frac(marker_pos) 就会在 starta 还没跨
  //   整数时先归零 —— 表现为「每前进一刻，整个画布被往回拉一格」（实测 15/96 帧）。
  //
  //   直接改成 frac(starta) 就与 32*a - note_offset 的几何定义严格自洽：
  //   无论 starta 怎么来（跟随、夹取、浮点误差），画布都只跟着 starta 连续平移。
  {
    const center = floor(totalcols / 2 + 0.5);
    const inRange = (S.marker_pos - center < S.enda + 1) && (S.marker_pos - center > 0);
    const active = (S.playing && S.marker_follow && S.marker_pagebypage === 2 && inRange) ? 1 : 0;
    // frac(starta) ∈ [0,1)，乘 32 后用 floor 而不是 +0.5 四舍五入：
    // 若四舍五入，fs=0.999 时会得到 32，而此刻 floor(starta) 还没进位，
    // 于是「a 用旧值、noff 已跳到 32」→ 整个画面右移一格（回拉）。
    // 用 floor 保证 note_offset 严格落在 [0,31]，进位只由 floor(starta) 承担，
    // 两者永远同步，画布只做连续平移。
    const fs = S.starta - floor(S.starta);
    S.note_offset = floor(fs * 32) * active;
  }
  const sta = floor(S.starta), stb = floor(S.startb);
  const noff = S.note_offset;

  // 背景
  setAlpha(1);
  setColor(C.background);
  fillRect(0, 0, rw, rh);

  // 网格底色
  setColor(C.grid);
  fillRect(gx, gy, totalcols * 32, totalrows * 32);

  /* 播放列触发。
     正常播放走「提前排期」（scheduleAhead），由音频时钟决定发声时刻，
     后台降频也不会漏音；非播放状态（试听、拖动标记、快进）仍走即时触发。 */
  if (S.playing === 1 && S.forward === 0 && !S.marker_end && S.window !== W_DRAGMARKER) {
    scheduleAhead();
  } else if (floor(S.marker_pos) !== floor(S.marker_prevpos) && floor(S.marker_pos) <= S.enda &&
    (floor(S.marker_pos) !== S.section_end || S.window === W_DRAGMARKER || S.forward !== 0 || S.marker_end === 0 || S.marker_prevpos >= S.section_end)) {
    const diff = floor(S.marker_pos) - floor(S.marker_prevpos);
    let start;
    if (!S.playing || diff < 0 || diff > 3) start = floor(S.marker_pos);
    else start = floor(S.marker_prevpos) + 1;
    playColumnRange(start, floor(S.marker_pos));
    S.sched_col = floor(S.marker_pos) + 1;
  }
  if (S.tempo < 0.25) S.tempo = 0.25;

  // 列线（每 4 / 每小节）
  for (let a = 0; a < totalcols; a++) {
    const col = sta + a;
    if (col % (S.timesignature * 4) === 0) {
      setAlpha(0.3); setColor(C.gridLine);
      fillRect(gx + 32 * a - noff, gy, 1, totalrows * 32);
    } else {
      setAlpha(col % 4 === 0 ? 0.25 : 0.1);
      setColor(C.gridLine);
      line(gx + 32 * a - noff, gy, gx + 32 * a - noff, gy + totalrows * 32);
    }
  }
  setAlpha(1);

  // 音符
  const now = G.time;
  /* Tempo Changer 方块的屏幕位置队列（对照 control_draw.gml:377 的
     tempo_changer_display_queue）。在画方块时收集，画完网格再统一画 BPM 标签。
     【必须是模块级变量，不能是局部 const】——
     收集发生在 drawEditor()，绘制发生在 drawTimeline()，是两个函数。 */
  tempoQueue.length = 0;
  for (let a = 0; a < totalcols; a++) {
    const col = sta + a;
    if (col > S.enda) break;
    if (colamount[col] <= 0) continue;
    for (let b = 0; b < totalrows; b++) {
      const layer = stb + b;
      if (layer > S.endb) break;
      if (layer < colfirst[col] || layer > collast[col]) continue;
      if (!gExists(col, layer)) continue;
      const i = gidx(col, layer);
      /* 【fade：音符盒是否"不透明"】
         对照 control_draw.gml:398 `if (fade = 0) c = 0.5 * (song_vel/100) + 0.25`。
         fade = 0（默认）时，音符框的透明度跟着力度走：力度越大越实、越小越淡；
         fade = 1 时固定不透明，所有音符一样实。
         之前这里【无条件】按力度算 alpha，而首选项里的「音符盒不透明」
         这个复选框虽然画出来了、也能点，但 S.fade 从未被定义、
         更没被任何渲染代码读取 —— 是个纯死控件。
         （这是排查「琴键数量存不住」时顺手发现的：fade 也漏在持久化清单之外，
           顺着查下去才发现它连默认值和读取处都没有。） */
      let alpha = (S.fade ? 1 : 0.5 * (gVel(col, layer) / 100) + 0.25);
      if (S.lockedlayer[layer] === 0) {
        /* 亮度按「该音发声之后过了多久」衰减：刚响时 +0.5，1 秒后回到 0。
           由于排期是提前做的（scheduleAhead 会提前 0.25~1.5 秒），
           played[i] 经常是【未来时刻】。此时 now - played[i] < 0，
           表示"还没轮到它响" —— 一点都不能亮，必须直接跳过。
           踩过的坑：先前写成 Math.max(0, now-played) 再算 1-min(1,x)，
           结果未来时 x=0 → 1-0=1 → 给满亮度，刚好把"提前闪光"写到极致。
           正确写法是先用差值的符号把关，负值直接不加亮度。 */
        const dtPlayed = now - S.grid.played[i];
        if (dtPlayed >= 0) alpha += 0.5 * (1 - Math.min(1, dtPlayed));
      }
      let s = 0;
      if (S.playing === 0 && S.selected === 0) {
        if (S.selbx === col && S.selby === layer && controlInteractive() && !S.cursmarker) alpha += 0.5;
      }
      /* 【收集 Tempo Changer 方块的位置，供稍后画 BPM 标签】
         对照 control_draw.gml:408：
             if (instrument_list[...].name = "Tempo Changer")
                 array_push(tempo_changer_display_queue,
                     [x1 + 2 + 32*a - note_offset, y1 + 34 + 32*b,
                      string(abs(song_pit[...]))])
         也就是把屏幕坐标和 |pitch| 文本排队，等网格画完再统一画标签
         （1171-1190 那段 for 循环从后往前画，并做"同列只画最上面一个"的去重）。 */
      const _ins = INSTRUMENTS[gIns(col, layer)];
      if (_ins && _ins.name === 'Tempo Changer') {
        tempoQueue.push({
          x: gx + 32 * a - noff,
          y: gy + 32 * b,
          text: String(Math.abs(gPit(col, layer))),
        });
      }
      drawBlock(gx + 32 * a - noff, gy + 32 * b, gIns(col, layer), gKey(col, layer), gPan(col, layer), gVel(col, layer), gPit(col, layer), clamp(alpha, 0, 1.5), s);
    }
  }

  // 选区
  if (S.selected > 0) selectionDraw(gx, gy, totalcols, totalrows);

  /* 拖选矩形 —— 对照 control_draw.gml:976-995。
     关键点：GML 里【填充和描边用的是同一个颜色】，中间只改 alpha：
         draw_set_color(c_blue)              // select=2 时 c_red；theme=3 时 14120960
         draw_set_alpha(0.25); draw_rectangle(..., 0)   // 填充
         draw_set_alpha(1);    draw_rectangle(..., 1)   // 描边
     之前的写法在描边前把颜色换成了 C.accent —— 于是填充是蓝、描边是主题高亮蓝
     （Fluent 下还偏青），两者不是同一个颜色，看起来就是"选择框的颜色不对"。
     现在统一用一个 col 变量，只改 alpha。

     颜色值也按 GML 校准：
       · 非 Fluent：c_blue = #0000ff
       · Fluent   ：14120960 = 0xD77800。GameMaker 的颜色是【BGR】打包，
                    所以 0xD77800 → R=0x00, G=0x78, B=0xD7 → RGB(0,120,215)
                    = #0078D7，也就是 Fluent 的那支标准蓝。
                    （之前这里写成 make_color_rgb(0xD7,0x78,0x00)，
                     把 BGR 当成 RGB 读，算出一个橙色，完全错了。）
       · 反选（select = 2）：c_red = #ff0000，任何主题都一样 */
  if (S.select > 0) {
    const col = (S.select === 2) ? '#ff0000'
      : (S.theme === 3 ? '#0078d7' : '#0000ff');
    const x2 = S.starta === 0 ? Math.max(gx, G.mouse.x) : G.mouse.x;
    const y2 = S.startb === 0 ? Math.max(gy, G.mouse.y) : G.mouse.y;
    setColor(col);
    setAlpha(0.25);
    fillRect(S.select_pressx, S.select_pressy, x2 - S.select_pressx, y2 - S.select_pressy);
    setAlpha(1);
    // 描边沿用同一个颜色（GML 没有重新设色）
    setColor(col);
    G.ctx.lineWidth = 1;
    G.ctx.strokeRect(S.select_pressx + 0.5, S.select_pressy + 0.5, x2 - S.select_pressx, y2 - S.select_pressy);
  }

  // 锁定层斜纹
  for (let b = 0; b < totalrows; b++) {
    if (S.lockedlayer[S.startb + b]) {
      const f = frame('spr_lock', 0);
      if (f) {
        setAlpha(0.18);
        c.save();
        c.translate(gx, gy + 32 * b);
        c.scale(totalcols, 1);
        c.drawImage(f.img, f.sx, f.sy, f.w, f.h, 0, 0, 32, 32);
        c.restore();
        setAlpha(1);
      }
    }
  }

  // 时间轴
  drawTimeline();

  // 面板底色
  setColor(C.panel);
  fillRect(0, 0, rw, y1 + 2);
  /* 网格外围的"墙"（对照 control_draw.gml:1234-1239）。
     【四个数字必须和 GML 一模一样，差 1~2px 就会在滚动条旁边露出一条缝】
        · 左下墙  y 从 y1 + rows*32 + 50 起   ← 原来写成 +52，多留了 2px 空档
        · 右墙    y 到 y1 + rows*32 + 49 为止  ← 原来写成 +48，少铺 1px 空档
        · 右下角补块 17x18 起于 (x1+cols*32+2, y1+rows*32+32)（无偏移，本来就对）
     这几块墙铺的是面板底色，而滚动条背景精灵是更亮的一档颜色，
     两者之间只要差几个像素就会形成一条明显的浅色细线 ——
     用户看到的就是"滚动条没有紧贴画布边缘，中间有微小缝隙"。 */
  if (!S.fullscreen) {
    if (S.show_layers) fillRect(0, y1 + 3, x1 + 1, rh - y1 - 3);
    fillRect(gx, S.y1 + totalrows * 32 + 50, rw - gx, rh);
    fillRect(gx + totalcols * 32 + 18, y1 + 3, rw - (gx + totalcols * 32 + 18), totalrows * 32 + 49);
    setColor(C.panel);
    fillRect(gx + totalcols * 32 + 2, S.y1 + totalrows * 32 + 32, 17, 18);
  }

  /* 【这里不再"补画一次播放标记" —— 恢复 GML 的原始叠放顺序】
     曾经为了修"marker_pos=0 时倒三角左半边被层操作栏盖掉"，在这里
     把所有面板底色铺完之后又把 marker 画一遍到最上层。那确实让三角完整了，
     但也带来一个更严重的问题（用户报）：
         "播放刻度线停在 0 刻度线的时候，如果把画布的横向滑块往右边拉一点，
          刻度线就覆盖在了层操作区的上方，按理来说应该在下方的"。
     根因：spr_marker 的帧是 16 宽、原点 xo = 8，所以锚点左侧 8px 必然外溢。
     而网格左边界 gx = x1 + 2，锚点落在 gx 时左缘 = x1 - 6 ——
     正好 6px 压在层操作区上。原版把 marker 画在 control_draw:1220、
     层操作栏在 :1312，层栏【后画】所以会盖住这 6px；
     我们把它补画到最上层，等于让这 6px 反过来盖住层栏。
     用户明确要求"应该在下方的"，所以这里去掉补画，回到 GML 的顺序：
     marker 归 drawTimeline 画一次，层操作栏随后覆盖其上。
     （网格内部那部分不受影响 —— 上面几处面板底色 fillRect 都只覆盖
      层栏区 / 网格下方 / 网格右侧，没有一块会盖住网格内部。）
     另：markerScreenX() 的夹紧仍然保留，否则 starta 远大于 marker_pos 时
     整条线会跑到层区深处，那才是真正的错误位置。 */

  // 滚动条
  /* 对照 control_draw.gml:1245-1262：
       非全屏：横条贴在网格下方、竖条贴在网格右侧（普通静态位置）
       全屏：  改成【浮动滚动条】——贴在屏幕最下边/最右边，
               平时藏起来（anim = 0），指针移到那 25px 热区才升起来，
               离开后自动收回。热区高度 16px 就是滚动条自身的厚度。
     我们之前是全屏时整块跳过，于是全屏下完全不能滚动视图 ——
     只能靠拖动画布边缘的自动滚屏或键盘，长歌曲在全屏里几乎没法导航。
     原版的"升起/收起"是每帧 ±(2*30/room_speed) 的缓动，
     对应 60fps 下约 1 单位/帧，最快 16 帧（约 0.27 秒）走完。 */
  if (!S.fullscreen) {
    drawHScrollbar();
    drawVScrollbar();
  } else {
    drawFullscreenScrollbars();
  }

  // 图层面板
  if (!S.fullscreen && S.show_layers && !S.portrait) drawLayersPanel();

  // 宏工具条
  if (S.selected !== 0 && S.show_piano && !S.portrait) drawMacroBar();

  // 顶栏
  /* 全屏时【不画】顶栏和状态栏 —— 这就是"上方各种控件全部飘在画布上"的来源。
     全屏的本意是让网格铺满整屏，把工具栏留在上面会盖住网格最上面两行；
     原版 Draw_0.gml:5 里 `if (obj_controller.fullscreen)` 就是整块跳过的。
     但退出入口不能跟着一起消失，所以下面单独画一个右下角的「返回」按钮。 */
  if (!S.fullscreen) {
    drawTopBar();
    drawStatusBar();
    drawInfoBoxes();
  } else {
    drawFullscreenExit();
  }
  // 钢琴
  if (!S.fullscreen && (S.show_piano || S.dropmode) && !S.portrait) drawPianoAll();
  // 竖屏抽屉（图层面板 / 琴键 / 属性，都在这一个浮层里）
  drawDrawer();
  // 提示消息
  drawMsg();

  // 删除特效
  for (let i = removeEffects.length - 1; i >= 0; i--) {
    const e = removeEffects[i];
    e.t = (e.t || 0) + dt * 3;
    if (e.t > 1) { removeEffects.splice(i, 1); continue; }
    setAlpha(1 - e.t);
    setColor(C.accent);
    G.ctx.strokeRect(gx + e.x * 32 + 0.5, gy + e.y * 32 + 0.5, 31, 31);
    setAlpha(1);
  }

  S.marker_prevpos = S.marker_pos;
  S.prevwindow = S.window;
}

/* ---------------------------------------------------------------- 音符方块 */
function drawBlock(x, y, ins, key, pan, vel, pit, alpha, salpha) {
  const index = ins;
  if (index === undefined || index < 0 || index >= INSTRUMENTS.length) return;
  const iscustom = index >= S.first_custom_index;
  let fr = iscustom ? ((index - S.first_custom_index) % 18 + S.first_custom_index) : index;
  let sprite = S.use_colors ? (S.use_shapes ? 'spr_block_color_shape' : 'spr_block_color') : (S.use_shapes ? 'spr_block_shape' : 'spr_block');
  if (!S.use_colors && !S.use_shapes) fr = 1;
  setAlpha(alpha);
  drawSprite(sprite, fr, x, y);
  setAlpha(1);

  if (S.use_icons) {
    // 对照 draw_block.gml：
    //   draw_icon_customins(xx + 16, yy + 16, index - first_custom_index, alpha, true, 1)
    //   draw_sprite_ext(spr_instrumenticons, index, xx + 16, yy + 16, 1, 1, 0, -1, alpha)
    // spr_instrumenticons 是 16x16、原点 (0,0)，所以图标占据的是方块的「右下四分之一格」
    // (xx+16 .. xx+32, yy+16 .. yy+32)，不是居中。
    // 之前写成 x+8 / y+8（居中），位置就是用户看到的「图标在音符块中位置错了」。
    if (iscustom) drawCustomInsIcon(x + 16, y + 16, index - S.first_custom_index, alpha);
    else drawSprite('spr_instrumenticons', index, x + 16, y + 16, 1, 1, null, alpha);
  }

  // 音高偏离提示
  if (pit < 0) {
    setColor(COL.red); setAlpha(Math.min(0.5, (-pit / 100) * alpha * 0.25));
    fillRect(x, y, 32, 32); setAlpha(1);
  } else if (pit > 0) {
    setColor(COL.blue); setAlpha(Math.min(0.5, (pit / 100) * alpha * 0.25));
    fillRect(x, y, 32, 32); setAlpha(1);
  }
  // 不兼容红框
  if (S.show_incompatible && (INSTRUMENTS[index] && INSTRUMENTS[index].user || key < 33 || key > 57)) {
    setColor(COL.red); setAlpha(1);
    G.ctx.lineWidth = 1;
    G.ctx.strokeRect(x + 1.5, y + 1.5, 29, 29);
  }
  setColor('#ffffff');
  if (salpha > 0) {
    drawSprite('spr_block_sel', 0, x, y, 1, 1, null, salpha);
    setAlpha(1);
  } else {
    setAlpha(Math.min(1, alpha + 0.15));
  }
  // 数字
  setFont(FONT.main(11));
  setColor('#ffffff');
  // 对照 draw_block.gml 的 (xx + 16 - 8 * (use_icons))：
  // 开启音色图标时，图标占据右侧 (xx+16..xx+32) 那一块，文字要左移 8px 让位，
  // 否则会和图标叠在一起。关图标时不偏移。数字和音名用的是同一个偏移。
  const txtOff = S.use_icons ? 8 : 0;
  if (S.show_numbers) {
    let s = '';
    if (S.editmode === 0) s = (key < 33 ? ' < ' : '') + (key > 57 ? ' > ' : '') + (key > 32 && key < 58 ? String(key - 33) : '');
    else if (S.editmode === 1) s = String(vel);
    else if (S.editmode === 2) s = (pan < 100 ? 'L ' : pan > 100 ? 'R ' : '') + String(Math.abs(pan - 100));
    else if (S.editmode === 3) s = (pit > 0 ? '+' : '') + String(pit);
    text(x + 16 - txtOff, y + 14, s, 'center');
  }
  // 音名
  setColor(C.dark ? '#ffffff' : '#ffdd00');
  setFont(FONT.main(10));
  text(x + 16 - txtOff, y + 2, getKeyname(key, S.show_octaves), 'center');
  setAlpha(1);
  setFont(FONT.main());
}

/* 对照 draw_icon_customins(xx, yy, ins, alpha, large=true, scale=1)
   large 分支（音符块里用的就是这个）：
     display = (ins + 1) % 100
     num1 = floor(display / 10), num2 = display % 10
     color1 = make_color_hsv((ins * 16) % 256, 192, 255)   —— 图标底色
     color2 = make_color_hsv((ins * 16) % 256, 255, 128)   —— 数字描边
     先画 16x16 的 spr_instrumenticons[first_custom_index] 染成 color1，
     再画 spr_numbers_mc 的两位数字：阴影在 (xx+3, yy+5)/(xx+9, yy+5) 用 color2，
     正文在 (xx+2, yy+4)/(xx+8, yy+4) 用白色。
   注：原版 large 分支用的是 spr_numbers_mc（5x7），非 large 分支才用 spr_numbers（3x5）。
   这里按 large 分支照搬。spr_numbers_mc 没有打进图集，所以数字用等宽的 5x7 手绘像素字兜底，
   位置严格按源码的 +2/+3 与 +8/+9 偏移，视觉结果一致。 */
function hsvHex(h, s, v) {
  // GameMaker make_color_hsv: h 0..255, s/v 0..255
  const hh = (h / 255) * 6, ss = s / 255, vv = v / 255;
  const i = floor(hh) % 6, f = hh - floor(hh);
  const p = vv * (1 - ss), q = vv * (1 - ss * f), t = vv * (1 - ss * (1 - f));
  let r, g2, b2;
  if (i === 0) { r = vv; g2 = t; b2 = p; }
  else if (i === 1) { r = q; g2 = vv; b2 = p; }
  else if (i === 2) { r = p; g2 = vv; b2 = t; }
  else if (i === 3) { r = p; g2 = q; b2 = vv; }
  else if (i === 4) { r = t; g2 = p; b2 = vv; }
  else { r = vv; g2 = p; b2 = q; }
  const to = (x) => { const n = Math.max(0, Math.min(255, Math.round(x * 255))); return n.toString(16).padStart(2, '0'); };
  return '#' + to(r) + to(g2) + to(b2);
}

/* spr_numbers_mc 的 5x7 点阵（0-9），用于自定义音色图标上的两位编号。
   原版直接画 spr_numbers_mc 精灵；这里没有该图集，用手写点阵重现同样的 5x7 字形。 */
const NUMBERS_MC_5x7 = [
  '01110' + '10001' + '10011' + '10101' + '11001' + '10001' + '01110', // 0
  '00100' + '01100' + '00100' + '00100' + '00100' + '00100' + '01110', // 1
  '01110' + '10001' + '00001' + '00010' + '00100' + '01000' + '11111', // 2
  '11111' + '00010' + '00100' + '00010' + '00001' + '10001' + '01110', // 3
  '00010' + '00110' + '01010' + '10010' + '11111' + '00010' + '00010', // 4
  '11111' + '10000' + '11110' + '00001' + '00001' + '10001' + '01110', // 5
  '00110' + '01000' + '10000' + '11110' + '10001' + '10001' + '01110', // 6
  '11111' + '00001' + '00010' + '00100' + '01000' + '01000' + '01000', // 7
  '01110' + '10001' + '10001' + '01110' + '10001' + '10001' + '01110', // 8
  '01110' + '10001' + '10001' + '01111' + '00001' + '00010' + '01100', // 9
];
function drawNumbersMc(n, x, y, colorHex, alpha) {
  const g = NUMBERS_MC_5x7[((n % 10) + 10) % 10];
  if (!g) return;
  setColor(colorHex || '#ffffff');
  setAlpha(alpha === undefined ? 1 : alpha);
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 5; c++) {
      if (g[r * 5 + c] === '1') fillRect(floor(x) + c, floor(y) + r, 1, 1);
    }
  }
  setAlpha(1);
}

function drawCustomInsIcon(xx, yy, ins, alpha) {
  const display = (ins + 1) % 100;
  const num1 = floor(display / 10), num2 = display % 10;
  const hue = (ins * 16) % 256;
  const color1 = hsvHex(hue, 192, 255);
  const color2 = hsvHex(hue, 255, 128);
  // 图标本体：spr_instrumenticons 的 first_custom_index 帧（17 帧里的最后一帧是自定义占位）
  drawSprite('spr_instrumenticons', S.first_custom_index, xx, yy, 1, 1, color1, alpha);
  // 数字阴影（color2）与正文（白），偏移严格按 draw_icon_customins 的 large 分支
  drawNumbersMc(num1, xx + 3, yy + 5, color2, alpha);
  drawNumbersMc(num2, xx + 9, yy + 5, color2, alpha);
  drawNumbersMc(num1, xx + 2, yy + 4, '#ffffff', alpha);
  drawNumbersMc(num2, xx + 8, yy + 4, '#ffffff', alpha);
}

/* ---------------------------------------------------------------- 时间轴 */
function drawTimeline() {
  const gx = S.gx, y1 = S.y1;
  const totalcols = S.totalcols;
  const noff = S.note_offset || 0;
  setAlpha(1);
  drawSprite('spr_timeline', (S.theme === 2 || (S.fdark && S.theme === 3)) ? 1 : 0, gx, y1 + 2, totalcols * 32 + 18, 1);

  setFont(FONT.small());
  setColor(S.theme === 2 || S.fdark ? '#ffffff' : '#000000');
  /* 时间刻度。
     【关键】这里不能无脑减 noff，也不能无脑用连续的 starta。
     原因：画布那一侧是「整数列 + note_offset 补偿」——
         屏幕位置 = gx + 32*a - noff，数据列 = floor(starta) + a
     所以 32*a - noff ≈ 32*(列 - starta)，也就是 starta 的小数部分只由 noff 承担一次。
     而时间轴的 xx 本来就是用 starta 连续算的：
         xx = (ceil(starta/T) - starta/T) * 32T
     它【已经包含】了 starta 的小数部分。若再减 noff，小数就被算了两遍，
     跨整数边界时 noff 从 ~32 猛然归 0，刻度整体被往回拉一格 —— 就是「按帧时每前进
     一刻时间条被拉回一刻、不断跳动闪烁」。
     ⇒ 按帧跟随（连续滚动）时：用连续 starta，且【不减 noff】。
     ⇒ 按刻/按页（逐格跳）时：用 floor(starta)，并【不减 noff】（此时 noff 本来就是 0）。
     这样时间轴与画布在两种模式下都严格同步：按刻一起逐格跳，按帧一起连续滑。 */
  const smoothTL = (S.playing === 1 && S.marker_follow === 1 && S.marker_pagebypage === 2);
  const tlSta = smoothTL ? S.starta : floor(S.starta);
  let ct = 1;
  if (S.tempo < 3.5) ct = 5;
  if (S.tempo < 1) ct = 10;
  if (S.tempo < 0.5) ct = 30;
  if (S.tempo > 11) ct = 0.5;
  if (S.tempo > 18) ct = 0.25;
  let a0 = Math.ceil(tlSta / (S.tempo * ct)) * ct;
  let xx = (Math.ceil(tlSta / (S.tempo * ct)) - (tlSta / (S.tempo * ct))) * (32 * S.tempo * ct);
  while (xx < totalcols * 32 + 16) {
    if (a0 > 0) text(gx + xx, y1 + 2, timeStr(a0), 'center');
    setAlpha(0.6);
    setColor(S.theme === 2 || S.fdark ? '#ffffff' : '#000000');
    line(gx + xx, y1 + 14, gx + xx, y1 + 17);
    setAlpha(1);
    xx += (32 * S.tempo) * ct;
    a0 += ct;
  }
  // 刻度数字
  // 对照 control_draw.gml:1026-1034：
  //     b = ((starta + a) mod 4 == 0)
  //     draw_text(..., string(starta + a))
  // 注意源码用的是【没取整的 starta】，不是 floor(starta)。
  // 按帧跟随时 starta 是小数（marker_pos - totalcols/2），
  // 之前这里写成 floor(S.starta)+a，数字会比实际滚动位置早/晚一格跳，
  // 看起来就是「时间轴和画布滚得不一样、来回抽搐」。
  // 与上面时间刻度同理：把「列号」和「像素位置」统一到同一个基准上。
  //  - 按帧跟随：列号用连续 starta，位置【不减 noff】（xx 式已含小数）
  //  - 逐格跳：列号与位置都用 floor(starta)，位置不减 noff（此时 noff 恒为 0）
  for (let a = 0; a <= totalcols; a++) {
    const col = tlSta + a;
    const isBar = ((col % 4) === 0);
    setAlpha(0.6);
    line(gx + 32 * a, y1 + 33, gx + 32 * a, y1 + 30 - 3 * (isBar ? 1 : 0));
    setAlpha(1);
    if (isBar) text(gx + 32 * a, y1 + 17, String(Math.round(col)), 'center');
  }

  // 区间（对照 control_draw:1175-1189）
  // 顺序说明：源码是先画三角再画竖线（1184/1185、1187/1188），但 spr_marker 的水平原点
  // 是 8（三角 16px 宽、以锚点为中心），竖线只有中间 2px 宽，所以线正好压在倒三角的
  // 正中间那一列上。用户反馈「线覆盖在倒三角上面」看着别扭，这里把同一个 x 的竖线先画、
  // 三角后画，几何位置与源码完全一致，只是叠放次序反过来，避免线在三角上切一刀。
  if (S.section_exists) {
    // 与时间刻度同一个道理：下面所有位置都已经用 starta 连续算过一遍小数，
    // 不能再减 noff，否则按帧时整个区间会被往回拉一格（来回闪）。
    const sa = tlSta;
    // 对照源码：区间底色是纯蓝 25%，标记三角形用 draw_theme_color()（浅色主题=黑，深色=白）
    S.section_start = median(0, S.section_start, S.enda + totalcols);
    S.section_end = median(0, S.section_end, S.enda + totalcols);
    setAlpha(0.25); setColor('#0000ff');
    fillRect(gx + floor(S.section_start - sa + 0.5) * 32, y1 + 2,
      (floor(S.section_end - sa + 0.5) - floor(S.section_start - sa + 0.5)) * 32, 31);
    setAlpha(1);
    const mkc = C.dark ? '#ffffff' : '#000000';
    setColor(mkc);
    const flip = S.section_end < S.section_start ? 2 : 0;
    const lineH = (S.totalrows + 1) * 32 / 15;
    let ax = floor(S.section_start * 32 - sa * 32 + 0.5);
    let sx = gx + floor(ax / 32 + 0.5) * 32;
    drawSprite('spr_marker', 3 + flip, sx, y1 + 2, 1, lineH, 1, mkc);
    drawSprite('spr_marker', 2 + flip, sx, y1 + 2, 1, 1, mkc);
    ax = floor(S.section_end * 32 - sa * 32 + 0.5);
    const ex = gx + floor(ax / 32 + 0.5) * 32;
    drawSprite('spr_marker', 5 - flip, ex, y1 + 2, 1, lineH, 1, mkc);
    drawSprite('spr_marker', 4 - flip, ex, y1 + 2, 1, 1, mkc);
    setAlpha(1);
  }

  /* 【BPM 标签：Tempo Changer 方块上方显示 "BPM = <值>"】
     对照 control_draw.gml:1171-1190（在 marker 之前画，所以标签会被 marker 压住，
     这正是原版的层次）。核心逻辑：
       · 从队尾往前遍历（后画的在下面，所以倒序能保证同列"取最上面那个"）
       · xx != last_tc_x 时把 last_tc_y 归零 —— 换了一列就允许重新显示
       · 只有 yy > last_tc_y 才画 —— 同一列里只画最靠上的那个
       · 用 spr_marker 的 0/1 帧当标记框，框内写 BPM 文本
     spr_marker 帧约定：0/1 是这组标记框（theme 2 / blackout / fdark 时 +8）。 */
  if (S.midiTempoChanger || tempoQueue.length) {
    setFont(FONT.main());
    const tcFrame = 8 * ((S.theme === 2 || S.blackout || (S.theme === 3 && S.fdark)) ? 1 : 0);
    // 标签底色：对照 gml:1207-1210 的分主题取色
    let tagBg = '#ffffff';
    if (S.theme === 2) tagBg = '#363636';
    else if (S.theme === 3) tagBg = '#fcfcfc';
    if (S.theme === 3 && S.fdark) tagBg = '#2d2d2d';
    let lastTcX = 0, lastTcY = 0;
    for (let i = tempoQueue.length - 1; i >= 0; i--) {
      const it = tempoQueue[i];
      const xx = it.x, yy = it.y;
      const label = 'BPM = ' + it.text;
      if (xx !== lastTcX) lastTcY = 0;
      if (yy > lastTcY) {
        // 标记框（gml:1205-1206：spr_marker 第 0 帧和第 1 帧，第二帧下移 15）
        drawSprite('spr_marker', tcFrame + 0, xx, y1 + 2);
        drawSprite('spr_marker', tcFrame + 1, xx, y1 + 2 + 15);
        const tw = textWidth(label);
        // 底板 + 边框（gml:1211-1212 draw_rectangle / draw_area）
        setColor(tagBg);
        fillRect(xx + 10, y1 + 4, tw, 12);
        setColor(C.areaBorder || C.controlBorder);
        roundRect(xx + 9, y1 + 3, xx + 11 + tw, y1 + 17, 0, false);
        // 文本（gml:1213-1214：draw_theme_color() 之后画，Fluent 时 y 少 1）
        setColor(C.text);
        text(xx + 10, y1 + 2 + (S.theme !== 3 ? 1 : 0), label);
        lastTcY = yy;
      }
      lastTcX = xx;
    }
    setAlpha(1);
  }

  // 播放标记（对照 control_draw.gml:1219-1221）
  //   a = floor(marker_pos * 32 - starta * 32)
  //   draw_sprite_ext(spr_marker, ..., x1 + 2 + a, y1 + 2, ...)
  // 关键：【这里不减 note_offset】。按帧跟随时 starta = marker_pos - totalcols/2（见上方
  // handlePlayback），所以 marker_pos*32 - starta*32 恒等于 totalcols/2*32 这个常数，
  // 刻度线就固定在屏幕中间不动，只有底下的网格靠 note_offset 做亚格平滑地滚动。
  // 之前在这里多减了一个 noff，等于把网格的滚动量又叠加到刻度线上，
  // 每帧来回抖 —— 用户看到的就是「按帧时进度条和时间轴一直抽搐」。
  const mxx = markerScreenX();
  // 同上：先竖线、后倒三角，避免线切在三角上
  drawMarkerAt(mxx, y1);
  setAlpha(1);
  setFont(FONT.main());
}

/* 播放标记在屏幕上的 x 坐标。
   【必须夹在网格范围内，否则 starta > marker_pos 时会画到层操作区上面】
   用户报："播放刻度线停在 0 刻度线的时候，如果把画布的横向滑块往右边拉一点，
   刻度线就覆盖在了层操作区的上方，按理来说应该在下方的"。

   GML control_draw.gml:1219-1220 的算法是
       a = floor(marker_pos * 32 - starta * 32)
       draw_sprite_ext(spr_marker, ..., x1 + 2 + a, y1 + 2, ...)
   marker_pos = 0、starta = 3 时 a = -96，落点 x1+2-96 = 170，
   而层操作区占 0..x1（264）。原版不会露到层区上，是因为：
     · 原版 marker 是在网格绘制流程里画的，与网格共用裁剪区；
     · 更关键的是原版 marker_pos 与 starta 不会长期保持这种关系 ——
       starta 由滚动条驱动时 marker_pos 也在 0..enda 内，
       而 scrollbar 的 starta 上限是 enda（marker_pos=0 时 starta 通常就是 0）。
   我们的横向滚动条允许 starta 独立推进到 enda（用户可以把视图往后翻，
   而播放位置停在 0），于是这个组合在网页端很常见。

   处理：把落点夹在 [gx, gx + totalcols*32 - 8]。
     左界取 gx（= marker_pos=0、starta=0 时的自然落点）：
     这正是原版在最左端的位置，倒三角那 8px 左溢由"补画到最上层"负责
     （那是之前单独修过的问题，不能因为这次夹紧又退回去）。
     再往左就让 starta 自由滚动没有意义了 —— 播放位置已经在第一格，
     刻度线不该横向滑进层操作区。
     右界留 8px，避免竖线露到右侧滚动条区。 */
function markerScreenX() {
  const gx = S.gx;
  const raw = gx + floor(S.marker_pos * 32 - S.starta * 32);
  const lo = gx;
  const hi = gx + S.totalcols * 32 - 8;
  return raw < lo ? lo : (raw > hi ? hi : raw);
}

/* 播放标记（竖线 + 顶部倒三角）的独立绘制。
   抽成函数是因为它要在【两个时机】各画一次：
     1) drawTimeline() 里正常画一次（顺序与原版一致）；
     2) 面板底色 / "墙" 画完之后再画一次 ——
        用户报："播放进度处于 0 的时候，刻度线顶部的倒三角会被层操作栏遮挡一部分。"
        根因：倒三角 sprite 是 16x15、原点 xo=8，所以它横跨 marker 左右各 8px。
        当 marker_pos = 0 时 mxx = gx = 266，三角覆盖 258..274，
        其中 258..265 落在层操作栏那一列（x < x1+1 = 265）。
        而 drawEditor 里 `fillRect(0, y1+3, x1+1, rh)` 是【在 drawTimeline 之后】
        才执行的（那是 GML control_draw:1234 的面板底色填充），
        于是它把三角的左半边整块刷掉了 —— 看起来就是"三角缺了一角"。
        原版 GML 的顺序确实也是 marker(1220) 在墙(1234) 之前，
        但原版的层操作栏由独立对象在其后绘制，三角同样会被压到下面；
        这里的处理是【把三角补画到最上层】，保证它始终完整可见 ——
        这是有意偏离 GML 的一处，理由就是"标记必须始终能看见"。 */
function drawMarkerAt(mxx, y1) {
  const mo = 6 * ((S.theme === 2 || (S.blackout && S.theme !== 3)) ? 1 : 0) + 8 * (S.theme === 3 ? 1 : 0);
  const mcol = S.theme === 3 ? T.accent[3] : -1;
  /* 【不要裁剪到网格区】
     第一版在这里加了 `c.rect(S.x1 + 1, …); c.clip()`，想把三角限制在网格内，
     结果正好把要修的东西又切掉了：marker_pos = 0 时 mxx = gx = x1+2，
     而三角 sprite 是 16 宽、原点 xo=8，本来就横跨 mxx-8 .. mxx+8，
     左侧 8px 必然伸进层操作栏所在的 x < x1+1 区域。
     裁剪到 x1+1 之后左半边消失，看起来和"被层栏遮挡"一模一样。
     用户的诉求是【三角必须完整可见】，所以这里不裁剪，整块画上去。 */
  drawSprite('spr_marker', mo + 1, mxx, y1 + 2, 1 + (S.window_scale <= 0.5 ? 1 : 0),
    (S.totalrows + 1) * 32 / 15, 1, mcol);
  drawSprite('spr_marker', mo + 0, mxx, y1 + 2, 1, 1, mcol);
}

/* ---------------------------------------------------------------- 滚动条 */
function drawHScrollbar() {
  // 对照 control_draw:1246
  const exist = S.hover.exist;
  const cant = (exist && S.changepitch) || S.mousewheel > 0;
  const ms = S.enda + S.totalcols - 1, sl = S.totalcols - 1;
  const following = S.marker_follow && S.playing === 1;
  // 不拖拽时以 starta 为准（键盘翻页 / 播放跟随会直接改 starta）
  if (SB.drag[0] === -1) SB.val[0] = clamp(S.starta, 0, Math.max(0, ms - sl));
  const v = drawScrollbarGML(0, S.x1, S.y1 + S.totalrows * 32 + 34, 32, sl, ms, cant ? 1 : 0, 0);
  if (SB.drag[0] !== -1 || !following) S.starta = clamp(v, 0, Math.max(0, ms - sl));

  // 展开/返回按钮（原版在滚动条右侧）
  const bx = S.x1 + 16 + 32 * (S.totalcols - 1) + 16, by = S.y1 + S.totalrows * 32 + 34;
  setColor(C.panel);
  fillRect(bx, by, 16, 16);
  const hov = mouseRectangle(bx, by, 16, 16) && S.window === 0;
  if (hov) { G.cursor = 'pointer'; popupSet(bx, by, 16, 16, S.fullscreen ? '返回' : '展开编辑区域'); }
  setColor(hov ? C.accent : (C.dark ? '#cccccc' : '#555555'));
  setFont(FONT.small(10));
  text(bx + 4, by + 1, S.fullscreen ? '◱' : '⛶');
  setFont(FONT.main());
  if (hov && G.mbr[0]) { S.fullscreen = S.fullscreen ? 0 : 1; setMsg(S.fullscreen ? '全屏模式 => 开启' : '全屏模式 => 关闭'); }
}

/* 全屏下的「返回」按钮 —— 对照 control_draw.gml:1266-1294。
 *
 * 【为什么必须单独有这么一个按钮】
 *   上面 drawHScrollbar 里那个「展开/返回」按钮是按原版放在滚动条右端的，
 *   而滚动条整体被 `if (!S.fullscreen)` 跳过了（全屏就是要让网格铺满、
 *   不要滚动条占位）。结果就是：点了「编辑区域」进入全屏后，
 *   退出按钮跟着滚动条一起消失 —— 用户被关在全屏里出不来。
 *   原版对此有专门处理：全屏时把按钮挪到右下角
 *       xx = rw - sbv_anim;  yy = rh - 16
 *   并用 spr_layericons 的第 8 帧（返回箭头）。这里照搬。
 *
 * 【尺寸为什么比原版大】
 *   原版是 16×16（桌面上鼠标点，够用）。用户反馈："那个退出全屏的按钮太小了"。
 *   竖屏是手指在点，16px 远低于可用的触控目标（一般建议 ≥ 40px）。
 *   所以这里画成 48×48 的圆角按钮，图标按 3 倍缩放绘制并居中；
 *   命中区再向外扩 4px 容差，实际有效触控区约 56×56。
 *   位置相应往内收，保证在屏幕内且不压住右下角的音符。 */

/* ============================================================================
 * 全屏模式下的浮动滚动条 —— 完整对照 control_draw.gml:1248-1262
 *
 * 【原版行为】
 *   // horizontal rise animation
 *   if (mouse_rectangle(0, rh - 25, rw, rh)) {
 *       if (window = 0 && sbh_anim < 16) sbh_anim += (2*30/room_speed) * (1/currspeed)
 *   } else if (sb_drag = -1) {
 *       if (sbh_anim > 0) sbh_anim -= (2*30/room_speed) * (1/currspeed)
 *   }
 *   // vertical 同理，热区是 (rw - 25, 0, rw, rh)
 *   starta = draw_scrollbar(scrollbarh, 0, rh - sbh_anim, 32,
 *                           ((rw - 16) / 32) - 1, enda + totalcols - 2, …)
 *   startb = draw_scrollbar(scrollbarv, rw - sbv_anim, rhval, 32,
 *                           ((rh - rhval - 16) / 32) - 1, endb + totalrows - 2, …)
 *
 * 也就是：
 *   · 横条 y = rh - sbh_anim（anim=0 时正好完全藏在屏幕外，anim=16 时升起 16px，
 *     正好是滚动条厚度 → 完全可见）
 *   · 竖条 x = rw - sbv_anim
 *   · slots 用 ((rw-16)/32)-1 / ((rh-rhval-16)/32)-1 —— 注意【不是】totalcols-1，
 *     因为滚动条横跨整个屏幕宽度，能容纳的格数比网格多（网格左边还让出了图层面板）
 *   · maxslots 用 enda + totalcols - 2 / endb + totalrows - 2
 *   · 只有 window = 0 时才允许升起（有对话框时不弹出来打扰）
 *   · 正在拖滚动条（sb_drag != -1）时不收回，否则拖到热区外会突然消失
 *
 * 【为什么必须补】
 * 我们之前全屏时整块跳过滚动条，于是全屏模式下完全无法滚动视图，
 * 长歌曲在全屏里几乎没法导航（只能靠拖拽到边缘的自动滚屏或键盘翻页）。
 * ========================================================================== */
function drawFullscreenScrollbars() {
  const rw = S.rw, rh = S.rh;
  const rhval = S.rhval === undefined ? 270 : S.rhval;
  /* 缓动步长：(2*30/room_speed) * (1/currspeed)。
     原版 room_speed=60、currspeed≈1 时约 1/帧，16 帧走满 16px。
     这里按同一数量级取 1（我们的帧率由 rAF 驱动，不固定 60）。 */
  const STEP = 1;
  const exist = S.hover.exist;
  const cant = ((exist && S.changepitch) || S.mousewheel > 0) ? 1 : 0;

  /* ---- 横向 ---- */
  if (mouseRectangle(0, rh - 25, rw, rh)) {
    if (S.window === 0 && (S.sbh_anim || 0) < 16) S.sbh_anim = Math.min(16, (S.sbh_anim || 0) + STEP);
  } else if (SB.drag[0] === -1) {
    if ((S.sbh_anim || 0) > 0) S.sbh_anim = Math.max(0, (S.sbh_anim || 0) - STEP);
  }
  /* ---- 纵向 ---- */
  if (mouseRectangle(rw - 25, 0, rw, rh)) {
    if (S.window === 0 && (S.sbv_anim || 0) < 16) S.sbv_anim = Math.min(16, (S.sbv_anim || 0) + STEP);
  } else if (SB.drag[1] === -1) {
    if ((S.sbv_anim || 0) > 0) S.sbv_anim = Math.max(0, (S.sbv_anim || 0) - STEP);
  }

  /* anim 为 0 时滚动条整条在屏幕外，没有绘制的必要；
     但【仍然要更新 SB.val】，否则恢复显示时拖块位置会是旧的。 */
  const hSlots = Math.max(1, Math.floor((rw - 16) / 32) - 1);
  const hMax = Math.max(1, S.enda + S.totalcols - 2);
  if (SB.drag[0] === -1) SB.val[0] = clamp(S.starta, 0, Math.max(0, hMax - hSlots));
  if ((S.sbh_anim || 0) > 0) {
    const v = drawScrollbarGML(0, 0, rh - S.sbh_anim, 32, hSlots, hMax, cant, 0);
    if (SB.drag[0] !== -1) S.starta = clamp(v, 0, Math.max(0, hMax - hSlots));
  }

  const vSlots = Math.max(1, Math.floor((rh - rhval - 16) / 32) - 1);
  const vMax = Math.max(1, S.endb + S.totalrows - 2);
  if (SB.drag[1] === -1) SB.val[1] = clamp(S.startb, 0, Math.max(0, vMax - vSlots));
  if ((S.sbv_anim || 0) > 0) {
    const v2 = drawScrollbarGML(1, rw - S.sbv_anim, rhval, 32, vSlots, vMax, cant, 0);
    if (SB.drag[1] !== -1) S.startb = clamp(v2, 0, Math.max(0, vMax - vSlots));
  }
}

function drawFullscreenExit() {
  if (!S.fullscreen) return;
  const rw = S.rw, rh = S.rh;
  const sz = FS_EXIT_SIZE;
  const xx = rw - sz - FS_EXIT_MARGIN;
  const yy = rh - sz - FS_EXIT_MARGIN;

  // 命中的矩形比按钮本身大一圈，手指按偏一点也能中
  const hov = mouseRectangle(xx - FS_EXIT_PAD, yy - FS_EXIT_PAD, sz + FS_EXIT_PAD * 2, sz + FS_EXIT_PAD * 2)
    && controlInteractive();
  /* 把"本帧鼠标是否压在这个按钮上"记下来，给 editorFrame 下一帧用在
     handler 之前拦按下（见那边的说明）。按钮位置只跟 rw/rh 有关，
     一帧的延迟不影响判定准确度。 */
  S.fullHoverExit = hov;
  if (hov) { G.cursor = 'pointer'; popupSet(xx, yy, sz, sz, '返回（退出全屏）'); }

  /* 按下帧的拦截在 editorFrame 里做（见那边 S.fullHoverExit 的说明）——
     这里只负责松手时的动作。 */

  /* 底板：做成明显的按钮而不是裸图标 ——
     全屏时背景是亮色网格，只有底板才能在网格上也一眼看见。
     用主题色 + 描边，和各种对话框按钮保持同一套视觉。 */
  setColor(hov ? (C.dark ? '#4a4a4a' : '#e0e0e0') : (C.dark ? '#333333' : '#ededed'));
  roundRect(xx, yy, xx + sz, yy + sz, 8, true);
  setColor(hov ? C.accent : C.controlBorder);
  roundRect(xx + 0.5, yy + 0.5, xx + sz - 0.5, yy + sz - 0.5, 8, false);

  /* 图标：spr_layericons 第 8 帧（7 + fullscreen，fullscreen=1 → 8）。
     原生 16×16，按 sz/16 的倍数放大到按钮内部，留 8px 内边距。
     非 Fluent 主题用单层实心图标，Fluent 用 _f 双层 —— 和 layerIcon 同一套规则。 */
  const iconSz = sz - 16;
  const k = iconSz / 16;
  const ix = xx + 8, iy = yy + 8;
  if (S.theme !== 3) {
    drawSprite('spr_layericons', 8, ix, iy, k, k, (S.theme === 2) ? '#ffffff' : '#000000', 0.85);
  } else {
    drawSprite('spr_layericons_f', 8 + (S.fdark ? 0 : 9), ix, iy, k, k, '#ffffff');
    drawSprite('spr_layericons_f', 8 + 18, ix, iy, k, k,
      hov ? T.accent[3] : T.accent[6 - 2 * (S.fdark ? 0 : 1)]);
  }
  if (hov && G.mbr[0]) {
    S.fullscreen = 0;
    setMsg('全屏模式 => 关闭');
    // 退出全屏时顺手把抽屉也收起来，回到正常的竖屏布局
    S.drawer = '';
    UI.swallowPress = true;
  }
}

/* ---------------------------------------------------------------- 竖屏抽屉
 *
 * 竖屏宽度不够并排放图层/钢琴，所以这两块改成「底部标签 + 浮层抽屉」：
 *   · 平时收起，只在底部留一个 30px 的标签条；
 *   · 点标签向上抽出对应面板，再点一次（或点抽屉外的暗色遮罩）收起；
 *   · 同时只有一个抽屉打开，互斥，不会两层叠在一起。
 *
 * 为什么用浮层而不是把面板压扁塞进布局：
 *   图层面板一行要放名字输入框+7 个按钮+两个滑块，宽度天然需要 260 左右，
 *   压到手机宽度(< 320)会把控件挤成不可用的细条；
 *   钢琴要按 39px/键 排 3 个八度，同样横向放不下。
 *   浮层可以画在网格之上、占满整个宽度，既能保住控件尺寸，
 *   又不必牺牲网格的可用列数 —— 收起后网格依然是满宽的。
 */
const DRAWER_H = 30;          // 底部标签条高度
const DRAWER_PANEL_H = 190;   // 抽出的面板高度
/* 抽屉顶部「抓手条」的高度，同时也是【点这里收起抽屉】的命中高度。
   做成 28 是因为手指目标不该小于 ~24px；视觉上仍然只画那条 4px 的小横条，
   但热区是整条全宽。 */
const DRAWER_GRAB_H = 28;
/* 八度平移的步长（半音）。12 太大（竖屏只显示 6~12 个键，
   按一下整个音域就换掉了，找不着原来的音）；6 个半音刚好跨过黑键区。 */
const OCT_STEP = 6;

/* 抽屉是否正在打开（供 editorFrame 屏蔽下层点击） */
function drawerOpen() {
  return !!(S.portrait && S.drawer);
}

/* 底部标签条 + 抽屉本体。两个都画在网格之上。 */
function drawDrawer() {
  if (!S.portrait || S.fullscreen) return;
  const rw = S.rw, rh = S.rh;

  // ---- 标签条 ----
  const ty = rh - DRAWER_H;
  setColor(C.panel);
  fillRect(0, ty, rw, DRAWER_H);
  setColor(C.separator);
  line(0, ty, rw, ty);

  const tabs = [];
  if (S.show_layers) tabs.push({ id: 'layers', label: '图层' });
  if (S.show_piano) tabs.push({ id: 'piano', label: '琴键' });
  tabs.push({ id: 'props', label: '属性' });

  const tw = Math.min(96, floor((rw - 8) / Math.max(1, tabs.length)));
  setFont(FONT.main(11));
  for (let i = 0; i < tabs.length; i++) {
    const t = tabs[i];
    const tx = 4 + i * tw;
    const active = S.drawer === t.id;
    const hover = mouseRectangle(tx, ty, tw - 2, DRAWER_H) && controlInteractive();
    if (hover) G.cursor = 'pointer';
    if (active) {
      setColor(C.accent);
      roundRect(tx, ty + 4, tx + tw - 2, ty + DRAWER_H - 4, 4, true);
    } else if (hover) {
      setColor(C.controlBgHover);
      roundRect(tx, ty + 4, tx + tw - 2, ty + DRAWER_H - 4, 4, true);
    }
    /* C 上没有 accentText 这个属性（真实属性见 theme.js：accent / accentLight /
       accentDark / text / textDim …）。早先写成 C.accentText 得到 undefined，
       canvas 的 fillStyle 被赋值 undefined 时会被忽略，
       于是"激活的那个标签文字直接消失"，只剩一块蓝底。
       激活态用白字（蓝底上对比度最高），和顶栏图标按下时的处理一致。 */
    setColor(active ? '#ffffff' : C.text);
    text(tx + (tw - 2) / 2, ty + 9, t.label, 'center');
    /* 【必须只让命中的那个标签响应，并且要读 rawMbr】
       两个坑叠在一起：
       1) 早先写成裸的 `if (G.mbr[0])` —— mbr 是"本帧刚松开"的全屏共享标志，
          不带位置判断，同一次抬手会把循环里【每一个】标签都执行一遍，
          最终留下最后一个（属性）。表现就是"点哪个标签都跳到属性抽屉"。
       2) drawEditor 之后 G.mbr 已被 blocked 逻辑清零（抽屉打开时必然 blocked），
          所以这里必须读 UI.rawMbr —— 它是清零前的原始输入快照。
       两个都修好，标签才会"点哪个开哪个"。 */
    const mbrTap = (UI.rawMbr || G.mbr);
    if (hover && mbrTap[0]) {
      if (S.drawer === t.id) S.drawer = '';
      else { S.drawer = t.id; S.select = 0; }
      UI.swallowPress = true;
    }
  }
  setFont(FONT.main());

  if (!S.drawer) {
    /* 抽屉收起时必须清掉 flat 标记，否则横屏主界面的钢琴
       也会继承"关掉两端淡出"的设定（它不是只属于抽屉的开关）。 */
    S.drawer_piano_flat = 0;
    return;
  }

  // ---- 抽屉本体 ----
  const ph = Math.min(DRAWER_PANEL_H, floor(rh * 0.55));
  const py = ty - ph;
  /* 【点抽屉外的灰色遮罩 → 收起抽屉】
     这里踩的是和底部标签、抓手条同一个坑，但更隐蔽：
       · 抽屉打开时 drawerOpen() 为真，editorFrame 在 219 行把 blocked 置 true，
         紧接着 226 行把 G.mb / G.mbp / G.mbr 全部清零；
       · drawDrawer() 是在 drawEditor() 内部被调用的，而 G.mb=rawMb 的恢复
         在 248 行 —— 也就是【恢复之前】。所以这里读到的 G.mbp[0] 恒为 false，
         遮罩点击永远不触发，点上去毫无反应。
     正确做法是读 UI.rawMbp / UI.rawMbr（清零前的原始快照），
     和标签栏用 UI.rawMbr、抓手条用 UI.rawMbr 完全一致。

     命中范围必须是【遮罩实际画出来的那片矩形】，也就是
       fillRect(0, S.y1 - 4, rw, py - (S.y1 - 4))      —— 面板以上、顶栏以下。
     早先写成 `!inPanel`（"只要不在面板里"）太宽了：顶部菜单栏、工具栏、
     甚至状态栏都会落进去，点那些地方也会把抽屉关掉。
     现在严格用 inScrim 判定，保证"只有看得见的灰色区域才能点"。 */
  const scrimTop = S.y1 - 4;
  const scrimH = Math.max(0, py - scrimTop);
  const inScrim = scrimH > 0 && mouseRectangle(0, scrimTop, rw, scrimH);
  const mbpScrim = (UI.rawMbp || G.mbp);
  const mbrScrim = (UI.rawMbr || G.mbr);
  /* 按【下】和【抬】都接受：
     · 按下即收 —— 点遮罩立刻有反馈，不用等抬手；
     · 抬手也收 —— 手指从面板里滑到遮罩上再松开（常见操作）也能收起。
     两者都要求指针落在遮罩矩形内，且当前没有对话框抢焦点。 */
  if (inScrim && controlInteractive() && (mbpScrim[0] || mbrScrim[0])) {
    S.drawer = ''; UI.swallowPress = true;
    return;
  }
  /* 抽屉外压一层半透明暗色。
     没有遮罩时，抽屉下方露出的网格看起来和平时一模一样，
     用户会以为还能直接点（实际已经被拦截），体感是"点了没反应"。
     压暗之后"这一层是浮层"一眼可见。 */
  setColor(S.dark ? '#000000' : '#404040');
  setAlpha(0.28);
  fillRect(0, S.y1 - 4, rw, py - (S.y1 - 4));
  setAlpha(1);
  setColor(C.panel);
  fillRect(0, py, rw, ph);
  setColor(C.separator);
  line(0, py, rw, py);
  /* 顶部把手条：纯视觉提示，【不再】是关闭热区。
     —— 用户明确要求「点抽屉里的空白部分不要关闭，而是点遮罩或再次点底部标签」。
     之前把这一整条（全宽 × DRAWER_GRAB_H）做成"点击即收"，
     于是在图层列表上方那一片看起来就是"抽屉空白"的地方点一下，
     抽屉就没了 —— 用户会当成误触，且毫无心理预期。
     现在收起抽屉只剩两条路：
       · 点抽屉外面的灰色遮罩
       · 再次点底部对应的抽屉标签（toggle）
     把手条仍画出来：它告诉用户"这是一块浮动面板"，
     只是不再响应点击，也不给 pointer 光标（不可点的东西不该有可点的提示）。 */
  setColor(C.textDim);
  roundRect(rw / 2 - 18, py + 3, rw / 2 + 18, py + 6, 2, true);

  /* 子面板从把手条下方开始画。
     顶部那条区域现在完全不可点（只是视觉提示），所以内容区不会和关闭热区抢地方；
     这里留出 DRAWER_GRAB_H 的高度纯粹是为了视觉留白，让面板顶部不显得拥挤。 */
  const cy = py + DRAWER_GRAB_H;
  const ch = ph - DRAWER_GRAB_H;
  if (S.drawer === 'layers') drawDrawerLayers(cy, ch);
  else if (S.drawer === 'piano') drawDrawerPiano(cy, ch);
  else drawDrawerProps(cy, ch);
}

/* 色度键号 ↔ 白键索引 的双向换算。
 *
 * NBS 键号 0 = A0，音名循环 A A# B C C# D D# E F F# G G#（见 song.js 的 KEYNAMES），
 * 一个八度里 1/4/6/9/11 是黑键，其余 7 个是白键。
 *
 * drawPiano 里两个量必须同时成立：
 *     S.startkey        = 白键索引（决定 cc = startkey%7，也就是黑键画在第几格）
 *     S.startkey + S.sharpkeys = 最左键的色度键号（决定 c1/c2 和发声音高）
 * 两者混用就是"按一下八度从 C4 跳到 B4"的根因 —— 白键索引加 6 并不等于升 6 个半音。
 *
 * 这里用一张表把关系钉死：WHITE_CHROMA[w] = 第 w 个白键的色度键号。
 * 反查时【向下取整到不高于目标的那个白键】—— 目标若是黑键（比如 F#），
 * 键盘没法从黑键起画，必须退回它下面那个白键（F）。
 * 早先用"向上最近的 whiteIndex"会多走一格，实测 39→46→51→58 步长 7/5/7 不均。
 */
const WHITE_CHROMA = (() => {
  const a = [];
  for (let c = 0; c <= 87; c++) {
    const r = c % 12;
    if (r !== 1 && r !== 4 && r !== 6 && r !== 9 && r !== 11) a.push(c);
  }
  return a;
})();

/* 白键索引 → 色度键号 */
function whiteToChroma(w) {
  return WHITE_CHROMA[clamp(w, 0, WHITE_CHROMA.length - 1)];
}

/* 色度键号 → 白键索引（向下取整：结果对应的色度键号一定 <= 目标） */
function chromaToWhite(chroma) {
  const t = clamp(chroma, 0, 87);
  let lo = 0, hi = WHITE_CHROMA.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (WHITE_CHROMA[mid] <= t) lo = mid; else hi = mid - 1;
  }
  return lo;
}

/* 图层抽屉（音轨编辑栏）。
 *
 * 【图标与主题】
 *   直接用桌面版同一个 layerIcon()，它内部已经按主题分派好了：
 *     theme 0/1  → spr_frame4 底板 + spr_layericons（黑/白色）+ 0.7 alpha
 *     theme 2    → 同上但图标取白色
 *     theme 3    → spr_layericons_f 双层（基帧 + accent 上色层）
 *   这样抽屉里的按钮和桌面版图层面板长得完全一样，不用自己画字。
 *   图标原生 16×16，按住 shift 缩放到 24 只是给手指留面积，
 *   绘制仍走 layerIcon 的命中矩形，所以缩放和命中始终对齐。
 *
 * 【三个曾经失效的功能（已按桌面版语义修好）】
 *   1) 锁定 / 独奏不是两个独立布尔，而是【同一个字段】S.layerlock 的三态：
 *        0 = 正常，1 = 静音（lock），2 = 独奏（solo）
 *      且独奏还要同时维护 S.solostr（形如 "|3|7|"）。
 *      早先写成 layerlock=1/0 与单独的 solostr 拼接，
 *      两者互不排斥 —— 结果是"点了独奏，该层反而被静音"。
 *   2) 新建层用 addLayer(layer, ...)，不是 layer+1：addLayer 自己会把
 *      新层插在 index 位置并后移原有内容。传 layer+1 会插到错误的地方。
 *   3) 删除/新建/上下移都必须先 S.playing = 0（桌面版一致），
 *      否则播放中改结构会让排期游标指向已不存在的层。
 */
function drawDrawerLayers(py, ph) {
  const rw = S.rw;
  /* 一层要放「序号 + 名字 + 7 个图标」。
     名字框按剩余宽度自适应：先保证 7 个图标都够放，剩下的给名字（下限 56）。 */
  const padL = 6, padR = 6, numW = 18, gap = 2;
  const btnSize = 24;                       // 图标绘制尺寸（命中用 26，留 1px 容差）
  const hitSize = 26;
  const btnW = btnSize + gap;
  const totalBtnW = 7 * btnW;
  const rowH = 34;
  const nameW = clamp(rw - (padL + numW + 4 + totalBtnW + padR + 8), 56, 150);

  const maxRows = Math.max(1, floor((ph - 12) / rowH));
  const total = Math.max(1, S.endb2);
  if (S.drawer_scroll > total - maxRows) S.drawer_scroll = Math.max(0, total - maxRows);
  if (S.drawer_scroll < 0) S.drawer_scroll = 0;

  /* 抽屉内所有控件都要看【真实输入】：editorFrame 在 drawerOpen() 时
     已经把 G.mb/G.mbp/G.mbr 清零了。这里统一换进原始快照，函数结束再还原。 */
  const rawMb = G.mb, rawMbp = G.mbp, rawMbr = G.mbr;
  G.mb = UI.rawMb || rawMb;
  G.mbp = UI.rawMbp || rawMbp;
  G.mbr = UI.rawMbr || rawMbr;

  for (let i = 0; i < maxRows; i++) {
    const layer = floor(S.drawer_scroll) + i;
    if (layer >= total) break;
    const y = py + 6 + i * rowH;
    const rowHover = mouseRectangle(2, y, rw - 4, rowH - 2) && controlInteractive();
    if (rowHover) { setColor(C.controlBgHover); roundRect(2, y, rw - 2, y + rowH - 4, 4, true); }

    setFont(FONT.small());
    setColor(C.textDim);
    text(padL, y + 8, String(layer + 1));
    setFont(FONT.main());

    const nx = padL + numW;
    const nameVal = textEdit(400 + layer, S.layername[layer], nx, y + 5, nameW, 18);
    S.layername[layer] = nameVal;

    /* 三个与桌面版同名的状态量，语义必须完全一致 */
    const lockOn = layer < S.endb2 && S.layerlock[layer] === 1;
    const soloOn = layer < S.endb2 && S.layerlock[layer] === 2;

    let bx = nx + nameW + 4;
    const by = y + 4;
    // 用 layerIcon 画（内部按主题分派），命中矩形比图标略大一点便于手指点
    const iconBtn = (n, pressed, tip, fn) => {
      if (bx + btnSize > rw - padR) return;
      const h = mouseRectangle(bx - 1, by - 1, hitSize, hitSize) && controlInteractive();
      if (h) { G.cursor = 'pointer'; popupSet(bx - 1, by - 1, hitSize, hitSize, tip); }
      layerIcon(n, bx, by, pressed, tip);
      if (h && G.mbr[0]) { fn(); UI.swallowPress = true; }
      bx += btnW;
    };

    iconBtn(0, lockOn, lockOn ? '取消静音' : '静音本层', () => {
      // 从独奏切到静音时，要把该层从 solostr 里摘掉
      if (S.layerlock[layer] === 2) S.solostr = S.solostr.replace('|' + layer + '|', '');
      S.layerlock[layer] = lockOn ? 0 : 1;
      S.changed = 1;
    });
    iconBtn(1, soloOn, soloOn ? '取消独奏' : '独奏本层', () => {
      S.playing = 0;
      if (S.layerlock[layer] === 2) {
        S.layerlock[layer] = 0;
        S.solostr = S.solostr.replace('|' + layer + '|', '');
      } else {
        S.layerlock[layer] = 2;
        S.solostr += '|' + layer + '|';
      }
      S.changed = 1;
    });
    /* 「选择本层所有方块」必须和桌面版 drawLayersPanel 完全一致 ——
       既改 selected_layers 这个"哪些层被选中"的标记，也要真正把方块选进选区
       （selectionAdd / selectionRemove）。之前抽屉版只 push/splice 了
       selected_layers，选区本身没动，于是 S.selected 恒为 0：
       用户看到的是「点了选择本层，但一个方块都没选中」，连带"全选层"也失效
       （多选几层后依然 S.selected = 0，导出/删除等依赖选区的操作全是空操作）。 */
    iconBtn(2, 0, '选择本层所有方块', () => {
      S.playing = 0;
      const k = S.selected_layers.indexOf(layer);
      if (k > -1) {
        selectionRemove(0, layer, S.enda, layer, false, false);
        S.selected_layers.splice(k, 1);
      } else {
        selectionAdd(0, layer, S.enda, layer, false, false);
        S.selected_layers.push(layer);
      }
    });
    iconBtn(3, 0, '新建层', () => { S.playing = 0; addLayer(layer, false); S.changed = 1; });
    iconBtn(4, 0, '删除层', () => { S.playing = 0; removeLayer(layer, false); S.changed = 1; });
    /* 图标按钮。注意「上移」和「下移」的可画性不能只靠 fn 内部判断：
       iconBtn 会无条件把图标画出来，只在点击时执行 fn。
       所以第 1 层原本也会画出一个"上移"箭头，点下去 fn 里 `if (layer > 0)`
       直接跳过 —— 按钮看着在、实际是死的。
       桌面版（drawLayersPanel）用 `if (layer > 0 && layerIcon(5, ...))` 把
       图标本身的条件也带上了，两边必须一致。
       同理最后一层不该有「下移」。 */
    const canUp = layer > 0;
    const canDown = layer < S.endb2 - 1;
    if (canUp) {
      iconBtn(5, 0, '上移本层', () => { S.playing = 0; shiftLayers(layer, layer - 1, false); });
    } else {
      // 没有上移图标时补一格空位，保证后面「下移」的横坐标与其它行对齐
      bx += btnW;
    }
    if (canDown) {
      iconBtn(6, 0, '下移本层', () => { S.playing = 0; shiftLayers(layer, layer + 1, false); });
    } else {
      bx += btnW;
    }
  }

  G.mb = rawMb; G.mbp = rawMbp; G.mbr = rawMbr;

  // 滚动提示
  if (total > maxRows) {
    setFont(FONT.small(10));
    setColor(C.textDim);
    text(rw - 6, py + ph - 14, '上下滑动查看更多图层', 'right');
    setFont(FONT.main());
  }
}

/* 琴键抽屉：占满抽屉宽度，并给出八度平移按钮。
 *
 * 【为什么不把琴键压窄以塞进更多键】
 *   drawPiano 内部约有 14 处硬编码的 39（键宽）与由它派生的黑键偏移
 *   （-12 / +27 / +18 / -19）。这些偏移和 spr 精灵的原生尺寸是绑死的，
 *   一旦把键宽改成参数，黑键位置、音符小图位置都得跟着重算，
 *   稍错一处就是"点黑键弹出白键的音"。收益却很小：
 *   触屏模态有 1.3 倍缩放下限，39 逻辑像素本来就等于约 50 CSS 像素，
 *   已经是舒服的触控目标；压到 30 反而不好点。
 *   所以这里保持键宽不变，只改【可见音域】——用八度平移去够到更高/更低的音。 */
function drawDrawerPiano(py, ph) {
  const rw = S.rw;
  /* kc 必须和 computeLayout 算出的 keysshow 用【同一个公式】。
     之前这里写成 floor((rw-8)/39)，而 layout 用的是 floor((rw-32)/39)，
     两者差一格 —— 抽屉里比全局多画一个键，跨过了 drawPiano 的右端淡出阈值
     （a > k - min(5, 54-(startkey+k))），
     导致除最左一个琴键外全部被羽化遮罩盖住，看起来像"琴键被切掉一半"。
     直接复用 S.keysshow 就不存在两套公式打架的问题。 */
  const kc = Math.max(1, Math.min(S.keysmax, Math.max(1, S.keysshow)));

  /* 【竖屏琴键太少时的补偿】
     rw=300 时 layout 只会给 6 个键（floor((300-32)/39)）。
     draw_piano 的右端淡出条件是 a > k - min(5, 54-(startkey+k))：
     k=6 时阈值变成 a > 1，等于除最左一个键之外全部被羽化 —— 根本没法弹。
     这个公式在原版是给"宽屏、键很多、两端自然渐隐"设计的，
     键数少到这个程度就失效了。
     所以这里在抽屉里【临时放宽淡出】：把两端 alpha 掩码关掉
     （把 S.drawer_piano_flat 置 1，drawPiano 里据此跳过 mask）。
     只是显示层的处理，不影响任何输入/发声逻辑。 */
  S.drawer_piano_flat = (kc < 12) ? 1 : 0;
  const px = floor(rw / 2 - (kc * 39) / 2);
  const yy = py + 14;

  /* 八度/音域平移。
     computeLayout 每帧会重算 S.startkey，所以这里做的是
     「画之前临时叠加一个偏移，画完还原」，不污染布局状态。

     【单位陷阱：S.startkey 是白键索引，不是半音数】
     S.startkey 数的是"第几个白键"（0 = A0），而 OCT_STEP 是半音。
     直接把 shift 加到 startkey 上，一次 6 半音会变成跨 7 个白键 ≈ 11 个半音 ——
     实测按一下从 C4 跳到 B4，几乎是一个八度，正是用户说的"跨度太大"。
     正确做法：先在【半音域】里算出目标键号，再换算回白键索引。
     换算关系见 chromaToWhite()。 */
  S.piano_oct = clamp(S.piano_oct || 0, -6, 6);
  const chromaBase = S.startkey + S.sharpkeys;             // 当前最左键的色度键号
  const chromaTarget = clamp(chromaBase + S.piano_oct * OCT_STEP, 0, 87 - (kc - 1));
  const whiteTarget = chromaToWhite(chromaTarget);
  const shift = whiteTarget - S.startkey;                  // 白键索引上的偏移

  const savedStart = S.startkey, savedSharp = S.sharpkeys;
  if (shift !== 0) {
    S.startkey = savedStart + shift;
    S.sharpkeys = 0;
    for (let a = 0; a < S.startkey; a++) {
      const b = a % 7;
      if (b !== 1 && b !== 4) S.sharpkeys++;
    }
  }
  /* 【钢琴点不动的原因就是这里】
     drawPiano 内部所有点击判断读的都是 G.mb/G.mbp/G.mbr。
     而 drawerOpen() 让 blocked 为真后，editorFrame 在调用 drawEditor 之前
     就把 G.mb/G.mbp/G.mbr 全部清零了 —— 于是琴键永远收不到按下。
     抽屉本来就是浮层，它自己的控件必须看到真实输入，
     所以这里把原始输入快照换进 G，画完再还回去。 */
  const rawMb = G.mb, rawMbp = G.mbp, rawMbr = G.mbr;
  G.mb = UI.rawMb || rawMb;
  G.mbp = UI.rawMbp || rawMbp;
  G.mbr = UI.rawMbr || rawMbr;
  /* 抽屉里的这份绘制要允许点击（见 pianoInputOpen 的说明） */
  S.drawer_piano_input = 1;
  drawPiano(px, yy, kc, S.totalcols);
  S.drawer_piano_input = 0;
  G.mb = rawMb; G.mbp = rawMbp; G.mbr = rawMbr;
  S.startkey = savedStart; S.sharpkeys = savedSharp;

  /* 八度按钮。
     跨度：一整个八度（12 键）对竖屏只有 6~12 个可见键来说太粗 ——
     按一下屏幕上的音域就整个换掉，找不着刚才弹的音。
     改用 6 个半音（三全音）：既能跨过黑键区，又不会跳得太远，
     配合下面显示当前音域的文字，方向感清楚。 */
  const bw = 34, bh = 26;
  setFont(FONT.main(13));
  const octBtn = (label, x, y, fn, enabled) => {
    const h = enabled && mouseRectangle(x, y, bw, bh) && controlInteractive();
    if (h) G.cursor = 'pointer';
    // 和主题一致：用 C.accent 描边 + 面板底色，而不是硬编码灰色
    setColor(enabled ? (h ? C.controlBgHover : C.panel) : C.panel);
    roundRect(x, y, x + bw, y + bh, 5, true);
    setColor(enabled ? (h ? C.accent : C.controlBorder) : C.separator);
    roundRect(x + 0.5, y + 0.5, x + bw - 0.5, y + bh - 0.5, 5, false);
    setColor(enabled ? C.text : C.textDim);
    text(x + bw / 2, y + 6, label, 'center');
    if (h && (UI.rawMbr || G.mbr)[0]) { fn(); UI.swallowPress = true; }
  };
  const by = yy + 126;
  /* 按钮可用性：还能不能继续往这个方向挪。
     判据换成【色度键号】而不是白键索引 —— 白键索引到边界之前，
     色度键号可能已经到 0/87 了（反之亦然），用色度判断才不会出现
     "按钮亮着但按下去没反应"。 */
  const canDown = chromaBase - OCT_STEP >= 0;
  const canUp = chromaBase + OCT_STEP <= 87;
  octBtn('◀', 6, by, () => { S.piano_oct = clamp((S.piano_oct || 0) - 1, -6, 6); }, canDown);
  octBtn('▶', rw - 6 - bw, by, () => { S.piano_oct = clamp((S.piano_oct || 0) + 1, -6, 6); }, canUp);
  // 当前音域提示，让"跳到哪了"一眼可见（用 drawPiano 实际画出去的键号）
  {
    setFont(FONT.small(10));
    setColor(C.textDim);
    const loKey = clamp(S.piano_drawn_lo || 0, 0, 87);
    const hiKey = clamp(S.piano_drawn_hi || 0, 0, 87);
    text(rw / 2, by + 7, getKeyname(loKey, 1) + ' ~ ' + getKeyname(hiKey, 1), 'center');
    setFont(FONT.main());
  }
  setFont(FONT.main());
}

/* 属性抽屉：竖屏下把常用编辑参数集中起来，省得为了改一个数值去开对话框 */
function drawDrawerProps(py, ph) {
  const rw = S.rw;
  /* 和图层/琴键抽屉一样，必须先换进真实输入快照，
     否则这里的按钮同样收不到点击（editorFrame 已把 G.mb 系列清零）。 */
  const rawMb = G.mb, rawMbp = G.mbp, rawMbr = G.mbr;
  G.mb = UI.rawMb || rawMb;
  G.mbp = UI.rawMbp || rawMbp;
  G.mbr = UI.rawMbr || rawMbr;
  setFont(FONT.main(11));
  let y = py + 10;
  const line2 = (label, val, tip) => {
    setColor(C.textDim);
    text(10, y, label);
    setColor(C.text);
    text(rw - 10, y, val, 'right');
    if (tip) popupSet(6, y - 4, rw - 12, 18, tip);
    y += 22;
  };
  const ins = INSTRUMENTS[S.instrument];
  line2('当前音色', ins ? ins.name : '-');
  line2('当前音', getKeyname(S.selected_key, 1));
  line2('音量 / 声道 / 音高', S.selected_vel + ' / ' + (S.selected_pan - 100) + ' / ' + S.selected_pit);
  line2('位置 / 层', (S.selbx < 0 ? '无' : S.selbx) + ' / ' + (S.selby < 0 ? '无' : (S.selby + 1)));
  line2('已选择', S.selected + ' / ' + (S.totalblocks + S.selected));
  line2('速度', String(S.tempo));
  line2('循环', S.loop_session ? '开' : '关');

  // 便捷按钮：全屏编辑 / 折叠面板
  let bx = 10;
  const by = py + ph - 34;
  const btn = (label, fn) => {
    setFont(FONT.main(11));
    const w = textWidth(label) + 22;
    if (bx + w > rw - 10) return;
    const h = mouseRectangle(bx, by, w, 24) && controlInteractive();
    if (h) G.cursor = 'pointer';
    setColor(h ? C.controlBgHover : (C.dark ? '#3a3a3a' : '#dcdcdc'));
    roundRect(bx, by, bx + w, by + 24, 4, true);
    setColor(C.text);
    text(bx + w / 2, by + 5, label, 'center');
    if (h && (UI.rawMbr || G.mbr)[0]) { S.playing = 0; fn(); UI.swallowPress = true; }
    bx += w + 8;
  };
  btn('编辑区域', () => { S.fullscreen = S.fullscreen ? 0 : 1; S.drawer = ''; });
  btn('收起来', () => { S.drawer = ''; });

  G.mb = rawMb; G.mbp = rawMbp; G.mbr = rawMbr;
}

function drawVScrollbar() {
  // 对照 control_draw:1247
  const exist = S.hover.exist;
  const cant = (exist && S.changepitch) || S.mousewheel > 0;
  const ms = S.endb + S.totalrows - 1, sl = S.totalrows - 1;
  if (SB.drag[1] === -1) SB.val[1] = clamp(S.startb, 0, Math.max(0, ms - sl));
  /* 【x 位置必须夹在屏幕内】
     原版（以及照抄过来的横屏布局）把纵向滚动条放在网格右边缘：
         xx = x1 + totalcols*32 + 2
     横屏时网格只占左边一部分，右边还有一大片空白，这个位置正好在屏内。
     竖屏就不成立 —— 窄屏下 totalcols 是按屏宽算出来的，
     x1 + totalcols*32 本身就已经顶到（甚至超出）rw：
       实测 390x844 时 x1=-2、totalcols=13 → xx=416 > rw=390，
     整条滚动条画在了屏幕右侧外面：看不见、也点不到。
     这就是"竖屏模式纵向滚动条不见了"的根因 —— 不是没画，是画到屏外去了。

     修法：给它一个上限，保证整条留在屏内。
     【宽度必须用 16，不是 32】
       纵向滚动条的所有 sprite（v_background / v_button_* / v_bar_*）
       宽都是 16px（见 atlas.json），绘制时也只拉伸高度、不拉伸宽度。
       第一版这里错写成 SCROLLBAR_W = 32，于是在横屏下把本来位于
       x=1258 的滚动条硬拉到 1246，凭空左移 12px、压到网格最后一列上，
       看起来就是"滚动条和画布之间有条缝/贴错位置"。
       用 16 才是它的真实宽度，横屏时上限（rw-18=1262）大于原位置，
       Math.min 取原值，布局保持和原版一致。 */
  const SCROLLBAR_W = 16;
  const vx = Math.min(S.x1 + S.totalcols * 32 + 2, S.rw - SCROLLBAR_W - 2);
  const v = drawScrollbarGML(1, vx, S.y1 + 34, 32, sl, ms, cant ? 1 : 0, 0);
  S.startb = clamp(v, 0, Math.max(0, ms - sl));
}

/* ---------------------------------------------------------------- 图层面板 */
const LAYER_ICONS = [0, 1, 2, 3, 4, 5, 6];  // 锁/独奏/选择/添加/删除/上移/下移
function drawLayersPanel() {
  const totalrows = S.totalrows;
  const c = G.ctx;
  for (let b = 0; b < totalrows; b++) {
    const layer = floor(S.startb) + b;
    if (layer >= S.endb2) {
      S.layername[layer] = ''; S.layerlock[layer] = 0;
      S.layervol[layer] = 100; S.layerstereo[layer] = 100;
      rowamount[layer] = 0; S.endb2 = layer + 1;
    }
    const lx = 4, ly = 54 + 32 + b * 32 - 1;
    // 层背景
    // 对照 control_draw.gml:1312：
  //   draw_sprite(spr_layerbox, 0 + (theme = 2) + (2 + fdark) * (theme = 3), x1, y1)
  // 展开后各主题的帧号：
  //   theme 0/1 → 0
  //   theme 2   → 1
  //   theme 3   → (2 + fdark) → 浅色 2 / 深色 3
  // 注意不要把 theme 0 和 theme 1 分开——源码里这两个主题共用第 0 帧，
  // 早先按「复古用 0、Fluent 浅色用 2」分开写，遇到 theme 0 会落到错误的帧上。
  const lbFrame = (S.theme === 2) ? 1 : (S.theme === 3 ? (2 + (S.fdark ? 1 : 0)) : 0);
  drawSprite('spr_layerbox', lbFrame, lx, ly);

    // 名称
    /* 对照 control_draw.gml:1319-1324 —— 输入框位置【分主题不同】，
       这正是"层名称没和框对齐、歪了一点"的根因：
         theme != 3  : draw_text_edit(..., x1 + 11, y1 + 10, 72, 14)
         theme == 3  : draw_textarea (..., x1 +  9, y1 +  4, 72, 24)
       原来不分主题统一用 (lx+9, ly+7, 72, 18)：
         · Fluent 下框高是 24、起点 +4，文字却按 +7 起、18 高画，
           于是整体偏下 3px、且高度不匹配 —— 看起来就是"歪了一点"；
         · 经典/复古/暗黑下应该是 +11/+10 起、72x14，
           我们画成 +9/+7 起、18 高，文字偏左上。
       占位提示文字（"第 N 层"）也跟着对应分支走。 */
    setFont(FONT.small());
    setColor(C.text);
    const isFluent = (S.theme === 3);
    const nameX = lx + (isFluent ? 9 : 11);
    const nameY = ly + (isFluent ? 4 : 10);
    const nameW = 72;
    const nameH = isFluent ? 24 : 14;
    const nameVal = textEdit(400 + layer, S.layername[layer], nameX, nameY, nameW, nameH);
    S.layername[layer] = nameVal;
    if (!nameVal) {
      setColor(C.textDim);
      /* 占位文字在 GML 里是 draw_text_dynamic(x1 + 11, y1 + 10, …)，
         draw_text_dynamic 内部有 `-1 * !is_ascii`（中文上移 1px）的补偿，
         而真实层名走的是 draw_text_edit（没有这个补偿）。
         所以占位文字比 textEdit 画出的文字【高 1px】才是对的：
           textEdit 基准 = ly+10 + 1 - 1 = ly+10
           占位    基准 = ly+10 + 3 - 3 = ly+10，再 -1 → ly+9
         实测占位文字 y=10..19、框 10..22，上留 0 下留 3；有名字时 y=11..20。
         两者差 1px 正是原版 draw_text_dynamic 与 draw_text_edit 的固有差异，
         保留它，不要"对齐"成一样 —— 那会偏离 GML。 */
      text(lx + 11, ly + 10 + 3 - 3 - 1, '第 ' + (layer + 1) + ' 层');
    }
    setFont(FONT.main());

    // 音量（基帧 + 等级叠加）
    if (S.realvolume) {
      /* 高度必须是 25 —— GML control_draw.gml:1335 是 mouse_rectangle(x1+88, y1+5, 16, 25)，
     我们原来写 22，图标下半截点不到。 */
  const hover = mouseRectangle(lx + 88, ly + 5, 16, 25) && controlInteractive();
      const vol = layer < S.endb2 ? (S.layervol[layer] || 100) : 100;
      const dy = hover ? -3 : 0;
      const iconColor = S.fdark ? '#ffffff' : '#000000';
      /* 对照 control_draw.gml:1341-1351 —— 图标分两套：
           theme != 3        → spr_volume，单张实心图标，帧 = a/30，alpha 0.7
           theme == 3 浅色   → spr_volume_f 帧 !fdark，再叠一帧 a/30+2 上 accent 色
           theme == 3 深色   → 同上但基帧取 !fdark = 0
         之前不分主题一律画 _f 两层，所以经典/复古/暗黑主题的音量指示器
         是 Fluent 的线稿样式（而且还多叠了一层 accent 色），和主题不符。 */
      if (S.theme !== 3) {
        drawSprite('spr_volume', clamp(floor(vol / 30), 0, 3), lx + 91, ly + 11 + dy,
          1, 1, iconColor, 0.7);
      } else {
        drawSprite('spr_volume_f', S.fdark ? 1 : 0, lx + 91, ly + 11 + dy, 1, 1, iconColor);
        drawSprite('spr_volume_f', clamp(floor(vol / 30), 0, 3) + 2, lx + 91, ly + 11 + dy,
          1, 1, T.accent[6 - 2 * (S.fdark ? 0 : 1)]);
      }
      popupSet(lx + 90, ly + 5, 14, 18, '本层的音量: ' + vol + '%\n（拖拽来修改，按住 Shift 微调）');
      if (hover) { G.cursor = 'ns-resize'; }
      if (hover && G.mbp[0]) { S.window = W_DRAGVOL; S.dragvolb = layer; S.dragvol = vol; }
      if (S.window === W_DRAGVOL && S.dragvolb === layer) {
        S.dragvol = clamp(S.dragvol - (G.mouse.y - (S.dragLastY || G.mouse.y)), 0, 100);
        S.layervol[layer] = G.shift ? Math.round(S.dragvol) : floor(S.dragvol / 10) * 10;
        S.changed = 1;
      }
      if (hover && G.wheel) {
        S.layervol[layer] = clamp((S.layervol[layer] || 100) - G.wheel * (G.shift ? 1 : 10), 0, 100);
        S.changed = 1;
      }
    }
    // 立体声（主题分派同音量图标，对照 control_draw.gml:1376-1377）
    if (!S.realstereo) {
      // 同上：GML control_draw.gml:1370 也是高 25
  const hover = mouseRectangle(lx + 108, ly + 5, 16, 25) && controlInteractive();
      const st = layer < S.endb2 ? (S.layerstereo[layer] || 100) : 100;
      const dy = hover ? -3 : 0;
      const iconColor = S.fdark ? '#ffffff' : '#000000';
      /* 对照 control_draw.gml:1376-1377：
           theme != 3 → spr_stereo（单张实心图标，帧 = a/50，alpha 0.7）
           theme == 3 → spr_stereo_f 两层（基帧 !fdark + 等级帧 a/50+2 上 accent） */
      if (S.theme !== 3) {
        drawSprite('spr_stereo', clamp(floor(st / 50), 0, 4), lx + 110, ly + 11 + dy,
          1, 1, iconColor, 0.7);
      } else {
        drawSprite('spr_stereo_f', S.fdark ? 1 : 0, lx + 110, ly + 11 + dy, 1, 1, iconColor);
        drawSprite('spr_stereo_f', clamp(floor(st / 50) + 2, 2, 6), lx + 110, ly + 11 + dy,
          1, 1, T.accent[6 - 2 * (S.fdark ? 0 : 1)]);
      }
      popupSet(lx + 108, ly + 5, 14, 18, '立体声声道: ' +
        (st > 100 ? 'R ' + (st - 100) : st < 100 ? 'L ' + (100 - st) : '中央') + '\n（拖拽来修改，按住 Shift 微调）');
      if (hover) G.cursor = 'ns-resize';
      if (hover && G.mbp[0]) { S.window = W_DRAGSTEREO; S.dragstereob = layer; S.dragstereo = st; }
      if (S.window === W_DRAGSTEREO && S.dragstereob === layer) {
        S.dragstereo = clamp(S.dragstereo - (G.mouse.y - (S.dragLastY || G.mouse.y)), 0, 200);
        S.layerstereo[layer] = G.shift ? Math.round(S.dragstereo) : floor(S.dragstereo / 10) * 10;
        S.changed = 1;
      }
      if (hover && G.wheel) {
        S.layerstereo[layer] = clamp((S.layerstereo[layer] || 100) - G.wheel * (G.shift ? 1 : 10), 0, 200);
        S.changed = 1;
      }
    }
    S.dragLastY = G.mouse.y;

    // 图标按钮
    // 对照 control_draw.gml:1412-1461，每个图标的 x 都是
    //     x1 + (126 + 18*n) - !realvolume - realstereo*10
    // 注意 GML 里 `!realvolume` 是【布尔取反，值只有 0 或 1】，不是 0/10；
    // 而 realstereo*10 才是 0/10。之前写成 `-(realvolume ? 0 : 10)`，
    // 把 1px 的偏移当成了 10px，右侧图标被整体左移了 9px，
    // 于是第 6 个图标被挤出侧栏而被裁掉（用户看到「只显示到第 2 个」就是这个原因）。
    // 另外 icon6（下移）在 GML 里还有 `- (startb+b = 0) * 8`，第一层时再左移 8。
    /* 逐项对照 GML 的 `x1 + (126 + 18*n) - !realvolume - realstereo*10`：
         · `!realvolume`：音量图标【隐藏】时右侧图标左移 1px 补位 → off 含 (realvolume?0:1) ✓
         · `realstereo*10`：这里最容易看反。realstereo 是「关闭立体声」开关
           （见 draw_window_preferences.gml:583 的复选框文案），
           而立体声图标的绘制条件是 `if (!realstereo)`。
           所以 realstereo = 1（关闭）→ 图标不画 → 右侧图标左移 10px；
           realstereo = 0（显示）→ 图标占位 → 不左移。
           也就是偏移量 = realstereo * 10，而不是 (realstereo ? 0 : 10)。
           之前写反了：默认设置（realstereo=0，图标可见）反而左移 10px，
           7 个按钮整体压到立体声图标上；把「关闭立体声」勾上后按钮又跳回右边。
           这就是侧栏按钮位置「忽左忽右」的原因。 */
    const off = (S.realvolume ? 0 : 1) + (S.realstereo ? 10 : 0);
    const iy = ly + 8;
    const lockOn = layer < S.endb2 && S.layerlock[layer] === 1;
    const soloOn = layer < S.endb2 && S.layerlock[layer] === 2;
    /* 【tooltip 不能承诺原版没有的功能】
       之前这里写着「拖拽可批量操作」「拖拽可批量添加/删除」，
       但对照 draw_layericon.gml 全文（1-43 行）与 draw_icon.gml（1-49 行）
       可以确认：原版的这两个图标函数【都没有拖拽批量】逻辑，
       返回值是 (mouse_entered || (a && mouse_check_button_pressed(mb_left)))
       与 (a && mouse_check_button_released(mb_left)) —— 只有单击语义。
       我们也没有实现批量拖拽（差异 19 的另一半），
       所以这行 tooltip 属于"界面在说谎"，用户按下拖过去以为会批量生效，
       实际只有第一下生效。这里如实改成单击语义。
       （要真正支持批量，应当按 GML 的做法另开一个拖拽窗口状态，
        而不是只改文案。留给后续。） */
    if (layerIcon(0, lx + 126 - off, iy, lockOn, '静音本层')) {
      if (S.layerlock[layer] === 2) S.solostr = S.solostr.replace('|' + layer + '|', '');
      S.layerlock[layer] = lockOn ? 0 : 1; S.changed = 1;
    }
    if (layerIcon(1, lx + 144 - off, iy, soloOn, '独奏本层')) {
      if (S.layerlock[layer] === 2) { S.layerlock[layer] = 0; S.solostr = S.solostr.replace('|' + layer + '|', ''); }
      else { S.layerlock[layer] = 2; S.solostr += '|' + layer + '|'; }
      S.changed = 1;
    }
    if (layerIcon(2, lx + 162 - off, iy, 0, '选择本层所有方块')) {
      S.playing = 0;
      if (S.selected_layers.indexOf(layer) > -1) {
        selectionRemove(0, layer, S.enda, layer, false, false);
        S.selected_layers.splice(S.selected_layers.indexOf(layer), 1);
      } else {
        selectionAdd(0, layer, S.enda, layer, false, false);
        S.selected_layers.push(layer);
      }
    }
    if (layerIcon(3, lx + 180 - off, iy, 0, '新建层')) { S.playing = 0; addLayer(layer, false); }
    if (layerIcon(4, lx + 198 - off, iy, 0, '删除层')) { S.playing = 0; removeLayer(layer, false); }
    if (layer > 0 && layerIcon(5, lx + 216 - off, iy, 0, '上移本层')) { S.playing = 0; shiftLayers(layer, layer - 1, false); }
    // 对照 control_draw.gml:1461 `x1 + 234 - !realvolume - realstereo*10 - (startb+b = 0)*8`：
    // 第一层时再左移 8px（因为第一层没有「上移」图标，下移图标补到它的位置上）。
    if (layerIcon(6, lx + 234 - off - (layer === 0 ? 8 : 0), iy, 0, '下移本层')) { S.playing = 0; shiftLayers(layer, layer + 1, false); }
  }
  if ((S.window === W_DRAGVOL || S.window === W_DRAGSTEREO) && !G.mb[0]) S.window = W_RELEASE;
  if (S.window === W_RELEASE && !G.mb[0]) S.window = 0;
}

/* 对照 draw_layericon.gml 逐行还原。
   两套完全不同的素材，绝不能复用：
     theme != 3：单层 spr_layericons，颜色 c_black（theme 2 时 c_white），alpha 0.7，
                 背后是 spr_frame4 的 a + 3*theme 帧
     theme == 3：spr_layericons_f 两层叠加 ——
                 基帧 i - locked + 9*(!fdark) 用 color（theme 2/3 为白，否则黑），
                 再叠 i + locked + 18 用 accent[6 - 2*!fdark] 上色
   之前不管什么主题都画 _f 的两层，所以经典主题的侧边栏图标是 Fluent 的样子。 */
/* 【控件可交互性判定 —— 对照 GML 的 `window = 0 && sb_drag = -1 && !instance_exists(obj_menu)`】
   GML 里每一个图标/标签/图层面板按钮的命中条件都是这个组合：
     draw_icon.gml:20        (mouse_rectangle(...) && (window = 0 || iswindow) && locked = 0 && sb_drag = -1)
     draw_layericon.gml:14   (mouse_rectangle(...) && window = 0 && locked = 0 && sb_drag = -1)
     draw_macroicon.gml:14   (mouse_rectangle(...) && window = 0 && locked = 0 && sb_drag = -1)
     draw_tab.gml:9          (mouse_rectangle(...) && window = 0 && sb_drag = -1)
   三个条件缺一不可：
     · window = 0   —— 完全没有任何窗口/拖拽状态（不能用 !isDialogWindow 代替，
                       见 pianoInputOpen 的说明：拖拽态会让 isDialogWindow 返回 false）
     · sb_drag=-1   —— 正在拖滚动条时不响应（否则拖滚动条掠过图标会误触）
     · obj_menu     —— 菜单展开时下层控件不响应
   我们之前三处都只写了 !isDialogWindow(S.window)，既漏了 sb_drag 也漏了菜单门控。
   统一收敛到这个函数，避免以后再逐处漏。 */
function controlInteractive(extra) {
  if (S.window !== 0) return false;
  if (UI.dragHeld) return false;
  if (UI.menu) return false;
  if (typeof SB !== 'undefined' && SB.drag && (SB.drag[0] !== -1 || SB.drag[1] !== -1)) return false;
  return extra === undefined ? true : !!extra;
}

function layerIcon(n, x, y, pressed, tip) {
  const hover = mouseRectangle(x, y, 16, 16) && controlInteractive();
  if (hover) { G.cursor = 'pointer'; popupSet(x, y, 16, 16, tip); }
  // 对照源码 `a = 鼠标在矩形内`；a 再叠加「按下或刚松开」，按下时偏移 (a=2||pressed)?1:0
  const a = hover ? 1 : 0;
  const shift = (a === 2 || pressed) ? 1 : 0;
  // 按钮底板 spr_frame4（该精灵缺失时用等价的 1px 边框兜底）
  if (S.theme !== 3) {
    // 非 Fluent：只有底板 + 单层图标
    drawSprite('spr_frame4', (pressed ? 2 : a) + 3 * S.theme, x, y);
    const col = (S.theme === 2) ? '#ffffff' : '#000000';
    drawSprite('spr_layericons', n, x + shift, y + shift, 1, 1, col, 0.7);
  } else {
    /* Fluent：底板用 hires 版（缺失时跳过），图标两层叠加 */
    // 基帧：fdark ? i : i+9
    const baseFrame = n + (S.fdark ? 0 : 9);
    const col = '#ffffff';   // theme 2/3 用白
    drawSprite('spr_layericons_f', baseFrame, x + shift, y + shift, 1, 1, col);
    // 上色层：i + 18，accent[6 - 2*!fdark]
    drawSprite('spr_layericons_f', n + 18, x + shift, y + shift, 1, 1,
      pressed ? T.accent[3] : T.accent[6 - 2 * (S.fdark ? 0 : 1)]);
  }
  return hover && G.mbr[0];
}

/* ---------------------------------------------------------------- 宏工具条 */
/* 对照 draw_macroicon.gml 逐项移植。之前这里有三处偏离源码：
   1. 完全没画底板 spr_frame4 —— 原版每个宏按钮都有一个方框，
      少掉底板后图标直接浮在面板底色上，和别的按钮视觉不统一；
   2. hover 帧写成 `i + (hover ? 15 : 0) > 14 ? i : i` ——
      三元两边都是 i，判断恒等于 i，所以 hover 从来没生效过。
      而且源码里【根本没有 hover 变帧】，hover 只影响底板的帧（a）与图标偏移；
   3. 图标固定 0.7 alpha、颜色按主题变（theme 2 或 fdark 用白色，否则黑色）
      这两点都漏了，所以暗黑主题下图标是黑的黑的，几乎看不见。 */
function drawMacroBar() {
  // 紧贴图层面板底部（layers 行从 y=85 开始，每行 32）
  const bx = 4, by = 85 + S.totalrows * 32 + 2;
  setColor(C.dark ? '#2d2d2d' : '#e9e9e9');
  roundRect(bx, by, bx + 250, by + 42, 6, true);
  const icons = ['Tremolo...', 'Stereo...', 'Arpeggio...', 'Portamento...', 'Vibrato', 'Stagger...',
    'Chorus', 'Volume LFO', '淡入', '淡出', '替换音', '设定音量......', '设定声道......', '设定音高......', '重置所有属性'];
  const actions = [() => S.window = W_TREMOLO, () => S.window = W_STEREO, () => S.window = W_ARPEGGIO,
  () => S.window = W_PORTAMENTO, () => macroVibrato(), () => S.window = W_STAGGER,
  () => macroChorus(), () => macroVelocityLFO(), () => macroFade(true), () => macroFade(false),
  () => macroReplaceKey(), () => S.window = W_SETVELOCITY, () => S.window = W_SETPANNING,
  () => S.window = W_SETPITCH, () => macroReset()];

  const drawOne = (i, x, y) => {
    const hover = mouseRectangle(x, y, 16, 16);
    if (hover) { G.cursor = 'pointer'; popupSet(x, y, 16, 16, icons[i]); }
    /* 对照 draw_macroicon.gml:14：a = 鼠标悬停；再叠一次「按下/刚松开」变成 2。 */
    let a = hover ? 1 : 0;
    a += ((G.mb[0] || G.mbr[0]) && a) ? 1 : 0;
    /* 底板：帧 = a + 3*theme + 3*(fdark && theme==3)。
       Fluent 深色主题额外 +3（那是它自己的深色底板帧组）。 */
    const pressed = 0;    // 宏按钮没有"保持按下"的视觉，源码里 pressed 只用于 7/8 类按钮
    const frameBase = pressed ? 2 : a;
    const darkExtra = (S.theme === 3 && S.fdark) ? 3 : 0;
    drawSprite('spr_frame4', frameBase + 3 * S.theme + darkExtra, x, y);
    /* 图标：帧恒为 i（无 hover 变帧），按下/悬停时右下偏移 1px。
       颜色：theme 2 或 (fdark && theme 3) 用白色，其余黑色 —— 这就是
       之前暗黑主题下宏图标几乎看不见的原因。 */
    const shift = (a === 2) ? 1 : 0;
    const col = (S.theme === 2 || (S.theme === 3 && S.fdark)) ? '#ffffff' : '#000000';
    drawSprite('spr_macroicons', i, x + shift, y + shift, 1, 1, col, 0.7);
    return hover;
  };

  for (let i = 0; i < 8; i++) {
    const x = bx + 6 + i * 25, y = by + 6;
    const hover = drawOne(i, x, y);
    if (hover && G.mbr[0]) { S.playing = 0; actions[i](); }
  }
  for (let i = 8; i < 15; i++) {
    const x = bx + 6 + (i - 8) * 25, y = by + 26;
    const hover = drawOne(i, x, y);
    if (hover && G.mbr[0]) { S.playing = 0; actions[i](); }
  }
}

/* ---------------------------------------------------------------- 顶栏 */
const ICON = {
  NEW: 0, OPEN: 1, SAVE: 2, SAVE_AS: 3, PLAY: 4, PAUSE: 5, STOP: 6, BACK: 7, FORWARD: 8,
  RECORD: 9, UNDO_INACTIVE: 28, UNDO: 29, REDO_INACTIVE: 30, REDO: 31, COPY_INACTIVE: 32,
  COPY: 33, CUT_INACTIVE: 34, CUT: 35, PASTE_INACTIVE: 36, PASTE: 37, DELETE_INACTIVE: 38,
  DELETE: 39, INFORMATION: 40, PROPERTIES: 41, INSTRUMENTS: 42, MIDI_INPUT: 43, HELP: 44,
  INTERNET: 45, CHECK: 46, SUB_MENU: 47, CHECK_INACTIVE: 48, LOOP_INACTIVE: 49, LOOP: 50,
  METRONOME_INACTIVE: 51, METRONOME_1: 52, METRONOME_2: 53, EDITMODE_KEY: 54,
  EDITMODE_VEL: 55, EDITMODE_PAN: 56, EDITMODE_PIT: 57, INSBOX_EXPAND: 58, INSBOX_COLLAPSE: 59,
};

function toggleTopMenu(name, x, y, openFn) {
  if (UI.menu && UI.menu.name === name) { closeMenu(); return; }
  closeMenu();
  openFn(x, y);
}

function drawIcon(i, x, y, tip, locked, pressed) {
  /* 【拖拽进行中，顶栏按钮一律不响应】
     用户报："在画布上按住左键拖动到顶部，选区虽然可以选，
     但只要一松手就会触发鼠标所在位置顶部的按钮。"
     根因：drawIcon 是所有顶栏图标按钮的统一入口，它返回 `hover && G.mbr[0]`，
     而拖选过程中 S.window 是 0 或 W_DRAGSELECTION（都不是 dialog），
     于是鼠标掠过 / 在按钮上松手，按钮就把这次"松开"当成一次点击。
     一次按住只应该有一个操作对象，所以拖拽期间这些按钮既不画 hover 高亮、
     也不返回点击（同时不给 pointer 光标，避免"看起来能点"的误导）。 */
  const blockedByDrag = !!UI.dragHeld;
  /* 门控统一到 controlInteractive()：GML draw_icon.gml:20 要求
     `(window = 0 || iswindow) && locked = 0 && sb_drag = -1`。
     早先只写了 !isDialogWindow(S.window)，漏了 sb_drag（拖滚动条时会误触图标）
     和菜单门控（菜单展开时图标仍会响应）。 */
  const hover = !locked && mouseRectangle(x, y, 25, 25) && controlInteractive();
  if (hover) G.cursor = 'pointer';
  popupSet(x, y, 25, 25, tip);
  /* 对照 draw_icon.gml:20-29 —— 每个图标按钮都有一块【按主题分派的底板】：
         a = 鼠标在矩形内（悬停）；再叠一次「按下/刚松开」变成 2
         按下时：draw_sprite(spr_frame1, 2 + 3*theme + dark*3)
         否则  ：draw_sprite(spr_frame1, a + 3*theme + dark*3)
     其中 dark = (theme == 3 && fdark)。spr_frame1 共 15 帧 = 5 组 × 3 主题偏移，
     所以帧号天然把「经典 / 复古 / 暗黑」三套浮雕分开，Fluent 深色再多 3 帧。
     之前这里完全没画底板，而是用 Fluent 风格的圆角色块 + 强调色下划线代替 ——
     于是【所有主题】下的顶栏按钮都是 Fluent 的样子。 */
  const hoverNow = hover;
  let a = hoverNow ? 1 : 0;
  a += ((G.mb[0] || G.mbr[0]) && a) ? 1 : 0;
  const darkExtra = (S.theme === 3 && S.fdark) ? 3 : 0;
  const f1 = pressed ? 2 : a;
  drawSprite('spr_frame1', f1 + 3 * S.theme + darkExtra, x, y);
  /* Fluent 下按下时额外画一条强调色短下划线（draw_icon.gml:25 spr_tabsel）。
     非 Fluent 主题【没有】这道下划线，用底板浮雕本身表达按下状态。 */
  if (pressed && S.theme === 3) {
    drawSprite('spr_tabsel', 1, x + 5, y + 23, 1, 1, T.accent[4]);
  }
  setAlpha(locked ? 0.4 : 1);
  // 按主题分派图集（Fluent 与非 Fluent 是两套完全不同的图标，不能混用）
  drawToolIcon(i, x, y, pressed);
  setAlpha(1);
  // 拖拽期间不返回点击（见函数开头的说明）
  return !blockedByDrag && !locked && hover && G.mbr[0];
}

function drawTopBar() {
  const rw = S.rw;
  const c = G.ctx;

  /* 【竖屏折行】
     顶栏原本是一条固定单行：标签页 + 约 30 个 25px 图标 + 音色盒 + 音量条。
     整行宽度需求接近 900 逻辑像素，手机竖屏只有 300 左右，单行必然溢出到屏幕外，
     右侧那批按钮（撤销、音色设置、MIDI……）直接变成点不到。
     这里改成自动折行：把"下一个图标放不下就换行"做成一个游标，
     行高固定 25，整条顶栏的高度 = 已用行数 × 25 + 间距。
     横屏时布局和原来逐像素一致（一行放得下就永远不换行）。

     注意：竖屏下折行后的顶栏会挡住网格，所以 computeLayout 用
     S.toolbar_h 把 y1 往下推。写入时机是「画完这一帧」，
     因此下一帧生效 —— resize 后最多滞后一帧就收敛。 */
  const wrapMode = !!S.portrait;
  /* 对照 control_draw.gml:1560 —— 经典主题（theme == 0）在顶栏下方
     横向拉一条 spr_tabbar（1x19 的单像素 sprite）作为标签栏与工具条的分隔。
     只有【经典】有这一条：复古/暗黑有自己的窗口边框层次，Fluent 用留白区分。
     少了它，经典主题的顶栏和网格之间就少了一道原版有、别的主题没有的界线。 */
  if (S.theme === 0) {
    /* 参数顺序是 draw_sprite_ext(sprite, subimg, x, y, xscale, yscale, ...)：
       横向缩放到 rw、纵向保持 1 —— spr_tabbar 是 1x19，横拉后就是一条横线。 */
    drawSprite('spr_tabbar', 0, 0, 0, rw, 1);
  }
  const marginR = 6;
  let rowX = 6, rowY = 23, rowMaxY = 23;
  const advance = (n) => {
    rowX += n;
    if (wrapMode && rowX > rw - marginR - 25) {
      rowX = 6;
      rowY += 25;
      rowMaxY = Math.max(rowMaxY, rowY);
    }
  };
  // 让一行放不下时就在此之前换行
  const fits = (need) => !wrapMode || (rowX + need <= rw - marginR);

  // 标签页
  let tabx = 1;
  const tabX = {};
  setFont(FONT.small());
  /* 对照 draw_tab.gml:8-17 —— 标签页是三片式 sprite（左 / 中拉伸 / 右），
     帧号 = 0/1/2 + 3*(a==2 || ismenu) + 6*theme + 6*(fdark && theme==3)：
       · 基础组 0-2   = 普通
       · 3-5          = 按下或该菜单已展开
       · 每组再按 theme 偏移 6，Fluent 深色再 +6
     之前这里不分主题一律画 Fluent 圆角块 + 纯色填充，
     所以经典/复古/暗黑的菜单标签页长得和 Fluent 一样。 */
  const tab = (label, name) => {
    const w = textWidth(label) + 14;
    const x = tabx; tabx += w;
    tabX[label] = x;
    const hover = mouseRectangle(x, 1, w, 18) && controlInteractive();
    const active = UI.menu && UI.menu.name === name;
    const a = (hover && G.mb[0]) || active ? 2 : 0;
    const tabDark = (S.theme === 3 && S.fdark) ? 6 : 0;
    const tb = 3 * (a === 2 ? 1 : 0) + 6 * S.theme + tabDark;
    drawSprite('spr_tabframe', tb, x, 1);
    drawSprite('spr_tabframe', tb + 1, x + 3, 1, (w - 6) / 3, 1);
    drawSprite('spr_tabframe', tb + 2, x + w - 3, 1);
    setColor(C.text);
    text(x + 7, 4, label);
    // 菜单打开时仍允许点击其它标签切换（使用未被屏蔽的原始输入）
    const mbr = UI.menu ? (UI.rawMbr || [false, false, false]) : G.mbr;
    return hover && !UI.modal && mbr[0];
  };
  // 菜单在标签正下方展开（位置跟标签实际绘制位置一致）
  if (tab('文件', 'file')) toggleTopMenu('file', tabX['文件'], 19, openFileMenu);
  if (tab('编辑', 'edit')) toggleTopMenu('edit', tabX['编辑'], 19, openEditMenu);
  if (tab('设置', 'settings')) toggleTopMenu('settings', tabX['设置'], 19, openSettingsMenu);
  if (tab('帮助', 'help')) toggleTopMenu('help', tabX['帮助'], 19, openHelpMenu);
  S.tabX = tabX;

  // 工具条
  setFont(FONT.main());
  const IW = 25;   // 单个图标宽
  const step = (n) => advance(n);
  /* 图标游标：先看放不放得下，放不下就先换行再画。
     这样每个图标都画在它自己的 rowX 上，不会跨行重叠。 */
  const atIcon = () => {
    if (wrapMode && rowX + IW > rw - marginR) { rowX = 6; rowY += 25; rowMaxY = Math.max(rowMaxY, rowY); }
    return rowX;
  };
  let xx = atIcon();
  if (drawIcon(ICON.NEW, xx, rowY, '新文件')) newSong(); step(IW); xx = atIcon();
  if (drawIcon(ICON.OPEN, xx, rowY, '打开歌曲')) loadSongDialog(); step(IW); xx = atIcon();
  if (drawIcon(ICON.SAVE, xx, rowY, '保存歌曲')) saveSongFile(false); step(IW + 4); xx = atIcon();
  drawSeparator(xx, rowY + 3); step(4); xx = atIcon();
  if (drawIcon(S.playing ? ICON.PAUSE : ICON.PLAY, xx, rowY, '播放 / 暂停')) togglePlaying(S.totalcols); step(IW); xx = atIcon();
  if (drawIcon(ICON.STOP, xx, rowY, '停止歌曲')) { S.playing = 0; S.marker_pos = 0; S.marker_prevpos = 0; S.timestoloop = S.loopmax; stopScheduledAudio(); } step(IW); xx = atIcon();
  // 对照 draw_icon：这两个按钮按住期间持续生效（不再每帧清零，清零在 handleGlobalKeys 里做）
  if (!UI.blocked && G.mb[0] && mouseRectangle(xx, rowY, IW, IW)) S.forward = -1;
  if (drawIcon(ICON.BACK, xx, rowY, '快退')) S.forward = -1; step(IW); xx = atIcon();
  if (!UI.blocked && G.mb[0] && mouseRectangle(xx, rowY, IW, IW)) S.forward = 1;
  if (drawIcon(ICON.FORWARD, xx, rowY, '快进')) S.forward = 1; step(IW); xx = atIcon();
  if (drawIcon(ICON.RECORD, xx, rowY, '录制按键', false, S.playing > 0 && S.record)) { S.playing = 0.25; S.record = S.record ? 0 : 1; } step(IW); xx = atIcon();
  if (drawIcon(S.loop_session ? ICON.LOOP : ICON.LOOP_INACTIVE, xx, rowY, '开关循环')) { S.loop_session = S.loop_session ? 0 : 1; } step(IW); xx = atIcon();
  let metIcon = ICON.METRONOME_INACTIVE;
  if (S.metronome) metIcon = (S.metronome_played === -1 || (S.metronome_played - 1) % 8 === 0) ? ICON.METRONOME_1 : ICON.METRONOME_2;
  if (drawIcon(metIcon, xx, rowY, '开关节拍器')) S.metronome = S.metronome ? 0 : 1;
  step(IW + 4); xx = atIcon();
  if (S.playing === 0) S.record = 0;
  drawSeparator(xx, rowY + 3); step(4); xx = atIcon();
  if (drawIcon(ICON.EDITMODE_KEY, xx, rowY, '音调模式', false, S.editmode === 0)) S.editmode = 0; step(IW); xx = atIcon();
  if (drawIcon(ICON.EDITMODE_VEL, xx, rowY, '音量模式', false, S.editmode === 1)) S.editmode = 1; step(IW); xx = atIcon();
  if (drawIcon(ICON.EDITMODE_PAN, xx, rowY, '声道模式', false, S.editmode === 2)) S.editmode = 2; step(IW); xx = atIcon();
  if (drawIcon(ICON.EDITMODE_PIT, xx, rowY, '音高模式', false, S.editmode === 3)) S.editmode = 3; step(IW + 4); xx = atIcon();
  drawSeparator(xx, rowY + 3); step(4); xx = atIcon();

  // 音色盒
  const insCount = INSTRUMENTS.length;
  /* 竖屏下不能按「剩余宽度」算图标数（会算出 5 个下限，仍然溢出）。
     直接按一行能放几个算，让音色盒也参与折行。

     【必须预留末尾那个按钮的宽度】
     每行末尾还有一个按钮：收起时装的是「展开」箭头（INSBOX_EXPAND），
     展开时装的是「折叠」箭头（INSBOX_COLLAPSE）。它和音色图标一样宽（25）。
     原来 insAvail 只减掉了左右各 6 的边距，没给按钮留位置：
     rw=390 时算出 floor((390-12)/25) = 15 个图标，
     盒子宽 15*25+4 = 379 正好把屏幕占满，按钮被挤到 x=381~406 —— 屏幕之外，
     表现为「盒子右下角只剩一小块，点不到折叠」。
     所以这里多减一个 25，保证「N 个图标 + 1 个按钮」整行放得下。 */
  const insAvail = wrapMode
    ? Math.max(3, floor((rw - 12 - 25) / 25))
    : Math.max(5, Math.ceil((rw - 920 - 25) / 25));
  const insIcons = median(5, Math.min(insAvail, insCount), insCount);
  if (S.showinsbox) {
    /* 【展开的音色盒要按它自己的【全部行数】让位，而不是只让一行】
       盒子里有 insCount 个音色、每行 insIcons 个，所以占 rows = ceil(insCount/insIcons)
       行。原写法只在放不下时 `rowY += 25`（让一行），然后 step(insIcons*25) 右移 ——
       竖屏 rw=390 时 insIcons 只有 13，16 个音色排成 2 行，
       盒子边框实际是 y 71→125（54px 高），可后续工具图标仍然画在 y=98，
       整整 10 个图标压在音色按钮上面，点哪个都先命中音色。
       正确做法：把游标整体挪到盒子【下方】——
       ① 若盒子能整块放进当前行剩余宽度，就留在本行，行高按 rows 撑开；
       ② 放不下就换行，从左边起。
       两种情况都要让 rowMaxY 覆盖盒子的底部，后续控件才会排到盒子下面。 */
    const rows = Math.ceil(insCount / insIcons);
    const boxW = insIcons * 25 + 25;      // 盒子 + 折叠按钮
    if (wrapMode && rowX + boxW > rw - marginR) {
      rowX = 6; rowY += 25;
    }
    xx = rowX;
    drawWindow(xx - 2, rowY - 2, xx + insIcons * 25 + 2, rowY + rows * 25 + 2);
    for (let a = 0; a < rows; a++) {
      for (let b = 0; b < insIcons; b++) {
        const idx = a * insIcons + b;
        if (idx >= insCount) break;
        if (insIcon(idx, xx + b * 25, rowY + a * 25, S.instrument === idx)) {
          if (INSTRUMENTS[idx]) { playSound(INSTRUMENTS[idx], S.selected_key, 100, 100, 0); S.instrument = idx; S.selected_vel = 100; S.selected_pan = 100; S.selected_pit = 0; }
        }
      }
    }
    if (G.mbr[0] && !mouseRectangle(xx, rowY, insIcons * 25, rows * 25)) { S.showinsbox = 0; }
    // 折叠按钮放在盒子最后一行的右端，跟着盒子走
    insIcon(ICON.INSBOX_COLLAPSE, xx + insIcons * 25, rowY + (rows - 1) * 25, false, true);
    /* 关键：把游标移到盒子【正下方】。盒子高度是 rows*25，
       所以下一行起点 = rowY + rows*25；行高也要按盒子底部撑开。 */
    rowY += rows * 25;
    rowX = 6;
    rowMaxY = Math.max(rowMaxY, rowY);
  } else {
    if (S.instrument < S.insbox_start) S.insbox_start = floor(Math.max(0, S.insbox_start - insIcons) / insIcons) * insIcons;
    else if (S.instrument > S.insbox_start + insIcons - 1) S.insbox_start = floor((S.insbox_start + insIcons) / insIcons) * insIcons;
    S.insbox_start = median(0, S.insbox_start, insCount - insIcons);
    for (let a = S.insbox_start; a < S.insbox_start + insIcons; a++) {
      xx = atIcon();
      if (INSTRUMENTS[a] && insIcon(a, xx, rowY, S.instrument === a)) {
        playSound(INSTRUMENTS[a], S.selected_key, 100, 100, 0);
        S.instrument = a; S.selected_vel = 100; S.selected_pan = 100; S.selected_pit = 0;
      }
      step(IW);
    }
    if (insIcons < insCount) {
      xx = atIcon();
      if (insIcon(ICON.INSBOX_EXPAND, xx, rowY, false, true)) S.showinsbox = 1;
      step(IW);
    }
  }

  // 撤销/重做/复制... 工具组
  xx = atIcon(); step(4); drawSeparator(xx, rowY + 3); step(4); xx = atIcon();
  if (drawIcon(canUndo() ? ICON.UNDO : ICON.UNDO_INACTIVE, xx, rowY, '撤销', !canUndo())) actionUndo(); step(IW); xx = atIcon();
  if (drawIcon(canRedo() ? ICON.REDO : ICON.REDO_INACTIVE, xx, rowY, '重做', !canRedo())) actionRedo(); step(IW); xx = atIcon();
  if (drawIcon(S.selected ? ICON.COPY : ICON.COPY_INACTIVE, xx, rowY, '复制', !S.selected)) actionCopy(); step(IW); xx = atIcon();
  if (drawIcon(S.selected ? ICON.CUT : ICON.CUT_INACTIVE, xx, rowY, '剪切', !S.selected)) actionCut(); step(IW); xx = atIcon();
  if (drawIcon(S.clipboard ? ICON.PASTE : ICON.PASTE_INACTIVE, xx, rowY, '粘贴', !S.clipboard)) actionPaste(S.starta, S.startb); step(IW); xx = atIcon();
  if (drawIcon(S.selected ? ICON.DELETE : ICON.DELETE_INACTIVE, xx, rowY, '删除', !S.selected)) actionDelete(); step(IW); xx = atIcon();
  step(4); xx = atIcon(); drawSeparator(xx, rowY + 3); step(4); xx = atIcon();
  if (drawIcon(ICON.INFORMATION, xx, rowY, '歌曲信息')) { S.playing = 0; S.window = W_SONGINFOEDIT; } step(IW); xx = atIcon();
  if (drawIcon(ICON.PROPERTIES, xx, rowY, '歌曲属性')) { S.playing = 0; S.window = W_PROPERTIES; } step(IW); xx = atIcon();
  if (drawIcon(ICON.INSTRUMENTS, xx, rowY, '音色设置')) { S.playing = 0; S.window = W_INSTRUMENTS; } step(IW); xx = atIcon();
  if (drawIcon(ICON.MIDI_INPUT, xx, rowY, 'MIDI 设备管理器')) { S.playing = 0; S.window = W_MIDIDEVICES; } step(IW); xx = atIcon();
  // 用户要求：去掉工具栏上的「教程视频」「访问官方网站」两个按钮（外链在网页版里没用）。
  // 原版 control_draw.gml:1926/1929 有这两个 draw_icon，此处按需求删除。

  // 主音量
  const volW = wrapMode ? Math.max(60, Math.min(100, rw - marginR - 20)) : 100;
  xx = atIcon();
  if (wrapMode && xx + 11 + volW + 11 > rw - marginR) { rowX = 6; rowY += 25; rowMaxY = Math.max(rowMaxY, rowY); xx = rowX; }
  xx += 8;
  setColor(C.dark ? '#3a3a3a' : '#dcdcdc');
  roundRect(xx, rowY + 10, xx + volW, rowY + 13, 2, true);
  setColor(C.accent);
  roundRect(xx, rowY + 10, xx + volW * S.mastervol, rowY + 13, 2, true);
  setColor(C.accent);
  c.beginPath(); c.arc(xx + volW * S.mastervol, rowY + 11.5, 5, 0, Math.PI * 2); c.fill();
  /* 缓存音量条矩形，供下一帧帧首判定 volume_scroll（见 editorFrame 里的说明）。
     必须无条件缓存（而不是只在命中时），否则指针移出后 rect 会一直停在旧值。 */
  S.volbar_rect = { x: xx - 11, y: rowY, w: volW + 22, h: 22 };
  if (mouseRectangle(xx - 11, rowY, volW + 22, 22) && controlInteractive()) {
    G.cursor = 'pointer';
    popupSet(xx - 11, rowY, volW + 22, 22, '主音量：' + Math.round(S.mastervol * 100));
    if (G.mb[0]) S.mastervol = clamp((G.mouse.x - xx) / volW, 0, 1);
    if (G.wheel > 0) S.mastervol = Math.min(1, S.mastervol + 0.02);
    if (G.wheel < 0) S.mastervol = Math.max(0, S.mastervol - 0.02);
  }

  // 兼容性指示
  drawCompatibility();

  /* 把这一帧实测到的顶栏高度写回布局用。
     竖屏下顶栏折行后可能有两三行，网格必须从这里往下让开。 */
  const measured = (rowMaxY - 23) + 23 + 20;
  if (S.toolbar_h !== measured) S.toolbar_h = measured;
}

function insIcon(index, x, y, selected, collapse) {
  const hover = mouseRectangle(x, y, 25, 25) && controlInteractive();
  if (hover) G.cursor = 'pointer';
  if (collapse) {
    drawToolIcon(ICON.INSBOX_COLLAPSE, x, y, false);
    return hover && G.mbr[0];
  }
  if (selected) {
    setColor(C.accent);
    roundRect(x + 1, y + 1, x + 24, y + 24, 4, true);
  } else if (hover) {
    setColor(C.controlBgHover);
    roundRect(x + 1, y + 1, x + 24, y + 24, 4, true);
  }
  const ins = INSTRUMENTS[index];
  if (!ins) return false;
  popupSet(x, y, 25, 25, '更改音色为 ' + ins.name);
  if (index < S.first_custom_index) {
    drawSprite('spr_instrumenticons', index, x + 4, y + 4, 1, 1, selected ? '#ffffff' : null);
  } else {
    drawToolIcon(26, x + 4, y + 4, false);
    setFont(FONT.main(9));
    setColor(selected ? '#ffffff' : C.text);
    text(x + 12, y + 8, String((index - S.first_custom_index) % 10), 'center');
    setFont(FONT.main());
  }
  return hover && G.mbr[0];
}

function drawCompatibility() {
  const rw = S.rw;
  /* 竖屏：这块硬编码在右上角 y=24..49，而折行工具条会长到那个位置，
     两者必然重叠。窄屏下把文字省掉、只留两个兼容性图标，
     并贴到标签页那一行的右侧（y=1..19）—— 那里一定有空位。
     图标本身仍可点击开兼容性窗口，信息不丢。 */
  const narrow = !!S.portrait;
  const top = narrow ? 1 : 24;
  const iconY = narrow ? 0 : 25;
  const iconSize = narrow ? 18 : 20;
  const rightPad = 10;
  setColor(C.separator);
  if (!narrow) line(rw - 34, 26, rw - 34, 44);
  let label = '', col = COL.red, icon = 2;
  if (S.compatible === 1) { label = '完全兼容'; col = S.dark ? COL.lime : COL.green; icon = 0; }
  else if (S.compatible === 2) { label = '仅限数据包'; col = COL.orange; icon = 1; }
  else { label = '仅限资源包'; col = COL.red; icon = 2; }
  setFont(FONT.mainbold());
  setColor(col);
  // 对照 control_draw.gml:1952/1972：halign 是 fa_right，且绘制 x 是 rw - 65。
  // 两个 20px 图标分别画在 rw-59 和 rw-30（占 rw-59..rw-39 与 rw-30..rw-10），
  // 所以文字必须结束在 rw-65 才不会和图标挤在一起。
  // 之前写成 rw - 8（右对齐到最右边），文字直接压在两个图标上——就是「文字和两个图标重合」的原因。
  if (!narrow) text(rw - 65, 28, label, 'right');
  setFont(FONT.main());
  // 对照 control_draw.gml:1953-2025：spr_minecraft_f 的前 6 帧（0-2 与 +3 的暗色版）
  // 只是「线框」，真正上色的是后面 6/7/8 三帧的实心填充，并且用 accent 染色叠在
  // 线框上面：
  //   compatible = 1 → 底 + 6；compatible = 2 → 底 1 + 6；否则 底 2 + 6
  //   accent 索引 = 6 - 2 * !fdark（深色用 accent[6]，浅色用 accent[4]）
  // 之前只画了线框没画填充，所以右上角只看到两个空心圈。
  const accentIdx = 6 - 2 * (!S.fdark ? 1 : 0);
  const fillTint = T.accent[accentIdx];
  const iconR = rw - rightPad;
  const offs = narrow ? [iconR - iconSize, iconR - iconSize * 2 - 4] : [rw - 30, rw - 59];
  const frames = S.compatible === 1 ? [0, 0] : (S.compatible === 2 ? [0, 1] : [2, 1]);
  for (let i = 0; i < 2; i++) {
    const sc = narrow ? iconSize / 20 : 1;
    drawSprite('spr_minecraft_f', S.fdark ? 3 + frames[i] : frames[i], offs[i], iconY, sc, sc);
    drawSprite('spr_minecraft_f', frames[i] + 6, offs[i], iconY, sc, sc, fillTint);
  }
  const compx = Math.max(120, textWidth(label) + 60);
  const hitX = narrow ? (iconR - iconSize * 2 - 4) : (rw - compx);
  const hitW = narrow ? (iconSize * 2 + 4) : compx;
  if (mouseRectangle(hitX, top, hitW, iconSize + 6) && controlInteractive()) {
    G.cursor = 'pointer';
    popupSet(hitX, top, hitW, iconSize + 6, S.compatible === 1 ? '此歌曲兼容 schematic 和数据包。' : (S.compatible === 2 ? '此歌曲仅兼容数据包。' : '此歌曲仅兼容带资源包的数据包。'));
    if (G.mbp[0]) { S.playing = 0; S.window = W_COMPATIBILITY; }
  }
}

/* ---------------------------------------------------------------- 状态栏 */
function drawStatusBar() {
  const rw = S.rw, rh = S.rh;
  setColor(C.separator);
  line(0, rh - 24, rw, rh - 24);
  setFont(FONT.main(11));
  setColor(C.text);
  let xx = 4;
  const ins = INSTRUMENTS[S.instrument];
  text(xx, rh - 19, '音色: ' + (ins ? ins.name : '-')); xx += 170;
  drawSeparator(xx, rh - 20); xx += 6;
  text(xx, rh - 19, '音: ' + getKeyname(S.selected_key, 1)); xx += 70;
  drawSeparator(xx, rh - 20); xx += 6;
  if (S.selected_vel !== 100 || S.selected_pan !== 100 || S.selected_pit !== 0) {
    text(xx, rh - 19, '音量: ' + S.selected_vel); xx += 80;
    drawSeparator(xx, rh - 20); xx += 6;
    text(xx, rh - 19, '声道: ' + (S.selected_pan - 100)); xx += 84;
    drawSeparator(xx, rh - 20); xx += 6;
    text(xx, rh - 19, '音高: ' + S.selected_pit); xx += 74;
    drawSeparator(xx, rh - 20); xx += 6;
  }
  text(xx, rh - 19, '位置: ' + (S.selbx < 0 ? '无' : S.selbx)); xx += 80;
  drawSeparator(xx, rh - 20); xx += 6;
  text(xx, rh - 19, '层: ' + (S.selby < 0 ? '无' : S.selby + 1)); xx += 80;
  drawSeparator(xx, rh - 20); xx += 6;
  text(xx, rh - 19, '已选择: ' + S.selected + ' / ' + (S.totalblocks + S.selected)); xx += 130;
  drawSeparator(xx, rh - 20); xx += 6;

  if (S.hover.exist) {
    const x = S.selbx, y = S.selby;
    text(xx, rh - 19, '音: ' + getKeyname(gKey(x, y), 1)); xx += 74;
    drawSeparator(xx, rh - 20); xx += 6;
    text(xx, rh - 19, '音量: ' + gVel(x, y)); xx += 80;
    drawSeparator(xx, rh - 20); xx += 6;
    text(xx, rh - 19, '声道: ' + (gPan(x, y) === 100 ? '中央' : (gPan(x, y) < 100 ? 'L ' : 'R ') + Math.abs(gPan(x, y) - 100))); xx += 110;
    drawSeparator(xx, rh - 20); xx += 6;
    text(xx, rh - 19, '音高: ' + (gPit(x, y) > 0 ? '+' : '') + gPit(x, y) + ' 微分');
  }
  setColor(C.textDim);
  text(rw - 6, rh - 19, '无 MIDI 设备', 'right');
  setFont(FONT.main());
}

/* ---------------------------------------------------------------- 时间/速度框 */
function drawInfoBoxes() {
  const x1 = S.x1, y1 = S.y1;
  const c = G.ctx;

  /* 【竖屏重排】
     这一整块原本硬编码在 y = 50..79、x = 9..248（时间、小节.拍、速度、音色名）。
     桌面布局里正好落在顶栏下方的空白区，但竖屏顶栏会折行成 3~4 行、
     一直长到 y≈150，这一块就会被工具条图标压住（截图里能直接看到重叠）。
     所以竖屏下把整块【整体下移】到折行工具条之后，而不是隐藏它 ——
     速度和进度是高频查看/修改的东西，藏起来反而更难用。
     横屏时 dy = 0，坐标和原来逐像素一致。 */
  /* dy 把时间/速度块从原始的 y=50 挪到「折行工具条下方」。
     目标：块顶(50) 落在 toolbar_h + 6，块底(79) 落在 toolbar_h + 35，
     正好塞进 info_h = 40 那条带里，不会越过 y1 去压时间轴刻度。 */
  const dy = S.portrait ? ((S.toolbar_h || 52) + 6 - 50) : 0;
  const ty = (v) => v + dy;

  // 播放时间
  setFont(FONT.info_med_bold(15));
  setColor(C.text);
  if (S.theme === 3) text(9, ty(50), timeStr(S.marker_pos / S.tempo));
  else text(93, ty(50), timeStr(S.marker_pos / S.tempo), 'right');
  setFont(FONT.small());
  setColor(C.textDim);
  text(S.theme === 3 ? 26 : 93 - 67, ty(69), '/ ' + timeStr(S.enda / S.tempo));
  setFont(FONT.main());

  /* 这两个框在原版是 sprite，不是手绘矩形。对照 control_draw.gml:2265/2282 ——
         draw_sprite(spr_tempobox, 2*(theme==3) + 2*(fdark && theme==3), 184, 57)
     帧号只有两种：非 Fluent 用 0（或 2），Fluent 用 2（或 4）。
     spr_tempobox 共 6 帧 = 3 种框型 × 2 个主题变体（浅/深）。
     之前这里不分主题一律画 Fluent 圆角白框，所以经典/复古/暗黑下
     「小节.拍.十六分」和「速度」两个框都是 Fluent 的样子。
     Fluent 深色变体在 +2 的基础上再加 2（共 6 帧，索引 0..5）。 */
  const tboxDark = (S.theme === 3 && S.fdark) ? 2 : 0;
  const tboxFluent = (S.theme === 3) ? 2 : 0;

  // 小节.拍.十六分
  drawSprite('spr_tempobox', tboxFluent + tboxDark, 184, ty(57));
  setFont(FONT.small());
  setColor(C.text);
  /* 【三段顺序必须与原版一致 —— 之前整组写反了】
     对照 control_draw.gml:2267-2272（全部 fa_right，从左到右）：
       210  floor(marker_pos/(timesignature*4)) + 1   ← 小节
       215  "."
       225  floor((marker_pos/4) mod timesignature) + 1  ← 拍
       230  "."
       240  floor(marker_pos mod 4) + 1   ← 十六分
     即「小节.拍.十六分」，例如第 3 小节第 2 拍第 1 个十六分显示 3.2.1。
     之前把小节放在 240、十六分放在 210，视觉上就成了「十六分.拍.小节」，
     读数语义完全颠倒（显示 1.2.3）。 */
  text(210, ty(61), floor(S.marker_pos / (S.timesignature * 4)) + 1, 'right');
  text(215, ty(61), '.');
  text(225, ty(61), floor((S.marker_pos / 4) % S.timesignature) + 1, 'right');
  text(230, ty(61), '.');
  text(240, ty(61), floor(S.marker_pos % 4) + 1, 'right');
  popupSet(184, ty(57), 64, 22, '歌曲的进度（小节.拍.十六分）');

  // 速度框
  const useBpm = S.use_bpm;
  /* 对照 control_draw.gml:2277-2293：
     :2277  全部 fa_center
     :2279  BPM 模式框画在 **x = 101**
     :2282  t/s 模式框画在 **x = 108**
     :2290/2293  框内文字中心在 **136**、基线 y = 60
     原版让 BPM 框左移 7px，是因为 "123.45 BPM" 比 "12.34 t / s" 宽，
     左移一点避免文字超出框边。之前两种模式都画在 108、文字画在 140，
     切到 BPM 时框与文字整体偏右，长数值更容易溢出框外。 */
  const tboxX = useBpm ? 101 : 108;
  drawSprite('spr_tempobox', (useBpm ? 1 : 0) + tboxFluent + tboxDark, tboxX, ty(57));
  setFont(FONT.small());
  setColor(C.text);
  const bpm = S.tempo * 15;
  text(136, ty(61), useBpm ? bpm.toFixed(2) + ' BPM' : S.tempo.toFixed(2) + ' t / s', 'center');
  popupSet(tboxX, ty(57), 64, 22, useBpm ? '歌曲的速度（拍数/分钟）\n拖拽来大致更改，点击来手动输入，右键查看更多选项。'
    : '歌曲的速度（红石刻/秒）\n拖拽来大致更改，点击来手动输入，右键查看更多选项。');
  setFont(FONT.main());
  /* 正在手动输入速度时用强调色描一圈，作为「这个框处于编辑态」的提示。
     这是 web 版新增的反馈（原版此时会画输入光标），用 C.accent 而非硬编码色。 */
  if (S.window === W_SETTEMPO) {
    setColor(C.accent);
    roundRect(108.5, ty(57.5), 171.5, ty(78.5), 4, false);
  }
  /* 【拖拽进行中，速度滑块完全不响应】
     用户报："在画布上按住左键选区，此时如果刚好碰到了那个速度滑块，
     又会开始一边选区一边改变速度，全乱套了。"
     根因：这里只判了 `!isDialogWindow(S.window)`，而拖选区时
     S.window 是 0 或 W_DRAGSELECTION（后者在 TRANSIENT_WINDOWS 里，
     isDialogWindow 对它返回 false）—— 两种都放行，于是滑块照样收按下。
     一次按住只应该有一个操作对象，所以拖拽期间整个滑块既不响应
     按下拖动、也不响应留言/右键菜单。UI.dragHeld 由 editorFrame 计算，
     判据是拖拽状态变量（不依赖 G.mb[0]，见那边的说明）。 */
  if (mouseRectangle(108, ty(57), 64, 22) && controlInteractive()) {
    G.cursor = 'pointer';
    if (G.mbr[0]) { S.window = W_SETTEMPO; focusText(64, String(S.tempo)); UI.inputWindow = W_SETTEMPO; UI.textEnter = () => commitTempo(); }
    if (G.mb[0] && (G.mouse.x !== S._mx || G.mouse.y !== S._my) && !S.tempoDrag) {
      S.tempoDrag = { y: G.mouse.y, v: S.tempo };
      /* 一按下就登记"速度滑块进入拖动"，让它在本帧以及松手那一帧
         都被算进 UI.dragHeld（见下面 UI.tempoDragged 的说明）。 */
      UI.tempoDragged = true;
    }
    if (G.mbp[2]) openTempoMenu();
  }
  if (S.tempoDrag && G.mb[0]) {
    const d = (S.tempoDrag.y - G.mouse.y) * 0.25 / 3;
    S.tempo = median(0.25, S.tempoDrag.v + d, 60);
    S.tempo = floor(S.tempo * 4) / 4;
    S.changed = 1;
    UI.tempoDragged = true;
  }
  if (!G.mb[0]) S.tempoDrag = null;
  S._mx = G.mouse.x; S._my = G.mouse.y;
}

function commitTempo() {
  const v = parseFloat(UI.textStr[64]);
  if (!isNaN(v)) { S.tempo = median(0.25, S.use_bpm ? v / 15 : v, 60); S.changed = 1; }
  S.window = 0;
}

function openTempoMenu() {
  // 对照 control_draw 的 tempo 菜单：前两项是速度单位，之后是一串预设
  const mult = S.use_bpm ? 15 : 1;
  let s = (S.use_bpm ? '' : iconPrefix(ICON.CHECK)) + '红石刻/秒 (t/s)|' +
    (S.use_bpm ? iconPrefix(ICON.CHECK) : '') + '拍数/分钟 (BPM)|-|';
  for (const t of [10, 12, 14, 16, 18, 20, 30, 60]) {
    s += String(t * mult) + (S.tempo === t ? iconPrefix(ICON.CHECK) : '') +
      (S.use_bpm ? ' BPM' : ' t/s') + '|';
  }
  s += '-|速度测量器......';
  showMenu('tempo', G.mouse.x, G.mouse.y, s);
}

/* ---------------------------------------------------------------- 钢琴 */
/* 【钢琴的输入闸门 —— 对照 draw_piano.gml:25 / :61 的 `window = 0`】
   GML 里钢琴每一处命中判定都写着 `if (window = 0 && mouse_rectangle(...))`，
   要求【完全没有任何窗口状态】才响应。我们移植时写成了
   `!isDialogWindow(S.window)`，这两者【并不等价】：
     isDialogWindow(w) = (w !== 0 && TRANSIENT_WINDOWS.indexOf(w) < 0)
   而 TRANSIENT_WINDOWS 里装的正是拖拽状态：
     W_RELEASE / W_DRAG / W_DRAGMARKER / W_DRAGSELECTION / W_DRAGVOL /
     W_DRAGSTEREO / W_DRAGSECTION_START / W_DRAGSECTION_END / W_DRAGTEMPO / W_INSBOX
   所以拖选区时 S.window = W_DRAGSELECTION(24) → isDialogWindow 返回 false
   → 钢琴【照样判定命中】。这就是用户报的
   "在画布上按住左键拖动到钢琴，竟然也能按到钢琴"。
   （也解释了为什么只有部分键会响：drawPiano 里只有 overWhite 那一处
     加了 !UI.dragHeld，overBlack 和 else 分支没加，而拖拽时 UI.dragHeld
     又因为长按逻辑可能失效 —— 两个漏洞叠加，表现就非常零碎。）

   这里直接按 GML 的语义要求 window === 0，并且额外要求没有打开抽屉：
   抽屉是浮层，覆盖在钢琴上方，它的琴键（drawDrawerPiano）走同一套绘制，
   但输入应该只由抽屉自己那一份接管。 */
function pianoInputOpen() {
  /* 【抽屉打开时必须允许，否则抽屉里的琴键永远点不动】
     之前这里的注释写着"抽屉是浮层，它的琴键走同一套绘制，
     但输入应该只由抽屉自己那一份接管"—— 可是抽屉那一份
     （drawDrawerPiano）调用的是【同一个 drawPiano】，里面所有点击判断
     读的就是这个函数。于是 drawerOpen() 为真 → 返回 false →
     抽屉钢琴一个键都点不响，形成自锁。
     正确做法：抽屉自己的绘制期间把一个临时标志打开，让这段输入成立；
     抽屉之外的普通钢琴仍然要求 window === 0 且没有拖拽。 */
  if (typeof drawerOpen === 'function' && drawerOpen()) {
    return S.drawer_piano_input === 1;
  }
  return S.window === 0 && !UI.dragHeld;
}

function drawPianoAll() {
  const kc = S.dropmode ? 52 : S.keysshow;
  const px = floor(S.rw / 2 - (kc * 39) / 2);
  const py = S.rh - 154;
  drawPiano(px, py, kc, S.totalcols);
}

/* 钢琴两端渐隐的 alpha 夹紧。
   对照 draw_piano.gml:121 起 `alpha = max(0, 3 - startkey)`，
   循环体末尾（白键黑键共用一处）按
     if (a < 3 && alpha < 3) alpha += 1
     if (a > k - min(5, 54 - (startkey + k))) alpha -= 1
   变化；draw_piano_key.gml:20/70 的遮罩是 `if (alpha < 3)` 时叠
   `0.8 - alpha/3` 的窗口底色。

   【之前这里对"减到负值"的推断是错的，已更正】
   旧注释说 k=20、startkey=17 时会减到 -1 并把琴键盖死。实际算一遍：
     阈值 = 20 - min(5, 54 - (17+20)) = 20 - min(5,17) = 15
     a 从 0 起每轮先 +1（a<3 时），所以进入 a=16..19 时 alpha 早已是 3，
     减 4 次 → 最低 0，不会为负。
     起点 `max(0, 3-startkey)` 在 startkey >= 3 时恒为 3，
     而阈值保证最多减 5 次 —— 正好到 0。这就是 GML 的写法之所以安全。
   夹到 [0,3] 保持原样（比 GML 更保守，且不会改变正常情况下的结果）。 */
function clampAlpha(a) {
  return a < 0 ? 0 : (a > 3 ? 3 : a);
}

function drawPiano(xx, yy, k, totalcols) {
  setColor('#000000');
  let b = 0, downEdge = -1;
  let selectedkey = -1;
  // 本次绘制实际覆盖的色度键号区间（供抽屉状态栏显示，见函数末尾）
  let pianoKeyLo = Infinity, pianoKeyHi = -Infinity;
  // 对照 draw_piano.gml:12 `alpha = max(0, 3 - startkey) * !isplayer + 3 * isplayer`
  // 这是琴键两端渐隐用的 alpha（0..3），不是按键下沉的 down。
  // 循环末尾按 `if (a < 3) alpha += 1` / `if (a > k - min(5, 54-(startkey+k))) alpha -= 1` 变化。
  /* drawer_piano_flat：竖屏抽屉里键数太少时（见 drawDrawerPiano 的说明），
     把两端淡出整个关掉 —— 直接以 alpha=3（完全不透明）起步，
     并且后续的 ±1 增减也不会把它拉下来，因为下面的判断里
     `a < 3 && keyAlpha < 3` 与右端递减都依赖 keyAlpha 已在 3 以下。 */
  let keyAlpha = S.drawer_piano_flat ? 3 : Math.max(0, 3 - S.startkey);
  for (let a = 0; a < k; a++) {
    const cc = (S.startkey + a) % 7;
    if (a > 0 && cc !== 2 && cc !== 5) {
      // 有黑键
      const c1 = S.startkey + S.sharpkeys + b;
      const c2 = S.startkey + S.sharpkeys + b + 1;
      const k1 = S.show_keyboard && S.piano_key[c1] > 0;
      const k2 = S.show_keyboard && S.piano_key[c2] > 0;
      const overWhite = pianoInputOpen() && mouseRectangle(xx + 39 * a, yy, 39, 128);
      if (overWhite) {
        const inLeftBlack = mouseRectangle(xx + 39 * a - 12, yy - 7, 25, 71);
        const inRightBlack = mouseRectangle(xx + 39 * a + 27, yy - 7, 25, 71);
        if (!inLeftBlack && (!inRightBlack || a === k - 1 || cc === 1 || cc === 4)) {
          if (S.show_notechart && c2 > 6 && c2 < 69 && !S.playing) drawNoteChart(xx + 39 * a + 18, yy - 32, S.startkey + a, 0);
          if (G.mbp[2] && S.show_keyboard) S.key_edit = c2;
          const t = S.key_click[c2];
          S.key_click[c2] = G.mb[0] ? 1 : 0;
          if (t === 0 && S.key_click[c2]) {
            selectedkey = c2;
            playSound(INSTRUMENTS[S.instrument], c2, 100, 100, 0);
          }
          if (a === k - 1) downEdge = 1;
          if (a === 0) downEdge = 0;
        }
      } else S.key_click[c2] = 0;
      // 黑键命中
      const overBlack = pianoInputOpen() && mouseRectangle(xx + 39 * a - 12, yy - 7, 25, 71);
      if (overBlack) {
        if (S.show_notechart && !S.keynames_flat && c1 > 6 && c1 < 70 && !S.playing) drawNoteChart(xx + 39 * a, yy - 32, S.startkey + a - 1, 1);
        if (G.mbp[2] && S.show_keyboard) S.key_edit = c1;
        const t = S.key_click[c1];
        S.key_click[c1] = G.mb[0] ? 1 : 0;
        if (t === 0 && S.key_click[c1]) { selectedkey = c1; playSound(INSTRUMENTS[S.instrument], c1, 100, 100, 0); }
      } else S.key_click[c1] = 0;

      // 白键
      let out = (c2 < 33 || c2 > 57);
      let col = '#ffffff';
      if (S.show_outofrange && out) col = COL.outOfRange;
      // 对照 draw_piano.gml:65：非 Fluent 用固定色 16753828（=#a4a4ff 淡蓝紫），Fluent 用 accent[7]
      if (S.selected_key === c2 && !S.playing) col = S.theme !== 3 ? COL.keySelected : T.accent[7];
      let d1 = 0;
      const since2 = (G.time - S.key_played[c2]) * 1000;
      if (since2 < 300) { col = mergeColor(col, '#ffff00', 1 - since2 / 300); d1 = ((since2 / 300) * 2); if (d1 > 1) d1 = 2 - d1; d1 = floor(d1 * 3) / 3; }
      if (S.key_press[c2] || S.key_click[c2]) d1 = 0.75;
      // 对照 draw_piano.gml:69 `draw_piano_key(false, xx + 39*a, yy + floor(7*down[1]), ...)`:
      // 白键的下沉偏移【只在这里加一次】，drawPianoKey 内部不再加。
      drawPianoKey(false, xx + 39 * a, yy + floor(7 * d1), col, clampAlpha(keyAlpha), c2, k2, !out && S.show_keynumbers, d1);
      // 黑键
      let out1 = (c1 < 33 || c1 > 57);
      let col1 = '#ffffff';
      if (S.show_outofrange && out1) col1 = COL.outOfRange;
      if (S.selected_key === c1 && !S.playing) col1 = S.theme !== 3 ? COL.keySelected : T.accent[7];
      let d0 = 0;
      const since1 = (G.time - S.key_played[c1]) * 1000;
      if (since1 < 300) { col1 = mergeColor(col1, '#ffff00', 1 - since1 / 300); d0 = ((since1 / 300) * 2); if (d0 > 1) d0 = 2 - d0; d0 = floor(d0 * 3) / 3; }
      if (S.key_press[c1] || S.key_click[c1]) d0 = 0.75;
      // 对照 draw_piano.gml:82 `draw_piano_key(true, xx + 39*a - 19, yy - 7, col, ...)`:
      // 黑键只传 yy-7（不含下沉量），下沉量由 drawPianoKey 内部按 floor(7*ispressed) 加。
      // 之前这里写成 yy - 7 + floor(7*d0)，内部又加一次，等于偏移了双倍，
      // 黑键会被整体下移并露出顶部 —— 就是「黑键顶部没被蓝色覆盖」的原因。
      drawPianoKey(true, xx + 39 * a - 19, yy - 7, col1, clampAlpha(keyAlpha), c1, k1, !out1 && S.show_keynumbers, d0);
      if (c1 < pianoKeyLo) pianoKeyLo = c1;
      if (c2 > pianoKeyHi) pianoKeyHi = c2;
      b += 2;
      /* 【黑键分支里不要再动 keyAlpha】
         GML 的 draw_piano.gml:119-120 只有【一处】增减，在 `b += 1` 之后、
         循环体末尾（白键和黑键共用的位置）。
         我们之前在 if/else 两个分支里各写了一遍，于是黑键那一轮
         keyAlpha 被改了两次 —— 两端渐隐的速度是白键的两倍，
         左端还没到 3 就提前"满"，右端提前掉到 0。
         这就是用户看到的「左右两边渐变处理不正确」。 */
    } else {
      const c1 = S.startkey + S.sharpkeys + b;
      const k1 = S.show_keyboard && S.piano_key[c1] > 0;
      if (pianoInputOpen() && mouseRectangle(xx + 39 * a, yy, 39, 128)) {
        const inBlack = mouseRectangle(xx + 39 * a + 27, yy - 7, 25, 71) && !(a === k - 1 || cc === 1 || cc === 4);
        if (!inBlack) {
          if (S.show_notechart && c1 > 6 && c1 < 69 && !S.playing) drawNoteChart(xx + 39 * a + 18, yy - 32, S.startkey + a, 0);
          if (G.mbp[2] && S.show_keyboard) S.key_edit = c1;
          const t = S.key_click[c1];
          S.key_click[c1] = G.mb[0] ? 1 : 0;
          if (t === 0 && S.key_click[c1]) { selectedkey = c1; playSound(INSTRUMENTS[S.instrument], c1, 100, 100, 0); }
          if (a === k - 1) downEdge = 1;
          if (a === 0) downEdge = 0;
        }
      } else S.key_click[c1] = 0;
      const out = (c1 < 33 || c1 > 57);
      let col = '#ffffff';
      if (S.show_outofrange && out) col = COL.outOfRange;
      if (S.selected_key === c1 && !S.playing) col = S.theme !== 3 ? COL.keySelected : T.accent[7];
      let d = 0;
      const since = (G.time - S.key_played[c1]) * 1000;
      if (since < 300) { col = mergeColor(col, '#ffff00', 1 - since / 300); d = ((since / 300) * 2); if (d > 1) d = 2 - d; d = floor(d * 3) / 3; }
      if (S.key_press[c1] || S.key_click[c1]) d = 0.75;
      drawPianoKey(false, xx + 39 * a, yy + floor(7 * d), col, clampAlpha(keyAlpha), c1, k1, !out && S.show_keynumbers, d);      b += 1;
      if (c1 < pianoKeyLo) pianoKeyLo = c1;
      if (c1 > pianoKeyHi) pianoKeyHi = c1;
    }
    // 对照 draw_piano.gml:119-120：两端渐隐
    //   if (a < 3 && alpha < 3) alpha += 1
    //   if (a > k - min(5, 54 - (startkey + k))) alpha -= 1
    if (a < 3 && keyAlpha < 3) keyAlpha += 1;
    if (!S.drawer_piano_flat && a > k - Math.min(5, 54 - (S.startkey + k))) keyAlpha -= 1;
    if (keyAlpha < 0) keyAlpha = 0;
  }
  if (selectedkey > -1) { S.selected_key = selectedkey; S.selected_vel = 100; S.selected_pan = 100; S.selected_pit = 0; }

  /* 记录本次实际画出的【色度键号】范围，供抽屉的状态栏显示。
     为什么在这里记、而不是调用方自己算：
       S.startkey 是【白键索引】（0 = A0），不是色度键号；
       色度键号 = S.startkey + S.sharpkeys。
       调用方若直接拿 S.startkey 去套 getKeyname，
       显示的音域会和画出来的琴键差好几个键
       （实测显示 G#2~E3，画出来的却是 C4~D5）。
     用循环里累积的 min/max 最可靠 —— 不管 drawPianoKey 的偏移怎么变，
     它一定等于真正画出去的那些键。 */
  S.piano_drawn_lo = (pianoKeyLo === Infinity) ? 0 : pianoKeyLo;
  S.piano_drawn_hi = (pianoKeyHi === -Infinity) ? 0 : pianoKeyHi;
  // 滚动换八度
  if (downEdge === 0 && S.startkey > 0 && !G.mb[0] && S.delay === 0) {
    const a = S.startkey % 7;
    if (a !== 2 && a !== 5) S.sharpkeys--;
    S.startkey--; S.delay = 2;
  }
  if (downEdge === 1 && !G.mb[0] && S.delay === 0 && S.startkey + k < 52) {
    const a = S.startkey % 7;
    if (a !== 1 && a !== 4) S.sharpkeys++;
    S.startkey++; S.delay = 2;
  }
}

function offPiano() { return (S.theme === 3 ? 6 : 0) + ((S.theme === 3 && S.fdark) ? 6 : 0); }

/* 完整移植 draw_piano_key.gml。
   签名与源码一致：draw_piano_key(isblack, xx, yy, color, alpha, key, showkeybind, showclicks, ispressed)

   黑键由【两块精灵拼成】，这是之前漏掉的关键：
     spr_piano 帧 1 = 黑键上半部（bbox y 0..60，宽 25）
     spr_piano 帧 2 = 黑键底部那一条（bbox y 60..71，宽 25，只有 11 高）
   源码把帧 2 画在 yy、帧 1 画在 yy + floor(7*ispressed)，两者沿 y=60 拼成一个完整黑键。
   我之前只画了帧 1，所以黑键底部那 11px 一直是露出来的、选中色也盖不到它
   —— 就是用户看到的「底部有一节节没有被蓝色覆盖」。

   alpha 遮罩层（帧 3/4/5、6/7/8、9/10/11）用于琴键两端渐隐，
   条件是 `if (alpha < 3)`，颜色是 window_background、透明度 0.8 - alpha/3。
   帧布局：白=0/3、黑上=1/4、黑下=2/5（经典）；+6 是 Fluent，+6 再是 Fluent 深色。 */
function drawPianoKey(isblack, xx, yy, color, alpha, key, showkeybind, showclicks, ispressed) {
  const o = offPiano();
  if (alpha === undefined) alpha = 3;
  // 两端渐隐遮罩：alpha < 3 时叠一层窗口底色
  const mask = (frameNo, yy2) => {
    /* 对照 draw_piano_key.gml:20/23/70/73：
         if (alpha < 3) draw_sprite_ext(..., window_background, 0.8 - alpha / 3)
       条件只有 `alpha < 3`，【没有 alpha > 0】。
       我们之前写成 `alpha > 0 && alpha < 3`，等于在 alpha 恰好为 0 时
       干脆不画遮罩 —— 而 alpha = 0 正是"最该压暗"的那一档
       （0.8 透明度窗口底色），跳过它会让最外侧那个键比内侧的还亮，
       两端渐变看起来就是断的、里外颠倒。
       现在严格按 GML：只要 alpha < 3 就画，alpha = 0 时遮罩 0.8。 */
    if (alpha < 3) drawSprite('spr_piano', frameNo, xx, yy2, 1, 1, C.background,
      clamp(0.8 - alpha / 3, 0, 1));
  };
  if (isblack) {
    // Key：先画底部小条，再画上半身（与源码顺序一致）
    drawSprite('spr_piano', 2 + o, xx, yy, 1, 1, color);
    mask(5 + o, yy);
    drawSprite('spr_piano', 1 + o, xx, yy + floor(7 * ispressed), 1, 1, color);
    mask(4 + o, yy + floor(7 * ispressed));
    // Text
    setAlpha(alpha / 3);
    setFont(FONT.mainbold(10));
    setColor((S.theme === 3 && S.fdark) ? color : '#ffffff');
    if (S.show_keynames) {
      text(xx + 19, yy + 29 + floor(7 * ispressed) - 4 * (showkeybind ? 1 : 0)
        - 4 * ((showkeybind && showclicks) ? 1 : 0) - 6 * (showclicks ? 1 : 0),
        getKeyname(key, 1), 'center');
    }
    if (showclicks) {
      text(xx + 19, yy + 34 + floor(7 * ispressed) - 8 * (showkeybind ? 1 : 0), String(key - 33), 'center');
    }
    setFont(FONT.main(10));
    // 源码没有单独 set_color，沿用上面 draw_set_color(color / c_white) 的结果
    if (showkeybind && ((floor(S.editline) % 15) < 7 || S.key_edit !== key)) {
      text(xx + 19, yy + 39 + floor(7 * ispressed), String.fromCharCode(S.piano_key[key] || 32), 'center');
    }
    setAlpha(1);
    setFont(FONT.main());
  } else {
    // Key
    drawSprite('spr_piano', 0 + o, xx, yy, 1, 1, color);
    mask(3 + o, yy);
    // Text
    setAlpha(alpha / 3);
    setFont(FONT.mainbold(10));
    setColor((S.theme === 3 && S.fdark) ? color : '#000000');
    if (S.show_keynames) {
      text(xx + 20, yy + 85 - 4 * (showkeybind ? 1 : 0) - 4 * ((showkeybind && showclicks) ? 1 : 0)
        - 6 * (showclicks ? 1 : 0), getKeyname(key, 1), 'center');
    }
    if (showclicks) {
      text(xx + 20, yy + 85 + 5 - 8 * (showkeybind ? 1 : 0), String(key - 33), 'center');
    }
    setFont(FONT.main(10));
    if (showkeybind && ((floor(S.editline) % 15) < 7 || S.key_edit !== key)) {
      text(xx + 20, yy + 95, String.fromCharCode(S.piano_key[key] || 32), 'center');
    }
    setAlpha(1);
    setFont(FONT.main());
  }
}

function drawNoteChart(x, y, key, accidental) {
  // 对照 draw_notechart：背景用 spr_notechart，谱号/音符都用原精灵
  const nx = median(0, x - 32, S.rw - 320);
  const shifted = x > S.rw - 250;
  drawSprite('spr_notechart', 0 + 3 * S.theme, nx, y - 320 + 1);
  drawSprite('spr_notechart', (1 + (shifted ? 1 : 0)) + 3 * S.theme, x - (shifted ? 16 : 0), y);

  setColor('#000000');
  setAlpha(0.25);
  for (let a = 0; a < 11; a++) {
    if (a !== 5) line(nx + 32, y - 250 + 16 * a, nx + 320 - 32, y - 250 + 16 * a);
  }
  setAlpha(1);
  setColor('#000000');
  line(nx + 32, y - 250, nx + 32, y - 250 + 64);
  line(nx + 32, y - 250 + 96, nx + 32, y - 250 + 160);
  drawSprite('spr_Gclef', 0, nx + 58, y - 250 + 48);
  drawSprite('spr_Fclef', 0, nx + 48, y - 250 + 112);
  drawSprite(S.keynames_flat ? 'spr_note_flat' : 'spr_note_sharp',
    accidental + 2 * (key > 22 ? 1 : 0), nx + 152, y - 250 - 8 * (key - 33));
  if (key > 22 && key < 25) {
    setAlpha(0.25); line(nx + 122, y - 250 + 80, nx + 180, y - 250 + 80); setAlpha(1);
  }
  for (let a = 1; a < floor((key - 31) / 2); a++) {
    setAlpha(0.25); line(nx + 122, y - 250 - 16 * a, nx + 180, y - 250 - 16 * a); setAlpha(1);
  }
  for (let a = 0; a < 7 - ceil(key / 2); a++) {
    setAlpha(0.25); line(nx + 122, y - 250 + 176 + 16 * a, nx + 180, y - 250 + 176 + 16 * a); setAlpha(1);
  }
  setAlpha(1);
}

/* ---------------------------------------------------------------- 辅助 */
function setMsg(s) { S.msgtext = s; S.msgtime = G.time; }
function drawMsg() {
  /* 导出音频期间显示常驻进度条。
     setMsg 的消息 4 秒就淡出，而渲染一首 2 分钟的歌要几十秒 ——
     只靠 setMsg 用户会以为程序没反应。这里渲染期间一直显示进度与百分比。 */
  if (S.render_progress !== undefined && S.render_progress >= 0) {
    const p = clamp(S.render_progress, 0, 1);
    const label = S.render_msg || '正在渲染音频...';
    setColor(C.dark ? 'rgba(50,50,50,0.95)' : 'rgba(255,255,255,0.95)');
    const w = Math.max(260, textWidth(label) + 40);
    roundRect(8, S.rh - 74, 8 + w, S.rh - 28, 4, true);
    setColor(C.text);
    text(18, S.rh - 69, label + '  ' + Math.round(p * 100) + '%');
    // 进度条
    setColor(C.dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.12)');
    fillRect(18, S.rh - 46, w - 36, 6);
    setColor(T.accent[0]);
    fillRect(18, S.rh - 46, (w - 36) * p, 6);
    return;
  }
  if (!S.msgtext || G.time - S.msgtime > 4) return;
  const a = clamp(4 - (G.time - S.msgtime), 0, 1);
  setAlpha(a);
  setColor(C.dark ? 'rgba(50,50,50,0.95)' : 'rgba(255,255,255,0.95)');
  const w = textWidth(S.msgtext) + 20;
  roundRect(8, S.rh - 52, 8 + w, S.rh - 28, 4, true);
  setColor(C.text);
  text(18, S.rh - 47, S.msgtext);
  setAlpha(1);
}

/* 音色切换时的模式动作 */
/* 对照 mode_action.gml 逐条移植。
 *
 * 【这里之前是错的，而且错得很隐蔽】
 * 原来写的是：
 *     if (n <= 4) { S.editmode = n - 1; }
 *     else if (n === 5) { if (S.selected) { } }
 * 也就是"把 num 当成编辑模式编号"存了一下，别的什么都没做。
 * 而原版 mode_action(num) 的语义是：在【当前编辑模式】下执行动作 num ——
 *     m_key 模式 → selection_changekey(12/-12/1/-1)
 *     m_vel 模式 → selection_changevel(10/-10/1/-1)，5 打开设定对话框，6 重置
 *     m_pan 模式 → selection_changepan(10/-10/1/-1)，5 打开对话框，6 重置
 *     m_pit 模式 → selection_changepit(10/-10/1/-1)，5 打开对话框，6 重置
 * 所以用户按 Ctrl+E / Ctrl+D（num = 1 / 2）、或点右键菜单里那些
 * "升八度 / 降八度 / 增加 10 音量…" 时，音符【一点都没变】。
 *
 * m_key / m_vel / m_pan / m_pit 的编号见 song.js 顶部的常量（0..3）。 */
function modeAction(n) {
  /* 【不能在这里用「空选区」提前返回 —— 对照 mode_action.gml:6-7】
     GML 一进函数就 `changed = 1`，完全没有 selected 守卫；
     case 5/6/7 的设定窗口照常打开，由窗口自己判断：
         draw_window_macro_setvelocity.gml:4-7
             if (selected = 0) { window = 0 return 0 }
     也就是原版会「弹一下然后立刻自关」，但 changed 已经置位。
     我们之前在函数口 `if (S.selected === 0) return 0;`，
     于是右键菜单的「设定音量…/设定音符声道…/设定音高…」
     以及 Ctrl+T / Ctrl+G 在无选区时点了毫无反应。
     case 1..4 的 selection_change* 在空选区时本来就是空操作，无需额外保护。 */
  S.changed = 1;
  const mode = S.editmode | 0;
  if (mode === 0) {                       // m_key：音高
    if (n === 1) return selectionChangeKey(12);
    if (n === 2) return selectionChangeKey(-12);
    if (n === 3) return selectionChangeKey(1);
    if (n === 4) return selectionChangeKey(-1);
  } else if (mode === 1) {                // m_vel：音量
    if (n === 1) return selectionChangeVel(10);
    if (n === 2) return selectionChangeVel(-10);
    if (n === 3) return selectionChangeVel(1);
    if (n === 4) return selectionChangeVel(-1);
    if (n === 5) { S.window = W_SETVELOCITY; return 1; }
    if (n === 6) return selectionSetVel(100);
  } else if (mode === 2) {                // m_pan：声道
    if (n === 1) return selectionChangePan(10);
    if (n === 2) return selectionChangePan(-10);
    if (n === 3) return selectionChangePan(1);
    if (n === 4) return selectionChangePan(-1);
    if (n === 5) { S.window = W_SETPANNING; return 1; }
    if (n === 6) return selectionSetPan(100);
  } else if (mode === 3) {                // m_pit：微分音
    if (n === 1) return selectionChangePit(10);
    if (n === 2) return selectionChangePit(-10);
    if (n === 3) return selectionChangePit(1);
    if (n === 4) return selectionChangePit(-1);
    if (n === 5) { S.window = W_SETPITCH; return 1; }
    if (n === 6) return selectionSetPit(0);
  }
  return 0;
}
