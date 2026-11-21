/* =========================================================================
   dialogs.js — 菜单与各类窗口
   ========================================================================= */
'use strict';

/* ---------------------------------------------------------------- 菜单 */
function iconPrefix(n) { return n + '~'; }

function openFileMenu(x, y) {
  const recent = getRecent();
  let recStr = '';
  for (let i = 0; i < recent.length; i++) recStr += '\\' + '' + secondsToStr(floor((Date.now() - recent[i].time) / 1000)) + '$' + trimLabel(recent[i].name, 320) + '|';
  if (!recent.length) recStr = '^!无最近歌曲|';
  const s =
    iconPrefix(ICON.NEW) + 'Ctrl + N$新文件|' +
    iconPrefix(ICON.OPEN) + 'Ctrl+O$打开歌曲......|' +
    '最近歌曲......|\\|' + recStr + (recent.length ? '-|清除最近歌曲' : '') + '|/|-|' +
    iconPrefix(ICON.SAVE) + 'Ctrl+S$保存歌曲|' +
    iconPrefix(ICON.SAVE_AS) + '另存为...|保存选项......|-|' +
    (S.selected !== 0 ? '^!' : '') + '导入片段......|' +
    (S.selected === 0 ? '^!' : '') + '导出片段......|' +
    '从 MIDI 文件导入......|MIDI 输入设备......|-|' +
    '从 CBND 导入......|从指令文本导入......|-|' +
    '导出为数据包......|导出为 schematic......|导出为音频（WAV）......|-|' +
    '关于本作品......';
  showMenu('file', x, y, s);
}
function trimLabel(s, n) { return s.length > 30 ? s.slice(0, 30) + '…' : s; }

function openEditMenu(x, y) {
  let insStr = '';
  for (let a = 0; a < INSTRUMENTS.length; a++) insStr += '...为 ' + INSTRUMENTS[a].name + '|';
  const s =
    (!canUndo() ? '^!' : '') + iconPrefix(canUndo() ? ICON.UNDO : ICON.UNDO_INACTIVE) + 'Ctrl+Z$撤销|' +
    (!canRedo() ? '^!' : '') + iconPrefix(canRedo() ? ICON.REDO : ICON.REDO_INACTIVE) + 'Ctrl+Y$重做|-|' +
    (S.selected === 0 ? '^!' : '') + iconPrefix(S.selected ? ICON.COPY : ICON.COPY_INACTIVE) + 'Ctrl+C$复制|' +
    (S.selected === 0 ? '^!' : '') + iconPrefix(S.selected ? ICON.CUT : ICON.CUT_INACTIVE) + 'Ctrl+X$剪切|' +
    (!S.clipboard ? '^!' : '') + iconPrefix(S.clipboard ? ICON.PASTE : ICON.PASTE_INACTIVE) + 'Ctrl+V$粘贴|' +
    (S.selected === 0 ? '^!' : '') + iconPrefix(S.selected ? ICON.DELETE : ICON.DELETE_INACTIVE) + 'Delete$删除|-|' +
    (S.totalblocks === 0 ? '^!' : '') + 'Ctrl+A$全选|' +
    (S.selected === 0 ? '^!' : '') + '全不选|' +
    'Ctrl+I$选择反转|-|' +
    (S.totalblocks === 0 ? '^!' : '') + '选择右侧所有 ->|' +
    (S.totalblocks === 0 ? '^!' : '') + '选择左侧所有 <-|-|' +
    '选择所有 ' + (INSTRUMENTS[S.instrument] ? INSTRUMENTS[S.instrument].name : '') + '|' +
    '选择所有除了 ' + (INSTRUMENTS[S.instrument] ? INSTRUMENTS[S.instrument].name : '') + '|-|' +
    (S.selected === 0 ? '^!' : '') + 'Ctrl+E$更换音调模式|' +
    (S.selected === 0 ? '^!' : '') + 'Ctrl+D$更换音量模式|' +
    (S.selected === 0 ? '^!' : '') + 'Ctrl+R$更换声道模式|' +
    (S.selected === 0 ? '^!' : '') + 'Ctrl+F$更换音高模式|-|' +
    '更改音色......|\\|' + insStr + '/|-|' +
    (S.selected === 0 ? '^!' : '') + '扩展选区|' +
    (S.selected === 0 ? '^!' : '') + '压缩选区|-|' +
    (S.selected === 0 ? '^!' : '') + '宏......|\\||' +
    'Ctrl+Shift+A$Tremolo...|Ctrl+Shift+S$Stereo...|Ctrl+Shift+D$Arpeggio...|' +
    'Ctrl+Shift+F$Portamento...|Ctrl+Shift+G$Vibrato|Ctrl+Shift+H$Stagger...|' +
    'Ctrl+Shift+J$Chorus|Ctrl+Shift+K$Volume LFO|Ctrl+Shift+Q$淡入|Ctrl+Shift+W$淡出|' +
    'Ctrl+Shift+E$替换音|Ctrl+Shift+R$设定音量......|Ctrl+Shift+T$设定声道......|' +
    'Ctrl+Shift+Y$设定音高......|Ctrl+Shift+U$重置所有属性|/|-|' +
    (S.selected === 0 ? '^!' : '') + '转换所有超出八度范围的音符';
  showMenu('edit', x, y, s);
}

function openSettingsMenu(x, y) {
  // 对照 control_draw:1631-1650：先是一列音色（带 Ctrl+数字 快捷键提示），再是各对话框入口
  let insStr = '';
  for (let a = 0; a < INSTRUMENTS.length; a++) {
    const n = INSTRUMENTS[a].name;
    const chk = S.instrument === a ? iconPrefix(ICON.CHECK) : '';
    const sc = a < 9 ? 'Ctrl+' + ((a + 1) % 10) : '      Ctrl+Shift+' + ((a + 2) % 10);
    insStr += chk + sc + '$' + n + '|';
  }
  const s = '音色|\\|' + insStr + '/|' +
    iconPrefix(ICON.INSTRUMENTS) + '音色设置......|-|' +
    iconPrefix(ICON.INFORMATION) + '歌曲信息......|' +
    iconPrefix(ICON.PROPERTIES) + '歌曲属性......|歌曲数据......|-|' +
    iconPrefix(ICON.MIDI_INPUT || ICON.INFORMATION) + 'MIDI 设备管理器|Ctrl+P$首选项......';
  showMenu('settings', x, y, s);
}

/* 时间轴右键：区间菜单（对照 control_draw:242-253） */
function openSectionMenu() {
  const has = S.section_exists;
  const s =
    (has ? '' : '^!') + '移除区间|' +
    (!has || S.section_start > S.enda ? '^!' : '') + '跳到区间开始|' +
    (!has || S.section_end > S.enda ? '^!' : '') + '跳到区间结束|-|' +
    (has ? '' : '^!') + '选中区间内方块|-|' +
    (S.marker_start ? iconPrefix(ICON.CHECK) : '') + '从区间开始播放|' +
    (S.marker_end ? iconPrefix(ICON.CHECK) : '') + '区间后结束播放';
  showMenu('section', G.mouse.x, G.mouse.y, s);
}

function openHelpMenu(x, y) {
  // 用户要求去掉「教程视频」和「访问官方网站」两个外链条目（网页版里没意义）。
  // 原版 control_draw.gml:1741 里的这两组保留在源码里，这里按需求删除，
  // 只留下仍然有实际作用的「GitHub」「更新历史」「关于」。
  const s = iconPrefix(ICON.INTERNET) + 'GitHub......|-|' +
    '更新历史......|关于......';
  showMenu('help', x, y, s);
}

/* clean(str)：对照 clean.gml —— 菜单字符串里的保留字符要转义，
   否则乐器名里一旦出现 | ^! ~ $ 就会把菜单结构撑坏。 */
function cleanMenuName(str) {
  return String(str)
    .replace(/\|/g, 'l')
    .replace(/\^!/g, '!')
    .replace(/~/g, ' - ')
    .replace(/\$/g, 'S');
}

/* get_mode_actions(num)：对照 get_mode_actions.gml
   按当前编辑模式（音调/音量/声道/音高）返回第 num 个操作的名称。 */
function modeActions(num) {
  switch (S.editmode | 0) {
    case 0: // m_key 音调
      return ['', '升高八度', '降低八度', '升高半音', '降低半音'][num] || '';
    case 1: // m_vel 音量
      return ['', '增加 10 音量', '减少 10 音量', '增加音量', '减少音量',
        '设定音量...', '重置音量'][num] || '';
    case 2: // m_pan 声道
      return ['', '向右声道移动 10', '向左声道移动 10', '向右声道移动', '向左声道移动',
        '设定音符声道...', '重置立体声'][num] || '';
    default: // m_pit 音高
      return ['', '上调 10 微调', '下调 10 微调', '上调 1 微调', '下调 1 微调',
        '设定音高...', '重置音高'][num] || '';
  }
}

/* 画布右键菜单。
   完整对照 control_draw.gml:606-690 —— 原版在这里弹出的是 "editext"，
   包含「更改音色」的乐器子菜单（超过 25 个自动分页成「更多......」）、
   按编辑模式变化的 4 个快捷键项、以及只在该模式下出现的两个额外项。
   我之前只写了其中的一部分：少了选择右/左、选择所有 XX、模式相关的
   Ctrl+E/D/R/F/T/G 六项、以及乐器的「更多......」分页。 */
function openEditContextMenu() {
  const insList = INSTRUMENTS;
  // 乐器子菜单：每 25 个插一个「更多......」分页（对照 :618-621）
  let builtinStr = '', customStr = '', insmenu = 0;
  for (let a = 0; a < insList.length; a++) {
    const ins = insList[a];
    const item = '...为 ' + cleanMenuName(ins.name) + '|';
    if (ins.user) customStr += item; else builtinStr += item;
    if (a % 25 === 0 && a > 1 && a < insList.length - 1) {
      customStr += '-|更多......|\\|';
      insmenu++;
    }
  }
  const dd = (cond) => (cond ? '^!' : '');
  const sel0 = S.selected === 0;
  const noSel = dd(sel0);
  const tb0 = S.totalblocks === 0;
  const noExpand = dd(sel0 || !S.selection_l);
  // Ctrl+T / Ctrl+G 只在当前编辑模式不是「音调」时出现（对照 :639-640 condstr）
  const extraMode = (S.editmode | 0) !== 0;
  const s =
    noSel + iconPrefix(ICON.COPY) + 'Ctrl+C$复制|' +
    noSel + iconPrefix(ICON.CUT) + 'Ctrl+X$剪切|' +
    dd(!S.clipboard) + iconPrefix(ICON.PASTE) + 'Ctrl+V$粘贴|' +
    noSel + iconPrefix(ICON.DELETE) + 'Delete$删除|-|' +
    dd(tb0) + 'Ctrl+A$全选|' +
    noSel + '全不选|' +
    dd(sel0 && tb0) + 'Ctrl+I$选择反转|-|' +
    dd(tb0 || S.selbx >= S.enda) + '选择右侧所有 ->|' +
    dd(tb0 || S.selbx <= 0) + '选择左侧所有 <-|-|' +
    dd(!(INSTRUMENTS[S.instrument] && INSTRUMENTS[S.instrument].num_blocks)) +
      '选择所有 ' + cleanMenuName((INSTRUMENTS[S.instrument] || {}).name || '') + '|' +
    dd(INSTRUMENTS[S.instrument] && INSTRUMENTS[S.instrument].num_blocks === S.totalblocks) +
      '选择所有除了 ' + cleanMenuName((INSTRUMENTS[S.instrument] || {}).name || '') + '|-|' +
    noSel + 'Ctrl+E$' + modeActions(1) + '|' +
    noSel + 'Ctrl+D$' + modeActions(2) + '|' +
    noSel + 'Ctrl+R$' + modeActions(3) + '|' +
    noSel + 'Ctrl+F$' + modeActions(4) + '|' +
    (extraMode ? noSel + 'Ctrl+T$' + modeActions(5) + '|' : '') +
    (extraMode ? noSel + 'Ctrl+G$' + modeActions(6) + '|' : '') +
    noSel + '更改音色......|\\|' + builtinStr +
      (customStr ? '-|' : '') + customStr + '/|'.repeat(insmenu) + '-|' +
    noExpand + '扩展选区|' +
    noExpand + '压缩选区|' +
    noExpand + '宏......|\\||' +
    'Ctrl+Shift+A$Tremolo...|' +
    'Ctrl+Shift+S$Stereo...|' +
    'Ctrl+Shift+D$Arpeggio...|' +
    'Ctrl+Shift+F$Portamento...|' +
    'Ctrl+Shift+G$Vibrato|' +
    'Ctrl+Shift+H$Stagger...|' +
    'Ctrl+Shift+J$Chorus|' +
    'Ctrl+Shift+K$Volume LFO|' +
    'Ctrl+Shift+Q$淡入|' +
    'Ctrl+Shift+W$淡出|' +
    'Ctrl+Shift+E$替换音|' +
    'Ctrl+Shift+R$设定音量...|' +
    'Ctrl+Shift+T$设定声道...|' +
    'Ctrl+Shift+Y$设定音高...|' +
    'Ctrl+Shift+U$重置所有属性|' +
    '/|-|' +
    noSel + '转换所有超出八度范围的音符';
  showMenu('editctx', G.mouse.x, G.mouse.y, s);
  /* 对照 control_draw.gml:700 `menu.menuc = selbx`：
     「选择左侧/右侧所有」必须以【打开菜单那一刻】鼠标所在的列为分界。
     之前直接用实时的 S.selbx，菜单一打开、鼠标再移动（哪怕是去点菜单项，
     指针必然要离开原位置）就会拿到新列，于是分界线跟着鼠标跑 ——
     表现就是"在音符块左边点选择左侧所有，那个块却被选中"。
     GML 里 menuc 只在菜单创建时赋值一次，之后保持不变，这里同样存快照。 */
  const mm = UI.menu && UI.menu.menus && UI.menu.menus[0];
  if (mm) { mm.menuc = S.selbx; }
  if (UI.menu) UI.menu.menuc = S.selbx;
}

