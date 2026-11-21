/* =========================================================================
   render.js — 把歌曲离线渲染成音频文件（WAV）

   音频路径与实时播放严格一致（audio.js 的 playSound）：
     rate = 0.5 * 2^((key + ins.key + pit/100 - 78) / 12)
     vol  = (vel/100) * layervol/100 * mastervol
     pan  = (pan-100)/100  → 等功率声像
   这样导出结果和编辑器里听到的一致。

   ---------------------------------------------------------------- 实现选择
   最初用 OfflineAudioContext + 每音符一个 BufferSource。功能正确，但性能
   随音符数超线性恶化：每个节点都要参与整条图的混音，几千个音就要几十秒，
   上万音直接跑到分钟级（实测 120 秒音频 / 4800 音会超过 3 分钟）。
   用户看到的就是「点了导出很久没反应」。

   现在改成**自己混音**：
     · 预先把每个音色按音高重采样成一份缓存（同一音色同一 rate 只算一次），
       五行同音高的音符直接复用，省掉大量重复的重采样；
     · 然后把所有音符的波形直接累加进左右声道数组。
   复杂度只与「音频总采样数 × 音符数」有关，纯数组加法，比搭音频图快得多；
   也不依赖 OfflineAudioContext（顺便解决了部分浏览器不支持的问题）。

   输出：16 位 PCM 立体声 WAV。
   ========================================================================= */
'use strict';

/* 重采样缓存：key = 文件名 + playbackRate，value = 重采样后的 Float32Array。
   一次导出内共享，避免同一个音色的同一个音高反复重采样。 */
const RENDER_CACHE = new Map();

/* 用线性插值把源缓冲按 rate 重采样。
   rate > 1 → 变短变高；rate < 1 → 变长变低。
   返回单声道 Float32Array（音色源本身就是单声道，双声道则混合）。

   取样关系：输出第 i 个样本对应源文件里 i * rate 处。
   （播放速率 rate 意味着每秒消耗 rate 倍于输出采样率的源样本，
     所以源位置按 rate 前进；输出长度 = 源长度 / rate。） */
function resampleBuffer(buffer, rate) {
  const srcLen = buffer.length;
  const outLen = Math.max(1, Math.floor(srcLen / rate));
  const out = new Float32Array(outLen);

  // 源数据：多声道先混成单声道
  let src;
  if (buffer.numberOfChannels === 1) {
    src = buffer.getChannelData(0);
  } else {
    src = new Float32Array(srcLen);
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const d = buffer.getChannelData(c);
      for (let i = 0; i < srcLen; i++) src[i] += d[i] / buffer.numberOfChannels;
    }
  }

  // 线性插值取样
  for (let i = 0; i < outLen; i++) {
    const pos = i * rate;
    const i0 = pos | 0;
    if (i0 + 1 >= srcLen) { out[i] = src[srcLen - 1] || 0; continue; }
    const frac = pos - i0;
    out[i] = src[i0] * (1 - frac) + src[i0 + 1] * frac;
  }
  return out;
}

/* 取（音色, 播放速率）对应的重采样结果，带缓存。
   srcRate 是输出采样率：源缓冲的采样率通常就是 44100，但输出可以选 22050/48000，
   两者不等时必须一并折算，否则整首歌会整体升/降八度
   （Web Audio 的 playbackRate 是相对上下文采样率生效的，手动混音要自己补这一步）。 */
function getResampled(ins, rate, srcRate) {
  const bufSr = ins.buffer.sampleRate || 44100;
  /* 每个输出样本应前进多少个源样本：
       源被消费的速度 = rate × 源采样率
       输出产生样本的速度 = 输出采样率
     ⇒ 步长 = rate × bufSr / srcRate */
  const step = rate * bufSr / srcRate;
  const key = ins.filename + '|' + step.toFixed(6);
  let buf = RENDER_CACHE.get(key);
  if (!buf) {
    buf = resampleBuffer(ins.buffer, step);
    RENDER_CACHE.set(key, buf);
  }
  return buf;
}

/* 渲染整首歌。
   opts = { sampleRate, tail, onProgress, cancelled }
   返回 ArrayBuffer（WAV 文件内容）。 */
