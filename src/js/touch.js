/* ==========================================================================
 * 触屏 / 指针模态支持
 *
 * 【怎么判断「这是不是触屏设备」】
 *   不能只看 UA，也不能只做一次性的能力检测：
 *     · iPadOS 13+ 的 Safari 在「桌面模式」下 UA 里带的是 "Macintosh"；
 *     · 有些手机接了蓝牙鼠标键盘，用户此刻其实是在用鼠标点；
 *     · 有些笔记本 / 一体机带触摸屏，但平时用的是触控板；
 *     · 混合设备两者都有，甚至同一分钟里交替使用。
 *   所以这里把「能力」和「当前模态」拆成两件事：
 *
 *     TOUCH.capable —— 设备【是否具备】触屏能力。用来决定要不要装触摸处理器。
 *                      由三条独立证据取或（任一成立即算）：
 *                        navigator.maxTouchPoints > 0
 *                        matchMedia('(pointer: coarse)')
 *                        'ontouchstart' in window
 *                      单独任何一条都不可靠，取并集最稳。
 *
 *     TOUCH.mode    —— 用户【此刻正在用】哪种输入，0 = 鼠标/键盘，1 = 触屏。
 *                      由最近一次真实指针事件的 pointerType 决定：
 *                       touch / pen → 1，mouse → 0。
 *                      于是「手机接鼠标」时点一下就切到鼠标语义，
 *                      「触屏笔记本」上手点屏就切到触屏语义 —— 按实际交互走，
 *                      而不是给设备贴一个永远不变的标签。
 *
 *   初始模态用「主指针是否粗糙」猜一次：pointer:coarse 且 maxTouchPoints>0
 *   → 触屏模态；否则鼠标模态。之后完全跟随实际输入。
 *
 * 【长按 = 右键】
 *   原版的右键在网格上语义很具体（editor.js handleGridInput 686-730）：
 *     · 按下（mbp[2]）→ 若该格有音符，直接删掉，并记 rightPress.removed
 *     · 松开（mbr[2]）→ 若没移动过也没删到东西，弹出右键菜单
 *   而左键是【松开时才落音符】（mbr[0] 那一支）。利用这个时序：
 *     按下时先照常投递左键（按钮/图标要即点即应，不能延迟），
 *     长按计时器到点时【撤回左键但不投递 mbr[0]】—— 于是不会落音符；
 *     同时投递一个真正的 mbp[2]，让上面的右键逻辑原样复用。
 *   抬手时投递 mbr[2]，菜单就会弹出来。这样长按完全是「真的右键」，
 *   不需要在菜单/擦除/选区那些分支里各写一份触屏特例。
 *
 *   长按触发后把落点【冻结】：后续移动不再投递。否则手指微动会被
 *   `S.rightPress.moved = true` 判成「右键拖动擦除」，刷掉一片音符。
 *   这是一处刻意的偏离（桌面端右键拖动仍然是连续擦除）。
 * ========================================================================== */

const TOUCH = {
  capable: 0,          // 设备具备触屏能力
  mode: 0,             // 当前输入模态：0 鼠标 / 1 触屏
  primary: -1,         // 正在跟踪的触点 pointerId，-1 = 没有
  press: null,         // 当前这次按压的状态
  timer: null,         // 长按计时器
  blockMouseUntil: 0,  // 触摸结束后短暂屏蔽兼容鼠标事件
  lastType: '',        // 最近一次真实指针类型，仅用于调试/测试
  longPressMs: 450,    // 长按判定阈值
  slop: 10,            // 逻辑像素，超过就算「移动了」
  pan_acc: 0,          // 横向平移的未满 1 格余量（见 touchPan 说明）
  pan_acc_y: 0,        // 纵向同上
};

/* 【为什么触屏模态不改动全局缩放】
   早期版本在这里维护一个 TOUCH_MIN_SCALE 下限：
       return Math.max(base, TOUCH_MIN_SCALE);   // 1.3
   后果是【一切到触屏模式，整个页面突然放大】—— 用户设的 100% 被悄悄改成 130%，
   这是一种"看不见的控制"：用户既不知道发生了什么，也不好从别处调回来。
   缩放是用户的偏好，不该被静默改写，所以这里直接返回用户设置的值。
   触控目标偏小的问题改由【各控件自己的尺寸】解决
   （抽屉按钮 24~26、琴键保持 39、滚动条 16→不变），而不是劫持全局缩放。 */
function touchEffScale() {
  const base = (typeof S.window_scale === 'number' && S.window_scale > 0) ? S.window_scale : 1;
  return base;
}

/* 触摸期间以及刚结束的一小段时间里，屏蔽浏览器补发的兼容鼠标事件，
   否则一次轻点会同时走 pointer 和 mouse 两条路，等于点了两下。 */
