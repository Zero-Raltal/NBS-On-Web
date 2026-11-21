/* =========================================================================
   song.js — 歌曲数据模型与基本编辑操作
   对应 GML：control_create 的状态初始化、add_block / remove_block_manual /
   change_block_manual / reset
   ========================================================================= */
'use strict';

const S = {
  // 窗口
  rw: 1280, rh: 800, window_scale: 1, prev_scale: 1,
  fullscreen: 0, blackout: 0, theme: 3, fdark: 0,
  // 界面状态
  window: 0, prevwindow: 0, menu_open: null,
  show_layers: 1, show_piano: 1, show_keynames: 1, show_keynumbers: 0,
  show_keyboard: 1, show_notechart: 0, show_outofrange: 1, show_octaves: 0,
  show_numbers: 1, use_colors: 1, use_icons: 0, use_shapes: 0, show_incompatible: 1,
  /* fade：音符盒不透明（首选项「外观」页）。对照 control_create.gml:131 `fade = 0`。
     默认 0 = 按力度渐变；设 1 = 全部不透明。 */
  fade: 0,
  /* show_welcome：启动时显示问候窗口。
     对照 control_create.gml:586 `if (show_welcome) window = w_greeting`
     以及 draw_window_preferences.gml:162 的「Show greeting window」开关。
     【行为定案：首次显示一次，关掉后永不再自动弹】
     它是一个全屏遮罩，会挡住后面的所有操作 —— 每帧弹、每次启动都弹是不可接受的。
     所以：启动时若为 1 则打开；用户用「关闭」按钮 / Esc / 右上角关掉时，
     drawGreeting 末尾会把 show_welcome 置 0 并落盘（saveSettings），
     之后永不再自动出现，只有到「首选项 → 外观」手动勾回来才会再弹。
     新用户因此能看到欢迎页和三个入口，老用户被打扰一次后就不再被打扰。 */
  show_welcome: 1,
  show_soundcount: 0,
  hires: 1, clickinarea: 0, cursmarker: 0, timeline_pressa: -1,
  // MIDI 导入选项（对应 w_midi_* 系列变量）
  midiRemoveSilent: 1, midiNameLayers: 1, midiNamePatch: 1, midiTempo: 1, midiOctave: 0,
  /* midiTempoChanger：「速度变化」——把 MIDI 里的变速事件也导入（对照 w_midi_tempo_changer）。
     默认 0：原版 draw_window_midi_import.gml 里 w_midi_tempo_changer 没有在窗口默认值
     段落里被显式设为 1（只有 w_midi_tempo = 1），且提示语明说游戏内不支持，
     所以默认关闭，由用户主动勾选。 */
  midiTempoChanger: 0,
  midiVel: 1, midiPrecision: 1, midiMaxHeight: 20, midiRemember: 1, midiTab: 0,
  midiSb: [0, 0, 0], midiChannels: [], midiPerc: [], midiData: null, midiName: '',
  editmode: 0, mousewheel: 0, changepitch: 1,
  // 视图
  starta: 0, startb: 0, enda: 0, endb: 0, endb2: 0, arraylength: 0, arrayheight: 0,
  totalblocks: 0, block_outside: 0, block_custom: 0, block_pitched: 0,
  // 播放
  playing: 0, record: 0, tempo: 10, tempodrag: 10, bpm: 0, use_bpm: 0,
  metronome: 0, metronome_played: -1, mastervol: 1,
  marker_pos: 0, marker_prevpos: 0, marker_follow: 1, marker_pagebypage: 1,
  marker_start: 1, marker_end: 0, marker_return: 1, forward: 0,
  section_exists: 0, section_start: 0, section_end: 0,
  loop: 0, loop_session: 0, loopstart: 0, loopmax: 0, timestoloop: 0, loopend: 0,
  timesignature: 4, currspeed: 1, sounds: 0,
  // 乐器选择
  selected_key: 39, selected_vel: 100, selected_pan: 100, selected_pit: 0,
  startkey: 0, sharpkeys: 0, keysshow: 0, keysmax: 30, key_edit: -1,
  select_lastpressed: 1, keyboardRoot: 0,
  // 图层
  realvolume: 1, realstereo: 0, solostr: '',
  layername: [], layerlock: [], layervol: [], layerstereo: [],
  lockedlayer: [],
  // 文件
  filename: '', changed: 0, song_midi: '', midiname: '', midifile: '',
  song_name: '', song_author: '', song_orauthor: '', song_desc: '',
  work_mins: 0, work_left: 0, work_right: 0, work_add: 0, work_remove: 0,
  save_version: 5, nbs_loaded_version: 0,
  // 选择
  selected: 0, select: 0, dontplace: 0, clickinarea: 0,
  selbx: -1, selby: -1, sela: -1, selb: -1,
  drag: 0, drag_pressx: -1, drag_pressy: -1,
  select_pressx: -1, select_pressy: -1, select_pressa: -1, select_pressb: -1,
  timeline_pressa: -1,
  // 其它
  prefTab: 0, autosave: 0, autosavemins: 10, show_oldwarning: 1, channelstoggle: 0,
  tutorial_tempobox: 0, delay: 0, insbox_start: 0, showinsbox: 0,
  editline: 0, msgtext: '', msgtime: 0, dropmode: 0,
  windowsound: 0, remove_effect: 1, aa: 0,
  // 绘制时计算
  x1: 0, y1: 52, totalcols: 0, totalrows: 0, rhval: 270, note_offset: 0,
  // 网格数据
  grid: null,
  // 每帧交互结果
  hover: { exist: 0 },
};

