/* =========================================================================
   core.js — 画布/输入/数学/文本/绘制基元
   Minecraft Note Block Studio Web 版（原生 JS 重制）
   渲染坐标体系与 GML 原版一致：以「逻辑像素」为准，window_scale 做整体缩放。
   ========================================================================= */
'use strict';

const G = {
  canvas: null, ctx: null,
  W: 1280, H: 800,            // 逻辑尺寸（= 像素 / window_scale）
  dpr: 1,
  assets: {},                 // 精灵图集
  atlas: {},                  // 图集元数据
  mouse: { x: -1, y: -1, sx: -1, sy: -1 },
  mb: [false, false, false],          // 当前按下
  mbp: [false, false, false],         // 本帧按下
  mbr: [false, false, false],         // 本帧松开
  mbd: [false, false, false],         // 本帧双击
  lastClick: [0, 0, 0],
  wheel: 0, wheelX: 0,
  keys: {}, keysPressed: {}, lastKey: 0,
  ctrl: false, shift: false, alt: false,
  time: 0, dt: 0, frame: 0,
  cursor: 'default',
  sprites: {},
  tintCache: new Map(),
  textCache: new Map(),
  notify: [],
};

/* ---------------------------------------------------------------- 数学 */
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const median = (a, b, c) => Math.max(a, Math.min(b, c));
const sign = (v) => v > 0 ? 1 : (v < 0 ? -1 : 0);
const floor = Math.floor;
const round = Math.round;
const abs = Math.abs;
const ceil = Math.ceil;
function mergeColor(c1, c2, t) { return t >= 1 ? c2 : (t <= 0 ? c1 : mixHex(c1, c2, t)); }
function mod(a, b) { return ((a % b) + b) % b; }

