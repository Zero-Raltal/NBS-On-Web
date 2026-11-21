/* =========================================================================
   selection.js — 选区（对应 GML 的 selection_* 系列）
   注意 NBS 的选区是「悬浮」的：选中时方块会从歌曲中被抬起放进选区缓冲区，
   放置/删除时才落回或销毁。
   ========================================================================= */
'use strict';

const SEL_CAP = 512;      // 每列的层容量（竖直方向）
const SEL_COLS0 = 1024;   // 初始列容量（水平方向），可按需翻倍扩容

/* 【选区缓冲区的列容量必须能增长】
   sidx(x, y) = x * SEL_CAP + y —— 也就是说列的容量完全由数组长度除以 SEL_CAP 决定。
   原来这里固定成 1024 列，于是任何超过 1024 列的选区/拷贝，下标一越过
   1024 * SEL_CAP 就写到了 TypedArray 之外：JS 的 TypedArray 对越界写入
   是【静默丢弃】的，不报错也不扩容。
   表现出来就是用户报的：「歌曲长度超过 1024 tick，按一下 Ctrl+A，
   超过 1024 tick 后面的部分就都被截断」—— 后面的方块根本没被搬进选区，
   而选区的「抬起」过程已经把源方块删掉了，所以它们直接消失了。
   现在改成按需扩容：selectionEnsureCols() 在写入前把容量翻倍到够用为止。 */
const SEL = {
  x: 0, y: 0, l: 0, h: 0,
  code: '',
  exists: new Uint8Array(SEL_COLS0 * SEL_CAP),
  ins: new Uint16Array(SEL_COLS0 * SEL_CAP),
  key: new Uint8Array(SEL_COLS0 * SEL_CAP),
  vel: new Uint8Array(SEL_COLS0 * SEL_CAP),
  pan: new Uint8Array(SEL_COLS0 * SEL_CAP),
  pit: new Int16Array(SEL_COLS0 * SEL_CAP),
  played: new Float64Array(SEL_COLS0 * SEL_CAP),
  colfirst: new Int32Array(4096).fill(-1),
  collast: new Int32Array(4096).fill(-1),
  capW: SEL_COLS0,          // 当前列容量（= 数组长度 / SEL_CAP）
};

/* 确保选区缓冲区至少能容纳 cols 列。只在扩容时复制，平时零开销。 */
function selectionEnsureCols(cols) {
  if (cols <= SEL.capW) return;
  let cap = SEL.capW;
  while (cap < cols) cap *= 2;
  const n = cap * SEL_CAP;
  const grow = (Ctor, old) => { const a = new Ctor(n); a.set(old); return a; };
  SEL.exists = grow(Uint8Array, SEL.exists);
  SEL.ins = grow(Uint16Array, SEL.ins);
  SEL.key = grow(Uint8Array, SEL.key);
  SEL.vel = grow(Uint8Array, SEL.vel);
  SEL.pan = grow(Uint8Array, SEL.pan);
  SEL.pit = grow(Int16Array, SEL.pit);
  SEL.played = grow(Float64Array, SEL.played);
  SEL.capW = cap;
}

/* GML 的数组下标会自动向下取整（array[1.7] 就是 array[1]），JS 的 TypedArray
   则会把小数下标悄悄忽略掉——写入变成空操作、读取返回 undefined，而且不报错。
   S.starta / S.startb 在播放跟随滚动时是小数（见 drawEditor 里 note_offset 的注释），
   粘贴、框选等操作会把这两个值直接传给选区坐标，所以这里必须自己 floor。
   否则「滚动到半格时粘贴片段」会得到空选区，音符全部丢失。 */
function sidx(x, y) { return floor(x) * SEL_CAP + floor(y); }

function selectionReset() {
  SEL.exists.fill(0); SEL.ins.fill(0); SEL.key.fill(0);
  SEL.vel.fill(0); SEL.pan.fill(0); SEL.pit.fill(0);
  SEL.colfirst.fill(-1); SEL.collast.fill(-1);
  SEL.x = 0; SEL.y = 0; SEL.l = 0; SEL.h = 0; SEL.code = '';
  S.selected = 0;
}

/* 扩容。除了 colfirst/collast 这两张"每列有没有内容"的索引，
   还必须一起扩【主缓冲区】（exists/ins/key/vel/pan/pit/played）——
   之前只扩了前者，主缓冲区仍是固定的 1024 列，
   于是超过 1024 列的选区在写入时越界、被 TypedArray 静默丢弃（见上方注释）。 */
function selectionExtendLength(n) {
  if (n === undefined) n = S.enda;
  if (n >= SEL.colfirst.length) {
    let cap = SEL.colfirst.length;
    while (cap <= n) cap *= 2;
    const nf = new Int32Array(cap).fill(-1), nl = new Int32Array(cap).fill(-1);
    nf.set(SEL.colfirst); nl.set(SEL.collast);
    SEL.colfirst = nf; SEL.collast = nl;
  }
  selectionEnsureCols(n + 1);
}
function selectionExtendHeight(n) { /* 固定行容量，无需扩容 */ }

/* 对照 GML selection_expand_layers()：选区贴到歌曲底部以外时，把层信息补齐，
   否则那些行的 layername / layerlock / layervol / layerstereo 还是空的，
   播放或拖动后会读到 undefined。 */
function selectionExpandLayersSafe() {
  const need = SEL.y + SEL.h;
  if (need - 1 >= S.endb2) {
    for (let i = S.endb2; i < need; i++) {
      S.layername[i] = '';
      S.layerlock[i] = 0;
      S.layervol[i] = 100;
      S.layerstereo[i] = 100;
      rowamount[i] = 0;
      S.endb2 = i + 1;
    }
  }
}

/* ---------------------------------------------------------------- 序列化 */
function selectionCodeUpdate() {
  if (!S.selected) { SEL.code = ''; return; }
  let out = '', ca = 0;
  for (let a = 0; a < SEL.l; a++) {
    if (SEL.colfirst[a] > -1) {
      out += ca + '|';
      ca = 0;
      let cb = 0;
      for (let b = 0; b < SEL.h; b++) {
        if (SEL.exists[sidx(a, b)]) {
          const i = sidx(a, b);
          out += cb + '|' + SEL.ins[i] + '|' + SEL.key[i] + '|' + SEL.vel[i] + '|' + SEL.pan[i] + '|' + SEL.pit[i] + '|';
          cb = 0;
        }
        cb++;
      }
      out += '-1|';
    }
    ca++;
  }
  SEL.code = out;
}