/* ---------------------------------------------------------------- 网格存储 */
const GRID_CAP_STEP = 128;

function makeGrid(cap) {
  const len = 1024 * cap;
  return {
    cap,
    exists: new Uint8Array(len),
    ins: new Uint16Array(len),
    key: new Uint8Array(len),
    vel: new Uint8Array(len),
    pan: new Uint8Array(len),
    pit: new Int16Array(len),
    played: new Float64Array(len),
    added: new Float64Array(len),
  };
}
function gridEnsureCapacity(width, height) {
  let g = S.grid;
  const needCap = Math.max(128, Math.ceil((height + 1) / GRID_CAP_STEP) * GRID_CAP_STEP);
  let newCap = g.cap;
  while (newCap < needCap) newCap += GRID_CAP_STEP;
  const needW = Math.max(256, Math.ceil((width + 1) / 256) * 256);
  if (newCap === g.cap && needW <= (g.exists.length / g.cap)) return;
  // 扩容：逐列复制
  const oldCap = g.cap;
  const oldCols = g.exists.length / oldCap;
  const cols = Math.max(needW, oldCols);
  const ng = {
    cap: newCap,
    exists: new Uint8Array(cols * newCap),
    ins: new Uint16Array(cols * newCap),
    key: new Uint8Array(cols * newCap),
    vel: new Uint8Array(cols * newCap),
    pan: new Uint8Array(cols * newCap),
    pit: new Int16Array(cols * newCap),
    played: new Float64Array(cols * newCap),
    added: new Float64Array(cols * newCap),
  };
  const copyCols = Math.min(oldCols, cols);
  const copyRows = Math.min(oldCap, newCap);
  for (let x = 0; x < copyCols; x++) {
    const so = x * oldCap, dof = x * newCap;
    ng.exists.set(g.exists.subarray(so, so + copyRows), dof);
    ng.ins.set(g.ins.subarray(so, so + copyRows), dof);
    ng.key.set(g.key.subarray(so, so + copyRows), dof);
    ng.vel.set(g.vel.subarray(so, so + copyRows), dof);
    ng.pan.set(g.pan.subarray(so, so + copyRows), dof);
    ng.pit.set(g.pit.subarray(so, so + copyRows), dof);
    ng.played.set(g.played.subarray(so, so + copyRows), dof);
    ng.added.set(g.added.subarray(so, so + copyRows), dof);
  }
  S.grid = ng;
}
/* GML 的二维数组下标会自动向下取整（array[1.7, 2.9] 就是 array[1, 2]）。
   JS 的 TypedArray 对小数下标是「静默丢弃」：写不进去、读出来是 undefined，还不抛错。
   而 S.starta / S.startb 在「播放跟随 + 逐页滚动」时就是小数（参见 drawEditor 里
   note_offset 的注释），右键菜单、粘贴、框选都会把它们当坐标传进来。
   所以这里统一 floor 一次，等价于 GML 的隐式取整，避免调用方漏掉。 */
function gidx(x, y) { return floor(x) * S.grid.cap + floor(y); }
function gExists(x, y) { return S.grid.exists[gidx(x, y)]; }
function gIns(x, y) { return S.grid.ins[gidx(x, y)]; }
function gKey(x, y) { return S.grid.key[gidx(x, y)]; }
function gVel(x, y) { return S.grid.vel[gidx(x, y)]; }
function gPan(x, y) { return S.grid.pan[gidx(x, y)]; }
function gPit(x, y) { return S.grid.pit[gidx(x, y)]; }
function gSetExists(x, y, v) { S.grid.exists[gidx(x, y)] = v; }

/* 行/列统计（GML 的 colfirst/collast/colamount/rowamount） */
let colfirst = [], collast = [], colamount = [], rowamount = [];
function resetColArrays() {
  colfirst = new Int32Array(4096).fill(-1);
  collast = new Int32Array(4096).fill(-1);
  colamount = new Int32Array(4096);
  rowamount = new Int32Array(1024);
}
function growColArrays(n) {
  if (n < colfirst.length) return;
  let cap = colfirst.length;
  while (cap <= n) cap *= 2;
  const nf = new Int32Array(cap).fill(-1), nl = new Int32Array(cap).fill(-1), na = new Int32Array(cap);
  nf.set(colfirst); nl.set(collast); na.set(colamount);
  colfirst = nf; collast = nl; colamount = na;
}
function growRowArrays(n) {
  if (n < rowamount.length) return;
  let cap = rowamount.length;
  while (cap <= n) cap *= 2;
  const na = new Int32Array(cap);
  na.set(rowamount);
  rowamount = na;
  S.layername.length = cap;
  S.layerlock.length = cap;
  S.layervol.length = cap;
  S.layerstereo.length = cap;
  S.lockedlayer.length = cap;
  for (let i = 0; i < cap; i++) {
    if (S.layername[i] === undefined) S.layername[i] = '';
    if (S.layerlock[i] === undefined) S.layerlock[i] = 0;
    if (S.layervol[i] === undefined) S.layervol[i] = 100;
    if (S.layerstereo[i] === undefined) S.layerstereo[i] = 100;
    if (S.lockedlayer[i] === undefined) S.lockedlayer[i] = 0;
  }
}