/* 菜单动作分发
   idx  = 跨菜单的全局项序号（对照 show_menu_ext 的 item_n，音色子菜单的 1 开始偏移靠它）
   spos = 该项在"本级菜单"内的序号（不含分隔符）。音色子菜单用它直接拿到乐器下标，
          对照 menu_click 里 `ins = sel - 18` 的算法，但不受上级菜单项数变化影响。 */
/* target：对照 GML 的 obj_menu.menub —— 菜单「在操作哪个对象」的行号/索引。
   由 drawMenu 在 closeMenu() 之前取出并传入（因为 UI.menu 会被清空，
   而 GML 里 obj_menu 是常驻对象，menub 在菜单关闭后仍然有效）。
   menuc：同上，是「打开菜单时鼠标所在列」的快照（对照 obj_menu.menuc），
   供「选择左侧/右侧所有」当分界线用。 */
function menuAction(menu, label, idx, spos, target, menuc) {
  if (menu === 'file') {
    if (label === '新文件') newSong();
    else if (label === '打开歌曲......') loadSongDialog();
    else if (label === '保存歌曲') saveSongFile(false);
    else if (label === '另存为...') saveSongFile(true);
    else if (label === '保存选项......') S.window = W_SAVEOPTIONS;
    else if (label === '清除最近歌曲') { localStorage.removeItem(RECENT_KEY); setMsg('已清除最近歌曲'); }
    else if (label.startsWith('<1 min') || label.startsWith('<')) { }
    else if (label === '导入片段......') pickFile('.nbp', (ab) => {
      /* 用 patternImportBytes() 而不是 actionPaste()：
         后者只把内容装进浮动选区，要玩家再点一次左键才落地（见 nbs.js 里的说明）。 */
      try {
        const r = patternImportBytes(ab);
        if (!r.ok) { messageDialog(r.msg, '提示'); return; }
        setMsg('片段已导入并放置在 ' + (r.x + 1) + ' 列 / ' + (r.y + 1) + ' 层');
      } catch (e) { messageDialog('导入片段失败：' + e.message, '错误'); }
    });
    else if (label === '导出片段......') { if (S.selected) downloadBytes(buildPattern(), (S.song_name || 'pattern') + '.nbp'); }
    else if (label === '从 MIDI 文件导入......') pickFile('.mid,.midi', (ab, n) => { try { importMidi(ab, n); } catch (e) { messageDialog(e.message, '错误'); } });
    else if (label === 'MIDI 输入设备......') openMidiDevice();
    // cbnote 的两种格式：.cbnd 位流 与 指令 .txt。实现在 js/cbnd.js
    else if (label === '从 CBND 导入......') importCbndDialog();
    else if (label === '从指令文本导入......') importCommandTextDialog();
    /* 音频渲染导出：OfflineAudioContext 一次性算完再编码成 WAV。
       实现在 js/render.js。渲染期间要连点保护（重复点击会并发渲染）。 */
    else if (label === '导出为音频（WAV）......') {
      if (S.rendering) { setMsg('正在渲染，请稍候...'); return; }
      S.rendering = 1;
      exportSongAudio(S.song_name || S.filename)
        .catch((e) => messageDialog('导出音频失败：\n' + e.message, '错误'))
        .then(() => { S.rendering = 0; });
    }
    else if (label === '导出为数据包......') {
      // 对照 menu_click.gml：window = w_datapack_export
      S.playing = 0; S.window = W_DATAPACK_EXPORT;
    }
    else if (label === '导出为 schematic......') {
      // 对照 menu_click.gml：if (calculate_size()) window = w_schematic_export
      // calculate_size() 在 GML 里兼做「兼容性询问 + selection_place(0)」，
      // 这里把它拆成 calculateSize()（纯统计）和下面的提示。
      if (calculateSize()) {
        if (!S.warning_schematic) {
          S.warning_schematic = 1;
          // 对照 calculate_size.gml:7 —— 设完标记立刻 save_settings()，
          // 而不是等用户关窗口。少了这一步，标记只活在内存里，
          // 刷新页面后又从默认值 0 开始，警告便重复弹出。
          if (typeof saveSettings === 'function') saveSettings();
          messageDialog('导出的 schematic 只与 Minecraft: Java Edition 1.12 及以下兼容。\n如想在 1.13 和以上使用，请使用结构方块格式导出。\n\n此警告将不再提示。', '警告');
        }
        selectionPlace(false);
        if (S.totalblocks - S.block_outside <= 0) {
          messageDialog('没有方块可以导出！', '错误');
        } else {
          S.playing = 0; S.window = W_SCHEMATIC_EXPORT;
        }
      }
    }
    else if (label === '关于本作品......') S.window = W_ABOUT;
    else if (label === '退出') messageDialog('浏览器无法关闭标签页，请直接关闭即可。', '提示');
    else if (getRecent().some(r => label.endsWith(trimLabel(r.name, 320)))) {
      const idx = getRecent().findIndex(r => label.endsWith(trimLabel(r.name, 320)));
      if (idx >= 0) openRecent(idx);
    }
    return;
  }
  if (menu === 'edit' || menu === 'editctx') {
    if (label === '撤销') actionUndo();
    else if (label === '重做') actionRedo();
    else if (label === '复制') actionCopy();
    else if (label === '剪切') actionCut();
    else if (label === '粘贴') actionPaste(S.selbx > -1 ? S.selbx : S.starta, S.selby > -1 ? S.selby : S.startb);
    else if (label === '删除') actionDelete();
    else if (label === '全选') selectAll(-1, 0);
    else if (label === '全不选') selectionPlace(false);
    else if (label === '选择反转') selectionInvert();
    // 对照 menu_click.gml:129-138：
    //   sel=7 → 先置空，再选右半：selection_add(menuc+1, 0, enda, endb)
    //   sel=8 → 先置空，再选左半：selection_add(0, 0, menuc, endb)
    // 之前这两项都错调成了 selectAll(-1,0)（等于「全选」），
    // 所以「选择右侧所有 / 选择左侧所有」的表现和全选一模一样。
    else if (label === '选择右侧所有 ->') {
      /* 用 menuc（打开菜单时的列快照），不是实时 S.selbx。
         实时值会随鼠标移动而变，导致分界线跟指针跑。 */
      const c = (typeof menuc === 'number' && menuc >= 0) ? menuc : S.selbx;
      selectionPlace(false);
      selectionAdd(c + 1, 0, S.enda, S.endb, 0, 0);
    }
    else if (label === '选择左侧所有 <-') {
      const c = (typeof menuc === 'number' && menuc >= 0) ? menuc : S.selbx;
      selectionPlace(false);
      selectionAdd(0, 0, c, S.endb, 0, 0);
    }
    else if (label.startsWith('选择所有 ')) selectAll(S.instrument, 0);
    else if (label.startsWith('选择所有除了')) selectAll(S.instrument, 1);
    // 模式操作（Ctrl+E/D/R/F/T/G）：对照 menu_click.gml:139-144 mode_action(1..6)
    else if (/^(升高|降低)八度$|^(升高|降低)半音$/.test(label) && (S.editmode | 0) === 0) {
      if (label === '升高八度') modeAction(1);
      else if (label === '降低八度') modeAction(2);
      else if (label === '升高半音') modeAction(3);
      else modeAction(4);
    }
    else if (label === '增加 10 音量') modeAction(1);
    else if (label === '减少 10 音量') modeAction(2);
    else if (label === '增加音量') modeAction(3);
    else if (label === '减少音量') modeAction(4);
    else if (label === '向右声道移动 10') modeAction(1);
    else if (label === '向左声道移动 10') modeAction(2);
    else if (label === '向右声道移动') modeAction(3);
    else if (label === '向左声道移动') modeAction(4);
    else if (label === '上调 10 微调') modeAction(1);
    else if (label === '下调 10 微调') modeAction(2);
    else if (label === '上调 1 微调') modeAction(3);
    else if (label === '下调 1 微调') modeAction(4);
    else if (label === '重置音量' || label === '重置立体声' || label === '重置音高') modeAction(6);
    else if (label.includes('更换音调模式')) S.editmode = 0;
    else if (label.includes('更换音量模式')) S.editmode = 1;
    else if (label.includes('更换声道模式')) S.editmode = 2;
    else if (label.includes('更换音高模式')) S.editmode = 3;
    else if (label === '扩展选区') selectionExpand();
    else if (label === '压缩选区') selectionCompress();
    else if (label === 'Tremolo...') S.window = W_TREMOLO;
    else if (label === 'Stereo...') S.window = W_STEREO;
    else if (label === 'Arpeggio...') S.window = W_ARPEGGIO;
    else if (label === 'Portamento...') S.window = W_PORTAMENTO;
    else if (label === 'Vibrato') { S.playing = 0; macroVibrato(); }
    else if (label === 'Stagger...') S.window = W_STAGGER;
    else if (label === 'Chorus') { S.playing = 0; macroChorus(); }
    else if (label === 'Volume LFO') { S.playing = 0; macroVelocityLFO(); }
    else if (label === '淡入') { S.playing = 0; macroFade(true); }
    else if (label === '淡出') { S.playing = 0; macroFade(false); }
    else if (label === '替换音') { S.playing = 0; macroReplaceKey(); }
    // 注意：宏子菜单里的标签是「设定音量...」（三个点），
    // 而旧版 editctx 里写的是六个点。这里两种都接受，
    // 避免因为标签写法不同导致点了没反应。
    else if (/^设定音量[.．]{2,6}$/.test(label)) S.window = W_SETVELOCITY;
    else if (/^设定声道[.．]{2,6}$/.test(label)) S.window = W_SETPANNING;
    else if (/^设定音高[.．]{2,6}$/.test(label)) S.window = W_SETPITCH;
    else if (label === '重置所有属性') { S.playing = 0; macroReset(); }
    else if (label === '转换所有超出八度范围的音符') selectionTranspose();
    else if (label.startsWith('...为 ')) {
      // 音色子菜单：本级序号就是 INSTRUMENTS 下标（对照 menu_click: `ins = sel - 18`）
      const name = label.slice(5);
      const byIdx = (typeof spos === 'number' && spos >= 0 && spos < INSTRUMENTS.length) ? spos : -1;
      const idxByName = INSTRUMENTS.findIndex(i => i.name === name);
      const target = byIdx >= 0 ? byIdx : idxByName;
      if (target >= 0) { selectionChangeInstrument(target); S.playing = 0; }
    }
    return;
  }
  if (menu === 'settings') {
    if (label === '音色设置......') S.window = W_INSTRUMENTS;
    else if (label === '歌曲信息......') S.window = W_SONGINFOEDIT;
    else if (label === '歌曲属性......') S.window = W_PROPERTIES;
    else if (label === '歌曲数据......') S.window = W_STATS;
    else if (label === '首选项......') S.window = W_PREFERENCES;
    else if (typeof spos === 'number' && spos >= 0 && spos < INSTRUMENTS.length) {
      // 音色子菜单：本级序号就是 INSTRUMENTS 下标（对照 menu_click: `sel < insoffset + 1`）
      setInstrument(spos);
    }
    return;
  }
  if (menu === 'midiimport_ins') {
    if (S.midiMenuRow) S.midiMenuRow.ins = (idx | 0) - 1;
    return;
  }
  if (menu === 'midiimport_octave') {
    if (S.midiMenuRow) S.midiMenuRow.oct = (idx | 0) - 3;
    return;
  }
  if (menu === 'midiimport_percins') {
    if (S.midiPercRow) S.midiPercRow.ins = (idx | 0) - 1;
    return;
  }
  if (menu === 'midiimport_percpitch') {
    if (S.midiPercRow) S.midiPercRow.key = idx | 0;
    return;
  }
  if (menu === 'schexport_insblock' || menu === 'schexport_block') {
    schMenuApply(menu, label);
    return;
  }
  if (menu === 'section') {
    if (label === '移除区间') { S.section_exists = 0; S.section_start = 0; S.section_end = 0; }
    else if (label === '跳到区间开始') { S.starta = S.section_start; SB.val[0] = S.starta; }
    else if (label === '跳到区间结束') { S.starta = S.section_end - 1; SB.val[0] = S.starta; }
    else if (label === '选中区间内方块') S.selectionAdd(S.section_start, 0, S.section_end - 1, S.endb, 0, 0);
    else if (label === '从区间开始播放') S.marker_start = S.marker_start ? 0 : 1;
    else if (label === '区间后结束播放') S.marker_end = S.marker_end ? 0 : 1;
    return;
  }
  if (menu === 'help') {
    // 「官方网站......」「教程视频」已按要求从菜单里移除，这里不再处理。
    if (label === 'GitHub......') window.open('https://github.com/OpenNBS/OpenNoteBlockStudio', '_blank');
    else if (label === '关于......') S.window = W_ABOUT;
    else if (label === '更新历史......') S.window = W_ABOUT;
    return;
  }
  if (menu === 'instruments_pitch') {
    // 对照 menu_click.gml:278-281：
    //     case "instruments_pitch": instrument_list[| obj_menu.menub].key = sel - ...
    // obj_menu.menub 由 draw_window_instruments.gml:218 `menu.menub = b` 设置，
    // 用来记住「这个菜单是在操作哪一个乐器」。它就是这里的 idx 参数
    // （drawMenu 在 closeMenu() 之前把它取出来再传进来，因为 UI.menu 会被清空）。
    // 另外：内置音色的基准音只读 —— 源码只在 ins.user 时才画下拉箭头并弹菜单，
    // 所以这里也保持 user 守卫。
    const idx = (target !== undefined && target !== null) ? target : -1;
    if (idx < 0 || !INSTRUMENTS[idx]) return;
    if (!INSTRUMENTS[idx].user) return;
    const plain = label.replace(/^\+\s*/, '').replace(/^✓\s*/, '').trim();
    const key = insPitchKeyFromLabel(plain);
    if (key >= 0) { INSTRUMENTS[idx].key = key; S.changed = 1; recalcSong(); }
    return;
  }
  if (menu === 'instruments_press') {
    const idx = (target !== undefined && target !== null) ? target : -1;
    if (idx < 0 || !INSTRUMENTS[idx]) return;
    if (!INSTRUMENTS[idx].user) return;
    INSTRUMENTS[idx].press = (label.replace(/^\+\s*/, '').trim() === '是');
    S.changed = 1;
    return;
  }
  if (menu === 'theme') {
    // 对照 draw_window_preferences.gml:325-326 的菜单顺序与 menu_click.gml 的 "theme" 分支：
    // 菜单项顺序是 经典(theme=0) / 暗黑(theme=2) / 复古(theme=1) / Fluent(theme=3)。
    // 标签前面可能带 "+ "（当前项），所以按去掉前缀后的名字匹配，不要用下标硬编码。
    const name = label.replace(/^\+\s*/, '').trim();
    const map = { '经典': 0, 'Aqua': 0, '暗黑': 2, 'Dark': 2, '复古': 1, '90s': 1, 'Fluent': 3 };
    if (map[name] !== undefined) {
      S.theme = map[name];
      // 对照 menu_click：切到 Fluent 时才让「暗色模式」有意义，其他主题强制退出暗色
      if (S.theme !== 3) S.fdark = 0;
      changeTheme();
    }
    return;
  }
  if (menu === 'tempo') {
    if (label.includes('t/s')) S.use_bpm = 0;
    else if (label.includes('BPM')) S.use_bpm = 1;
    else if (label === '速度测量器......') S.window = W_TEMPOTAPPER;
    else {
      const m = /^([\d.]+)/.exec(label);
      if (m) { S.tempo = S.use_bpm ? parseFloat(m[1]) / 15 : parseFloat(m[1]); S.changed = 1; }
    }
  }
}