async function renderSongToWav(opts) {
  const o = opts || {};
  const sr = o.sampleRate || 44100;
  const onProgress = o.onProgress || function () { };
  const cancelled = o.cancelled || function () { return false; };

  if (!S.totalblocks) throw new Error('当前歌曲没有任何音符，无法导出音频。');

  const tempo = Math.max(0.25, S.tempo || 10);
  const mastervol = (S.mastervol === undefined) ? 1 : Math.max(0, Math.min(2, S.mastervol));

  // ---- 1. 收集音符 ----
  /* 【必须按"静音层/独奏"过滤 —— 否则导出的音频和试听听感不一致】
     用户报过的同类问题：界面上把某层静音了，试听确实听不到，
     但导出的 WAV 里那一层还在。根因是这里只算了 gain（力度×层音量），
     完全没读 layerlock / solostr。
     原版 audio_export.gml:37 传的是 `exclude_locked_layers: !audio_exp_include_locked`，
     而 audio_exp_include_locked 默认 0（control_create.gml:543），
     也就是说【默认排除已静音的层】，并且导出窗口里给了"包括已静音的层"勾选框。
     这里的判定与播放路径（editor.js 的 playColumnRange）保持完全一致：
        solostr 非空 → 只有独奏列表里的层发声，其中被静音(lock=1)的仍不发声
        solostr 为空 → layerlock[b] === 1 的层不发声
     o.includeMuted 对应原版那个勾选框（true 时连静音层一起导出）。 */
  const includeMuted = !!o.includeMuted;
  const solostr = S.solostr || '';
  const notes = [];
  for (let a = 0; a <= S.enda; a++) {
    for (let b = 0; b <= S.endb; b++) {
      if (!gExists(a, b)) continue;
      const ins = INSTRUMENTS[gIns(a, b)];
      if (!ins || !ins.loaded || !ins.buffer) continue;
      if (!includeMuted) {
        if (solostr !== '') {
          if (solostr.indexOf('|' + b + '|') < 0) continue;
          else if (S.layerlock[b] === 1) continue;
        } else if (b < S.endb2 && S.layerlock[b] === 1) {
          continue;
        }
      }
      const vel = gVel(a, b);
      const lv = (S.layervol && S.layervol[b] !== undefined) ? S.layervol[b] : 100;
      const gain = (vel / 100) * (lv / 100) * mastervol;
      if (gain <= 0.0005) continue;                 // 静音层/零力度直接跳过
      const rate = 0.5 * Math.pow(2, (gKey(a, b) + (ins.key || 45) + (gPit(a, b) || 0) / 100 - 78) / 12);
      /* 声像：同样遵守「关闭立体声」—— 对照 play_sound.gml:25-26，
         realstereo 为真时强制按 100（中央）发声，忽略音符自身的 pan。
         导出必须和试听一致，否则导出的文件声场和界面听到的不是一回事。 */
      const panRaw = S.realstereo ? 100 : gPan(a, b);
      notes.push({
        start: Math.round(a / tempo * sr),
        rate, gain,
        pan: Math.max(-1, Math.min(1, (panRaw - 100) / 100)),
        ins,
      });
    }
  }
  if (!notes.length) throw new Error('没有可渲染的音符（音色可能还没载入完）。');

  onProgress(0.02, '正在准备渲染（' + notes.length + ' 个音符）...');
  await yieldToUI();

  // ---- 2. 决定总长度 ----
  let lastSample = 0;
  for (const n of notes) {
    const bufSr = n.ins.buffer.sampleRate || 44100;
    const step = n.rate * bufSr / sr;
    const len = Math.floor(n.ins.buffer.length / step);
    const end = n.start + len;
    if (end > lastSample) lastSample = end;
  }
  const tail = (o.tail === undefined) ? 1.0 : o.tail;
  const total = Math.max(sr * 0.25, lastSample + Math.round(tail * sr));

  // ---- 3. 混音 ----
  const L = new Float32Array(total);
  const R = new Float32Array(total);

  const CHUNK = 256;   // 每处理多少个音符让出一次主线程
  for (let i = 0; i < notes.length; i++) {
    if (cancelled()) throw new Error('已取消。');
    const n = notes[i];
    const src = getResampled(n.ins, n.rate, sr);

    /* 等功率声像：中间 -3dB，两侧不变，听感上响度更均匀
       （纯线性 pan 中间会偏响，和实时播放的 StereoPanner 也不一致）。 */
    const th = (n.pan + 1) * Math.PI / 4;
    const gl = Math.cos(th) * n.gain * Math.SQRT2;
    const gr = Math.sin(th) * n.gain * Math.SQRT2;

    const start = n.start;
    const len = Math.min(src.length, total - start);
    for (let k = 0; k < len; k++) {
      const s = src[k];
      L[start + k] += s * gl;
      R[start + k] += s * gr;
    }

    if ((i + 1) % CHUNK === 0) {
      onProgress(0.05 + ((i + 1) / notes.length) * 0.8,
        '正在混音（' + (i + 1) + '/' + notes.length + ' 个音符）...');
      await yieldToUI();
    }
  }

  onProgress(0.88, '正在编码 WAV...');
  await yieldToUI();

  const wav = await encodeWav(L, R, sr, (p) => {
    onProgress(0.88 + p * 0.12, '正在编码 WAV（' + Math.round(p * 100) + '%）...');
  }, (o.channels === 1) ? 1 : 2);
  RENDER_CACHE.clear();   // 释放重采样缓存
  onProgress(1, '完成');
  return wav;
}