/* ---------------------------------------------------------------- 颜色 */
function make_color_rgb(r, g, b) {
  // 故意不提供默认值：少传分量会得到 NaN → '#aN' 这种非法颜色，
  // 浏览器会静默当成黑色画出来（排查起来非常费劲，复选框黑块就是这么来的）。
  // 所以这里遇到少传就直接抛，逼调用点写全三个分量。
  if (g === undefined || b === undefined) {
    throw new Error('make_color_rgb: 需要 3 个分量，收到 (' +
      Array.prototype.join.call(arguments, ', ') + ')');
  }
  r = clamp(floor(r), 0, 255); g = clamp(floor(g), 0, 255); b = clamp(floor(b), 0, 255);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
function hexToRgb(h) {
  if (h[0] === '#') h = h.slice(1);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return make_color_rgb(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}
function rgba(hex, a) {
  const c = hexToRgb(hex);
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

/* ---------------------------------------------------------------- 字体 */
const FONT = {
  main:       (px = 12) => `${px}px "Open Sans","Segoe UI","Microsoft YaHei UI","Microsoft YaHei",sans-serif`,
  mainbold:   (px = 12) => `600 ${px}px "Open Sans","Segoe UI","Microsoft YaHei UI","Microsoft YaHei",sans-serif`,
  small:      (px = 11) => `${px}px Tahoma,"Microsoft YaHei UI","Microsoft YaHei",sans-serif`,
  smallbold:  (px = 11) => `bold ${px}px Tahoma,"Microsoft YaHei UI","Microsoft YaHei",sans-serif`,
  info_big:   (px = 24) => `bold ${px}px Arial,"Microsoft YaHei UI",sans-serif`,
  info_med:   (px = 15) => `${px}px Arial,"Microsoft YaHei UI",sans-serif`,
  info_med_bold: (px = 15) => `bold ${px}px Arial,"Microsoft YaHei UI",sans-serif`,
  med:        (px = 12) => `${px}px "Open Sans","Microsoft YaHei UI",sans-serif`,
};
let curFont = FONT.main(12);
function setFont(f) {
  if (curFont !== f) { curFont = f; G.ctx.font = f; }
}
function textWidth(str, font) {
  const key = (font || curFont) + '|' + str;
  let w = G.textCache.get(key);
  if (w === undefined) {
    const c = G.ctx;
    const old = c.font;
    c.font = font || curFont;
    w = c.measureText(str).width;
    c.font = old;
    if (G.textCache.size > 20000) G.textCache.clear();
    G.textCache.set(key, w);
  }
  return w;
}

/* ---------------------------------------------------------------- 文本绘制 */
// draw_text(x, y, str) —— GML 语义：y 为文字顶部
function text(x, y, str, align) {
  const c = G.ctx;
  str = String(str);
  if (align === 'center') c.textAlign = 'center';
  else if (align === 'right') c.textAlign = 'right';
  else c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  c.fillText(str, x, y + FONT_ASCENT(curFont));
  c.textAlign = 'left';
}
function fontPx(font) {
  const m = /(\d+(?:\.\d+)?)px/.exec(font);
  return m ? parseFloat(m[1]) : 12;
}
function FONT_ASCENT(font) { return Math.round(fontPx(font) * 0.78); }

/* ---------------------------------------------------------------- 图元 */
function fillRect(x, y, w, h) { G.ctx.fillRect(x, y, w, h); }
function setColor(c) { G.ctx.fillStyle = c; G.ctx.strokeStyle = c; }
function setAlpha(a) { G.ctx.globalAlpha = clamp(a, 0, 1); }
function getAlpha() { return G.ctx.globalAlpha; }

function roundRect(x1, y1, x2, y2, r, fill) {
  const c = G.ctx;
  const w = x2 - x1, h = y2 - y1;
  if (w <= 0 || h <= 0) return;
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x1 + r, y1);
  c.arcTo(x2, y1, x2, y2, r);
  c.arcTo(x2, y2, x1, y2, r);
  c.arcTo(x1, y2, x1, y1, r);
  c.arcTo(x1, y1, x2, y1, r);
  c.closePath();
  if (fill === false) c.stroke(); else c.fill();
}
/* 矩形裁剪：对照 GameMaker 里「窗口内容只在自己的矩形内绘制」的效果。
   pushClip 之后所有绘制都限制在矩形内，popClip 恢复。
   浏览器画布与 GameMaker 的窗口内容区不一样 —— 没有自动裁剪，
   大尺寸示意图会盖住窗口标题栏和窗口外的编辑器。 */
function pushClip(x1, y1, x2, y2) {
  const c = G.ctx;
  c.save();
  if (!c.beginPath || !c.rect || !c.clip) return;   // 测试用假画布：跳过裁剪
  c.beginPath();
  c.rect(x1, y1, x2 - x1, y2 - y1);
  c.clip();
}
function popClip() {
  const c = G.ctx;
  if (!c.restore) return;
  c.restore();
}

function line(x1, y1, x2, y2) {
  const c = G.ctx;
  c.beginPath();
  c.moveTo(x1 + 0.5, y1 + 0.5);
  c.lineTo(x2 + 0.5, y2 + 0.5);
  c.stroke();
}
function mouseRectangle(x, y, w, h) {
  const m = G.mouse;
  return m.x >= x && m.y >= y && m.x < x + w && m.y < y + h;
}

/* ---------------------------------------------------------------- 精灵 */
function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('无法载入 ' + src));
    im.src = src;
  });
}
// 取图集中的一帧（按帧号），返回 {img, sx, sy, w, h}
const _frameCache = new Map();
function frame(name, n) {
  const meta = G.atlas[name];
  if (!meta) return null;
  const img = G.assets[name];
  if (!img) return null;
  // GameMaker 的 draw_sprite(spr, subimg, …) 对越界 subimg 做【取模回绕】，
  // 与 image_index 的规则一致（永远落在 [0, image_number) 内），不是「不画」。
  // 铁证：draw_window_datapack_export.gml:93/233 用 draw_sprite(spr_datapack_exp, 2, …)，
  // 而该精灵只有 2 帧（Key 0.0 / 1.0）→ 2 mod 2 = 0，实际画的是帧 0
  // （那张 "MUSIC WITHOUT NOTE BLOCKS" 宣传图）；效果页 :182/322 请求帧 1
  // → 帧 1（六宫格可视化示意图）。两张图各归其位，语义完全对得上。
  // 我先前误以为越界帧「什么都不画」，让设置页顶部空着，结果就是「图片不见了」。
  n = n | 0;
  if (meta.frames > 0) {
    n = ((n % meta.frames) + meta.frames) % meta.frames;   // 负数也回绕到正区间
  } else {
    return null;
  }
  const key = name + ':' + n;
  let f = _frameCache.get(key);
  if (f) return f;
  f = { img, sx: n * meta.w, sy: 0, w: meta.w, h: meta.h };
  _frameCache.set(key, f);
  return f;
}
// 高清贴图模式（对照 control_create 的 hires = window_scale > 1.25）
// 浏览器里设备像素比几乎都 > 1，默认用 4 倍尺寸的 *_hires 精灵，界面才不会糊。
function hiresMode() { return S.hires !== 0; }
/* 解析实际要画的图集：有 hires 版本且开启高清时用 hires，返回 1/4 缩放系数
   对照 GML draw_piano_key / menu_draw 等处的 `if (!hires || theme != 3) … else …_hires`：
   原版只有 Fluent 主题（theme 3）才用 *_hires 精灵，
   经典(0)/复古(1)/暗黑(2) 一律用 1 倍的原版精灵。
   之前这里不看主题、只要有 hires 就用，导致非 Fluent 主题下
   钢琴等控件用了错误的图集（spr_piano_hires 的帧内容与 spr_piano 不同），
   表现为「除了 Fluent，底下的钢琴显示不出来」。 */