/* 切换当前音色（菜单、快捷键共用） */
function setInstrument(i) {
  if (i < 0 || i >= INSTRUMENTS.length) return;
  S.instrument = i;
  S.selected_vel = 100; S.selected_pan = 100; S.selected_pit = 0;
  playSound(INSTRUMENTS[i], S.selected_key, 100, 100, 0);
}

/* ---------------------------------------------------------------- 窗口框架 */
/* 对话框自适应：竖屏（手机）下很多窗口比屏幕还宽，会左右都超出视口，
   底部的「确定/取消」被推到屏幕外，导致窗口点不到也关不掉。

   做法：整窗等比缩放 + 居中夹紧。
     · 宽或高超出可用区时按较小比例整体缩小（保持长宽比，
       否则窗口内那些固定偏移的控件会互相压住）；
     · 位置严格居中，且缩放后必然落在 [DLG_PAD, rw-DLG_PAD] 内。

   关键点（第一版写错的地方）：不能只把 dialogFrame 的返回值缩小，
   因为窗口内部所有控件都用 `f.x1 + 16` 这种【设计坐标】偏移绘制。
   正确的做法是让 dialogFrame 返回【设计坐标】(0,0)-(w,h)，
   同时由它自己安装画布变换 translate+scale，把设计空间映射到屏幕。
   这样内部代码一个字都不用改，缩放对它们是透明的。
   调用方（drawWindows）负责在窗口画完后 restore 画布与鼠标。
   移位/回退这段逻辑会重现"按钮点不到"，不要改回去。 */
const DLG_PAD = 8;          // 窗口与视口边缘的最小留白
/* 最小缩放比：只是"尽量别缩太小"的下限，【不是硬约束】。
   300px 级窄屏上 600x400 的窗口需要 0.507，比这个下限还小；
   如果强行抬回下限，窗口就会重新溢出屏幕 —— 那正是要修的问题。
   所以下面 dialogFit() 在冲突时优先保证"窗口不超出视口"，宁可字小一点。 */
const DLG_MIN_SCALE = 0.55;

function dialogFit(w, h) {
  const availW = Math.max(80, S.rw - DLG_PAD * 2);
  const availH = Math.max(80, S.rh - DLG_PAD * 2);
  let k = 1;
  if (w > availW) k = Math.min(k, availW / w);
  if (h > availH) k = Math.min(k, availH / h);
  /* 先按可用区算出的 k（保证一定放得下），再与"美观下限"取……注意是
     取【更小】的那个不成立：下限的作用是防止过度缩小，但一旦下限比
     所需的 k 还大，就放不下了。这里直接以"放得下"为准，下限仅用于
     提示/日志，不参与计算 —— 早期把它 clamp 进去导致 320px 屏上
     MIDI 导入窗口 x1 变成 -5，仍然溢出。 */
  k = Math.max(0.2, k);
  const dw = w * k, dh = h * k;
  return {
    k,
    // 居中（缩放后按实际占位算，才不会因为取整偏一边）
    tx: Math.round((S.rw - dw) / 2),
    ty: Math.round((S.rh - dh) / 2),
    w, h,
  };
}

function dialogFrame(w, h) {
  const fit = dialogFit(w, h);
  const c = G.ctx;
  /* 注意：这里【只做变换，不做 save】。
     成对的 save/restore 必须由调用方 drawWindows() 统一负责 ——
     早期版本在这里 save、再靠 S.dlg_pending 标志在末尾 restore，
     结果窗口内部一旦调用 closeWindow()（比如点「关闭」），
     标志被清掉，restore 就被跳过，变换泄漏到后续所有绘制，
     表现为"整个编辑器被缩小成一份副本叠在对话框位置"、
     而且每帧再叠一层，越缩越小。 */
  c.translate(fit.tx, fit.ty);
  if (fit.k !== 1) c.scale(fit.k, fit.k);

  /* 鼠标坐标反向映射到设计空间，保证"画在哪儿就能点在哪儿"。
     必须【无条件】做，包括 fit.k === 1 的情况 ——
     因为 translate(fit.tx, fit.ty) 在 k = 1 时同样生效：
     设计坐标的 (0,0) 对应屏幕的 (tx, ty)，如果不平移回来，
     所有 hit test 都会偏掉整整一个 tx/ty 的距离。
     之前写成 `if (fit.k !== 1)` 才映射，于是横屏全尺寸（k = 1，tx/ty 居中偏移）
     下对话框里每一个控件都点不中、滑块拖不动 —— 而竖屏缩小后反而正常，
     这就是"有时候好使有时候不好使"的来源。 */
  G.mouse.x = (G.mouse.x - fit.tx) / fit.k;
  G.mouse.y = (G.mouse.y - fit.ty) / fit.k;
  S.dlg_fit = fit;
  S.dlg_scale = fit.k;
  S.dlg_origin = { x: fit.tx, y: fit.ty };

  // 设计坐标：从 (0,0) 起，内部控件的固定偏移照旧有效
  return { x1: 0, y1: 0, x2: w, y2: h, w, h, scale: fit.k };
}

/* 设计坐标 → 屏幕坐标。对话框内部打开的菜单（drawMenu 画在屏幕空间）
   必须用它换算位置，否则缩放后会飘到别处。 */
function dlgToScreen(x, y) {
  const f = S.dlg_fit;
  if (!f) return { x, y };
  return { x: f.tx + x * f.k, y: f.ty + y * f.k };
}

function closeWindow() {
  S.window = 0; S.dlg_scale = 1; S.dlg_origin = null; S.dlg_fit = null;
  blurText();
}

function drawWindows() {
  UI.inputWindow = S.window;
  if (!isDialogWindow(S.window)) {
    S.dlg_scale = 1; S.dlg_origin = null; S.dlg_fit = null;
    return;   // 拖拽/瞬时状态不画遮罩、不锁交互
  }
  // 半透明遮罩（铺满整个视口，不受窗口缩放影响）
  setAlpha(0.18); setColor('#000000'); fillRect(0, 0, S.rw, S.rh); setAlpha(1);

  /* 这一对 save/restore 是【无条件】的，覆盖整个 switch：
     dialogFrame() 在里面做 translate/scale 并改写 G.mouse，
     无论窗口内部是否提前 closeWindow()，这里都必须把状态还回去。
     之前用 S.dlg_pending 做条件恢复，一旦 closeWindow() 清了标志就漏掉
     restore，变换泄漏到后续绘制 —— 表现为整个界面被缩小叠在对话框位置。 */
  const savedMouse = { x: G.mouse.x, y: G.mouse.y };
  G.ctx.save();
  switch (S.window) {
    case W_SONGINFOEDIT: drawSongInfo(); break;
    case W_PROPERTIES: drawProperties(); break;
    case W_STATS: drawStats(); break;
    case W_INSTRUMENTS: drawInstruments(); break;
    case W_PREFERENCES: drawPreferences(); break;
    case W_SAVEOPTIONS: drawSaveOptions(); break;
    case W_ABOUT: drawAbout(); break;
    case W_MIDI: drawMidiImport(); break;
    case W_TREMOLO: drawTremoloDlg(); break;
    case W_STEREO: drawStereoDlg(); break;
    case W_ARPEGGIO: drawArpeggioDlg(); break;
    case W_PORTAMENTO: drawPortamentoDlg(); break;
    case W_STAGGER: drawStaggerDlg(); break;
    case W_SETVELOCITY: drawSetVelDlg(); break;
    case W_SETPANNING: drawSetPanDlg(); break;
    case W_SETPITCH: drawSetPitchDlg(); break;
    case W_TEMPOTAPPER: drawTempoTapper(); break;
    case W_MIDIDEVICES: drawMidiDevices(); break;
    case W_SETTEMPO: drawTempoInput(); break;
    case W_COMPATIBILITY: drawCompatibilityInfo(); break;
    case W_SCHEMATIC_EXPORT: drawSchematicExport(); break;
    case W_DATAPACK_EXPORT: drawDatapackExport(); break;
    default: S.window = 0; break;   // 未知窗口：立即关闭，绝不留灰屏
  }
  /* 与上面的 save() 严格配对。用保存的鼠标快照还原，
     而不是 S.dlg_prev_mouse —— 后者在 closeWindow() 里会被清掉。 */
  G.ctx.restore();
  G.mouse.x = savedMouse.x;
  G.mouse.y = savedMouse.y;
}

function okCancel(f, onOk, okLabel, cancelLabel) {
  const ok = button2(f.x2 - 76, f.y2 - 34, 64, okLabel || '确定');
  const no = button2(f.x2 - 148, f.y2 - 34, 64, cancelLabel || '取消');
  if (ok) { onOk(); }
  if (no || G.keysPressed['Escape']) { closeWindow(); }
}

/* ---------------------------------------------------------------- 歌曲信息 */
function drawSongInfo() {
  const f = dialogFrame(420, 260);
  drawWindow(f.x1, f.y1, f.x2, f.y2);
  drawWindowTitle(f.x1, f.y1, '歌曲信息');
  setColor(C.textDim); setFont(FONT.small());
  text(f.x1 + 16, f.y1 + 38, '歌曲名');
  text(f.x1 + 16, f.y1 + 82, '作者');
  text(f.x1 + 16, f.y1 + 126, '原作者');
  text(f.x1 + 16, f.y1 + 170, '描述');
  setFont(FONT.main());
  S.song_name = inputBox(1, S.song_name, f.x1 + 90, f.y1 + 32, 310, 24);
  S.song_author = inputBox(2, S.song_author, f.x1 + 90, f.y1 + 76, 310, 24);
  S.song_orauthor = inputBox(3, S.song_orauthor, f.x1 + 90, f.y1 + 120, 310, 24);
  S.song_desc = inputBox(4, S.song_desc, f.x1 + 90, f.y1 + 164, 310, 24);
  okCancel(f, () => { S.changed = 1; closeWindow(); });
}

/* ---------------------------------------------------------------- 歌曲属性 */
function drawProperties() {
  const f = dialogFrame(400, 300);
  drawWindow(f.x1, f.y1, f.x2, f.y2);
  drawWindowTitle(f.x1, f.y1, '歌曲属性');
  setFont(FONT.small()); setColor(C.text);
  text(f.x1 + 16, f.y1 + 40, '速度（红石刻/秒）');
  let t = S.tempo;
  const t2 = drawDragValue(11, f.x1 + 200, f.y1 + 36, t, 0.25);
  if (t2 !== t) { S.tempo = clamp(t2, 0.25, 60); S.changed = 1; }
  text(f.x1 + 16, f.y1 + 72, '拍号（每小节拍数）');
  const ts = drawDragValue(12, f.x1 + 200, f.y1 + 68, S.timesignature, 0.1);
  S.timesignature = clamp(Math.round(ts), 2, 8);
  text(f.x1 + 16, f.y1 + 108, '循环设置');
  if (drawCheckbox(f.x1 + 200, f.y1 + 106, !!S.loop_session, '循环播放', false, true)) { S.loop_session = S.loop_session ? 0 : 1; S.loop = S.loop_session; }
  text(f.x1 + 16, f.y1 + 136, '循环起点');
  const ls = drawDragValue(13, f.x1 + 200, f.y1 + 132, S.loopstart, 0.1);
  S.loopstart = clamp(Math.round(ls), 0, Math.max(0, S.enda));
  text(f.x1 + 16, f.y1 + 164, '循环次数（0 = 无限）');
  const lm = drawDragValue(14, f.x1 + 200, f.y1 + 160, S.loopmax, 0.1);
  S.loopmax = clamp(Math.round(lm), 0, 99);
  setFont(FONT.main());
  okCancel(f, () => { S.changed = 1; closeWindow(); });
}

