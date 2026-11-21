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
      /* 【落数组前必须先清掉目标格上的歌曲方块 —— 对照
         selection_load_from_array.gml:19 `remove_block_select(xx + ca, yy + cb)`】
         宏（Tremolo / Stereo / Arpeggio / Portamento / Stagger / Vibrato /
         Volume LFO / Fade / Chorus）都是「读出选区 → 重排 → 写回选区 →
         selection_place 落回歌曲」的流程。写回时目标格上可能还残留
         上一版内容对应的歌曲方块，于是 selectionRemove → addBlockSelect →
         addBlock 时，addBlock 在 song.js 里遇到 `if (S.grid.exists[i]) return 0`
         会直接拒绝 —— 音符被静默丢掉，宏做得越多丢得越多。
         原版先 remove_block_select 把目标格清空，保证随后一定放得下。 */
      removeBlockSelect(xx + ca, yy + cb);
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

/* ============================================================================
 * Tremolo 的「淡入 / 淡出」两种模式 —— 完整移植
 *   macro_tremolo_fadein.gml / macro_tremolo_fadeout.gml
 *
 * 【为什么必须补这两个】
 * 原版 Tremolo 窗口有三档（tremolotype 0/1/2 = 无音量变化/淡入/淡出），
 * 只有 0 走 macro_tremolo。「淡入/淡出」是带音量包络的颤音，算法完全不同：
 * 它先按 trem_spacing 把每一列复制成若干重复列，再在每条重复链上
 * 按 4/3/3/3… 的步长写入逐级递增（淡入）或递减（淡出）的音量值。
 * 我们之前只实现了 tremolotype 0，窗口里也没有那三档单选框，
 * 于是原版 Tremolo 的核心功能完全不可用。
 *
 * 【两种模式只差一处公式】
 *   淡入：写入 0 + decr（上限 80 / 手动 leg_sus）
 *   淡出：写入 100 - decr（下限 20 / 手动 leg_sus）
 * 其余（列复制、包络步长、decr 增量、循环边界）完全一致，所以合并成
 * 一个内部函数、用 mode 区分，避免两份几乎相同的代码各自漂移。
 *
 * 【decr 的自动计算】（gml:53-57 两者相同）
 *   if fade_auto = 1:
 *       current_colsegment - 4 > 0 → decr = 100 / (current_colsegment - 4)
 *       else current_colsegment - 2 > 0 → decr = 100 / (current_colsegment - 2)
 *       else decr = 100 / current_colsegment
 *   else decr = leg_dec
 * 也就是「让包络正好在这么多列里走完 100」的斜率。
 * ========================================================================== */
