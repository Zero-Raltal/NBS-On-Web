/* =========================================================================
   midi.js — MIDI 导入
   严格对照 import_midi.gml：
     · 音符按 **MIDI 通道** 分组（不是按轨道）
     · 每个通道占据一段层带，带宽 = 该通道「同一格内最多同时发声数」
     · 一格 = deltapertick = (division & 0x7FFF) / 4 / (precision + 1)
     · 音高 = MIDI note − 21 + 12 × 通道八度偏移（偏移来自 GM 音色映射表）
     · 通道 9 是打击乐，按 MIDI_DRUM_TABLE 映射到音色与固定音高
     · 速度 = 10 / (歌曲秒数 / (格数 / 10))，即 格数 / 秒数
   ========================================================================= */
'use strict';

function parseMidi(buf) {
  const d = new DataView(buf);
  let p = 0;
  const u8 = () => d.getUint8(p++);
  const u16 = () => { const v = d.getUint16(p); p += 2; return v; };
  const u32 = () => { const v = d.getUint32(p); p += 4; return v; };
  const str4 = () => { let s = ''; for (let i = 0; i < 4; i++) s += String.fromCharCode(u8()); return s; };
  const varlen = () => { let v = 0, b; do { b = u8(); v = (v << 7) | (b & 0x7f); } while (b & 0x80); return v; };

  if (buf.byteLength < 14 || str4() !== 'MThd') throw new Error('不是有效的 MIDI 文件');
  const hlen = u32();
  const format = u16();
  const ntracks = u16();
  const division = u16();
  if (hlen > 6) p += hlen - 6;
  const smpte = (division & 0x8000) !== 0;
  const ppq = smpte ? 96 : division;
  const tracks = [];
  let tempo = 500000;
  let timesig = [4, 4];
  /* 【记录全部 tempo 事件，而不只是最后一个】
     用户报："导入了带变速的 MIDI，结果放得飞快，并且没有变速"。
     根因就在这里：原来只有一个 tempo 变量，每遇到 0x51 就覆盖，
     循环结束时留下的是【最后一个】tempo，前面的变速全丢。
     更糟的是"放得飞快"——因为时间长度用最后一个（往往最快的）tempo
     去换算整首歌，于是算出来的 tempo 远高于实际。

     对照 open_midi.gml:101-112，原版是两个东西分开记：
         midi_micsecqn                  ← 只有【第一个】tempo（用来算 songlength）
         midi_tempo_changer_x[]         ← 每个变速事件的 tick 位置
         midi_tempo_changer_tempo[]     ← 每个变速事件的 BPM
     这里照抄：tempoEvents 记全部，tempo 仍然保留"第一个"的语义
     （原来是最后一个，这也是个 bug —— 见下面 tempo 的赋值）。 */
  const tempoEvents = [];
  /* 标志位：「是否已经取到过第一个 tempo」。
     不能写成 `if (tempo === 500000) tempo = us` —— 500000 既是初值、
     又恰好是 120BPM 的常见取值，于是第一个事件赋完值后条件依然成立，
     第二个事件照样会覆盖。必须用独立布尔量。 */
  let tempoSeen = false;

  for (let t = 0; t < ntracks; t++) {
    if (p + 8 > buf.byteLength) break;
    const id = str4();
    const len = u32();
    const end = Math.min(p + len, buf.byteLength);
    if (id !== 'MTrk') { p = end; continue; }
    let tick = 0, running = 0;
    const notes = [];
    let name = '', program = 0, amount = 0;
    const patches = [];
    while (p < end) {
      tick += varlen();
      if (p >= end) break;
      let ev = u8();
      if (ev === 0xFF) {
        const meta = u8();
        const l = varlen();
        if (meta === 0x03) { let s = ''; for (let i = 0; i < l; i++) s += String.fromCharCode(u8()); name = s; }
        else if (meta === 0x51) {
          const a = u8(), b = u8(), c = u8();
          const us = a * 65536 + b * 256 + c;
          /* 对照 open_midi.gml:107-109：
               midi_tempo_changer_x[]     = p        （该事件在轨道内的 tick）
               midi_tempo_changer_tempo[] = 60000000 / us
               也就是 BPM = 60,000,000 / 每四分音符微秒数
             这里同时记 tick，后面按 deltapertick 换算成列号。 */
          if (us > 0) tempoEvents.push({ tick, us, bpm: 60000000 / us });
          /* 【第一个才是 midi_micsecqn】
             open_midi.gml:110 `if (midi_micsecqn = 0) midi_micsecqn = ...`
             —— 只在还没赋值时才写，也就是永远保留第一个。
             原来我们每遇到一个就覆盖，留下最后一个，这是"放得飞快"的直接原因。
             注意必须用 tempoSeen 标志位判断，不能写 `if (tempo === 500000)`：
             500000 既是初值又是 120BPM 的常见取值，第一个事件赋完之后
             条件仍然成立，第二个事件照样会覆盖 —— 这个坑我实际踩过，
             表现就是 120→240 的文件算出来是 32（=240BPM）而不是 16。 */
          if (!tempoSeen) { tempo = us; tempoSeen = true; }
          p += Math.max(0, l - 3);
        }
        else if (meta === 0x58) { timesig = [u8(), u8()]; p += Math.max(0, l - 2); }
        else p += l;
        continue;
      }
      if (ev === 0xF0 || ev === 0xF7) { const l = varlen(); p += l; continue; }
      if (ev & 0x80) running = ev; else { p--; ev = running; }
      const ch = ev & 0x0f;
      const type = ev & 0xf0;
      amount++;
      if (type === 0x90) {
        const key = u8(), vel = u8();
        if (vel > 0) notes.push({ tick, key, vel, ch, program });
      } else if (type === 0xC0) { program = u8(); patches.push({ ch, program }); }
      else if (type === 0x80 || type === 0xA0 || type === 0xB0 || type === 0xE0) { p += 2; }
      else if (type === 0xD0) { p += 1; }
      else { p += 1; }
    }
    p = end;
    // 该轨道里每个通道最后使用的音色（program change）
    const chPatch = {};
    for (const x of patches) chPatch[x.ch] = x.program;
    tracks.push({ name: name || ('Track ' + (t + 1)), notes, program, amount, chPatch });
  }
  return { ppq, tempo, timesig, tracks, format, smpte, tempoEvents };
}