/* ---------------------------------------------------------------- 乐器 */
const INSTRUMENTS = [];
function Instrument(name, filename, user, press, key) {
  return { name, filename, user: !!user, press: !!press, key: key === undefined ? 45 : key, loaded: false, buffer: null, num_blocks: 0 };
}
function initInstruments() {
  INSTRUMENTS.length = 0;
  const defs = [
    ['Harp', 'harp.ogg', true], ['Double Bass', 'dbass.ogg', true], ['Bass Drum', 'bdrum.ogg', false],
    ['Snare Drum', 'sdrum.ogg', false], ['Click', 'click.ogg', false], ['Guitar', 'guitar.ogg', true],
    ['Flute', 'flute.ogg', true], ['Bell', 'bell.ogg', true], ['Chime', 'icechime.ogg', true],
    ['Xylophone', 'xylobone.ogg', true], ['Iron Xylophone', 'iron_xylophone.ogg', true], ['Cow Bell', 'cow_bell.ogg', true],
    ['Didgeridoo', 'didgeridoo.ogg', true], ['Bit', 'bit.ogg', true], ['Banjo', 'banjo.ogg', true],
    ['Pling', 'pling.ogg', true],
  ];
  for (const [n, f, p] of defs) INSTRUMENTS.push(Instrument(n, f, false, p));
  S.first_custom_index = INSTRUMENTS.length;
}
function insIndex(ins) { return INSTRUMENTS.indexOf(ins); }
function insAt(i) { return INSTRUMENTS[i]; }
function newInstrument(name, filename, user, press, key) {
  const ins = Instrument(name, filename, user, press, key);
  INSTRUMENTS.push(ins);
  return ins;
}

/* ---------------------------------------------------------------- 重置 */
function reset() {
  if (!S.grid) S.grid = makeGrid(GRID_CAP_STEP);
  else {
    S.grid.exists.fill(0); S.grid.ins.fill(0); S.grid.key.fill(0);
    S.grid.vel.fill(0); S.grid.pan.fill(0); S.grid.pit.fill(0);
  }
  resetColArrays();
  S.layername = new Array(128).fill(''); S.layerlock = new Array(128).fill(0);
  S.layervol = new Array(128).fill(100); S.layerstereo = new Array(128).fill(100);
  S.lockedlayer = new Array(128).fill(0);
  rowamount = new Int32Array(1024);
  growRowArrays(128);
  S.starta = 0; S.startb = 0; S.enda = 0; S.endb = 0; S.endb2 = 0;
  S.arraylength = 0; S.arrayheight = 0;
  S.totalblocks = 0; S.block_outside = 0; S.block_custom = 0; S.block_pitched = 0;
  S.marker_pos = 0; S.marker_prevpos = 0; S.playing = 0; S.record = 0;
  /* 播放排期状态（见 editor.js 的 scheduleAhead）。
     sched_col 必须初始化为数字：undefined <= S.enda 恒为 false，
     会让排期循环一次都不进入，表现为「播放完全没声音」。 */
  S.sched_col = 0;
  S.play_anchor_pos = 0;
  S.play_anchor_time = undefined;
  S.play_anchor_tempo = undefined;
  S.play_anchor_expected = 0;
  S.last_tick_gap = 0;
  /* 暂停时的位置快照：用来判断"恢复播放要不要重播标记所在的那一列"。
     pause_col = 暂停时刻的列号；pause_col_played = 那一列此刻是否已经响过。
     见 editor.js 的 togglePlaying。 */
  S.pause_col = -1;
  S.pause_col_played = 0;
  S.section_exists = 0; S.section_start = 0; S.section_end = 0;
  S.song_name = ''; S.song_author = ''; S.song_orauthor = ''; S.song_desc = '';
  S.work_mins = 0; S.work_left = 0; S.work_right = 0; S.work_add = 0; S.work_remove = 0;
  S.tempo = 10; S.timesignature = 4; S.loop = 0; S.loop_session = 0;
  S.loopstart = 0; S.loopmax = 0; S.loopend = 0; S.timestoloop = 0;
  S.changed = 0; S.filename = ''; S.song_midi = '';
  S.solostr = '';
  S.selected = 0; S.select = 0;
  S.selbx = -1; S.selby = -1;
  S.insbox_start = 0;
  for (const ins of INSTRUMENTS) ins.num_blocks = 0;
  // 移除自定义音色（保留前 16 个内置）
  while (INSTRUMENTS.length > S.first_custom_index) INSTRUMENTS.pop();
  S.user_instruments = 0;
  historyReset();
  selectionReset();
  S.instrument = 0;
  S.selected_key = 39; S.selected_vel = 100; S.selected_pan = 100; S.selected_pit = 0;
  if (typeof audioStopAll === 'function') audioStopAll();
}


