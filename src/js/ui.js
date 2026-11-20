/* =========================================================================
   ui.js — 控件库 / 菜单 / 窗口 / 文本输入（Fluent 风格，对齐 NBS 的
   draw_window / draw_button2 / draw_checkbox / draw_text_edit / show_menu_ext）
   ========================================================================= */
'use strict';

const UI = {
  textFocus: -1,
  textStr: {},          // id -> string
  caret: {},            // id -> 光标位置
  allowBlurOnClick: false,
  popup: null,          // 当前悬停提示
  popupShownAt: 0,
  menu: null,           // 打开的菜单
  menus: [],            // 菜单对象栈
  msgQueue: [],
  modal: null,          // 消息框 / 确认框
  drag: { id: -1, start: 0, val: 0 },
  /* "正在拖某个控件"（滑块 / 拖动条）。非 -1 时画布输入被屏蔽 ——
     拖动这类控件时指针经常掠过画布，不能让那些移动/松开被当成画布操作。
     注意：不要复用它代替 S.window = W_DRAG，W_DRAG 不是对话框窗口，
     会让 drawWindows 停止绘制（详见 drawDragValue 的注释）。 */
  dragLock: -1,
  clickedThisFrame: false,
};

/* ============================== 文本输入 ================================= */
function focusText(id, initial) {
  if (id < 0) return;
  UI.textFocus = id;
  if (initial !== undefined) UI.textStr[id] = String(initial);
  if (UI.textStr[id] === undefined) UI.textStr[id] = '';
  UI.caret[id] = UI.textStr[id].length;
  const hi = G.hiddenInput;
  hi.value = UI.textStr[id];
  hi.focus();
  try { hi.setSelectionRange(UI.caret[id], UI.caret[id]); } catch (e) { }
}
function blurText() {
  UI.textFocus = -1;
  G.hiddenInput.blur();
}
function initTextInput() {
  const hi = G.hiddenInput;
  hi.addEventListener('input', () => {
    if (UI.textFocus < 0) return;
    UI.textStr[UI.textFocus] = hi.value;
    UI.caret[UI.textFocus] = hi.selectionStart || 0;
  });
  hi.addEventListener('keyup', () => {
    if (UI.textFocus < 0) return;
    UI.caret[UI.textFocus] = hi.selectionStart || 0;
  });
  hi.addEventListener('keydown', (e) => {
    if (UI.textFocus < 0) return;
    if (e.key === 'Enter') {
      const cb = UI.textEnter;
      blurText();
      if (cb) cb();
      e.preventDefault();
    } else if (e.key === 'Escape') {
      blurText();
      e.preventDefault();
    }
  });
}
// GML: draw_text_edit(id, str, x, y, w, h, [limit]) -> 返回（可能被编辑后的）字符串
function textEdit(id, str, x, y, w, h) {
  const focused = UI.textFocus === id;
  if (!focused && UI.textStr[id] === undefined) UI.textStr[id] = str === undefined ? '' : str;
  const val = UI.textStr[id] === undefined ? '' : UI.textStr[id];
  const c = G.ctx;
  c.font = FONT.small();
  c.fillStyle = focused ? C.accent : 'transparent';
  if (focused) fillRect(x - 1, y + h - 1, w + 2, 2);
  const txt = val;
  const maxW = w - 2;
  let disp = txt, tw = c.measureText(disp).width;
  if (tw > maxW) {
    // 从尾部截断显示
    let i = disp.length;
    while (i > 0 && c.measureText(disp.slice(disp.length - i)).width > maxW) i--;
    disp = disp.slice(disp.length - i);
  }
  setColor(C.text);
  text(x, y + Math.max(0, (h - 12) / 2) - 1, disp);
  if (focused) {
    const caretPos = clamp(UI.caret[id] || 0, 0, txt.length);
    const before = txt.slice(Math.max(0, txt.length - disp.length), caretPos);
    const cw = c.measureText(before).width;
    setColor(C.text);
    if ((G.time * 2) % 1 < 0.55) fillRect(x + cw, y + 2, 1, h - 5);
  }
  // 点击聚焦
  if (mouseRectangle(x - 2, y - 3, w + 4, h + 5) && G.mbp[0]) {
    UI.clickConsumed = true;
    if (S.window === UI.inputWindow) focusText(id, val);
  }
  return val;
}
function inputBox(id, str, x, y, w, h) {
  const c = G.ctx;
  setColor(C.controlBg);
  roundRect(x, y, x + w, y + h, 4, true);
  setColor(UI.textFocus === id ? C.accent : C.controlBorder);
  roundRect(x + 0.5, y + 0.5, x + w - 0.5, y + h - 0.5, 4, false);
  return textEdit(id, str, x + 6, y + 4, w - 12, h - 6);
}

/* ============================== 基础控件 ================================= */
function drawWindow(x1, y1, x2, y2) {
  const c = G.ctx;
  // 阴影
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.28)';
  c.shadowBlur = 16;
  c.shadowOffsetY = 4;
  setColor(C.dialog);
  roundRect(x1, y1, x2, y2, 8, true);
  c.restore();
  setColor(C.windowBorder);
  roundRect(x1 + 0.5, y1 + 0.5, x2 - 0.5, y2 - 0.5, 8, false);
  setColor(C.text);
}
function drawWindowTitle(x1, y1, str) {
  setFont(FONT.mainbold(13));
  setColor(C.text);
  text(x1 + 12, y1 + 9, str);
  setFont(FONT.main());
}

/* 「复古 / 90s」主题（theme 1）的控件外观。
   取自 spr_button 的第 12-17 帧（GameMaker 里 theme=1 用 `12 * theme` 偏移）：
     f12（普通）：上/左 边缘 #FFFFFF(255,255,255)，下/右 边缘 #404040(64,64,64)，
                   填充 #D4D0C8(212,208,200)
     f14（禁用）：填充中间的 #808080 与边缘 #404040，即整体压暗
   这就是经典 Win9x 的 3D 浮雕按钮：亮边在左上、暗边在右下。 */
const THEME90 = {
  face: '#d4d0c8',
  faceHover: '#e3e0da',
  facePress: '#c8c4bc',
  faceLock: '#d4d0c8',
  hi: '#ffffff',
  hiMid: '#e8e5e0',
  lo: '#404040',
  loMid: '#808080',
  textLock: '#808080',
};
// drawAreaHeader 里用到的两个边缘色，和上面 THEME90 保持一致
const THEME90_LO = THEME90.lo;
const THEME90_HI = THEME90.hi;

