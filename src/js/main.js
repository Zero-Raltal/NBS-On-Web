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
  /* show_welcome —— 启动时是否显示问候窗口。
     对照 save_settings.gml / load_settings.gml 里 ini 的 "show_greeting"。
     必须持久化：用户关掉它就是为了下次别再弹，记不住等于开关无效。 */
  'show_welcome',
  // 播放 / 进度条
  'marker_follow', 'marker_pagebypage', 'marker_start', 'marker_end',
  'loop_session', 'loopmax',
  // 输入
  'changepitch', 'mousewheel', 'select_lastpressed', 'keysshow', 'startkey',
  'keynames_flat', 'sharpkeys',
  /* keysmax —— 钢琴显示多少个琴键（首选项「外观」页的滑块，范围 20-50）。
     用户报："琴键数量好像没有被写入本地配置，刷新了一下就丢失"。
     对照 save_settings.gml:41  `keys_to_show` → keysmax，
     它属于 preferences 段，原版是存的。我们漏了。
     这个字段、以及下面 27 个，都是同类问题：功能做了、界面能改，
     但没进这份清单，于是刷新即丢。
     我是用 tmp/cmp_settings.js 拿原版 save_settings.gml 的 109 项
     逐条比对出来的，不是靠猜。 */
  'keysmax',
  // 主题/显示
  'use_colors',
  /* fade —— 音符盒不透明（save_settings.gml 的 use_fading）。
     这个字段之前连默认值都没有，是个死控件；顺带补上默认值与渲染读取。 */
  'fade',
  /* tapdouble —— 速度测量器的「双倍速度」（save_settings.gml:62）。
     上一轮刚移植的功能，忘了同步加到持久化清单里。 */
  'tapdouble',
  /* structure —— 结构方块后方的草稿区显示（schematic 导出相关，懒初始化）。 */
  'structure',
  // MIDI 导入
  'midiMaxHeight', 'midiPrecision',
  /* 存档导出（schematic / datapack）的全部选项。
     对照 save_settings.gml 的 [schematic_export] / [branch_export] /
     [datapack_export] 三个段。这些变量在我们的 schematic.js 里
     是惰性初始化的（`if (S.x === undefined) S.x = 默认值`），
     值都是布尔或数字，序列化安全。 */
  'sch_exp_layout', 'sch_exp_notesperrow', 'sch_exp_glass', 'sch_exp_chest',
  'sch_exp_minecraft_old', 'command_block',
  'sch_exp_stereo', 'sch_exp_velocity', 'sch_exp_circuitry', 'sch_exp_vertical',
  'sch_exp_polyphony', 'sch_exp_layer1', 'sch_exp_layer2', 'sch_exp_layer3',
  'sch_exp_range_start', 'sch_exp_range_end',
  /* 【schematic 导出里之前漏存的一大批判定项 —— 对照
     save_settings.gml:100-124（[schematic_export] 段）】
     · 垫底方块三件套（走道 / 电路 / 地面）：每个都是 id + data 两个值，
       用户改过之后导出文件里音符盒下方铺的方块种类就变了，
       不持久化等于每次刷新都被 reset_schematic_export 覆盖回默认。
     · include_locked / compress / loop：是否包含静音层、是否压缩图层、是否循环。
     · minecart：矿车道。
     · ins_block_N / ins_data_N：每个音色的底座方块（按索引展开，单独处理）。 */
  'sch_exp_walkway_block', 'sch_exp_walkway_data',
  'sch_exp_circuit_block', 'sch_exp_circuit_data',
  'sch_exp_ground_block', 'sch_exp_ground_data',
  'sch_exp_includelocked', 'sch_exp_compress', 'sch_exp_loop', 'sch_exp_minecart',
  'dat_mcversion', 'dat_radius', 'dat_glow', 'dat_xval', 'dat_yval', 'dat_zval',
  /* 【数据包里之前漏存的导出选项 —— 对照 save_settings.gml:140-156】
     名字 / 命名空间 / 路径 / 音源 / 是否 zip / 包含静音层 / 包含超范围 /
     半径开关 / 循环 / 可视化与类型。这些不存的话，用户每次导出数据包
     都要重新填名字和命名空间。 */
  'dat_name', 'dat_namespace', 'dat_path', 'dat_source', 'dat_usezip',
  'dat_includelocked', 'dat_includeoutofrange', 'dat_enableradius',
  'dat_enablelooping', 'dat_visualizer', 'dat_vis_type',
  // 音符默认值（首选项「外观」页的 音量/声像/音高 等）
  'setvel', 'setpan', 'setpit', 'percentvel',
  /* addpitch —— 「设定音高」的加法模式勾选（save_settings.gml:68）。
     这个功能本身刚补完，不持久化的话刷新就丢。 */
  'addpitch',
  /* Tremolo 的模式与手动淡入淡出参数（save_settings.gml 对应
     tremolotype / fade_auto / leg_dec / leg_sus，control_create.gml:548-552）。
     以前这几个状态连初值都没有，只存在于 draw_window_macro_tremolo 的
     单选框里，刷新后回到 undefined。 */
  'tremolotype', 'fade_auto', 'leg_dec', 'leg_sus',
  // 自动化预设（琶音 / 颤音 / 断奏）
  'arp_pattern', 'stag_pattern', 'trem_spacing', 'stereo_width',
  // 反向与音域
  'porta_reverse', 'stereo_reverse', 'port_cent',
  // MIDI 导入选项
  'midiRemember', 'midiRemoveSilent', 'midiNameLayers', 'midiNamePatch',
  'midiTempo', 'midiVel', 'midiOctave',
  /* midiTempoChanger：「速度变化」（原版 w_midi_tempo_changer）。
     导入带变速的 MIDI 时是否把变速事件写进第 0 层。 */
  'midiTempoChanger',
  // MIDI 输入设备（实时录入）与音频渲染导出
  'midiRecord', 'midiRecordAdvance', 'render_samplerate',
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
  for (const k of SETTINGS_FIELDS) {
    /* 【undefined 不能直接存】
       JSON.stringify 会直接丢掉值为 undefined 的键 —— 存进去等于没存，
       而且下次 loadSettings 也读不到，静默失败、很难察觉。
       这类字段大多是"惰性初始化"的（例如 S.sch_exp_layout 要等用户
       打开过一次存档导出窗口才被赋值），所以确实可能在这一刻是 undefined。
       这里跳过它们：等字段真正有了值，下一次 saveSettings 自然会存上。
       （不要写 null：null 读回来会把 S.keysmax 之类变成 null，
         参与 min/clamp 运算时会算成 0，比 undefined 更糟。） */
    if (S[k] === undefined) continue;
    o[k] = S[k];
  }
  o.piano_key = S.piano_key;
  /* 【内置音色的 press（"是否会按键"）标记 —— 对照 save_settings.gml:167-170】
     原版把前 first_custom_index（=16）个内置音色的 press 标记按
     ins_0_press .. ins_15_press 存进 ini。我们之前完全没存，
     用户改了「音色是否会按键」的开关，刷新页面就丢 —— 是真实的功能缺陷。
     自定义音色不存：它们的 press 随歌曲文件里的音色段走。 */
  if (typeof INSTRUMENTS !== 'undefined' && Array.isArray(INSTRUMENTS)) {
    o.ins_press = INSTRUMENTS.slice(0, S.first_custom_index).map((i) => (i && i.press ? 1 : 0));
  }
  /* 每个音色的底座方块 —— 对照 save_settings.gml:116-124
     （ini 里按索引展开成 ins_block_0..N / ins_data_0..N）。
     这里存成两个数组，比逐键展开更省地方，语义相同。
     这两个数组是惰性初始化的（schematic.js 里 `if (!S.sch_exp_ins_block)`），
     所以可能此刻还是 undefined —— 只有真正有值时才写。 */
  if (Array.isArray(S.sch_exp_ins_block)) o.sch_exp_ins_block = S.sch_exp_ins_block;
  if (Array.isArray(S.sch_exp_ins_data)) o.sch_exp_ins_data = S.sch_exp_ins_data;
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(o)); } catch (e) { }
}
function loadSettings() {
  try {
    const o = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    for (const k of SETTINGS_FIELDS) if (o[k] !== undefined) S[k] = o[k];
    if (Array.isArray(o.piano_key) && o.piano_key.length === 88) S.piano_key = o.piano_key;
    // 内置音色的 press 标记（见 saveSettings 里的说明）
    if (Array.isArray(o.ins_press) && typeof INSTRUMENTS !== 'undefined' && Array.isArray(INSTRUMENTS)) {
      const n = Math.min(o.ins_press.length, S.first_custom_index, INSTRUMENTS.length);
      for (let i = 0; i < n; i++) if (INSTRUMENTS[i]) INSTRUMENTS[i].press = !!o.ins_press[i];
    }
    // 每个音色的底座方块（见 saveSettings 里的说明）
    if (Array.isArray(o.sch_exp_ins_block) && o.sch_exp_ins_block.length) S.sch_exp_ins_block = o.sch_exp_ins_block;
    if (Array.isArray(o.sch_exp_ins_data) && o.sch_exp_ins_data.length) S.sch_exp_ins_data = o.sch_exp_ins_data;
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
    /* JS 跑起来之后由我们接管进度条（这时才有真实的资源载入进度）。
       注意这里写 inline style，会盖过构建时插入的分段 <style>，
       所以一旦 JS 接管，CSS 那条"解析进度"就自然退场了。
       另外给 barwrap 加 .js-takeover，让 .done 规则能盖过 inline style。 */
    const wrap = document.getElementById('barwrap');
    if (wrap && !wrap.classList.contains('js-takeover')) wrap.classList.add('js-takeover');
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
  /* 触屏初始化排在 resizeCanvas 之前：touchInit 判定初始输入模态
     （只影响长按/拖动等交互方式，不再影响缩放 —— 缩放完全跟随用户设置）。 */
  if (typeof touchInit === 'function') touchInit();
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
  // 真正的完成信号：让 CSS 那条规则把宽度坐实到 100%（盖过 inline style）
  const wrapEl = document.getElementById('barwrap');
  if (wrapEl) wrapEl.classList.add('done');
  document.getElementById('loading').classList.add('hide');

  /* 【启动时打开问候窗口】
     对照 control_create.gml:586 `if (show_welcome) window = w_greeting`。
     必须在所有资源加载完之后 —— 窗口里要画 spr_logo / spr_frame2 / spr_bigicons，
     资源没就绪就打开会画成空白。
     在此之前 W_GREETING 只有常量、没有绘制函数，drawWindows() 的 default 分支
     又会把未知窗口 `S.window = 0` 清掉，所以它从来没出现过。 */
  if (S.show_welcome) S.window = W_GREETING;

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
    await openFileObject(f);
  });

  startLoop(mainFrame);
  setTimeout(checkAutosaveRecovery, 600);
}