/* ---------------------------------------------------------------- 基本操作 */
function ensureSongSize(w, h) {
  if (w >= S.arraylength) {
    growColArrays(w + 1);
    for (let a = S.arraylength; a <= w; a++) {
      colfirst[a] = -1; collast[a] = -1; colamount[a] = 0;
      for (let b = 0; b < Math.max(h + 1, S.arrayheight); b++) gSetExists(a, b, 0);
    }
    S.arraylength = w + 1;
    gridEnsureCapacity(w + 1, Math.max(h, S.arrayheight));
  }
  if (h >= S.arrayheight) {
    growRowArrays(h + 1);
    for (let a = 0; a < S.arraylength; a++) {
      for (let b = S.arrayheight; b <= h; b++) { rowamount[b] = 0; gSetExists(a, b, 0); }
    }
    S.arrayheight = h + 1;
    gridEnsureCapacity(Math.max(S.arraylength, w + 1), h + 1);
  }
}

// 加载时用：不播放、不写历史、不递增乐器计数（insnum = true）
function addBlock(x, y, ins, key, vel, pan, pit, insnum) {
  key = median(0, key, 87);
  ensureSongSize(x, y);
  const i = gidx(x, y);
  if (S.grid.exists[i]) return 0;
  S.grid.exists[i] = 1;
  S.grid.ins[i] = ins; S.grid.key[i] = key; S.grid.vel[i] = vel;
  S.grid.pan[i] = pan; S.grid.pit[i] = pit;
  S.grid.played[i] = 0; S.grid.added[i] = 0;
  colamount[x]++; rowamount[y]++;
  if (!insnum) {
    const o = INSTRUMENTS[ins];
    if (o) { o.num_blocks++; if (o.user) S.block_custom++; }
  }
  if (key < 33 || key > 57) S.block_outside++;
  if (pit !== 0) S.block_pitched++;
  S.totalblocks++;
  if (colfirst[x] === -1 || y < colfirst[x]) colfirst[x] = y;
  if (y > collast[x]) collast[x] = y;
  if (x >= S.enda) S.enda = x;
  if (y >= S.endb) S.endb = y;
  /* S.endb2 是"图层参数数组（layername/layervol/layerstereo/layerlock）覆盖到的层数"，
     不是"有音符的层数"。往一个还没被参数数组覆盖的层里加音符时，
     必须把它一起撑大 —— 否则 playColumnRange 里 `b < S.endb2` 不成立，
     那一层的音量/声道/音高设置全被跳过（历史上这里退化成音量 1/100，
     表现为"音符音量明明是 100，播放却几乎听不到"）。
     S.endb 是"最高有音符的层"，S.endb2 是"参数数组长度"，两者都必须跟上。 */
  if (y >= S.endb2) S.endb2 = y + 1;
  return 1;
}

function addBlockManual(x, y, ins, key, vel, pan, pit) {
  if (x >= 32000) return 0;
  ensureSongSize(x, y);
  const i = gidx(x, y);
  if (S.grid.exists[i]) return 0;
  S.grid.exists[i] = 1;
  S.grid.ins[i] = ins; S.grid.key[i] = key; S.grid.vel[i] = vel;
  S.grid.pan[i] = pan; S.grid.pit[i] = pit;
  S.grid.played[i] = 0; S.grid.added[i] = G.time;
  colamount[x]++; rowamount[y]++;
  const o = INSTRUMENTS[ins];
  if (o) o.num_blocks++;
  if (key < 33 || key > 57) S.block_outside++;
  if (o && o.user) S.block_custom++;
  if (pit !== 0) S.block_pitched++;
  S.totalblocks++;
  S.changed = 1;
  S.work_add++;
  if (colfirst[x] === -1 || y < colfirst[x]) colfirst[x] = y;
  if (y > collast[x]) collast[x] = y;
  if (x >= S.enda) S.enda = x;
  if (y >= S.endb) S.endb = y;
  /* 同 addBlock：把图层参数数组一起撑大，否则这一层的音量设置会被跳过。 */
  if (y >= S.endb2) S.endb2 = y + 1;
  if (o && o.loaded) playSound(o, key, vel, pan, pit);
  historySet(H_ADD, x, y, ins, key, vel, pan, pit);
  return 1;
}