function drawButton(x, y, w, h, label, locked) {
  const hover = !locked && mouseRectangle(x, y, w, h) && !UI.menu;
  const pressed = hover && G.mb[0];
  const c = G.ctx;
  const is90 = S.theme === 1;
  if (is90) {
    // 底部填充分面。
    setColor(locked ? THEME90.faceLock : (pressed ? THEME90.facePress : (hover ? THEME90.faceHover : THEME90.face)));
    fillRect(x, y, w, h);
    // 左上亮边（2px 白 + 1px 浅灰，和源图 f12 一致）
    setColor(THEME90.hi);
    fillRect(x, y, w, 1); fillRect(x, y, 1, h);
    setColor(THEME90.hiMid);
    fillRect(x + 1, y + 1, w - 2, 1); fillRect(x + 1, y + 1, 1, h - 2);
    // 右下暗边
    setColor(THEME90.lo);
    fillRect(x, y + h - 1, w, 1); fillRect(x + w - 1, y, 1, h);
    setColor(THEME90.loMid);
    fillRect(x + 1, y + h - 2, w - 2, 1); fillRect(x + w - 2, y + 1, 1, h - 2);
  } else {
    setColor(locked ? (C.dark ? '#2a2a2a' : '#f0f0f0') : (pressed ? C.controlBgPress : (hover ? C.controlBgHover : C.controlBg)));
    roundRect(x, y, x + w, y + h, 4, true);
    setColor(C.controlBorderDim);
    roundRect(x + 0.5, y + 0.5, x + w - 0.5, y + h - 0.5, 4, false);
  }
  // 文字：90s 主题禁用态用 #808080（对照 draw_button2.gml:22 的 draw_set_color(10526880)）
  setColor(locked ? (is90 ? THEME90.textLock : C.textDim) : C.text);
  setFont(FONT.main());
  const tw = textWidth(label);
  // 按下时文字右移 1px，模拟浮雕凹陷
  const off = (is90 && pressed) ? 1 : 0;
  text(x + (w - tw) / 2 + off, y + (h - 12) / 2 + off, label);
  return hover && G.mbr[0] && !locked;
}
// GML 的 draw_button2：固定 23 高
function button2(x, y, w, label, locked) {
  const r = drawButton(x, y, w, 23, label, locked);
  if (r && S.windowsound) playUISound('invoke');
  return r;
}
function drawCheckbox(x, y, state, label, locked) {
  const w = 13 + textWidth(label) + 8;
  const hover = !locked && mouseRectangle(x, y, w, 13);
  const c = G.ctx;
  const is90 = S.theme === 1;
  if (is90) {
    // 对照 draw_checkbox.gml:31：theme 2/1 走「方框」分支（spr_checkbox 的方格样式），
    // 而不是 Fluent 的圆角复选框。白底 + 右下暗边 + 左上亮边，勾选后画黑勾。
    setColor(locked ? '#c8c4bc' : '#ffffff');
    fillRect(x, y, 12, 12);
    setColor(THEME90.lo);
    fillRect(x, y + 11, 12, 1); fillRect(x + 11, y, 1, 12);
    setColor(THEME90.hi);
    fillRect(x, y, 12, 1); fillRect(x, y, 1, 12);
    if (state) {
      c.strokeStyle = locked ? '#808080' : '#000000';
      c.lineWidth = 1.6;
      c.beginPath();
      c.moveTo(x + 2.5, y + 6); c.lineTo(x + 5, y + 9); c.lineTo(x + 10, y + 3.2);
      c.stroke();
    }
    setColor(locked ? THEME90.textLock : '#000000');
  } else {
    // Fluent 普通复选框，严格照 draw_checkbox.gml:142-182 的顺序：
    //   ① 填充：勾选 → accent[5 + 2*(m==1) + 3*(m==2)]
    //           未勾选 → 浅色 15987699/15066597/14474460（=243/229/220，对应 m=0/1/2）
    //                    深色 2105376/2763306/3158064（=32/42/48）
    //   ② 填充形状 draw_roundrect_ext(xx-1, yy-1, xx+12, yy+12, 4, 4, 0)
    //   ③ 描边色：浅色 8947848(136,136,136)、深色 10066329(153,153,153)
    //            按下(m==2)时改 浅色 11711154(178)、深色 5000268(76)
    //   ④ 未勾选才描边 draw_roundrect_ext(xx-1, yy-1, xx+12, yy+12, 2, 2, 1)
    //   ⑤ 勾选时画勾：深色 2105376(32)、浅色 15987699(243)
    // 关键：步骤④只对【未勾选】生效 —— 勾选后是实心强调色块，不需要描边。
    // 之前完全漏掉了描边，而未勾选的填充 243,243,243 又和窗口底色一色，
    // 于是 Fluent 下未勾选的复选框整个看不见了。
    const m = hover ? (G.mb[0] ? 2 : 1) : 0;
    const gray = (v) => make_color_rgb(v, v, v);
    // ① 填充
    if (state) setColor(T.accent[5 + 2 * (m === 1) + 3 * (m === 2)]);
    else setColor(S.fdark ? gray(m === 0 ? 32 : m === 1 ? 42 : 48)
      : gray(m === 0 ? 243 : m === 1 ? 229 : 220));
    roundRect(x - 1, y - 1, x + 12, y + 12, 4, true);
    // ③ 描边色（先算好，④ 才用）
    let borderC = S.fdark ? gray(153) : gray(136);
    if (m === 2) borderC = S.fdark ? gray(76) : gray(178);
    // ④ 只有未勾选才描边
    if (!state) {
      setColor(borderC);
      roundRect(x - 1, y - 1, x + 12, y + 12, 2, false);
    }
    // ⑤ 勾
    if (state) {
      setColor(gray(S.fdark ? 32 : 243));
      G.ctx.lineWidth = 1;
      G.ctx.beginPath();
      G.ctx.moveTo(x + 2, y + 5); G.ctx.lineTo(x + 4, y + 8); G.ctx.lineTo(x + 9, y + 3);
      G.ctx.stroke();
    }
    setColor(locked ? C.textDim : C.text);
  }
  setFont(FONT.main());
  text(x + 18, y - 1, label);
  return !locked && hover && G.mbr[0];
}
function drawRadiobox(x, y, state, label, locked) {
  const w = 13 + textWidth(label) + 8;
  const hover = !locked && mouseRectangle(x, y, w, 13);
  const c = G.ctx;
  const is90 = S.theme === 1;
  if (is90) {
    // 对照 draw_radiobox.gml:17：theme 2/1 用 spr_radiobox 的方形/点阵样式。
    // 90s 主题下是「圆圈 + 内点」，边框同样是亮左上 / 暗右下。
    setColor('#ffffff');
    c.beginPath(); c.arc(x + 6, y + 6, 6, 0, Math.PI * 2); c.fill();
    c.strokeStyle = THEME90.lo; c.lineWidth = 1;
    c.beginPath(); c.arc(x + 6.5, y + 6.5, 5.5, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = THEME90.hi;
    c.beginPath(); c.arc(x + 5.5, y + 5.5, 5.5, 0, Math.PI * 2); c.stroke();
    if (state) {
      setColor('#000000');
      c.beginPath(); c.arc(x + 6, y + 6, 2.5, 0, Math.PI * 2); c.fill();
    }
    setColor(locked ? THEME90.textLock : '#000000');
  } else {
    setColor(C.controlBg);
    c.beginPath(); c.arc(x + 6, y + 6, 6, 0, Math.PI * 2); c.fill();
    setColor(state ? C.accent : C.controlBorder);
    c.lineWidth = 1;
    c.beginPath(); c.arc(x + 6, y + 6, 5.5, 0, Math.PI * 2); c.stroke();
    if (state) {
      setColor(C.accent);
      c.beginPath(); c.arc(x + 6, y + 6, 3, 0, Math.PI * 2); c.fill();
    }
    setColor(locked ? C.textDim : C.text);
  }
  setFont(FONT.main());
  text(x + 18, y - 1, label);
  return !locked && hover && G.mbr[0];
}
function drawSwitch(x, y, state, label) {
  const c = G.ctx;
  setColor(state ? C.accent : (C.dark ? '#2a2a2a' : '#e9e9e9'));
  roundRect(x, y, x + 26, y + 13, 6.5, true);
  setColor(C.dark ? '#888888' : '#555555');
  roundRect(x + 0.5, y + 0.5, x + 25.5, y + 12.5, 6.5, false);
  setColor(C.dark ? '#202020' : '#ffffff');
  if (state) roundRect(x + 15, y + 2.5, x + 23.5, y + 10.5, 4, true);
  else roundRect(x + 2.5, y + 2.5, x + 11, y + 10.5, 4, true);
  setColor(C.text);
  setFont(FONT.main());
  if (label) text(x + 32, y - 1, label);
  return mouseRectangle(x, y, label ? 32 + textWidth(label) : 26, 13) && G.mbr[0];
}
/* 对照 draw_separator.gml：
     深色 = (theme == 3 && fdark) || (isplayer && blackout)
     深色 → 画一条白线；浅色 → 画一条 RGB(128,128,128) 灰线
   注意原版画的是两条线（先灰、深色时再覆盖一条白），最终只会看到一条。 */
function drawSeparator(x, y) {
  const dark = (S.theme === 3 && S.fdark);
  if (!dark) {
    setColor(make_color_rgb(128, 128, 128));
    line(x - 1, y, x - 1, y + 18);
  } else {
    setColor('#ffffff');
    line(x - 1, y, x - 1, y + 18);
  }
}
function drawSeparatorH(x1, x2, y) {
  setColor(C.separator);
  line(x1, y, x2, y);
}
/* 对照 draw_areaheader.gml 逐行还原：
     switch (theme) {
       case 0: set_color(213,223,229); draw_roundrect(x,y,x+w,y+h, 1); set_color(c_white); break
       case 1: draw_frame(...); set_color(13160660); break
       case 2: draw_frame(...); set_color(c_dark);    break
       case 3: set_color(15987699)（fdark 时 2105376），不画任何框
     }
     if (theme != 3) draw_rectangle(x+12, y-6, x+12+string_width(str)+6, y+6, 0)
     draw_theme_color(); draw_text_dynamic(x+16, y-6, str)

   ⚠ 三个之前搞错的点：
   1) `draw_roundrect(x1,y1,x2,y2,outline)` 的最后那个参数是【outline 标志】（1=只描边，0=填充），
      不是圆角半径！源码 case 0 传的是 1，所以经典主题的框是
      「淡蓝灰(213,223,229)的 1px 描边 + 内部保持窗口底色」，整个 box 并不填色；
      之前我当成实心填充，所以经典主题看起来是一大块淡蓝灰，和原版完全不像。
   2) `case 0` 之后紧跟 `draw_set_color(c_white)`，所以标题那块小色块是【白色】；
      主题 1 是窗口底色(13160660)、主题 2 是 c_dark。三者各不相同，不能统一。
   3) 主题 3(Fluent) 既没有外框也没有标题色块，只有文字。

   spr_interface4 / spr_frame1（原版画边框用的精灵）没有抽进图集，
   这里用 1px 直线画出等价效果：亮边在左上、暗边在右下。 */
function drawAreaHeader(x, y, w, h, str) {
  setFont(FONT.small());
  const tw = textWidth(str);
  if (S.theme === 0) {
    // 经典：淡蓝灰【描边】，内部不填色
    setColor(make_color_rgb(213, 223, 229));
    roundRect(x + 0.5, y + 0.5, x + w - 0.5, y + h - 0.5, 1, false);
  } else if (S.theme === 1) {
    // 复古：Win9x 凹凸边框，内部保持窗口底色
    setColor(THEME90_HI);
    fillRect(x, y, w, 1); fillRect(x, y, 1, h);
    setColor(THEME90_LO);
    fillRect(x, y + h - 1, w, 1); fillRect(x + w - 1, y, 1, h);
  } else if (S.theme === 2) {
    setColor(make_color_rgb(85, 85, 85));
    fillRect(x, y, w, 1); fillRect(x, y, 1, h);
    fillRect(x, y + h - 1, w, 1); fillRect(x + w - 1, y, 1, h);
  }
  // theme 3（Fluent）：按源码什么都不画
  if (S.theme !== 3) {
    // 标题底色块，压在框上边缘把边框咬出缺口。
    // case 0 是白色、case 1 是窗口底色、case 2 是 c_dark —— 严格对应源码。
    if (S.theme === 0) setColor('#ffffff');
    else if (S.theme === 1) setColor(make_color_rgb(212, 208, 200));
    else setColor(make_color_rgb(25, 25, 25));
    fillRect(x + 12, y - 6, tw + 6, 12);
  }
  // draw_theme_color()：theme 2 或 (theme 3 && fdark) 用白字，否则黑字
  setColor((S.theme === 2 || (S.theme === 3 && S.fdark)) ? '#ffffff' : '#000000');
  text(x + 16, y - 6, str);
  setFont(FONT.main());
}
/* ====================== 拖动类控件的公共"锁定"机制 ======================== */
/* 滑块（drawDragValue）、拖动条（drawDragBar）这类控件都是
   「按下 → 拖动 → 松开」的三段式交互，有两个共同的坑：

   1. 拖动中不能要求指针仍在控件矩形内。
      手指/鼠标很容易滑出去，正确做法是按下时锁定，
      之后只看"相对按下点的位移"，指针移到哪都继续生效。

   2. 拖动期间必须屏蔽画布输入。
      否则指针从控件挪到画布上松手时，画布的松开逻辑会凭空落一个音符。

   对第 2 点，滚动条用的是 S.window = W_DRAG。但那个办法在这里【不适用】：
   W_DRAG 不是对话框窗口（isDialogWindow 对它返回 false），
   一旦设置，drawWindows 会在开头直接 return，
   滑块函数本身就再也不会被调用 —— 拖动当场死掉。
   滚动条能用是因为它画在编辑器常驻区域，每帧都会执行。

   所以这里用一个独立的标志 UI.dragLock 表达"正在拖控件"，
   由 handleGridInput 检查，效果等价但不会停掉对话框绘制。
   两个控件共用同一套 acquire / release，避免各自演化出不一样的语义。 */
function dragAcquire(id) {
  UI.dragLock = id;
}
function dragRelease(id) {
  // 只释放自己持有的锁，避免一个控件的松开解开另一个控件的锁
  if (UI.dragLock === id) UI.dragLock = -1;
}
function dragLocked() {
  return UI.dragLock !== -1 && UI.dragLock !== undefined && UI.dragLock !== null;
}

// 数值拖拽控件（对应 draw_dragvalue）
/* 「按住上下拖动改数值」的输入框（速度、音量、拍号…）。
 *
 * 之前有三个毛病，合起来就是用户说的"反人类"：
 *
 *   1) 拖动中要求指针仍在控件矩形内 —— 鼠标稍微移出框数值就停了。
 *   2) 拖动期间不锁画布输入 —— 指针挪到画布上松手会凭空落一个音符。
 *   3) S.dragging 这个标志只写不读（死代码），一并去掉。
 *
 * 另外还有一个更隐蔽的：对话框做了 translate/scale 之后没有把鼠标坐标
 * 映射回设计空间，导致横屏全尺寸（k=1、tx/ty 居中偏移）下滑块根本点不中。
 * 那一处在 dialogs.js 的 dialogFrame() 里，已一并修掉。
 *
 * 现在统一成：按下 → 记录起点/基准值并 dragAcquire；
 * 拖动 → 用绝对位移算值，与指针在不在框上无关；松开 → dragRelease。
 */
function drawDragValue(id, x, y, value, step) {
  const w = 60, h = 16;
  setColor(C.controlBg);
  roundRect(x, y, x + w, y + h, 4, true);
  setColor(C.controlBorder);
  roundRect(x + 0.5, y + 0.5, x + w - 0.5, y + h - 0.5, 4, false);
  setColor(C.text);
  setFont(FONT.main());
  text(x + w / 2, y + 2, String(value), 'center');

  const over = mouseRectangle(x, y, w, h);
  if (over && G.mbp[0] && UI.drag.id !== id) {
    UI.drag = { id, start: G.mouse.y, val: value, x, y, w, h };
    dragAcquire(id);
  }
  /* 悬停在本框上（或正在拖它）时用上下双箭头 —— 与原版一致：
     这类框的交互是「按住上下拖动改数值」，ns-resize 才表达得出方向。 */
  if (over || UI.drag.id === id) G.cursor = 'ns-resize';

  if (UI.drag.id === id) {
    if (G.mb[0]) {
      /* 用【相对按下点的绝对位移】算值：指针移到哪都有效，
         不再要求它留在框内。向上拖 = 增大（与 ns-resize 的语义一致）。 */
      const d = (UI.drag.start - G.mouse.y) * step;
      value = UI.drag.val + Math.round(d * 4) / 4;
    } else {
      UI.drag.id = -1;
      dragRelease(id);
    }
  }
  return value;
}

// 拖动条（对应 draw_dragbar），返回 0..max 的值
/* 与 drawDragValue 同一套锁定机制（见上面的 dragAcquire 说明）。
   之前每帧都要求 mouseRectangle 命中，指针一离开就"甩掉"了拖动。 */
function drawDragBar(val, max, x, y, w, isArea, label) {
  const c = G.ctx;
  const h = 4;
  setColor(C.dark ? '#3a3a3a' : '#e2e2e2');
  roundRect(x, y + 8, x + w, y + 8 + h, 2, true);
  const p = max > 0 ? clamp(val / max, 0, 1) : 0;
  // 已播放部分
  setColor(C.accent);
  roundRect(x, y + 8, x + w * p, y + 8 + h, 2, true);
  // 手柄
  const hx = x + w * p;
  setColor(C.accent);
  c.beginPath(); c.arc(hx, y + 10, 6, 0, Math.PI * 2); c.fill();
  setColor(C.dark ? '#202020' : '#ffffff');
  c.beginPath(); c.arc(hx, y + 10, 3, 0, Math.PI * 2); c.fill();
  if (label) {
    setFont(FONT.small());
    setColor(C.textDim);
    text(x + w / 2, y - 8, label, 'center');
    setFont(FONT.main());
  }

  const over = mouseRectangle(x - 8, y, w + 16, 22);
  const barId = 'bar:' + (label || '__bar');
  if (over && G.mbp[0] && UI.dragLock !== barId) {
    UI.dragbarId = barId;
    dragAcquire(barId);
  }
  if (UI.dragbarId === barId) {
    if (G.mb[0]) {
      // 锁定后只看指针的横向位置，离开轨道也继续跟随
      return clamp((G.mouse.x - x) / w, 0, 1) * max;
    }
    UI.dragbarId = null;
    dragRelease(barId);
    return val;
  }
  if (over && (G.mb[0] || G.mbp[0])) {
    return clamp((G.mouse.x - x) / w, 0, 1) * max;
  }
  return val;
}

/* ============================== 滚动条 =================================== */
/* 对照 draw_scrollbar.gml 逐行移植：
   draw_scrollbar(id, x, y, slotwh, slots, maxslots, cantscroll, win)
   - sb_val 记录位置（以「格」为单位），拖拽是增量式，指针离开滑轨也继续
   - 按下时 window = w_drag，松开时还原，因此拖完不会把这次点击漏到画布上
   - 轨道空白处按住 = 翻页（带连按延时），两端 16px 是箭头按钮 */
const SB = { val: [0, 0, 0, 0, 0, 0], sel: [-1, -1, -1, -1, -1, -1], drag: [-1, -1, -1, -1, -1, -1],
  mprev: [0, 0, 0, 0, 0, 0], press: [0, 0, 0, 0, 0, 0], hold: -2 };

function drawScrollbarGML(id, xx, yy, slotwh, s, ms, cantscroll, win) {
  const theme = S.theme, fdark = S.fdark ? 1 : 0;
  const mwh = slotwh * s;
  const bwh = Math.max(10, (s / ms) * (s * slotwh));
  let bpos = (SB.val[id] / ms) * (s * slotwh);
  const locked = (ms <= s || (S.marker_follow && id === 0 && S.playing === 1));
  if (locked) cantscroll = 1;
  const canInput = (S.window === 0 || win === 1);

  // 按下时即使滑块被锁定（不可拖动）也要吃掉这次点击，否则松手会落到画布上放置音符
  if (SB.hold === id && !G.mb[0]) { if (win === 0) S.window = 0; SB.hold = -2; }
  const trackRect = id === 0
    ? mouseRectangle(xx, yy, 32 + mwh, 16)
    : mouseRectangle(xx, yy, 16, 32 + mwh);
  if (canInput && trackRect && G.mbp[0] && SB.drag[id] === -1) {
    SB.hold = id;
    if (win === 0) S.window = W_DRAG;
  }

  if (id === 0) {
    /* ---------------- 横向 ---------------- */
    if (SB.sel[id] === id && SB.drag[id] === -1 && canInput && !cantscroll && G.wheel) {
      SB.val[id] += G.wheel;
      SB.val[id] = median(0, SB.val[id], ms - s);
      bpos = (SB.val[id] / ms) * (s * slotwh);
    }
    if (!G.mb[0]) SB.press[id] = 0;

    if (SB.drag[id] === id) {
      if (!G.mb[0]) {
        if (win === 0) S.window = 0;
        SB.drag[id] = -1;
        SB.val[id] = round(SB.val[id]);
      } else {
        SB.val[id] += (G.mouse.x - SB.mprev[id]) / (mwh / ms);
        SB.val[id] = median(0, SB.val[id], ms - s);
        SB.mprev[id] = G.mouse.x;
        bpos = (SB.val[id] / ms) * (s * slotwh);
      }
    }
    SB.val[id] = median(0, SB.val[id], ms - s);
    bpos = floor(bpos);

    // 背景
    drawSprite('spr_scrollbar_h_background', theme + (fdark && theme === 3 ? 1 : 0), xx, yy, mwh + 32, 1);

    // 滑块
    if (!locked) {
      let ind = 0;
      const overBar = mouseRectangle(xx + 16 + bpos, yy, bwh, 16);
      if (overBar && SB.drag[id] === -1 && canInput) {
        ind = 1;
        G.cursor = 'ew-resize';
        if (G.mbp[0]) {
          SB.sel[id] = id; SB.drag[id] = id;
          if (win === 0) S.window = W_DRAG;
          SB.mprev[id] = G.mouse.x;
        }
      }
      if (SB.drag[id] === id) ind = 2;
      drawSprite('spr_scrollbar_h_bar_fill', (theme * 3) + ind + (fdark && theme === 3 ? 3 : 0),
        xx + 20 + bpos, yy, floor(bwh) - 4 - 4 * (theme === 3 ? 1 : 0), 1);
      if (theme !== 3) drawSprite('spr_scrollbar_h_bar_left', (theme * 3) + ind, xx + 17 + bpos, yy);
      else drawSprite('spr_scrollbar_h_bar_left', (theme * 3) + ind + fdark * 3, xx + 16 + bpos, yy);
      drawSprite('spr_scrollbar_h_bar_right', (theme * 3) + ind + (fdark && theme === 3 ? 3 : 0),
        xx + 17 + bpos + ceil(bwh - 2) - 4, yy);
      if (bwh > 20) drawSprite('spr_scrollbar_h_bar_handle', (theme * 3) + ind, xx + 17 + floor(bpos + bwh / 2 - 8), yy);
    }
    // 轨道空白：翻页
    if (mouseRectangle(xx + 16, yy, bpos, 16) && !locked && canInput && SB.drag[id] === -1 && G.mb[0]) {
      SB.press[id] -= 1; SB.sel[id] = id;
      if (SB.press[id] === -1) { SB.press[id] = 20; SB.val[id] = median(0, SB.val[id] - s, ms - s); }
      else if (SB.press[id] === 0) { SB.press[id] = 3; SB.val[id] = median(0, SB.val[id] - s, ms - s); }
    }
    if (mouseRectangle(xx + 16 + bpos + bwh, yy, mwh - (bpos + bwh), 16) && !locked && canInput && SB.drag[id] === -1 && G.mb[0]) {
      SB.press[id] -= 1; SB.sel[id] = id;
      if (SB.press[id] === -1) { SB.press[id] = 20; SB.val[id] = median(0, SB.val[id] + s, ms - s); }
      else if (SB.press[id] === 0) { SB.press[id] = 3; SB.val[id] = median(0, SB.val[id] + s, ms - s); }
    }
    // 按钮
    let ind = 0;
    if ((mouseRectangle(xx, yy, 32 + mwh, 16) && !locked && canInput && SB.drag[id] === -1) || SB.drag[id] === id) {
      ind += 1;
      if (mouseRectangle(xx, yy, 16, 16) && SB.drag[id] === -1) {
        ind += 1;
        G.cursor = 'pointer';
        if (G.mb[0]) {
          ind += 1; SB.press[id] -= 1; SB.sel[id] = id;
          if (SB.press[id] === -1) { SB.press[id] = 20; SB.val[id] = median(0, SB.val[id] - 1, ms - s); }
          else if (SB.press[id] === 0) { SB.press[id] = 3; SB.val[id] = median(0, SB.val[id] - 1, ms - s); }
        }
      }
    }
    drawSprite('spr_scrollbar_h_button_left', (theme * 4) + ind + (fdark && theme === 3 ? 4 : 0), xx, yy);
    ind = 0;
    if ((mouseRectangle(xx, yy, 32 + mwh, 16) && !locked && canInput && SB.drag[id] === -1) || SB.drag[id] === id) {
      ind += 1;
      if (mouseRectangle(xx + mwh + 16, yy, 16, 16) && SB.drag[id] === -1) {
        ind += 1;
        G.cursor = 'pointer';
        if (G.mb[0]) {
          ind += 1; SB.press[id] -= 1; SB.sel[id] = id;
          if (SB.press[id] === -1) { SB.press[id] = 20; SB.val[id] = median(0, SB.val[id] + 1, ms - s); }
          else if (SB.press[id] === 0) { SB.press[id] = 3; SB.val[id] = median(0, SB.val[id] + 1, ms - s); }
        }
      }
    }
    drawSprite('spr_scrollbar_h_button_right', (theme * 4) + ind + (fdark && theme === 3 ? 4 : 0), xx + mwh + 16, yy);
  } else {
    /* ---------------- 纵向 ---------------- */
    if (SB.sel[id] === id && SB.drag[id] === -1 && canInput && !cantscroll && G.wheel) {
      SB.val[id] += G.wheel;
      SB.val[id] = median(0, SB.val[id], ms - s);
      bpos = (SB.val[id] / ms) * (s * slotwh);
    }
    if (!G.mb[0]) SB.press[id] = 0;

    if (SB.drag[id] === id) {
      if (!G.mb[0]) {
        if (win === 0) S.window = 0;
        SB.drag[id] = -1;
        SB.val[id] = round(SB.val[id]);
      } else {
        SB.val[id] += (G.mouse.y - SB.mprev[id]) / (mwh / ms);
        SB.val[id] = median(0, SB.val[id], ms - s);
        SB.mprev[id] = G.mouse.y;
        bpos = (SB.val[id] / ms) * (s * slotwh);
      }
    }
    SB.val[id] = median(0, SB.val[id], ms - s);
    bpos = floor(bpos);

    drawSprite('spr_scrollbar_v_background', theme + (fdark && theme === 3 ? 1 : 0), xx, yy, 1, mwh + 32);

    if (!locked) {
      let ind = 0;
      const overBar = mouseRectangle(xx, yy + 16 + bpos, 16, bwh);
      if (overBar && SB.drag[id] === -1 && canInput) {
        ind = 1;
        G.cursor = 'ns-resize';
        if (G.mbp[0]) {
          SB.sel[id] = id; SB.drag[id] = id;
          if (win === 0) S.window = W_DRAG;
          SB.mprev[id] = G.mouse.y;
        }
      }
      if (SB.drag[id] === id) ind = 2;
      drawSprite('spr_scrollbar_v_bar_fill', (theme * 3) + ind + (fdark && theme === 3 ? 3 : 0),
        xx, yy + 20 + bpos, 1, floor(bwh) - 6);
      if (theme !== 3) drawSprite('spr_scrollbar_v_bar_up', (theme * 3) + ind, xx, yy + 17 + bpos);
      else drawSprite('spr_scrollbar_v_bar_up', (theme * 3) + ind + fdark * 3, xx, yy + 16 + bpos);
      drawSprite('spr_scrollbar_v_bar_down', (theme * 3) + ind + (fdark && theme === 3 ? 3 : 0),
        xx, yy + 17 + bpos + ceil(bwh - 6));
      if (bwh > 20) drawSprite('spr_scrollbar_v_bar_handle', (theme * 3) + ind, xx, yy + 17 + bpos + floor(bwh / 2) - 8);
    }
    if (mouseRectangle(xx, yy + 16, 16, bpos) && !locked && canInput && SB.drag[id] === -1 && G.mb[0]) {
      SB.press[id] -= 1; SB.sel[id] = id;
      if (SB.press[id] === -1) { SB.press[id] = 10; SB.val[id] = median(0, SB.val[id] - s, ms - s); }
      else if (SB.press[id] === 0) { SB.press[id] = 2; SB.val[id] = median(0, SB.val[id] - s, ms - s); }
    }
    if (mouseRectangle(xx, yy + 16 + bpos + bwh, 16, mwh - (bpos + bwh)) && !locked && canInput && SB.drag[id] === -1 && G.mb[0]) {
      SB.press[id] -= 1; SB.sel[id] = id;
      if (SB.press[id] === -1) { SB.press[id] = 10; SB.val[id] = median(0, SB.val[id] + s, ms - s); }
      else if (SB.press[id] === 0) { SB.press[id] = 2; SB.val[id] = median(0, SB.val[id] + s, ms - s); }
    }
    let ind = 0;
    if ((mouseRectangle(xx, yy, 16, 32 + mwh) && !locked && canInput && SB.drag[id] === -1) || SB.drag[id] === id) {
      ind += 1;
      if (mouseRectangle(xx, yy, 16, 16) && SB.drag[id] === -1) {
        ind += 1;
        G.cursor = 'pointer';
        if (G.mb[0]) {
          ind += 1; SB.press[id] -= 1; SB.sel[id] = id;
          if (SB.press[id] === -1) { SB.press[id] = 10; SB.val[id] = median(0, SB.val[id] - 1, ms - s); }
          else if (SB.press[id] === 0) { SB.press[id] = 2; SB.val[id] = median(0, SB.val[id] - 1, ms - s); }
        }
      }
    }
    drawSprite('spr_scrollbar_v_button_up', (theme * 4) + ind + (fdark && theme === 3 ? 4 : 0), xx, yy);
    ind = 0;
    if ((mouseRectangle(xx, yy, 16, 32 + mwh) && !locked && canInput && SB.drag[id] === -1) || SB.drag[id] === id) {
      ind += 1;
      if (mouseRectangle(xx, yy + mwh + 16, 16, 16) && SB.drag[id] === -1) {
        ind += 1;
        G.cursor = 'pointer';
        if (G.mb[0]) {
          ind += 1; SB.press[id] -= 1; SB.sel[id] = id;
          if (SB.press[id] === -1) { SB.press[id] = 10; SB.val[id] = median(0, SB.val[id] + 1, ms - s); }
          else if (SB.press[id] === 0) { SB.press[id] = 2; SB.val[id] = median(0, SB.val[id] + 1, ms - s); }
        }
      }
    }
    drawSprite('spr_scrollbar_v_button_down', (theme * 4) + ind + (fdark && theme === 3 ? 4 : 0), xx, yy + mwh + 16);
  }
  return round(SB.val[id]);
}

// 通用滚动条：返回滚动位置（像素偏移由调用方换算）
function drawScrollbar(x, y, len, vertical, pos, maxPos, pageSize) {
  const th = 16;
  const c = G.ctx;
  const trackX = vertical ? x : x, trackY = vertical ? y : y;
  const total = vertical ? len : len;
  // 轨道
  setColor(C.dark ? '#2c2c2c' : '#e8e8e8');
  if (vertical) fillRect(trackX, trackY, th, total);
  else fillRect(trackX, trackY, total, th);
  if (maxPos <= 0) return 0;
  const ratio = Math.min(1, pageSize / (maxPos + pageSize));
  const thumbLen = Math.max(24, total * ratio);
  const travel = total - thumbLen;
  const p = maxPos > 0 ? clamp(pos / maxPos, 0, 1) : 0;
  setColor(C.dark ? '#5a5a5a' : '#c0c0c0');
  if (vertical) roundRect(trackX + 5, trackY + p * travel, trackX + 11, trackY + p * travel + thumbLen, 3, true);
  else roundRect(trackX + p * travel, trackY + 5, trackX + p * travel + thumbLen, trackY + 11, 3, true);

  const inside = mouseRectangle(trackX, trackY, vertical ? th : total, vertical ? total : th);
  if (inside && G.mbp[0]) {
    // 点击跳转 / 拖动
    const localP = vertical ? (G.mouse.y - trackY - thumbLen / 2) / travel : (G.mouse.x - trackX - thumbLen / 2) / travel;
    UI.drag = { id: 'sb' + (vertical ? 'v' : 'h'), start: localP, val: maxPos, vertical, trackX, trackY, total, thumbLen, travel };
    return clamp(localP, 0, 1) * maxPos;
  }
  if (UI.drag.id === 'sb' + (vertical ? 'v' : 'h') && G.mb[0]) {
    const d = UI.drag;
    const localP = d.vertical ? (G.mouse.y - d.trackY - d.thumbLen / 2) / d.travel : (G.mouse.x - d.trackX - d.thumbLen / 2) / d.travel;
    return clamp(localP, 0, 1) * d.val;
  }
  if (UI.drag.id === 'sb' + (vertical ? 'v' : 'h') && !G.mb[0]) UI.drag.id = -1;
  return pos;
}

/* ============================== 提示气泡 ================================= */
function popupSet(x, y, w, h, str) {
  if (!str) return;
  // 菜单/消息框/被屏蔽时不要冒提示（对照 GML：popup_set 受 window 限制）
  if (UI.menu || UI.modal || UI.blocked) { UI.popup = null; return; }
  if (mouseRectangle(x, y, w, h)) {
    UI.popup = { x, y, w, h, str };
  }
}
function drawPopup() {
  if (!UI.popup) return;
  const c = G.ctx;
  const lines = UI.popup.str.split('\n');
  setFont(FONT.small());
  let tw = 0;
  for (const l of lines) tw = Math.max(tw, textWidth(l));
  const w = tw + 16, h = lines.length * 15 + 10;
  let x = UI.popup.x, y = UI.popup.y + UI.popup.h + 2;
  if (x + w > S.rw - 4) x = S.rw - 4 - w;
  if (y + h > S.rh - 4) y = UI.popup.y - h - 2;
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.25)';
  c.shadowBlur = 10;
  setColor(C.dark ? '#2b2b2b' : '#ffffff');
  roundRect(x, y, x + w, y + h, 4, true);
  c.restore();
  setColor(C.controlBorder);
  roundRect(x + 0.5, y + 0.5, x + w - 0.5, y + h - 0.5, 4, false);
  setColor(C.text);
  for (let i = 0; i < lines.length; i++) text(x + 8, y + 5 + i * 15, lines[i]);
  setFont(FONT.main());
  UI.popup = null;
}