function touchMouseBlocked() {
  return TOUCH.primary >= 0 || performance.now() < TOUCH.blockMouseUntil;
}

function toLogicalPoint(e) {
  const r = G.canvas.getBoundingClientRect();
  const sc = touchEffScale();
  return [(e.clientX - r.left) / sc, (e.clientY - r.top) / sc];
}

/* 切换输入模态：只有真的变了才重新布局，避免每帧抖动 */
function touchSetModality(m) {
  TOUCH.lastType = m ? 'touch' : 'mouse';
  if (TOUCH.mode === m) return;
  TOUCH.mode = m;
  S.touch_mode = m;
  // 缩放下限变了（见 touchEffScale），必须重算画布与布局
  if (typeof layoutResize === 'function') layoutResize();
}

/* 判断起点是否落在网格区域（只有网格上才做拖动平移） */
function touchInGrid(x, y) {
  if (typeof S.totalcols !== 'number' || typeof S.totalrows !== 'number') return false;
  return x >= S.gx && y >= S.gy &&
    x < S.gx + S.totalcols * 32 && y < S.gy + S.totalrows * 32;
}

function touchClearTimer() {
  if (TOUCH.timer !== null) { clearTimeout(TOUCH.timer); TOUCH.timer = null; }
}

/* 长按触发：把左键换成右键。
   关键点是【只清 G.mb[0] / G.mbp[0]，绝不设置 G.mbr[0]】——
   左键的落音符动作挂在 mbr[0] 上，不给它就不会落。 */
function touchFireLongPress() {
  const p = TOUCH.press;
  TOUCH.timer = null;
  if (!p || p.longFired || p.panned) return;
  if (p.moved) return;                 // 已经动了，说明是拖拽，不是长按
  p.longFired = true;

  // 撤回左键（不给 mbr[0]）
  G.mb[0] = false; G.mbp[0] = false;
  S.clickinarea = 0;
  S.dontplace = 0;
  // 左键按下可能已经开了拖拽状态，一并复位
  if (S.select === 1) {
    S.select = 0;
    S.select_pressx = -1; S.select_pressy = -1;
    S.select_pressa = -1; S.select_pressb = -1;
  }
  if (S.window === W_DRAGSELECTION || S.window === W_DRAG) {
    S.window = 0;
    if (typeof SB !== 'undefined' && SB.hold !== undefined) { SB.hold = -2; SB.drag[0] = -1; SB.drag[1] = -1; }
  }

  // 投递真正的右键按下，落在长按起点
  G.mouse.x = p.x; G.mouse.y = p.y;
  G.mb[2] = true; G.mbp[2] = true;

  if (navigator.vibrate) { try { navigator.vibrate(12); } catch (_) { } }
}

function touchPointerDown(e) {
  if (e.pointerType === 'mouse') { touchSetModality(0); return; }   // 鼠标事件照旧走 mousedown
  touchSetModality(1);
  TOUCH.lastType = e.pointerType;

  // 已经有主触点在跟踪：忽略第二根手指（不做双指手势）
  if (TOUCH.primary >= 0) { e.preventDefault(); return; }
  e.preventDefault();

  const [x, y] = toLogicalPoint(e);
  TOUCH.primary = e.pointerId;
  TOUCH.pan_acc = 0;    // 每次新的按压都从整格边界开始累积
  TOUCH.pan_acc_y = 0;
  TOUCH.press = {
    x0: x, y0: y, x, y,
    t0: performance.now(),
    moved: false, panned: false, longFired: false,
    inGrid: touchInGrid(x, y),
    /* 【canPan 现在恒为 false：触屏不再平移画布】
     *
     * 用户反馈的原话：「不要拖拽画布，而是和鼠标左键按住拖动一样的选择，
     *   横向纵向拖动画布只用旁边的滑块就够了。」
     *
     * 旧逻辑是「空网格上拖动 = 平移画布」，只在已有选区时才拖选。
     * 问题是在触屏上这两件事的手势完全一样（都是单指按住拖动），
     * 用户没法预期自己这次是"移动视野"还是"框选"：
     * 空网格上想框选一片区域，结果画布跑了；
     * 反过来想微调视野，又因为落点恰好有音符合法地变成拖动音符。
     * 而且竖屏本来就窄，平移最容易误触发。
     *
     * 现在统一成一种语义：单指拖动 = 左键拖动 = 拖选/拖音符。
     * 视野平移交给滚动条（桌面的横向/纵向滑块，竖屏也有），
     * 想快速跳转另有「跟随播放位置」和键盘翻页。
     *
     * 保留 canPan 这个字段而不是删掉：touchPointerMove 里还有它的分支，
     * 日后若要恢复某种"按住空白平移"的手势（比如双指），改这里即可。
     * touchPan / touchPanEnd 也一并保留，逻辑仍然正确可用。 */
    canPan: false,
  };

  // 左键按下立刻投递（按钮要即点即应，不能等长按判定）
  G.mouse.x = x; G.mouse.y = y;
  G.mb[0] = true; G.mbp[0] = true;

  touchClearTimer();
  TOUCH.timer = setTimeout(touchFireLongPress, TOUCH.longPressMs);
}