function removeBlockManual(x, y) {
  const i = gidx(x, y);
  if (!S.grid.exists[i]) return 0;
  S.grid.exists[i] = 0;
  const ins = S.grid.ins[i], key = S.grid.key[i], vel = S.grid.vel[i], pan = S.grid.pan[i], pit = S.grid.pit[i];
  const o = INSTRUMENTS[ins];
  if (o) o.num_blocks--;
  if (key < 33 || key > 57) S.block_outside--;
  if (o && o.user) S.block_custom--;
  if (pit !== 0) S.block_pitched--;
  S.grid.ins[i] = 0; S.grid.key[i] = 0; S.grid.vel[i] = 0; S.grid.pan[i] = 0; S.grid.pit[i] = 0;
  S.grid.played[i] = 0; S.grid.added[i] = 0;
  colamount[x]--; rowamount[y]--; S.totalblocks--; S.work_remove++;
  if (colamount[x] === 0 && S.enda === x) {
    for (let a = x; a >= 0; a--) { S.enda = a; if (colamount[a] > 0) break; }
  }
  if (rowamount[y] === 0 && S.endb === y) {
    for (let b = y; b >= 0; b--) { S.endb = b; if (rowamount[b] > 0) break; }
  }
  if (colfirst[x] === y) {
    colfirst[x] = -1;
    for (let a = 0; a <= collast[x]; a++) if (gExists(x, a)) { colfirst[x] = a; break; }
  }
  if (collast[x] === y) {
    collast[x] = -1;
    for (let a = y; a >= 0; a--) if (gExists(x, a)) { collast[x] = a; break; }
  }
  historySet(H_REMOVE, x, y, ins, key, vel, pan, pit);
  S.changed = 1;
  if (S.theme === 3 && S.remove_effect) pushRemoveEffect(x - S.starta, y - S.startb);
}

// 从歌曲移除但不写历史（供选区“抬起”用）
function removeBlockSelect(x, y) {
  const i = gidx(x, y);
  if (!S.grid.exists[i]) return 0;
  S.grid.exists[i] = 0;
  const ins = S.grid.ins[i], key = S.grid.key[i], pit = S.grid.pit[i];
  const o = INSTRUMENTS[ins];
  if (o) o.num_blocks--;
  if (key < 33 || key > 57) S.block_outside--;
  if (o && o.user) S.block_custom--;
  if (pit !== 0) S.block_pitched--;
  S.grid.ins[i] = 0; S.grid.key[i] = 0; S.grid.vel[i] = 0; S.grid.pan[i] = 0; S.grid.pit[i] = 0;
  colamount[x]--; rowamount[y]--; S.totalblocks--;
  if (colamount[x] === 0 && S.enda === x) {
    for (let a = x; a >= 0; a--) { S.enda = a; if (colamount[a] > 0) break; }
  }
  if (rowamount[y] === 0 && S.endb === y) {
    for (let b = y; b >= 0; b--) { S.endb = b; if (rowamount[b] > 0) break; }
  }
  if (colfirst[x] === y) {
    colfirst[x] = -1;
    for (let a = 0; a <= collast[x]; a++) if (gExists(x, a)) { colfirst[x] = a; break; }
  }
  if (collast[x] === y) {
    collast[x] = -1;
    for (let a = y; a >= 0; a--) if (gExists(x, a)) { collast[x] = a; break; }
  }
  return 1;
}

function changeBlockManual(x, y, ins, key, vel, pan, pit) {
  const i = gidx(x, y);
  const pins = S.grid.ins[i], pkey = S.grid.key[i], pvel = S.grid.vel[i], ppan = S.grid.pan[i], ppit = S.grid.pit[i];
  S.grid.ins[i] = ins; S.grid.key[i] = key; S.grid.vel[i] = vel; S.grid.pan[i] = pan; S.grid.pit[i] = pit;
  const o = INSTRUMENTS[ins];
  if (o && o.loaded) playSound(o, key, vel, pan, pit);
  historySet(H_CHANGE, x, y, ins, key, vel, pan, pit, pins, pkey, pvel, ppan, ppit);
  S.changed = 1;
  const po = INSTRUMENTS[pins];
  if (!(po && po.user) && o && o.user) S.block_custom++;
  if (po && po.user && !(o && o.user)) S.block_custom--;
  if (pkey >= 33 && pkey <= 57 && (key < 33 || key > 57)) S.block_outside++;
  if (key >= 33 && key <= 57 && (pkey < 33 || pkey > 57)) S.block_outside--;
  if (ppit === 0 && pit !== 0) S.block_pitched++;
  if (ppit !== 0 && pit === 0) S.block_pitched--;
}

// 撤销用（不写历史）
function changeBlock(x, y, ins, key, vel, pan, pit) {
  const i = gidx(x, y);
  S.grid.ins[i] = ins; S.grid.key[i] = key; S.grid.vel[i] = vel; S.grid.pan[i] = pan; S.grid.pit[i] = pit;
}

function removeBlock(x, y) { // 撤销用，不写历史
  const i = gidx(x, y);
  if (!S.grid.exists[i]) return 0;
  S.grid.exists[i] = 0;
  const ins = S.grid.ins[i], key = S.grid.key[i], pit = S.grid.pit[i];
  const o = INSTRUMENTS[ins];
  if (o) o.num_blocks--;
  if (key < 33 || key > 57) S.block_outside--;
  if (o && o.user) S.block_custom--;
  if (pit !== 0) S.block_pitched--;
  colamount[x]--; rowamount[y]--; S.totalblocks--;
  if (colamount[x] === 0 && S.enda === x) {
    for (let a = x; a >= 0; a--) { S.enda = a; if (colamount[a] > 0) break; }
  }
  if (rowamount[y] === 0 && S.endb === y) {
    for (let b = y; b >= 0; b--) { S.endb = b; if (rowamount[b] > 0) break; }
  }
  if (colfirst[x] === y) { colfirst[x] = -1; for (let a = 0; a <= collast[x]; a++) if (gExists(x, a)) { colfirst[x] = a; break; } }
  if (collast[x] === y) { collast[x] = -1; for (let a = y; a >= 0; a--) if (gExists(x, a)) { collast[x] = a; break; } }
  return 1;
}