/* ---------------------------------------------------------------- 歌曲数据 */
function drawStats() {
  const f = dialogFrame(420, 340);
  drawWindow(f.x1, f.y1, f.x2, f.y2);
  drawWindowTitle(f.x1, f.y1, '歌曲数据');
  setFont(FONT.small());
  setColor(C.text);
  const secs = S.enda / Math.max(0.25, S.tempo);
  const rows = [
    ['方块总数', String(S.totalblocks)],
    ['歌曲长度', S.enda + ' 格（' + timeStr(secs) + '）'],
    ['图层数', String(S.endb2)],
    ['速度', S.tempo.toFixed(2) + ' t/s（' + (S.tempo * 15).toFixed(1) + ' BPM）'],
    ['最低 / 最高音', (() => { let lo = 99, hi = -1; for (let a = 0; a <= S.enda; a++) for (let b = 0; b <= S.endb; b++) if (gExists(a, b)) { lo = Math.min(lo, gKey(a, b)); hi = Math.max(hi, gKey(a, b)); } return lo > hi ? '-' : getKeyname(lo, 1) + ' / ' + getKeyname(hi, 1); })()],
    ['超范围音符', String(S.block_outside)],
    ['自定义音色', String(INSTRUMENTS.filter(i => i.user).length)],
    ['听歌用时（分钟）', String(Math.round(S.work_mins))],
  ];
  let y = f.y1 + 40;
  for (const [k, v] of rows) {
    setColor(C.textDim); text(f.x1 + 18, y, k);
    setColor(C.text); text(f.x1 + 160, y, v);
    y += 24;
  }
  // 音色使用统计
  setColor(C.textDim);
  text(f.x1 + 18, y + 6, '音色使用：');
  y += 26;
  setFont(FONT.main(11));
  let line2 = '';
  for (const ins of INSTRUMENTS) {
    if (ins.num_blocks > 0) line2 += ins.name + '(' + ins.num_blocks + ')  ';
  }
  setColor(C.text);
  let cur = f.x1 + 18;
  for (const ins of INSTRUMENTS) {
    if (!ins.num_blocks) continue;
    const s = ins.name + '(' + ins.num_blocks + ')';
    if (cur + textWidth(s) > f.x2 - 16) { cur = f.x1 + 18; y += 16; }
    text(cur, y, s); cur += textWidth(s) + 10;
  }
  setFont(FONT.main());
  if (button2(f.x2 - 76, f.y2 - 34, 64, '关闭') || G.keysPressed['Escape']) closeWindow();
}

/* ---------------------------------------------------------------- 音色设置 */
/* 严格对照 draw_window_instruments.gml 重建布局：
     窗口 550 x 350（x1 = rw/2-275, y1 = rh/2-175+windowoffset）
     标题 "音色设置"  (x1+10, y1+8)
     说明两行        (x1+12, y1+31) / (x1+12, y1+43)
     列表内框        draw_rectangle(x1+12, y1+66, x1+535, y1+310)
     四列表头，列宽由源码的累加偏移决定：名称 194 / 声音 160 / 音调 80 / 显示 88
     每行高 20，首行 y1+88
     基准音是 draw_abutton 下拉（show_menu_ext "instruments_pitch"），【不是 +/- 按钮】
     底部按钮：导出音色(12) 添加(110) 移除(194)，y1+318
     右上角：导入(455,9) 打开目录(455,36)，宽 80 */
function drawInstruments() {
  const f = dialogFrame(550, 350);
  drawWindow(f.x1, f.y1, f.x2, f.y2);
  drawWindowTitle(f.x1, f.y1, '音色设置');
  setFont(FONT.small());
  setColor(C.textDim);
  text(f.x1 + 12, f.y1 + 31, '这些设置只针对当前歌曲。如需从其它歌曲导入音色，点击“导入”。');
  text(f.x1 + 12, f.y1 + 43, '音色文件必须放在 “Sounds” 文件夹里。');
  if (button2(f.x1 + 455, f.y1 + 9, 80, '导入')) {
    // 对照 load_instruments("")：打开另一个 .nbs，把它里面的自定义音色并入当前歌曲
    pickFile('.nbs', async (ab) => {
      try {
        const merged = importInstrumentsFromNbs(new Uint8Array(ab));
        if (merged > 0) setMsg('已导入 ' + merged + ' 个音色');
        else setMsg('该歌曲没有可导入的自定义音色');
      } catch (e) { messageDialog('导入失败：' + e.message, '错误'); }
    });
  }
  if (button2(f.x1 + 455, f.y1 + 36, 80, '打开目录')) {
    setMsg('浏览器内无法打开本地目录，请直接在文件管理器中查看 Sounds 文件夹。');
  }
  setFont(FONT.main());

  // 列表内框
  setColor(C.controlBg);
  fillRect(f.x1 + 12, f.y1 + 66, 523, 244);
  setColor(S.theme === 0 ? make_color_rgb(137, 140, 149) : C.controlBorder);
  fillRect(f.x1 + 12, f.y1 + 66, 523, 1);
  fillRect(f.x1 + 12, f.y1 + 309, 523, 1);
  fillRect(f.x1 + 12, f.y1 + 66, 1, 244);
  fillRect(f.x1 + 534, f.y1 + 66, 1, 244);

  // 四列表头
  const colX = [f.x1 + 11, f.x1 + 13 + 194, f.x1 + 13 + 194 + 160, f.x1 + 13 + 194 + 160 + 80];
  const heads = ['名称', '声音', '音调', '显示'];
  setFont(FONT.small());
  setColor(C.text);
  for (let i = 0; i < 4; i++) text(colX[i] + 5, f.y1 + 70, heads[i]);

  // 行
  const rowY0 = f.y1 + 88, rowH = 20;
  const visible = floor((f.y1 + 308 - rowY0) / rowH);
  S.insScroll = S.insScroll || 0;
  if (G.wheel && mouseRectangle(f.x1 + 14, f.y1 + 88, 460, visible * rowH)) {
    // 对照 draw_scrollbar.gml:21 `sb_val[i] += (mouse_wheel_down() - mouse_wheel_up()) * ...`：
    // 向下滚 → sb_val 增大 → 显示列表里更靠后的行。G.wheel 已按此约定归一化（down=+1）。
    S.insScroll = clamp(S.insScroll + G.wheel, 0, Math.max(0, INSTRUMENTS.length - visible));
  }
  for (let i = 0; i < visible; i++) {
    const idx = i + S.insScroll;
    if (idx >= INSTRUMENTS.length) break;
    const ins = INSTRUMENTS[idx];
    const y = rowY0 + i * rowH;
    // 选中行高亮
    if (S.instrument === idx) {
      setColor(C.accent); setAlpha(0.15);
      fillRect(f.x1 + 13, y, 521, rowH);
      setAlpha(1);
    }
    if (mouseRectangle(f.x1 + 14, y, 460, rowH) && G.mbp[0]) {
      S.instrument = idx;
      playSound(ins, S.selected_key, 100, 100, 0);
    }
    // 名称列
    if (idx < S.first_custom_index) {
      drawSprite('spr_instrumenticons', idx, colX[0] + 4, y + 3);
      setFont(FONT.main(11));
      setColor(C.text);
      text(colX[0] + 24, y + 4, ins.name);
    } else {
      drawToolIcon(26, colX[0] + 4, y + 1, false);
      setFont(FONT.main(9)); setColor(C.text);
      text(colX[0] + 12, y + 5, String((idx - S.first_custom_index) % 10), 'center');
      setFont(FONT.main(11)); setColor(C.text);
      text(colX[0] + 24, y + 4, ins.name);
    }
    // 声音列
    setFont(FONT.main(10));
    setColor(ins.filename ? (ins.loaded ? C.text : '#c00000') : C.textDim);
    text(colX[1] + 5, y + 5, ins.filename ? ins.filename : '无');
    // 音调列：基准音名；下拉箭头【只有自定义音色才有】
    // 对照 draw_window_instruments.gml:198-221：
    //     if (ins.user) { if (draw_abutton(...)) menu = show_menu_ext("instruments_pitch", ...) }
    //     draw_text_dynamic(..., get_keyname(ins.key, 1))
    // 也就是说内置音色的基准音是只读的，不画箭头、点了也不会弹菜单。
    setColor(C.text);
    text(colX[2] + 5, y + 4, getKeyname(ins.key, 1));
    if (ins.user) {
      // 对照源码 `draw_abutton(x1 + 18 + 194 + 216, ...)`，
      // 本文件以 colX[2] = x1+13+194+160 为列基准，故相对偏移 61。
      const ax = colX[2] + 61;
      drawArrowButton(ax, y, false);
      // 源码 show_menu_ext 的 y 是 y1 + 106 + 20 * a，a 是【可见行序号】而不是列表索引，
      // 所以这里传 i（本帧的第几行），不是 idx。
      if (mouseRectangle(ax, y, 16, rowH) && G.mbr[0]) openInsPitchMenu(idx, i);
    }
    // 显示列（对照 :222-231，同样是 ins.user 才给 draw_abutton）
    setColor(C.text);
    text(colX[3] + 5, y + 4, ins.press ? '是' : '否');
    if (ins.user) {
      // 对照源码 `draw_abutton(x1 + 18 + 194 + 175 + 112, ...)`，
      // 以 colX[3] = x1+13+194+160+80 为基准，相对偏移 52。
      const px2 = colX[3] + 52;
      drawArrowButton(px2, y, false);
      if (mouseRectangle(px2, y, 16, rowH) && G.mbr[0]) openInsPressMenu(idx, i);
    }
  }
  // 列分隔线（对照源码 239-242 的三条 draw_line）
  setColor(make_color_rgb(192, 192, 192));
  const sepY = f.y1 + 87, sepH = Math.min(visible, INSTRUMENTS.length - S.insScroll) * rowH;
  fillRect(colX[1], sepY, 1, sepH);
  fillRect(colX[2], sepY, 1, sepH);
  fillRect(colX[3], sepY, 1, sepH);

  // 滚动条
  drawScrollbar(0, f.x1 + 14 + 194 + 160 + 80 + 70, f.y1 + 88, 21, 9,
    Math.max(0, INSTRUMENTS.length - 2), 0, 1);

  setFont(FONT.main());
  // 底部按钮
  if (button2(f.x1 + 12, f.y1 + 318, 86, '导出音色')) {
    setMsg('浏览器版暂不支持导出音色包。');
  }
  if (button2(f.x1 + 110, f.y1 + 318, 80, '添加')) {
    pickFile('audio/*', async (ab, name) => {
      try {
        const buf = await AU.ctx.decodeAudioData(ab.slice(0));
        const ni = newInstrument(name.replace(/\.[^.]+$/, ''), name, true, false, 45);
        ni.buffer = buf; ni.loaded = true;
        S.instrument = INSTRUMENTS.length - 1;
        S.changed = 1;
        setMsg('已添加音色：' + ni.name);
      } catch (e) { messageDialog('无法解码该音频：' + e.message, '错误'); }
    });
  }
  const cur = INSTRUMENTS[S.instrument];
  const canRemove = cur && cur.user && S.instrument >= S.first_custom_index;
  setAlpha(canRemove ? 1 : 0.45);
  if (button2(f.x1 + 194, f.y1 + 318, 80, '移除') && canRemove) {
    const i = S.instrument;
    INSTRUMENTS.splice(i, 1);
    S.instrument = Math.max(0, i - 1);
    recalcSong(); S.changed = 1;
  }
  setAlpha(1);
  if (button2(f.x2 - 76, f.y1 + 318, 64, '关闭') || G.keysPressed['Escape']) closeWindow();
}

/* 音调列的下拉箭头（对应 draw_abutton） */
function drawArrowButton(x, y, disabled) {
  /* 对照 draw_abutton.gml:5-10 —— 这是 sprite，不是手绘三角形：
       m = 悬停（未锁定）; m += 按下 → 2
       帧 = m + 3*theme + 3*(fdark && theme==3)
     spr_button_arrow 是 15 帧 = 5 组 × 3（普通/悬停/按下），主题偏移 3。
     之前用 fillRect 拼了个三角形出来，所以所有主题下箭头都是同一种样子。 */
  const m = (!disabled && mouseRectangle(x, y, 17, 18)) ? (G.mb[0] ? 2 : 1) : 0;
  const group = 3 * S.theme + ((S.theme === 3 && S.fdark) ? 3 : 0);
  setAlpha(disabled ? 0.4 : 1);
  drawSprite('spr_button_arrow', m + group, x, y);
  setAlpha(1);
  if (disabled) return false;
  return m > 0 && G.mbr[0];
}


/* 「显示」列下拉：对应 show_menu_ext("instruments_press", ...)
   源码是 check(ins.press) + "Yes|" + check(!ins.press) + "No" */
function openInsPressMenu(idx, row) {
  const ins = INSTRUMENTS[idx];
  const str = (ins.press ? '+ ' : '') + '是|' + (!ins.press ? '+ ' : '') + '否';
  // 对照 draw_window_instruments.gml:226-228：
  //   show_menu_ext("instruments_press", x1 + 18 + 194 + 235, y1 + 106 + 20 * a, ...)
  //   menu.menub = b
  // 位置同样是跟行的固定坐标，不是鼠标位置。
  // 注意：这里的位置是【设计坐标】(以窗口左上角为原点)，而 drawMenu 画在屏幕空间，
  // 所以必须经 dlgToScreen() 换算 —— 竖屏缩放后直接当屏幕坐标用会飘走。
  const sp = dlgToScreen(18 + 194 + 235, 106 + 20 * (row | 0));
  const m = showMenu('instruments_press',
    sp.x,
    sp.y, str);
  m.insIdx = idx;
  m.menub = idx;
  return m;
}

/* 音调下拉菜单：对应 draw_window_instruments.gml:217
     menu = show_menu_ext("instruments_pitch", x1 + 18 + 194 + 155, y1 + 106 + 20 * a, str)
   注意菜单位置是【跟行走的固定坐标】，不是鼠标位置。
   之前我用 G.mouse.x / G.mouse.y，一旦鼠标恰好不在窗口内（比如测试里
   程序化打开）就是 -1，菜单跑到左上角、点击判定全错位，
   表现为「点了基准音没反应」。 */
function openInsPitchMenu(idx, row) {
  const ins = INSTRUMENTS[idx];
  let str = '八度 0|\\|';
  for (let key = 0; key < 88; key++) {
    // check(ins.key = key)：当前基准音前面加对勾前缀
    str += (ins.key === key ? '+ ' : '') + getKeyname(key, 1) + '|';
    if (key === 87) break;
    if (((key - 3) % 12) === 0) {
      const oct = Math.floor((key - 3) / 12 + 1);
      str += '/|八度 ' + oct + '|\\|';
    }
  }
  str += '/';
  // 设计坐标 → 屏幕坐标（竖屏缩放后必须换算，否则菜单错位）
  const sp = dlgToScreen(18 + 194 + 155, 106 + 20 * (row | 0));
  const m = showMenu('instruments_pitch',
    sp.x,
    sp.y, str);
  m.insIdx = idx;
  m.menub = idx;          // 对照 draw_window_instruments.gml:218 `menu.menub = b`
  return m;
}