/* ============================================================================
 * 选区代码的压缩 / 解压 —— 对照 try_compress_selection.gml / try_decompress_selection.gml
 *
 * 【原版怎么做】
 *   try_compress_selection（gml:1-27）：
 *       str_len < 16 → 原样返回
 *       否则 buffer_compress（zlib）→ buffer_base64_encode，
 *       只有【压缩结果比原文短】才采用，否则仍返回原文。
 *   try_decompress_selection（gml:1-25）：
 *       含 "|" → 说明是明文，原样返回
 *       不含 "|" → 当作 base64 的 zlib 流，解压后返回
 *
 * 【为什么必须补】
 *   我们之前这两个函数是恒等占位。后果是单向不兼容：
 *   · 原版导出的 .nbp 片段、以及 .nbs 里存的选区，都是 base64 压缩串；
 *     我们用 split('|') 去解析它 —— 里面一个 "|" 都没有，
 *     整段解析失败 → 导入空选区。
 *   · 反过来我们导出明文时，原版 try_decompress_selection 见到 "|"
 *     会原样返回，所以那个方向能读。
 *   因此【只需要实现解压】就能补上兼容性；导出继续写明文即可
 *   （pattern_export.gml:23 本身也是 try_decompress_selection 后写明文）。
 *
 * 【为什么用 zlib 而不是别的】
 *   GameMaker 的 buffer_compress 产出的是标准 zlib 流（RFC1950，带 0x78 头、
 *   Adler-32 尾）。浏览器原生没有同步的 zlib 解压 API
 *   （CompressionStream 是异步的，而这条调用链是同步的），
 *   所以这里内置一个纯 JS 的 inflate（RFC1951）。
 * ========================================================================== */

/* 构造 Huffman 解码表（与 puff 的做法一致，最多 15 位码长）。 */
function _zipBuildHuff(lengths, n) {
  const MAXBITS = 15;
  const count = new Int32Array(MAXBITS + 1);
  for (let i = 0; i < n; i++) count[lengths[i]]++;
  count[0] = 0;
  const offs = new Int32Array(MAXBITS + 2);
  for (let i = 1; i <= MAXBITS; i++) offs[i] = offs[i - 1] + count[i - 1];
  const symbol = new Int32Array(n);
  for (let i = 0; i < n; i++) if (lengths[i]) symbol[offs[lengths[i]]++] = i;
  return { count, symbol };
}

const _ZIP_LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const _ZIP_LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const _ZIP_DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const _ZIP_DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const _ZIP_CLORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

/* zlib 流 → 原始字节。任何异常/格式不符都返回 null（调用方回退到原文）。 */
function zlibInflate(data) {
  if (!data || data.length < 6) return null;
  let pos = 0;
  const cmf = data[pos++], flg = data[pos++];
  if ((cmf & 0x0f) !== 8) return null;              // 必须 deflate
  if ((cmf >> 4) > 7) return null;                  // 窗口大小上限
  if (((cmf << 8) | flg) % 31 !== 0) return null;   // 头校验
  if (flg & 0x20) return null;                      // 不支持预置字典

  let bitbuf = 0, bitcnt = 0;
  const getBit = () => {
    if (bitcnt === 0) {
      if (pos >= data.length) throw new Error('EOF');
      bitbuf = data[pos++];
      bitcnt = 8;
    }
    const b = bitbuf & 1;
    bitbuf >>= 1;
    bitcnt--;
    return b;
  };
  const getBits = (n) => { let v = 0; for (let i = 0; i < n; i++) v |= getBit() << i; return v; };
  const decode = (h) => {
    let code = 0, first = 0, index = 0;
    for (let len = 1; len <= 15; len++) {
      code |= getBit();
      const cnt = h.count[len];
      if (code - first < cnt) return h.symbol[index + (code - first)];
      index += cnt;
      first = (first + cnt) << 1;
      code <<= 1;
    }
    return -1;
  };

  const out = [];
  let fixedLit = null, fixedDist = null;

  function inflateBlock(litHuff, distHuff) {
    while (true) {
      const sym = decode(litHuff);
      if (sym < 0) return -1;
      if (sym < 256) { out.push(sym); }
      else if (sym === 256) return 0;
      else {
        const li = sym - 257;
        if (li >= _ZIP_LBASE.length) return -1;
        const len = _ZIP_LBASE[li] + getBits(_ZIP_LEXT[li]);
        const ds = decode(distHuff);
        if (ds < 0 || ds >= _ZIP_DBASE.length) return -1;
        const dist = _ZIP_DBASE[ds] + getBits(_ZIP_DEXT[ds]);
        if (dist > out.length) return -1;
        const start = out.length - dist;
        for (let i = 0; i < len; i++) out.push(out[start + i]);
      }
    }
  }

  try {
    let last = 0;
    while (!last) {
      last = getBit();
      const type = getBits(2);
      if (type === 0) {
        // stored：对齐到字节边界后直接拷贝
        bitbuf = 0; bitcnt = 0;
        if (pos + 4 > data.length) return null;
        const len = data[pos] | (data[pos + 1] << 8);
        const nlen = data[pos + 2] | (data[pos + 3] << 8);
        pos += 4;
        if ((len ^ 0xffff) !== nlen) return null;
        for (let i = 0; i < len; i++) out.push(data[pos++]);
      } else if (type === 1) {
        // 固定 Huffman 表
        if (!fixedLit) {
          const l = new Uint8Array(288);
          for (let i = 0; i < 144; i++) l[i] = 8;
          for (let i = 144; i < 256; i++) l[i] = 9;
          for (let i = 256; i < 280; i++) l[i] = 7;
          for (let i = 280; i < 288; i++) l[i] = 8;
          fixedLit = _zipBuildHuff(l, 288);
          fixedDist = _zipBuildHuff(new Uint8Array(30).fill(5), 30);
        }
        if (inflateBlock(fixedLit, fixedDist) < 0) return null;
      } else if (type === 2) {
        // 动态 Huffman 表
        const hlit = getBits(5) + 257;
        const hdist = getBits(5) + 1;
        const hclen = getBits(4) + 4;
        const clLens = new Uint8Array(19);
        for (let i = 0; i < hclen; i++) clLens[_ZIP_CLORDER[i]] = getBits(3);
        const clHuff = _zipBuildHuff(clLens, 19);
        const lens = new Uint8Array(hlit + hdist);
        let idx = 0;
        while (idx < hlit + hdist) {
          const sym = decode(clHuff);
          if (sym < 0) return null;
          if (sym < 16) { lens[idx++] = sym; }
          else if (sym === 16) {
            if (idx === 0) return null;
            const prev = lens[idx - 1];
            const rep = 3 + getBits(2);
            for (let i = 0; i < rep && idx < lens.length; i++) lens[idx++] = prev;
          } else if (sym === 17) {
            const rep = 3 + getBits(3);
            for (let i = 0; i < rep && idx < lens.length; i++) lens[idx++] = 0;
          } else {
            const rep = 11 + getBits(7);
            for (let i = 0; i < rep && idx < lens.length; i++) lens[idx++] = 0;
          }
        }
        const litHuff = _zipBuildHuff(lens.subarray(0, hlit), hlit);
        const distHuff = _zipBuildHuff(lens.subarray(hlit), hdist);
        if (inflateBlock(litHuff, distHuff) < 0) return null;
      } else {
        return null;   // type 3 非法
      }
    }
  } catch (e) {
    return null;
  }
  return Uint8Array.from(out);
}

