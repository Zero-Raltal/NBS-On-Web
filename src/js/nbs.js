/* =========================================================================
   nbs.js — .nbs 读写 / .nbp 片段读写
   严格对照 open_song_nbs() 与 save_song()（NBS 版本 5，兼容读取 0-5）
   ========================================================================= */
'use strict';

class ByteReader {
  constructor(buf) { this.d = new DataView(buf); this.p = 0; this.buf = buf; }
  eof() { return this.p >= this.buf.byteLength; }
  byte() { if (this.p >= this.buf.byteLength) throw new Error('EOF'); return this.d.getUint8(this.p++); }
  sbyte() { if (this.p >= this.buf.byteLength) throw new Error('EOF'); return this.d.getInt8(this.p++); }
  short() { const v = this.d.getInt16(this.p, true); this.p += 2; return v; }
  int() { const v = this.d.getInt32(this.p, true); this.p += 4; return v; }
  str() {
    const len = this.int();
    const bytes = new Uint8Array(this.buf, this.p, len);
    this.p += len;
    return new TextDecoder('utf-8').decode(bytes);
  }
  skip(n) { this.p += n; }
}

class ByteWriter {
  constructor() { this.a = []; }
  byte(v) { this.a.push(v & 0xff); }
  short(v) { this.a.push(v & 0xff, (v >> 8) & 0xff); }
  int(v) {
    this.a.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
  }
  str(s) {
    const enc = new TextEncoder().encode(s == null ? '' : String(s));
    this.int(enc.length);
    for (const b of enc) this.a.push(b);
  }
  bytes() { return new Uint8Array(this.a); }
}

/* ---------------------------------------------------------------- 读取 */
function readNBS(arrayBuffer, fileName) {
  const r = new ByteReader(arrayBuffer);
  let nbsVer, firstCustom, customIndexDiff = 0;
  const b1 = r.byte(), b2 = r.byte();
  if (b1 === 0 && b2 === 0) {
    nbsVer = r.byte();
    firstCustom = r.byte();
    customIndexDiff = S.first_custom_index - firstCustom;
    if (nbsVer >= 3) r.short(); // 歌曲长度（重复）
    if (nbsVer > 5) throw new Error('该文件由更新版本的 Note Block Studio 保存（v' + nbsVer + '）。');
  } else {
    nbsVer = 0;
    firstCustom = 0;
    r.p = 0;
  }
  const height = r.short();
  const song = {
    name: r.str(), author: r.str(), orauthor: r.str(), desc: r.str(),
    tempo: r.short() / 100, autosave: r.byte(), autosavemins: r.byte(),
    timesig: median(2, r.byte(), 8),
    work: [Math.max(0, r.int()), Math.max(0, r.int()), Math.max(0, r.int()), Math.max(0, r.int()), Math.max(0, r.int())],
    midi: r.str(), loop: 0, loopmax: 0, loopstart: 0,
  };
  if (nbsVer >= 4) {
    song.loop = r.byte();
    song.loopmax = r.byte();
    song.loopstart = r.short();
  }
  // 音符
  const notes = [];
  let ca = -1;
  while (true) {
    let a = r.short();
    if (a === 0) break;
    ca += a;
    let cb = -1;
    while (true) {
      a = r.short();
      if (a === 0) break;
      cb += a;
      let ins = r.byte();
      if (ins >= firstCustom) ins += customIndexDiff;
      const key = r.byte();
      let vel = 100, pan = 100, pit = 0;
      if (nbsVer >= 4) { vel = r.byte(); pan = r.byte(); pit = r.short(); }
      notes.push({ x: ca, y: cb, ins, key: median(0, key, 87), vel, pan, pit });
    }
  }
  // 图层
  const layers = [];
  for (let b = 0; b < height; b++) {
    const name = r.str();
    let lock = 0;
    if (nbsVer >= 4) lock = r.byte();
    let vol = r.byte();
    if (vol === -1 || vol > 100) vol = 100;
    const stereo = nbsVer >= 2 ? r.byte() : 100;
    layers.push({ name, lock, vol, stereo });
  }
  // 自定义音色
  const customs = [];
  if (!r.eof()) {
    try {
      const n = r.byte();
      for (let i = 0; i < n; i++) {
        const name = r.str(), fn = r.str();
        const key = r.byte(), press = r.byte();
        customs.push({ name, fn, key, press });
      }
    } catch (e) { /* 旧文件可能没有这一段 */ }
  }
  return { nbsVer, song, notes, layers, customs };
}

