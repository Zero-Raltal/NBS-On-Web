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
  /* 【未聚焦时，缓存必须跟随外部传入的值】
     原来只有 `UI.textStr[id] === undefined` 时才初始化一次，
     之后外部改了 str 也不会同步 —— 缓存永远是第一次那个值。
     踩到的真实后果：MIDI 导入会给层命名（TempoChgr / Piano 1），
     但 drawLayersPanel 每帧都会 `S.layername[layer] = textEdit(...)` 回写，
     而 textEdit 返回的是【陈旧缓存里的空串】，于是导入的名字
     在下一帧就被自己抹掉了。表现为"导入后层名是空的"。
     （这是我排查「变速 MIDI 没有速度变化层名」时，
       用 Proxy 拦 layername 的元素写入抓到的调用栈：
       drawLayersPanel → textEdit，每帧写一次空串。）
     聚焦时不能同步（用户正在敲，外部变化不该覆盖光标内容），
     所以只在未聚焦时跟随。 */
  if (!focused) UI.textStr[id] = str === undefined ? '' : str;
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
  /* 对照 draw_inputbox.gml:33 —— 非 Fluent 主题的输入框是三片式 sprite：
       spr_inputbox_n_left  (帧 = theme)
       spr_inputbox_n_middle(横向拉伸)
       spr_inputbox_n_right (帧 = theme)
     "_n_" 表示普通态，"_s_" 是选中/聚焦态。
     Fluent（theme 3）走手绘圆角（draw_inputbox.gml:39 用 3 + fdark 的 hires 版）。
     之前不分主题一律画 Fluent 圆角，所以经典/复古/暗黑下的输入框都不对。 */
  const c = G.ctx;
  if (S.theme !== 3) {
    /* spr_inputbox_n_* 有 5 帧（含 Fluent 深色），s_* 只有 4 帧（只到 theme 3）。
       这里 theme 最多到 2，都在范围内，但保留 clamp 以防将来加主题时越界。 */
    const sel = (UI.textFocus === id) ? 's' : 'n';
    const maxF = G.atlas['spr_inputbox_' + sel + '_left']
      ? G.atlas['spr_inputbox_' + sel + '_left'].frames - 1 : 0;
    const fr = Math.min(S.theme, maxF);
    drawSprite('spr_inputbox_' + sel + '_left', fr, x, y);
    drawSprite('spr_inputbox_' + sel + '_middle', fr, x + 3, y, (w - 6) / 3, 1);
    drawSprite('spr_inputbox_' + sel + '_right', fr, x + w - 3, y);
    return textEdit(id, str, x + 6, y + 4, w - 12, h - 6);
  }
  setColor(C.controlBg);
  roundRect(x, y, x + w, y + h, 4, true);
  setColor(UI.textFocus === id ? C.accent : C.controlBorder);
  roundRect(x + 0.5, y + 0.5, x + w - 0.5, y + h - 0.5, 4, false);
  return textEdit(id, str, x + 6, y + 4, w - 12, h - 6);
}


/* ============================== 基础控件 ================================= */
/* 对照 draw_window.gml:5-44 —— 窗口样式是【分主题】的：
     · theme == 3（Fluent）：圆角 + spr_shadow 外阴影 + 圆角描边，颜色 4144959
     · theme != 3（经典/复古/暗黑）：直角矩形填充 + spr_interface2 的 8 帧
       拼出立体边框（帧 0..7 各再 + 8*theme）
   之前不分主题一律画 Fluent 的圆角 8 + canvas 阴影，
   所以经典/复古/暗黑下所有对话框都是 Fluent 的圆角卡片。 */