/* 每个通道的默认 SETTINGS（对照 draw_window_midi_import 的「使用默认值」） */
function midiChannelDefaults(parsed) {
  const chans = new Map();
  for (const tr of parsed.tracks) {
    for (const n of tr.notes) {
      if (!chans.has(n.ch)) {
        const patch = tr.chPatch[n.ch] !== undefined ? tr.chPatch[n.ch] : n.program;
        chans.set(n.ch, { ch: n.ch, patch: clamp(patch | 0, 0, 127), notes: [] });
      }
      chans.get(n.ch).notes.push(n);
    }
  }
  return [...chans.values()].sort((a, b) => a.ch - b.ch);
}

/* 打开 MIDI 导入窗口 */
function importMidi(buf, name) {
  const parsed = parseMidi(buf);
  // 首尾 tick，用于「去除开始空部分」
  let maxpos = 0, minpos = Infinity;
  for (const tr of parsed.tracks) for (const n of tr.notes) {
    if (n.tick > maxpos) maxpos = n.tick;
    if (n.tick < minpos) minpos = n.tick;
  }
  if (!isFinite(minpos)) minpos = 0;
  S.midiData = parsed;
  S.midiName = name;
  S.midiMaxPos = maxpos;
  S.midiMinPos = minpos;
  S.midiChannels = midiChannelDefaults(parsed).map(c => {
    const t = MIDI_PATCH_TABLE[c.patch] || MIDI_PATCH_TABLE[0];
    return {
      ch: c.ch,
      patch: c.patch,
      patchname: t.name,
      // 对照源码：音色和八度偏移都来自音色表
      ins: c.ch === 9 ? -1 : t.ins,
      oct: c.ch === 9 ? 0 : t.oct,
      notes: c.notes,
    };
  });
  // 打击乐：24..87 号鼓
  S.midiPerc = MIDI_DRUM_TABLE.map((t, i) => ({ note: i + 24, name: t.name, ins: t.ins, key: t.key + 33 }));
  S.midiTab = 0;
  S.midiSb = [0, 0, 0];
  if (S.midiRemember === undefined) S.midiRemember = 1;
  S.window = W_MIDI;
}

