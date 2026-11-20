/* =========================================================================
   theme.js — 主题与配色（对齐 NBS 的 draw_accent_init / draw_theme_color）
   默认与 NBS 一致：Fluent 浅色，强调色 #0078D4
   ========================================================================= */
'use strict';

const T = {
  // 强调色原始分量（NBS 默认 accent1=0 accent2=120 accent3=212）
  a1: 0, a2: 120, a3: 212,
  accent: [],
  hiacc: 0,
};

function draw_accent_init() {
  const { a1, a2, a3 } = T;
  T.hiacc = (a1 > a2 && a1 > a3) ? a1 : (a2 > a1 && a2 > a3 ? a2 : a3);
  const hi = T.hiacc;
  T.accent = [
    make_color_rgb(a1 * 0.7, a2 * 0.7, a3 * 0.7),
    make_color_rgb(a1 * 0.8, a2 * 0.8, a3 * 0.8),
    make_color_rgb(a1 * 0.9, a2 * 0.9, a3 * 0.9),
    make_color_rgb(a1, a2, a3),
    make_color_rgb(a1 + (hi - a1) * 0.1, a2 + (hi - a2) * 0.1, a3 + (hi - a3) * 0.1),
    make_color_rgb(a1 + (hi - a1) * 0.2, a2 + (hi - a2) * 0.2, a3 + (hi - a3) * 0.2),
    make_color_rgb(a1 + (hi - a1) * 0.3, a2 + (hi - a2) * 0.2, a3 + (hi - a3) * 0.3),
    make_color_rgb(a1 + (hi - a1) * 0.5, a2 + (hi - a2) * 0.5, a3 + (hi - a3) * 0.5),
    make_color_rgb(a1 * 0.5, a2 * 0.5, a3 * 0.5),
  ];
}

/* 对照 GML change_theme()：切主题后要刷新背景色等派生状态。
   网页版没有 window_set_color，所以这里只做需要重新计算的部分并落盘设置。 */
function changeTheme() {
  // 主题 1（复古 / 90s）和主题 0（经典 / Aqua）没有「暗色模式」，
  // 对照 draw_window_preferences.gml:337 的 lock 参数 (theme != 3) —— 非 Fluent 时该勾选框是禁用的。
  if (S.theme !== 3) S.fdark = 0;
  if (typeof saveSettings === 'function') saveSettings();
  if (typeof setMsg === 'function') {
    const names = { 0: '经典', 1: '复古', 2: '暗黑', 3: 'Fluent' };
    setMsg('主题 => ' + (names[S.theme] || S.theme));
  }
}

