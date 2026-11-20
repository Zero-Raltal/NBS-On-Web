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
        else if (meta === 0x51) { const a = u8(), b = u8(), c = u8(); tempo = a * 65536 + b * 256 + c; p += Math.max(0, l - 3); }
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
  return { ppq, tempo, timesig, tracks, format, smpte };
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
  const layerBase = {};
  let yy = 0;
  for (let ch = 0; ch <= 15; ch++) {
    layerBase[ch] = yy;
    if (channelheight[ch]) yy += channelheight[ch];
  }
  S.endb2 = Math.max(1, yy);

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

  // 速度：与 MIDI 文件一致
  // 对照 GML import_midi.gml:161
  //   tempo = median(0.25, 10 / ((midi_songlength) / (enda / 10)), 1000)
  // 算出来的红石刻经常是 9.718006... 这种长小数，界面上显示不下也没意义，
  // 按用户要求保留两位小数（四舍五入）。裁剪顺序保持源码一致：先算再 median。
  if (S.midiTempo) {
    const len = S.midiMinPos !== undefined ? (S.midiMaxPos - base) : 0;
    const seconds = (m.tempo / 1e6) * (len / (m.ppq & 0x7fff));
    endaMax = Math.max(endaMax, S.enda);
    if (seconds > 0 && endaMax > 0) {
      const raw = median(0.25, endaMax / seconds, 1000);
      S.tempo = Math.round(raw * 100) / 100;
    }
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