function spriteSrc(name) {
  const themeAllowsHires = (S.theme === 3);
  if (themeAllowsHires && hiresMode() && G.atlas[name + '_hires'] && G.assets[name + '_hires']) {
    return { name: name + '_hires', k: 0.25 };
  }
  return { name, k: 1 };
}
function drawSprite(name, n, x, y, xs, ys, colorHex, alpha) {
  const src = spriteSrc(name);
  const f = frame(src.name, n);
  if (!f) return;
  const c = G.ctx;
  const k = src.k;
  const sc = xs === undefined ? 1 : xs, sy = ys === undefined ? 1 : ys;
  const w = f.w * k * sc, h = f.h * k * sy;
  // GameMaker 的 draw_sprite / draw_sprite_ext 是以精灵原点为锚点的，不是左上角。
  // 绝大多数精灵原点是 (0,0)，所以画在左上角和画在锚点没有区别；
  // 但 spr_marker(8,0)、spr_Gclef(18,50)、spr_Fclef(8,13)、
  // spr_note_sharp/flat(30,74)、spr_logo(14,16)、spr_yesno*(16,16) 有非零原点。
  // 这里统一扣掉原点，各调用点就可以和 GML 源码传一模一样的坐标。
  const meta = G.atlas[src.name];
  const ox = meta && meta.xo ? meta.xo * k * sc : 0;
  const oy = meta && meta.yo ? meta.yo * k * sy : 0;
  const dx = x - ox, dy = y - oy;
  const oldA = c.globalAlpha;
  if (alpha !== undefined) c.globalAlpha = oldA * alpha;
  if (colorHex && colorHex !== '#ffffff' && colorHex !== -1) {
    const tinted = getTinted(src.name, n, colorHex, k);
    if (tinted) { c.drawImage(tinted, dx, dy, w, h); c.globalAlpha = oldA; return; }
  }
  c.imageSmoothingEnabled = false;
  c.drawImage(f.img, f.sx, f.sy, f.w, f.h, dx, dy, w, h);
  c.globalAlpha = oldA;
}
// 精灵在屏幕上的宽高（已考虑 hires）
function spriteSize(name, n, xs) {
  const src = spriteSrc(name);
  const f = frame(src.name, n);
  if (!f) return { w: 0, h: 0 };
  return { w: f.w * src.k * (xs === undefined ? 1 : xs), h: f.h * src.k };
}
// 单色着色精灵（用于 spr_icons_col 这类白色遮罩）
function getTinted(name, n, colorHex, k) {
  const key = name + ':' + n + ':' + colorHex;
  if (G.tintCache.has(key)) return G.tintCache.get(key);
  const f = frame(name, n);
  const cv = document.createElement('canvas');
  cv.width = f.w; cv.height = f.h;
  const cx = cv.getContext('2d');
  cx.drawImage(f.img, f.sx, f.sy, f.w, f.h, 0, 0, f.w, f.h);
  // 乘法着色（与 GameMaker 的 draw_sprite_ext(color) 一致）
  cx.globalCompositeOperation = 'multiply';
  cx.fillStyle = colorHex;
  cx.fillRect(0, 0, f.w, f.h);
  cx.globalCompositeOperation = 'destination-in';
  cx.drawImage(f.img, f.sx, f.sy, f.w, f.h, 0, 0, f.w, f.h);
  if (G.tintCache.size > 3000) G.tintCache.clear();
  G.tintCache.set(key, cv);
  return cv;
}