/* 按【文件后缀】判断类型并分发到对应处理器。
   这是整个应用唯一的「打开一个文件」入口，文件菜单、问候窗口、拖拽
   都走这里 —— 三条路径的行为必须完全一致，否则同一份文件
   拖进来能开、从菜单选就打不开。

   【为什么用后缀而不是 accept】
   .nbs / .nbp / .cbnd 都是自定义扩展名，没有注册的 MIME 类型。
   文件选择框的 accept 过滤在 Safari、部分 Android WebView 和若干
   国产浏览器上对未知后缀的处理不一致，会把这些文件直接灰掉，
   用户根本选不中 —— 表现就是「无法导入 nbs / cbnd」。
   所以选择框不再设 accept（见 nbs.js 的 pickFile），
   类型判断全部在这里按后缀做，行为可预期、跨浏览器一致。

   返回 true 表示有人接手了，false 表示后缀不认识（调用方给提示）。 */
async function dispatchFile(ab, name) {
  const ext = fileExt(name);

  // ---- 歌曲工程 ----
  if (ext === 'nbs') { loadNBSToEditor(ab, name); addToRecent(name, ab); return true; }
  // ---- MIDI（导入为歌曲） ----
  if (ext === 'mid' || ext === 'midi') { importMidi(ab, name); return true; }
  // ---- 片段 ----
  if (ext === 'nbp') {
    const r = patternImportBytes(ab);
    if (!r.ok) messageDialog(r.msg, '提示');
    else setMsg('片段已导入并放置在 ' + (r.x + 1) + ' 列 / ' + (r.y + 1) + ' 层');
    return true;
  }
  // ---- cbnote：位流格式，从文件头判断而不是只信后缀（.cbnd 也常被改名） ----
  if (ext === 'cbnd' || (typeof looksLikeCbnd === 'function' && looksLikeCbnd(ab))) {
    importCbndBytes(ab, name);
    return true;
  }
  // ---- cbnote：指令文本。用户常常存成 .mcfunction / .txt / .log ----
  if (ext === 'txt' || ext === 'log' || ext === 'mcfunction' || ext === 'cmds' || ext === 'cmd') {
    importCommandTextBytes(ab, name);
    return true;
  }
  return false;
}

/* 打开一个 File 对象（浏览器 File / Blob）。
   原来这段逻辑直接内联在 drop 事件里，问候窗口的「打开本地文件…」也要用，
   所以抽出来共用。 */
async function openFileObject(f) {
  if (!f) return;
  let ab;
  try { ab = await f.arrayBuffer(); }
  catch (e) { messageDialog('读取文件失败：' + e.message, '错误'); return; }
  let ok = false;
  try { ok = await dispatchFile(ab, f.name); }
  catch (e) { messageDialog('打开失败：' + e.message, '错误'); return; }
  if (!ok) {
    messageDialog('不支持的文件类型：' + (fileExt(f.name) || '（无扩展名）')
      + '\n\n支持：.nbs .nbp .mid .midi .cbnd .txt .mcfunction', '错误');
  }
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