/* 对照 load_instruments.gml：把一个歌曲文件里的自定义音色并入当前歌曲。
   GML 是 `for (b = 0; b < a; b++) { name, filename, key, press → new_instrument(...) }`，
   这里直接复用 readNBS 已经解析好的 customs 段，避免重复实现一遍二进制解析。 */
function importInstrumentsFromNbs(bytes) {
  const parsed = readNBS(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const customs = parsed.customs || [];
  let added = 0;
  for (const c of customs) {
    // 同名同文件的音色不重复加入
    if (INSTRUMENTS.some((i) => i.name === c.name && i.filename === c.fn)) continue;
    const ni = newInstrument(c.name, c.fn, true, c.press, c.key);
    INSTRUMENTS.push(ni);
    added++;
  }
  if (added) { recalcSong(); S.changed = 1; }
  return added;
}

function loadNBSToEditor(data, fileName) {
  reset();
  const parsed = readNBS(data, fileName);
  const s = parsed.song;
  S.song_name = s.name; S.song_author = s.author; S.song_orauthor = s.orauthor;
  S.song_desc = s.desc; S.song_midi = s.midi;
  S.tempo = s.tempo; S.timesignature = s.timesig;
  S.loop = s.loop; S.loopmax = s.loopmax; S.loopstart = s.loopstart;
  S.loop_session = s.loop;
  [S.work_mins, S.work_left, S.work_right, S.work_add, S.work_remove] = s.work;
  S.nbs_loaded_version = parsed.nbsVer;

  // 自定义音色
  for (const c of parsed.customs) {
    const ins = newInstrument(c.name, c.fn, true, c.press, c.key);
    ins.needsFile = true;
    if (c.press) ins.press = true;
  }
  // 图层
  for (let i = 0; i < parsed.layers.length; i++) {
    S.layername[i] = parsed.layers[i].name;
    S.layerlock[i] = parsed.layers[i].lock;
    S.layervol[i] = parsed.layers[i].vol;
    S.layerstereo[i] = parsed.layers[i].stereo;
    rowamount[i] = 0;
  }
  S.endb2 = Math.max(1, parsed.layers.length);
  // 音符（逆序添加，与 GML 一致以保证性能）
  for (let i = parsed.notes.length - 1; i >= 0; i--) {
    const n = parsed.notes[i];
    addBlock(n.x, n.y, clamp(n.ins, 0, INSTRUMENTS.length - 1), n.key, n.vel, n.pan, n.pit, true);
  }
  recalcSong();
  S.endb2 = Math.max(S.endb2, S.endb + 1);
  for (const ins of INSTRUMENTS) {
    if (ins.user && !ins.loaded) tryLoadCustomInstrument(ins);
  }
  S.filename = fileName || '';
  S.changed = 0;
  S.marker_pos = 0; S.marker_prevpos = 0;
  if (parsed.nbsVer < 5) {
    setMsg('已打开旧版 NBS 文件（v' + parsed.nbsVer + '）');
    if (S.show_oldwarning) messageDialog('你正在打开旧版 NBS 文件（v' + parsed.nbsVer + '）。\n保存此文件会使其与旧版 Note Block Studio 不兼容。', '警告');
  }
}

/* ---------------------------------------------------------------- 写入 */
function buildNBS(version) {
  const w = new ByteWriter();
  version = version === undefined ? 5 : version;
  w.short(0);
  w.byte(version);
  w.byte(S.first_custom_index);
  if (version >= 3) w.short(S.enda);
  w.short(Math.max(1, S.endb2));
  w.str(S.song_name); w.str(S.song_author); w.str(S.song_orauthor); w.str(S.song_desc);
  w.short(Math.round(S.tempo * 100));
  w.byte(0); w.byte(10); w.byte(S.timesignature);
  w.int(floor(S.work_mins)); w.int(S.work_left); w.int(S.work_right); w.int(S.work_add); w.int(S.work_remove);
  w.str(S.song_midi || '');
  if (version >= 4) { w.byte(S.loop); w.byte(S.loopmax); w.short(S.loopstart); }
  // 音符
  let ca = 0;
  for (let a = 0; a <= S.enda; a++) {
    ca++;
    if (colamount[a] > 0) {
      w.short(ca); ca = 0;
      let cb = 0;
      for (let b = 0; b <= collast[a]; b++) {
        cb++;
        if (gExists(a, b)) {
          w.short(cb); cb = 0;
          w.byte(gIns(a, b)); w.byte(gKey(a, b));
          if (version >= 4) { w.byte(gVel(a, b)); w.byte(gPan(a, b)); w.short(gPit(a, b)); }
        }
      }
      w.short(0);
    }
  }
  w.short(0);
  // 图层
  for (let b = 0; b < S.endb2; b++) {
    w.str(S.layername[b] || '');
    if (version >= 4) w.byte(S.layerlock[b] || 0);
    w.byte(S.layervol[b] === undefined ? 100 : S.layervol[b]);
    if (version >= 2) w.byte(S.layerstereo[b] === undefined ? 100 : S.layerstereo[b]);
  }
  // 自定义音色
  const customs = INSTRUMENTS.filter(i => i.user);
  w.byte(customs.length);
  for (const c of customs) {
    w.str(c.name); w.str(c.filename || '');
    w.byte(c.key === undefined ? 45 : c.key);
    w.byte(c.press ? 1 : 0);
  }
  return w.bytes();
}

/* ---------------------------------------------------------------- 片段 */
// 对照 macros.gml:7 的 `#macro pat_version 1`
const PAT_VERSION = 1;
// 对照 GML pattern_import() 的落点选择（at_mouse_pos 分支）：
//   有鼠标格坐标就用它，否则退回视口左上角。
function patternImportTarget() {
  if (S.selbx > -1 && S.selby > -1) return { x: S.selbx, y: S.selby };
  return { x: floor(S.starta), y: floor(S.startb) };
}

/* 导入一个 .nbp 片段并【直接落地】。
 *
 * 为什么不能照搬原版只调 selection_load()：
 *   NBS 的 action_paste 是把内容装进选区缓冲区，让选区浮着，等玩家再点一次
 *   左键才由 selection_place() 落地。但导入片段时选区被放在「视口左上角」或
 *   「鼠标格」，正好压在玩家接下来要点的位置上，于是第一次左键命中
 *   selection_draw 里的拖动分支（window = w_dragselection），只开始拖动、
 *   不落地；玩家必须【再点一次】才真正放下 —— 表现就是「导入片段无效」。
 *
 * 导入片段是一次性放置意图，所以这里 load 完立刻 place，
 * 落点用 patternImportTarget()，与 pattern_import 的 at_mouse_pos 一致。 */
function patternImportBytes(buf) {
  if (S.selected !== 0) return { ok: false, msg: '请先取消当前选区。' };
  const p = readPattern(buf);
  if (!p.code) return { ok: false, msg: '这个片段里没有任何音符。' };
  const t = patternImportTarget();
  S.clipboard = p.code;
  selectionLoadExt(t.x, t.y, p.code);
  selectionPlace(false);        // ← 关键：立刻落地，不留浮动选区
  S.changed = 1;
  recalcSong();
  return { ok: true, x: t.x, y: t.y };
}

// 对照 GML pattern_export()：版本号、歌曲长宽、选区列数、去压缩后的选区代码，
// 然后是每列的 colfirst/collast（有符号字节）。
function buildPattern() {
  const w = new ByteWriter();
  w.byte(PAT_VERSION);
  w.short(S.enda);
  w.short(S.endb);
  w.short(SEL.l);
  w.str(tryDecompressSelection(SEL.code));
  for (let a = 0; a < SEL.l; a++) {
    // 对照源码：直接写 selection_colfirst/collast（-1 也要照写，读取端靠它判断空列）
    w.byte(SEL.colfirst[a] < 0 ? -1 : SEL.colfirst[a]);
    w.byte(SEL.collast[a] < 0 ? -1 : SEL.collast[a]);
  }
  return w.bytes();
}
function selToCodeString() {
  return SEL.code;
}
// 对照 GML pattern_import() 的读取顺序。注意读取端只用到 code 和列数；
// colfirst/collast 读进来只是为了让指针走完，真正的列范围由 selection_load() 从 code 重算。
function readPattern(buf) {
  const r = new ByteReader(buf);
  const ver = r.byte();
  if (ver > PAT_VERSION) {
    // 对照源码：新版本给个警告但继续读
    setMsg('该片段由更新版本的 Note Block Studio 保存，可能无法正确打开。');
  }
  const enda = r.short();
  const endb = r.short();
  const l = r.short();
  const code = r.str();
  return { ver, enda, endb, l, code };
}

/* ---------------------------------------------------------------- 文件操作 */
function downloadBytes(bytes, name, mime) {
  const blob = new Blob([bytes], { type: mime || 'application/octet-stream' });
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  /* 撤销时机很关键：Chrome 的下载是【异步】开始的，click() 返回时
     浏览器可能还没把 blob 读完。原来 1 秒后就 revoke，导出 WAV 这种
     几 MB～几十 MB 的文件会在下载刚起步时被中断（CDP 里表现为
     downloadProgress: canceled，用户看到的就是「点了导出没反应」）。
     改成充裕的延迟，让下载把数据取完再释放。 */
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 60000);
}