// 叠加发光（用于琴键按下的黄色反馈；GM 的 color 参数是乘法，深色键上几乎看不出，
//  这里额外叠一层加法混合，观感对齐原版"键被按亮"的效果）
function drawSpriteAdditive(name, n, x, y, colorHex, alpha) {
  const src = spriteSrc(name);
  const f = frame(src.name, n);
  if (!f) return;
  const key = 'add:' + src.name + ':' + n + ':' + colorHex;
  let cv = G.tintCache.get(key);
  if (!cv) {
    cv = document.createElement('canvas');
    cv.width = f.w; cv.height = f.h;
    const cx = cv.getContext('2d');
    cx.drawImage(f.img, f.sx, f.sy, f.w, f.h, 0, 0, f.w, f.h);
    cx.globalCompositeOperation = 'source-in';
    cx.fillStyle = colorHex;
    cx.fillRect(0, 0, f.w, f.h);
    G.tintCache.set(key, cv);
  }
  const c = G.ctx;
  const oldOp = c.globalCompositeOperation, oldA = c.globalAlpha;
  c.globalCompositeOperation = 'lighter';
  c.globalAlpha = oldA * clamp(alpha, 0, 1);
  c.imageSmoothingEnabled = false;
  c.drawImage(cv, x, y, f.w * src.k, f.h * src.k);
  c.globalCompositeOperation = oldOp;
  c.globalAlpha = oldA;
}

/* 画一个工具条/菜单图标。
   对照 draw_icon.gml:32-46 的两套分支：
     非 Fluent(theme != 3)：只画 spr_icons[i]，【不叠加颜色层】，按下时整体右移 2px
     Fluent(theme == 3)   ：先画 spr_icons_f（浅色）或 spr_icons_d（深色）做底，
                            再叠一层 spr_icons_col 用 accent[6 - 2*!fdark] 上色；
                            按下时缩放 0.8 并右移 2.5px
   之前所有调用点都硬写 spr_icons_f/d + spr_icons_col，等于不管什么主题
   都用 Fluent 那套「线稿 + 彩色叠加」的图标，所以经典/复古/暗黑主题的图标
   看起来和原版完全不同。这里按主题统一分派，调用点只传帧号坐标即可。 */
function drawToolIcon(i, x, y, pressed) {
  const dark = (S.theme === 3 && S.fdark);
  if (S.theme !== 3) {
    // 非 Fluent：原版 spr_icons 是自带颜色的完整图标，按下右移 2px
    const off = pressed ? 2 : 0;
    drawSprite('spr_icons', i, x + off, y + off);
    return;
  }
  // Fluent：线稿 + accent 叠加
  const set = dark ? 'spr_icons_d' : 'spr_icons_f';
  if (!pressed) {
    drawSprite(set, i, x, y);
    drawSprite('spr_icons_col', i, x, y, 1, 1, T.accent[6 - 2 * (S.fdark ? 0 : 1)]);
  } else {
    // 按下：缩到 0.8、偏移 25*0.1 / 23*0.1
    const sx = x + 25 * 0.1, sy = y + 23 * 0.1;
    drawSprite(set, i, sx, sy, 0.8, 0.8);
    drawSprite('spr_icons_col', i, sx, sy, 0.8, 0.8, T.accent[6 - 2 * (S.fdark ? 0 : 1)]);
  }
}