/* 从菜单项标签反查 key（0..87）。
   注意菜单是【嵌套】结构而不是扁平的：源码用
       str = "Octave 0|\|"                        → 顶层只有「八度 0」这一个父项
       ... str += "/|Octave N|\|"                 → 回到顶层再加「八度 N」
   所以顶层列出「八度 0…8」，每个八度是一个子菜单，里面才是那 12 个键。
   因此不能用「本级菜单内序号 spos」去算 key（spos 是子菜单内部的序号，
   只有在知道是哪一级菜单时才有效），改为按标签反查 ——
   get_keyname(n,1) 在 0..87 范围内是唯一的（同 mod 12 的键八度数必然不同）。 */
function insPitchKeyFromLabel(plain) {
  for (let k = 0; k < 88; k++) {
    if (getKeyname(k, 1) === plain) return k;
  }
  return -1;
}

/* ---------------------------------------------------------------- 首选项 */
/* 对照 draw_window_preferences.gml：500x510 窗口，5 个分页
   通用 / 界面 / 外观 / 访问 / 播放 */
const PREF_TABS = ['通用', '界面', '外观', '访问', '播放'];

function drawPreferences() {
  // 每一帧都可能在改设置。这里先记下快照，帧末比对，有变化就落盘。
  // 对照 GML：save_settings() 在 control_create / 每次改动后都会写 ini，
  // 所以原版改完立刻生效、下次启动还在。之前只在点「确定」时保存，
  // 点右上角关窗、切分页或直接刷新就全丢了。
  const before = {};
  for (const k of SETTINGS_FIELDS) before[k] = S[k];
  before.prefTab = S.prefTab;
  drawPreferencesBody();
  let dirty = false;
  for (const k of SETTINGS_FIELDS) if (S[k] !== before[k]) { dirty = true; break; }
  if (!dirty && S.prefTab !== before.prefTab) dirty = true;
  if (dirty) saveSettings();
}

function drawPreferencesBody() {
  const w = 500, h = 510;
  /* 这里原来自己算位置（Math.max(8, rw/2 - w/2)），只挡住了左边和上边，
     右边和下边仍然溢出 —— 竖屏下 500x510 的窗口会有大半在屏幕外，
     分页标签和底部按钮都点不到。改成走 dialogFrame()，统一享受
     "等比缩放 + 居中" 的适配逻辑。 */
  const f = dialogFrame(w, h);
  const x1 = f.x1, y1 = f.y1, x2 = f.x2, y2 = f.y2;
  drawWindow(x1, y1, x2, y2);

  // 标题
  setFont(FONT.mainbold(13));
  setColor(C.text);
  text(x1 + 12, y1 + 9, '首选项');
  setFont(FONT.main());

  // 分页
  let b = x1 + 12;
  const ty = y1 + 52;
  setFont(FONT.main());
  PREF_TABS.forEach((label, i) => {
    const tw = textWidth(label) + 14;
    const hover = mouseRectangle(b, ty - 8, tw, 26);
    const sel = S.prefTab === i;
    if (sel) {
      setColor(C.dark ? '#3a3a3a' : '#e6e6e6');
      roundRect(b, ty - 8, b + tw, ty + 18, 4, true);
      setColor(C.accent);
      roundRect(b + 6, ty + 14, b + tw - 6, ty + 17, 2, true);
    } else if (hover) {
      setColor(C.dark ? '#333333' : '#ededed');
      roundRect(b, ty - 8, b + tw, ty + 18, 4, true);
    }
    setColor(sel ? C.text : C.textDim);
    text(b + 7, ty - 4, label);
    if (hover && G.mbr[0]) { S.prefTab = i; if (S.windowsound) playUISound('invoke'); }
    b += tw + 4;
  });

  const tab = S.prefTab || 0;
  // 内容基准。对照 draw_window_preferences.gml：源码里每个坐标都写成
  //     y1 + 74 + (theme = 3) * 22
  // 也就是说这 22px 的额外下移【只有 Fluent(theme 3) 才有】，
  // 因为 Fluent 的 draw_areaheader 不画框，需要给框上方的标题文字腾出位置；
  // 其它主题有框、标题压在框线上，不需要这个偏移。
  // 之前无条件 +22，导致 Fluent 下内容整体偏高、标题文字被挤出可视区看不见，
  // 非 Fluent 下内容又整体偏低 22px。
  const ox = x1, oy = y1 + 22 + (S.theme === 3 ? 22 : 0);

  if (tab === 0) {
    // 启动
    drawAreaHeader(ox + 22, oy + 74, 243, 85, '启动');
    if (drawCheckbox(ox + 40, oy + 90, !!S.show_oldwarning, '打开旧版格式时提示', false, true))
      S.show_oldwarning = S.show_oldwarning ? 0 : 1;
    if (drawCheckbox(ox + 40, oy + 112, !!S.windowsound, '界面音效', false, true))
      S.windowsound = S.windowsound ? 0 : 1;
    if (drawCheckbox(ox + 40, oy + 134, !!S.marker_follow, '播放时自动滚动', false))
      S.marker_follow = S.marker_follow ? 0 : 1;

    // 自动保存
    drawAreaHeader(ox + 278, oy + 74, 200, 85, '自动保存');
    if (drawCheckbox(ox + 296, oy + 90, !!S.autosave, '启用自动保存', false, true))
      S.autosave = S.autosave ? 0 : 1;
    setFont(FONT.small()); setColor(C.textDim);
    text(ox + 296, oy + 116, '间隔（分钟）');
    setFont(FONT.main());
    S.autosavemins = clamp(Math.round(drawDragValue(61, ox + 380, oy + 110, S.autosavemins || 10, 0.5)), 1, 60);

    // 歌曲
    drawAreaHeader(ox + 22, oy + 184, 456, 145, '歌曲');
    setFont(FONT.small()); setColor(C.textDim);
    text(ox + 40, oy + 202, '保存为 NBS 版本');
    setFont(FONT.main());
    const vers = [[5, 'v5（推荐）'], [4, 'v4'], [3, 'v3'], [2, 'v2'], [1, 'v1']];
    let vx = ox + 40;
    for (const [v, label] of vers) {
      if (drawRadiobox(vx, oy + 220, S.save_version === v, label)) S.save_version = v;
      vx += 88;
    }
    setFont(FONT.small()); setColor(C.textDim);
    text(ox + 40, oy + 252, '低于 v4 的版本无法保存音量 / 声道 / 音高，' + (S.save_version < 4 ? '当前会丢失这些属性。' : '当前设置可完整保存。'));
    text(ox + 40, oy + 276, '自动保存的文件可在下次打开时恢复。');
    setFont(FONT.main());
  } else if (tab === 1) {
    // 主题
    // 对照 draw_window_preferences.gml:318-329：区域标题「主题」+ 一个下拉框
    //   draw_area(x1+40, ..., x1+140, ...)          —— 下拉框外框
    //   if (draw_abutton(x1+140-17, ...))           —— 右侧小三角按钮
    //   show_menu_ext("theme", ..., check(theme=0)+"经典|" + check(theme=2)+"暗黑|"
    //                                 + check(theme=1)+"复古|" + check(theme=3)+"Fluent")
    //   draw_text_dynamic(x1+43, ..., 当前主题名)
    // 顺序就是源码的 经典(0) / 暗黑(2) / 复古(1) / Fluent(3)，注意不是 0/1/2/3。
    drawAreaHeader(ox + 22, oy + 74, 218, 140, '主题');
    const THEMES = [[0, '经典'], [2, '暗黑'], [1, '复古'], [3, 'Fluent']];
    const cur = THEMES.find(t => t[0] === S.theme) || THEMES[3];
    const bx = ox + 40, by = oy + 95, bw = 100, bh = 20;
    // 下拉框底
    setColor(C.controlBg);
    roundRect(bx, by, bx + bw, by + bh, 3, true);
    setColor(C.controlBorder);
    roundRect(bx, by, bx + bw, by + bh, 3, false);
    // 当前值
    setFont(FONT.main()); setColor(C.text);
    text(bx + 4, by + 4, cur[1]);
    // 右侧小三角
    setColor(C.dark ? '#cccccc' : '#333333');
    const ax2 = bx + bw - 12, ay2 = by + 8;
    G.ctx.beginPath();
    G.ctx.moveTo(ax2, ay2); G.ctx.lineTo(ax2 + 8, ay2); G.ctx.lineTo(ax2 + 4, ay2 + 5);
    G.ctx.closePath(); G.ctx.fill();
    // 点击展开主题菜单（对照源码的 draw_abutton + show_menu_ext("theme", ...)）
    // 注意：这里【不能】判断 !isDialogWindow(S.window) —— 首选项窗口自身的 window 值
    // 就是 W_PREFERENCES，那个条件恒为假，下拉框永远点不开。
    // GML 的原始条件是 `mouse_check_button_pressed(mb_left)`，只要求当前没有别的弹出菜单。
    if (mouseRectangle(bx, by, bw, bh) && !UI.menu) {
      G.cursor = 'pointer';
      if (G.mbp[0]) {
        let s = '';
        for (const [v, label] of THEMES) s += (S.theme === v ? '+ ' : '') + label + '|';
        /* 这里 (bx, by+bh) 是【设计坐标】（以窗口左上角为原点），
           而 drawMenu 画在屏幕空间 —— 必须经 dlgToScreen() 换算。
           漏了这一步，菜单就会按设计坐标的小数值画到窗口左上角附近，
           也就是用户说的「主题下拉框的列表飞到左上角」。
           同文件里 instruments_press / instruments_pitch 两个下拉框
           本来就做了换算，只有这一处漏了。 */
        const sp = dlgToScreen(bx, by + bh);
        showMenu('theme', sp.x, sp.y, s);
      }
    }
    if (drawCheckbox(ox + 40, oy + 130, !!S.fdark, '暗色模式', S.theme !== 3, true)) {
      S.fdark = S.fdark ? 0 : 1;
    }
    if (drawCheckbox(ox + 40, oy + 152, !!S.blackout, '全黑模式', false, true)) S.blackout = S.blackout ? 0 : 1;
    if (drawCheckbox(ox + 40, oy + 174, !!S.windowsound, '界面音效', S.theme !== 3, true)) S.windowsound = S.windowsound ? 0 : 1;
    if (drawCheckbox(ox + 40, oy + 196, !!S.remove_effect, '显示删除效果', false)) S.remove_effect = S.remove_effect ? 0 : 1;

    // 窗口
    drawAreaHeader(ox + 258, oy + 74, 220, 64, '窗口');
    setFont(FONT.small()); setColor(C.textDim);
    text(ox + 276, oy + 96, '缩放');
    setFont(FONT.main());
    drawWindowScaleDrag(62, ox + 322, oy + 90);
    text(ox + 388, oy + 92, '%');
    if (button2(ox + 404, oy + 89, 64, '重置')) { S.window_scale = 1; layoutResize(); }

    // 分辨率 / 其它
    if (drawCheckbox(ox + 276, oy + 116, !!S.hires, '为高分辨率优化', false, true)) S.hires = S.hires ? 0 : 1;
    drawAreaHeader(ox + 22, oy + 239, 220, 65, '其它');
    if (drawCheckbox(ox + 40, oy + 259, !!S.show_soundcount, '状态栏显示发声数', false))
      S.show_soundcount = S.show_soundcount ? 0 : 1;
    drawAreaHeader(ox + 258, oy + 239, 220, 65, '音符盒');
    if (drawCheckbox(ox + 276, oy + 259, !!S.use_icons, '显示音色图标', false)) S.use_icons = S.use_icons ? 0 : 1;
    if (drawCheckbox(ox + 276, oy + 281, !!S.use_shapes, '使用形状区分音色', false)) S.use_shapes = S.use_shapes ? 0 : 1;
  } else if (tab === 2) {
    // 音符盒
    drawAreaHeader(ox + 22, oy + 74, 456, 196, '音符盒');
    const cb = (dy, key, label) => {
      if (drawCheckbox(ox + 40, oy + dy, !!S[key], label, false)) S[key] = S[key] ? 0 : 1;
    };
    cb(90, 'use_colors', '彩色音符盒');
    cb(110, 'use_icons', '显示音色图标');
    cb(130, 'use_shapes', '音符盒形状区分音色');
    cb(150, 'show_numbers', '显示音符序号');
    cb(170, 'show_octaves', '显示八度序号');
    cb(190, 'show_incompatible', '标记不兼容的音符盒');
    cb(210, 'fade', '音符盒不透明');
    cb(230, 'show_layers', '显示每层操作区');
    cb(250, 'remove_effect', '显示删除效果');

    // 琴键
    drawAreaHeader(ox + 22, oy + 294, 456, 171, '琴键');
    if (drawCheckbox(ox + 40, oy + 310, !!S.show_piano, '显示琴键', false, true)) S.show_piano = S.show_piano ? 0 : 1;
    setFont(FONT.small()); setColor(C.textDim);
    text(ox + 40, oy + 336, '琴键数量');
    setFont(FONT.main());
    S.keysmax = clamp(Math.round(drawDragValue(63, ox + 150, oy + 330, S.keysmax, 2)), 20, 50);
    const cb2 = (dy, key, label) => {
      if (drawCheckbox(ox + 40, oy + dy, !!S[key], label, false)) S[key] = S[key] ? 0 : 1;
    };
    cb2(350, 'show_keynames', '显示键名');
    cb2(370, 'show_keynumbers', '显示音符序号');
    cb2(390, 'show_keyboard', '显示键盘键位');
    cb2(410, 'show_notechart', '悬停时显示五线谱');
    cb2(430, 'show_outofrange', '标记超范围琴键');
    if (drawCheckbox(ox + 40, oy + 450, !!S.keynames_flat, '使用降记号（b）', false)) {
      S.keynames_flat = S.keynames_flat ? 0 : 1;
    }
  } else if (tab === 3) {
    // 鼠标滚轮
    drawAreaHeader(ox + 22, oy + 74, 456, 120, '鼠标滚轮');
    if (drawRadiobox(ox + 40, oy + 90, S.mousewheel === 0, '使用鼠标滚轮移动位置')) S.mousewheel = 0;
    if (drawRadiobox(ox + 40, oy + 110, S.mousewheel === 1, '使用鼠标滚轮改变音色')) S.mousewheel = 1;
    if (drawRadiobox(ox + 40, oy + 130, S.mousewheel === 2, '使用鼠标滚轮改变音调')) S.mousewheel = 2;
    if (drawCheckbox(ox + 40, oy + 158, !!S.changepitch, '在音符上滚动时改变其属性', false))
      S.changepitch = S.changepitch ? 0 : 1;

    // 琴键
    drawAreaHeader(ox + 22, oy + 220, 456, 105, '琴键');
    if (drawCheckbox(ox + 40, oy + 236, !!S.select_lastpressed, '选择按下的键', false))
      S.select_lastpressed = S.select_lastpressed ? 0 : 1;
    if (button2(ox + 40, oy + 290, 160, '重置键位')) {
      const seq = '1Q2W3ER5T6YU8I9O0PZSXDCVG';
      S.piano_key = new Array(88).fill(0);
      let k = 33;
      for (const ch of seq) S.piano_key[k++] = ch.charCodeAt(0);
      setMsg('键位已重置');
    }
  } else {
    // 进度条
    drawAreaHeader(ox + 22, oy + 74, 456, 145, '进度条');
    if (drawCheckbox(ox + 40, oy + 90, !!S.marker_follow, '播放时跟随进度条', false))
      S.marker_follow = S.marker_follow ? 0 : 1;
    if (drawRadiobox(ox + 70, oy + 110, S.marker_pagebypage === 1, '按页', !S.marker_follow)) S.marker_pagebypage = 1;
    if (drawRadiobox(ox + 70, oy + 130, S.marker_pagebypage === 0, '按刻', !S.marker_follow)) S.marker_pagebypage = 0;
    if (drawRadiobox(ox + 70, oy + 150, S.marker_pagebypage === 2, '按帧', !S.marker_follow)) S.marker_pagebypage = 2;
    if (drawCheckbox(ox + 40, oy + 170, !!S.marker_start, '在区间时开始播放', false))
      S.marker_start = S.marker_start ? 0 : 1;
    if (drawCheckbox(ox + 40, oy + 190, !!S.marker_end, '在区间后停止播放', false))
      S.marker_end = S.marker_end ? 0 : 1;

    // 播放
    drawAreaHeader(ox + 22, oy + 244, 218, 120, '播放');
    if (drawCheckbox(ox + 32, oy + 260, !!S.realvolume, '显示每层音量', false)) S.realvolume = S.realvolume ? 0 : 1;
    if (drawCheckbox(ox + 32, oy + 282, !!S.realstereo, '关闭立体声', false)) S.realstereo = S.realstereo ? 0 : 1;
    if (drawCheckbox(ox + 32, oy + 304, !!S.show_soundcount, '显示正在播放的声音数', false)) S.show_soundcount = S.show_soundcount ? 0 : 1;
    if (drawCheckbox(ox + 32, oy + 326, !!S.channelstoggle, '提升声音限制', false)) S.channelstoggle = S.channelstoggle ? 0 : 1;

    // 速度单位
    drawAreaHeader(ox + 255, oy + 244, 223, 60, '速度单位');
    if (drawRadiobox(ox + 265, oy + 260, !S.use_bpm, '红石刻 / 秒 (t/s)')) S.use_bpm = 0;
    if (drawRadiobox(ox + 265, oy + 282, !!S.use_bpm, '拍数 / 分钟 (BPM)')) S.use_bpm = 1;
  }

  // 确定
  if (button2(x2 - 88, y2 - 36, 72, '确定') || G.keysPressed['Escape'] || (G.ctrl && G.keysPressed['p'])) {
    closeWindow();
    saveSettings();
  }
}

