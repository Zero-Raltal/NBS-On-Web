/* =========================================================================
   render.js — 把歌曲离线渲染成音频文件（WAV）

   为什么用 OfflineAudioContext 而不是实时录制：
     实时录制要等整首歌播完，而且结果受设备性能与调度抖动影响，
     载入慢的机器上会丢音。OfflineAudioContext 在内存里以固定采样率
     一次性算完，速度快、结果稳定、不受窗口可见性影响。

   音频路径与实时播放保持一致（audio.js 的 playSound）：
     rate = 0.5 * 2^((key + ins.key + pit/100 - 78) / 12)
     vol  = (vel/100) * layervol/100 * mastervol
     pan  = (pan-100)/100  → StereoPanner
   这样导出结果和编辑器里听到的完全一致。

   输出格式：16 位 PCM 立体声 WAV（兼容性最好，任何播放器/剪辑软件都能读）。
   ========================================================================= */
'use strict';

/* 渲染整首歌。
   opts = { sampleRate, tail, onProgress }
   返回 ArrayBuffer（WAV 文件内容）。 */
async function renderSongToWav(opts) {
  const o = opts || {};
  const sr = o.sampleRate || 44100;
  const onProgress = o.onProgress || function () { };

  if (typeof OfflineAudioContext === 'undefined' && typeof webkitOfflineAudioContext === 'undefined') {
    throw new Error('这个浏览器不支持离线音频渲染。');
  }
  if (!S.totalblocks) throw new Error('当前歌曲没有任何音符，无法导出音频。');

  // 1) 收集所有要发声的音符（含层音量/声像），换算成秒
  const notes = [];
  const tempo = Math.max(0.25, S.tempo || 10);
  for (let a = 0; a <= S.enda; a++) {
    for (let b = 0; b <= S.endb; b++) {
      const x = a, y = b;
      if (!gExists(a, b)) continue;
      const ins = INSTRUMENTS[gIns(a, b)];
      if (!ins || !ins.loaded || !ins.buffer) continue;
      const key = gKey(a, b);
      const vel = gVel(a, b);
      const pit = gPit(a, b);
      const pan = gPan(a, b);
      const lv = (S.layervol && S.layervol[b] !== undefined) ? S.layervol[b] : 100;
      notes.push({
        time: a / tempo,
        ins, key, vel, pit, pan,
        layervol: lv,
        dur: ins.buffer.duration,
      });
    }
  }
  if (!notes.length) throw new Error('没有可渲染的音符（音色可能还没载入完）。');

  // 2) 总的音频长度 = 最后一个音的起始 + 它的时长 + 尾巴
  let lastEnd = 0;
  for (const n of notes) {
    // 音高越高时长越短（playbackRate 越大），按 rate 折算
    const rate = 0.5 * Math.pow(2, (n.key + (n.ins.key || 45) + (n.pit || 0) / 100 - 78) / 12);
    const end = n.time + n.dur / Math.max(0.01, rate);
    if (end > lastEnd) lastEnd = end;
  }
  const tail = (o.tail === undefined) ? 1.0 : o.tail;   // 默认留 1 秒余韵
  const total = Math.max(0.5, lastEnd + tail);

  // 3) 离线上下文
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new OAC(2, Math.ceil(total * sr), sr);

  const master = ctx.createGain();
  master.gain.value = Math.max(0, Math.min(2, S.mastervol === undefined ? 1 : S.mastervol));
  master.connect(ctx.destination);

  // 4) 逐个排期
  const done = new Set();
  for (const n of notes) {
    const key = n.key + (n.ins.key || 45) + (n.pit || 0) / 100;
    const rate = 0.5 * Math.pow(2, (key - 78) / 12);
    const gainV = (n.vel / 100) * (n.layervol / 100);
    if (gainV <= 0.0001) continue;

    const src = ctx.createBufferSource();
    src.buffer = n.ins.buffer;
    src.playbackRate.value = rate;

    const g = ctx.createGain();
    g.gain.value = gainV;

    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, (n.pan - 100) / 100));

    src.connect(g); g.connect(p); p.connect(master);
    // 超出缓冲末尾的部分不会被播（OfflineAudioContext 自动截断）
    src.start(Math.max(0, n.time));
    if (!done.has(n.ins.filename)) done.add(n.ins.filename);
  }

  onProgress(0.15, '正在渲染音频...');
  const rendered = await ctx.startRendering();
  onProgress(0.85, '正在编码 WAV...');
  const wav = audioBufferToWav(rendered);
  onProgress(1, '完成');
  return wav;
}

/* AudioBuffer → 16 位 PCM WAV（小端，标准 44 字节头） */
function audioBufferToWav(buffer) {
  const numCh = buffer.numberOfChannels;
  const sr = buffer.sampleRate;
  const len = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numCh * bytesPerSample;
  const dataSize = len * blockAlign;
  const ab = new ArrayBuffer(44 + dataSize);
  const dv = new DataView(ab);

  const wstr = (off, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)); };

  wstr(0, 'RIFF');
  dv.setUint32(4, 36 + dataSize, true);
  wstr(8, 'WAVE');
  wstr(12, 'fmt ');
  dv.setUint32(16, 16, true);          // fmt chunk size
  dv.setUint16(20, 1, true);           // PCM
  dv.setUint16(22, numCh, true);
  dv.setUint32(24, sr, true);
  dv.setUint32(28, sr * blockAlign, true);
  dv.setUint16(32, blockAlign, true);
  dv.setUint16(34, 16, true);          // bits per sample
  wstr(36, 'data');
  dv.setUint32(40, dataSize, true);

  // 取各声道数据
  const chans = [];
  for (let c = 0; c < numCh; c++) chans.push(buffer.getChannelData(c));

  /* 交错写入并做软限幅。
     多个音符同时响时样值相加可能超过 1.0，直接 clamp 会削波失真（刺耳的破音），
     这里用一个简单的 tanh 软限幅，超过阈值后平滑压缩而不是硬切。 */
  let off = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      let v = chans[c][i];
      if (v > 0.95 || v < -0.95) v = Math.tanh(v);
      v = Math.max(-1, Math.min(1, v));
      dv.setInt16(off, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      off += 2;
    }
  }
  return ab;
}

/* 供对话框调用：渲染并下载 */
async function exportSongAudio(name) {
  const base = (name || S.song_name || S.filename || 'song').replace(/\.[^.]+$/, '');
  setMsg('正在渲染音频，请稍候...');
  const wav = await renderSongToWav({
    sampleRate: S.render_samplerate || 44100,
    onProgress: (p, m) => { if (m) setMsg(m); },
  });
  downloadBytes(new Uint8Array(wav), base + '.wav', 'audio/wav');
  setMsg('音频已导出：' + base + '.wav');
}