/* ---------------------------------------------------------------- 输入 */
function initInput() {
  const cv = G.canvas;
  const hidden = document.getElementById('hiddeninput');
  G.hiddenInput = hidden;

  const toLogical = (e) => {
    const r = cv.getBoundingClientRect();
    return [(e.clientX - r.left) / S.window_scale, (e.clientY - r.top) / S.window_scale];
  };
  window.addEventListener('mousemove', (e) => {
    const [x, y] = toLogical(e);
    G.mouse.x = x; G.mouse.y = y;
    G.ctrl = e.ctrlKey; G.shift = e.shiftKey; G.alt = e.altKey;
  });
  window.addEventListener('mousedown', (e) => {
    const [x, y] = toLogical(e);
    G.mouse.x = x; G.mouse.y = y;
    G.ctrl = e.ctrlKey; G.shift = e.shiftKey; G.alt = e.altKey;
    if (e.button < 3) { G.mb[e.button] = true; G.mbp[e.button] = true; }
    if (UI.textFocus >= 0 && !UI.allowBlurOnClick) { /* 保留焦点给输入框 */ }
    e.preventDefault();
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button < 3) { G.mb[e.button] = false; G.mbr[e.button] = true; }
  });
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('wheel', (e) => {
    // 约定 G.wheel 与 GameMaker 的 mouse_wheel_down() - mouse_wheel_up() 同号：
    //   向下滚(+1) / 向上滚(-1)。
    // 浏览器 deltaY > 0 就是向下滚，所以直接取 sign(deltaY)，不要再取反。
    // 之前写成 sign(deltaY) * -1，而 draw_scrollbar 里又按 `sb_val += (down - up)` 即
    // `SB.val += G.wheel` 的方向去用（我那里写的是 += -G.wheel），两次取反叠加，
    // 结果滚轮向下反而往上翻。
    G.wheel = sign(e.deltaY);
    G.wheelX = sign(e.deltaX);
    e.preventDefault();
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    const editing = UI.textFocus >= 0;
    if (e.key === 'F11') e.preventDefault();
    if (e.ctrlKey && !editing) e.preventDefault();
    const k = e.key;
    if (!G.keys[k]) { G.keysPressed[k] = true; }
    G.keys[k] = true;
    G.lastKey = e.keyCode || k.charCodeAt(0);
    G.ctrl = e.ctrlKey; G.shift = e.shiftKey; G.alt = e.altKey;
    if (!editing && !e.ctrlKey && (e.key === ' ' || e.key.startsWith('Arrow') || e.key === 'Tab')) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    G.keys[e.key] = false;
    G.ctrl = e.ctrlKey; G.shift = e.shiftKey; G.alt = e.altKey;
  });
  window.addEventListener('blur', () => {
    G.keys = {}; G.mb = [false, false, false];
  });
}

function endFrameInput() {
  G.mbp = [false, false, false];
  G.mbr = [false, false, false];
  G.wheel = 0;
  G.keysPressed = {};
}

/* ---------------------------------------------------------------- 主循环
 *
 * 【为什么不能只用 requestAnimationFrame】
 *   浏览器在窗口最小化、或标签页切到后台时会【完全暂停】rAF 回调，
 *   定时器（setTimeout/setInterval）则会被降频到最低 1 次/秒但仍会触发。
 *   只靠 rAF 时，最小化期间 dt 一帧都不来，播放位置停在原地：
 *   音频因为提前排期还能响一小会儿，然后就彻底没声了 —— 用户看到的就是
 *   「窗口最小化后停止播放」。
 *
 *   所以这里做两件事：
 *     1. 用 setInterval 做兜底驱动，rAF 停摆时仍然推进逻辑（降到 ~20Hz 够用，
 *        界面绘制在最小化时本来也看不见，跳过即可）；
 *     2. dt 用 performance.now() 的真实墙钟差计算，而不是依赖两次回调的间隔，
 *        这样后台降频也不会让播放变慢。
 *
 *   恢复可见/聚焦时立刻补一帧，避免 dt 累积过大。
 *
 *   【2026-11 追加：后台播放「变慢」的真正原因】
 *   上面第 2 点只解决了一半。后台时定时器会被浏览器降频到 1 次/秒，
 *   而这里把 dt 上限卡在 0.5s —— 于是「1 秒的真实时间只推进 0.5 秒的播放」，
 *   最小化后播放速度恰好只有正常的一半（听感上就是「变慢」）。
 *   把上限调大又会引发另一个问题：长时间挂起后恢复时，一次 tick 会把几十秒
 *   的播放一次性跳过（音乐会「哗」地跳一大段）。
 *
 *   所以真正的修法是不要在「回调次数」上纠结，而是给播放位置一个可靠的时间基准：
 *   Web Audio 的 ctx.currentTime 由音频硬件时钟驱动，后台不降频、不受 rAF 影响。
 *   播放位置改成由「音频时钟 + 起播锚点」推导（见 handlePlayback），
 *   dt 只用于跟手性要求不高的界面动画。
 */