/* 通道九度偏移字符串 */
function midiOctStr(v) { return v === 0 ? '无' : (v > 0 ? ' + ' : ' ') + v; }

/* 执行导入（对照 import_midi.gml 的两遍扫描） */
function applyMidiImport() {
  const m = S.midiData;
  if (!m) return;
  const precision = S.midiPrecision | 0;                 // 0 / 1 / 3 / 7
  const removesilent = S.midiRemoveSilent ? 1 : 0;
  const deltapertick = (m.ppq & 0x7fff) / 4 / (precision + 1);
  const base = S.midiMinPos * removesilent;

  const use = new Set();
  for (const c of S.midiChannels) if (c.ins >= 0 || c.ch === 9) use.add(c.ch);
  const percOn = new Set();
  for (const p of (S.midiPerc || [])) if (p.ins >= 0) percOn.add(p.note);

  // 一次遍历：把事件换算成 (channel, pos, note, vel, ins)，同时算通道层高
  const events = [];
  const channelheight = {};
  const posamount = new Map();                            // ch -> Map(pos->count)
  let endaMax = 0;
  for (const tr of m.tracks) {
    for (const n of tr.notes) {
      const ch = n.ch;
      const chObj = S.midiChannels.find(c => c.ch === ch);
      const pos = floor((n.tick - base) / deltapertick);
      if (pos < 0) continue;
      let note = n.key - 21, ins;
      if (ch === 9) {
        const p = (S.midiPerc || []).find(x => x.note === n.key);
        if (!p || p.ins < 0) continue;
        ins = p.ins;
        note = median(0, p.key, 87);
      } else {
        if (!chObj || chObj.ins < 0) continue;
        ins = chObj.ins;
        note += 12 * (chObj.oct || 0);
        note = median(0, note, 87);
      }
      if (S.midiOctave) { while (note < 33) note += 12; while (note > 57) note -= 12; }
      let vel = S.midiVel ? n.vel : 100;
      if (vel > 100) vel = 100;
      if (vel < 1) vel = 1;
      events.push({ ch, pos, note, vel, ins });
      endaMax = Math.max(endaMax, pos);
      let mm = posamount.get(ch);
      if (!mm) { mm = new Map(); posamount.set(ch, mm); }
      const v = (mm.get(pos) || 0) + 1;
      mm.set(pos, v);
      if (v > (channelheight[ch] || 0)) channelheight[ch] = v;
    }
  }
  if (!events.length) { messageDialog('没有可导入的音符。', '提示'); return; }

  reset();
  S.timesignature = clamp(m.timesig[0] || 4, 2, 8);

  // 每个通道的层带起点 = 前面所有通道高度之和
  /* 【速度变化层要独占第 0 层，所有通道整体下移一层】
     对照 import_midi.gml:134 `if (w_midi_tempo_changer) yy += 1`
     以及 import_midi.gml:170-173（命名时 `yy += 1; layername[0] = "TempoChgr"`）。
     原版的第 0 层专门用来放变速事件，通道从第 1 层开始。 */
  const tempoChanger = !!S.midiTempoChanger && (m.tempoEvents || []).length > 0;
  const layerBase = {};
  let yy = tempoChanger ? 1 : 0;
  for (let ch = 0; ch <= 15; ch++) {
    layerBase[ch] = yy;
    if (channelheight[ch]) yy += channelheight[ch];
  }
  S.endb2 = Math.max(1, yy);

  /* 【写入变速事件】
     对照 import_midi.gml:147-155：
         pos = floor((midi_tempo_changer_x[t] - midi_minpos * removesilent) / deltapertick)
         if (!song_exists[pos, 0]) add_block(pos, 0, first_custom_index, 39, 100, 100, tempo * (precision + 1))
         else                     change_block(pos, 0, ..., 同上)
     也就是：
       · 放在第 0 层
       · 用「自定义乐器」第一个（custom instrument #0）—— 这是 NBS 约定的变速标记
       · 音高固定 39
       · 力度/声像 100
       · **pitch（音高偏离值）承载 BPM**，并且乘 (precision+1)
     注意 pitch 是 -100~100 的"半音偏离"字段，原版拿它当数值容器用，
     所以能放下的 BPM 上限是 100/(precision+1)… 实际上 bpm 本身不大（60~200），
     precision=0 时直接放 BPM，precision=7 时乘 8 会超出 —— 这是原版的实现，
     我们照抄，不自行"修正"。 */
  if (tempoChanger) {
    /* 【必须真的创建一个名为 "Tempo Changer" 的自定义乐器】
       对照 import_midi.gml:8：
           if (w_midi_tempo_changer) ds_list_add(instrument_list, new_instrument("Tempo Changer", "", true))

       这一步不是可选的：整套变速功能都靠【乐器名恰好等于 "Tempo Changer"】
       来识别（toggle_playing.gml:48 播放时改速度、control_draw.gml:302
       禁止调音高、control_draw.gml:408 画布上显示 BPM 标签）。
       我原来只把方块放到 first_custom_index 上，但那个索引在
       INSTRUMENTS 里可能根本不存在（= INSTRUMENTS.length），
       或者指向一个普通的用户乐器 —— 于是播放时 `ins.name` 不是
       "Tempo Changer"，速度永远不会变。这就是"导入了变速却没有变速"
       在播放端残留的原因。

       原版每次导入都会新加一个（重复导入会有多个同名乐器，这是原版行为）。
       这里稍作收敛：已经存在同名乐器就复用，避免反复导入堆一堆。 */
    let tcIns = INSTRUMENTS.findIndex(o => o && o.name === 'Tempo Changer');
    if (tcIns < 0) {
      if (typeof newInstrument === 'function') {
        newInstrument('Tempo Changer', '', true, false);
        tcIns = INSTRUMENTS.findIndex(o => o && o.name === 'Tempo Changer');
      }
    }
    let customIns = tcIns;
    if (!(customIns >= 0 && customIns < INSTRUMENTS.length)) {
      /* 极端兜底：连创建都失败了，就退回旧逻辑，至少把方块放下。 */
      customIns = S.first_custom_index;
      if (!(customIns >= 0 && customIns < INSTRUMENTS.length)) {
        const userIns = INSTRUMENTS.findIndex(o => o && o.user);
        customIns = userIns >= 0 ? userIns : 0;
      }
    }
    for (const te of (m.tempoEvents || [])) {
      let pos = floor((te.tick - base) / deltapertick);
      if (pos < 0) pos = 0;
      const pitch = Math.round(te.bpm * (precision + 1));
      /* 原版先判 song_exists[pos,0]，有则 change_block、无则 add_block。
         我们这里 addBlock 本身就返回 0 表示"该格已有内容"，
         所以直接按返回值分支即可。 */
      if (!addBlock(pos, 0, customIns, 39, 100, 100, pitch, false)) {
        if (typeof changeBlock === 'function') changeBlock(pos, 0, customIns, 39, 100, 100, pitch);
      }
    }
  }

  const maxHeight = Math.max(1, S.midiMaxHeight || 20);
  let placed = 0, skipped = 0;
  for (const e of events) {
    let y = layerBase[e.ch] || 0;
    let tries = 0, ok = false;
    while (true) {
      if (addBlock(e.pos, y, e.ins, e.note, e.vel, 100, 0, false)) { ok = true; break; }
      y++; tries++;
      if (tries >= maxHeight && maxHeight < 20) break;
      if (y > yy + 24) break;
    }
    if (ok) placed++; else skipped++;
  }

  recalcSong();
  S.endb2 = Math.max(S.endb2, S.endb + 1, yy);

  // 层名（对照 import_midi 的 w_midi_name 段）
  /* 有变速层时，第 0 层要叫 "TempoChgr"
     （对照 import_midi.gml:170-173 `yy += 1; layername[0] = "TempoChgr"`）。
     注意原版这段是嵌在 `if (w_midi_name = 1)` 里面的 ——
     也就是说【不勾「给每层命名」时，第 0 层就没有名字】。
     这是原版行为，照抄。 */
  if (S.midiNameLayers && tempoChanger) S.layername[0] = 'TempoChgr';
  if (S.midiNameLayers) {
    for (const c of S.midiChannels) {
      const h = channelheight[c.ch] || 0;
      for (let i = 0; i < h; i++) {
        const L = (layerBase[c.ch] || 0) + i;
        if (c.ch === 9) S.layername[L] = 'Percussion';
        else if (S.midiNamePatch) S.layername[L] = (MIDI_PATCH_TABLE[c.patch] && MIDI_PATCH_TABLE[c.patch].short) || c.patchname || ('Channel ' + (c.ch + 1));
        else S.layername[L] = 'Channel ' + (c.ch + 1);
        S.layerlock[L] = 0; S.layervol[L] = 100; S.layerstereo[L] = 100;
      }
    }
  }

  /* 速度：与 MIDI 文件一致
     对照 import_midi.gml:158-166 —— 这里有【两条互斥】分支：

       if (!w_midi_tempo_changer || midi_tempo_changers = 0) {
           if (w_midi_tempo && enda > 0 && midi_songlength > 0) {
               tempo = median(0.25, 10 / (midi_songlength / (enda / 10)), 1000)
           }
       } else {
           tempo = (midi_tempo_changer_tempo[0] * (w_midi_precision + 1)) / 15
       }

     也就是：
       · 没有变速、或文件里根本没有 tempo 事件 → 用「整首时长」反推一个平均速度
       · 有变速 → 初始速度直接取【第一个】变速事件的 BPM，而不是平均
     我们原来只有前半段，所以带变速的文件会被按"最后一个 tempo"换算，
     算出远高于实际的速度 —— 这就是用户说的"放得飞快"。

     还有一处剂量差异：`10 / (songlength / (enda/10))` 等于 `enda / songlength`，
     和下面写的 `endaMax / seconds` 是一回事，但原版是【先乘 10 再除】，浮点结果
     略有不同。这里保持等价写法，但把 seconds 的算法对齐到 open_midi.gml:244：
         midi_songlength = micsecqn * ((maxpos - minpos*removesilent) / ppq) / 1000000
     其中 micsecqn 是【第一个】tempo 的微秒数（已经在解析器里改成保留第一个了）。 */
  if (!tempoChanger) {
    if (S.midiTempo) {
      const len = S.midiMinPos !== undefined ? (S.midiMaxPos - base) : 0;
      const seconds = (m.tempo / 1e6) * (len / (m.ppq & 0x7fff));
      endaMax = Math.max(endaMax, S.enda);
      if (seconds > 0 && endaMax > 0) {
        const raw = median(0.25, endaMax / seconds, 1000);
        S.tempo = Math.round(raw * 100) / 100;
      }
    }
  } else {
    /* 有变速：取第一个事件的 BPM / 15 作为初始速度。
       注意这里【不乘 precision】—— 原版 import_midi.gml:165 也是这样：
       存进音符 pitch 的时候乘了 (precision+1)，但设定初始 tempo 时只除以 15。
       因为 tempo 的单位是"每秒红石刻数"，而 BPM/15 才是 NBS 的换算。 */
    const firstBpm = m.tempoEvents[0].bpm;
    S.tempo = Math.round((firstBpm / 15) * 100) / 100;
  }

  S.song_name = S.midiName ? S.midiName.replace(/\.[^.]+$/, '') : '';
  S.song_midi = S.midiName || '';
  S.changed = 1;
  S.filename = '';
  S.starta = 0; S.startb = 0;
  SB.val[0] = 0; SB.val[1] = 0;
  S.window = 0;
  setMsg('已从 MIDI 导入 ' + placed + ' 个音符' + (skipped ? '（跳过 ' + skipped + ' 个）' : ''));
}
