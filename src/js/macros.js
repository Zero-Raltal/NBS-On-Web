/* =========================================================================
   macros.js — 选区宏（颤音/立体声/琶音/滑音/颤音/错位/和声/音量 LFO/淡入淡出…）
   实现严格对照 GML 的宏实现：它们都在「扁平数组」上做下标运算。
   数组布局： [跳列数, (跳行数, 音色, 音, 音量, 声道, 音高)*, -1, ...]
   ========================================================================= */
'use strict';

// 对应 selection_to_array_ext
function selToArrayExt() {
  if (S.selected === 0) return [];
  const ret = [];
  let ca = 0;
  for (let a = 0; a < SEL.l; a++) {
    if (SEL.colfirst[a] > -1) {
      ret.push(ca); ca = 0;
      let cb = 0;
      for (let b = 0; b < SEL.h; b++) {
        const i = sidx(a, b);
        if (SEL.exists[i]) {
          ret.push(cb, SEL.ins[i], SEL.key[i], SEL.vel[i], SEL.pan[i], SEL.pit[i]);
          cb = 0;
        }
        cb++;
      }
      ret.push(-1);
    }
    ca++;
  }
  return ret;
}
function macroColumnCount(arr, length) {
  if (length === undefined) length = arr.length;
  let c = 0;
  for (let i = 0; i < length; i++) if (arr[i] === -1) c++;
  return c;
}
function selLoadFromArray(xx, yy, arr) {
  if (!arr.length) return 0;
  // 清空旧内容
  SEL.exists.fill(0); SEL.colfirst.fill(-1); SEL.collast.fill(-1);
  S.selected = 0;
  let ca = 0, h = 0, at = 0;
  while (at < arr.length) {
    ca += arr[at++];
    let cb = 0;
    while (true) {
      const val = arr[at++];
      if (val === -1 || val === undefined) break;
      cb += val;
      const i = sidx(ca, cb);
      SEL.exists[i] = 1;
      SEL.ins[i] = arr[at++]; SEL.key[i] = arr[at++]; SEL.vel[i] = arr[at++];
      SEL.pan[i] = arr[at++]; SEL.pit[i] = arr[at++];
      S.selected++;
      if (SEL.colfirst[ca] === -1) SEL.colfirst[ca] = cb;
      SEL.collast[ca] = cb;
      h = Math.max(h, cb);
    }
  }
  SEL.x = xx; SEL.y = yy; SEL.l = ca + 1; SEL.h = h + 1;
  selectionCodeUpdate();
  selectionExpandLayersSafe();
}
function selectionExpandLayersSafe() {
  if (SEL.y + SEL.h - 1 >= S.endb2) {
    for (let i = S.endb2; i < SEL.y + SEL.h; i++) {
      S.layername[i] = ''; S.layerlock[i] = 0; S.layervol[i] = 100; S.layerstereo[i] = 100;
      rowamount[i] = 0; S.endb2 = i + 1;
    }
  }
}

// 对应 selection_change(property, amount, add)
const M_KEY = 0, M_VEL = 1, M_PAN = 2, M_PIT = 3;
function selectionChange(prop, amount, add) {
  if (S.selected === 0) return 0;
  const before = snapshotSelPair();
  for (let a = 0; a < SEL.l; a++) {
    if (SEL.colfirst[a] > -1) {
      for (let b = SEL.colfirst[a]; b <= SEL.collast[a]; b++) {
        const i = sidx(a, b);
        if (!SEL.exists[i]) continue;
        let val;
        switch (prop) {
          case M_KEY:
            val = add ? SEL.key[i] + amount : amount;
            if (val >= 0 && val <= 87) SEL.key[i] = val;
            break;
          case M_VEL:
            val = add ? SEL.vel[i] + amount : amount;
            if (val >= 0 && val <= 100) SEL.vel[i] = val;
            break;
          case M_PAN:
            val = add ? SEL.pan[i] + amount : amount;
            if (val >= 0 && val <= 200) SEL.pan[i] = val;
            break;
          case M_PIT:
            val = add ? SEL.pit[i] + amount : amount;
            if (val >= -1200 && val <= 1200) SEL.pit[i] = val;
            break;
        }
      }
    }
  }
  selectionCodeUpdate();
  pushSelChange(before);
  S.changed = 1;
  return 1;
}

function afterMacro() {
  if (!G.alt) selectionPlace(false);
}

/* ---------------------------------------------------------------- 各宏 */
function macroVibrato() {
  if (S.selected === 0) return 0;
  const arr = selToArrayExt();
  const total = arr.length;
  let val = 0;
  while (val < total) {
    val += 6; arr[val] = 40; val++;
    while (arr[val] !== -1) { val += 5; arr[val] = 40; val++; }
    val += 7; if (val >= total) break;
    arr[val] = 0; val++;
    while (arr[val] !== -1) { val += 5; arr[val] = 0; val++; }
    val += 7; if (val >= total) break;
    arr[val] = -40; val++;
    while (arr[val] !== -1) { val += 5; arr[val] = -40; val++; }
    val += 7; if (val >= total) break;
    arr[val] = 0; val++;
    while (arr[val] !== -1) { val += 5; arr[val] = 0; val++; }
    val++;
  }
  const x = SEL.x, y = SEL.y;
  const before = snapshotSelPair();
  selLoadFromArray(x, y, arr);
  pushSelChange(before);
  afterMacro();
}