function startLoop(cb) {
  let last = performance.now();
  let rafId = 0;
  let timerId = 0;
  let running = true;
  // 后台兜底频率：定时器在后台被降频，20Hz 只在页面隐藏时用，不影响前台手感
  const BG_MS = 50;

  const tick = (t) => {
    // t 可能来自 rAF（高精度时间戳），也可能来自定时器（用 performance.now 补齐）
    const now = (typeof t === 'number' && isFinite(t)) ? t : performance.now();
    let dt = (now - last) / 1000;
    last = now;
    /* 记录原始间隔（截断前），供播放排期判断「回调是否被降频」。
       后台最小化时定时器会降到 1 次/秒，排期窗口需要相应拉长。 */
    S.last_tick_gap = isFinite(dt) && dt > 0 ? dt : 0;
    // 上限 0.5s：后台长时间挂起后恢复时，不要一次性把整段都推进
    // （否则音乐会「哗」地跳过一大段）。0.5s 足以让 20Hz 的兜底正常工作。
    if (!isFinite(dt) || dt < 0) dt = 0;
    if (dt > 0.5) dt = 0.5;
    G.dt = dt;
    G.time += dt;
    G.frame++;
    S.currspeed = 1;
    cb(dt);
    endFrameInput();
  };

  const rafStep = (t) => {
    if (!running) return;
    tick(t);
    rafId = requestAnimationFrame(rafStep);
  };

  const startRaf = () => {
    if (rafId) return;
    rafId = requestAnimationFrame(rafStep);
  };
  const stopRaf = () => {
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
  };

  /* 兜底定时器：只在「rAF 被暂停」时真正起作用。
     判断方式 —— 记录上次 rAF 回调的时间，若超过 200ms 没来就认为被挂起，
     由定时器接管推进；rAF 一恢复就让位。 */
  timerId = setInterval(() => {
    if (!running) return;
    const idle = performance.now() - last;
    if (idle > 200) tick(performance.now());   // rAF 停摆 → 定时器推进
  }, BG_MS);
  /* 这个定时器是永久性的。在浏览器里无所谓，但 Node 环境下（构建脚本、
     测试 harness）一个永久 setInterval 会让进程永远不退出。
     unref 只存在于 Node，浏览器里没有，所以做特性判断。 */
  if (timerId && typeof timerId.unref === 'function') timerId.unref();

  // 页面重新可见/聚焦时立刻补一帧，并重新启动 rAF（有些浏览器恢复后不会自动续）
  const resume = () => {
    if (!running) return;
    last = performance.now() - 1;   // 只补很少一点，避免跳段
    startRaf();
  };
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) resume();
  });
  window.addEventListener('focus', resume);
  window.addEventListener('pageshow', (e) => { if (e.persisted) resume(); });

  const stop = () => {
    running = false;
    stopRaf();
    if (timerId) { clearInterval(timerId); timerId = 0; }
  };
  window.__NBS_STOP_LOOP__ = stop;

  startRaf();
}

/* ---------------------------------------------------------------- 画布 */
function resizeCanvas() {
  const cv = G.canvas;
  G.dpr = window.devicePixelRatio || 1;
  const cw = cv.clientWidth, ch = cv.clientHeight;
  cv.width = Math.round(cw * G.dpr);
  cv.height = Math.round(ch * G.dpr);
  G.W = cw / S.window_scale;
  G.H = ch / S.window_scale;
  S.rw = Math.floor(G.W);
  S.rh = Math.floor(G.H);
  G.ctx.setTransform(G.dpr * S.window_scale, 0, 0, G.dpr * S.window_scale, 0, 0);
  G.ctx.imageSmoothingEnabled = false;
}