function drawWindow(x1, y1, x2, y2) {
  const c = G.ctx;
  const isFluent = (S.theme === 3);
  if (isFluent) {
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
  } else {
    /* 非 Fluent：先铺底色（直角），再用 spr_interface2 拼边框。
       8 帧的排列：0 左上角、1 左边(纵向拉伸)、2 左下角、3 底边(横向拉伸)、
                   4 右下角、5 右边(纵向拉伸)、6 右上角、7 顶边(横向拉伸)。
       帧偏移 = 8 * theme（暗黑用第 3 组）。 */
    setColor(C.dialog);
    fillRect(x1, y1, x2 - x1, y2 - y1);
    const b = 8 * S.theme;
    const W = x2 - x1, H = y2 - y1;
    drawSprite('spr_interface2', b + 0, x1, y1);
    drawSprite('spr_interface2', b + 1, x1, y1 + 2, 1, (H - 4) / 2);
    drawSprite('spr_interface2', b + 2, x1, y2 - 2);
    drawSprite('spr_interface2', b + 3, x1 + 2, y2 - 2, (W - 4) / 2, 1);
    drawSprite('spr_interface2', b + 4, x2 - 2, y2 - 2);
    drawSprite('spr_interface2', b + 5, x2 - 2, y1 + 2, 1, (H - 4) / 2);
    drawSprite('spr_interface2', b + 6, x2 - 2, y1);
    drawSprite('spr_interface2', b + 7, x1 + 2, y1, (W - 4) / 2, 1);
  }
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
  /* 对照 draw_button2.gml:16/18/39 —— 分支是 `theme != 3` 对 `theme == 3`：
       非 Fluent（0/1/2）→ spr_button 三片式位图，靠 12*theme 的帧偏移
                           区分「经典 / 复古 / 暗黑」三套浮雕
       Fluent（3）      → 手绘圆角
     之前这里写的是 `S.theme === 1`，只有复古走 90s 浮雕，
     【经典和暗黑】都掉进了 Fluent 手绘圆角分支 —— 按钮风格与主题不符。
     而且 spr_button 当时没打进图集，所以只能用代码近似复刻复古的浮雕。 */
  const isSprite = S.theme !== 3;
  if (isSprite) {
    /* 帧布局（draw_button2.gml:19-21 / 40 / 46-50）：
         左片 = m*3 + 12*theme，中片 = 1 + m*3 + 12*theme（横向拉伸 w/3），
         右片 = 2 + m*3 + 12*theme；禁用态用 9/10/11 + 6*theme。
       其中 m：0 普通 / 1 悬停 / 2 按下。 */
    const m = locked ? 0 : (pressed ? 2 : (hover ? 1 : 0));
    const base = 12 * S.theme;
    if (locked) {
      // 禁用：draw_sprite(spr_button, 9/10/11 + 6*theme)
      const lb = 6 * S.theme;
      drawSprite('spr_button', 10 + lb, x, y, w / 3, 1);
      drawSprite('spr_button', 9 + lb, x, y);
      drawSprite('spr_button', 11 + lb, x + w - 3, y);
    } else {
      drawSprite('spr_button', 1 + m * 3 + base, x, y, w / 3, 1);
      drawSprite('spr_button', m * 3 + base, x, y);
      drawSprite('spr_button', 2 + m * 3 + base, x + w - 3, y);
    }
  } else {
    setColor(locked ? (C.dark ? '#2a2a2a' : '#f0f0f0') : (pressed ? C.controlBgPress : (hover ? C.controlBgHover : C.controlBg)));
    roundRect(x, y, x + w, y + h, 4, true);
    setColor(C.controlBorderDim);
    roundRect(x + 0.5, y + 0.5, x + w - 0.5, y + h - 0.5, 4, false);
  }
  /* 文字色：对照 draw_button2.gml:22 与 111-122。
     非 Fluent 主题下按钮底色来自位图（经典浅灰 / 复古米灰 / 暗黑深灰），
     所以文字必须跟着走：暗黑用白字，其余用黑字。
     禁用态统一用 #808080（GML: draw_set_color(10526880) = RGB(160,160,160) 偏暗的灰）。 */
  setColor(locked ? '#808080' : (isSprite ? (S.theme === 2 ? '#ffffff' : '#000000') : C.text));
  setFont(FONT.main());
  const tw = textWidth(label);
  // 按下时文字右移 1px，模拟浮雕凹陷
  const off = (isSprite && pressed) ? 1 : 0;
  text(x + (w - tw) / 2 + off, y + (h - 12) / 2 + off, label);
  return hover && G.mbr[0] && !locked;
}
// GML 的 draw_button2：固定 23 高
function button2(x, y, w, label, locked) {
  const r = drawButton(x, y, w, 23, label, locked);
  if (r && S.windowsound) playUISound('invoke');
  return r;
}
function drawCheckbox(x, y, state, label, locked, isSwitch) {
  /* 第 6 个参数 isSwitch 对照 draw_checkbox.gml:13-18：
         if (theme == 3 && argument_count > 6) is_switch = argument[6];
         else is_switch = false;
         x_offset = is_switch ? 31 : 18;
     也就是说【只有 Fluent(theme 3) 才可能画成开关】，其它主题即使传了 true 也当普通复选框。

     【这是之前完全没实现的东西】
       原版 Fluent 主题下，一部分勾选项画成长条形的开关（toggle），
       而不是方框复选框。调用方通过第 6 个参数指定，全工程有 22 处传了 true，
       例如「记住我的更改」「包含锁定图层」「启用循环」「双倍速度」。
       我们这边之前没有这个参数，全部按复选框画，所以 Fluent 下
       本该是开关的地方都成了方框 —— 用户看到的「样式不对」。 */
  const sw = S.theme === 3 && !!isSwitch;
  const xOff = sw ? 31 : 18;      // 开关宽 26（xx-1 .. xx+25），文字要右移
  const w = 13 + textWidth(label) + 8;
  const hover = !locked && mouseRectangle(x, y, w, 13);
  const c = G.ctx;
  /* 对照 draw_checkbox.gml:21-58 —— 分支条件是 `theme != 3` 对 `theme == 3`：
       非 Fluent（经典 0 / 复古 1 / 暗黑 2）→ spr_checkbox 位图（自带配色与浮雕）
       Fluent（3）                          → 手绘圆角复选框
     之前这里写 `S.theme === 1`，只把「复古」当成 90s 方框，
     【暗黑主题】因此掉进 Fluent 分支 —— 这就是「不同主题风格混用」。
     后来把判断改对了，却仍用手绘方框（setColor + fillRect）去"仿"位图：
     仿不出浮雕细节，暗黑底色也只能靠猜。原版这里本来就是 sprite，
     所以现在直接画 spr_checkbox。

     spr_checkbox 是 13x13、30 帧 = 5 组 × 6 帧，组内含义：
       0/1/2 = 未勾选（普通 / 悬停 / 按下）
       3     = 勾选标记（叠在 0/1/2 之上）
       4/5   = 禁用（未勾选 / 已勾选）
     组偏移 = 6*theme + 6*(fdark && theme==3)。 */
  const isSprite = S.theme !== 3;
  if (isSprite) {
    const group = 6 * S.theme + ((S.theme === 3 && S.fdark) ? 6 : 0);
    if (locked) {
      drawSprite('spr_checkbox', 4 + (state ? 1 : 0) + group, x, y);
    } else {
      const m = hover ? (G.mb[0] ? 2 : 1) : 0;
      drawSprite('spr_checkbox', m + group, x, y);
      /* 勾选标记单独叠一层。对照 draw_checkbox.gml:54 的 alpha 算式：
           accent[5 + 2*(m==1) + 3*(m==2)] * (theme==3) - !(theme==3)
         非 Fluent 时前项乘 0、后项减 1 → 结果 -1，即「不着色，用位图原色」。 */
      if (state) drawSprite('spr_checkbox', 3 + group, x, y);
    }
    /* 文字色：对照 draw_checkbox.gml。
       注意 GML 的两个分支颜色来源【不同】：
         · lock = 1（锁定）分支：draw_set_color(204,204,204)，theme 1/2 时改白字，
           画完再 draw_theme_color() 恢复 —— 204,204,204 是【禁用态】的灰，只在这里用。
         · 正常（未锁定）分支：画文字前【不设颜色】，用的是上一处
           draw_theme_color() 留下的状态，即
               theme == 2 || (fdark && theme == 3) → 白字，否则黑字。
       之前把 204,204,204 当成了「非 Fluent 的通用文字色」写在分支外面，
       于是经典主题(theme 0) 下所有可勾选项的文字都变成浅灰 #cccccc，
       画在 #f0f0f0 的浅背景上几乎看不见 —— 看着就像"全都变成禁用的、
       无法勾选"的样子。而 theme 1/2 因为改成了白色反倒是正常的。
       现在严格分开：禁用态用 204,204,204（theme 1/2 白），
       正常态用 draw_theme_color() 的规则。 */
    setColor(locked
      ? ((S.theme === 1 || S.theme === 2) ? '#ffffff' : make_color_rgb(204, 204, 204))
      : ((S.theme === 2 || (S.theme === 3 && S.fdark)) ? '#ffffff' : '#000000'));
  } else if (sw) {
    /* Fluent 开关（toggle）—— 严格照 draw_checkbox.gml:108-140 / 55-76。
       几何：轨道 draw_roundrect_ext(xx-1, yy-1, xx+25, yy+12, 12, 12, 填充)
             圆角半径 12 = 轨道半高，画成胶囊形。
       锁定态（gml:55-76）用另一套灰度，且滑块位置固定、不响应悬停。 */
    const m = hover ? (G.mb[0] ? 2 : 1) : 0;
    const gray = (v) => make_color_rgb(v, v, v);
    if (locked) {
      /* 锁定：轨道底色按勾选/未勾选取灰，再把滑块画成小圆。
         对照 gml:58-63 的取色：
           深色：勾选 3355443(51) / 未勾选 0
           浅色：勾选 14935011(228) / 未勾选 15987699(243)
         滑块（gml:69-75）：
           勾选 深色 5000268(76) / 浅色 13421772(204)
           未勾选 深色 3684408(56) / 浅色 13092807(200) */
      setColor(S.fdark ? gray(state ? 51 : 0) : gray(state ? 228 : 243));
      roundRect(x - 1, y - 1, x + 25, y + 12, 12, true);
      // 轨道描边（gml:65-67 未勾选时描一圈）
      if (!state) {
        setColor(S.fdark ? gray(56) : gray(200));
        roundRect(x, y, x + 24, y + 11, 6, false);
      }
      setColor(S.fdark ? gray(state ? 76 : 56) : gray(state ? 204 : 200));
      if (state) roundRect(x + 15, y + 3, x + 22, y + 10, 3, true);
      else roundRect(x + 2, y + 2, x + 9, y + 9, 3, true);
      setColor(gray(204));
    } else {
      /* 正常态轨道底色（gml:111-127）：
           勾选 → accent[5 + 2*(m==1) + 3*(m==2)]
           未勾选 深色 2105376(32) / 2763306(42) / 3158064(48) 对应 m=0/1/2
                  浅色 15987699(243) / 15066597(229) / 14474460(220) */
      if (state) setColor(T.accent[5 + 2 * (m === 1) + 3 * (m === 2)]);
      else if (S.fdark) setColor(gray(m === 0 ? 32 : m === 1 ? 42 : 48));
      else setColor(gray(m === 0 ? 243 : m === 1 ? 229 : 220));
      roundRect(x - 1, y - 1, x + 25, y + 12, 12, true);
      /* 【未勾选时补一圈淡描边】
         原版 Fluent 未勾选轨道是 243,243,243，而对话框底色也是 243 附近 ——
         两者几乎同色，轨道在浅色主题下"看不见"，只剩一枚孤零零的滑块，
         看起来像"这个开关没画出来"。实测截图就是这个效果。
         这里只在【未勾选 + 浅色】时加一圈比轨道略深的边，
         让胶囊轮廓可辨；勾选时轨道是强调色，本来就很清楚，不加。 */
      if (!state && !S.fdark) {
        setColor(gray(m === 0 ? 220 : m === 1 ? 210 : 200));
        roundRect(x - 1, y - 1, x + 25, y + 12, 12, false);
      }
      // 滑块（gml:132-140）：勾选在右端且深色 2105376(32)/浅色 15987699(243)
      setColor(S.fdark ? gray(state ? 32 : 243) : gray(state ? 243 : 32));
      if (state) roundRect(x + 15 - (m === 2 ? 1 : 0), y + 2, x + 22, y + 9, 3, true);
      else roundRect(x + 2, y + 2, x + 9 + (m === 2 ? 1 : 0), y + 9, 3, true);
      // 文字色：Fluent 正常态发挥 draw_theme_color() 的规则
      setColor((S.fdark) ? '#ffffff' : '#000000');
    }
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
  // 开关宽 26，文字要从开关右侧 31 处开始，否则会压在轨道上
  text(x + xOff, y - 1, label);
  return !locked && hover && G.mbr[0];
}
function drawRadiobox(x, y, state, label, locked) {
  const w = 13 + textWidth(label) + 8;
  const hover = !locked && mouseRectangle(x, y, w, 13);
  const c = G.ctx;
  /* 同样是 `theme != 3` 对 `theme == 3`（对照 draw_radiobox.gml:17/22）：
     经典/复古/暗黑走 spr_radiobox 位图，只有 Fluent 手绘。
     之前写成 theme === 1，暗黑主题的单选框因此落进了 Fluent 分支。
     后来判断改对了，但仍用手绘圆去"仿"位图，这里改为直接用 sprite。

     spr_radiobox 是 12x12、30 帧 = 5 组 × 6 帧，组内：
       0/1/2 = 未选中（普通 / 悬停 / 按下）
       3     = 选中标记（叠在 0/1/2 之上，accent[5]*(theme==3) - !(theme==3)）
       4/5   = 禁用（未选中 / 已选中）
     组偏移 = 6*theme + 6*(theme==3 && fdark)。 */
  const isSprite = S.theme !== 3;
  if (isSprite) {
    const group = 6 * S.theme + ((S.theme === 3 && S.fdark) ? 6 : 0);
    if (locked) {
      drawSprite('spr_radiobox', 4 + (state ? 1 : 0) + group, x, y);
    } else {
      const m = hover ? (G.mb[0] ? 2 : 1) : 0;
      drawSprite('spr_radiobox', m + group, x, y);
      // 选中标记：非 Fluent 时 alpha 算式结果为 -1，即用位图原色
      if (state) drawSprite('spr_radiobox', 3 + group, x, y);
    }
    /* 与 drawCheckbox 完全相同的问题（radiobox 的 GML 与 checkbox 共用同一套
       禁用态/正常态配色规则）：204,204,204 只是【禁用态】颜色，
       正常态必须走 draw_theme_color()。否则经典主题下单选按钮的文字
       也是浅灰 #cccccc，在浅背景上看着像全部被禁用。 */
    setColor(locked
      ? ((S.theme === 1 || S.theme === 2) ? '#ffffff' : make_color_rgb(204, 204, 204))
      : ((S.theme === 2 || (S.theme === 3 && S.fdark)) ? '#ffffff' : '#000000'));
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
  /* 对照 draw_checkbox.gml:24-25/44-45 —— is_switch 的帧规则：
       非 Fluent：spr_switch，帧 = m + 8*fdark（关）/ m + 3 再叠 accent 色（开）
       Fluent   ：手绘圆角开关
     之前不分主题一律手绘，于是经典/复古/暗黑主题的开关是 Fluent 的胶囊造型，
     和旁边成对的复选框（方框）风格打架 —— 这就是主题混用。 */
  if (S.theme !== 3) {
    const hover = mouseRectangle(x, y, label ? 32 + textWidth(label) : 26, 13);
    const m = hover ? (G.mb[0] ? 1 : 1) : 0;
    const darkOff = S.fdark ? 8 : 0;
    if (!state) {
      drawSprite('spr_switch', m + darkOff, x, y);
    } else {
      // 开启态：先画基础帧 m+3，再叠一层 accent 上色
      drawSprite('spr_switch', m + 3, x, y);
      drawSprite('spr_switch', m + 3, x, y, 1, 1,
        T.accent[5 + 2 * (m === 1) + 3 * (m === 2)]);
    }
    setColor(S.theme === 2 ? '#ffffff' : '#000000');
    setFont(FONT.main());
    if (label) text(x + 32, y - 1, label);
    return hover && G.mbr[0];
  }
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

    /* 阴影 + 背景。
       对照 menu_draw.gml:26-43，菜单的「形状」是分主题的：
         · theme != 3（经典/复古/暗黑）：draw_rectangle —— 直角矩形，无阴影精灵
         · theme == 3（Fluent）        ：draw_roundrect  —— 圆角 + spr_shadowext 外阴影
       之前不分主题一律用圆角 6 + canvas 阴影，于是经典/复古/暗黑三个主题的菜单
       都长得像 Fluent 的圆角卡片，和主题整体风格不符。 */
    const isFluent = (S.theme === 3);
    const rad = isFluent ? 6 : 0;
    if (isFluent) {
      c.save();
      c.shadowColor = 'rgba(0,0,0,0.25)';
      c.shadowBlur = 14; c.shadowOffsetY = 3;
      setColor(C.menuBg);
      roundRect(dx, dy, dx + mi.w, dy + mi.h, rad, true);
      c.restore();
    } else {
      setColor(C.menuBg);
      /* fillRect 的签名是 (x, y, w, h) —— 宽高，不是右下角坐标。
         这里之前写成 fillRect(dx, dy, dx + mi.w, dy + mi.h)，
         宽被放大成 dx+mi.w、高被放大成 dy+mi.h，于是背景块比菜单本身
         大出一整圈（并向右下溢出），看着就是"背景大小严重错位"。
         三条 fillRect 全都有这个问题。 */
      fillRect(dx, dy, mi.w, mi.h);
    }
    /* 外框：对照 menu_draw.gml:50-54 —— 颜色是 draw_theme_color()（强调色）0.25 alpha，
       且同样分直角/圆角。这里用强调色低透明度还原。 */
    c.save();
    c.globalAlpha = c.globalAlpha * 0.25;
    setColor(T.accent[3]);
    roundRect(dx + 0.5, dy + 0.5, dx + mi.w - 0.5, dy + mi.h - 0.5, rad, false);
    c.restore();
    /* 非 Fluent 的这一条竖线是原版菜单的标志性细节：
       对照 menu_draw.gml:44-49 —— 图标区与文字区之间画两条 1px 竖线
       （强调色 0.25 alpha + 白色），Fluent 没有。 */
    if (!isFluent) {
      c.save();
      c.globalAlpha = c.globalAlpha * 0.25;
      setColor(T.accent[3]);
      /* 同理：fillRect(x, y, w, h)，宽高必须是 1 和 (mi.h - 3)。
         原来传的是 dx+29+1 和 dy+mi.h-3，竖线会被拉成一根粗细和长度
         都跟坐标成正比的大色块。 */
      fillRect(dx + 29, dy + 3, 1, mi.h - 3);
      c.restore();
      setColor('#ffffff');
      fillRect(dx + 30, dy + 3, 1, mi.h - 3);
    }


    setFont(FONT.main());
    let iy = 8;
    for (let i = 0; i < mi.items.length; i++) {
      const it = mi.items[i];
      if (it.label === '-') {
        /* 对照 menu_draw.gml:57-64 —— 分隔线是两条 1px 线：
           上面一条是强调色 @0.25，下面一条是白色，形成一道浅刻痕。
           之前只画了一条 C.separator，看起来像普通边框而不是分隔刻痕。 */
        c.save();
        c.globalAlpha = c.globalAlpha * 0.25;
        setColor(T.accent[3]);
        line(dx + 32, dy + iy - 2, dx + mi.w - 3, dy + iy - 2);
        c.restore();
        setColor('#ffffff');
        line(dx + 32, dy + iy - 1, dx + mi.w - 3, dy + iy - 1);
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
          // 非 Fluent：直角实心块（menu_draw.gml:93 draw_rectangle）
          setColor(C.menuSel);
          fillRect(dx + 3, dy + iy - 5, mi.w - 5, 22);
        } else {
          // Fluent：圆角块（menu_draw.gml:98 draw_roundrect）
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
        /* 图标位置对照 menu_draw.gml:118/123 —— 原版是 dx + 2, dy + iy - 6。
           之前写成 dx + 4, dy + iy - 5，看起来只是 2px 的差别，
           但菜单图标是 25x25 的整块，偏 2px 就会和左侧那条分隔竖线压在一起。 */
        drawToolIcon(it.image, dx + 2, dy + iy - 6, false);
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
    /* 【必须吞掉这一次松开，否则会穿透到菜单背后】
       用户反馈："点了下拉框的一个选项后，下拉框背后的东西也会被点到"。
       原因：这一路上层是「菜单浮层」，它靠 G.mbr[0]（本帧松开）触发；
       而菜单背后的窗口控件（按钮 / 另一个下拉框 / 列表行）同样会读
       G.mbr[0] 做点击判定。菜单是在 drawWindows() 之后才绘制的，
       等它处理完这次松开、调用 closeMenu() 时，背后的控件【这一帧已经
       先拿到过 G.mbr[0] 了】—— 于是同一次点击既选中了菜单项，
       又按下了背后的控件。典型表现：点完下拉项，背后的按钮也响应了。
       解法：菜单一旦消费掉这次松开，立刻置 UI.swallowPress，
       让本帧之后以及下一帧的松开判定都不再生效（editorFrame 末尾会
       在按键真正抬起后清除这个标记）。 */
    UI.swallowPress = true;
    closeMenu();
    if (it && !it.inactive && it.sub === 0) {
      // 第 4 个参数是"本级菜单内的项序号"：音色子菜单用它定位乐器，
      // 不再靠中文标签文本反解名字（标签会带图标/快捷键前缀，容易解析错）。
      menuAction(name, it.label, it.n, it.spos, targetIdx, menuc);
    }
  } else if (G.mbr[0] && openReady && noclick) {
    /* 点在了分隔线 / 子菜单箭头上（noclick = 1）：这次松开也不该穿透，
       菜单保持打开即可。 */
    UI.swallowPress = true;
  }
  if (G.keysPressed['Escape']) closeMenu();
}

function closeMenu() {
  UI.menu = null;
  S.menu_open = null;
}