/* ============================== 消息框 =================================== */
function messageDialog(str, title) { UI.msgQueue.push({ type: 'msg', text: str, title: title || '提示' }); }
function confirmDialogOn(cb, text, title) { UI.msgQueue.push({ type: 'confirm', text, title: title || '确认', cb }); }

function drawMessageBox() {
  if (UI.modal) return drawModalBox(UI.modal);
  if (UI.msgQueue.length) UI.modal = UI.msgQueue.shift();
}
function drawModalBox(m) {
  const c = G.ctx;
  setAlpha(0.35); setColor('#000000'); fillRect(0, 0, S.rw, S.rh); setAlpha(1);
  setFont(FONT.main());
  const lines = m.text.split('\n');
  let tw = 0;
  for (const l of lines) tw = Math.max(tw, textWidth(l));
  const w = Math.max(260, Math.min(S.rw - 40, tw + 48));
  const h = Math.max(120, lines.length * 18 + 78);
  const x1 = floor(S.rw / 2 - w / 2), y1 = floor(S.rh / 2 - h / 2);
  drawWindow(x1, y1, x1 + w, y1 + h);
  setFont(FONT.mainbold(13));
  setColor(C.text);
  text(x1 + 14, y1 + 12, m.title);
  setFont(FONT.main());
  setColor(C.text);
  for (let i = 0; i < lines.length; i++) text(x1 + 14, y1 + 40 + i * 18, lines[i]);
  const ok = button2(x1 + w - 76, y1 + h - 34, 62, '确定');
  if (m.type === 'confirm') {
    const no = button2(x1 + w - 148, y1 + h - 34, 62, '取消');
    if (ok) { UI.modal = null; UI.swallowPress = true; if (m.cb) m.cb(true); }
    if (no) { UI.modal = null; UI.swallowPress = true; if (m.cb) m.cb(false); }
  } else {
    if (ok || (G.keysPressed['Enter'] && !UI.textFocus) || G.keysPressed['Escape']) { UI.modal = null; UI.swallowPress = true; }
  }
}

