/* =========================================================================
   main.js — 启动与全局动作
   ========================================================================= */
'use strict';

/* 剪贴板动作（对应 action_copy / action_cut / action_paste / action_delete） */
function actionCopy() {
  if (S.selected === 0) return 0;
  S.clipboard = SEL.code;
}
function actionCut() {
  if (S.selected === 0) return 0;
  S.clipboard = SEL.code;
  selectionDelete(false);
  S.changed = 1;
}
function actionDelete() {
  if (S.selected === 0) return 0;
  selectionDelete(false);
  S.changed = 1;
}
function actionPaste(x, y) {
  if (!S.clipboard) return 0;
  if (S.selected > 0) selectionPlace(false);
  selectionLoadExt(x, y, S.clipboard);
  S.changed = 1;
}

/* 新文件（带确认） */
function newSong() {
  const doIt = () => { reset(); setMsg('已新建文件'); };
  if (S.changed && S.totalblocks > 0) confirmDialogOn(ok => { if (ok) doIt(); }, '当前歌曲尚未保存，确定要新建吗？', '新文件');
  else doIt();
}

/* ---------------------------------------------------------------- 设置持久化 */
const SETTINGS_KEY = 'nbsweb.settings.v1';
// 需要跨刷新保留的配置项。
// 与 NBS 的 save_settings.gml / load_settings.gml 对照而来，覆盖首选项对话框里所有可调项，
// 外加若干菜单开关。之前只存了十来个（theme/fdark/use_icons…），
// 首选项里改「暗色模式/全黑模式/删除效果/自动保存/存档版本/滚轮行为/每层音量/声道…」
// 刷新后全部丢失，就是因为它们不在这个清单里。
const SETTINGS_FIELDS = [
  // 外观 / 主题
  'theme', 'fdark', 'blackout', 'remove_effect', 'window_scale', 'hires',
  // 界面布局
  'show_layers', 'show_piano', 'show_keynames', 'show_keynumbers', 'show_keyboard',
  'show_numbers', 'show_octaves', 'show_incompatible', 'show_outofrange',
  'use_icons', 'use_shapes', 'show_soundcount', 'show_notechart', 'fullscreen',
  // 声音
  'windowsound', 'mastervol', 'use_bpm', 'autosave', 'autosavemins',
  'show_oldwarning', 'channelstoggle', 'realvolume', 'realstereo',
  // 播放 / 进度条
  'marker_follow', 'marker_pagebypage', 'marker_start', 'marker_end',
  'loop_session', 'loopmax',
  // 输入
  'changepitch', 'mousewheel', 'select_lastpressed', 'keysshow', 'startkey',
  'keynames_flat', 'sharpkeys',
  // 音符默认值（首选项「外观」页的 音量/声像/音高 等）
  'setvel', 'setpan', 'setpit', 'percentvel',
  // 自动化预设（琶音 / 颤音 / 断奏）
  'arp_pattern', 'stag_pattern', 'trem_spacing', 'stereo_width',
  // 反向与音域
  'porta_reverse', 'stereo_reverse', 'port_cent',
  // MIDI 导入选项
  'midiRemember', 'midiRemoveSilent', 'midiNameLayers', 'midiNamePatch',
  'midiTempo', 'midiVel', 'midiOctave',
  // 「只提示一次」类警告的已确认标记。
  // 对照 load_settings.gml:173-175 / save_settings.gml:168-170，原版把这三个
  // 存在 ini 的 [warnings] 段里（octaves / instrument / schematics），
  // 所以确认过一次之后，重启程序也不会再弹。
  // 之前这里漏了，warning_schematic 只存在内存里，刷新页面就归零，
  // 于是「此警告将不再提示」实际上每次刷新后都会再提示一次。
  'warning_schematic', 'warning_octaves', 'warning_instrument',
  // 存档
  'save_version',
];

function saveSettings() {
  const o = {};
  for (const k of SETTINGS_FIELDS) o[k] = S[k];
  o.piano_key = S.piano_key;
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(o)); } catch (e) { }
}
function loadSettings() {
  try {
    const o = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    for (const k of SETTINGS_FIELDS) if (o[k] !== undefined) S[k] = o[k];
    if (Array.isArray(o.piano_key) && o.piano_key.length === 88) S.piano_key = o.piano_key;
  } catch (e) { }
}

/* ---------------------------------------------------------------- 自动保存 / 恢复 */
const AUTOSAVE_KEY = 'nbsweb.autosave.v1';

function autosaveWrite() {
  try {
    const bytes = buildNBS(S.save_version);
    if (bytes.length > 3 * 1024 * 1024) return;
    let bin = '';
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    }
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({
      time: Date.now(),
      name: S.filename || S.song_name || '未命名歌曲',
      b64: btoa(bin),
    }));
    setMsg('已自动保存');
  } catch (e) { /* 容量不足时忽略 */ }
}