function recalcSong() {
  S.totalblocks = 0; S.block_outside = 0; S.block_custom = 0; S.block_pitched = 0;
  colamount.fill(0); colfirst.fill(-1); collast.fill(-1); rowamount.fill(0);
  let enda = 0, endb = 0;
  for (const ins of INSTRUMENTS) ins.num_blocks = 0;
  for (let x = 0; x < S.arraylength; x++) {
    for (let y = 0; y < S.arrayheight; y++) {
      if (!gExists(x, y)) continue;
      S.totalblocks++;
      colamount[x]++; rowamount[y]++;
      if (colfirst[x] === -1) colfirst[x] = y;
      collast[x] = Math.max(collast[x], y);
      enda = Math.max(enda, x); endb = Math.max(endb, y);
      const ins = gIns(x, y);
      if (INSTRUMENTS[ins]) {
        INSTRUMENTS[ins].num_blocks++;
        if (INSTRUMENTS[ins].user) S.block_custom++;
      }
      const k = gKey(x, y);
      if (k < 33 || k > 57) S.block_outside++;
      if (gPit(x, y) !== 0) S.block_pitched++;
    }
  }
  S.enda = enda; S.endb = endb;
  S.endb2 = Math.max(S.endb2, S.endb + 1);
}

/* 图层操作 */
// 在 index 处插入一个空层（把 index 及其后的层整体下移）
function addLayer(index, undo, name, lock, vol, stereo) {
  if (index === undefined) index = S.endb2;
  growRowArrays(S.endb2 + 3);
  const last = Math.max(S.endb2, index + 1);
  for (let b = last; b > index; b--) {
    S.layername[b] = S.layername[b - 1]; S.layerlock[b] = S.layerlock[b - 1];
    S.layervol[b] = S.layervol[b - 1]; S.layerstereo[b] = S.layerstereo[b - 1];
    rowamount[b] = rowamount[b - 1];
    for (let a = 0; a < S.arraylength; a++) {
      const src = gidx(a, b - 1), dst = gidx(a, b);
      S.grid.exists[dst] = S.grid.exists[src]; S.grid.ins[dst] = S.grid.ins[src];
      S.grid.key[dst] = S.grid.key[src]; S.grid.vel[dst] = S.grid.vel[src];
      S.grid.pan[dst] = S.grid.pan[src]; S.grid.pit[dst] = S.grid.pit[src];
      S.grid.exists[src] = 0; S.grid.ins[src] = 0; S.grid.key[src] = 0;
      S.grid.vel[src] = 0; S.grid.pan[src] = 0; S.grid.pit[src] = 0;
    }
  }
  /* 插入一层后，被插入位置及其下方的层都上移一位，colfirst/collast 跟着 +1。
     这里原来写的是：
         if (colfirst[a] > index) colfirst[a]++;
         if (collast[a] >= index) collast[a]++;
     与 removeLayer 一样是不对称的：colfirst 用 >，collast 用 >=。
     两个边界必须用同一套判据（插入点之后的层整体 +1），否则区间会走形。
     插入是纯搬移、没有方块被销毁，所以直接按 > / >= 一起加就够了，
     与 removeLayer 那种"层被销毁、边界可能正好是被删层"的情况不同。 */
  for (let a = 0; a < S.arraylength; a++) {
    if (colfirst[a] >= index) colfirst[a]++;
    if (collast[a] >= index) collast[a]++;
  }
  S.endb++;
  S.endb2 = Math.max(S.endb2, index + 1);
  S.layername[index] = name === undefined ? '' : name;
  S.layerlock[index] = lock === undefined ? 0 : lock;
  S.layervol[index] = vol === undefined ? 100 : vol;
  S.layerstereo[index] = stereo === undefined ? 100 : stereo;
  rowamount[index] = 0;
  S.changed = 1;
  if (!undo) historySet(H_ADDLAYER, { index });
}
function removeLayer(index, undo) {
  const snapshot = {
    index,
    name: S.layername[index], lock: S.layerlock[index],
    vol: S.layervol[index], stereo: S.layerstereo[index],
    blocks: [],
  };
  for (let a = 0; a < S.arraylength; a++) {
    if (gExists(a, index)) {
      snapshot.blocks.push({ x: a, ins: gIns(a, index), key: gKey(a, index), vel: gVel(a, index), pan: gPan(a, index), pit: gPit(a, index) });
      removeBlockSelect(a, index);
    }
  }
  growRowArrays(S.endb2 + 2);
  for (let b = index; b < S.endb2; b++) {
    S.layername[b] = S.layername[b + 1]; S.layerlock[b] = S.layerlock[b + 1];
    S.layervol[b] = S.layervol[b + 1]; S.layerstereo[b] = S.layerstereo[b + 1];
    rowamount[b] = rowamount[b + 1];
    for (let a = 0; a < S.arraylength; a++) {
      const s = gidx(a, b + 1), d = gidx(a, b);
      S.grid.exists[d] = S.grid.exists[s]; S.grid.ins[d] = S.grid.ins[s];
      S.grid.key[d] = S.grid.key[s]; S.grid.vel[d] = S.grid.vel[s];
      S.grid.pan[d] = S.grid.pan[s]; S.grid.pit[d] = S.grid.pit[s];
      S.grid.exists[s] = 0; S.grid.ins[s] = 0; S.grid.key[s] = 0;
    }
  }
  /* 删掉一层后，每列的 colfirst / collast 要跟着它上面那些层一起下移。
     这里原来写的是：
         if (colfirst[a] > index) colfirst[a]--;
         if (collast[a] >= index) collast[a]--;
     第二个条件用 >= 是错的：当 collast[a] === index（该列最底下正好是被删的层）
     时，减 1 会把它指到一个可能空着的位置；而 colfirst[a] === index 时却又
     不减（条件用的是 >），两者不对称。结果是 colfirst/collast 描述的区间
     与真实数据错位，绘制和删除都按错的区间遍历 ——
     表现就是「点一次删除，画布上各层的音符随机消失一点」：
     区间被收窄后，落在收窄区间外的音符画不出来，再删一次区间又变一次。
     正确做法：边界大于 index 才减 1；等于 index 的（被删层本身）
     直接按搬移后的真实数据重新扫一遍。 */
  for (let a = 0; a < S.arraylength; a++) {
    let nf = colfirst[a], nl = collast[a];
    if (nf > index) nf--;
    if (nl > index) nl--;
    // 被删层正好是某个边界时，扫真实数据重算这一列
    if (colfirst[a] === index || collast[a] === index) {
      nf = -1; nl = -1;
      for (let b = 0; b < S.endb2; b++) {
        if (gExists(a, b)) { if (nf < 0) nf = b; nl = b; }
      }
    }
    // 该列已经空了：两个边界都归 -1，避免残留旧值把区间撑成非法长度
    if (nf < 0 || nl < 0) {
      nf = -1; nl = -1; colamount[a] = 0;
    }
    colfirst[a] = nf; collast[a] = nl;
  }
  S.endb = Math.max(0, S.endb - 1);
  S.endb2 = Math.max(0, S.endb2 - 1);
  S.changed = 1;
  if (!undo) historySet(H_REMOVELAYER, snapshot);
}
function shiftLayers(from, to, undo) {
  /* 对照 shift_layers.gml:9-17：
       if (l1 >= endb2 || l2 >= endb2) { endb2 += 1; layername[endb2] = ""; ... }
     原版在越界时【扩容一层】而不是拒绝操作 —— 也就是「把最下面一层继续下移」
     会新开一层，把内容挪到新层上。我们之前是 `if (to >= S.endb2) return;`，
     于是最底层的下移按钮点了毫无反应，而上移按钮又会画在 layer>0 的条件里，
     上下两个按钮的行为不对称，这就是「规律搞不懂」的一部分来源。 */
  if (to < 0) return;
  if (to >= S.endb2) {
    const need = to + 1;
    while (S.endb2 < need) {
      const lb = S.endb2;
      growRowArrays(lb + 2);
      S.layername[lb] = ''; S.layerlock[lb] = 0;
      S.layervol[lb] = 100; S.layerstereo[lb] = 100; rowamount[lb] = 0;
      S.endb2 = lb + 1;
    }
  }
  growRowArrays(S.endb2 + 2);
  const a = Math.min(from, to), b = Math.max(from, to);
  /* 独奏字符串的同步必须用【交换前】两个层的 lock 值 —— 对照
     shift_layers.gml:19-23，这段 `if (layerlock[l1] = 2 ^^ layerlock[l2] = 2)`
     写在「Store first layer」之前，读的是原始值。
     （我第一版在交换之后才判断，那时 layerlock[a] 已经是 b 的旧值、
     layerlock[b] 已经是 a 的旧值，两边比的是同一份数据，条件恒为假，
     solostr 永远不更新。）
     `^^` 是异或：只有恰好一层在独奏时才需要改，两层都独奏或都不独奏都不用动。 */
  const lockA0 = S.layerlock[a], lockB0 = S.layerlock[b];
  // 交换 a、b 两层
  const tmps = [S.layername[a], S.layerlock[a], S.layervol[a], S.layerstereo[a], rowamount[a]];
  S.layername[a] = S.layername[b]; S.layerlock[a] = S.layerlock[b];
  S.layervol[a] = S.layervol[b]; S.layerstereo[a] = S.layerstereo[b]; rowamount[a] = rowamount[b];
  S.layername[b] = tmps[0]; S.layerlock[b] = tmps[1]; S.layervol[b] = tmps[2];
  S.layerstereo[b] = tmps[3]; rowamount[b] = tmps[4];
  for (let x = 0; x < S.arraylength; x++) {
    const ia = gidx(x, a), ib = gidx(x, b);
    const ex = S.grid.exists[ia], ins = S.grid.ins[ia], k = S.grid.key[ia], v = S.grid.vel[ia], p = S.grid.pan[ia], pt = S.grid.pit[ia];
    S.grid.exists[ia] = S.grid.exists[ib]; S.grid.ins[ia] = S.grid.ins[ib];
    S.grid.key[ia] = S.grid.key[ib]; S.grid.vel[ia] = S.grid.vel[ib];
    S.grid.pan[ia] = S.grid.pan[ib]; S.grid.pit[ia] = S.grid.pit[ib];
    S.grid.exists[ib] = ex; S.grid.ins[ib] = ins; S.grid.key[ib] = k;
    S.grid.vel[ib] = v; S.grid.pan[ib] = p; S.grid.pit[ib] = pt;
  }
  /* layerlock 跟着层一起交换了（独奏标记换到新位置），但 solostr 里记的是
     【层号字符串】，不同步的话 lockedLayerOf() 会按旧的层号判断独奏，
     独奏就作用在了另一层上 —— 表现是「上下移之后，声音的层突然变了」。 */
  if ((lockA0 === 2) !== (lockB0 === 2)) {
    if (lockA0 === 2) S.solostr = S.solostr.split('|' + a + '|').join('|' + b + '|');
    else S.solostr = S.solostr.split('|' + b + '|').join('|' + a + '|');
  }
  /* colfirst / collast 也必须跟着修正 —— 这是「点一下上移，音符消失」的真正原因。
     它们描述「该列最上面 / 最下面一个有内容的层」，绘制音符的循环
     （editor.js:1167）写的是：
         if (layer < colfirst[col] || layer > collast[col]) continue;
     交换 a、b 两层时边界值【确实会变】——这不是「占用集合不变」的纯置换：
         · 该列只有 a 有内容 → 交换后变成只有 b 有内容，边界由 a 变成 b
         · 该列只有 b 有内容 → 边界由 b 变成 a
         · 两者都有 → 边界不变
     之前这里完全没更新，于是把音符从层 a 上移到层 b 之后，collast 还停在 a，
     绘制循环判定 b 越界、直接 continue —— 音符数据在网格里、就是不被画出来，
     表现就是「点一下上移，音符消失了」。
     而之后任何一次 recalcSong()（开头 colfirst.fill(-1) 再全表重扫）又会把边界
     算对，音符重新出现 —— 这正是用户说的「再点一下上移，那个音符又回来了」。
     不是第二次点产生了什么效果，是中间某次 recalcSong 顺手把边界修好了。
     只重算真正受影响的列（内容落在 a 或 b 上的列）就够，不必整表重扫。 */
  for (let x = 0; x < S.arraylength; x++) {
    if (!gExists(x, a) && !gExists(x, b)) continue;
    let nf = -1, nl = -1;
    for (let y = 0; y < S.endb2; y++) {
      if (!gExists(x, y)) continue;
      if (nf < 0) nf = y;
      nl = y;
    }
    colfirst[x] = nf; collast[x] = nl;
  }
  /* endb 必须重算。它是「有内容的最下面一层」，渲染循环写的是
     `for (b = 0; b <= S.endb; b++)`，一旦内容被移到 endb 之外，
     音符数据还在、但根本不会被画出来 —— 这就是用户说的
     「下移之后音符莫名其妙没了」。之前只有 addLayer / removeLayer 维护它，
     shiftLayers 完全没碰，所以把内容往下移会丢、往上移不会。 */
  let eb = S.endb2 - 1;
  while (eb >= 0 && rowamount[eb] === 0) eb--;
  S.endb = Math.max(0, eb);
  S.changed = 1;
  if (!undo) historySet(H_SWAPLAYER, to, from);
}