/* ============================== 菜单 ===================================== */
// 解析 GML 菜单字符串
function parseMenuString(str) {
  const menus = [{ items: [], parent: -1, w: 0, h: 0 }];
  let cur = 0, n = 0;
  // spos：菜单项在本级菜单内的序号（不含分隔符）。对照 show_menu_ext 的 item_n，
  // 但 item_n 是跨级连续计数，这里额外记本级序号——子菜单里的"第几项"用它才不会
  // 因为上级菜单项数变化而错位（原版 menu_click 里 sel-18 的硬编码就是这么来的）。
  const poscount = [0];
  str = str.replace(/\|\|/g, '|');
  const parts = (str + '|').split('|');
  for (let raw of parts) {
    if (raw === '') continue;
    if (raw === '\\') {
      const count = menus[cur].items.length;
      if (count) menus[cur].items[count - 1].sub = menus.length;
      menus.push({ items: [], parent: cur, w: 0, h: 0 });
      poscount.push(0);
      cur = menus.length - 1;
    } else if (raw === '/') {
      cur = menus[cur].parent >= 0 ? menus[cur].parent : cur;
    } else {
      let inactive = false, shortcut = '', image = -1;
      const p = raw.indexOf('^!');
      if (p >= 0) { inactive = true; raw = raw.replace('^!', ''); }
      const pt = raw.indexOf('~');
      if (pt > 0) { image = parseInt(raw.slice(0, pt)); raw = raw.slice(pt + 1); }
      const pd = raw.indexOf('$');
      if (pd >= 0) { shortcut = raw.slice(0, pd); raw = raw.slice(pd + 1); }
      const isSep = raw === '-';
      menus[cur].items.push({ label: raw, inactive, shortcut, image, sub: 0, n: isSep ? -1 : n, spos: isSep ? -1 : poscount[cur] });
      if (!isSep) { n++; poscount[cur]++; }
    }
  }
  // 计算尺寸
  setFont(FONT.main());
  for (const m of menus) {
    let w = 0, h = 6;
    for (const it of m.items) {
      if (it.label === '-') { h += 6; continue; }
      const tw = textWidth(it.label) + (it.shortcut ? textWidth(it.shortcut) + 30 : 0);
      w = Math.max(w, tw);
      h += 22;
    }
    m.w = w + 56;
    m.h = h;
  }
  return menus;
}

