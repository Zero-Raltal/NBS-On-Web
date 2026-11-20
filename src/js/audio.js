/* =========================================================================
   audio.js — Web Audio 播放引擎
   音高公式与 play_sound 完全一致：
     keyshift = key + (ins.key + pit/100 - 78)
     rate     = 0.5 * 2^(keyshift / 12)
   ========================================================================= */
'use strict';

const AU = {
  ctx: null, master: null, comp: null,
  ui: {},
  voices: [],
  maxVoices: 160,
  ready: false,
};

function initAudio() {
  if (AU.ctx) return AU.ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  AU.ctx = new AC({ sampleRate: 44100 });
  AU.master = AU.ctx.createGain();
  AU.master.gain.value = 1;
  AU.comp = AU.ctx.createDynamicsCompressor();
  AU.comp.threshold.value = -6;
  AU.comp.knee.value = 6;
  AU.comp.ratio.value = 6;
  AU.comp.attack.value = 0.002;
  AU.comp.release.value = 0.25;
  AU.master.connect(AU.comp);
  AU.comp.connect(AU.ctx.destination);
  return AU.ctx;
}

function resumeAudio() {
  if (!AU.ctx) initAudio();
  if (AU.ctx.state === 'suspended') AU.ctx.resume();
}

async function loadSounds(onProgress) {
  initAudio();
  let done = 0;
  const total = SOUND_FILES.length + UI_SOUND_FILES.length + INSTRUMENTS.length;
  const load = async (url) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error('缺少音色 ' + url);
    const ab = await r.arrayBuffer();
    return await AU.ctx.decodeAudioData(ab);
  };
  for (const f of SOUND_FILES) {
    try {
      const buf = await load('assets/sounds/' + f);
      const ins = INSTRUMENTS.find(i => i.filename === f);
      if (ins) { ins.buffer = buf; ins.loaded = true; }
    } catch (e) { console.warn(e.message); }
    done++;
    if (onProgress) onProgress(0.55 + done / total * 0.45, '正在载入音色 ' + f);
  }
  for (const n of UI_SOUND_FILES) {
    try { AU.ui[n] = await load('assets/sounds/UI/' + n + '.ogg'); } catch (e) { }
    done++;
    if (onProgress) onProgress(0.55 + done / total * 0.45, '正在载入音色...');
  }
  AU.ready = true;
  return true;
}

// 解码任意音频文件（自定义音色上传用）
async function decodeSoundFile(file) {
  initAudio();
  const ab = await file.arrayBuffer();
  return await AU.ctx.decodeAudioData(ab);
}

/* 与 GML play_sound(ins, key, vol, pan, pit) 等价。
   when 是可选参数：Web Audio 时间轴上的绝对时刻（秒）。
   播放器用它做「提前排期」—— 把音符安排在精确的未来时刻发声，
   这样即使 JS 回调被后台降频，音符也不会迟到或漏掉。 */
function playSound(ins, key, vol, pan, pit, when) {
  if (!ins || !ins.loaded || !ins.buffer || !AU.ctx) return 0;
  if (AU.ctx.state === 'suspended') AU.ctx.resume();
  const shift = key + (ins.key + (pit || 0) / 100 - 78);
  const rate = 0.5 * Math.pow(2, shift / 12);
  const gainV = (vol / 100) * S.mastervol;
  if (gainV <= 0.0001) return 0;

  const src = AU.ctx.createBufferSource();
  src.buffer = ins.buffer;
  src.playbackRate.value = rate;
  const g = AU.ctx.createGain();
  g.gain.value = gainV;
  const p = AU.ctx.createStereoPanner();
  // GML: audio_emitter_position(emitter, pan, 0, 0)，pan 0..200（100 为中央）
  p.pan.value = clamp((pan - 100) / 100, -1, 1);
  src.connect(g); g.connect(p); p.connect(AU.master);
  /* when 必须是 ctx 时间轴上的绝对时刻；早于当下就立即播（start(0) 的语义是「马上」）。
     留 10ms 余量，避免边界上被判定为过去时刻。 */
  const t = (typeof when === 'number' && isFinite(when)) ? Math.max(when, AU.ctx.currentTime) : 0;
  if (t > 0) src.start(t); else src.start();

  const voice = { src, g, ins, key };
  AU.voices.push(voice);
  if (AU.voices.length > AU.maxVoices) {
    const old = AU.voices.shift();
    try { old.src.stop(); } catch (e) { }
  }
  src.onended = () => {
    const i = AU.voices.indexOf(voice);
    if (i >= 0) AU.voices.splice(i, 1);
    try { g.disconnect(); p.disconnect(); } catch (e) { }
  };
  S.sounds = AU.voices.length;
  return 1;
}

/* 播放一个已载入的 UI 音效，忽略「界面音效」开关。
   对照 GML：节拍器用的是 play_sound(soundmetronome / soundmetronomeclick)，
   属于歌曲相关音效，不受 windowsound 控制。 */
function playUISoundRaw(name, vol) {
  const buf = AU.ui[name];
  if (!buf || !AU.ctx) return 0;
  if (AU.ctx.state === 'suspended') AU.ctx.resume();
  const src = AU.ctx.createBufferSource();
  src.buffer = buf;
  const g = AU.ctx.createGain();
  g.gain.value = (vol === undefined ? 0.5 : vol) * S.mastervol;
  src.connect(g); g.connect(AU.master);
  src.start();
  return 1;
}

function playUISound(name) {
  if (!S.windowsound) return;
  playUISoundRaw(name);
}

function audioStopAll() {
  for (const v of AU.voices) { try { v.src.stop(); } catch (e) { } }
  AU.voices.length = 0;
  S.sounds = 0;
}

function setMasterVolume(v) {
  S.mastervol = clamp(v, 0, 1);
  if (AU.master) AU.master.gain.value = 1;
}