/* base64 → 字节。atob 只接受标准 base64，这里补上 URL-safe 变体与填充。 */
function _b64ToBytes(s) {
  let t = String(s).replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
  while (t.length % 4) t += '=';
  const bin = atob(t);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* 对照 try_compress_selection.gml。
   导出方向【故意只返回原文】：
   · 原版 pattern_export.gml:23 写文件前也要 try_decompress_selection 成明文；
   · 我们的明文能被原版正常读取（它见到 "|" 就原样返回）；
   · 反过来若这里做压缩，就必须同时保证 .nbs 内部各处读回也解压，
     收益只是体积，风险是又引入一条双向兼容路径。
   保持明文 = 与「导出即可互读」这个目标一致，且代码里已注明。 */
function tryCompressSelection(s) { return s || ''; }

/* 对照 try_decompress_selection.gml:1-25 */
function tryDecompressSelection(s) {
  s = s || '';
  if (s === '') return s;
  /* 含 "|" 就是明文（base64 字母表里没有 "|"，所以这个判据是可靠的，
     与原版 gml:9-10 完全一致） */
  if (s.indexOf('|') >= 0) return s;
  try {
    const raw = zlibInflate(_b64ToBytes(s));
    if (!raw || !raw.length) return s;
    /* 解出来的必须是 ASCII 明文，否则说明这不是选区串，回退原文 */
    let str = '';
    const CH = 8192;
    for (let i = 0; i < raw.length; i += CH) {
      str += String.fromCharCode.apply(null, raw.subarray(i, Math.min(i + CH, raw.length)));
    }
    return str.indexOf('|') >= 0 ? str : s;
  } catch (e) {
    return s;
  }
}

// 把 code 解析成块列表（用于粘贴 / 快照）
// 编码格式见 selectionCodeUpdate() / GML selection_code_update()：
//   <列增量>| 然后每个音符 <行增量>|<音色>|<音高>|<力度>|<声像>|<音分>| … 最后 -1|
// 注意这里是「增量」编码：写端在命中一个音符后会把 cb 归零、再在循环末尾 +1，
// 也就是说增量里已经含了那一步进。所以读端只管 cb += 增量，千万不能再 cb++
// （GML 的 selection_load() 就是没有这句）。多加一次会让每行间距翻倍，
// 片段贴回来时音高成 0,2,4,6… 排列、高度算成两倍，也就是「导入片段不对」。
function selectionParseCode(code) {
  const blocks = [];
  if (!code) return blocks;
  const parts = code.split('|');
  let i = 0, ca = 0, maxa = 0, maxb = 0;
  while (i < parts.length) {
    let v = parseFloat(parts[i++]);
    if (isNaN(v)) break;
    ca += v;
    let cb = 0;
    while (i < parts.length) {
      v = parseFloat(parts[i++]);
      if (isNaN(v)) break;
      if (v === -1) break;
      cb += v;
      const ins = parseFloat(parts[i++]), key = parseFloat(parts[i++]),
        vel = parseFloat(parts[i++]), pan = parseFloat(parts[i++]), pit = parseFloat(parts[i++]);
      blocks.push({ x: ca, y: cb, ins, key, vel, pan, pit });
      maxa = Math.max(maxa, ca); maxb = Math.max(maxb, cb);
    }
  }
  return blocks;
}

/* ---------------------------------------------------------------- 快照（撤销） */
function snapshotSelection() {
  return { x: SEL.x, y: SEL.y, l: SEL.l, h: SEL.h, selected: S.selected, code: SEL.code };
}
function restoreSelection(sn) {
  selectionReset();
  if (!sn.code) return;
  const blocks = selectionParseCode(sn.code);
  SEL.x = floor(sn.x); SEL.y = floor(sn.y); SEL.l = sn.l; SEL.h = sn.h;
  selectionExtendLength(sn.l + 2);
  for (const b of blocks) {
    const i = sidx(b.x, b.y);
    SEL.exists[i] = 1; SEL.ins[i] = b.ins; SEL.key[i] = b.key;
    SEL.vel[i] = b.vel; SEL.pan[i] = b.pan; SEL.pit[i] = b.pit;
    if (SEL.colfirst[b.x] === -1) SEL.colfirst[b.x] = b.y;
    SEL.collast[b.x] = Math.max(SEL.collast[b.x], b.y);
  }
  S.selected = blocks.length;
  SEL.code = sn.code;
}
function snapshotRegion(x1, y1, x2, y2) {
  const out = [];
  x1 = Math.max(0, x1); y1 = Math.max(0, y1);
  x2 = Math.min(x2, S.arraylength); y2 = Math.min(y2, S.arrayheight);
  for (let a = x1; a < x2; a++) {
    for (let b = y1; b < y2; b++) {
      if (gExists(a, b)) out.push({ x: a, y: b, ins: gIns(a, b), key: gKey(a, b), vel: gVel(a, b), pan: gPan(a, b), pit: gPit(a, b) });
    }
  }
  return { x1, y1, x2, y2, blocks: out };
}
function restoreRegion(snap) {
  for (let a = snap.x1; a < snap.x2; a++)
    for (let b = snap.y1; b < snap.y2; b++)
      if (gExists(a, b)) removeBlockSelect(a, b);
  for (const b of snap.blocks) addBlock(b.x, b.y, b.ins, b.key, b.vel, b.pan, b.pit, false);
}

/* ---------------------------------------------------------------- 加入选区 */
function lockedLayerOf(b) {
  if (S.solostr !== '') {
    if (S.solostr.indexOf('|' + b + '|') < 0) return 1;
    return S.layerlock[b] === 1 ? 1 : 0;
  } else if (b < S.endb2) {
    return S.layerlock[b] === 1 ? 1 : 0;
  }
  return 0;
}

function selectionAdd(x1, y1, x2, y2, copy, includelocked) {
  let ax1 = Math.min(x1, x2), ay1 = Math.min(y1, y2);
  let ax2 = Math.max(x1, x2), ay2 = Math.max(y1, y2);
  ax1 = Math.max(0, ax1); ay1 = Math.max(0, ay1);
  ax2 = median(0, ax2, S.enda) + 1;
  ay2 = median(0, ay2, S.endb) + 1;
  if (ax1 > S.enda || ay1 > S.endb) return 0;

  for (let b = 0; b <= S.endb; b++) S.lockedlayer[b] = lockedLayerOf(b);

  let nx1 = ax2, ny1 = ay2, nx2 = 0, ny2 = 0, ac = 0;
  for (let a = ax1; a < ax2; a++) {
    for (let b = ay1; b < ay2; b++) {
      if (S.lockedlayer[b] === 0 || includelocked) {
        if (gExists(a, b)) {
          nx1 = Math.min(nx1, a); ny1 = Math.min(ny1, b);
          nx2 = Math.max(nx2, a); ny2 = Math.max(ny2, b);
          ac++;
        }
      }
    }
  }
  if (ac === 0) return 0;
  nx1 = Math.min(nx1, ax1); ny1 = Math.min(ny1, ay1);
  ax1 = nx1; ay1 = ny1; ax2 = nx2 + 1; ay2 = ny2 + 1;
  let al = ax2 - ax1, ah = ay2 - ay1;

  const before = { sel: snapshotSelection(), reg: snapshotRegion(0, 0, S.arraylength, S.arrayheight) };

  if (S.selected === 0) {
    SEL.x = ax1; SEL.y = ay1; SEL.l = al; SEL.h = ah;
  } else {
    // 扩展选区并把已有内容平移
    al = SEL.l + Math.max(0, SEL.x - ax1) + Math.max(0, ax2 - (SEL.x + SEL.l));
    ah = SEL.h + Math.max(0, SEL.y - ay1) + Math.max(0, ay2 - (SEL.y + SEL.h));
    if (ax1 < SEL.x || ay1 < SEL.y) {
      const temp = [];
      for (let a = 0; a < SEL.l; a++) {
        for (let b = 0; b < SEL.h; b++) {
          const i = sidx(a, b);
          if (SEL.exists[i]) { temp.push({ a, b, ins: SEL.ins[i], key: SEL.key[i], vel: SEL.vel[i], pan: SEL.pan[i], pit: SEL.pit[i] }); SEL.exists[i] = 0; }
        }
        SEL.colfirst[a] = -1; SEL.collast[a] = -1;
      }
      const dx = Math.max(0, SEL.x - ax1), dy = Math.max(0, SEL.y - ay1);
      for (const t of temp) {
        const i = sidx(t.a + dx, t.b + dy);
        SEL.exists[i] = 1; SEL.ins[i] = t.ins; SEL.key[i] = t.key;
        SEL.vel[i] = t.vel; SEL.pan[i] = t.pan; SEL.pit[i] = t.pit;
        if (SEL.colfirst[t.a + dx] === -1) SEL.colfirst[t.a + dx] = t.b + dy;
        SEL.collast[t.a + dx] = Math.max(SEL.collast[t.a + dx] || 0, t.b + dy);
      }
    }
    SEL.x = Math.min(SEL.x, ax1);
    SEL.y = Math.min(SEL.y, ay1);
    SEL.l = al; SEL.h = ah;
  }
  selectionExtendLength(SEL.l + 2);

  for (let a = ax1; a < ax2; a++) {
    if (colamount[a] > 0) {
      for (let b = Math.max(colfirst[a], ay1); b < Math.min(collast[a] + 1, ay2); b++) {
        if (S.lockedlayer[b] === 0 || includelocked) {
          if (gExists(a, b)) {
            const sa = a - SEL.x, sb = b - SEL.y, i = sidx(sa, sb);
            if (SEL.colfirst[sa] === -1) SEL.colfirst[sa] = sb;
            SEL.colfirst[sa] = Math.min(SEL.colfirst[sa], sb);
            SEL.collast[sa] = Math.max(SEL.collast[sa], sb);
            SEL.exists[i] = 1; SEL.ins[i] = gIns(a, b); SEL.key[i] = gKey(a, b);
            SEL.vel[i] = gVel(a, b); SEL.pan[i] = gPan(a, b); SEL.pit[i] = gPit(a, b);
            S.selected++;
            if (!copy) removeBlockSelect(a, b);
          }
        }
      }
    }
  }
  selectionCodeUpdate();
  if (!copy) {
    const after = { sel: snapshotSelection(), reg: snapshotRegion(0, 0, S.arraylength, S.arrayheight) };
    historyPush(() => { restoreSelection(before.sel); restoreRegion(before.reg); },
      () => { restoreSelection(after.sel); restoreRegion(after.reg); });
  }
  return 1;
}

/* ---------------------------------------------------------------- 移出选区 */
function addBlockSelect(x, y, ins, key, vel, pan, pit) {
  return addBlock(x, y, ins, key, vel, pan, pit, false);
}

function selectionRemove(x1, y1, x2, y2, all, undo) {
  let ax1, ay1, ax2, ay2, ac = 0;
  if (!all) {
    ax1 = Math.max(0, Math.min(x1, x2)); ay1 = Math.max(0, Math.min(y1, y2));
    ax2 = Math.max(0, Math.max(x1, x2)) + 1; ay2 = Math.max(0, Math.max(y1, y2)) + 1;
    if (S.selected === 0) return 0;
    for (let a = ax1; a < ax2; a++)
      for (let b = ay1; b < ay2; b++)
        if (a >= SEL.x && b >= SEL.y && a < SEL.x + SEL.l && b < SEL.y + SEL.h)
          if (SEL.exists[sidx(a - SEL.x, b - SEL.y)]) ac++;
    if (ac === 0) return 0;
  } else {
    ac = S.selected;
    ax1 = SEL.x; ay1 = SEL.y; ax2 = SEL.x + SEL.l; ay2 = SEL.y + SEL.h;
  }
  if (!undo) {
    const before = { sel: snapshotSelection(), reg: snapshotRegion(ax1, ay1, ax2, ay2) };
    const ret = selectionRemoveInner(ax1, ay1, ax2, ay2, ac, all);
    if (ret) {
      const after = { sel: snapshotSelection(), reg: snapshotRegion(ax1, ay1, ax2, ay2) };
      historyPush(() => { restoreSelection(before.sel); restoreRegion(before.reg); },
        () => { restoreSelection(after.sel); restoreRegion(after.reg); });
    }
    return ret;
  }
  return selectionRemoveInner(ax1, ay1, ax2, ay2, ac, all);
}

function selectionRemoveInner(ax1, ay1, ax2, ay2, ac, all) {
  if (ac === S.selected) {
    for (let a = 0; a < SEL.l; a++) {
      if (SEL.colfirst[a] > -1) {
        for (let b = SEL.colfirst[a]; b <= SEL.collast[a]; b++) {
          const i = sidx(a, b);
          if (SEL.exists[i]) {
            addBlockSelect(SEL.x + a, SEL.y + b, SEL.ins[i], SEL.key[i], SEL.vel[i], SEL.pan[i], SEL.pit[i]);
            SEL.exists[i] = 0; SEL.ins[i] = 0; SEL.key[i] = 0;
            SEL.vel[i] = 0; SEL.pan[i] = 0; SEL.pit[i] = 0;
          }
        }
        SEL.colfirst[a] = -1; SEL.collast[a] = -1;
      }
    }
    updateSongSize();
    S.selected = 0; SEL.code = '';
    SEL.x = 0; SEL.y = 0; SEL.l = 0; SEL.h = 0;
  } else {
    for (let a = ax1; a < ax2; a++) {
      for (let b = ay1; b < ay2; b++) {
        if (a >= SEL.x && b >= SEL.y && a < SEL.x + SEL.l && b < SEL.y + SEL.h) {
          const sa = a - SEL.x, sb = b - SEL.y, i = sidx(sa, sb);
          if (sb >= SEL.colfirst[sa] && sb <= SEL.collast[sa] && SEL.exists[i]) {
            addBlockSelect(a, b, SEL.ins[i], SEL.key[i], SEL.vel[i], SEL.pan[i], SEL.pit[i]);
            SEL.exists[i] = 0; SEL.ins[i] = 0; SEL.key[i] = 0;
            SEL.vel[i] = 0; SEL.pan[i] = 0; SEL.pit[i] = 0;
            S.selected--;
            if (SEL.colfirst[sa] === sb) {
              SEL.colfirst[sa] = -1;
              for (let c = sb; c < SEL.h; c++) if (SEL.exists[sidx(sa, c)]) { SEL.colfirst[sa] = c; break; }
            }
            if (SEL.collast[sa] === sb) {
              SEL.collast[sa] = -1;
              for (let c = sb; c >= 0; c--) if (SEL.exists[sidx(sa, c)]) { SEL.collast[sa] = c; break; }
            }
          }
        }
      }
    }
    selectionTrim();
    selectionCodeUpdate();
  }
  return 1;
}

function selectionPlace(undo) {
  if (S.selected === 0) return 0;
  return selectionRemove(0, 0, 0, 0, true, undo);
}

function selectionTrim() {
  let x1, x2, y1, y2;
  for (x1 = 0; x1 < SEL.l; x1++) if (SEL.colfirst[x1] > -1) break;
  for (x2 = SEL.l - 1; x2 >= 0; x2--) if (SEL.colfirst[x2] > -1) break;
  y1 = SEL.h;
  for (let a = 0; a < SEL.l; a++) if (SEL.colfirst[a] > -1) y1 = Math.min(SEL.colfirst[a], y1);
  y2 = 0;
  for (let a = 0; a < SEL.l; a++) if (SEL.collast[a] > -1) y2 = Math.max(SEL.collast[a], y2);
  x2++; y2++;
  if (x1 > 0 || y1 > 0) {
    const temp = [];
    for (let a = x1; a < x2; a++) {
      if (SEL.colfirst[a] > -1) {
        for (let b = SEL.colfirst[a]; b <= SEL.collast[a]; b++) {
          const i = sidx(a, b);
          if (SEL.exists[i]) {
            temp.push({ a: a - x1, b: b - y1, ins: SEL.ins[i], key: SEL.key[i], vel: SEL.vel[i], pan: SEL.pan[i], pit: SEL.pit[i] });
            SEL.exists[i] = 0;
          }
        }
      }
      SEL.colfirst[a] = -1; SEL.collast[a] = -1;
    }
    SEL.colfirst.fill(-1);
    SEL.collast.fill(-1);
    for (const t of temp) {
      const i = sidx(t.a, t.b);
      SEL.exists[i] = 1; SEL.ins[i] = t.ins; SEL.key[i] = t.key;
      SEL.vel[i] = t.vel; SEL.pan[i] = t.pan; SEL.pit[i] = t.pit;
      if (SEL.colfirst[t.a] === -1) SEL.colfirst[t.a] = t.b;
      SEL.collast[t.a] = Math.max(SEL.collast[t.a], t.b);
    }
  }
  SEL.x += x1; SEL.y += y1;
  SEL.l = x2 - x1; SEL.h = y2 - y1;
}

function selectionDelete(undo) {
  if (S.selected === 0) return 0;
  const before = { sel: snapshotSelection(), reg: snapshotRegion(SEL.x, SEL.y, SEL.x + SEL.l, SEL.y + SEL.h) };
  for (let a = 0; a < SEL.l; a++) {
    if (SEL.colfirst[a] > -1) {
      for (let b = SEL.colfirst[a]; b <= SEL.collast[a]; b++) {
        const i = sidx(a, b);
        if (SEL.exists[i]) {
          SEL.exists[i] = 0; SEL.ins[i] = 0; SEL.key[i] = 0; SEL.vel[i] = 0; SEL.pan[i] = 0; SEL.pit[i] = 0;
          if (S.theme === 3 && S.remove_effect) pushRemoveEffect(SEL.x + a - S.starta, SEL.y + b - S.startb);
        }
      }
      SEL.colfirst[a] = -1; SEL.collast[a] = -1;
    }
  }
  S.selected = 0; SEL.code = '';
  SEL.x = 0; SEL.y = 0; SEL.l = 0; SEL.h = 0;
  updateSongSize();
  S.changed = 1;
  if (!undo) {
    const after = { sel: snapshotSelection(), reg: snapshotRegion(before.reg.x1, before.reg.y1, before.reg.x2, before.reg.y2) };
    historyPush(() => { restoreSelection(before.sel); restoreRegion(before.reg); },
      () => { restoreSelection(after.sel); restoreRegion(after.reg); });
  }
  return 1;
}

/* ---------------------------------------------------------------- 绘制 */
/* 判断鼠标是否落在选区内某个方块上；命中则返回该方块在选区内的相对列/行。
   对照 selection_draw.gml:55-73：只有 select=0、没在拖时间轴标记、没在播放、
   且鼠标正压在某个 existe 的选区方块上时，才允许「按住拖动整个选区」。 */
function selectionDragHitTest(xs, ys, w, h) {
  if (S.selected === 0) return null;
  if (S.select !== 0 || S.cursmarker || S.playing !== 0) return null;
  if (S.window !== 0) return null;
  const sta = Math.floor(S.starta), stb = Math.floor(S.startb);
  const noff = S.note_offset || 0;
  if (SEL.x > sta + w || SEL.y > stb + h || SEL.x + SEL.l <= sta || SEL.y + SEL.h <= stb) return null;
  for (let a = Math.max(sta, SEL.x); a < Math.min(sta + w, SEL.x + SEL.l); a++) {
    const sa = a - SEL.x;
    if (SEL.colfirst[sa] <= -1) continue;
    for (let b = Math.max(stb, SEL.y); b < Math.min(stb + h, SEL.y + SEL.h); b++) {
      const sb = b - SEL.y, i = sidx(sa, sb);
      if (sb < SEL.colfirst[sa] || sb > SEL.collast[sa] || !SEL.exists[i]) continue;
      if (mouseRectangle(xs + (a - sta) * 32 - noff, ys + (b - stb) * 32, 32, 32)) {
        return { sa, sb };
      }
    }
  }
  return null;
}

function selectionDraw(xs, ys, w, h) {
  // 播放选区内的音符
  if ((floor(S.marker_pos) !== floor(S.marker_prevpos) || (S.marker_prevpos === 0 && S.marker_pos !== S.marker_prevpos))
    && S.marker_pos >= SEL.x && S.marker_pos < SEL.x + SEL.l) {
    const xx = floor(S.marker_pos) - SEL.x;
    if (SEL.colfirst[xx] > -1) {
      for (let b = SEL.colfirst[xx]; b <= SEL.collast[xx]; b++) {
        const i = sidx(xx, b);
        if (SEL.exists[i]) playSelectionNote(xx, b, i);
      }
    }
  }
  const sta = Math.floor(S.starta), stb = Math.floor(S.startb);
  const noff = S.note_offset || 0;
  if (SEL.x > sta + w || SEL.y > stb + h || SEL.x + SEL.l <= sta || SEL.y + SEL.h <= stb) return;

  for (let a = Math.max(sta, SEL.x); a < Math.min(sta + w, SEL.x + SEL.l); a++) {
    const sa = a - SEL.x;
    if (SEL.colfirst[sa] > -1) {
      for (let b = Math.max(stb, SEL.y); b < Math.min(stb + h, SEL.y + SEL.h); b++) {
        const sb = b - SEL.y, i = sidx(sa, sb);
        if (sb >= SEL.colfirst[sa] && sb <= SEL.collast[sa] && SEL.exists[i]) {
          let salpha = 0.8;
          if (S.window < 1) {
            if (S.select === 2) {
              if (isInsideRect(a, b, S.select_pressa, S.select_pressb, S.selbx, S.selby)) salpha = 0.5;
            } else if (S.select === 0 && !S.cursmarker && S.playing === 0) {
              if (mouseRectangle(xs + (a - sta) * 32 - noff, ys + (b - stb) * 32, 32, 32)) {
                salpha = 0.7;
                G.cursor = 'move';
                if (G.mbp[0]) {
                  S.window = W_DRAGSELECTION;
                  S.select_pressa = sa;
                  S.select_pressb = sb;
                  S.selection_sx0 = SEL.x;
                  S.selection_sy0 = SEL.y;
                }
              }
            }
          } else if (S.window === W_DRAGSELECTION) {
            if (S.select_pressa === sa && S.select_pressb === sb) salpha = 0.7;
          }
          drawBlock(xs + (a - sta) * 32 - noff, ys + (b - stb) * 32, SEL.ins[i], SEL.key[i], SEL.pan[i], SEL.vel[i], SEL.pit[i], 1, salpha);
        }
      }
    }
  }
}
function isInsideRect(a, b, x1, y1, x2, y2) {
  return a >= Math.min(x1, x2) && a <= Math.max(x1, x2) && b >= Math.min(y1, y2) && b <= Math.max(y1, y2);
}
function playSelectionNote(xx, b, i) {
  let c = 1, d = 100, e = 0, a = 1;
  const layer = SEL.y + b;
  if (layer < S.endb2) {
    c = (S.layervol[layer] / 100) * SEL.vel[i];
    d = S.layerstereo[layer] === 100 ? SEL.pan[i] : (S.layerstereo[layer] + SEL.pan[i]) / 2;
    e = SEL.pit[i];
  }
  if (S.solostr !== '') {
    if (S.solostr.indexOf('|' + layer + '|') < 0) a = 0;
    else if (S.layerlock[layer] === 1) a = 0;
  } else if (layer < S.endb2) {
    if (S.layerlock[layer] === 1) a = 0;
  }
  if (a) {
    const ins = INSTRUMENTS[SEL.ins[i]];
    if (ins && ins.loaded) playSound(ins, SEL.key[i], c, d, e);
    if (ins && ins.name === 'Tempo Changer') S.tempo = floor(Math.abs(e)) / 15;
    if (ins && ins.press) S.key_played[SEL.key[i]] = G.time;
    SEL.played[i] = G.time;
  }
}

/* ---------------------------------------------------------------- 从 code 放置选区 */
function selectionLoad(x, y, code, undo) {
  /* 【必须先把"当前浮动的选区"放回歌曲 —— 对照 selection_load.gml:7-9】
       str = try_decompress_selection(argument2)
       selection_place(argument3)      ← 关键
       if (str = "") return 0
     原版在解析新片段之前，会先把手上那个浮动选区（被 selection_add 抬走、
     song_exists 已被清零的那些方块）放回 songs 里。
     我们之前直接 selectionReset()，只清空选区缓冲区、S.selected = 0，
     【没有把方块放回歌曲】—— 于是已有选区存在时，任何走 selectionLoad 的路径
     （粘贴、撤销/重做复原、pattern_import）都会让那些音符永久消失。
     这就是"选区还在但音符没了"的直接来源。 */
  const str = tryDecompressSelection(code);
  selectionPlace(undo);
  selectionReset();
  const blocks = selectionParseCode(str);
  if (!blocks.length) return 0;
  let maxA = 0, maxB = 0;
  SEL.x = floor(x); SEL.y = floor(y);
  /* 先按片段的最大列号扩容，再往里写。
     blocks 是另一首歌/剪贴板的内容，列号可能远超当前歌曲长度 ——
     不先扩容就会越界写入被静默丢弃（长歌曲粘贴/全选时后半段丢失）。 */
  for (const b of blocks) { if (b.x > maxA) maxA = b.x; if (b.y > maxB) maxB = b.y; }
  selectionExtendLength(maxA + 2);
  for (const b of blocks) {
    const i = sidx(b.x, b.y);
    SEL.exists[i] = 1; SEL.ins[i] = b.ins; SEL.key[i] = b.key;
    SEL.vel[i] = b.vel; SEL.pan[i] = b.pan; SEL.pit[i] = b.pit;
    if (SEL.colfirst[b.x] === -1) SEL.colfirst[b.x] = b.y;
    SEL.collast[b.x] = Math.max(SEL.collast[b.x], b.y);
    maxA = Math.max(maxA, b.x); maxB = Math.max(maxB, b.y);
  }
  S.selected = blocks.length;
  SEL.l = maxA + 1; SEL.h = maxB + 1;
  selectionCodeUpdate();
  selectionExpandLayersSafe();
  return 1;
}

// 放置并覆盖原位置上的方块
function selectionLoadExt(x, y, code) {
  const blocks = selectionParseCode(code);
  if (!blocks.length) return 0;
  // 传送进来的 x/y 可能是小数滚动位置，先取整，后面 gExists/removeBlockSelect 才能命中真实格子
  x = floor(x); y = floor(y);
  const before = { sel: snapshotSelection(), reg: snapshotRegion(0, 0, S.arraylength, S.arrayheight) };
  for (const b of blocks) {
    if (gExists(x + b.x, y + b.y)) removeBlockSelect(x + b.x, y + b.y);
  }
  selectionLoad(x, y, code);
  const after = { sel: snapshotSelection(), reg: snapshotRegion(0, 0, S.arraylength, S.arrayheight) };
  historyPush(() => { restoreSelection(before.sel); restoreRegion(before.reg); },
    () => { restoreSelection(after.sel); restoreRegion(after.reg); });
  return 1;
}

/* ---------------------------------------------------------------- 全选 / 反选 */
function selectAll(instIndex, not) {
  const x1 = SEL.x, y1 = SEL.y, str = SEL.code;
  if (S.selected > 0) selectionPlace(true);
  if (S.totalblocks === 0) return 0;
  if (instIndex > -1 && !not && INSTRUMENTS[instIndex] && INSTRUMENTS[instIndex].num_blocks === 0) return 0;

  // 关键：先把边界抓下来。循环里的 removeBlockSelect() 会在最后一列/行被搬空时
  // 把 S.enda / S.endb 往回缩（GML 的 remove_block_manual 也这么干），
  // 如果之后再读 S.enda 来算 selection_l，就会得到 1（甚至 0），
  // 于是「全选」只把第一列装进选区缓冲区、其余音符在选完立刻被丢弃 ——
  // 用户看到的就是「全选后音符块大部分消失，只在第 1 列留下几个」。
  const enda0 = S.enda, endb0 = S.endb;
  const before = { sel: snapshotSelection(), reg: snapshotRegion(0, 0, S.arraylength, S.arrayheight) };
  selectionExtendLength(enda0 + 2);
  /* 【无参调用 = 全选所有音色】
     对照 GML 的 select_all(inst_index, not)：它对所有列/行都走 `a = 1`，
     也就是"不看音色"。这里原来的条件写成了
         ((ins === instIndex || instIndex === -1) && !not) || (ins !== instIndex && not)
     无参调用时 instIndex / not 都是 undefined，两个分支都算成 false，
     于是【一个方块都选不上】—— 表现出来就是按 Ctrl+A 毫无反应、
     选区代码为空，导出片段得到空文件。这就是「超过 1024 tick 全选截断」
     和「导出片段为空」共同的直接原因。
     现在把"未指定音色"统一归一化成 instIndex === -1（即匹配全部）。 */
  const wantAll = (instIndex === undefined || instIndex === null || instIndex < 0) && !not;
  const matchIns = (ins) => (wantAll ? true : (!not ? ins === instIndex : ins !== instIndex));
  for (let a = 0; a <= enda0; a++) {
    if (colamount[a] > 0) {
      for (let b = colfirst[a]; b <= collast[a]; b++) {
        if (gExists(a, b)) {
          const ins = gIns(a, b);
          if (matchIns(ins)) {
            const i = sidx(a, b);
            SEL.exists[i] = 1; SEL.ins[i] = ins; SEL.key[i] = gKey(a, b);
            SEL.vel[i] = gVel(a, b); SEL.pan[i] = gPan(a, b); SEL.pit[i] = gPit(a, b);
            if (SEL.colfirst[a] === -1) SEL.colfirst[a] = b;
            SEL.collast[a] = Math.max(SEL.collast[a], b);
            S.selected++;
            removeBlockSelect(a, b);
          }
        }
      }
    }
  }
  /* 这里【不能】调 selectionTrim()。
     原因：循环里的 removeBlockSelect() 已经把方块从 grid 搬进选区缓冲区，
     colfirst/collast 随之被清成 -1；此时 selectionTrim() 会认为"选区里什么都没有"，
     把 SEL.l/h 缩成 1x1，接着 selectionCodeUpdate / 后续的 selectionRemove
     就只认得第一格 —— 表现为「按一次全选，方块几乎全没了」。
     全选的选区边界本来就是 [0,0,endb0]，不需要 trim。
     这一处与原版 GML 有意不同：GML 的 selection_exists 是按【绝对坐标】
     索引的二维数组，trim 读它不会丢；这里 sidx() 是相对索引，语义对不上。 */
  SEL.x = 0; SEL.y = 0; SEL.l = enda0 + 1; SEL.h = endb0 + 1;

  /* 把歌曲边界恢复到全选之前的值。
     removeBlockSelect() 在最后一列/行被搬空时会把 S.enda / S.endb 往回缩，
     这是它单独使用时的正确行为（GML 的 remove_block_select 同样这么做）；
     但在 selectAll 里，方块只是"进了选区"，并没有真的被删除，
     边界跟着缩下去会让后续逻辑以为歌曲变短了：
       · S.starta 在 handlePlayback 里被 median(0, marker-中心, S.enda) 夹到 0
         → 用户看到的就是「一按全选，预览位置跳回歌曲开头」；
       · 玩家把选区放回去时，末尾的列/层已经不在可视范围内。
     所以这里恢复到循环前的边界。 */
  S.enda = enda0; S.endb = endb0;
  selectionCodeUpdate();
  const after = { sel: snapshotSelection(), reg: snapshotRegion(0, 0, S.arraylength, S.arrayheight) };
  historyPush(() => { restoreSelection(before.sel); restoreRegion(before.reg); },
    () => { restoreSelection(after.sel); restoreRegion(after.reg); });
  return 1;
}

function selectionInvert() {
  if (S.selected === 0 && S.totalblocks === 0) return 0;
  if (S.selected > 0 && S.totalblocks === 0) { selectionPlace(false); return 0; }
  if (S.selected === 0) { selectAll(-1, false); return 0; }
  const before = { sel: snapshotSelection(), reg: snapshotRegion(0, 0, S.arraylength, S.arrayheight) };
  const xx = SEL.x, yy = SEL.y;
  const oldExists = new Map();
  for (let a = 0; a < SEL.l; a++)
    for (let b = 0; b < SEL.h; b++)
      if (SEL.exists[sidx(a, b)]) oldExists.set(a + ',' + b, 1);
  selectionPlace(true);
  for (let a = 0; a <= S.enda; a++) {
    if (colamount[a] > 0) {
      for (let b = colfirst[a]; b <= collast[a]; b++) {
        if (gExists(a, b)) {
          if (!oldExists.has((a - xx) + ',' + (b - yy))) {
            const i = sidx(a, b);
            SEL.exists[i] = 1; SEL.ins[i] = gIns(a, b); SEL.key[i] = gKey(a, b);
            SEL.vel[i] = gVel(a, b); SEL.pan[i] = gPan(a, b); SEL.pit[i] = gPit(a, b);
            if (SEL.colfirst[a] === -1) SEL.colfirst[a] = b;
            SEL.collast[a] = Math.max(SEL.collast[a], b);
            S.selected++;
            removeBlockSelect(a, b);
          }
        }
      }
    }
  }
  SEL.x = 0; SEL.y = 0; SEL.l = S.enda + 1; SEL.h = S.endb + 1;
  selectionTrim();
  selectionCodeUpdate();
  const after = { sel: snapshotSelection(), reg: snapshotRegion(0, 0, S.arraylength, S.arrayheight) };
  historyPush(() => { restoreSelection(before.sel); restoreRegion(before.reg); },
    () => { restoreSelection(after.sel); restoreRegion(after.reg); });
}

/* ---------------------------------------------------------------- 拉伸 / 压缩 */
function snapshotSelPair() {
  return { sel: snapshotSelection(), reg: snapshotRegion(0, 0, S.arraylength, S.arrayheight) };
}
function pushSelChange(before) {
  const after = snapshotSelPair();
  historyPush(() => { restoreSelection(before.sel); restoreRegion(before.reg); },
    () => { restoreSelection(after.sel); restoreRegion(after.reg); });
}

function selectionExpand() {
  if (S.selected === 0) return 0;
  const before = snapshotSelPair();
  const oldL = SEL.l, nw = oldL * 2;
  selectionExtendLength(nw + 2);
  const temp = [];
  for (let a = 0; a < oldL; a++) {
    for (let b = 0; b < SEL.h; b++) {
      const i = sidx(a, b);
      if (SEL.exists[i]) { temp.push({ a, b, ins: SEL.ins[i], key: SEL.key[i], vel: SEL.vel[i], pan: SEL.pan[i], pit: SEL.pit[i] }); SEL.exists[i] = 0; }
    }
    SEL.colfirst[a] = -1; SEL.collast[a] = -1;
  }
  SEL.colfirst.fill(-1); SEL.collast.fill(-1);
  for (const t of temp) {
    const na = t.a * 2, i = sidx(na, t.b);
    SEL.exists[i] = 1; SEL.ins[i] = t.ins; SEL.key[i] = t.key;
    SEL.vel[i] = t.vel; SEL.pan[i] = t.pan; SEL.pit[i] = t.pit;
    if (SEL.colfirst[na] === -1) SEL.colfirst[na] = t.b;
    SEL.collast[na] = Math.max(SEL.collast[na], t.b);
  }
  SEL.l = nw;
  selectionCodeUpdate();
  pushSelChange(before);
}

function selectionCompress() {
  if (S.selected === 0 || SEL.l === 1) return 0;
  const before = snapshotSelPair();
  const temp = new Map();
  let nw = 0, nh = 0;
  const tcf = new Int32Array(SEL.l + 4).fill(-1), tcl = new Int32Array(SEL.l + 4).fill(-1);
  for (let a = 0; a < SEL.l; a++) {
    if (SEL.colfirst[a] > -1) {
      for (let b = SEL.colfirst[a]; b <= SEL.collast[a]; b++) {
        const i = sidx(a, b);
        if (!SEL.exists[i]) continue;
        let na = a, nb = b;
        if (a !== 0) {
          na = floor(a / 2);
          while (nb <= tcl[na] && temp.has(na + ',' + nb)) nb++;
        }
        temp.set(na + ',' + nb, { ins: SEL.ins[i], key: SEL.key[i], vel: SEL.vel[i], pan: SEL.pan[i], pit: SEL.pit[i] });
        if (tcf[na] === -1) tcf[na] = nb; else tcf[na] = Math.min(tcf[na], nb);
        tcl[na] = Math.max(tcl[na], nb);
        nw = Math.max(nw, na); nh = Math.max(nh, nb);
        SEL.exists[i] = 0;
      }
    }
    SEL.colfirst[a] = -1; SEL.collast[a] = -1;
  }
  SEL.colfirst.fill(-1); SEL.collast.fill(-1);
  for (const [k, v] of temp) {
    const [a, b] = k.split(',').map(Number);
    const i = sidx(a, b);
    SEL.exists[i] = 1; SEL.ins[i] = v.ins; SEL.key[i] = v.key;
    SEL.vel[i] = v.vel; SEL.pan[i] = v.pan; SEL.pit[i] = v.pit;
  }
  for (let a = 0; a <= nw; a++) if (tcf[a] > -1) { SEL.colfirst[a] = tcf[a]; SEL.collast[a] = tcl[a]; }
  SEL.l = nw + 1; SEL.h = nh + 1;
  selectionCodeUpdate();
  pushSelChange(before);
}

/* 超出八度范围的音符移回范围内 */
function selectionTranspose() {
  if (S.selected === 0) return 0;
  const before = snapshotSelPair();
  let am = 0;
  for (let a = 0; a < SEL.l; a++) {
    if (SEL.colfirst[a] > -1) {
      for (let b = SEL.colfirst[a]; b <= SEL.collast[a]; b++) {
        const i = sidx(a, b);
        if (!SEL.exists[i]) continue;
        let key = SEL.key[i];
        if (key < 33 || key > 57) am++;
        while (key < 33) key += 12;
        while (key > 57) key -= 12;
        SEL.key[i] = key;
      }
    }
  }
  messageDialog(am + ' 个音符已被转换。', '转换音符');
  selectionCodeUpdate();
  pushSelChange(before);
}

/* 批量修改选区属性（宏用，统一入口，自带一步撤销） */
function selectionApply(fn) {
  if (S.selected === 0) return 0;
  const before = snapshotSelPair();
  for (let a = 0; a < SEL.l; a++) {
    if (SEL.colfirst[a] > -1) {
      for (let b = SEL.colfirst[a]; b <= SEL.collast[a]; b++) {
        const i = sidx(a, b);
        if (SEL.exists[i]) fn(SEL, i, a, b);
      }
    }
  }
  selectionCodeUpdate();
  pushSelChange(before);
  S.changed = 1;
  return 1;
}

/* 更改选区音色 */
function selectionChangeInstrument(insIndex) {
  return selectionApply((sel, i) => { sel.ins[i] = insIndex; });
}

/* ============================================================================
 * 选区属性批量修改（对照 selection_changekey / changevel / changepan / changepit
 * 以及对应的 selection_set*）
 *
 * 【为什么必须补齐这一组】
 * 原版 mode_action(num) 是按当前编辑模式去真正改动音符的：
 *      m_key 模式 → selection_changekey(12) / (-12) / (1) / (-1)
 *      m_vel 模式 → selection_changevel(10) / (-10) / ...
 *      m_pan 模式 → selection_changepan(10) / ...
 *      m_pit 模式 → selection_changepit(10) / ...
 * 之前的实现只写了 S.editmode = n - 1（切换模式），
 * 完全没有改音符，于是 Ctrl+E / Ctrl+D 和右键菜单里那些
 * "升八度 / 降八度 / 增加 10 音量…"点了都没反应 —— 菜单在说谎。
 *
 * 这些函数统一走 selectionApply，自带一步撤销。
 * 参数 delta 与原版一致：key/vel/pan/pit 的增量。
 * ========================================================================== */

/* 音高（半音，12 = 一个八度）。范围与画布上手动编辑一致：0..87 */
function selectionChangeKey(delta) {
  return selectionApply((sel, i) => {
    sel.key[i] = median(0, sel.key[i] + delta, 87);
  });
}

/* 音量 0..100 */
function selectionChangeVel(delta) {
  return selectionApply((sel, i) => {
    sel.vel[i] = median(0, sel.vel[i] + delta, 100);
  });
}

/* 声道 0..200（100 = 居中） */
function selectionChangePan(delta) {
  return selectionApply((sel, i) => {
    sel.pan[i] = median(0, sel.pan[i] + delta, 200);
  });
}

/* 微分音 -1200..1200（单位是 1/100 半音） */
function selectionChangePit(delta) {
  return selectionApply((sel, i) => {
    sel.pit[i] = median(-1200, sel.pit[i] + delta, 1200);
  });
}

/* 对应的"直接设定"版本（重置/设定对话框用） */
function selectionSetVel(v) {
  return selectionApply((sel, i) => { sel.vel[i] = median(0, v, 100); });
}
function selectionSetPan(v) {
  return selectionApply((sel, i) => { sel.pan[i] = median(0, v, 200); });
}
function selectionSetPit(v) {
  return selectionApply((sel, i) => { sel.pit[i] = median(-1200, v, 1200); });
}