function showMenu(name, x, y, str) {
  if (UI.menu) { UI.menu = null; }
  const menus = parseMenuString(str);
  UI.menu = { name, sx: x, sy: y, menus, show: menus.map((_, i) => i === 0), sel: -1, age: 0, ani: 0 };
  S.menu_open = name;
  UI.menuJustOpened = true;
  if (S.windowsound) playUISound('show');
  return UI.menu;
}

function menuItemAt(mi, mx, my, dx, dy) {
  let iy = 8;
  for (let i = 0; i < mi.items.length; i++) {
    const it = mi.items[i];
    if (it.label === '-') { iy += 6; continue; }
    if (mx >= dx + 3 && mx < dx + mi.w - 2 && my >= dy + iy - 5 && my < dy + iy - 5 + 22) return i;
    iy += 22;
  }
  return -1;
}

function drawMenu() {
  const M = UI.menu;
  if (!M) return;
  const c = G.ctx;
  // 对照 menu_draw.gml:3-4：
  //     if (ani < 1) ani += 0.1 * (30 / room_speed) * (1 / currspeed)
  //     else ani = 1
  // 目标帧率 60fps 时每帧 +0.1，也就是要 10 帧才「展开完成」，
  // 这期间 ani != 1，第 184 行的 `mouse_check_button_released(mb_left) && ani = 1`
  // 不会成立 —— 这就是原版「打开菜单的那一下松手不算点击」的机制。
  // 之前用 M.age > 0.09 当门槛（约 5-6 帧，且按 dt 累加，帧率不稳时快慢不一），
  // 于是从下拉框按下→松开太快时，同一次松开被当成「点了菜单项」，
  // 菜单刚出现就关掉，表现为「下拉框点不开」。
  if (M.ani === undefined) M.ani = 0;
  if (M.ani < 1) M.ani = Math.min(1, M.ani + 0.1);
  M.age = (M.age || 0) + (G.dt || 0.016);
  const openReady = (M.ani >= 1) && (M.age > 0.09);
  const pos = M.menus.map(() => ({ x: 0, y: 0 }));
  pos[0].x = M.sx; pos[0].y = M.sy;
  let selMenu = -1, selItem = -1, noclick = 0;

  for (let m = 0; m < M.menus.length; m++) {
    if (!M.show[m]) continue;
    const mi = M.menus[m];
    // 位置每帧从父菜单重算（对照 menu_draw: menux/menuy 在父项命中处赋值，
    //  已展开的子菜单即使没命中也要重新算，否则会掉到左上角）
    let dx = pos[m].x, dy = pos[m].y;
    if (dx + mi.w > S.rw) dx = Math.max(0, S.rw - mi.w);
    if (dy + mi.h > S.rh) dy = Math.max(0, S.rh - mi.h);
    pos[m].x = dx; pos[m].y = dy;

    // 阴影 + 背景
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.25)';
    c.shadowBlur = 14; c.shadowOffsetY = 3;
    setColor(C.menuBg);
    roundRect(dx, dy, dx + mi.w, dy + mi.h, 6, true);
    c.restore();
    setColor(C.controlBorder);
    roundRect(dx + 0.5, dy + 0.5, dx + mi.w - 0.5, dy + mi.h - 0.5, 6, false);

    setFont(FONT.main());
    let iy = 8;
    for (let i = 0; i < mi.items.length; i++) {
      const it = mi.items[i];
      if (it.label === '-') {
        setColor(C.separator);
        line(dx + 32, dy + iy - 2, dx + mi.w - 3, dy + iy - 2);
        iy += 6;
        continue;
      }
      let issel = G.mouse.x >= dx + 3 && G.mouse.x < dx + mi.w - 2 &&
        G.mouse.y >= dy + iy - 5 && G.mouse.y < dy + iy - 5 + 22;
      if (issel) {
        for (let om = m + 1; om < M.menus.length; om++) M.show[om] = false;
        if (it.sub > 0 || it.inactive) noclick = 1;
        selMenu = m; selItem = i;
      }
      if (it.inactive) issel = false;
      if (it.sub > 0) {
        if (M.show[it.sub]) issel = true;      // 子菜单已展开 → 视为选中，逐帧重算位置
        if (issel) {
          M.show[it.sub] = true;
          pos[it.sub].x = dx + mi.w - 3;
          pos[it.sub].y = dy + iy - 8;
        }
      }
      if (issel) {
        // 对照 menu_draw.gml:90-100 —— 选中项的填充是【分主题】的：
        //   theme != 3（经典/复古/暗黑）：16684072 = RGB(40,148,254) 蓝色实心块 + 白字
        //   theme == 3（Fluent）：15987699 = #f3f3f3（深色 fdark 时 4276545 = #414141）
        //                        圆角块，文字仍用 C.text
        // 之前一律用 C.menuHover，导致经典主题下没有那块标志性的蓝底白字，
        // 看起来就是「经典和 Fluent 的菜单配色搞反了」。
        if (S.theme !== 3) {
          setColor(C.menuSel);
          fillRect(dx + 3, dy + iy - 5, mi.w - 5, 22);
        } else {
          setColor(C.menuHover);
          roundRect(dx + 3, dy + iy - 5, dx + mi.w - 2, dy + iy - 5 + 22, 4, true);
        }
        G.cursor = 'pointer';
      }
      setAlpha(it.inactive ? 0.5 : 1);
      // 选中项在非 Fluent 主题下是蓝底，文字必须转白（对照 menu_draw.gml:94 的 draw_set_color(c_white)）；
      // Fluent 主题仍是普通文字色。
      setColor((issel && S.theme !== 3) ? '#ffffff' : C.text);
      text(dx + 36, dy + iy, it.label);
      if (it.shortcut) {
        setFont(FONT.small());
        setColor((issel && S.theme !== 3) ? '#ffffff' : C.textDim);
        text(dx + mi.w - 20, dy + iy + 1, it.shortcut, 'right');
        setFont(FONT.main());
      }
      if (it.image > -1) {
        // 对照 menu_draw.gml:117-130：非 Fluent 用 spr_icons，Fluent 用 spr_icons_f/d + spr_icons_col
        drawToolIcon(it.image, dx + 4, dy + iy - 5, false);
      }
      if (it.sub > 0) {
        // 对照 menu_draw：子菜单箭头就是 spr_icons 的 SUB_MENU 帧
        drawToolIcon(ICON.SUB_MENU, dx + mi.w - 24, dy + iy - 6, false);
      }
      setAlpha(1);
      iy += 22;
    }
  }

  // 松开鼠标才处理点击（对照 menu_draw:184：`mouse_check_button_released(mb_left) && ani = 1 && !noclick`）
  if (G.mbr[0] && openReady && !noclick) {
    const it = selItem >= 0 ? M.menus[selMenu].items[selItem] : null;
    const name = M.name;
    // 【顺序很重要】必须先把 menub（行号/目标索引）和菜单名取出来，
    // 因为 closeMenu() 会把 UI.menu 整个置空。
    // 对照 GML：obj_menu 是独立常驻对象，menub 存在它身上，
    // menu_click 是在菜单关闭之后才被调用的，读 obj_menu.menub 依然有效。
    // 之前我把 insIdx 挂在 UI.menu 上，closeMenu() 一清就没了，
    // menuAction 里读到 undefined 直接 return —— 表现为「点了基准音没反应」。
    const menub = (M.menub !== undefined) ? M.menub : -1;
    const targetIdx = (M.insIdx !== undefined) ? M.insIdx : menub;
    /* menuc：打开菜单时的列号快照（对照 GML obj_menu.menuc）。
       「选择左侧/右侧所有」用它做分界，而不是实时 S.selbx ——
       用户点菜单项时指针一定已经离开了原来那一格。 */
    const menuc = (M.menuc !== undefined) ? M.menuc : -1;
    closeMenu();
    if (it && !it.inactive && it.sub === 0) {
      // 第 4 个参数是"本级菜单内的项序号"：音色子菜单用它定位乐器，
      // 不再靠中文标签文本反解名字（标签会带图标/快捷键前缀，容易解析错）。
      menuAction(name, it.label, it.n, it.spos, targetIdx, menuc);
    }
  }
  if (G.keysPressed['Escape']) closeMenu();
}

function closeMenu() {
  UI.menu = null;
  S.menu_open = null;
}