function macroFade(inOut) {
  if (S.selected === 0) return 0;
  const arr = selToArrayExt();
  const total = arr.length;
  const cols = macroColumnCount(arr);
  const decr = 1.0 / Math.max(1, cols - 1);
  let factor = inOut ? 0.0 : 1.0;
  let val = 0;
  while (val < total) {
    val += 4;
    arr[val] = Math.max(1, Math.min(100, Math.ceil(arr[val] * factor)));
    val += 3;
    while (arr[val] !== -1) {
      val += 3;
      arr[val] = Math.max(1, Math.min(100, Math.ceil(arr[val] * factor)));
      val += 3;
    }
    factor += inOut ? decr : -decr;
    val++;
  }
  const x = SEL.x, y = SEL.y;
  const before = snapshotSelPair();
  selLoadFromArray(x, y, arr);
  pushSelChange(before);
  afterMacro();
}

function macroVelocityLFO() {
  if (S.selected === 0) return 0;
  const arr = selToArrayExt();
  const total = arr.length;
  let val = 0;
  while (val < total) {
    val += 4; arr[val] = 100; val++;
    if (arr[val] === 0) arr[val] = 100;
    val += 2;
    while (arr[val] !== -1) {
      val += 3; arr[val] = 100; val++;
      if (arr[val] === 0) arr[val] = 100;
      val += 2;
    }
    val += 5; if (val >= total) break;
    arr[val] = 50; val += 3;
    while (arr[val] !== -1) { val += 3; arr[val] = 50; val += 3; }
    val += 5; if (val >= total) break;
    arr[val] = 25; val += 3;
    while (arr[val] !== -1) { val += 3; arr[val] = 25; val += 3; }
    val += 5; if (val >= total) break;
    arr[val] = 50; val += 3;
    while (arr[val] !== -1) { val += 3; arr[val] = 50; val += 3; }
    val++;
  }
  const x = SEL.x, y = SEL.y;
  const before = snapshotSelPair();
  selLoadFromArray(x, y, arr);
  pushSelChange(before);
  afterMacro();
}

function macroChorus() {
  if (S.selected === 0) return 0;
  const arr = selToArrayExt();
  const total = arr.length;
  let val = 0;
  while (val < total) {
    val += 5; arr[val] = 140; val++;
    arr[val] = arr[val] + 5; val++;
    if (arr[val] === -1) { messageDialog('应用的每刻内必须有两层方块！', '错误'); return 1; }
    val += 4; arr[val] = 60; val++;
    arr[val] = arr[val] + (-5); val++;
    if (arr[val] === -1) val++;
    else {
      val--;
      for (let i = 0; ; i++) {
        val += 5; arr[val] = 100 + 40 * Math.pow(-1, i); val++;
        arr[val] = arr[val] + 5 * Math.pow(-1, i); val++;
        if (arr[val] === -1) { val++; break; } else val--;
      }
    }
  }
  const x = SEL.x, y = SEL.y;
  const before = snapshotSelPair();
  selLoadFromArray(x, y, arr);
  pushSelChange(before);
  afterMacro();
}

function macroReplaceKey() {
  if (S.selected === 0) return 0;
  const arr = selToArrayExt();
  const key = arr[3];
  selectionChange(M_KEY, key, false);
  afterMacro();
}

function macroReset() {
  if (S.selected === 0) return 0;
  selectionApply((sel, i) => {
    sel.vel[i] = 100; sel.pan[i] = 100; sel.pit[i] = 0;
  });
  afterMacro();
}

/* 颤音（Tremolo）：按 trem_spacing 重复列 */
function macroTremolo() {
  if (S.selected === 0) return 0;
  const arr = selToArrayExt();
  const total = arr.length;
  const spacing = S.trem_spacing || 1;
  let val = 0, c = 0;
  const arr_data = [];
  while (true) {
    let e = 0;
    const arr_col = [];
    while (val < total && arr[val] !== -1) { arr_col[e++] = arr[val++]; }
    if (val < total && arr[val] === -1) arr_col[e] = -1;
    val++;
    e++;
    if (val >= total) {
      for (let b = 0; b < e; b++) {
        if (b === 0) arr_col[b] = spacing;
        arr_data[c++] = arr_col[b];
      }
      break;
    }
    let replength = 1;
    if (arr[val] >= 1) replength = arr[val] / spacing;
    arr[val] = 1;
    for (let a = 0; a < replength; a++) {
      for (let b = 0; b < e; b++) {
        if (b === 0) arr_col[b] = spacing;
        arr_data[c++] = arr_col[b];
      }
    }
    if (val >= total) break;
  }
  if (arr_data.length) arr_data[0] = 0;
  const x = SEL.x, y = SEL.y;
  const before = snapshotSelPair();
  selectionDelete(true);
  selLoadFromArray(x, y, arr_data);
  pushSelChange(before);
  if (!G.alt) selectionPlace(false);
}