// 主题派生色
const C = {
  get dark() { return S.theme === 2 || (S.theme === 3 && S.fdark); },
  // 窗口/面板底色
  // 对照 control_draw.gml:147-152 的 window_background：
  //   theme 0 → 15790320 = RGB(240,240,240)
  //   theme 1 → 13160660 = RGB(212,208,200)   ← 注意 GameMaker 颜色是 BGR，
  //              13160660 = 0xC8D0D4 → B=0xC8 R=0xD4 G=0xD0 → RGB(212,208,200)
  //   theme 2 → c_dark                    = RGB(25,25,25)
  //   theme 3 → 15987699 = RGB(243,243,243)；fdark → 2105376 = RGB(32,32,32)
  // 早先这里把主题 1 写成了 (200,208,212)，R/B 反了，所以复古主题偏蓝。
  get background() {
    if (S.theme === 0) return make_color_rgb(240, 240, 240);
    if (S.theme === 1) return make_color_rgb(212, 208, 200);
    if (S.theme === 2) return make_color_rgb(25, 25, 25);
    return S.fdark ? make_color_rgb(32, 32, 32) : make_color_rgb(243, 243, 243);
  },
  // 网格区底色
  get grid() {
    if (S.blackout) return '#000000';
    if (S.theme === 3) return S.fdark ? make_color_rgb(39, 39, 39) : make_color_rgb(249, 249, 249);
    if (S.theme === 1) return make_color_rgb(212, 208, 200);
    return S.theme === 2 ? make_color_rgb(25, 25, 25) : make_color_rgb(240, 240, 240);
  },
  get panel() {
    if (S.theme === 0) return make_color_rgb(240, 240, 240);
    if (S.theme === 1) return make_color_rgb(212, 208, 200);
    if (S.theme === 2) return make_color_rgb(25, 25, 25);
    return S.fdark ? make_color_rgb(32, 32, 32) : make_color_rgb(243, 243, 243);
  },
  // 窗口标题栏（对照 draw_window.gml:13：theme 1 用 13160660，其余同背景）
  get titleBar() {
    if (S.theme === 1) return make_color_rgb(212, 208, 200);
    if (S.theme === 0) return make_color_rgb(240, 240, 240);
    if (S.theme === 2) return make_color_rgb(25, 25, 25);
    return S.fdark ? make_color_rgb(32, 32, 32) : make_color_rgb(243, 243, 243);
  },
  get dialog() {
    if (S.theme === 3) return S.fdark ? make_color_rgb(32, 32, 32) : make_color_rgb(243, 243, 243);
    return this.panel;
  },
  // 窗口外框：对照原版 49 处 `make_color_rgb(137, 140, 149)`。
  // 源码里几乎所有窗口都是这个套路：
  //     if (theme != 3) draw_rectangle(..., 0)   // 先用窗口底色填
  //     draw_set_color(make_color_rgb(137, 140, 149))
  //     if (theme != 3) draw_rectangle(..., 1)   // 再用这个灰紫描边
  // 也就是说只有「非 Fluent」主题才画这圈 137,140,149 的框，
  // Fluent 主题（含 fdark）是圆角无描边的。之前不分主题统一用 63/70 深灰，
  // 所以经典/复古/暗黑三个主题的窗口边框看起来都比原版重。
  get windowBorder() {
    if (S.theme === 3) return S.fdark ? make_color_rgb(70, 70, 70) : make_color_rgb(196, 196, 196);
    return make_color_rgb(137, 140, 149);
  },
  // 文字
  get text() { return this.dark ? make_color_rgb(255, 255, 255) : make_color_rgb(0, 0, 0); },
  get textDim() { return this.dark ? make_color_rgb(160, 160, 160) : make_color_rgb(96, 96, 96); },
  get textGray() { return this.dark ? make_color_rgb(160, 160, 160) : make_color_rgb(120, 120, 120); },
  // 控件
  get controlBg() { return this.dark ? make_color_rgb(45, 45, 45) : make_color_rgb(253, 253, 253); },
  get controlBgHover() { return this.dark ? make_color_rgb(58, 58, 58) : make_color_rgb(246, 246, 246); },
  get controlBgPress() { return this.dark ? make_color_rgb(70, 70, 70) : make_color_rgb(240, 240, 240); },
  get controlBorder() { return this.dark ? make_color_rgb(60, 60, 60) : make_color_rgb(210, 210, 210); },
  get controlBorderDim() { return this.dark ? make_color_rgb(75, 75, 75) : make_color_rgb(190, 190, 190); },
  // 分隔线：对照 draw_separator.gml —— 浅色主题用 RGB(128,128,128)，深色主题用白色。
  // 注意这里的「深色」判定和 C.dark 不同：源码是 (theme==3 && fdark) || (isplayer && blackout)，
  // theme 2（暗黑）用的反而是灰色线。
  get separator() { return (S.theme === 3 && S.fdark) ? make_color_rgb(255, 255, 255) : make_color_rgb(128, 128, 128); },
  // 区域标题底色：对照 draw_areaheader.gml 的 switch(theme)
  get areaHeader() {
    if (S.theme === 0) return make_color_rgb(213, 223, 229);   // 经典：淡蓝灰
    if (S.theme === 1) return make_color_rgb(212, 208, 200);   // 复古：同窗口底
    if (S.theme === 2) return make_color_rgb(25, 25, 25);      // 暗黑：c_dark
    return S.fdark ? make_color_rgb(32, 32, 32) : make_color_rgb(243, 243, 243);
  },
  // 区域外框：对照 draw_area.gml hr 分支（10855845 / 深色 11974326）
  get areaBorder() { return S.fdark ? make_color_rgb(182, 182, 182) : make_color_rgb(165, 165, 165); },
  // 菜单底：对照 menu_draw.gml:28-31
  //     if (theme != 3) draw_set_color(window_background)   ← 非 Fluent 用窗口底色
  //     else draw_set_color(16382457)                        ← Fluent 浅色 #f9f9f9
  //     if (fdark && theme = 3) draw_set_color(2697513)      ← Fluent 深色 #292929
  // 之前这里不分主题，非深色一律给 #f9f9f9，
  // 结果「经典」用了 Fluent 的菜单底色、比窗口底色亮一档，看起来像和 Fluent 调反了。
  get menuBg() {
    if (S.theme !== 3) return this.background;          // 0/1/2 → window_background
    return S.fdark ? make_color_rgb(41, 41, 41) : make_color_rgb(249, 249, 249);
  },
  // 菜单项悬停/选中：对照 menu_draw.gml:92-97
  //     draw_set_color(16684072)                    ← 选中项填充 #2894fe（固定色，不随主题）
  //     否则 draw_set_color(15987699) / fdark 4276545  ← 悬停 #f3f3f3 / #414141
  get menuSel() { return make_color_rgb(40, 148, 254); },
  get menuHover() {
    if (S.theme !== 3) return this.background;          // 非 Fluent 菜单项自带高亮，用底色
    return S.fdark ? make_color_rgb(65, 65, 65) : make_color_rgb(243, 243, 243);
  },
  get headerBg() { return this.dark ? make_color_rgb(36, 36, 36) : make_color_rgb(238, 238, 238); },
  get headerBg() { return this.dark ? make_color_rgb(36, 36, 36) : make_color_rgb(238, 238, 238); },
  get gridLine() { return this.dark ? '#ffffff' : '#000000'; },
  get rowAlt() { return this.dark ? make_color_rgb(36, 36, 36) : make_color_rgb(246, 246, 246); },
  get accent() { return T.accent[3]; },
  get accentLight() { return T.accent[6]; },
  get accentDark() { return T.accent[2]; },
};

// 播放/录制等状态色
const COL = {
  green: '#00a000', lime: '#8ee000', red: '#e00000', orange: '#e08000',
  yellow: '#ffff00', blue: '#0000e0', white: '#ffffff', black: '#000000',
  gray: '#808080',
  // 超范围键的标红：对照 draw_piano.gml:64/77/111 的 `col = 8224255`。
  // GameMaker 颜色是 BGR：8224255 = 0x7D7DFF → B=0x7D G=0x7D R=0xFF → RGB(255,125,125)。
  outOfRange: '#ff7d7d',
  // 选中键（非 Fluent 主题）：对照 draw_piano.gml:65/78/112 的 `col = 16753828`。
  // GameMaker BGR：16753828 = 0xFFA4A4 → B=0xFF G=0xA4 R=0xA4 → RGB(164,164,255)。
  // 即【淡蓝紫】，不是桃色 —— 之前写成 '#ffb3a4' 是把 0xFFA4A4 当 RGB 直接读了，
  // 既搞错字节序又搞错数值，所以点击琴键后显示为橙色，和原版的蓝紫完全不同。
  keySelected: '#a4a4ff',
};
