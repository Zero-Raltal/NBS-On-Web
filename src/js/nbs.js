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
  /* .nbs 里的字符串是「4 字节小端长度 + UTF-8 字节」。 */
  str() {
    const len = this.int();
    if (len < 0 || this.p + len > this.buf.byteLength) throw new Error('字符串长度越界: ' + len);
    const bytes = new Uint8Array(this.buf, this.p, len);
    this.p += len;
    return new TextDecoder('utf-8').decode(bytes);
  }
  /* 【.nbp 片段里的字符串是 null 结尾，没有长度前缀】
     GameMaker 的 buffer_write_string() 写的是一串字节加一个 0x00 终止符，
     pattern_export.gml 用的正是它（`buffer_write_string(try_decompress_selection(...))`）。
     之前 readPattern 复用了 .nbs 的 str()（4 字节长度前缀），于是把选区代码的
     第一个字符 '0'（0x30）连同后面的 `|0|` 当成 int32 长度：
     0x7C307C30 = 2083552304 → new Uint8Array 直接抛
     「Invalid typed array length: 2083552304」。
     这就是「导入片段失败」的真正原因。 */
  cstr() {
    let end = this.p;
    while (end < this.buf.byteLength && this.d.getUint8(end) !== 0) end++;
    const bytes = new Uint8Array(this.buf, this.p, end - this.p);
    this.p = (end < this.buf.byteLength) ? end + 1 : end;   // 跳过终止符
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
  /* .nbs 风格：4 字节长度 + UTF-8 */
  str(s) {
    const enc = new TextEncoder().encode(s == null ? '' : String(s));
    this.int(enc.length);
    for (const b of enc) this.a.push(b);
  }
  /* .nbp 风格：UTF-8 + null 终止符（对应 buffer_write_string） */
  cstr(s) {
    const enc = new TextEncoder().encode(s == null ? '' : String(s));
    for (const b of enc) this.a.push(b);
    this.a.push(0);
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
    /* 【旧格式（v0）：绝不能把指针拨回 0】
      对照 open_song_nbs.gml:7-38：
        byte1 = buffer_read_byte()
        byte2 = buffer_read_byte()
        if (byte1 = 0 && byte2 = 0) { …新格式… }
        else { song_nbs_version = 0 … }      ← 不做任何回溯
        hei = buffer_read_short()
      旧格式的头两个字节【就是歌曲长度这个 short 的高低位】，已经被上面消费掉了，
      所以此刻指针正好停在「层数」前面，紧接着的 r.short() 读到的才是真正的层数。
      之前这里写了 `r.p = 0` 把指针拨回文件开头，于是 r.short() 读到的又是歌曲长度，
      后面的层数、歌名、速度等字段整体错位，整首 v0 文件被解析成乱码或直接 EOF。 */
    nbsVer = 0;
    firstCustom = 0;
    customIndexDiff = 0;
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
  /* 【必须从 layerlock == 2 重建 solostr —— 对照 open_song_nbs.gml:151-154】
     原版读到 layerlock[b] == 2 时会 `solostr += "|" + string(b) + "|"`。
     我们之前只把 lock 存进 S.layerlock，完全不重建 solostr，
     于是打开一首带独奏的 .nbs 后，所有层一起发声（solostr 为空 = 不做独奏过滤），
     而原版只发独奏层。保存方向是好的（buildNBS 写了 layerlock，
     原版读回来会重建 solostr），所以这是「能存不能读」的单向不一致。 */
  S.solostr = '';
  for (let i = 0; i < parsed.layers.length; i++) {
    S.layername[i] = parsed.layers[i].name;
    S.layerlock[i] = parsed.layers[i].lock;
    S.layervol[i] = parsed.layers[i].vol;
    S.layerstereo[i] = parsed.layers[i].stereo;
    rowamount[i] = 0;
    if (S.layerlock[i] === 2) S.solostr += '|' + i + '|';
  }
  S.endb2 = Math.max(1, parsed.layers.length);
  /* 对照 open_song_nbs.gml:160：只要读到的层里有音量不是 100 的，
     就自动打开「显示每层音量」，否则用户会看不见这些层音量（虽然播放时仍生效）。 */
  for (let i = 0; i < parsed.layers.length; i++) {
    if (parsed.layers[i].vol < 100) S.realvolume = 1;
  }
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
  /* 对照 save_song.gml:28-39：
       if nbsver >= 1 {
           buffer_write_short(0)          // 前两个 0，标识「新格式」
           buffer_write_byte(nbsver)
           buffer_write_byte(first_custom_index)
       }
       if nbsver = 0 || nbsver >= 3 {
           buffer_write_short(enda)      // 歌曲长度
       }
     也就是说：
       · v0 文件【没有】00 00 头，直接从歌曲长度（short）开始，然后才是层数；
       · 只有 v1/v2 会跳过歌曲长度（头里没有这个字段）；
       · v3 及以上既写 00 00 头、又写歌曲长度。
     之前无论版本都写 short(0)+byte(version)+byte(first_custom_index)，
     且只在 version >= 3 时写歌曲长度 —— 于是导出的 v0 是「新格式头 + 版本 0 +
     缺歌曲长度」的混合体，按经典 v0 规范读的工具会把头两个 0 当成层数 0。 */
  if (version >= 1) {
    w.short(0);
    w.byte(version);
    w.byte(S.first_custom_index);
  }
  if (version === 0 || version >= 3) {
    w.short(S.enda);
  }
  /* 层数直接写 S.endb2（对照 save_song.gml:42 的 buffer_write_short(endb2)）。
     之前用 Math.max(1, …) 强行兜底，空歌曲会被写成 1 个空层，
     与原版产物差 1 层。 */
  w.short(S.endb2);
  w.str(S.song_name); w.str(S.song_author); w.str(S.song_orauthor); w.str(S.song_desc);
  w.short(Math.round(S.tempo * 100));
  /* 对照 save_song.gml:50-53：这两个字段虽然已废弃，但原版仍写歌曲上的真实值
     （注释说明是为了兼容旧版的自动保存行为）。之前写死 0 / 10，
     保存后再用旧版 NBS 打开，自动保存配置会被重置。 */
  w.byte(S.autosave || 0); w.byte(S.autosavemins === undefined ? 10 : S.autosavemins); w.byte(S.timesignature);
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
  // 注意用 cstr（null 结尾），不是 str（长度前缀）——见 ByteReader.cstr 的注释
  w.cstr(tryDecompressSelection(SEL.code));
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
  // .nbp 的字符串是 null 结尾（buffer_write_string），不是 .nbs 的 4 字节长度前缀
  const code = r.cstr();
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

/* 选择本地文件并读成 ArrayBuffer。
   【为什么不再设置 input.accept】
   原来每个调用点都传一串扩展名（'.nbs,.mid,.midi,.nbp' 之类），
   accept 会让文件选择器按扩展名/ MIME 【强过滤】：
     · .nbs / .nbp / .cbnd 都是自定义后缀，没有注册的 MIME 类型；
     · Safari（含 iOS）、部分 Android WebView 以及一些国产浏览器的内核，
       对未知扩展名的处理不一致 —— 有的直接把这些文件灰掉、选不中，
       有的把过滤规则整个忽略掉，还有的只认 ".*" 这种写法。
   结果就是用户明明有这个文件，却在选择框里看不到 / 点不动，
   表现为「无法导入 nbs / cbnd」，而且换台机器又好了，极难排查。
   所以统一不设 accept，让选择器显示所有文件，类型判断完全交给
   JavaScript（按后缀分发，见下面的 dispatchFile / openFileObject）。
   代价是用户可能选到不支持的文件 —— 那种情况会走到默认分支给出明确提示，
   比"文件根本选不中"好得多。

   参数 accept 保留是为了兼容既有调用点的签名，但已不再生效。
   如果将来要支持拖拽之外的过滤，请用 dispatchFile 的后缀白名单，
   不要依赖浏览器的 accept。 */
function pickFile(accept, cb) {
  const inp = document.createElement('input');
  inp.type = 'file';
  /* 显式清空。某些浏览器会沿用上一次 input 的设置，这里写死更保险。 */
  inp.accept = '';
  inp.onchange = () => {
    const f = inp.files && inp.files[0];
    if (f) f.arrayBuffer().then(ab => cb(ab, f.name));
  };
  inp.click();
}

/* 从文件名取小写扩展名（不含点）。'a.b.NBS' -> 'nbs'，无扩展名 -> '' */
function fileExt(name) {
  const m = /\.([^./\\]+)$/.exec(String(name || ''));
  return m ? m[1].toLowerCase() : '';
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
  /* 不再传 accept 白名单，也不再在这里写自己的 if/else 分发 ——
     统一交给 dispatchFile()（main.js），它按后缀判断类型，
     与拖拽打开、问候窗口的「打开本地文件…」走同一条路径。
     这样三种打开方式对同一份文件的行为必然一致。 */
  const doOpen = () => pickFile('', (ab, name) => {
    dispatchFile(ab, name).then(ok => {
      if (!ok) {
        messageDialog('不支持的文件类型：' + (fileExt(name) || '（无扩展名）')
          + '\n\n支持：.nbs .nbp .mid .midi .cbnd .txt .mcfunction', '错误');
      }
    }).catch(e => messageDialog('打开失败：' + e.message, '错误'));
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