/* 缩放滑块：拖动量按「屏幕像素」记，缩放变化不会反过来影响手感 */
function drawWindowScaleDrag(id, x, y) {
  const w = 60, h = 16;
  setColor(C.controlBg);
  roundRect(x, y, x + w, y + h, 4, true);
  setColor(UI.scaleDrag ? C.accent : C.controlBorder);
  roundRect(x + 0.5, y + 0.5, x + w - 0.5, y + h - 0.5, 4, false);
  setFont(FONT.main());
  setColor(C.text);
  text(x + w / 2, y + 2, Math.round(S.window_scale * 100), 'center');

  const hover = mouseRectangle(x, y, w, h);
  if (hover) G.cursor = 'ns-resize';
  if (hover && G.mbp[0]) {
    // 记录起始时鼠标在屏幕上的位置（逻辑坐标 × 当前缩放）
    UI.scaleDrag = { screenY: G.mouse.y * S.window_scale, start: S.window_scale };
  }
  if (UI.scaleDrag) {
    if (!G.mb[0]) {
      // 松手：拖动过程中每帧都在改 window_scale，而 drawPreferences 的
      // 脏检查是「本帧前后比对」，拖动那一帧之后 S 与快照已经同步，
      // 松手帧不会再产生差异，于是缩放值永远落不了盘。
      // 这里在拖动结束时显式保存一次。
      UI.scaleDrag = null;
      saveSettings();
    } else {
      const dy = UI.scaleDrag.screenY - G.mouse.y * S.window_scale;   // 向上为正
      const ns = clamp(UI.scaleDrag.start * Math.pow(1.6, dy / 120), 0.5, 4);
      const q = Math.round(ns * 20) / 20;
      if (Math.abs(q - S.window_scale) > 0.001) { S.window_scale = q; layoutResize(); }
    }
  }
}

/* ---------------------------------------------------------------- 兼容性说明 */
function drawCompatibilityInfo() {
  const f = dialogFrame(460, 280);
  drawWindow(f.x1, f.y1, f.x2, f.y2);
  drawWindowTitle(f.x1, f.y1, '兼容性');
  setFont(FONT.main());
  let y = f.y1 + 42;
  const lines = S.compatible === 1
    ? ['此歌曲完全兼容 Minecraft 的两种导入方式：',
      '',
      '  · 结构方块 / .schematic 文件',
      '  · 数据包（datapack）',
      '',
      '条件：速度是 10、5 或 2.5 t/s，且没有微分音高，',
      '所有音符都在 Minecraft 的 2 个八度范围内。']
    : S.compatible === 2
      ? ['此歌曲只能通过数据包导入。', '',
        '原因可能是速度不是 10/5/2.5 t/s，或存在微分音高。',
        '速度用「歌曲属性」改成 10 t/s、并把音高归零即可完全兼容。']
      : ['此歌曲需要资源包才能完整还原。', '',
        '原因：存在超出 2 个八度范围的音符，或使用了自定义音色。',
        '红框标记的就是这些音符。'];
  setColor(C.text);
  for (const l of lines) { text(f.x1 + 20, y, l); y += 18; }
  if (button2(f.x2 - 76, f.y2 - 34, 64, '关闭') || G.keysPressed['Escape']) closeWindow();
}

/* ---------------------------------------------------------------- 保存选项 */
function drawSaveOptions() {
  const f = dialogFrame(360, 240);
  drawWindow(f.x1, f.y1, f.x2, f.y2);
  drawWindowTitle(f.x1, f.y1, '保存选项');
  setFont(FONT.main());
  setColor(C.text);
  text(f.x1 + 18, f.y1 + 40, '保存为 NBS 版本：');
  const vers = [[5, 'v5（最新，含音量/声道/音高）'], [4, 'v4（含音量/声道/音高）'], [3, 'v3（旧版）'], [2, 'v2（很旧）'], [1, 'v1（最旧）']];
  let y = f.y1 + 66;
  for (const [v, label] of vers) {
    if (drawRadiobox(f.x1 + 24, y, S.save_version === v, label)) S.save_version = v;
    y += 24;
  }
  setFont(FONT.small());
  setColor(C.textDim);
  text(f.x1 + 18, y + 6, '注意：低于 v4 的版本无法保存音量、声道与音高。');
  okCancel(f, () => closeWindow());
}

/* ---------------------------------------------------------------- 关于 */
function drawAbout() {
  const f = dialogFrame(400, 360);
  drawWindow(f.x1, f.y1, f.x2, f.y2);
  drawWindowTitle(f.x1, f.y1, '关于');
  setFont(FONT.info_med_bold(20));
  setColor(C.accent);
  text(f.x1 + 20, f.y1 + 44, 'Note Block Studio');
  setFont(FONT.small());
  setColor(C.text);
  const lines = [
    '网页重制版（Web Remake）',
    '',
    '作者：ZeroRaltal',
    'https://github.com/Zero-Raltal/NBS-On-Web',
    '',
    '本项目以 MIT License 开源。',
    '',
    '基于 OpenNBS / NoteBlockStudio 的开源实现移植，',
    '原始项目：MIT License © 2024 OpenNBS',
    'https://github.com/OpenNBS/NoteBlockStudio',
    '',
    '使用 HTML + 原生 JavaScript + Web Audio 实现，',
    '界面、操作与 .nbs 文件格式与桌面版保持一致。',
    '',
    '音色与图标素材来自原项目（MIT）。',
  ];
  let y = f.y1 + 74;
  for (const l of lines) { text(f.x1 + 20, y, l); y += 17; }
  if (button2(f.x2 - 76, f.y2 - 34, 64, '关闭') || G.keysPressed['Escape']) closeWindow();
}

/* ---------------------------------------------------------------- MIDI 导入 */
/* 对照 draw_window_midi_import.gml：600x400 窗口
   上：选项区（去除空白/命名/速度/层高/八度/音量/精度）
   中：三个分页（乐器 / 打击乐 / 轨道），列表 + 滚动条
   下：记住我的更改 + 使用默认值 / 取消 / 导入 */
const MIDI_TABS = ['乐器', '打击乐', '轨道'];