function touchPointerMove(e) {
  const p = TOUCH.press;
  if (!p || e.pointerId !== TOUCH.primary) return;
  e.preventDefault();

  // 长按已经触发：落点冻结，不投递移动（见文件头说明）
  if (p.longFired) return;

  const [x, y] = toLogicalPoint(e);
  // 先取上一帧位置再覆盖，否则 touchPan 里的增量恒为 0（原地不动）
  const prevX = p.x, prevY = p.y;
  p.x = x; p.y = y;
  G.mouse.x = x; G.mouse.y = y;

  const dx0 = x - p.x0, dy0 = y - p.y0;
  if (!p.moved && Math.abs(dx0) <= TOUCH.slop && Math.abs(dy0) <= TOUCH.slop) return;
  p.moved = true;

  if (p.canPan) {
    // 超出阈值 → 判定为拖动平移，撤掉这次点击
    if (!p.panned) {
      p.panned = true;
      touchClearTimer();
      G.mb[0] = false; G.mbp[0] = false;
      S.clickinarea = 0;
    }
    touchPan(x - prevX, y - prevY);
    return;
  }

  // 非平移场景：照常把位置喂给点击逻辑（拖选 / 拖标记等）
  touchClearTimer();
  if (S.select === 1 && p.inGrid) G.cursor = 'default';
}

/* 单指拖动平移网格。
 *
 * 【为什么必须写 SB.val 而不是只改 S.starta】
 *   drawHScrollbar 每帧都会执行：
 *       if (SB.drag[0] === -1) SB.val[0] = clamp(S.starta, ...)
 *       const v = drawScrollbarGML(...)
 *       if (SB.drag[0] !== -1 || !following) S.starta = clamp(v, ...)
 *   也就是说 SB 是"权威值"，S.starta 每帧都会被它覆盖回去。
 *   只写 S.starta 的话，下一帧立刻被打回原值 —— 表现为"拖动完全没反应"。
 *   所以这里同时写两者：SB.val 供滚动条使用，S.starta 让本帧立即生效。
 * 参数是【已经算好的位移量】（逻辑像素），由调用方在覆盖 p.x/p.y 之前求出。 */
function touchPan(dx, dy) {
  const colMax = Math.max(0, (S.enda + S.totalcols - 1) - (S.totalcols - 1));
  const rowMax = Math.max(0, (S.endb + S.totalrows - 1) - (S.totalrows - 1));

  /* 【关键：必须临时关掉"跟随播放位置自动居中"】
     handlePlayback 里有一段在任何时候都会执行（不只是播放中）：
         if (S.marker_follow === 1) {
           ... else S.starta = median(0, S.marker_pos - ceil(totalcols/2), S.enda);
         }
     marker_follow 默认就是 1，所以每帧都会把 starta 强行设成
     "标记居中"的值 —— 我们手指拖出来的 starta 在下一帧立刻被覆盖，
     表现就是"拖动完全没反应"（实测 starta 每次都回到 0）。
     这里在平移期间把 marker_follow 临时置 0，松手后恢复，
     这样拖动期间屏幕不再被播放位置拉回去。
     注意：播放中仍然禁止横向平移（见下面的判断），
     所以不会出现"边播边拖导致画面和声音错位"。 */
  if (S.marker_follow === 1) {
    S._pan_saved_follow = 1;
    S.marker_follow = 0;
  }

  /* 【为什么平移要自己累积小数，而不是直接写 S.starta】
     drawHScrollbar 每帧都会：
         if (SB.drag[0] === -1) SB.val[0] = clamp(S.starta, ...)   // 读回
         const v = drawScrollbarGML(...)                            // 内部 return round(SB.val[0])
         S.starta = clamp(v, ...)                                   // 写回【取整后】的值
     也就是说 starta 每帧都会被 round() 一次。
     手指每移动一点只有 0.4~0.5 格，取整后回到 0 —— 于是
     "每次移动都不足半格 → 被舍掉 → starta 永远是 0"，拖动完全无效。
     实测就是这个现象（touchPan 里算出 0.48，帧末又变回 0）。
     解法：把平移量累积在 TOUCH.pan_acc 里（小数），只在整数部分
     足够跨格时才写入 starta，余数留着下一次继续用。
     这样慢速拖动也能一格格走，快速拖动也不会丢位移。 */
  if (!(S.marker_follow && S.playing === 1)) {
    TOUCH.pan_acc += -dx / 32;
    const whole = Math.trunc(TOUCH.pan_acc);
    if (whole !== 0) {
      TOUCH.pan_acc -= whole;
      const na = clamp(S.starta + whole, 0, colMax);
      // 到边界时把余数丢掉，否则往回拖要先把"欠"的量走完，手感发粘
      if (na === 0 || na === colMax) TOUCH.pan_acc = 0;
      S.starta = na;
      if (typeof SB !== 'undefined' && SB.val) SB.val[0] = na;
    }
  }
  TOUCH.pan_acc_y += -dy / 32;
  {
    const wholeY = Math.trunc(TOUCH.pan_acc_y);
    if (wholeY !== 0) {
      TOUCH.pan_acc_y -= wholeY;
      const nb = clamp(S.startb + wholeY, 0, rowMax);
      if (nb === 0 || nb === rowMax) TOUCH.pan_acc_y = 0;
      S.startb = nb;
      if (typeof SB !== 'undefined' && SB.val) SB.val[1] = nb;
    }
  }
}