/* ---------------------------------------------------------------- 工具 */
const KEYNAMES = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#'];
const KEYNAMES_FLAT = ['A', 'Bb', 'B', 'C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab'];
function getKeyname(n, showOct) {
  const names = S.keynames_flat ? KEYNAMES_FLAT : KEYNAMES;
  return names[mod(n, 12)] + (showOct ? String(floor((n - 3) / 12) + 1) : '');
}
function timeStr(sec) {
  if (!isFinite(sec)) sec = 0;
  let msec = floor(sec * 1000) % 1000;
  const mi = floor(sec / 60) % 60, hr = floor(sec / 3600) % 60;
  const s = floor(sec) % 60;
  return String(hr).padStart(2, '0') + ':' + String(mi).padStart(2, '0') + ':' +
    String(s).padStart(2, '0') + ';' + String(msec).padStart(3, '0');
}
function secondsToStr(c) {
  if (c < 60) return '<1 min';
  if (c < 3600) return floor(c / 60) + ' min';
  if (c < 86400) return floor(c / 3600) + ' h';
  return floor(c / 86400) + ' d';
}
function updateSongSize() {
  let e = 0, b = 0;
  for (let x = 0; x < S.arraylength; x++) if (colamount[x] > 0) e = x;
  for (let y = 0; y < S.arrayheight; y++) if (rowamount[y] > 0) b = y;
  S.enda = e; S.endb = b;
}

/* 删除方块特效（GML 的 obj_removeeff，仅视觉） */
const removeEffects = [];
function pushRemoveEffect(x, y) {
  removeEffects.push({ x, y, t: 0 });
  if (removeEffects.length > 40) removeEffects.shift();
}