/* 让出主线程一帧，让进度真的画出来。 */
function yieldToUI() {
  return new Promise((r) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(r, 0));
    else setTimeout(r, 0);
  });
}

/* 左右声道 → 16 位 PCM WAV。分段编码，长歌也不会冻住界面。
   对照 draw_window_audio_export.gml 的 audio_exp_channels：1 = 单声道、2 = 立体声。
   单声道时把左右声道取平均，避免声像偏到某一侧。 */
async function encodeWav(L, R, sr, onProgress, numCh) {
  const len = Math.max(L.length, R.length);
  const ch = (numCh === 1) ? 1 : 2;
  const blockAlign = ch * 2;
  const dataSize = len * blockAlign;
  const ab = new ArrayBuffer(44 + dataSize);
  const dv = new DataView(ab);

  const wstr = (off, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)); };
  wstr(0, 'RIFF');
  dv.setUint32(4, 36 + dataSize, true);
  wstr(8, 'WAVE');
  wstr(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);          // PCM
  dv.setUint16(22, ch, true);
  dv.setUint32(24, sr, true);
  dv.setUint32(28, sr * blockAlign, true);
  dv.setUint16(32, blockAlign, true);
  dv.setUint16(34, 16, true);         // 16 bit
  wstr(36, 'data');
  dv.setUint32(40, dataSize, true);

  const CHUNK = 200000;
  let off = 44;
  for (let base = 0; base < len; base += CHUNK) {
    const end = Math.min(base + CHUNK, len);
    for (let i = base; i < end; i++) {
      /* 软限幅：多个音叠加会超过 ±1，硬 clamp 会产生刺耳的削波破音。
         超过阈值后用 tanh 平滑压缩。 */
      let l = L[i] || 0, r = R[i] || 0;
      if (l > 0.95 || l < -0.95) l = Math.tanh(l);
      if (r > 0.95 || r < -0.95) r = Math.tanh(r);
      l = Math.max(-1, Math.min(1, l));
      r = Math.max(-1, Math.min(1, r));
      if (ch === 1) {
        /* 单声道：左右取平均。这样无论声像如何，导出的波形都是居中单声道。 */
        const m = (l + r) / 2;
        dv.setInt16(off, m < 0 ? m * 0x8000 : m * 0x7fff, true);
        off += 2;
      } else {
        dv.setInt16(off, l < 0 ? l * 0x8000 : l * 0x7fff, true);
        dv.setInt16(off + 2, r < 0 ? r * 0x8000 : r * 0x7fff, true);
        off += 4;
      }
    }
    if (onProgress) onProgress(end / len);
    await yieldToUI();
  }
  return ab;
}

/* 供对话框调用：渲染并下载。
   进度写进 S.render_progress，由 drawMsg 持续显示 —— 长歌渲染要几十秒，
   只弹一句「请稍候」用户会以为没反应。 */
async function exportSongAudio(name, opts) {
  const base = (name || S.song_name || S.filename || 'song').replace(/\.[^.]+$/, '');
  /* opts: { sampleRate, channels, includeMuted } —— 来自音频导出选项窗口，
     缺省时退回 S 里的设置，再退回默认值（与 control_create.gml:540-543 一致）。 */
  const o = Object.assign({}, opts || {});
  if (o.sampleRate === undefined) o.sampleRate = S.audio_exp_sample_rate || S.render_samplerate || 44100;
  if (o.channels === undefined) o.channels = S.audio_exp_channels === 1 ? 1 : 2;
  if (o.includeMuted === undefined) o.includeMuted = S.audio_exp_include_locked === 1;
  S.render_progress = 0;
  S.render_msg = '准备导出音频...';
  const t0 = performance.now();
  try {
    const wav = await renderSongToWav({
      sampleRate: o.sampleRate,
      channels: o.channels,
      includeMuted: o.includeMuted,
      onProgress: (p, m) => {
        S.render_progress = p;
        if (m) { S.render_msg = m; setMsg(m); }
      },
      cancelled: () => !S.rendering,
    });
    downloadBytes(new Uint8Array(wav), base + '.wav', 'audio/wav');
    const sec = ((performance.now() - t0) / 1000).toFixed(1);
    const mb = (wav.byteLength / 1048576).toFixed(1);
    // 先让进度条走完 100% 再收起，否则用户只看到 96% 就消失
    S.render_progress = 1;
    S.render_msg = '完成';
    setMsg('音频已导出：' + base + '.wav（耗时 ' + sec + ' 秒，' + mb + ' MB）');
    await new Promise((r) => setTimeout(r, 250));
  } finally {
    S.render_progress = -1;
    S.render_msg = '';
  }
}