/* 立体声 */
function macroStereo(reverse, width) {
  if (S.selected === 0) return 0;
  const arr = selToArrayExt();
  const total = arr.length;
  const leftV = reverse ? 0 - (width - 100) : 200 + (width - 100);
  const rightV = reverse ? 200 + (width - 100) : 0 - (width - 100);
  let val = 0;
  while (val < total) {
    val += 5; arr[val] = leftV; val += 2;
    while (arr[val] !== -1) { val += 4; arr[val] = leftV; val += 2; }
    val += 6; if (val >= total) break;
    arr[val] = rightV; val += 2;
    while (arr[val] !== -1) { val += 4; arr[val] = rightV; val += 2; }
    val += 3;
  }
  const x = SEL.x, y = SEL.y;
  const before = snapshotSelPair();
  selLoadFromArray(x, y, arr);
  pushSelChange(before);
  if (!G.alt) selectionPlace(false);
}

/* 琶音 */
function macroArpeggio(pattern) {
  if (S.selected === 0) return 0;
  if (pattern.indexOf('|') < 0) { messageDialog('请使用“|”分隔值！', '错误'); return 1; }
  const arp = pattern.split('|').map(s => parseInt(s.trim()) || 0).filter((v, i, a) => true);
  const arplen = arp.length;
  const arr = selToArrayExt();
  const total = arr.length;
  let val = 0;
  while (val < total) {
    for (let i = 0; i < arplen; i++) {
      val += 3;
      if (arr[val] + arp[i] > 0 || arr[val] + arp[i] < 88) arr[val] = arr[val] + arp[i];
      val += 4;
      while (arr[val] !== -1) {
        val += 2;
        if (arr[val] + arp[i] > 0 || arr[val] + arp[i] < 88) arr[val] = arr[val] + arp[i];
        val += 4;
      }
      val++;
      if (val >= total) break;
    }
    if (val >= total) break;
  }
  const x = SEL.x, y = SEL.y;
  const before = snapshotSelPair();
  selLoadFromArray(x, y, arr);
  pushSelChange(before);
  if (!G.alt) selectionPlace(false);
}

/* 滑音 */
function macroPortamento(cent, reverse) {
  if (S.selected === 0) return 0;
  const arr = selToArrayExt();
  const total = arr.length;
  const cols = macroColumnCount(arr);
  let decr = cent / Math.max(1, cols);
  const inc = decr;
  let val = 0;
  while (val < total) {
    val += 6;
    arr[val] = reverse ? cent + decr : arr[val] + decr;
    val++;
    while (arr[val] !== -1) {
      val += 5;
      arr[val] = reverse ? cent + decr : arr[val] + decr;
      val++;
    }
    decr = reverse ? decr - inc : decr + inc;
    val++;
  }
  const x = SEL.x, y = SEL.y;
  const before = snapshotSelPair();
  selLoadFromArray(x, y, arr);
  pushSelChange(before);
  if (!G.alt) selectionPlace(false);
}

/* 错位（Stagger） */
function macroStagger(pattern) {
  if (S.selected === 0) return 0;
  if (pattern.indexOf('|') < 0) { messageDialog('请使用“|”分隔值！', '错误'); return 1; }
  if (pattern.indexOf('-') >= 0) { messageDialog('Stagger 只能向下延伸！', '错误'); return 1; }
  const arp = pattern.split('|').map(s => parseInt(s.trim()) || 0);
  const arplen = arp.length;
  const arr = selToArrayExt();
  const total = arr.length;
  let maxi = 0;
  for (let i = 0; i < arp.length; i++) if (arp[i] > arp[maxi]) maxi = i;
  const maxOff = arp[maxi];
  let val = 0;
  while (val < total) {
    for (let i = 0; i < arplen; i++) {
      val += 1;
      arr[val] = arr[val] + arp[i];
      val += 6;
      while (arr[val] !== -1) { arr[val] = arr[val] + arp[i]; val += 6; }
      val++;
      if (val >= total) break;
    }
    if (val >= total) break;
  }
  const x = SEL.x, y = SEL.y;
  SEL.h = Math.max(SEL.h, maxOff + 1);
  const before = snapshotSelPair();
  selectionDelete(true);
  selLoadFromArray(x, y, arr);
  pushSelChange(before);
  if (!G.alt) selectionPlace(false);
}

/* 设定音量/声道/音高（支持百分比） */
function macroSetVelocity(v, percent) {
  if (S.selected === 0) return 0;
  if (!percent) { selectionChange(M_VEL, v, false); }
  else {
    selectionApply((sel, i) => { sel.vel[i] = Math.floor(sel.vel[i] * v / 100); });
  }
  afterMacro();
}
function macroSetPanning(v) {
  if (S.selected === 0) return 0;
  selectionChange(M_PAN, v, false);
  afterMacro();
}
function macroSetPitch(v) {
  if (S.selected === 0) return 0;
  selectionChange(M_PIT, v, false);
  afterMacro();
}