function checkAutosaveRecovery() {
  let rec = null;
  try { rec = JSON.parse(localStorage.getItem(AUTOSAVE_KEY) || 'null'); } catch (e) { }
  if (!rec || !rec.b64) return;
  const when = new Date(rec.time).toLocaleString();
  confirmDialogOn(ok => {
    if (!ok) { localStorage.removeItem(AUTOSAVE_KEY); return; }
    try {
      const bin = atob(rec.b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      loadNBSToEditor(arr.buffer, rec.name);
      S.changed = 1;
      setMsg('已恢复自动保存的歌曲');
    } catch (e) { messageDialog('恢复失败：' + e.message, '错误'); }
    localStorage.removeItem(AUTOSAVE_KEY);
  }, '检测到上次未正常保存的歌曲（' + when + '）。\n要恢复它吗？', '自动恢复');
}

/* ---------------------------------------------------------------- 启动 */
async function boot() {
  G.canvas = document.getElementById('screen');
  G.ctx = G.canvas.getContext('2d', { alpha: false });
  const bar = document.getElementById('loadbar');
  const msg = document.getElementById('loadmsg');
  const setProgress = (p, m) => {
    bar.style.width = Math.round(clamp(p, 0, 1) * 100) + '%';
    if (m) msg.textContent = m;
  };

  initInstruments();
  editorInit();
  loadSettings();
  draw_accent_init();
  // 注意：这里【不能】再无条件写 S.window_scale = 1。
  // loadSettings() 刚从 localStorage 恢复了缩放（含用户手动拖出来的值），
  // 之前这一行紧跟在 loadSettings 之后把它抹回 100%，
  // 所以「缩放在刷新后总是变回 100%」。
  // 只在读取失败/值非法时兜底成 1。
  if (!(typeof S.window_scale === 'number') || !isFinite(S.window_scale) || S.window_scale <= 0) {
    S.window_scale = 1;
  }
  resizeCanvas();
  computeLayout();
  initInput();
  initTextInput();

  try {
    await loadAssets((p, m) => setProgress(p * 0.5, m));
    initAudio();
    await loadSounds((p, m) => setProgress(p, m));
  } catch (e) {
    console.error(e);
    msg.textContent = '资源载入失败：' + e.message + '（请通过本地服务器打开，例如 python -m http.server）';
    return;
  }

  setProgress(1, '准备就绪');
  document.getElementById('loading').classList.add('hide');

  // 首次交互后恢复音频上下文
  const resume = () => { resumeAudio(); window.removeEventListener('pointerdown', resume); };
  window.addEventListener('pointerdown', resume);

  window.addEventListener('resize', () => { resizeCanvas(); computeLayout(); });

  // 拖放打开
  const app = document.getElementById('app');
  window.addEventListener('dragover', (e) => { e.preventDefault(); app.classList.add('dragover'); });
  window.addEventListener('dragleave', (e) => { if (e.target === document.body) app.classList.remove('dragover'); });
  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    app.classList.remove('dragover');
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f) return;
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    const ab = await f.arrayBuffer();
    try {
      if (ext === 'nbs') { loadNBSToEditor(ab, f.name); addToRecent(f.name, ab); }
      else if (ext === 'mid' || ext === 'midi') importMidi(ab, f.name);
      else if (ext === 'nbp') {
        /* 拖拽打开：与菜单「导入片段」同一个函数，导入后立刻落地 */
        const r = patternImportBytes(ab);
        if (!r.ok) messageDialog(r.msg, '提示');
        else setMsg('片段已导入并放置在 ' + (r.x + 1) + ' 列 / ' + (r.y + 1) + ' 层');
      } else messageDialog('不支持的文件类型：.' + ext, '错误');
    } catch (err) { messageDialog('打开失败：' + err.message, '错误'); }
  });

  startLoop(mainFrame);
  setTimeout(checkAutosaveRecovery, 600);
}

// 调试/自动化测试钩子（不影响正常使用）
window.__NBS__ = {
  get S() { return S; }, get UI() { return UI; }, get G() { return G; },
  get INS() { return INSTRUMENTS; },
  menu: () => (UI.menu ? UI.menu.name : null),
  closeMenu: () => closeMenu(),
  importMidi, applyMidiImport, loadNBSToEditor, buildNBS, parseMidi,
  addBlock, recalcSong, selectionAdd, selectionPlace,
  gExists, gKey, gIns, gVel, gPan, gPit, gidx,
  get menuObj() { return UI.menu; },
  get startbMax() { return Math.max(0, S.endb - S.totalrows + 1); },
  get startaMax() { return Math.max(0, S.enda - S.totalcols + 1); },
};

function mainFrame(dt) {
  editorFrame(dt);
  // 状态栏声音数
  if (S.show_soundcount) S.sounds = AU.voices.length;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