/* 平移结束时恢复 marker_follow */
function touchPanEnd() {
  if (S._pan_saved_follow) {
    S.marker_follow = 1;
    S._pan_saved_follow = 0;
  }
}

function touchPointerUp(e) {
  if (e.pointerId !== TOUCH.primary) return;
  const p = TOUCH.press;
  e.preventDefault();
  touchClearTimer();
  // 无论哪条路径退出，都要把平移期间临时关掉的跟随恢复回来
  touchPanEnd();
  TOUCH.primary = -1;
  TOUCH.press = null;
  TOUCH.blockMouseUntil = performance.now() + 700;

  if (!p) return;
  if (p.longFired) {
    // 右键抬手 → 若没删到音符也没移动，handleGridInput 会弹右键菜单
    G.mb[2] = false; G.mbr[2] = true;
    return;
  }
  if (p.panned) { G.mb[0] = false; return; }
  // 普通轻点：照常抬手，走原来的左键逻辑
  G.mb[0] = false; G.mbr[0] = true;
}

function touchInit() {
  if (typeof window === 'undefined') return;
  /* 三条独立证据取并集。单独任何一条都不可靠：
       · maxTouchPoints —— Chrome 系最准，但某些环境会虚报（headless Chrome 报 10）；
       · 'ontouchstart' in window —— iOS Safari 可靠；
       · any-pointer: coarse —— 混合设备上只要有粗指针就为真。
     取并集宁可「多认」，因为 capable 只用于展示/调试，
     真正决定行为的是下面按实际 pointerType 切换的 mode。 */
  const hasTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 ||
    (window.matchMedia && window.matchMedia('(any-pointer: coarse)').matches);
  TOUCH.capable = hasTouch ? 1 : 0;

  /* 初始模态：主指针粗糙【且】确有触点才算触屏。
     只用 (pointer: coarse) 会把「有触摸屏但主输入是触控板的笔记本」误判成触屏；
     只用 maxTouchPoints 又会把虚报的桌面环境误判。
     两者同时成立基本就是真手机/平板。之后完全跟随实际输入。 */
  const coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  TOUCH.mode = (coarse && navigator.maxTouchPoints > 0) ? 1 : 0;
  S.touch_mode = TOUCH.mode;

  /* 【无条件安装指针处理器】
     不按 capable 来决定装不装。理由是不对称的风险：
       · 多装在无触屏的机器上 → 处理器对 pointerType === 'mouse' 立刻 return，
         唯一副作用是几个监听器，可以忽略；
       · 漏装在有触屏的机器上 → 长按右键、拖动平移全部失效，
         而且用户根本没法自己修。
     所以这里选择"总是装"，让 capable 退化为纯信息字段。 */
  // 不用 passive，因为要 preventDefault 阻止浏览器自身的滚动/缩放/兼容鼠标事件
  window.addEventListener('pointerdown', touchPointerDown, { passive: false });
  window.addEventListener('pointermove', touchPointerMove, { passive: false });
  window.addEventListener('pointerup', touchPointerUp, { passive: false });
  window.addEventListener('pointercancel', touchPointerUp, { passive: false });
  // 触摸后浏览器仍可能补发一次 contextmenu，屏蔽掉（我们自己合成右键菜单）
  window.addEventListener('contextmenu', (e) => {
    if (TOUCH.mode) e.preventDefault();
  }, { passive: false });
}