function drawMidiImport() {
  /* 这是最大的一个窗口（600x400），原来直接按 rw/2-300 居中，
     竖屏下左右各溢出 105px，底部按钮完全够不着。统一走 dialogFrame()。 */
  const mf = dialogFrame(600, 400);
  const x1 = mf.x1, y1 = mf.y1, x2 = mf.x2, y2 = mf.y2;
  drawWindow(x1, y1, x2, y2);
  // 对照 draw_window_midi_import.gml:12-17：Fluent 主题下顶部（选项区 0..148）
  // 单独铺一层浅灰圆角底（fdark 时是深灰），与下面的列表区区分开。
  // 其他主题不画这层 —— 这就是之前「MIDI 导入窗口风格不随主题变化」的原因：
  // 我只用了 C.* 通用色，完全没有这段分支。
  if (S.theme === 3) {
    setColor(S.fdark ? '#333333' : '#cccccc');
    roundRect(x1 + 1, y1 + 1, x1 + 598, y1 + 148, 8, true);
  }

  setFont(FONT.mainbold(13)); setColor(C.text);
  text(x1 + 8, y1 + 8, '导入MIDI');
  setFont(FONT.main());

  // 文件名 + 时长（右上）
  setFont(FONT.small()); setColor(C.textDim);
  text(x2 - 10, y1 + 6, S.midiName || '', 'right');
  setFont(FONT.mainbold(11)); setColor(C.text);
  const secs = S.midiData ? (S.midiData.tempo / 1e6) * ((S.midiMaxPos || 0) / (S.midiData.ppq & 0x7fff)) : 0;
  text(x2 - 10, y1 + 22, secs > 0 ? timeStr(secs) : '速度未定义', 'right');
  setFont(FONT.main());

  // ---- 左侧：命名 ----
  if (drawCheckbox(x1 + 32, y1 + 32, !!S.midiRemoveSilent, '去除开始时空部分')) S.midiRemoveSilent = S.midiRemoveSilent ? 0 : 1;
  if (drawCheckbox(x1 + 32, y1 + 52, !!S.midiNameLayers, '给每层命名......')) S.midiNameLayers = S.midiNameLayers ? 0 : 1;
  if (drawRadiobox(x1 + 52, y1 + 72, !!S.midiNamePatch, '......根据乐器', !S.midiNameLayers)) S.midiNamePatch = 1;
  if (drawRadiobox(x1 + 52, y1 + 92, !S.midiNamePatch, '......根据层号', !S.midiNameLayers)) S.midiNamePatch = 0;

  // ---- 中间：速度 / 层高 / 八度 / 音量 ----
  if (drawCheckbox(x1 + 230, y1 + 32, !!S.midiTempo, '导入速度')) S.midiTempo = S.midiTempo ? 0 : 1;
  setFont(FONT.small()); setColor(C.textDim);
  text(x1 + 230, y1 + 54, '通道最高层数:');
  setFont(FONT.main());
  S.midiMaxHeight = clamp(round(drawDragValue(201, x1 + 310, y1 + 50, S.midiMaxHeight || 20, 0.1)), 1, 20);
  if (drawCheckbox(x1 + 230, y1 + 72, !!S.midiOctave, '保持八度范围')) S.midiOctave = S.midiOctave ? 0 : 1;
  if (drawCheckbox(x1 + 230, y1 + 92, !!S.midiVel, '导入音符音量')) S.midiVel = S.midiVel ? 0 : 1;

  // ---- 右侧：精度 ----
  setFont(FONT.small()); setColor(C.textDim);
  text(x1 + 470, y1 + 32, '精准度');
  setFont(FONT.main());
  const prec = [[0, '1 倍'], [1, '2 倍'], [3, '4 倍'], [7, '8 倍']];
  prec.forEach(([v, label], i) => {
    const px = x1 + 470 + (i % 2) * 52, py = y1 + 52 + floor(i / 2) * 20;
    if (drawRadiobox(px, py, (S.midiPrecision | 0) === v, label)) S.midiPrecision = v;
  });

  // ---- 分页标题 ----
  // 对照 draw_window_midi_import.gml:119-160，这里分三种画法：
  //   theme 0/3（经典/Fluent）：白色（Fluent 用 15987699 浅灰）列表底 + 灰边框，
  //                             选中页签是同色块 + 底色
  //   theme 1（复古）：列表底铺白 + draw_area 立体边框，页签用 spr_tabbuttons 24/25/26
  //   其余（暗黑）：c_dark 深灰底 + 灰边框
  /* 对照 draw_window_midi_import.gml:105-118 与 140-144 —— 页签是【两种画法叠加】：
       · 未选中的页签（第 111-113 行）：spr_tabbuttons 三片，
         帧 = 0/1/2 + 3*c + 6*theme + 9*(fdark && theme==3)，c 是 hover 标志；
       · 选中的页签（第 140-144 行）：theme 1 用 24/25/26 三片盖在上面，
         theme 0/3/2 则用色块 + 边框。
     之前的实现把两者混在一起：选中态用了 24 段，而未选中态【根本没画 sprite】，
     导致非选中页签在经典/复古/暗黑主题下是一块无样式的色块 ——
     页签风格与主题完全不搭。 */
  let bx = x1 + 8;
  MIDI_TABS.forEach((label, i) => {
    const tw = textWidth(label) + 16;
    const hover = mouseRectangle(bx, y1 + 128, tw, 18);
    const on = (S.midiTab === i);
    if (!on) {
      /* 未选中：Fluent 走圆角描边，其余三主题走 spr_tabbuttons 三片。 */
      if (S.theme === 3) {
        setColor(C.controlBorder);
        roundRect(bx + 0.5, y1 + 128.5, bx + tw - 0.5, y1 + 145.5, 4, false);
      } else {
        const bb = 0 + 3 * (hover ? 1 : 0) + 6 * S.theme;
        drawSprite('spr_tabbuttons', bb, bx, y1 + 128);
        drawSprite('spr_tabbuttons', bb + 1, bx + 2, y1 + 128, (tw - 4) / 2, 1);
        drawSprite('spr_tabbuttons', bb + 2, bx + tw - 2, y1 + 128);
      }
    } else {
      /* 选中：theme 1 → 24/25/26 三片立体页签；theme 0/2/3 → 与列表同色的块。 */
      if (S.theme === 1) {
        drawSprite('spr_tabbuttons', 24, bx - 1, y1 + 126);
        drawSprite('spr_tabbuttons', 25, bx + 1, y1 + 126, (tw + 2) / 2 - 1, 1);
        drawSprite('spr_tabbuttons', 26, bx + tw - 1, y1 + 126);
      } else if (S.theme === 3) {
        setColor(S.fdark ? '#414141' : '#f3f3f3');
        roundRect(bx, y1 + 128, bx + tw, y1 + 146, 4, true);
        setColor(C.controlBorder);
        roundRect(bx + 0.5, y1 + 128.5, bx + tw - 0.5, y1 + 145.5, 4, false);
      } else {
        setColor(S.theme === 2 ? '#303030' : '#ffffff');
        fillRect(bx, y1 + 128, tw, 18);
        setColor(make_color_rgb(137, 140, 149));
        fillRect(bx, y1 + 128, tw, 1);
        fillRect(bx, y1 + 145, tw, 1);
        fillRect(bx, y1 + 128, 1, 18);
        fillRect(bx + tw - 1, y1 + 128, 1, 18);
      }
    }
    setColor(on ? C.text : C.textDim);
    setFont(on ? FONT.mainbold() : FONT.main());
    text(bx + 8, y1 + 131, label);
    if (hover && G.mbr[0]) { S.midiTab = i; if (S.windowsound) playUISound('invoke'); }
    bx += tw + 4;
  });
  setFont(FONT.main());

  // ---- 列表区 ----
  // 对照 draw_window_midi_import.gml:119-160 的三种底色：
  //   theme 0/3 → 白 / Fluent 浅灰(15987699)、fdark 深灰(2105376)
  //   theme 1   → 白 + draw_area 立体边
  //   其余      → c_dark
  if (S.theme === 3) {
    setColor(S.fdark ? '#202020' : '#f3f3f3');
    roundRect(x1 + 6, y1 + 146, x2 - 6, y1 + 362, 4, true);
  } else if (S.theme === 1) {
    setColor('#ffffff');
    fillRect(x1 + 9, y1 + 149, (x2 - 9) - (x1 + 9), (y1 + 358) - (y1 + 149));
  } else {
    setColor(S.theme === 2 ? '#303030' : '#ffffff');
    fillRect(x1 + 6, y1 + 146, (x2 - 6) - (x1 + 6), (y1 + 362) - (y1 + 146));
  }
  setColor(make_color_rgb(137, 140, 149));
  fillRect(x1 + 6, y1 + 146, (x2 - 6) - (x1 + 6), 1);
  fillRect(x1 + 6, y1 + 361, (x2 - 6) - (x1 + 6), 1);
  fillRect(x1 + 6, y1 + 146, 1, (y1 + 362) - (y1 + 146));
  fillRect(x2 - 7, y1 + 146, 1, (y1 + 362) - (y1 + 146));

  const rowY = (a) => y1 + 178 + 20 * a;   // 表头在 y1+151，行从这里开始
  const colX = (n) => x1 + 12 + n;
  const hdrY = y1 + 151;

  const drawHeader = (labels, widths) => {
    let x = x1 + 12;
    setFont(FONT.small()); setColor(C.textDim);
    for (let i = 0; i < labels.length; i++) { text(x + 4, hdrY, labels[i]); x += widths[i]; }
    setFont(FONT.main());
    setColor(C.separator);
    line(x1 + 12, hdrY + 19, x2 - 14, hdrY + 19);
    let xx = x1 + 12;
    line(xx, hdrY, xx, hdrY + 19);
    for (let i = 0; i < widths.length; i++) { xx += widths[i]; line(xx, hdrY, xx, hdrY + 19); }
  };

  if (S.midiTab === 0) {
    // 通道 / 乐器 / 乐器名 / 音色 / 八度调整
    // 列宽对照 draw_window_midi_import.gml:179-191：tabw = 50 / 41 / 260 / 130 / 100
    const W = [50, 41, 260, 130, 100];
    drawHeader(['通道', '乐器', '乐器名', '音色', '八度调整'], W);
    const rows = Math.min(S.midiChannels.length, 9);
    for (let a = 0; a < rows; a++) {
      const c = S.midiChannels[a];
      const y = rowY(a);
      setFont(FONT.main()); setColor(c.ch === 9 ? C.textDim : C.text);
      text(x1 + 16, y, String(c.ch + 1));
      if (c.ch === 9) {
        text(x1 + 16 + W[0], y, '-');
        text(x1 + 16 + W[0] + W[1], y, '打击乐');
        setColor(C.textDim);
        text(x1 + 16 + W[0] + W[1] + W[2], y, '请查看「打击乐」页面');
        text(x1 + 16 + W[0] + W[1] + W[2] + W[3], y, '-');
      } else {
        text(x1 + 16 + W[0], y, String(c.patch + 1));
        text(x1 + 16 + W[0] + W[1], y, c.patchname || '未知');
        // ---- 音色列 ----
        // 对照 :232-241：文字画在列左端，整个「列宽-20」的区域是「点击预览声音」热区，
        // 只有列尾那 16px 才是下拉箭头（draw_abutton）。
        // 之前我用 button2(ix, y-4, iw, ...) 把整列画成了按钮框，
        // 于是下拉框几乎撑满整行 —— 原版并没有那个大框。
        const ixn = x1 + 8 + W[0] + W[1] + W[2];               // 音色列起点（原版 x1+8）
        const insName = c.ins >= 0 && INSTRUMENTS[c.ins] ? INSTRUMENTS[c.ins].name : '无';
        setColor(c.ins < 0 ? C.textDim : C.text);
        // 原版 :232：x1 + 12 + 4 + tabw[0] + tabw[1] + tabw[2] —— 注意要加 W[2]，
        // 否则音色名会画到「乐器名」列上，两串文字叠在一起。
        text(x1 + 16 + W[0] + W[1] + W[2], y, insName);
        if (c.ins >= 0) {
          const hov = mouseRectangle(ixn, y - 6, W[3] - 20, 20);
          if (hov) {
            G.cursor = 'pointer';
            popupSet(ixn, y - 6, W[3] - 20, 20, '点击预览声音');
            if (G.mbp[0]) playSound(INSTRUMENTS[c.ins], 45 + (c.oct || 0) * 12, 100, 100, 0);
          }
        }
        // 下拉箭头：原版 x1 + 8 + tabw[0..2] + tabw[3] - 20，y1 + 172 + 20*a
        const iax = x1 + 8 + W[0] + W[1] + W[2] + W[3] - 20;
        const iay = y1 + 172 + 20 * a;
        drawArrowButton(iax, iay, false);
        if (mouseRectangle(iax, iay, 16, 18) && G.mbr[0]) openMidiInsMenu(c);

        // ---- 八度调整列 ----
        const ox = x1 + 16 + W[0] + W[1] + W[2] + W[3];
        text(ox, y, midiOctStr(c.oct));
        // 原版 x1 + 8 + tabw[0..3] + tabw[4] - 36
        const oax = x1 + 8 + W[0] + W[1] + W[2] + W[3] + W[4] - 36;
        drawArrowButton(oax, iay, false);
        if (mouseRectangle(oax, iay, 16, 18) && G.mbr[0]) openMidiOctMenu(c);
      }
      setColor(C.separator);
      line(x1 + 12, y + 18, x2 - 14, y + 18);
    }
  } else if (S.midiTab === 1) {
    // 音调 / 声音名 / 音色 / 音高
    // 列宽对照 :285-294：tabw = 50 / 220 / 210 / 100
    const W = [50, 220, 210, 100];
    drawHeader(['音调', '声音名', '音色', '音高'], W);
    const list = S.midiPerc || [];
    const rows = Math.min(list.length, 9);
    for (let a = 0; a < rows; a++) {
      const p = list[a];
      const y = rowY(a);
      setFont(FONT.main()); setColor(p.ins < 0 ? C.textDim : C.text);
      text(x1 + 16, y, String(p.note));
      text(x1 + 16 + W[0], y, p.name);
      const name = p.ins >= 0 && INSTRUMENTS[p.ins] ? INSTRUMENTS[p.ins].name : '无';
      text(x1 + 16 + W[0] + W[1], y, name);
      // 同上：只有列尾 16px 是下拉箭头（原版 :332）
      const iax = x1 + 8 + W[0] + W[1] + W[2] - 19;
      const iay = y1 + 172 + 20 * a;
      if (p.ins >= 0) {
        drawArrowButton(iax, iay, false);
        if (mouseRectangle(iax, iay, 16, 18) && G.mbr[0]) openMidiPercInsMenu(p);
      }
      const ox = x1 + 16 + W[0] + W[1] + W[2];
      text(ox, y, p.ins < 0 ? '-' : getKeyname(median(0, p.key, 87), 1));
      if (p.ins >= 0) {
        // 原版 :343：x1 + 8 + tabw[0..2] + tabw[3] - 35
        const oax = x1 + 8 + W[0] + W[1] + W[2] + W[3] - 35;
        drawArrowButton(oax, iay, false);
        if (mouseRectangle(oax, iay, 16, 18) && G.mbr[0]) openMidiPercPitchMenu(p);
      }
      setColor(C.separator);
      line(x1 + 12, y + 18, x2 - 14, y + 18);
    }
  } else {
    // 轨道页：对照 draw_window_midi_import.gml:379-396，原版只有三列
    // tabw = 79 / 300 / 200（没有「通道」列）
    const W = [79, 300, 200];
    drawHeader(['轨道序号', '轨道名', '事件数'], W);
    const list = (S.midiData && S.midiData.tracks) || [];
    const rows = Math.min(list.length, 9);
    for (let a = 0; a < rows; a++) {
      const t = list[a];
      const y = rowY(a);
      setFont(FONT.main()); setColor(C.text);
      text(x1 + 16, y, String(a + 1));
      text(x1 + 16 + W[0], y, t.name);
      text(x1 + 16 + W[0] + W[1], y, String(t.amount || t.notes.length));
      setColor(C.separator);
      line(x1 + 12, y + 18, x2 - 14, y + 18);
    }
  }

  // 列表右侧滚动条（对照 draw_scrollbar(midi_sb1, x1+572, y1+171, 17, 9, ...)）
  const count = S.midiTab === 0 ? S.midiChannels.length : S.midiTab === 1 ? (S.midiPerc || []).length : ((S.midiData && S.midiData.tracks.length) || 0);
  if (count > 9) {
    S.midiSb = S.midiSb || [0, 0, 0];
    const sbId = 3 + S.midiTab;
    SB.val[sbId] = S.midiSb[S.midiTab] || 0;
    const v = drawScrollbarGML(sbId, x1 + 572, y1 + 171, 17, 9, count, 0, 1);
    S.midiSb[S.midiTab] = v;
  }

  // ---- 底部 ----
  if (drawCheckbox(x1 + 12, y1 + 374, !!S.midiRemember, '记住我的更改', false, true)) S.midiRemember = S.midiRemember ? 0 : 1;
  if (button2(x1 + 360, y1 + 368, 72, '使用默认值')) midiUseDefaults();
  const ok = button2(x1 + 520, y1 + 368, 72, '导入');
  if (button2(x1 + 440, y1 + 368, 72, '取消') || G.keysPressed['Escape']) { S.window = 0; }
  if (ok) applyMidiImport();
}

/* 「使用默认值」：从音色表/鼓组表恢复（对照 draw_window_midi_import 的同名按钮） */
function midiUseDefaults() {
  for (const c of S.midiChannels) {
    const t = MIDI_PATCH_TABLE[c.patch] || MIDI_PATCH_TABLE[0];
    c.ins = c.ch === 9 ? -1 : t.ins;
    c.oct = c.ch === 9 ? 0 : t.oct;
  }
  for (const p of (S.midiPerc || [])) {
    const t = MIDI_DRUM_TABLE[p.note - 24];
    if (t) { p.ins = t.ins; p.key = t.key + 33; }
  }
  S.midiRemoveSilent = 1; S.midiNameLayers = 1; S.midiNamePatch = 1;
  S.midiMaxHeight = 20; S.midiTempo = 1; S.midiOctave = 0;
  S.midiVel = 1; S.midiPrecision = 1;
  setMsg('已恢复默认导入设置');
}

