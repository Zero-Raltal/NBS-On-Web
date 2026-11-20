/* =========================================================================
   mididevice.js — Web MIDI 输入设备

   让玩家用真实 MIDI 键盘（或虚拟端口）直接在编辑器里弹奏/录入音符。
   对应功能：
     · 实时监听 MIDI 输入 → 按当前乐器音色发声（并可选择同时写入音符块）
     · 设备热插拔（navigator.requestMIDIAccess 的 statechange 事件）

   Web MIDI 是浏览器原生 API，但有平台差异：
     · Chrome / Edge 支持（https 或 localhost 下）
     · Firefox / Safari 默认不支持（Firefox 需开启 dom.webmidi.enabled）
     · 单文件版用 file:// 打开时不会授予 MIDI 权限，必须走 http(s)
   所以这里全程做能力检测，失败时给出可读的原因，而不是静默不可用。
   ========================================================================= */
'use strict';

const MIDI_DEV = {
  supported: false,     // 浏览器是否提供 requestMIDIAccess
  access: null,         // MIDIAccess 对象
  inputs: [],           // 已连接的输入端口
  enabled: false,       // 用户是否开启了实时输入
  lastError: '',        // 最近一次失败原因（给对话框显示）
  activeNote: {},       // 正在按住的音（note number → 1），用于避免重复触发
  bound: false,         // 是否已绑定 statechange
};

/* MIDI 音高编号 → NBS key，偏移 −21。
 *
 * 依据（实测 getKeyname）：
 *     NBS 0 = A0，NBS 3 = C1，NBS 39 = C4（中央 C），NBS 87 = C8
 *     MIDI 21 = A0，MIDI 60 = 中央 C
 *   ⇒ NBS key = midiNote − 21
 *   验证：60 → 39（C4 ✓）  21 → 0（A0 ✓）  108 → 87（C8，NBS 上限 ✓）
 * 与 Minecraft 的音域（F#1..F#7 之外靠 pitch 偏移）也吻合。
 */
const MIDI_NOTE_TO_KEY = -21;

function midiAvailable() {
  return typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';
}

/* 请求 MIDI 权限并绑定所有输入端口。
   onNote(note, velocity, isOn) 会在收到消息时调用。 */
function midiInit(onNote) {
  if (!midiAvailable()) {
    MIDI_DEV.lastError = '这个浏览器不支持 MIDI 输入（Web MIDI API）。\n'
      + '请使用 Chrome 或 Edge，并通过 http(s) 打开页面（file:// 无法授予 MIDI 权限）。';
    return Promise.resolve(false);
  }
  if (MIDI_DEV.access) {
    MIDI_DEV.enabled = true;
    return Promise.resolve(true);
  }
  return navigator.requestMIDIAccess({ sysex: false }).then((access) => {
    MIDI_DEV.access = access;
    MIDI_DEV.supported = true;
    MIDI_DEV.enabled = true;
    MIDI_DEV.lastError = '';
    const bind = () => {
      MIDI_DEV.inputs = [];
      access.inputs.forEach((port) => {
        MIDI_DEV.inputs.push(port);
        port.onmidimessage = (ev) => midiHandleMessage(ev, onNote);
      });
    };
    bind();
    // 热插拔：插入/拔出设备时重新绑定
    if (!MIDI_DEV.bound) {
      MIDI_DEV.bound = true;
      access.onstatechange = () => bind();
    }
    return true;
  }).catch((err) => {
    MIDI_DEV.lastError = '无法获取 MIDI 权限：' + (err && err.message ? err.message : String(err))
      + '\n请确认浏览器已允许本站使用 MIDI 设备。';
    return false;
  });
}

function midiStop() {
  MIDI_DEV.enabled = false;
  if (MIDI_DEV.access) {
    MIDI_DEV.access.inputs.forEach((p) => { p.onmidimessage = null; });
  }
  MIDI_DEV.activeNote = {};
}

/* 解析一条 MIDI 消息。
   只处理 note on / note off；control change 里的 123（All Notes Off）
   和 120（All Sound Off）也要识别，否则松开踏板或切换设备后会出现「挂音」。 */
function midiHandleMessage(ev, onNote) {
  if (!MIDI_DEV.enabled) return;
  const d = ev.data;
  if (!d || d.length < 2) return;
  const status = d[0] & 0xf0;
  const note = d[1];
  const vel = d.length > 2 ? d[2] : 0;

  if (status === 0x90 && vel > 0) {          // note on
    if (MIDI_DEV.activeNote[note]) return;   // 同一个音重复 note on，忽略
    MIDI_DEV.activeNote[note] = 1;
    if (onNote) onNote(note, vel, true);
  } else if (status === 0x80 || (status === 0x90 && vel === 0)) {   // note off
    delete MIDI_DEV.activeNote[note];
    if (onNote) onNote(note, 0, false);
  } else if (status === 0xb0 && (d[1] === 123 || d[1] === 120)) {    // all notes off
    const held = Object.keys(MIDI_DEV.activeNote).map(Number);
    MIDI_DEV.activeNote = {};
    if (onNote) for (const n of held) onNote(n, 0, false);
  }
}

/* MIDI 音高 → NBS key（夹在合法范围内） */
function midiNoteToKey(note) {
  return median(0, (note | 0) + MIDI_NOTE_TO_KEY, 87);
}