function macroTremoloFadeInternal(mode) {
  if (S.selected === 0) return 0;
  const arr = selToArrayExt();
  const total = arr.length;
  const totalCols = macroColumnCount(arr);
  const spacing = S.trem_spacing || 1;
  /* fade_auto: 1 = 自动音量（由音符长度决定），0 = 手动音量（用 leg_dec/leg_sus） */
  const fadeAuto = (S.fade_auto === undefined) ? 1 : (S.fade_auto | 0);
  const legDec = (S.leg_dec === undefined) ? 20 : S.leg_dec;
  const legSus = (S.leg_sus === undefined) ? 20 : S.leg_sus;

  const arrData = [];
  let val = 0, c = 0, prevlength = 0, previousColsegment = 0;

  /* GML 里读数组越界得到 0，这里显式模拟，避免 JS 的 undefined 参与比较。
     （正常数据不会越界：每条重复段都以 -1 结尾，扫描一定会停在 -1 上。） */
  const getAt = (i) => (arrData[i] === undefined ? 0 : arrData[i]);

  for (let d = 0; d < totalCols; d++) {
    let e = 0;
    const arrCol = [];
    while (val < total && arr[val] !== -1) { arrCol[e++] = arr[val++]; }
    if (val < total && arr[val] === -1) arrCol[e] = -1;
    val++;
    e++;
    if (val >= total) {
      /* 最后一列：直接以 1 个 tick 的间隔收进结果并结束 */
      for (let b = 0; b < e; b++) {
        if (b === 0) arrCol[b] = 1;
        arrData[c++] = arrCol[b];
      }
      break;
    }
    /* 非最后一列：复制 replength 份，列间距用 trem_spacing */
    let replength = 1;
    if (arr[val] >= 1) replength = arr[val] / spacing;
    arr[val] = 1;
    for (let a = 0; a < replength; a++) {
      for (let b = 0; b < e; b++) {
        if (b === 0) arrCol[b] = spacing;
        arrData[c++] = arrCol[b];
      }
    }

    const currentColsegment = macroColumnCount(arrData, c) - previousColsegment;
    const tremoloDuration = arrData.length - prevlength;
    let f = 0;
    let decr;
    if (fadeAuto === 1) {
      if (currentColsegment - 4 > 0) decr = 100 / (currentColsegment - 4);
      else if (currentColsegment - 2 > 0) decr = 100 / (currentColsegment - 2);
      else decr = 100 / currentColsegment;
    } else {
      decr = legDec;
    }
    const inc = decr;
    let guard = 0;
    const GUARD_MAX = 1 << 20;
    while (f < tremoloDuration) {
      /* 越界保护：GML 在原版里也依赖数据自身的 -1 终止符，
         若数据异常会进入死循环把窗口卡死。浏览器里卡死代价更大，
         这里加一个上限并直接跳出（正常数据永远碰不到）。 */
      if (++guard > GUARD_MAX) break;
      f += 4;
      if (mode === 1) {
        /* 淡入 —— gml:61-66 */
        if (fadeAuto === 1) {
          arrData[f + prevlength] = (0 + decr <= 80) ? (0 + decr) : 80;
        } else {
          arrData[f + prevlength] = (0 + decr < legSus) ? (0 + decr) : legSus;
        }
      } else {
        /* 淡出 —— gml:61-63 */
        if (100 - decr >= 20) arrData[f + prevlength] = 100 - decr;
        else if (fadeAuto === 1) arrData[f + prevlength] = 20;
        else arrData[f + prevlength] = legSus;
      }
      f += 3;
      while (getAt(f + prevlength) !== -1) {
        if (++guard > GUARD_MAX) break;
        f += 3;
        if (mode === 1) {
          /* 淡入内层 —— gml:68-73 */
          if (0 + decr <= legDec) arrData[f + prevlength] = 0 + decr;
          else if (fadeAuto === 1) arrData[f + prevlength] = 80;
          else arrData[f + prevlength] = legSus;
        } else {
          /* 淡出内层 —— gml:65-71（与外层同式） */
          if (100 - decr >= 20) arrData[f + prevlength] = 100 - decr;
          else if (fadeAuto === 1) arrData[f + prevlength] = 20;
          else arrData[f + prevlength] = legSus;
        }
        f += 3;
      }
      if (guard > GUARD_MAX) break;
      decr = decr + inc;
      f++;
    }
    prevlength = arrData.length;
    previousColsegment += currentColsegment;
    decr = 0;
  }

  arrData[0] = 0;
  /* array_resize(arr_data, c)：把越界写入撑出来的尾巴截掉 */
  if (arrData.length > c) arrData.length = c;

  const x = SEL.x, y = SEL.y;
  const before = snapshotSelPair();
  selectionDelete(true);
  selLoadFromArray(x, y, arrData);
  pushSelChange(before);
  if (!G.alt) selectionPlace(false);
}

/* 对照 draw_window_macro_tremolo.gml:71 → macro_tremolo_fadein() */
function macroTremoloFadein() { return macroTremoloFadeInternal(1); }
/* 对照 draw_window_macro_tremolo.gml:72 → macro_tremolo_fadeout() */
function macroTremoloFadeout() { return macroTremoloFadeInternal(2); }

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
/* 对照 draw_window_macro_setpitch.gml:37 的 selection_change(m_pit, setpit, addpitch)：
   add 为真时把 setpit 叠加到每个音符现有的微分音上，否则直接设定。
   selectionChange 本身就支持 add，这里只需要把它传下去。 */
function macroSetPitch(v, add) {
  if (S.selected === 0) return 0;
  selectionChange(M_PIT, v, !!add);
  afterMacro();
}
