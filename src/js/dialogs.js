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
    /* 五个导出项的顺序照 control_draw.gml:1662-1674：
       schematic → 直轨 schematic → 分支 schematic → 数据包 → 音频。
       【已知偏离】GML 给这五项都加了 inactive(totalblocks = 0) 前缀（空歌时置灰）。
       本文件里既有的三项（schematic / 数据包 / 音频）都没有实现这个置灰，
       为避免只有新加的两项会置灰、和邻居不一致，这里同样不加；
       空歌时由 openSchexportWindow() / 导出按钮弹出「没有方块可以导出！」兜底。 */
    '导出为 schematic......|导出为直轨 schematic......|导出为分支 schematic......|导出为数据包......|导出为音频（WAV）......|-|' +
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
  /* 乐器子菜单：每 25 个插一个「更多......」分页（对照 :618-621）
     【insmenu 必须从 1 起，不能从 0 起】
     这正是"扩展/压缩选区没做出来"的真正根因（不是禁用条件的问题）。
     GML:608 的初值是 `insmenu = 1`，然后每插一个「更多......」再 ++。
     它最终的用途是 :641 结尾的 `string_repeat("/|", insmenu)` ——
     用来把前面 `"更改音色......|\\|"` 打开的【乐器子菜单】关闭 insmenu 次
     （子菜单是可以嵌套多层的，每层「更多」多一层，所以要关 insmenu 次）。
     我们原来写成 `let insmenu = 0`，于是：
        · 内置音色较少、没有触发 a%25 时，insmenu 仍是 0；
        · string_repeat("/|", 0) 得到空串 → **子菜单一次都没关**；
        · 紧接着的「扩展选区 / 压缩选区 / 宏......」全部被塞进了
          "更改音色"那个子菜单的末尾，而不是主菜单。
     用户右键主菜单里当然找不到它们 —— 这就是"还是没有"的原因。
     实测：修复前 menus[0] 只有 20 项（到"更改音色......"为止），
     而 menus[1]（乐器子菜单）有 22 项，末尾正是这三个。
     注意 GML 的 `+/=` 是【逻辑或】不是 `+=`（见第 647 行附近），
     但这里 insmenu++ 是真正的自增，照抄即可。 */
  let builtinStr = '', customStr = '', insmenu = 1;
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
  /* 【扩展/压缩选区的禁用条件】
     原来是 dd(sel0 || !S.selection_l)，而 S.selection_l 这个字段
     【在整个仓库里只在这里被读过一次，从来没有被赋值】——
     它永远是 undefined，于是 noExpand 恒为 true，
     两个菜单项永久灰掉、形同不存在。用户看到的就是"扩展/压缩选区没做出来"，
     其实 selectionExpand() / selectionCompress() 两个函数早就写好了，
     只是永远点不到。

     真正的选区宽度存在选区缓冲区 SEL.l 里（selection.js 的 selectionExtendLength
     维护），所以这里应该读 SEL.l。
     sel0 那一半保留：没有选区时这两个操作本来就没意义。 */
  const noExpand = dd(sel0 || !(SEL && SEL.l > 1));
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
    else if (label === '导入片段......') pickFile('', (ab) => {
      /* 用 patternImportBytes() 而不是 actionPaste()：
         后者只把内容装进浮动选区，要玩家再点一次左键才落地（见 nbs.js 里的说明）。 */
      try {
        const r = patternImportBytes(ab);
        if (!r.ok) { messageDialog(r.msg, '提示'); return; }
        setMsg('片段已导入并放置在 ' + (r.x + 1) + ' 列 / ' + (r.y + 1) + ' 层');
      } catch (e) { messageDialog('导入片段失败：' + e.message, '错误'); }
    });
    else if (label === '导出片段......') { if (S.selected) downloadBytes(buildPattern(), (S.song_name || 'pattern') + '.nbp'); }
    else if (label === '从 MIDI 文件导入......') pickFile('', (ab, n) => { try { importMidi(ab, n); } catch (e) { messageDialog(e.message, '错误'); } });
    else if (label === 'MIDI 输入设备......') openMidiDevice();
    // cbnote 的两种格式：.cbnd 位流 与 指令 .txt。实现在 js/cbnd.js
    else if (label === '从 CBND 导入......') importCbndDialog();
    else if (label === '从指令文本导入......') importCommandTextDialog();
    /* 音频渲染导出：OfflineAudioContext 一次性算完再编码成 WAV。
       实现在 js/render.js。渲染期间要连点保护（重复点击会并发渲染）。 */
    else if (label === '导出为音频（WAV）......') {
      /* 打开音频导出选项窗口（对照 draw_window_audio_export.gml），
         由用户选好采样率/声道/是否包括静音层后再开始渲染。 */
      if (S.playing) S.playing = 0;
      S.window = W_AUDIOEXPORT;
    }
    else if (label === '导出为数据包......') {
      // 对照 menu_click.gml：window = w_datapack_export
      S.playing = 0; S.window = W_DATAPACK_EXPORT;
    }
    else if (label === '导出为 schematic......') {
      // 对照 menu_click.gml:55：if (calculate_size()) window = w_schematic_export
      // calculate_size() 在 GML 里兼做「一次性警告 + 三项兼容性确认 +
      // selection_place(0) + 空歌检查 + 速度提示」，这里逐项对应。
      /* 每次打开窗口都让 calculateSize() 重新按当前速度推算一次档位
         （对照 calculate_size.gml:128-132，原版是"打开时算一次"）。
         不重置的话，第二次打开会沿用上次窗口里手动选的档位。 */
      S.sch_exp_tempo_ready = 0;
      // ---- 一次性警告（calculate_size.gml:4-8）----
      if (!S.warning_schematic) {
        S.warning_schematic = 1;
        if (typeof saveSettings === 'function') saveSettings();
        messageDialog('导出的 schematic 只与 Minecraft: Java Edition 1.12 及以下兼容。\n如想在 1.13 和以上使用，请使用结构方块格式导出。\n\n此警告将不再提示。', '警告');
      }
      /* 【三项兼容性确认 —— 对照 calculate_size.gml:9-20 / :32-43】
         原版在打开导出窗口【之前】逐项询问，任一取消就 return 0（不打开窗口）。
         我们之前完全没有这三项：超范围音符被静默丢弃、自定义音色被静默换成
         harp、微分音被静默忽略，用户拿到的产物"听起来不对"却毫无告知。
         由于 messageDialog/确认框是异步的，这里用「先关掉菜单、把后续动作
         挂到确认回调里」的方式串行执行 —— 效果等价于原版的同步 question()。 */
      const doAfterChecks = () => {
        if (calculateSize()) {
          selectionPlace(false);
          if (S.totalblocks - S.block_outside <= 0) {
            messageDialog('没有方块可以导出！', '错误');
          } else {
            S.playing = 0; S.window = W_SCHEMATIC_EXPORT;
          }
        }
      };
      /* 把三项询问串成一个队列，全部同意才继续 */
      const asks = [];
      if (S.block_outside > 0) {
        asks.push(['一些方块在 Minecraft 的2八度范围外。你想无视这些方块导出 Schematic 吗？',
          'Minecraft 兼容性']);
      }
      if (S.block_custom > 0) {
        asks.push(['一些方块带有自定义音色。继续导出吗？', 'Minecraft 兼容性']);
      }
      if (S.block_pitched > 0) {
        asks.push(['一些方块带有音符盒不支持的微分音。继续导出吗？', 'Minecraft 兼容性']);
      }
      const runAsk = (i) => {
        if (i >= asks.length) {
          /* 速度不兼容提示 —— 对照 calculate_size.gml:18-20 / :41-43。
             这是 message（只提示不拦截），所以放在最后、不阻塞导出。 */
          if (S.tempo !== 10 && S.tempo !== 5 && S.tempo !== 2.5) {
            messageDialog('歌曲的速度与 Minecraft 不兼容。所以，在游戏内的播放会和软件内的有差别。', '速度');
          }
          doAfterChecks();
          return;
        }
        /* confirmDialogOn(cb, text, title)：cb 只在用户点「确定」时触发，
           点取消不会调用 —— 正好对应 GML `if (!question(...)) return 0`。 */
        confirmDialogOn(() => runAsk(i + 1), asks[i][0], asks[i][1]);
      };
      if (asks.length) {
        S.playing = 0;
        runAsk(0);
      } else {
        if (S.tempo !== 10 && S.tempo !== 5 && S.tempo !== 2.5) {
          messageDialog('歌曲的速度与 Minecraft 不兼容。所以，在游戏内的播放会和软件内的有差别。', '速度');
        }
        doAfterChecks();
      }
    }
    /* 直轨 / 分支导出 —— 对照 menu_click.gml:57-62：
         if (sel = b + 15) { if (calculate_size()) window = w_track_export }
         if (sel = b + 16) { if (calculate_size()) window = w_branch_export }
       两者与 schematic 导出共用同一个 calculate_size()，实现见 schexport.js
       的 openSchexportWindow()（警告 + 三项兼容性确认 + 空歌检查 + 速度提示）。 */
    else if (label === '导出为直轨 schematic......') {
      openSchexportWindow(W_TRACKEXPORT);
    }
    else if (label === '导出为分支 schematic......') {
      openSchexportWindow(W_BRANCHEXPORT);
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
    /* 【问候窗口必须显式注册】
       之前 W_GREETING (=1) 只在 editor.js 里声明了常量，这里没有 case，
       于是走了 default: `S.window = 0` —— 一旦把 window 设成 1 就被立刻清掉。
       "设了马上被吞掉"看起来就跟"从来没实现"一模一样。 */
    case W_GREETING: drawGreeting(); break;
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
    // 直轨 / 分支导出窗口（实现在 schexport.js）
    case W_TRACKEXPORT: drawTrackExport(); break;
    case W_BRANCHEXPORT: drawBranchExport(); break;
    case W_AUDIOEXPORT: drawAudioExport(); break;
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
/* 对照 draw_window_properties.gml：
     窗口 x1-? / y1，输入框都在 x1+158 起、宽 240，纵向按 23px 行距排：
       歌曲名   y1 + 64 + 23*0   （draw_inputbox id 1）
       作者     y1 + 64 + 23*1   （id 2）
       原作者   y1 + 64 + 23*2   （id 3）
       简介     y1 + 64 + 23*3   （draw_textarea id 4，240×100 —— 多行！）
     我们原来把四个字段都做成 310×24 的单行框，
     简介只能显示一行、长内容看不全，也不能换行。
     现在简介改成 240×100 的多行文本域，窗口高度也要相应加大。 */
function drawSongInfo() {
  const f = dialogFrame(420, 300);
  drawWindow(f.x1, f.y1, f.x2, f.y2);
  drawWindowTitle(f.x1, f.y1, '歌曲信息');
  setColor(C.textDim); setFont(FONT.small());
  text(f.x1 + 24, f.y1 + 68, '歌曲名');
  text(f.x1 + 24, f.y1 + 91, '作者');
  text(f.x1 + 24, f.y1 + 114, '原作者');
  text(f.x1 + 24, f.y1 + 137, '简介');
  setFont(FONT.main());
  const ix = f.x1 + 90, iw = 300;
  S.song_name = inputBox(1, S.song_name, ix, f.y1 + 64, iw, 24);
  S.song_author = inputBox(2, S.song_author, ix, f.y1 + 87, iw, 24);
  S.song_orauthor = inputBox(3, S.song_orauthor, ix, f.y1 + 110, iw, 24);
  /* 简介：多行文本域。宽度沿用上面三行的 300（原版是 240，
     但我们的窗口整体更宽，保持列对齐更整齐）。高度 100 与 GML 一致。 */
  S.song_desc = drawTextarea(4, ix, f.y1 + 133, iw, 100, S.song_desc, '为你的歌曲输入简介。');
  okCancel(f, () => { S.changed = 1; closeWindow(); });
}

/* ---------------------------------------------------------------- 音频导出 */
/* 对照 draw_window_audio_export/draw_window_audio_export.gml：
   窗口 250×430（不是我们之前的 420×226），标题「音频导出」，
   顶部是一条装饰性 header sprite（原版 spr_mp3_exp），
   然后从 y1+180 开始依次是：
     输出格式（下拉：MP3 / WAV / AIFF / FLAC）  —— :33-45
     采样率（下拉：8,000 ~ 384,000 Hz）          —— :50-69
     通道（两个单选：1 单声道 / 2 立体声）        —— :74-83
     包括已静音的层（复选框）                    —— :88
   底部 y2-32 处两个按钮：「导出」（右）「取消」（左）。
   注意原版是「点导出按钮才开始」，不是「点确定就导出」——
   而且点「取消」不导出。我们之前用 okCancel，语义不同。 */
function drawAudioExport() {
  const f = dialogFrame(250, 430);
  drawWindow(f.x1, f.y1, f.x2, f.y2);
  drawWindowTitle(f.x1, f.y1, '音频导出');

  /* 原版在 y1 处画 spr_mp3_exp 作为装饰头图（高约 150px）。
     我们把它画成一个占位色块 + 波形示意，保证布局高度与原版一致。 */
  setColor(C.dark ? '#2a2a2a' : '#f0f0f0');
  fillRect(f.x1 + 20, f.y1 + 28, f.x2 - f.x1 - 40, 140);
  setColor(C.accent);
  // 简单的波形装饰
  const wcx = f.x1 + 20, wcw = f.x2 - f.x1 - 40;
  for (let i = 0; i < 60; i++) {
    const hh = (Math.sin(i * 0.7) * 0.5 + 0.5) * 60 + 6;
    fillRect(wcx + 6 + i * ((wcw - 12) / 60), f.y1 + 28 + 70 - hh / 2, 2, hh);
  }

  const bx = f.x1 + 25;
  let by = f.y1 + 208;
  const fullW = 140;

  // ---- 输出格式 ----
  setFont(FONT.small()); setColor(C.textDim);
  text(bx, by, '输出格式');
  by += 17;
  /* 原版可选 MP3 / WAV / AIFF / FLAC。浏览器端【只能】编码 WAV：
     我们的 render.js 里只有 encodeWav()，没有 MP3/AIFF/FLAC 编码器。
     如实处理：下拉框里只列 WAV，并注明原因；不假装支持其它格式。 */
  setColor(S.theme === 3 ? C.controlBg : C.controlBg);
  roundRect(bx, by, bx + fullW, by + 20, 2, true);
  setColor(C.controlBorder);
  roundRect(bx + 0.5, by + 0.5, bx + fullW - 0.5, by + 19.5, 2, false);
  setColor(C.text);
  text(bx + 5, by + 4, 'WAV');
  setColor(C.textDim);
  text(bx + 5, by + 24, '（浏览器只能编码 WAV）');

  by += 40;
  // ---- 采样率 ----
  setFont(FONT.small()); setColor(C.textDim);
  text(bx, by, '采样率');
  by += 17;
  setColor(C.controlBg);
  roundRect(bx, by, bx + fullW, by + 20, 2, true);
  setColor(C.controlBorder);
  roundRect(bx + 0.5, by + 0.5, bx + fullW - 0.5, by + 19.5, 2, false);
  setColor(C.text);
  text(bx + 5, by + 4, srLabelText(S.audio_exp_sample_rate));
  const srList = [8000, 11025, 16000, 22050, 44100, 48000,
    88200, 96000, 176400, 192000, 352800, 384000];
  // 下拉箭头（对照 draw_abutton 的位置：框右侧 x1+140-18）
  if (drawArrowButton(bx + fullW - 18, by + 1, false) ||
    (mouseRectangle(bx, by, fullW, 20) && G.mbp[0])) {
    if (!UI.menu) {
      let s = '';
      for (const v of srList) s += (S.audio_exp_sample_rate === v ? '+ ' : '') + srLabelText(v) + '|';
      const sp = dlgToScreen(bx, by + 20);
      const mi = showMenu('audio_exp_sample_rate', sp.x, sp.y, s);
      if (mi) {
        const picked = srList[mi - 1];
        if (picked !== undefined) S.audio_exp_sample_rate = picked;
      }
      UI.swallowPress = true;
    }
  }

  by += 40;
  // ---- 通道 ----
  setFont(FONT.small()); setColor(C.textDim);
  text(bx, by, '通道');
  by += 17;
  setFont(FONT.main());
  if (drawRadiobox(bx, by, S.audio_exp_channels === 1, '1（单声道）', false)) {
    S.audio_exp_channels = 1;
  }
  by += 15;
  if (drawRadiobox(bx, by, S.audio_exp_channels === 2, '2（立体声）', false)) {
    S.audio_exp_channels = 2;
  }

  by += 30;
  // ---- 包括已静音的层 ----
  /* 默认 0，即默认【排除】已静音层，
     与原版 audio_export.gml:37 的 exclude_locked_layers = !include_locked 一致。 */
  if (drawCheckbox(bx, by, !!S.audio_exp_include_locked, '包括已静音的层', false, true)) {
    S.audio_exp_include_locked = S.audio_exp_include_locked ? 0 : 1;
  }

  // ---- 底部按钮：导出 / 取消 ----
  setFont(FONT.main());
  const by2 = f.y2 - 8 - 24;
  if (button2(f.x2 - 8 - 72, by2, 72, '导出')) {
    const name = S.song_name || S.filename || 'song';
    if (S.rendering) { setMsg('正在渲染，请稍候...'); return; }
    S.rendering = 1;
    closeWindow();
    exportSongAudio(name, {
      sampleRate: S.audio_exp_sample_rate,
      channels: S.audio_exp_channels,
      includeMuted: S.audio_exp_include_locked === 1,
    })
      .catch((e) => messageDialog('导出音频失败：\n' + e.message, '错误'))
      .then(() => { S.rendering = 0; });
  }
  if (button2(f.x2 - 8 - 72 - 77, by2, 72, '取消') || G.keysPressed['Escape']) {
    closeWindow();
  }
}

/* 对照 draw_window_audio_export.gml:105-109 的 format_sample_rate：
     str = string(value)
     str = string_insert(",", str, string_length(str) - 2)
     return str + " Hz"
   【GML 的字符串索引是 1 基】，string_insert 的 pos 表示"插到第 pos 个
   字符之前"。`string_length(str) - 2` 对 "44100"（长度 5）是 3，
   也就是插到第 3 个字符前 → "44,100"。换成 0 基就是 `len - 3`。
   （我第一版写成 `len - 2`，得到 "441,00"，差一位。）
   验证：44100 → 44,100 Hz；8000 → 8,000 Hz；384000 → 384,000 Hz。 */
function srLabelText(value) {
  let str = String(value);
  const pos = str.length - 3;
  if (pos > 0) str = str.slice(0, pos) + ',' + str.slice(pos);
  return str + ' Hz';
}

/* ---------------------------------------------------------------- 歌曲属性 */
function drawProperties() {
  /* 对照 draw_window_properties.gml:4-7：
       if (window != prevwindow) { loopend = enda + 1 }
     也就是刚打开这个窗口时，把「循环结束刻」初始化成当前歌曲结尾。
     prevwindow 在 drawEditor 末尾更新，语义与 GML 一致。 */
  if (S.window !== S.prevwindow) S.loopend = S.enda + 1;
  const f = dialogFrame(400, 330);
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

  /* 循环结束刻 —— 对照 draw_window_properties.gml:92-112：
       范围 median(enda + 1, draw_dragvalue(20, …, 0.5), enda + 16 + 1)
       也就是允许把结尾往后拖最多 16 格；不循环时只读显示。
       只要不等于 enda + 1，就提示「会自动补一个 0 音量音符延长歌曲」。
     之前这个字段、控件、提示、补音符逻辑全都没有，用户无法设置循环结束位置，
     .cbnd 导入的 loopend 也不生效（S.loopend 写了却从不被读取）。 */
  text(f.x1 + 16, f.y1 + 164, '循环结束刻');
  const le0 = S.loopend;
  if (S.loop_session) {
    const le = drawDragValue(20, f.x1 + 200, f.y1 + 160, S.loopend, 0.5);
    S.loopend = median(S.enda + 1, Math.round(le), S.enda + 16 + 1);
  } else {
    setColor(C.textDim);
    text(f.x1 + 200, f.y1 + 160, String(S.loopend));
    setColor(C.text);
  }
  if (S.loopend !== le0) S.changed = 1;

  text(f.x1 + 16, f.y1 + 192, '循环次数（0 = 无限）');
  const lm = drawDragValue(14, f.x1 + 200, f.y1 + 188, S.loopmax, 0.1);
  /* 对照 draw_window_properties.gml:118：上限是 10，不是 99。
     .nbs 里 loopmax 是 byte，99 虽然存得下，但原版打开时会被 clamp 回去。 */
  S.loopmax = clamp(Math.round(lm), 0, 10);
  if (S.loopmax === 0) {
    setColor(C.textDim);
    text(f.x1 + 268, f.y1 + 188, '（无限）');
    setColor(C.text);
  }
  /* 对照 draw_window_properties.gml:125：每帧把 timestoloop 同步成 loopmax，
     这样播放中改循环次数会立刻按新次数重新计。之前只在起播/停止时赋值，
     多播一轮才生效。 */
  S.timestoloop = S.loopmax;

  if (S.loopend !== S.enda + 1) {
    setColor(C.warn || C.accent);
    setFont(FONT.small());
    text(f.x1 + 16, f.y1 + 232, '[!] 歌曲结尾将会自动添加一个 0 音量音符用于延长歌曲结尾。');
  }
  setFont(FONT.main());
  okCancel(f, () => {
    /* 对照 draw_window_properties.gml:129-134：
         确定时若 loopend != enda + 1，就在 loopend-1 处补一个静音音符，
         把这个位置"占"出来，歌曲长度才会真的延长到那里。 */
    if (S.loopend !== S.enda + 1) {
      addBlock(S.loopend - 1, 0, 0, 45, 0, 100, 0);
    }
    S.changed = 1;
    closeWindow();
  });
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
    pickFile('', async (ab) => {
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
  /* 【列表滚动位置必须和滚动条共用同一个状态 —— SB.val[3]】
     对照 draw_window_instruments.gml：
       :153  b = floor(sb_val[3]) + a          ← 行循环读 sb_val[3]
       :243  draw_scrollbar(insscrollbar=3, …)  ← 滚动条也用 id 3
     也就是说原版的行偏移【就是】滚动条的数值，两者天然联动。
     我们原来另建了一个 S.insScroll，滚动条改 SB.val[3]、列表读 S.insScroll，
     两条数据互不相干 —— 于是滚动条拖了列表不动、滚轮滚了滚动条不动。
     这里统一到 SB.val[3]：滚轮和拖动都会改它，行循环直接读它。
     右边界是 len-2（原版 maxslots = ds_list_size - 2）。 */
  const insMax = Math.max(0, INSTRUMENTS.length - visible);
  if (G.wheel && mouseRectangle(f.x1 + 14, f.y1 + 88, 460, visible * rowH)) {
    // 对照 draw_scrollbar.gml:21 `sb_val[i] += (mouse_wheel_down() - mouse_wheel_up()) * ...`：
    // 向下滚 → sb_val 增大 → 显示列表里更靠后的行。G.wheel 已按此约定归一化（down=+1）。
    SB.val[3] = median(0, SB.val[3] + G.wheel, insMax);
  }
  // 滚动条本身也会改 SB.val[3]（拖动/翻页），这里夹一次防止越界
  SB.val[3] = median(0, SB.val[3], insMax);
  const scrollTop = floor(SB.val[3]);
  for (let i = 0; i < visible; i++) {
    const idx = i + scrollTop;
    if (idx >= INSTRUMENTS.length) break;
    const ins = INSTRUMENTS[idx];
    const y = rowY0 + i * rowH;
    // 选中行高亮
    if (S.instrument === idx) {
      setColor(C.accent); setAlpha(0.15);
      fillRect(f.x1 + 13, y, 521, rowH);
      setAlpha(1);
    }
    /* 列表行点击 —— 对照 draw_window_instruments.gml:232 `&& wmenu = 0`。
       少了这个门控，菜单打开时点菜单项会同时命中背后的列表行
       （选"基准音"时顺手把音色也换了）。 */
    if (mouseRectangle(f.x1 + 14, y, 460, rowH) && G.mbp[0] && !UI.menu) {
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
      /* 自定义音色的名字【可就地改名】—— 对照 draw_window_instruments.gml:167
             ins.name = draw_text_edit(70 + b, ins.name, x1+18, y1+90+20*a, 178, 20, 1, b < first_custom_index)
         最后一个参数是 readonly：内置音色（b < first_custom_index）只读，
         自定义音色可编辑。我们之前只是 text() 画死，改不了名字。
         编辑区从 colX[0]+24 起、宽 178（GML 的宽度），高 20。 */
      const nameW = 178;
      const newName = textEdit(70 + idx, ins.name, colX[0] + 24, y + 2, nameW, rowH - 2);
      if (newName !== ins.name) { ins.name = newName; S.changed = 1; }
    }
    // 声音列
    setFont(FONT.main(10));
    setColor(ins.filename ? (ins.loaded ? C.text : '#c00000') : C.textDim);
    text(colX[1] + 5, y + 5, ins.filename ? ins.filename : '无');
    /* 点击声音列换文件 —— 对照 draw_window_instruments.gml:183-193：
           if (mouse_rectangle(x1+14+194, y1+88+20*a, 160, 20) && insselect = b && wmenu = 0) {
               if (pressed mb_left) {
                   if (ins.user) instrument_change(ins)
                   else message("无法更改该音色的声音文件。", "错误")
               }
               if (ins.user) curs = cr_handpoint
           }
       注意 GML 的要求是【这一行已被选中】才响应（insselect = b），
       所以先点一次选中、再点声音列才能换文件。
       instrument_change 在 :14-17 还有一条：若名字仍是默认的
       "Custom instrument #"，换文件后自动改用文件名作名字。 */
    if (mouseRectangle(colX[1] + 4, y, 160, rowH) && S.instrument === idx && !UI.menu) {
      if (ins.user) G.cursor = 'pointer';
      if (G.mbp[0]) {
        if (ins.user) {
          pickFile('audio/*', async (ab, name) => {
            try {
              const buf = await AU.ctx.decodeAudioData(ab.slice(0));
              ins.buffer = buf;
              ins.loaded = true;
              ins.filename = name;
              // 对照 instrument_change.gml:14-17
              if (String(ins.name).slice(0, 19) === 'Custom instrument #') {
                ins.name = name.replace(/\.[^.]+$/, '');
              }
              S.changed = 1;
              setMsg('已更换声音文件：' + name);
            } catch (e) { messageDialog('无法解码该音频：' + e.message, '错误'); }
          });
        } else {
          messageDialog('无法更改该音色的声音文件。', '错误');
        }
      }
    }
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
      if (mouseRectangle(ax, y, 16, rowH) && G.mbr[0] && !UI.menu) openInsPitchMenu(idx, i);
    }
    // 显示列（对照 :222-231，同样是 ins.user 才给 draw_abutton）
    setColor(C.text);
    text(colX[3] + 5, y + 4, ins.press ? '是' : '否');
    if (ins.user) {
      // 对照源码 `draw_abutton(x1 + 18 + 194 + 175 + 112, ...)`，
      // 以 colX[3] = x1+13+194+160+80 为基准，相对偏移 52。
      const px2 = colX[3] + 52;
      drawArrowButton(px2, y, false);
      if (mouseRectangle(px2, y, 16, rowH) && G.mbr[0] && !UI.menu) openInsPressMenu(idx, i);
    }
  }
  // 列分隔线（对照源码 239-242 的三条 draw_line）
  setColor(make_color_rgb(192, 192, 192));
  const sepY = f.y1 + 87, sepH = Math.min(visible, INSTRUMENTS.length - scrollTop) * rowH;
  fillRect(colX[1], sepY, 1, sepH);
  fillRect(colX[2], sepY, 1, sepH);
  fillRect(colX[3], sepY, 1, sepH);

  /* 滚动条 —— 对照 draw_window_instruments.gml:243：
       draw_scrollbar(insscrollbar, x1+518, y1+88, 21, 9, len-2, 0, 1)
     【必须用 drawScrollbarGML，不能用 drawScrollbar】
     这两个函数的参数表不同：
       drawScrollbarGML(id, x, y, slotwh, slots, maxslots, cantscroll, win)  ← 照 GML 的 8 参
       drawScrollbar(x, y, len, vertical, pos, maxPos, pageSize)            ← 只有 7 参，语义也不同
     早先这里对着 8 参的 GML 写调用，却落在了 7 参的 drawScrollbar 上，
     参数整体错位：x←0、y←x1+518、len←y1+88、vertical←21、pos←9 …
     于是画出一根 fillRect(0, x1+518, 16, y1+88) 的错位长条，
     盖在对话框左侧内容上，而且拖不动、点不动（返回值又没人用）。
     改用 drawScrollbarGML 后滚动条位置、拖动、翻页都与原版一致。 */
  drawScrollbarGML(3, f.x1 + 518, f.y1 + 88, 21, 9,
    Math.max(1, INSTRUMENTS.length - 2), 0, 1);

  setFont(FONT.main());
  /* ---------------------------------------------------------------
     底部按钮区 —— 对照 draw_window_instruments.gml:68-110
     原版是 6 个按钮：导出音色 / 添加 / 移除 / 上移 / 下移 / 确定，
     x 依次是 12、110、194、278、362、456（宽 86/80/80/80/80/80）。
     我们之前只有「导出音色 / 添加 / 移除 / 关闭」四个，
     缺「上移」「下移」（无法调整自定义音色顺序）和「确定」。
     按钮可用性判据也照抄 GML：
       · 移除：userselect < 0 时禁用（即必须选中一个自定义音色）
       · 上移：(userselect < 0) || (user_instruments <= 1) || (insselect == first_custom_index)
       · 下移：(userselect < 0) || (user_instruments <= 1) || (insselect == len-1)
     --------------------------------------------------------------- */
  if (button2(f.x1 + 12, f.y1 + 318, 86, '导出音色')) {
    setMsg('浏览器版暂不支持导出音色包。');
  }

  const customCount = INSTRUMENTS.length - S.first_custom_index;
  // 添加 —— 对照 GML:71 `user_instruments >= 240` 时禁用（240 上限）
  const canAdd = customCount < 240;
  setAlpha(canAdd ? 1 : 0.45);
  if (button2(f.x1 + 110, f.y1 + 318, 80, '添加') && canAdd && !UI.menu) {
    /* 不设 accept：音色文件可能是 .ogg/.wav/.mp3/.flac，甚至改了后缀，
       直接全部显示，能不能解码交给 decodeAudioData 判断（失败会提示）。 */
    pickFile('', async (ab, name) => {
      try {
        const buf = await AU.ctx.decodeAudioData(ab.slice(0));
        const ni = newInstrument('Custom instrument #' + (customCount + 1),
          name, true, false, 45);
        ni.buffer = buf; ni.loaded = true;
        S.instrument = INSTRUMENTS.length - 1;
        S.changed = 1;
        setMsg('已添加音色：' + ni.name);
      } catch (e) { messageDialog('无法解码该音频：' + e.message, '错误'); }
    });
  }
  setAlpha(1);

  const cur = INSTRUMENTS[S.instrument];
  const userselect = (S.instrument >= S.first_custom_index && cur && cur.user) ? cur : -1;
  // 对照 GML:93 `(userselect < 0) || (user_instruments <= 1) || (insselect == first_custom_index)`
  const canShiftUp = userselect !== -1 && customCount > 1 &&
    S.instrument !== S.first_custom_index;
  // 对照 GML:98 `... || (insselect == ds_list_size(instrument_list) - 1)`
  const canShiftDown = userselect !== -1 && customCount > 1 &&
    S.instrument !== INSTRUMENTS.length - 1;

  // 移除 —— 对照 GML:81/112，必须先选中一个自定义音色
  const canRemove = userselect !== -1;
  setAlpha(canRemove ? 1 : 0.45);
  if (button2(f.x1 + 194, f.y1 + 318, 80, '移除') && canRemove && !UI.menu) {
    /* 【必须连带删掉使用这个音色的所有音符 —— 对照 instrument_remove.gml:2-10】
       原版会遍历整首歌，把所有 song_ins == 该音色的方块 remove_block 掉。
       我们之前只从 INSTRUMENTS 里 splice，音符还留着指向旧下标，
       于是那些音符全部变成"指向一个不存在/错位的音色"——
       删完音色后整首歌的音色大面积错乱，而且无法撤销。
       这里按 GML 补上：有音符时先二次确认（:82/:113 的 message_yesnocancel）。 */
    const doRemove = () => {
      const i = S.instrument;
      const target = INSTRUMENTS[i];
      // 先删音符（倒序扫描，避免边界问题）
      for (let x = S.enda; x >= 0; x--) {
        if (colamount[x] > 0) {
          for (let y = S.endb2 - 1; y >= 0; y--) {
            if (gExists(x, y) && gIns(x, y) === i) removeBlock(x, y);
          }
        }
      }
      INSTRUMENTS.splice(i, 1);
      // 删掉之后，所有 >= i 的引用都要前移一位，否则指向错位
      for (let x = 0; x <= S.enda; x++) {
        if (colamount[x] > 0) {
          for (let y = 0; y < S.endb2; y++) {
            if (gExists(x, y) && gIns(x, y) > i) S.grid.ins[gidx(x, y)] -= 1;
          }
        }
      }
      S.instrument = Math.min(INSTRUMENTS.length - 1, Math.max(0, i - 1));
      if (S.instrument < S.first_custom_index) S.instrument = 0;
      S.selected_vel = 100; S.selected_pan = 100; S.selected_pit = 0;
      recalcSong(); S.changed = 1;
    };
    /* 统计有多少方块在用这个音色（用于确认文案，对照 GML 的 num_blocks） */
    let affected = 0;
    for (let x = 0; x <= S.enda; x++) {
      if (colamount[x] > 0) {
        for (let y = 0; y < S.endb2; y++) if (gExists(x, y) && gIns(x, y) === S.instrument) affected++;
      }
    }
    if (affected === 0) doRemove();
    else confirmDialogOn(doRemove,
      '这将移除使用该音色的 ' + affected + ' 个方块并且不能撤销。确定吗？', '警告');
  }
  setAlpha(1);

  // 上移 —— 对照 GML:93
  setAlpha(canShiftUp ? 1 : 0.45);
  if (button2(f.x1 + 278, f.y1 + 318, 80, '上移') && canShiftUp && !UI.menu) {
    swapInstruments(S.instrument, S.instrument - 1);
    S.instrument -= 1;
    recalcSong(); S.changed = 1;
  }
  setAlpha(1);

  // 下移 —— 对照 GML:98
  setAlpha(canShiftDown ? 1 : 0.45);
  if (button2(f.x1 + 362, f.y1 + 318, 80, '下移') && canShiftDown && !UI.menu) {
    swapInstruments(S.instrument, S.instrument + 1);
    S.instrument += 1;
    recalcSong(); S.changed = 1;
  }
  setAlpha(1);

  /* 确定 —— 对照 GML:103-110。
     GML 在这里做两件事：save_version < 5 且自定义音色 > 18 时提示并提升版本，
     以及 save_settings()。前者对应"旧存档格式放不下这么多音色"。 */
  if (button2(f.x1 + 456, f.y1 + 318, 80, '确定') && !UI.menu) {
    const userInstruments = INSTRUMENTS.length - S.first_custom_index;
    if (S.save_version < 5 && userInstruments > 18) {
      messageDialog('这首歌包含超过 18 个音色，无法以版本 ' + S.save_version +
        ' 保存。保存版本将被改为 ' + S.nbs_version + '。', '提示');
      S.save_version = S.nbs_version;
    }
    if (typeof saveSettings === 'function') saveSettings();
    closeWindow();
  }
  if (G.keysPressed['Escape']) closeWindow();
}

/* 交换两个音色的位置 —— 对照 instrument_swap.gml。
   除了交换列表里的对象，还要把 song_ins 里指向它们的索引对调，
   否则音符会从"钢琴"变成"贝斯"（对象换了位置，音符还指着旧下标）。
   这里我们用【下标】而不是对象引用，所以做法是：
   先把所有音符的索引按 i1<->i2 映射，再交换数组元素。 */
function swapInstruments(i1, i2) {
  if (i1 === i2 || i1 < 0 || i2 < 0) return;
  if (i1 >= INSTRUMENTS.length || i2 >= INSTRUMENTS.length) return;
  for (let x = 0; x <= S.enda; x++) {
    if (colamount[x] > 0) {
      for (let y = 0; y < S.endb2; y++) {
        if (!gExists(x, y)) continue;
        const cur = gIns(x, y);
        if (cur === i1) S.grid.ins[gidx(x, y)] = i2;
        else if (cur === i2) S.grid.ins[gidx(x, y)] = i1;
      }
    }
  }
  const t = INSTRUMENTS[i1];
  INSTRUMENTS[i1] = INSTRUMENTS[i2];
  INSTRUMENTS[i2] = t;
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

  /* 分页栏 —— 坐标严格对照 draw_window_preferences.gml:65-77：
         b 初值 = 8 + (theme = 3) * 32        （见 :25）
         命中框  y1 + 28，高 18，宽 tw + 12
         文字    x1 + b + 6, y1 + 30
         步进    b += tw + 12
     之前写成 ty = y1+52（低 24px）、高 26、间距 tw+4、文字 y1+48：
     分页整体偏低，且与内容区（y1+74）只隔 22px，Fluent 下几乎贴在一起。 */
  let b = x1 + 8 + (S.theme === 3 ? 32 : 0);
  const ty = y1 + 28;
  setFont(FONT.main());
  PREF_TABS.forEach((label, i) => {
    const tw = textWidth(label);
    const hover = mouseRectangle(b, ty, tw + 12, 18);
    const sel = S.prefTab === i;
    if (sel) {
      // 对照 :68-70 / :87-96：选中页用高亮块，底边与内容框相连
      setColor(C.dark ? '#3a3a3a' : '#e6e6e6');
      roundRect(b - 2, ty - 2, b - 2 + tw + 15, ty + 20, 4, true);
      setColor(C.accent);
      roundRect(b + 4, ty + 16, b + tw + 2, ty + 19, 2, true);
    } else if (hover) {
      setColor(C.dark ? '#333333' : '#ededed');
      roundRect(b, ty, b + tw + 12, ty + 18, 4, true);
    }
    setColor(sel ? C.text : C.textDim);
    text(b + 6, ty + 2, label);
    if (hover && G.mbr[0]) { S.prefTab = i; if (S.windowsound) playUISound('invoke'); }
    b += tw + 12;
  });

  const tab = S.prefTab || 0;
  // 内容基准。对照 draw_window_preferences.gml：源码里每个坐标都写成
  //     y1 + 74 + (theme = 3) * 22
  // 也就是说这 22px 的额外下移【只有 Fluent(theme 3) 才有】，
  // 因为 Fluent 的 draw_areaheader 不画框，需要给框上方的标题文字腾出位置；
  // 其它主题有框、标题压在框线上，不需要这个偏移。
  // 之前无条件 +22，导致 Fluent 下内容整体偏高、标题文字被挤出可视区看不见，
  // 非 Fluent 下内容又整体偏低 22px。
  /* 【内容区纵向原点 —— 必须与 GML 的 y1+74 严格对齐】
     对照 draw_window_preferences.gml：所有内容坐标统一写成
         y1 + 74 + (theme = 3) * 22
     也就是非 Fluent 用 y1+74、Fluent 用 y1+96。下面所有内容都写成 `oy + 74`，
     所以 oy 必须恰好等于 y1 + (theme===3)*22。
     之前写成 `y1 + 22 + (theme===3 ? 22 : 0)`，多了一个常数 22，
     导致【两种主题的内容都整体下移 22px】：非 Fluent 变成 y1+96（应 74），
     Fluent 变成 y1+118（应 96），最底部的项被压到内容框和确定按钮附近。
     注释里写的公式本身是对的，只是代码没照着写。 */
  const ox = x1, oy = y1 + (S.theme === 3 ? 22 : 0);

  if (tab === 0) {
    /* 启动 —— 对照 draw_window_preferences.gml:158-193。
       原版这个区域有 3 个复选框：
         x1+40, y1+90  "显示欢迎界面"          (show_welcome)
         x1+40, y1+110 "检查更新"              (check_update)
         x1+60, y1+130 "检查开发版本"          (check_prerelease，!check_update 时禁用)
       我们之前把 show_welcome 放到了别处、还漏了后两个，这里补齐。 */
    drawAreaHeader(ox + 22, oy + 74, 243, 85, '启动');
    if (drawCheckbox(ox + 40, oy + 90, !!S.show_welcome, '显示欢迎界面', false, true))
      S.show_welcome = S.show_welcome ? 0 : 1;
    /* 浏览器版无法自检更新（没有可写的安装目录，也没有版本分发渠道），
       但选项本身要保留：loadSettings/saveSettings 会持久化它，
       而且用户从桌面版的 ini/settings 迁移过来时不该丢失这两个值。
       点击时给一句说明，而不是让它假装能生效。 */
    if (drawCheckbox(ox + 40, oy + 110, !!S.check_update, '检查更新', false, true)) {
      S.check_update = S.check_update ? 0 : 1;
      setMsg('浏览器版不会自动检查更新，请直接刷新页面获取最新版本。');
    }
    setAlpha(S.check_update ? 1 : 0.45);
    if (drawCheckbox(ox + 60, oy + 130, !!S.check_prerelease, '检查开发版本',
      !S.check_update) && S.check_update) {
      S.check_prerelease = S.check_prerelease ? 0 : 1;
      setMsg('浏览器版不区分稳定版与开发版。');
    }
    setAlpha(1);
    /* 原版还有「界面音效」「播放时自动滚动」两项，但它们不在 GML 的
       Startup 区域里（分别属于 Interface / Playback 分页）。
       为了不把两个分页的东西混在一起，这两项移到对应分页去。 */

    // 自动保存 —— 对照 :199-223
    drawAreaHeader(ox + 278, oy + 74, 200, 85, '自动保存');
    const asBefore = S.autosave;
    if (drawCheckbox(ox + 296, oy + 90, !!S.autosave, '启用自动保存', false, true))
      S.autosave = S.autosave ? 0 : 1;
    /* 对照 :205-208：开关一变就把倒计时重置，
       关掉时 tonextsave = 0，打开时 tonextsave = autosavemins。
       少了这句，从关到开会沿用旧的倒计时（可能立刻触发一次保存）。 */
    if (asBefore !== S.autosave) {
      S.tonextsave = S.autosave ? (S.autosavemins || 10) : 0;
    }
    setFont(FONT.small()); setColor(C.textDim);
    text(ox + 326, oy + 110, '间隔（分钟）');
    setFont(FONT.main());
    /* 对照 :219：autosavemins = median(1, draw_dragvalue(2, ...), 60)，
       步进是 1（不是 0.5）。自动保存关闭时该项禁用。 */
    setAlpha(S.autosave ? 1 : 0.45);
    if (S.autosave) {
      S.autosavemins = clamp(Math.round(drawDragValue(2, ox + 380, oy + 106, S.autosavemins || 10, 1)), 1, 60);
    } else {
      text(ox + 380, oy + 106, String(S.autosavemins || 10));
    }
    setAlpha(1);

    // 歌曲 —— 对照 :229-266
    drawAreaHeader(ox + 22, oy + 184, 456, 145, '歌曲');
    if (drawCheckbox(ox + 40, oy + 200, !!S.show_oldwarning, '打开旧版格式时提示', false, true))
      S.show_oldwarning = S.show_oldwarning ? 0 : 1;

    /* 歌曲 / 片段文件夹 —— 对照 :234-264。
       浏览器版拿不到真实文件系统路径，但原版的语义是
       「保存/打开对话框从这个目录开始」。这里如实降级为：
       显示固定文案 + 按钮提示浏览器不给路径权限。
       （不撒谎说能改，也不删掉这两行 —— 删了布局就和原版不一致。） */
    setFont(FONT.small()); setColor(C.textDim);
    text(ox + 40, oy + 230, '歌曲路径: 浏览器下载目录');
    text(ox + 40, oy + 280, '片段路径: 浏览器下载目录');
    setFont(FONT.main());
    const folderBtn = (x, y, w2, label, tip) => {
      if (button2(x, y, w2, label)) setMsg(tip);
    };
    folderBtn(ox + 40, oy + 246, 76, '打开', '浏览器不允许网页打开本地文件夹。');
    folderBtn(ox + 124, oy + 246, 76, '更改', '浏览器不允许网页指定保存路径，文件会存到默认下载目录。');
    folderBtn(ox + 208, oy + 246, 96, '使用默认', '已经是默认（下载目录）。');
    folderBtn(ox + 40, oy + 296, 76, '打开', '浏览器不允许网页打开本地文件夹。');
    folderBtn(ox + 124, oy + 296, 76, '更改', '浏览器不允许网页指定保存路径，文件会存到默认下载目录。');
    folderBtn(ox + 208, oy + 296, 96, '使用默认', '已经是默认（下载目录）。');

    setFont(FONT.small()); setColor(C.textDim);
    text(ox + 40, oy + 326, '低于 v4 的版本无法保存音量 / 声道 / 音高，' + (S.save_version < 4 ? '当前会丢失这些属性。' : '当前设置可完整保存。'));
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
    /* 【「启动时显示问候窗口」不在这里】
       它属于「通用」页的「启动」区域 —— 对照 draw_window_preferences.gml:156-193
       （selected_tab = 0 分支）唯一的 show_welcome 复选框。
       我们之前在这个「外观」页又放了一个（原本是把它当成"外观相关"），
       于是同一个开关在两个分页都能改，且 drawPreferences 的脏值检测
       会因为两处都写同一个字段而在同一帧内互相覆盖。
       已删除此处，show_welcome 只保留「通用」页那一份。 */

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

/* 缩放滑块：拖动量按「屏幕像素」记，缩放变化不会反过来影响手感。
 *
 * 【为什么参考点必须用屏幕坐标，不能用 G.mouse.y】
 * G.mouse.y 是【逻辑坐标】，它在 core.js 的 toLogical() 里已经被除以
 * touchEffScale()（也就是 window_scale）了：
 *     G.mouse.y = (clientY - rect.top) / window_scale
 * 而下面要算的是"手指在屏幕上移动了多少像素"。如果写
 *     UI.scaleDrag.screenY = G.mouse.y * S.window_scale
 * 那么拖动过程中一改 window_scale，G.mouse.y 的换算基准当场就变了：
 * 同一个手指位置算出的 screenY 与按下时记录的值不相等，
 * 于是 dy 出现虚假偏移 → 再改一次缩放 → 基准又变 ……
 * 这就是"拖动时画面在正常和黑之间闪、参考点一直在变、根本没法调"的原因：
 * 它是个正反馈，缩放在两个相邻档位之间来回跳，每跳一次就整屏重排（layoutResize），
 * 视觉上就是狂闪。
 *
 * 修法：把参考点钉在【真实的屏幕坐标】上。
 * 按下时记下 e.clientY 等价的量 —— 这里用 G.mouse.sy，它就是未经缩放的
 * 原始 client 坐标（core.js 在 toLogical 里同时维护 sx/sy）。
 * 之后每帧都用同一个基准算位移，缩放怎么变都不影响手感。
 * 另外给位移加一个死区，避免手指微小抖动就触发重排。 */
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
  /* 基准用 G.mouse.sy（屏幕像素）。core.js 里 sx/sy 保存的是换算前的 client 坐标；
     若某个环境下它不可用（NaN），退回 rect 相对坐标的近似值。 */
  const screenY = (typeof G.mouse.sy === 'number' && isFinite(G.mouse.sy))
    ? G.mouse.sy
    : G.mouse.y * S.window_scale;

  if (hover && G.mbp[0] && !UI.scaleDrag) {
    UI.scaleDrag = { screenY, start: S.window_scale, last: S.window_scale };
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
      const dy = UI.scaleDrag.screenY - screenY;   // 向上为正，单位是屏幕像素
      /* 死区：小于 3 屏幕像素的抖动不参与计算，
         否则手指按住不动也会因为 1px 抖动反复跨档、每跨一次就 layoutResize 一次。
         （用屏幕像素而不是逻辑像素，这样高 DPI 下也不会太敏感。） */
      if (Math.abs(dy) < 3) return;
      const ns = clamp(UI.scaleDrag.start * Math.pow(1.6, dy / 240), 0.5, 4);
      const q = Math.round(ns * 20) / 20;
      /* 只有真的跨过一个 5% 档位才重排。
         原来每帧只要 abs(q - window_scale) > 0.001 就 layoutResize()，
         而 q 是四舍五入到 0.05 的，在档位边界附近会来回跳，
         layoutResize 又很重（重算布局、重建 canvas 尺寸）——
         这就是"在正常和黑之间闪"的直接原因。 */
      if (Math.abs(q - (UI.scaleDrag.last || S.window_scale)) >= 0.049) {
        UI.scaleDrag.last = q;
        if (Math.abs(q - S.window_scale) > 0.001) { S.window_scale = q; layoutResize(); }
      }
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

/* ---------------------------------------------------------------- 问候窗口 */
/* 对照 draw_window_greeting.gml 移植。
   原版 700x430，左栏放 logo + 版本信息 + 社交链接，右栏放操作按钮。
   这里必须实现 —— 之前 W_GREETING 只在 editor.js 里声明了常量，
   没有任何绘制函数，而 drawWindows() 的 default 分支是
   `S.window = 0`（未知窗口立即关闭），所以只要有人把 window 设成 1，
   就会被静默吞掉：不是"没显示"，而是"设了马上被清成 0"。
   这就是用户说的"问候窗口从来没显示过"的根因。 */
function drawGreeting() {
  const f = dialogFrame(700, 430);
  const x1 = f.x1, y1 = f.y1, x2 = f.x2, y2 = f.y2;
  drawWindow(x1, y1, x2, y2);

  /* 左栏：logo + 文字（对照 gml:47-49
     draw_sprite_ext(spr_logo, window_icon, x1 + 64, y1 + 50, 1, 1, 0, c_white, ...)）
     spr_logo 原点是 (14,16)，drawSprite 内部自动扣掉，所以可以照抄 GML 坐标。
     布局核对：左上角 = (x1+64-14, y1+50-16) = (x1+50, y1+34)，
     占 165x165 → 到 y1+199；标题在 y1+213，正文 233/262/282/306 —— 不冲突。 */
  drawSprite('spr_logo', 0, x1 + 64, y1 + 50);

  // 标题（gml:50-51：font_info_med_bold + draw_text_center(x1+132, y1+213)）
  // text() 第 4 参数是对齐方式，'center' 等价于 GML 的 draw_text_center
  setFont(FONT.info_med_bold(20));
  setColor(C.accent);
  text(x1 + 132, y1 + 213, 'Note Block Studio', 'center');

  // 版本行（gml:75-79）—— 网页版没有"发布日期"，改为版本号
  setFont(FONT.mainbold(13));
  setColor(C.text);
  text(x1 + 132, y1 + 233, '网页重制版  Version 1.0', 'center');

  // 简介（gml:87-88）
  setFont(FONT.main());
  setColor(C.textDim);
  text(x1 + 132, y1 + 262, '一个开源的 Minecraft 音乐制作软件', 'center');

  // 站点链接（gml:89-91：蓝色可点）
  const siteY = y1 + 282;
  setColor('#3e90ff');
  const ghUrl = 'https://github.com/Zero-Raltal/NBS-On-Web';
  const siteTxt = 'noteblock.studio';
  const siteW = textWidth(siteTxt);
  const siteX = x1 + 132 - siteW / 2;
  text(siteX, siteY, siteTxt);
  if (mouseRectangle(siteX, siteY, siteW, 14) && G.mbp[0]) {
    G.clickConsumed = true;
    window.open(ghUrl, '_blank');
  }
  setColor(C.text);

  // 社交链接（gml:96-108）—— 网页版只保留仓库链接
  setFont(FONT.small());
  setColor('#3e90ff');
  const ghY = y1 + 306;
  const ghTxt = 'GitHub 仓库';
  const ghW = textWidth(ghTxt);
  text(x1 + 132 - ghW / 2, ghY, ghTxt);
  if (mouseRectangle(x1 + 132 - ghW / 2, ghY, ghW, 14) && G.mbp[0]) {
    G.clickConsumed = true;
    window.open(ghUrl, '_blank');
  }
  setColor(C.text);

  /* 竖分隔线（gml:110-116）：先亮线，再半透明主题色。
     这条线把左栏（信息）和右栏（操作）分开。
     窗口高 430，线从 y1+24 画到 y1+396 —— 上下各留一点边距。 */
  setColor(S.fdark && S.theme === 3 ? '#000000' : '#FFFFFF');
  line(x1 + 270, y1 + 24, x1 + 270, y1 + 396);
  setAlpha(0.25);
  setColor(C.accent);
  line(x1 + 269, y1 + 24, x1 + 269, y1 + 396);
  setAlpha(1);
  setColor(C.text);

  // 右栏标题（gml:117-118）
  setColor(C.text);
  text(x1 + 290, y1 + 20, '要做什么？');

  /* 操作按钮（gml:120-...）。
     原版有「新建歌曲 / 打开歌曲 / 最近歌曲 / Note Block World / 从 MIDI 生成」，
     外加右下角的「播放器模式」。网页版没有 .nbs 文件系统与 Note Block World，
     所以只保留三个真实可用的：新建、打开本地文件、从 MIDI 生成。
     这是与 GML 的有意偏差，原因见上。 */
  const bw = 224, bh = 32;
  let by = y1 + 48;

  const drawEntry = (label, iconFrame) => {
    const over = mouseRectangle(x1 + 300, by, bw, bh);
    const hov = over && (G.mb[0] || G.mbr[0]);
    if (S.theme === 3) {
      setColor(hov ? C.accentLight : C.controlBg);
      roundRect(x1 + 300, by, x1 + 300 + bw, by + bh, 6, true);
    } else {
      drawSprite('spr_frame2', hov ? 2 : 0, x1 + 300, by);
    }
    if (iconFrame >= 0) drawSprite('spr_bigicons_f', iconFrame, x1 + 300 + (hov ? 1 : 0), by + (hov ? 1 : 0));
    setColor(C.text);
    setFont(FONT.main());
    text(x1 + 300 + 48, by + 9 + (hov ? 1 : 0), label);
    const clicked = over && G.mbr[0];
    by += 44;
    return clicked;
  };

  if (drawEntry('新建歌曲', 0)) {
    G.clickConsumed = true;
    dismissGreeting();
    newSong();
    return;
  }
  if (drawEntry('打开本地文件……', 1)) {
    G.clickConsumed = true;
    dismissGreeting();
    /* 不设 accept，全部文件都显示；类型由 dispatchFile 按后缀判断。
       这样 .nbs / .cbnd 这类自定义后缀在任何浏览器上都能选中。 */
    pickFile('', (ab, name) => {
      dispatchFile(ab, name).then(ok => {
        if (!ok) {
          messageDialog('不支持的文件类型：' + (fileExt(name) || '（无扩展名）')
            + '\n\n支持：.nbs .nbp .mid .midi .cbnd .txt .mcfunction', '错误');
        }
      }).catch(e => messageDialog('打开失败：' + e.message, '错误'));
    });
    return;
  }
  if (drawEntry('从 MIDI 文件生成', 2)) {
    G.clickConsumed = true;
    dismissGreeting();
    pickFile('', (ab, name) => { importMidi(ab, name); });
    return;
  }

  // 底部提示 + 关闭按钮
  setFont(FONT.small());
  setColor(C.textDim);
  text(x1 + 300, y2 - 42, '关闭后不再自动显示，可在「首选项 → 外观」里重新开启。');
  /* 关闭即"别再弹我"。这里是唯一的收尾点 ——
     注意三个操作按钮（新建/打开/从MIDI）在各自分支里 return 前也走了这个函数，
     见各自的 dismissGreeting() 调用，保证从哪个入口离开都会记下选择。 */
  if (button2(x2 - 84, y2 - 34, 72, '关闭') || G.keysPressed['Escape']) dismissGreeting();
}

/* 关闭问候窗口，并记住"以后别再自动弹"。
   单独抽成函数是因为有 4 个出口：关闭按钮、Esc、三个操作按钮。 */
function dismissGreeting() {
  S.show_welcome = 0;
  if (typeof saveSettings === 'function') saveSettings();
  closeWindow();
}

/* ---------------------------------------------------------------- 关于 */
function drawAbout() {
  const f = dialogFrame(400, 360);
  drawWindow(f.x1, f.y1, f.x2, f.y2);
  drawWindowTitle(f.x1, f.y1, '关于');
  /* logo（对照 draw_window_about.gml:12 的 draw_sprite_ext(spr_logo, 0, x1+80, y1+50, …)）
     【但是不能照抄坐标】：原版 About 窗口是 580x410，logo 画在左上、
     标题放在 y1+200（logo 正下方）；我们这个窗口是 400x360，文字从 y1+44 就开始，
     直接照抄会让 165x165 的 logo 压住标题和正文。
     所以这里把它缩小到 56x56 放在标题右边当装饰 —— 位置变了，用途一致。 */
  drawSprite('spr_logo', 0, f.x1 + 360, f.y1 + 58, 0.34, 0.34);
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
  /* 【「导入速度」和「速度变化」是两个独立选项】
     用户报："导入了带变速的 MIDI，结果放得飞快，并且没有变速"。
     原版 draw_window_midi_import.gml:52-53 是两个分开的复选框：
         x1+300  w_midi_tempo          「导入速度」
         x1+410  w_midi_tempo_changer  「速度变化」
     我们之前只有前者，后者压根没有 —— 所以哪怕 MIDI 里明明有变速事件，
     也没有任何入口能把它导进来。
     这里把两个都摆出来，间距按原版（+300 / +410 相差 110）。
     注意「速度变化」的提示语是原版原文：Tempo Changer 在游戏里不被支持。 */
  if (drawCheckbox(x1 + 230, y1 + 32, !!S.midiTempo, '导入速度')) S.midiTempo = S.midiTempo ? 0 : 1;
  if (drawCheckbox(x1 + 340, y1 + 32, !!S.midiTempoChanger, '速度变化')) S.midiTempoChanger = S.midiTempoChanger ? 0 : 1;
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

  const rowY = (a) => y1 + 174 + 20 * a;   // 对照 GML：y1 + 174 + 20*a
  const colX = (n) => x1 + 12 + n;

  /* 【表头：完全照搬 GML draw_window_midi_import.gml:415-421】
     GML 的做法和我们原来写的那套差别很大，这正是"文字和线没对齐"的根因：

     GML 是【从右往左】排的，而且每个表头都是一个 draw_window 小窗口：
         xx = x1 + 588
         for (a = tabs-1; a >= 0; a -= 1) {
             draw_window(xx - tabw[a], y1 + 151, xx, y1 + 171, 1)
             draw_text_dynamic(xx - tabw[a] + 4, y1 + 154, tabstr[a])
             xx -= tabw[a] - 1        // 注意是 -1，不是 -tabw[a]
         }
     数据行则是从左往右、以 x1+12+4 为第一列起点：
         draw_text_dynamic(x1 + 12 + 4 + tabw[0], …)

     两套基准只有在「总宽恰好等于 588-12-4」时才会重合，而 tabw 之和
     (50+41+260+130+100=581) 并满足不了这一点 —— 所以任何"自己按列宽
     累加"的做法都必然错开几个像素。原来我用一个 x1+12 起、每列 +widths[i]
     的循环去画表头【和竖线】，就整体偏左 4px，竖线还压在文字左边 4px 上，
     看起来就是"字和线差了一点"。

     现在按 GML 的原始算法逐字移植：表头从右往左、每格一个 draw_window，
     文字偏移 +4/+154，步进 tabw[a]-1。竖线也回到 GML 的位置
     （:409-412 那四条 draw_line，起点 x1+12 / x1+10+tabw[0] …）。 */
  const drawHeader = (labels, widths, tabSec) => {
    // ---- 表头格子（从右往左，对照 :415-421）----
    let xx = x1 + 588;
    setFont(FONT.small());
    for (let a = labels.length - 1; a >= 0; a--) {
      const wx = xx - widths[a];
      drawWindow(wx, y1 + 151, xx, y1 + 151 + 20, 1);
      setColor(C.text);
      text(wx + 4, y1 + 154, labels[a]);
      xx -= widths[a] - 1;
    }
    setFont(FONT.main());
    /* ---- 分隔竖线（对照 :409-412）----
       注意 GML 每列的偏移并不统一：第一条用 +12，之后接连用 +10、+9、+9，
       这是原版自己写在源码里的数值，不是笔误 —— 为了让线落在 draw_window
       边框的内侧。照抄，不要"顺手修正"成统一值。 */
    setColor(C.separator);
    const ly0 = y1 + 170, ly1 = y1 + 170 + 20 * 9;
    line(x1 + 12, ly0, x1 + 12, ly1);
    if (widths.length > 1) line(x1 + 10 + widths[0], ly0, x1 + 10 + widths[0], ly1);
    if (widths.length > 2) line(x1 + 9 + widths[0] + widths[1], ly0, x1 + 9 + widths[0] + widths[1], ly1);
    if (widths.length > 3) line(x1 + 9 + widths[0] + widths[1] + widths[2], ly0,
      x1 + 9 + widths[0] + widths[1] + widths[2], ly1);
  };

  if (S.midiTab === 0) {
    // 通道 / 乐器 / 乐器名 / 音色 / 八度调整
    // 列宽对照 draw_window_midi_import.gml:179-208：tabw = 50 / 41 / 260 / 130 / 100
    const W = [50, 41, 260, 130, 100];
    drawHeader(['通道', '乐器', '乐器名', '音色', '八度调整'], W, 0);
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
    drawHeader(['音调', '声音名', '音色', '音高'], W, 1);
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
    drawHeader(['轨道序号', '轨道名', '事件数'], W, 2);
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
  /* 完整移植 draw_window_macro_tremolo.gml（原版窗口 150x240）。
     中文文案比英文长，宽度放大到 280，纵向按原版的相对间距排布。 */
  const f = macroDialogBase(280, 280, 'Tremolo');

  /* ---- tremolotype 三档（gml:35-37） ---- */
  if (drawRadiobox(f.x1 + 16, f.y1 + 42, (S.tremolotype | 0) === 0, '无音量变化')) S.tremolotype = 0;
  if (drawRadiobox(f.x1 + 16, f.y1 + 58, (S.tremolotype | 0) === 1, '淡入')) S.tremolotype = 1;
  if (drawRadiobox(f.x1 + 16, f.y1 + 74, (S.tremolotype | 0) === 2, '淡出')) S.tremolotype = 2;

  /* ---- fade_auto 两种（gml:39-40）
     gml:38 `if tremolotype = 0 draw_set_color(c_gray)` ——
     选了「无音量变化」时这两项无意义，用灰色表示不可用。 ---- */
  const fadeGray = (S.tremolotype | 0) === 0;
  if (fadeGray) setColor(C.textDim);
  /* 注意第 5 个参数是 locked（是否禁止交互），这里【不能】传 fadeGray：
     原版只是把颜色调灰，单选框仍然可点。 */
  if (drawRadiobox(f.x1 + 16, f.y1 + 96, (S.fade_auto | 0) === 1, '自动音量')) S.fade_auto = 1;
  if (drawRadiobox(f.x1 + 16, f.y1 + 112, (S.fade_auto | 0) === 0, '手动音量')) S.fade_auto = 0;
  if (fadeGray) setColor(C.text);

  /* ---- 触发/延长（leg_dec）—— gml:45-48，范围 median(1, …, 100) ---- */
  const manGray = (S.fade_auto | 0) === 1;   /* gml:43 `if fade_auto = 1 c_gray` */
  setFont(FONT.small());
  if (manGray) setColor(C.textDim); else setColor(C.text);
  text(f.x1 + 16, f.y1 + 134, '触发/延长');
  setFont(FONT.main());
  if (manGray) setColor(C.textDim);
  S.leg_dec = median(1, drawDragValue(8, f.x1 + 130, f.y1 + 130, S.leg_dec, 0.5), 100);
  if (manGray) setColor(C.text);

  /* ---- 延长时间（leg_sus）—— gml:52-55 ---- */
  setFont(FONT.small());
  if (manGray) setColor(C.textDim); else setColor(C.text);
  text(f.x1 + 16, f.y1 + 166, '延长时间');
  setFont(FONT.main());
  if (manGray) setColor(C.textDim);
  S.leg_sus = median(1, drawDragValue(9, f.x1 + 130, f.y1 + 162, S.leg_sus, 0.5), 100);
  if (manGray) setColor(C.text);

  /* ---- 音符间隔（trem_spacing）—— gml:57-61
     范围是 median(1, draw_dragvalue(3, …, 1), 2)，也就是【只能是 1 或 2】，
     步长 1（原版可出小数但夹在 1..2）。
     之前写成 clamp(round(...), 1, 8)：上限被放大到 8，
     而 trem_spacing 直接决定 macros.js 里 replength = arr[val]/spacing，
     间隔取 3..8 时生成的列数与音量包络和原版完全不同。 ---- */
  setFont(FONT.small()); setColor(C.text);
  text(f.x1 + 16, f.y1 + 198, '音符间隔');
  setFont(FONT.main());
  S.trem_spacing = median(1, drawDragValue(3, f.x1 + 130, f.y1 + 194, S.trem_spacing, 1), 2);
  setFont(FONT.small()); setColor(C.textDim);
  text(f.x1 + 16, f.y1 + 216, '重复音符中间的间隔（1 或 2）');
  setFont(FONT.main());

  /* ---- 确定：按 tremolotype 分派（gml:70-72） ---- */
  okCancel(f, () => {
    /* gml:65-69 的参数校验 */
    if (S.leg_dec > 100 || S.leg_dec < 0 || S.leg_sus > 100 || S.leg_sus < 0) {
      messageDialog('所有值必须在 1 到 100 之间。', '错误');
      return;
    }
    closeWindow();
    const tp = S.tremolotype | 0;
    if (tp === 0) macroTremolo();
    else if (tp === 1) macroTremoloFadein();
    else if (tp === 2) macroTremoloFadeout();
  });
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
  /* 对照 draw_window_macro_setvelocity.gml:27：
       setvel = median(0, draw_dragvalue(10, x1+55, y1+65, setvel, 0.1), 100 + (percentvel * 900))
     【上限取决于模式】：非百分比时 0..100（绝对设定），
     百分比时 0..1000（可放大到 10 倍）。步长 0.1（原版可出小数）。
     之前写死 clamp(..., 0, 100) 且步长 0.5，于是"按百分比放大音量"这个
     最常用操作根本做不到，只能衰减。 */
  const velMax = 100 + (S.percentvel ? 900 : 0);
  text(f.x1 + 16, f.y1 + 68, S.percentvel ? '百分比（0-1000）' : '音量（0-100）');
  setFont(FONT.main());
  S.setvel = median(0, drawDragValue(44, f.x1 + 170, f.y1 + 62, S.setvel, 0.1), velMax);
  okCancel(f, () => { closeWindow(); macroSetVelocity(S.setvel, S.percentvel); });
}
function drawSetPanDlg() {
  if (S.selected === 0) { closeWindow(); return; }
  const f = macroDialogBase(280, 160, '设定声道');
  setFont(FONT.small()); setColor(C.textDim);
  /* 对照 draw_window_macro_setpanning.gml:28 / :36：
       setpan = median(-100, draw_dragvalue(12, x1+55, y1+65, setpan, 0.1), 100)
       ... selection_change(m_pan, setpan + 100, false)
     界面上滑块是【相对偏移 -100..100】，写入选区时要 +100 变成绝对 0..200。
     默认 setpan = 0 → 实际写入 100，即正中央。
     之前滑块直接就是绝对 0..200 且步长 1，默认落点变成 0（最左）——
     打开窗口直接确定会把整片音符全推到最左声道。 */
  text(f.x1 + 16, f.y1 + 44, '声道偏移（-100 = 最左，0 = 居中，100 = 最右）');
  setFont(FONT.main());
  S.setpan = median(-100, drawDragValue(45, f.x1 + 170, f.y1 + 62, S.setpan, 0.1), 100);
  okCancel(f, () => { closeWindow(); macroSetPanning(S.setpan + 100); });
}
function drawSetPitchDlg() {
  if (S.selected === 0) { closeWindow(); return; }
  const f = macroDialogBase(280, 180, '设定音高');
  setFont(FONT.small()); setColor(C.textDim);
  /* 对照 draw_window_macro_setpitch.gml:27/30-31/37：
       setpit = median(-1200, draw_dragvalue(18, ..., setpit, 0.1), 1200)
       勾选 addpitch 后 selection_change(m_pit, setpit, addpitch)
     「加法模式」会把数值叠加到每个音符现有的微分音上，
     否则直接设定。之前没有这个复选框，只能直接设定，
     "整体升/降 N 微分"这一常用操作做不了。 */
  text(f.x1 + 16, f.y1 + 44, '音高（微分，-1200 ~ 1200）');
  setFont(FONT.main());
  S.setpit = median(-1200, drawDragValue(46, f.x1 + 170, f.y1 + 62, S.setpit, 0.1), 1200);
  setFont(FONT.small()); setColor(C.textDim);
  if (drawCheckbox(f.x1 + 16, f.y1 + 68, !!S.addpitch, '加法模式（叠加而非直接设置）', false, true)) {
    S.addpitch = S.addpitch ? 0 : 1;
  }
  setFont(FONT.main());
  okCancel(f, () => { closeWindow(); macroSetPitch(S.setpit, S.addpitch === 1); });
}
/* 速度测量器 —— 完整移植 draw_window_tempo_tapper.gml。
 *
 * 【和之前那版完全是两套东西】
 *   旧实现是我自己想的：点一下按钮把时间戳塞进 S.tapTimes 数组，
 *   算相邻间隔的平均值，然后【直接改 S.tempo】并立刻生效。
 *   原版不是这样，它有六个状态量参与（control_create.gml:400-404）：
 *       taptempo  正在测量的速度
 *       tapping   是否正在打点
 *       taps      已打点次数
 *       tapdouble 应用时是否把速度翻倍 ← 用户要求补的那个选项
 *       ltime     上一次打点的时间
 *   而且原版【不立刻应用】，只在按「确认」时才算：
 *       tempo = (ctempo * (1 + tapdouble)) / 15
 *   也就是 t/s 与双倍在确认那一刻才合并，中途改选项不会污染已有测量。
 *
 * 【打点公式为什么长那样】
 *   gml:33   taptempo = ((60 / dt) + ltempo * taps) / ((taps + 1) * (ltempo != 0) + (!ltempo))
 *   这是【增量平均】：把新的一次间隔换算成 BPM，和"前 taps 次的累计值"求平均。
 *   分母那个 ((taps+1)*(ltempo!=0) + (!ltempo)) 看着怪，其实是在处理第一次打点：
 *   ltempo == 0 时它等于 1，避免除以 0 并把首拍直接作为结果。
 *
 * 【重置条件】
 *   gml:34   如果这次间隔换算出来的 BPM <= ltempo/2（打得慢了一倍以上），
 *   认为用户是"重新开始打"，把 taptempo 和 taps 清零。
 *   没有这个，中途停下再打会把两种节奏混在一起平均。
 *
 * 【键位】原版是 T 键（gml:32 keyboard_check_pressed(ord("T"))），
 *   窗口标题里也写着「(按 T 打速度)」。不是空格。
 *   打点时如果装了节拍器音色会响一声（gml:41）。
 */
function drawTempoTapper() {
  /* 原版窗口只有 140x130（gml:8-10 的 x1 = rw/2-80, y1 = rh/2-80+offset，
     draw_window(x1, y1, x1+140, y1+130)）。比我们之前的 320x220 紧凑得多。
     这里保留 dialogFrame 的自适应缩放，只把设计尺寸改成原版的 150x140
     （+10 是给标题栏留的高度，原版 draw_window 的标题画在框内）。
     —— 太小的窗口在竖屏上会被放大镜式地拉得很大，所以给一个下限 190x170。 */
  const f = dialogFrame(190, 170);
  drawWindow(f.x1, f.y1, f.x2, f.y2);
  drawWindowTitle(f.x1, f.y1, '速度测量器');

  // 状态量（对照 control_create.gml:400-404）
  if (S.taptempo === undefined) S.taptempo = 0;
  if (S.tapping === undefined) S.tapping = 0;
  if (S.taps === undefined) S.taps = 0;
  if (S.tapdouble === undefined) S.tapdouble = 0;
  if (S.tap_ltime === undefined) S.tap_ltime = 0;

  // 原版 gml:17-22：经典主题给测量区铺一块白底 + 灰框
  if (S.theme === 0) {
    setColor('#ffffff');
    fillRect(f.x1 + 6, f.y1 + 26, 134 - 6, 92 - 26);
    setColor(make_color_rgb(137, 140, 149));
    roundRect(f.x1 + 6, f.y1 + 26, f.x1 + 134, f.y1 + 92, 0, false);
  }
  // gml:24-29 区域标题，单位跟着 use_bpm 变
  drawAreaHeader(f.x1 + 10, f.y1 + 43, 120, 35,
    (S.use_bpm ? 'BPM' : 't/s') + ' (按 T 打速度)');

  /* 打点（gml:32-42）。current_time 在 GML 里是毫秒，这里用 performance.now()。 */
  if (G.keysPressed['t'] || G.keysPressed['T']) {
    const now = performance.now();
    const ltempo = S.taptempo;
    if (S.tapping) {
      const dtSec = (now - S.tap_ltime) / 1000;
      if (dtSec > 0) {
        const inst = 60 / dtSec;
        // gml:33 的增量平均。分母那个三元式照抄：ltempo==0 时取 1。
        const denom = (S.taps + 1) * (ltempo !== 0 ? 1 : 0) + (ltempo === 0 ? 1 : 0);
        S.taptempo = (inst + ltempo * S.taps) / denom;
      }
      // gml:34-37：慢了一倍以上 → 认为重新开始
      if (Math.floor(60 / Math.max(dtSec, 0.001) + 0.5) <= ltempo / 2 && ltempo !== 0) {
        S.taptempo = 0;
        S.taps = 0;
      }
    }
    S.tapping = 1;
    S.tap_ltime = now;
    S.taps += 1;
    if (S.windowsound) playUISound('invoke');
  }

  // gml:43-47 显示当前测得的速度
  const ctempo = Math.floor(S.taptempo + 0.5);
  if (S.tapping && S.taptempo !== 0) {
    setFont(FONT.info_med_bold());
    setColor(C.accent);
    const shown = S.use_bpm ? String(ctempo) : (ctempo / 15).toFixed(2);
    text(f.x1 + 60, f.y1 + 55, shown, 'center');
    setFont(FONT.main());
  }

  /* 双倍速度（gml:48-49）—— 用户要求补的就是这一条。
     第 6 个参数传 1（is_switch），所以 Fluent 主题下它是开关，
     其它主题仍是复选框，和原版一致。 */
  if (drawCheckbox(f.x1 + 15, f.y1 + 80, !!S.tapdouble, '双倍速度', false, true)) {
    S.tapdouble = S.tapdouble ? 0 : 1;
  }

  // gml:52-65 确认：这时才把测量值（含双倍）写进 tempo
  const ok = button2(f.x1 + 10, f.y1 + 132, 60, '确认');
  const no = button2(f.x1 + 70, f.y1 + 132, 60, '取消');
  if (ok) {
    /* gml:54   tempo = (ctempo * (1 + tapdouble)) / 15
       注意 tapdouble 是 0/1，所以 (1 + tapdouble) 就是 ×1 或 ×2。
       直接赋给 S.tempo，与其它地方一致（NBS 内部 tempo 单位是 t/s，
       BPM = tempo * 15）。 */
    S.tempo = (ctempo * (1 + S.tapdouble)) / 15;
    S.changed = 1;
    S.taptempo = 0; S.tapping = 0; S.tap_ltime = 0; S.taps = 0;
    setMsg('速度已设为 ' + (S.tempo * 15).toFixed(2) + ' BPM');
    closeWindow();
  }
  if (no || G.keysPressed['Escape']) {
    // gml:67-69 取消也要把这些清掉
    S.taptempo = 0; S.tapping = 0; S.tap_ltime = 0; S.taps = 0;
    closeWindow();
  }
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