function pickFile(accept, cb) {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = accept;
  inp.onchange = () => {
    const f = inp.files[0];
    if (f) f.arrayBuffer().then(ab => cb(ab, f.name));
  };
  inp.click();
}

function saveSongFile(asNew) {
  if (S.playing) S.playing = 0;
  if (S.selected > 0) selectionPlace(false);
  const bytes = buildNBS(S.save_version);
  let name = S.filename || '未命名歌曲.nbs';
  if (!/\.nbs$/i.test(name)) name = name.replace(/\.[^.]*$/, '') + '.nbs';
  if (asNew || !S.filename) {
    const input = prompt('保存为：', name);
    if (!input) return;
    name = input;
  }
  downloadBytes(bytes, name, 'application/octet-stream');
  S.filename = name;
  S.changed = 0;
  addToRecent(name, bytes);
  setMsg('歌曲已保存');
}

function loadSongDialog() {
  const doOpen = () => pickFile('.nbs,.mid,.midi,.nbp', (ab, name) => {
    const ext = (name.split('.').pop() || '').toLowerCase();
    try {
      if (ext === 'nbs') { loadNBSToEditor(ab, name); addToRecent(name, ab); }
      else if (ext === 'mid' || ext === 'midi') importMidi(ab, name);
      else if (ext === 'nbp') {
        /* 与「导入片段......」走同一个函数，导入后立刻落地，不留浮动选区 */
        const r = patternImportBytes(ab);
        if (!r.ok) messageDialog(r.msg, '提示');
        else setMsg('片段已导入并放置在 ' + (r.x + 1) + ' 列 / ' + (r.y + 1) + ' 层');
      }
    } catch (e) { messageDialog('打开失败：' + e.message, '错误'); }
  });
  if (S.changed) confirmDialogOn(ok => { if (ok) doOpen(); }, '当前歌曲尚未保存，确定要打开其他歌曲吗？', '打开歌曲');
  else doOpen();
}

/* 最近歌曲（保存在浏览器本地） */
const RECENT_KEY = 'nbsweb.recent.v1';
function getRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch (e) { return []; }
}
function addToRecent(name, bytes) {
  let list = getRecent().filter(r => r.name !== name);
  let b64 = '';
  try {
    if (bytes && bytes.byteLength < 400000) b64 = btoa(String.fromCharCode.apply(null, new Uint8Array(bytes)));
  } catch (e) { }
  list.unshift({ name, time: Date.now(), data: b64 });
  if (list.length > 10) list.length = 10;
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch (e) { }
}
function openRecent(idx) {
  const list = getRecent();
  const r = list[idx];
  if (!r || !r.data) { messageDialog('该记录没有缓存文件内容。', '最近歌曲'); return; }
  const bin = atob(r.data);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  loadNBSToEditor(arr.buffer, r.name);
}
