/* =========================================================================
   selection.js — 选区（对应 GML 的 selection_* 系列）
   注意 NBS 的选区是「悬浮」的：选中时方块会从歌曲中被抬起放进选区缓冲区，
   放置/删除时才落回或销毁。
   ========================================================================= */
'use strict';

const SEL_CAP = 512;

const SEL = {
  x: 0, y: 0, l: 0, h: 0,
  code: '',
  exists: new Uint8Array(1024 * SEL_CAP),
  ins: new Uint16Array(1024 * SEL_CAP),
  key: new Uint8Array(1024 * SEL_CAP),
  vel: new Uint8Array(1024 * SEL_CAP),
  pan: new Uint8Array(1024 * SEL_CAP),
  pit: new Int16Array(1024 * SEL_CAP),
  played: new Float64Array(1024 * SEL_CAP),
  colfirst: new Int32Array(4096).fill(-1),
  collast: new Int32Array(4096).fill(-1),
  capW: 1024,
};

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

function selectionExtendLength(n) {
  if (n === undefined) n = S.enda;
  if (n >= SEL.colfirst.length) {
    let cap = SEL.colfirst.length;
    while (cap <= n) cap *= 2;
    const nf = new Int32Array(cap).fill(-1), nl = new Int32Array(cap).fill(-1);
    nf.set(SEL.colfirst); nl.set(SEL.collast);
    SEL.colfirst = nf; SEL.collast = nl;
  }
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

function tryCompressSelection(s) { return s; }
function tryDecompressSelection(s) { return s || ''; }

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
  selectionReset();
  const blocks = selectionParseCode(code);
  if (!blocks.length) return 0;
  let maxA = 0, maxB = 0;
  SEL.x = floor(x); SEL.y = floor(y);
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
  for (let a = 0; a <= enda0; a++) {
    if (colamount[a] > 0) {
      for (let b = colfirst[a]; b <= collast[a]; b++) {
        if (gExists(a, b)) {
          const ins = gIns(a, b);
          if (((ins === instIndex || instIndex === -1) && !not) || (ins !== instIndex && not)) {
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
  SEL.x = 0; SEL.y = 0; SEL.l = enda0 + 1; SEL.h = endb0 + 1;
  selectionTrim();
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