/* 音色下拉 */
function openMidiInsMenu(c) {
  let str = '无|';
  for (let a = 0; a < INSTRUMENTS.length; a++) {
    str += (c.ins === a ? iconPrefix(ICON.CHECK) : '') + INSTRUMENTS[a].name + '|';
  }
  S.midiMenuRow = c;
  /* MIDI 导入窗口走 dialogFrame()，内部一切坐标都是【设计坐标】，
     而 drawMenu 画在屏幕空间 —— 必须经 dlgToScreen() 换算。
     注意 G.mouse 在 dialogFrame() 里已经被反向映射成设计坐标了
     （见 dialogFrame 里 `G.mouse.x = (G.mouse.x - fit.tx) / fit.k`），
     所以这里读到的是设计坐标，直接传给 showMenu 会让菜单偏到窗口左上角附近。
     主题下拉框、schematic 导出窗口的两个下拉框之前都踩过同一个坑。 */
  const sp = dlgToScreen(G.mouse.x, G.mouse.y);
  showMenu('midiimport_ins', sp.x, sp.y, str);
}
/* 八度下拉（-3..+3） */
function openMidiOctMenu(c) {
  let str = '';
  for (let v = -3; v <= 3; v++) {
    str += ((c.oct === v) ? iconPrefix(ICON.CHECK) : '') + (v > 0 ? '+' : '') + v + '|';
  }
  S.midiMenuRow = c;
  const sp = dlgToScreen(G.mouse.x, G.mouse.y);   // 设计坐标 → 屏幕坐标
  showMenu('midiimport_octave', sp.x, sp.y, str);
}
/* 打击乐音色/音高下拉 */
function openMidiPercInsMenu(p) {
  let str = '无|';
  for (let a = 0; a < INSTRUMENTS.length; a++) str += (p.ins === a ? iconPrefix(ICON.CHECK) : '') + INSTRUMENTS[a].name + '|';
  S.midiPercRow = p;
  const sp = dlgToScreen(G.mouse.x, G.mouse.y);
  showMenu('midiimport_percins', sp.x, sp.y, str);
}
function openMidiPercPitchMenu(p) {
  let str = '';
  for (let k = 0; k < 88; k++) str += (p.key === k ? iconPrefix(ICON.CHECK) : '') + getKeyname(k, 1) + '|';
  S.midiPercRow = p;
  const sp = dlgToScreen(G.mouse.x, G.mouse.y);
  showMenu('midiimport_percpitch', sp.x, sp.y, str);
}

/* ---------------------------------------------------------------- 宏窗口 */
function macroDialogBase(w, h, title) {
  const f = dialogFrame(w, h);
  drawWindow(f.x1, f.y1, f.x2, f.y2);
  drawWindowTitle(f.x1, f.y1, title);
  return f;
}
function drawTremoloDlg() {
  if (S.selected === 0) { closeWindow(); return; }
  const f = macroDialogBase(260, 170, 'Tremolo');
  setFont(FONT.small()); setColor(C.text);
  text(f.x1 + 16, f.y1 + 44, '列间距（tremolo 的重复间隔）');
  S.trem_spacing = clamp(Math.round(drawDragValue(41, f.x1 + 190, f.y1 + 38, S.trem_spacing, 0.2)), 1, 8);
  setFont(FONT.main());
  okCancel(f, () => { closeWindow(); macroTremolo(); });
}
function drawStereoDlg() {
  if (S.selected === 0) { closeWindow(); return; }
  const f = macroDialogBase(260, 170, 'Stereo');
  setFont(FONT.main());
  if (drawCheckbox(f.x1 + 16, f.y1 + 42, !!S.stereo_reverse, '反转')) S.stereo_reverse = S.stereo_reverse ? 0 : 1;
  setFont(FONT.small()); setColor(C.textDim);
  text(f.x1 + 16, f.y1 + 68, '立体程度');
  setFont(FONT.main());
  S.stereo_width = clamp(Math.round(drawDragValue(42, f.x1 + 150, f.y1 + 62, S.stereo_width, 0.5)), 0, 100);
  okCancel(f, () => { closeWindow(); macroStereo(S.stereo_reverse, S.stereo_width); });
}
function drawArpeggioDlg() {
  if (S.selected === 0) { closeWindow(); return; }
  const f = macroDialogBase(300, 180, 'Arpeggio');
  setFont(FONT.small()); setColor(C.text);
  text(f.x1 + 16, f.y1 + 44, '音程模式（用 | 分隔）');
  setFont(FONT.main());
  S.arp_pattern = inputBox(51, S.arp_pattern, f.x1 + 16, f.y1 + 60, 260, 24);
  setFont(FONT.small()); setColor(C.textDim);
  text(f.x1 + 16, f.y1 + 92, '例如 0|4|7 表示大三元和弦');
  setFont(FONT.main());
  okCancel(f, () => { closeWindow(); macroArpeggio(S.arp_pattern); });
}
function drawPortamentoDlg() {
  if (S.selected === 0) { closeWindow(); return; }
  const f = macroDialogBase(280, 180, 'Portamento');
  setFont(FONT.main());
  if (drawCheckbox(f.x1 + 16, f.y1 + 42, !!S.porta_reverse, '反向', false, true)) S.porta_reverse = S.porta_reverse ? 0 : 1;
  setFont(FONT.small()); setColor(C.textDim);
  text(f.x1 + 16, f.y1 + 68, '滑音范围（微分）');
  setFont(FONT.main());
  S.port_cent = Math.round(drawDragValue(43, f.x1 + 170, f.y1 + 62, S.port_cent, 1));
  okCancel(f, () => { closeWindow(); macroPortamento(S.port_cent, S.porta_reverse); });
}
function drawStaggerDlg() {
  if (S.selected === 0) { closeWindow(); return; }
  const f = macroDialogBase(300, 180, 'Stagger');
  setFont(FONT.small()); setColor(C.text);
  text(f.x1 + 16, f.y1 + 44, '延迟模式（用 | 分隔，不能有负号）');
  setFont(FONT.main());
  S.stag_pattern = inputBox(52, S.stag_pattern, f.x1 + 16, f.y1 + 60, 260, 24);
  setFont(FONT.small()); setColor(C.textDim);
  text(f.x1 + 16, f.y1 + 92, '例如 0|1|2 表示逐层下移');
  setFont(FONT.main());
  okCancel(f, () => { closeWindow(); macroStagger(S.stag_pattern); });
}
function drawSetVelDlg() {
  if (S.selected === 0) { closeWindow(); return; }
  const f = macroDialogBase(280, 180, '设定音量');
  setFont(FONT.main());
  if (drawCheckbox(f.x1 + 16, f.y1 + 42, !!S.percentvel, '按百分比修改', false, true)) S.percentvel = S.percentvel ? 0 : 1;
  setFont(FONT.small()); setColor(C.textDim);
  text(f.x1 + 16, f.y1 + 68, S.percentvel ? '百分比' : '音量（0-100）');
  setFont(FONT.main());
  S.setvel = clamp(Math.round(drawDragValue(44, f.x1 + 170, f.y1 + 62, S.setvel, 0.5)), 0, 100);
  okCancel(f, () => { closeWindow(); macroSetVelocity(S.setvel, S.percentvel); });
}
function drawSetPanDlg() {
  if (S.selected === 0) { closeWindow(); return; }
  const f = macroDialogBase(280, 160, '设定声道');
  setFont(FONT.small()); setColor(C.textDim);
  text(f.x1 + 16, f.y1 + 44, '声道（0 = 最左，200 = 最右）');
  setFont(FONT.main());
  S.setpan = clamp(Math.round(drawDragValue(45, f.x1 + 170, f.y1 + 62, S.setpan, 1)), 0, 200);
  okCancel(f, () => { closeWindow(); macroSetPanning(S.setpan); });
}
function drawSetPitchDlg() {
  if (S.selected === 0) { closeWindow(); return; }
  const f = macroDialogBase(280, 160, '设定音高');
  setFont(FONT.small()); setColor(C.textDim);
  text(f.x1 + 16, f.y1 + 44, '音高（微分，-1200 ~ 1200）');
  setFont(FONT.main());
  S.setpit = clamp(Math.round(drawDragValue(46, f.x1 + 170, f.y1 + 62, S.setpit, 1)), -1200, 1200);
  okCancel(f, () => { closeWindow(); macroSetPitch(S.setpit); });
}
function drawTempoTapper() {
  const f = macroDialogBase(320, 220, '速度测量器');
  setFont(FONT.small()); setColor(C.textDim);
  text(f.x1 + 16, f.y1 + 44, '跟着节拍点击按钮，程序会估算速度。');
  setFont(FONT.main());
  S.tapTimes = S.tapTimes || [];
  if (button2(f.x1 + 16, f.y1 + 70, 140, '点击 / 空格')) {
    const now = performance.now();
    S.tapTimes.push(now);
    if (S.tapTimes.length > 9) S.tapTimes.shift();
    if (S.tapTimes.length > 1) {
      let sum = 0;
      for (let i = 1; i < S.tapTimes.length; i++) sum += S.tapTimes[i] - S.tapTimes[i - 1];
      const avg = sum / (S.tapTimes.length - 1);
      const bpm = 60000 / avg;
      S.tempo = Math.round((bpm / 15) * 100) / 100;
      S.use_bpm = 1;
      setMsg('测得 BPM ≈ ' + bpm.toFixed(1));
    }
  }
  setFont(FONT.info_med_bold());
  setColor(C.accent);
  text(f.x1 + 180, f.y1 + 76, (S.tempo * 15).toFixed(1) + ' BPM');
  setFont(FONT.main());
  okCancel(f, () => closeWindow(), '确定');
}
/* MIDI 设备管理器。实现在 js/mididevice.js（Web MIDI API）。
   打开时尝试获取权限；不支持或拒绝授权时显示具体原因，
   而不是笼统地说「暂不支持」。 */
function openMidiDevice() {
  S.playing = 0;
  S.window = W_MIDIDEVICES;
  // 进入窗口就请求一次权限（用户手势内，Chrome 才允许弹权限框）。
  // 状态机由 mididevice.js 维护，带超时兜底，不会卡在「正在请求」。
  if (MIDI_DEV.state === 'idle') midiInit(onMidiNote);
}

/* 收到 MIDI 音符：
   始终试听（让玩家边弹边听），并可选写入当前光标所在的音符块。 */
function onMidiNote(note, velocity, isOn) {
  if (!isOn) return;
  const key = midiNoteToKey(note);
  const ins = INSTRUMENTS[S.instrument] || INSTRUMENTS[0];
  if (!ins) return;
  // 试听：直接用当前乐器发声（音高按 key 计算，与编辑器内一致）
  if (ins.loaded) playSound(ins, key, velocity || 100, 100, 0);
  // 录入：在光标格写入音符
  if (MIDI_DEV.record && S.selbx >= 0 && S.selby >= 0) {
    changeBlockManual(S.selbx, S.selby, insIndex(ins), key, velocity || 100, 100, 0);
    S.changed = 1;
    // 写完往后走一格，方便连续录入
    if (MIDI_DEV.recordAdvance) S.selbx++;
  }
}

function drawMidiDevices() {
  const f = macroDialogBase(460, 300, 'MIDI 设备管理器');
  setFont(FONT.main());
  setColor(C.text);

  let y = f.y1 + 48;
  const lh = 22;

  if (MIDI_DEV.state === 'requesting' || MIDI_DEV.state === 'idle') {
    setColor(C.textDim);
    text(f.x1 + 16, y, '正在请求 MIDI 权限...'); y += lh + 4;
    setFont(FONT.small());
    text(f.x1 + 16, y, '浏览器会弹出权限提示，请点「允许」。');
    text(f.x1 + 16, y + 18, '若没有看到提示，请检查地址栏左侧的权限图标。');
    setFont(FONT.main());
  } else if (!MIDI_DEV.enabled) {
    // 失败：把具体原因分行显示，并给一个「重试」按钮
    setColor(C.text);
    const lines = (MIDI_DEV.lastError || '无法启用 MIDI 输入。').split('\n');
    for (const ln of lines) { text(f.x1 + 16, y, ln); y += lh; }
    y += 6;
    setColor(C.textDim);
    text(f.x1 + 16, y, '你仍可以用「从 MIDI 文件导入」把 .mid 文件转换成音符。');
    setFont(FONT.main());
    if (button2(f.x2 - 160, f.y2 - 34, 76, '重试')) {
      midiRetry(onMidiNote);
    }
  } else {
    // 已启用：列出输入端口
    setColor(C.textDim);
    text(f.x1 + 16, y, '已连接的输入设备：'); y += lh;
    setColor(C.text);
    if (!MIDI_DEV.inputs.length) {
      text(f.x1 + 28, y, '（没有检测到设备，请先连接 MIDI 键盘）'); y += lh;
    } else {
      for (const p of MIDI_DEV.inputs) {
        const nm = (p.name || '未命名设备') + (p.manufacturer ? '（' + p.manufacturer + '）' : '');
        text(f.x1 + 28, y, '· ' + nm); y += lh;
      }
    }
    y += 8;
    setFont(FONT.small());
    setColor(C.textDim);
    text(f.x1 + 16, y, '用键盘弹奏会实时发声。勾选下面两项可在光标处写入音符块。'); y += lh;

    setFont(FONT.main());
    if (drawCheckbox(f.x1 + 16, y, !!S.midiRecord, '录入到光标格', false)) {
      S.midiRecord = S.midiRecord ? 0 : 1;
      saveSettings();
    }
    MIDI_DEV.record = !!S.midiRecord;
    y += lh;
    if (S.midiRecord) {
      if (drawCheckbox(f.x1 + 32, y, !!S.midiRecordAdvance, '每写一个音后光标右移一格（连续录入）', false)) {
        S.midiRecordAdvance = S.midiRecordAdvance ? 0 : 1;
        saveSettings();
      }
      MIDI_DEV.recordAdvance = !!S.midiRecordAdvance;
    }
  }

  setFont(FONT.main());
  if (button2(f.x2 - 76, f.y2 - 34, 64, '关闭') || G.keysPressed['Escape']) {
    if (MIDI_DEV.enabled) midiStop();
    closeWindow();
  }
}
function drawTempoInput() {
  const f = dialogFrame(240, 130);
  drawWindow(f.x1, f.y1, f.x2, f.y2);
  drawWindowTitle(f.x1, f.y1, '设定速度');
  setFont(FONT.small()); setColor(C.textDim);
  text(f.x1 + 16, f.y1 + 42, S.use_bpm ? 'BPM' : '红石刻/秒');
  setFont(FONT.main());
  inputBox(64, UI.textStr[64] || String(S.tempo), f.x1 + 16, f.y1 + 58, 200, 24);
  okCancel(f, () => commitTempo());
}
