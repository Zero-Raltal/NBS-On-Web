/* =========================================================================
   editor.js — 主编辑器：绘制与交互
   严格对照 GML 的 control_draw()：
     图层面板 264px / 顶栏 52px / 网格 32px 单元 / 底部钢琴
   ========================================================================= */
'use strict';

/* 窗口 ID（对应 macros.gml 的 w_*） */
const W_MENU = 100, W_RELEASE = 29, W_INSBOX = 42, W_DRAGVOL = 27, W_DRAGSTEREO = 41,
  W_DRAGSECTION_END = 26, W_DRAGSECTION_START = 25, W_DRAGSELECTION = 24, W_DRAGMARKER = 23,
  W_DRAGTEMPO = 22, W_SONGINFOEDIT = 11, W_SONGINFO = 10, W_PROPERTIES = 7, W_STATS = 6,
  W_INSTRUMENTS = 3, W_PREFERENCES = 2, W_SAVEOPTIONS = 36, W_MIDI = 5, W_SCHEMATIC = 4,
  W_ABOUT = 12, W_GREETING = 1, W_STEREO = 20, W_ARPEGGIO = 32, W_TREMOLO = 33,
  W_STAGGER = 34, W_PORTAMENTO = 35, W_SETVELOCITY = 37, W_SETPANNING = 38,
  W_SETPITCH = 39, W_SETTEMPO = 43, W_TEMPOTAPPER = 44, W_COMPATIBILITY = 31,
  W_TRACKEXPORT = 46, W_BRANCHEXPORT = 40, W_MIDIDEVICES = 28, W_CLIPEDITOR = 19,
  W_DRAG = 21,   // 滚动条拖拽中（window = w_drag）
  // 对照 macros.gml：w_schematic_export = 14、w_datapack_export = 30。
  // 30 在旧代码里被「兼容性」窗口占了，这次把兼容性挪到 31，
  // 两个导出窗口用回原版 ID（这样和 GML 的窗口编号保持一致）。
  W_SCHEMATIC_EXPORT = 14, W_DATAPACK_EXPORT = 30;

/* 这些 window 值只是内部拖拽/瞬时状态，不是真正的对话框：
   不能画灰色遮罩，也不能屏蔽下层交互（对照 GML：draw_windows 只画已知窗口） */
const TRANSIENT_WINDOWS = [W_RELEASE, W_DRAG, W_DRAGMARKER, W_DRAGSELECTION, W_DRAGVOL,
  W_DRAGSTEREO, W_DRAGSECTION_START, W_DRAGSECTION_END, W_DRAGTEMPO, W_INSBOX];
function isDialogWindow(w) {
  return w !== 0 && TRANSIENT_WINDOWS.indexOf(w) < 0;
}

/* ---------------------------------------------------------------- 初始化 */
function editorInit() {
  S.piano_key = new Array(88).fill(0);
  let k = 33;
  const seq = '1Q2W3ER5T6YU8I9O0PZSXDCVG';
  for (const ch of seq) S.piano_key[k++] = ch.charCodeAt(0);
  S.key_press = new Array(88).fill(0);
  S.key_click = new Array(88).fill(0);
  S.key_played = new Float64Array(88);
  S.key_midipress = new Array(88).fill(0);
  S.startkey = 0; S.sharpkeys = 0; S.keysshow = 0;
  S.instrument = 0;
  S.trem_spacing = 1; S.stereo_width = 50; S.stereo_reverse = 0;
  S.port_cent = 0; S.porta_reverse = 0;
  S.setvel = 100; S.setpan = 0; S.setpit = 0; S.percentvel = 0;
  S.arp_pattern = '0|4|7'; S.stag_pattern = '0|1';
  S.fade_auto = 1;
  S.selected_layers = [];
  S.window_scale = 1;
  S.save_version = 5;
  S.user_instruments = 0;
  S.hires = false;
  reset();
}

/* ---------------------------------------------------------------- 布局 */
function computeLayout() {
  const rw = S.rw, rh = S.rh;
  if (!S.fullscreen && S.show_layers) S.totalcols = floor((rw - 8 - 270) / 32);
  else if (S.dropmode) S.totalcols = floor(rh / 32) + 1;
  else S.totalcols = floor(rw / 32) + 1;
  S.rhval = 270;
  if (!S.show_piano) S.rhval = 130;
  if (S.fullscreen) S.rhval = 32;
  S.totalrows = floor((rh - S.rhval) / 32);
  if (S.fullscreen) S.totalrows += 1;

  const keysFit = Math.min(S.keysmax, floor((rw - 32) / 39));
  if (keysFit !== S.keysshow) {
    S.startkey = 27 - floor(keysFit / 2);
    S.sharpkeys = 0;
    for (let a = 0; a < S.startkey; a++) {
      const b = a % 7;
      if (b !== 1 && b !== 4) S.sharpkeys++;
    }
  }
  S.keysshow = keysFit;
  S.x1 = (!S.fullscreen && S.show_layers) ? 264 : -2;
  S.y1 = S.fullscreen ? -2 : 52;
  S.gx = S.x1 + 2;
  S.gy = S.y1 + 34;
}

/* ---------------------------------------------------------------- 主帧 */
function editorFrame(dt) {
  G.cursor = 'default';
  UI.clickConsumed = false;
  // 拖拽结束后的“释放鼠标”状态复原
  if (S.window === W_RELEASE && !G.mb[0]) S.window = 0;
  S.cursmarker = 0;
  S.popupQueue = [];
  UI.popup = null;
  computeLayout();

  const rw = S.rw, rh = S.rh;
  const x1 = S.x1, y1 = S.y1, gx = S.gx, gy = S.gy;
  const totalcols = S.totalcols, totalrows = S.totalrows;

  // 计时/编辑相关
  S.editline = (S.editline + 30 * dt) % 60;
  if (S.delay > 0) S.delay = Math.max(0, S.delay - dt * 20);
  S.work_mins += dt / 60;
  // 自动保存
  if (S.autosave && S.totalblocks > 0) {
    if (S.tonextsave === undefined || S.tonextsave > (S.autosavemins || 10)) S.tonextsave = S.autosavemins || 10;
    S.tonextsave -= dt / 60;
    if (S.tonextsave <= 0) { S.tonextsave = S.autosavemins || 10; autosaveWrite(); }
  }

  // 网格指针
  S.sela = -1; S.selb = -1; S.selbx = -1; S.selby = -1;
  const inGrid = mouseRectangle(gx, gy, totalcols * 32, totalrows * 32);
  if (inGrid) {
    S.sela = floor((G.mouse.x - gx) / 32);
    S.selb = floor((G.mouse.y - gy) / 32);
    if (S.sela >= 0 && S.selb >= 0) {
      S.selbx = floor(S.starta) + S.sela;
      S.selby = floor(S.startb) + S.selb;
      S.hover.x = S.selbx; S.hover.y = S.selby;
      S.hover.exist = (S.selbx < S.arraylength && S.selby < S.arrayheight) ? gExists(S.selbx, S.selby) : 0;
      // 按用户要求：画布上不再显示十字（加号）形光标，用普通箭头。
      // GameMaker 桌面版没有这个十字光标，浏览器里它反而显得突兀。
      G.cursor = 'default';
    }
  } else {
    S.hover.exist = 0;
  }
  // 兼容性
  if (S.selected === 0) {
    if (S.block_outside === 0 && S.block_custom === 0) {
      S.compatible = (S.tempo === 10 || S.tempo === 5 || S.tempo === 2.5) && S.block_pitched === 0 ? 1 : 2;
    } else S.compatible = 0;
  }

  // 图层锁定状态
  for (let b = 0; b <= totalrows; b++) {
    const layer = floor(S.startb) + b;
    S.lockedlayer[layer] = 0;
    if (S.solostr !== '') {
      if (S.solostr.indexOf('|' + layer + '|') < 0) S.lockedlayer[layer] = 1;
      else if (S.layerlock[layer] === 1) S.lockedlayer[layer] = 1;
    } else if (layer < S.endb2) {
      if (S.layerlock[layer] === 1) S.lockedlayer[layer] = 1;
    }
  }

  // 菜单 / 消息框打开时，编辑器层不应响应鼠标
  const rawMb = G.mb.slice(), rawMbp = G.mbp.slice(), rawMbr = G.mbr.slice(), rawWheel = G.wheel;
  // 关闭菜单/消息框的那一次按下要被"吞掉"，直到松开（含松开那一帧），避免穿透到下层控件
  const blocked = isDialogWindow(S.window) || !!UI.menu || !!UI.modal || !!UI.swallowPress;
  UI.rawMbr = rawMbr; UI.rawMbp = rawMbp; UI.blocked = blocked;
  if (blocked) {
    G.mb = [false, false, false]; G.mbp = [false, false, false];
    G.mbr = [false, false, false]; G.wheel = 0;
  }
  S.cursmarker = 0;
  handleGlobalKeys();
  handlePlayback(dt);
  handleTimelineInput();
  handleGridInput();
  handlePianoInput();
  drawEditor(dt);
  G.mb = rawMb; G.mbp = rawMbp; G.mbr = rawMbr; G.wheel = rawWheel;
  drawWindows();
  drawMenu();
  drawMessageBox();
  drawPopup();
  if (G.mbp[0] && UI.textFocus >= 0 && !UI.clickConsumed) blurText();
  // 帧末才解除"吞点击"：松开那一帧仍算被吞
  if (UI.swallowPress && !G.mb[0] && !G.mbp[0] && !G.mbr[0]) UI.swallowPress = false;
  G.hiddenInput.style.cursor = G.cursor;
  G.canvas.style.cursor = G.cursor;
}

/* ---------------------------------------------------------------- 全局按键 */
function handleGlobalKeys() {
  if (UI.textFocus >= 0 || UI.modal || UI.menu) return;
  const K = G.keysPressed;
  // 方向键与快进快退按钮都是"按住才生效"，每帧先归零
  if (S.window !== W_DRAGMARKER) {
    S.forward = 0;
    if (G.keys['ArrowRight']) S.forward = 1;
    else if (G.keys['ArrowLeft']) S.forward = -1;
  }
  if (S.key_edit > -1) {
    const kk = Object.keys(K)[0];
    if (kk === 'Escape' || kk === 'Enter' || kk === ' ') { S.piano_key[S.key_edit] = 0; S.key_edit = -1; saveSettings(); }
    else if (kk && kk.length === 1) { S.piano_key[S.key_edit] = kk.toUpperCase().charCodeAt(0); S.key_edit = -1; saveSettings(); }
    return;
  }
  const ctrl = G.ctrl, shift = G.shift;

  if (K['F11']) { S.fullscreen = !S.fullscreen; setMsg(S.fullscreen ? '全屏模式 => 开启' : '全屏模式 => 关闭'); }
  if (K['F10']) { S.blackout = !S.blackout; setMsg(S.blackout ? '全黑模式 => 开启' : '全黑模式 => 关闭'); }

  if (S.playing === 0) {
    if (ctrl && !shift) {
      if (K['n']) newSong();
      if (K['o']) loadSongDialog();
      if (K['s']) saveSongFile(false);
      if (K['a']) selectAll(-1, 0);
      if (K['i']) selectionInvert();
      if (K['c']) actionCopy();
      if (K['x']) actionCut();
      if (K['v']) actionPaste(S.selbx > -1 ? S.selbx : S.starta, S.selby > -1 ? S.selby : S.startb);
      if (K['z']) actionUndo();
      if (K['y']) actionRedo();
      if (K['e']) modeAction(1);
      if (K['d']) modeAction(2);
      if (K['r']) modeAction(3);
      if (K['f']) modeAction(4);
      if (S.editmode !== 0 && K['t']) modeAction(5);
      if (S.editmode !== 0 && K['g']) modeAction(6);
      if (K['p']) S.window = W_PREFERENCES;
      if (K['0']) { S.window_scale = 1; layoutResize(); setMsg('窗口缩放 => 100%'); }
      if (K['='] || K['+']) zoomIn();
      if (K['-']) zoomOut();
      // 音色快捷键 Ctrl+1..9 / Ctrl+Shift+1..7
      if (!shift) {
        for (let a = 1; a <= 9; a++) {
          if (K[String(a)]) {
            S.instrument = a - 1;
            S.selected_vel = 100; S.selected_pan = 100; S.selected_pit = 0;
            if (INSTRUMENTS[S.instrument]) playSound(INSTRUMENTS[S.instrument], S.selected_key, 100, 100, 0);
          }
        }
      } else {
        for (let a = 1; a <= 7; a++) {
          if (K[String(a)]) {
            S.instrument = a + 8;
            S.selected_vel = 100; S.selected_pan = 100; S.selected_pit = 0;
            if (INSTRUMENTS[S.instrument]) playSound(INSTRUMENTS[S.instrument], S.selected_key, 100, 100, 0);
          }
        }
        // 宏快捷键
        if (S.selected !== 0) {
          if (K['a']) S.window = W_TREMOLO;
          if (K['s']) S.window = W_STEREO;
          if (K['d']) S.window = W_ARPEGGIO;
          if (K['f']) S.window = W_PORTAMENTO;
          if (K['g']) { macroVibrato(); }
          if (K['h']) S.window = W_STAGGER;
          if (K['j']) { macroChorus(); }
          if (K['k']) { macroVelocityLFO(); }
          if (K['q']) { macroFade(true); }
          if (K['w']) { macroFade(false); }
          if (K['e']) { macroReplaceKey(); }
          if (K['r']) S.window = W_SETVELOCITY;
          if (K['t']) S.window = W_SETPANNING;
          if (K['y']) S.window = W_SETPITCH;
          if (K['u']) { macroReset(); }
        }
      }
    }
    if (K['Delete'] && S.selected > 0) { actionDelete(); }
    if (K['Home']) { S.starta = 0; }
    if (K['End']) { S.starta = S.enda; }
    if (K['PageUp']) S.starta = Math.min(S.enda, S.starta + S.totalcols);
    if (K['PageDown']) S.starta = Math.max(0, S.starta - S.totalcols);
  }
  if (K['Enter']) { S.playing = 0; S.marker_pos = 0; S.marker_prevpos = 0; }
  if (K[' ']) { togglePlaying(S.totalcols); }
  if (K['F7']) setMsg('帧率上限切换');
  if (K[' '] || K['ArrowLeft'] || K['ArrowRight'] || K['Home'] || K['End']) { }
}

function zoomIn() {
  const steps = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 3.5, 4];
  for (const s of steps) if (s > S.window_scale + 0.001) { S.window_scale = s; break; }
  layoutResize();
  setMsg('窗口缩放 => ' + Math.round(S.window_scale * 100) + '%');
}
function zoomOut() {
  const steps = [4, 3.5, 3, 2.5, 2, 1.75, 1.5, 1.25, 1, 0.9, 0.8, 0.75, 0.67, 0.5];
  for (const s of steps) if (s < S.window_scale - 0.001) { S.window_scale = s; break; }
  layoutResize();
  setMsg('窗口缩放 => ' + Math.round(S.window_scale * 100) + '%');
}
function layoutResize() {
  resizeCanvas();
  computeLayout();
  // 缩放变了就落盘：缩放有多条修改路径（首选项滑块、Ctrl+滚轮、快捷键、重置按钮），
  // 逐个补 saveSettings() 容易漏。这里统一在布局重算后保存一次，
  // 保证「刷新后缩放变回 100%」不再发生。
  if (typeof saveSettings === 'function') saveSettings();
}

/* ---------------------------------------------------------------- 播放推进 */
function handlePlayback(dt) {
  const totalcols = S.totalcols;
  if (S.playing === 1 || S.forward !== 0) {
    if (S.playing === 1) S.marker_pos += S.tempo * dt;
    if (S.forward !== 0) S.marker_pos += S.tempo * dt * (S.forward - (S.forward < 0 && S.playing === 1 ? 1 : 0));

    // 节拍器（对照 control_draw.gml:1047-1064）
    // 注意：源码用的是 play_sound(soundmetronome...)，【不是】界面音效，
    // 所以它不受「界面音效」开关影响 —— 之前走 playUISound() 会先判 S.windowsound，
    // 关掉界面音效后节拍器就彻底没声音了。
    if (S.metronome) {
      let pos = floor(S.marker_pos - 0.1);
      if (S.tempo === 30) pos -= 1;
      if (pos % 4 === 0 && S.metronome_played < pos) {
        if (pos % (4 * S.timesignature) === 0) {
          // 循环时避免重复敲
          if (!(S.loop_session === 1 && pos >= S.enda + 1)) playUISoundRaw('metronome_click');
        } else {
          playUISoundRaw('metronome');
        }
        S.metronome_played = pos + 1;
      }
    }
    // 循环
    if (S.loop_session === 1 && S.marker_pos > S.enda + 1) {
      S.timestoloop--;
      S.starta = S.loopstart;
      S.marker_pos = S.starta;
      S.metronome_played = -1;
      if (S.sb_val) S.sb_val[0] = S.starta;
      if (S.loopmax !== 0 && S.timestoloop < 0) {
        S.playing = 0; S.marker_pos = 0; S.marker_prevpos = 0; S.timestoloop = S.loopmax;
      }
    }
    if (S.marker_pos > S.enda + totalcols) { S.marker_pos = S.enda + totalcols; S.playing = 0; }
    if (S.marker_end && S.marker_pos >= S.section_end && S.marker_prevpos < S.section_end) {
      S.marker_pos = S.section_end; S.playing = 0;
    }
    // 跟随进度条（对照 control_draw.gml:1090-1106）
    // 注意源码只有两个分支：pagebypage = 1（按页）走「翻页」逻辑，
    // 其它值（0 按刻 / 2 按帧）统统走 else 的「居中跟随」。
    // 也就是说「按帧」和「按刻」的滚动位置公式完全一样，
    // 区别只在 note_offset（控制_draw.gml:375）——按帧时会把不足一格的小数部分
    // 用像素偏移平滑掉，看起来是连续滑动而不是一格一格跳。
    // 之前按帧走了「按页」那支，导致每帧都在翻页边界来回，进度条和时间轴一起抽搐。
    if (S.marker_follow === 1) {
      if (S.marker_pagebypage === 1) {
        if (floor(S.marker_pos) >= S.starta + totalcols - 1 && S.starta < S.enda) {
          S.starta = median(0, S.marker_pos - 1, S.enda);
          if (S.sb_val) S.sb_val[0] = S.starta;
        }
        if (floor(S.marker_pos) < S.starta + 1 && S.forward === -1 && S.starta > 0) {
          S.starta = median(0, floor(S.marker_pos) - totalcols + 1, S.enda);
          if (S.sb_val) S.sb_val[0] = S.starta;
        }
      } else {
        S.starta = median(0, S.marker_pos - ceil(totalcols / 2), S.enda);
        if (S.sb_val) S.sb_val[0] = S.starta;
      }
    }
  }
  S.marker_pos = median(0, S.marker_pos, S.enda + totalcols);
}

/* 播放当前列（floor(marker_pos) 变化时） */
function playColumnRange(start, end) {
  for (let xx = start; xx <= end; xx++) {
    if (xx < 0) continue;
    if (colamount[xx] > 0) {
      for (let b = colfirst[xx]; b <= collast[xx]; b++) {
        if (!gExists(xx, b)) continue;
        let a = 1, c = 1, d = 100, e = 0;
        if (b < S.endb2) {
          c = (S.layervol[b] / 100) * gVel(xx, b);
          d = S.layerstereo[b] === 100 ? gPan(xx, b) : (S.layerstereo[b] + gPan(xx, b)) / 2;
          e = gPit(xx, b);
        }
        if (S.solostr !== '') {
          if (S.solostr.indexOf('|' + b + '|') < 0) a = 0;
          else if (S.layerlock[b] === 1) a = 0;
        } else if (b < S.endb2) {
          if (S.layerlock[b] === 1) a = 0;
        }
        if (S.record === 1 && S.playing === 1) {
          if ((G.time - S.grid.added[gidx(xx, b)]) * 1000 < 1000) a = 0;
        }
        if (a) {
          const ins = INSTRUMENTS[gIns(xx, b)];
          if (ins && ins.loaded) playSound(ins, gKey(xx, b), c, d, e);
          if (ins && ins.name === 'Tempo Changer') S.tempo = floor(Math.abs(e)) / 15;
          if (ins && ins.press) S.key_played[gKey(xx, b)] = G.time;
          S.grid.played[gidx(xx, b)] = G.time;
        }
      }
    }
  }
}

function togglePlaying(cols) {
  S.playing = S.playing ? 0 : 1;
  if (S.playing === 1) {
    if (S.marker_pos === S.enda + cols) S.marker_pos = 0;
    if (S.marker_start && S.section_exists) S.marker_pos = S.section_start;
    if (S.marker_follow === 1) {
      if (S.marker_pagebypage === 1 && (S.starta + cols - 2 < S.marker_pos || S.starta > S.marker_pos)) {
        S.starta = median(0, S.marker_pos - 1, S.enda);
      }
      if (S.marker_pagebypage === 0 || S.marker_pagebypage === 2) {
        S.starta = median(0, S.marker_pos - floor(cols / 2), S.enda);
      }
    }
    S.marker_prevpos = S.marker_pos;
    S.metronome_played = -1;
    const xx = floor(S.marker_pos);
    if (xx <= S.enda) playColumnRange(xx, xx);
  } else {
    S.timestoloop = S.loopmax;
  }
}

/* ---------------------------------------------------------------- 网格交互 */
function handleGridInput() {
  const gx = S.gx, gy = S.gy;
  const totalcols = S.totalcols, totalrows = S.totalrows;
  const sela = S.sela, selb = S.selb;

  if (S.window === W_DRAGSELECTION) {
    // 对照 control_draw.gml:516-533：
    //   selection_x = starta + floor((mouse_x - (x1+2)) / 32) - select_pressa
    //   selection_y = startb + floor((mouse_y - (y1+34)) / 32) - select_pressb
    // 这里 x1+2 = gx、y1+34 = gy，用的都是【未经取整】的 starta/startb，
    // 只对鼠标偏移做 floor —— 之前两边都 floor 过，逐页滚动剩小数时会差一格。
    const nx = Math.max(0, S.starta + floor((G.mouse.x - gx) / 32) - S.select_pressa);
    const ny = Math.max(0, S.startb + floor((G.mouse.y - gy) / 32) - S.select_pressb);
    SEL.x = floor(nx); SEL.y = floor(ny);
    G.cursor = 'move';
    if (!G.mb[0]) {
      // 对照 control_draw.gml:526-532：松手时把坐标夹到 >=0，写历史，再 selection_expand_layers()
      S.window = W_RELEASE;
      const ox = S.selection_sx0, oy = S.selection_sy0;
      const fx = SEL.x, fy = SEL.y;
      if (ox !== fx || oy !== fy) {
        historyPush(() => { SEL.x = ox; SEL.y = oy; }, () => { SEL.x = fx; SEL.y = fy; });
        S.changed = 1;
      }
      selectionExpandLayersSafe();
    }
    return;
  }
  if (S.select > 0) {
    // 拖选
    if (S.select === 1 && !G.mb[0]) {
      selectionAdd(S.select_pressa, S.select_pressb, S.selbx, S.selby, G.alt, false);
      S.window = W_RELEASE; S.select = 0;
      S.select_pressx = -1; S.select_pressy = -1; S.select_pressa = -1; S.select_pressb = -1;
    }
    if (S.select === 2 && !G.mb[2]) {
      selectionRemove(S.select_pressa, S.select_pressb, S.selbx, S.selby, false, false);
      S.window = W_RELEASE; S.select = 0;
      S.select_pressx = -1; S.select_pressy = -1; S.select_pressa = -1; S.select_pressb = -1;
    }
    // 同上：拖拽选区时也用普通箭头，不显示十字光标
    if (sela > -1 && selb > -1) G.cursor = 'default';
    return;
  }
  // 有拖拽状态（滚动条/标记/区间）或指针停在标记手柄上时，网格不响应
  // 注意：先放行「拖动选区」——它要在 window=0 时把自己的 window 抢过来。
  if (S.window === 0 && !S.playing && UI.textFocus < 0 && S.selected > 0) {
    const hit = selectionDragHitTest(gx, gy, totalcols, totalrows);
    if (hit) {
      G.cursor = 'move';
      if (G.mbp[0]) {
        // 对照 selection_draw.gml:66-71：进入拖拽，记下鼠标相对选区的偏移与起始位置
        S.window = W_DRAGSELECTION;
        S.select_pressa = hit.sa;
        S.select_pressb = hit.sb;
        S.selection_sx0 = SEL.x;
        S.selection_sy0 = SEL.y;
        return;
      }
    }
  }
  if (S.window !== 0 || S.playing || UI.textFocus >= 0) return;
  if (sela < 0 || selb < 0) {
    // 网格外：滚轮切换音色/音高
    handleWheel();
    return;
  }

  if (S.cursmarker) return;
  const exist = S.hover.exist;

  // 滚轮改属性
  if (exist && S.changepitch && G.wheel && S.editmode >= 0) {
    let diff = G.wheel * (G.shift && S.editmode === 0 ? 12 : (G.shift ? 1 : 10));
    const x = S.selbx, y = S.selby;
    let key = gKey(x, y), vel = gVel(x, y), pan = gPan(x, y), pit = gPit(x, y);
    if (S.editmode === 0) key = median(0, key + diff, 87);
    else if (S.editmode === 1) vel = median(0, vel + diff, 100);
    else if (S.editmode === 2) pan = median(0, pan + diff, 200);
    else if (S.editmode === 3) {
      const insName = INSTRUMENTS[gIns(x, y)] && INSTRUMENTS[gIns(x, y)].name;
      pit = insName === 'Tempo Changer' ? pit + diff : median(-1200, pit + diff, 1200);
    }
    changeBlockManual(x, y, gIns(x, y), key, vel, pan, pit);
    return;
  }
  handleWheel();

  // 按下
  if (G.mbp[0] || G.mbp[2] || G.mbp[1]) S.clickinarea = 1;
  if (G.mbp[0]) {
    if (S.selected > 0 && !G.ctrl) { selectionPlace(false); S.dontplace = 1; }
    if (G.ctrl) selectionAdd(S.selbx, S.selby, S.selbx, S.selby, false, false);
    S.select_pressx = G.mouse.x; S.select_pressy = G.mouse.y;
    S.select_pressa = S.selbx; S.select_pressb = S.selby;
  }
  if (G.mb[0]) {
    if ((S.selbx !== S.select_pressa || S.selby !== S.select_pressb) && S.select_pressx !== -1) S.select = 1;
  }
  // 对照 control_draw.gml:578-594：只有中键按下才「吸管 + 试听」。
  // 右键在这段源码里纯粹是删除/擦除，从头到尾没有 play_sound，
  // 之前把试听挂在 G.mbp[2]（右键）上，所以右键删除音符会响一声——不是原版行为。
  if (G.mbp[1]) {
    // 中键吸管
    if (exist) {
      S.selected_key = gKey(S.selbx, S.selby);
      S.instrument = gIns(S.selbx, S.selby);
      if (G.ctrl) {
        S.selected_vel = gVel(S.selbx, S.selby);
        S.selected_pan = gPan(S.selbx, S.selby);
        S.selected_pit = gPit(S.selbx, S.selby);
      } else { S.selected_vel = 100; S.selected_pan = 100; S.selected_pit = 0; }
      if (INSTRUMENTS[S.instrument]) playSound(INSTRUMENTS[S.instrument], S.selected_key, S.selected_vel, S.selected_pan, S.selected_pit);
    }
  }
  if (G.mbp[2] && G.ctrl) { selectionRemove(S.selbx, S.selby, S.selbx, S.selby, false, false); }

  // 右键：按下记录起点；单击（不拖动且没删到方块）→ 弹出菜单；拖动 → 擦除 / 从选区移除
  if (G.mbp[2] && !G.ctrl) {
    S.rightPress = { x: S.selbx, y: S.selby, removed: false, moved: false };
    if (S.selected === 0 && exist) {
      removeBlockManual(S.selbx, S.selby);
      S.rightPress.removed = true;
    }
  }
  if (G.mb[2] && !G.ctrl && S.rightPress) {
    if (S.selbx !== S.rightPress.x || S.selby !== S.rightPress.y) {
      S.rightPress.moved = true;
      if (S.selected > 0) S.select = 2;          // 在选区上右键拖动 → 从选区擦除
      else if (exist) removeBlockManual(S.selbx, S.selby);   // 空区域右键拖动 → 连续擦除
    }
  }
  if (G.mbr[0] && S.clickinarea) {
    if (S.selected === 0) {
      if (!S.dontplace) {
        if (exist) {
          const ins = S.instrument;
          const cur = gIns(S.selbx, S.selby);
          if (cur !== ins || gKey(S.selbx, S.selby) !== S.selected_key ||
            gVel(S.selbx, S.selby) !== S.selected_vel || gPan(S.selbx, S.selby) !== S.selected_pan ||
            gPit(S.selbx, S.selby) !== S.selected_pit) {
            changeBlockManual(S.selbx, S.selby, ins, S.selected_key, S.selected_vel, S.selected_pan, S.selected_pit);
          }
        } else {
          addBlockManual(floor(S.starta) + sela, floor(S.startb) + selb, S.instrument, S.selected_key, S.selected_vel, S.selected_pan, S.selected_pit);
        }
      }
    } else if (S.select === 0 && !G.ctrl) {
      selectionPlace(false);
    }
    S.dontplace = 0;
    S.select = 0;
    S.select_pressx = -1; S.select_pressy = -1;
    S.select_pressa = -1; S.select_pressb = -1;
  }
  if (G.mbr[2]) {
    if (S.rightPress && !S.rightPress.moved && !S.rightPress.removed && !G.ctrl) {
      openEditContextMenu();
    }
    S.rightPress = null;
    S.select_pressx = -1;
  }
}

function handleWheel() {
  if (!G.wheel) return;
  // 对照 control_draw.gml:312-340：
  //   mouse_wheel_down()（G.wheel > 0）→ 乐器索引 -1 / 基准音 -1（降半音）
  //   mouse_wheel_up()  （G.wheel < 0）→ 乐器索引 +1 / 基准音 +1（升半音）
  // 之前把两者写反了，所以向下滚时基准音反而升高、乐器索引反而增加。
  if (G.shift) {
    if (G.wheel > 0 && S.selected_key > 0) {
      S.selected_key--; playSound(INSTRUMENTS[S.instrument], S.selected_key, 100, 100, 0);
    }
    if (G.wheel < 0 && S.selected_key < 87) {
      S.selected_key++; playSound(INSTRUMENTS[S.instrument], S.selected_key, 100, 100, 0);
    }
  } else {
    let idx = S.instrument;
    idx = clamp(idx - G.wheel, 0, INSTRUMENTS.length - 1);
    if (idx !== S.instrument) {
      S.instrument = idx;
      S.selected_vel = 100; S.selected_pan = 100; S.selected_pit = 0;
      if (INSTRUMENTS[idx]) playSound(INSTRUMENTS[idx], S.selected_key, 100, 100, 0);
    }
  }
}

/* 时间轴 / 标记 / 区间交互（对照 control_draw:207-270 与 1109-1175） */
function handleTimelineInput() {
  const gx = S.gx, y1 = S.y1;
  const totalcols = S.totalcols, totalrows = S.totalrows;

  // 正在拖播放标记
  if (S.window === W_DRAGMARKER) {
    S.marker_pos = (G.mouse.x - gx) / 32 + floor(S.starta);
    G.cursor = 'ew-resize';
    if (!G.mb[0]) S.window = W_RELEASE;
    return;
  }
  // 正在拖区间端点（松手时才整理顺序，但绘制时按 section_end<section_start 立即翻转）
  if (S.window === W_DRAGSECTION_START || S.window === W_DRAGSECTION_END) {
    const col = floor(S.starta) + round((G.mouse.x - gx) / 32);
    if (S.window === W_DRAGSECTION_START) S.section_start = col;
    else S.section_end = col;
    G.cursor = 'ew-resize';
    if (!G.mb[0]) {
      S.window = W_RELEASE;
      if (S.section_end === S.section_start) S.section_exists = 0;
      else {
        const a = S.section_start;
        S.section_start = Math.min(S.section_start, S.section_end);
        S.section_end = Math.max(a, S.section_end);
      }
    }
    return;
  }
  if (S.playing === 1 || S.window !== 0) return;
  if (S.select > 0) return;

  const mx = gx + floor(S.marker_pos * 32 - floor(S.starta) * 32);
  const inGridCol = mouseRectangle(gx, y1 + 2, totalcols * 32, totalrows * 32 + 64);

  // 播放标记手柄（跨整列高度，优先于区间手柄）
  if (mouseRectangle(mx - 8, y1, 16, totalrows * 32 + 32) && inGridCol) {
    S.cursmarker = 1;
    G.cursor = 'ew-resize';
    if (G.mb[0]) { S.window = W_DRAGMARKER; return; }
  }
  // 区间端点手柄
  if (S.section_exists && !S.cursmarker) {
    const sx = gx + floor(S.section_start * 32 - floor(S.starta) * 32);
    const ex = gx + floor(S.section_end * 32 - floor(S.starta) * 32);
    if (mouseRectangle(sx - 8, y1, 16, totalrows * 32 + 32) && inGridCol) {
      S.cursmarker = 1; G.cursor = 'ew-resize';
      if (G.mb[0]) { S.window = W_DRAGSECTION_START; return; }
    } else if (mouseRectangle(ex - 8, y1, 16, totalrows * 32 + 32) && inGridCol) {
      S.cursmarker = 1; G.cursor = 'ew-resize';
      if (G.mb[0]) { S.window = W_DRAGSECTION_END; return; }
    }
  }

  // 时间轴刻度条本体
  if (mouseRectangle(gx, y1 + 2, totalcols * 32, 32)) {
    if (S.select === 0 && G.mbp[2] && !S.cursmarker) openSectionMenu();
    if (G.mbp[0] && !S.cursmarker) S.timeline_pressa = floor(S.starta) + floor((G.mouse.x - gx) / 32);
    if (G.mbr[0] && !S.cursmarker) {
      S.marker_pos = floor(S.starta) + (G.mouse.x - gx) / 32;
      S.timeline_pressa = -1;
    }
    if (G.mb[0] && !S.cursmarker && S.timeline_pressa > -1) {
      const cur = floor(S.starta) + floor((G.mouse.x - gx) / 32);
      if (cur !== S.timeline_pressa) {
        S.window = W_DRAGSECTION_END;
        S.section_exists = 1;
        S.section_end = cur;
        S.section_start = S.timeline_pressa;
        S.timeline_pressa = -1;
      }
    }
  }
}

/* 钢琴 */
function handlePianoInput() {
  if (!S.show_piano || S.fullscreen || isDialogWindow(S.window)) return;
  const kc = S.dropmode ? 52 : S.keysshow;
  const px = floor(S.rw / 2 - (kc * 39) / 2);
  const py = S.rh - 154;
  if (mouseRectangle(px, py - 8, kc * 39, 136)) G.cursor = 'pointer';
  // 键盘按键
  if (UI.textFocus < 0 && S.key_edit === -1 && !G.ctrl) {
    for (let a = 0; a <= 87; a++) {
      const code = S.piano_key[a];
      if (!code) continue;
      const ch = String.fromCharCode(code);
      const want = G.keys[ch.toLowerCase()] || G.keys[ch.toUpperCase()];
      if (!S.key_press[a] && want) {
        if (S.select_lastpressed) { S.selected_key = a; S.selected_vel = 100; S.selected_pan = 100; S.selected_pit = 0; }
        if (!S.record) playSound(INSTRUMENTS[S.instrument], a, 100, 100, 0);
        if (S.playing === 0.25) togglePlaying(S.totalcols);
        if (S.playing && S.record) {
          let b = 0;
          while (!addBlockManual(ceil(S.marker_pos), b, S.instrument, a, 100, 100, 0)) b++;
        }
        S.key_press[a] = 1;
      } else if (!want) {
        S.key_press[a] = 0;
      }
    }
  }
}

/* ---------------------------------------------------------------- 绘制 */
function drawEditor(dt) {
  const c = G.ctx;
  const rw = S.rw, rh = S.rh;
  const x1 = S.x1, y1 = S.y1, gx = S.gx, gy = S.gy;
  const totalcols = S.totalcols, totalrows = S.totalrows;
  // 滚动位置可能是小数（逐帧跟随），索引一律取整，另用 note_offset 做亚格平滑。
  // 对照 control_draw.gml:375：
  //   note_offset = floor(((marker_pos - floor(marker_pos + 0.5 * !isplayer)) * 32) + 0.5)
  //                 * ((playing && marker_follow && marker_pagebypage = 2
  //                    && marker_pos - floor(totalcols/2 + 0.5) < enda + 1
  //                    && marker_pos - floor(totalcols/2 + 0.5) > 0) || isplayer)
  // 编辑器里 isplayer = 0，所以 `floor(marker_pos + 0.5 * 0)` 就是 floor(marker_pos)。
  // （注意别顺手写成 floor(marker_pos + 0.5)——那个 0.5 只在播放器模式下才存在，
  //  加上它会整整差一格，note_offset 在正负之间来回跳。）
  // 偏移量取自【starta 的小数部分】。
  //
  // 为什么不能用 frac(marker_pos)（原版 control_draw.gml:375 的写法）：
  //   画布把某一列画在  32*a - note_offset  处，其中 a = 列号 - floor(starta)。
  //   要让这一列随 starta 连续左移，就必须满足
  //       32*(列 - starta) ≈ 32*a - note_offset
  //   ⇒ note_offset 必须 ≈ 32*frac(starta)。
  //   原版用 frac(marker_pos) 也能对上，前提是 starta 与 marker_pos 的整数相位一致
  //   （按帧时 starta = marker_pos - ceil(totalcols/2)，只差一个【整数】，相位确实一致）。
  //
  //   但在浏览器里 starta 会被 median(0, …, enda) 夹住、每帧由播放推进累积浮点误差，
  //   一旦 starta 的整数相位与 marker_pos 错开，frac(marker_pos) 就会在 starta 还没跨
  //   整数时先归零 —— 表现为「每前进一刻，整个画布被往回拉一格」（实测 15/96 帧）。
  //
  //   直接改成 frac(starta) 就与 32*a - note_offset 的几何定义严格自洽：
  //   无论 starta 怎么来（跟随、夹取、浮点误差），画布都只跟着 starta 连续平移。
  {
    const center = floor(totalcols / 2 + 0.5);
    const inRange = (S.marker_pos - center < S.enda + 1) && (S.marker_pos - center > 0);
    const active = (S.playing && S.marker_follow && S.marker_pagebypage === 2 && inRange) ? 1 : 0;
    // frac(starta) ∈ [0,1)，乘 32 后用 floor 而不是 +0.5 四舍五入：
    // 若四舍五入，fs=0.999 时会得到 32，而此刻 floor(starta) 还没进位，
    // 于是「a 用旧值、noff 已跳到 32」→ 整个画面右移一格（回拉）。
    // 用 floor 保证 note_offset 严格落在 [0,31]，进位只由 floor(starta) 承担，
    // 两者永远同步，画布只做连续平移。
    const fs = S.starta - floor(S.starta);
    S.note_offset = floor(fs * 32) * active;
  }
  const sta = floor(S.starta), stb = floor(S.startb);
  const noff = S.note_offset;

  // 背景
  setAlpha(1);
  setColor(C.background);
  fillRect(0, 0, rw, rh);

  // 网格底色
  setColor(C.grid);
  fillRect(gx, gy, totalcols * 32, totalrows * 32);

  // 播放列触发
  if (floor(S.marker_pos) !== floor(S.marker_prevpos) && floor(S.marker_pos) <= S.enda &&
    (floor(S.marker_pos) !== S.section_end || S.window === W_DRAGMARKER || S.forward !== 0 || S.marker_end === 0 || S.marker_prevpos >= S.section_end)) {
    const diff = floor(S.marker_pos) - floor(S.marker_prevpos);
    let start;
    if (!S.playing || diff < 0 || diff > 3) start = floor(S.marker_pos);
    else start = floor(S.marker_prevpos) + 1;
    playColumnRange(start, floor(S.marker_pos));
  }
  if (S.tempo < 0.25) S.tempo = 0.25;

  // 列线（每 4 / 每小节）
  for (let a = 0; a < totalcols; a++) {
    const col = sta + a;
    if (col % (S.timesignature * 4) === 0) {
      setAlpha(0.3); setColor(C.gridLine);
      fillRect(gx + 32 * a - noff, gy, 1, totalrows * 32);
    } else {
      setAlpha(col % 4 === 0 ? 0.25 : 0.1);
      setColor(C.gridLine);
      line(gx + 32 * a - noff, gy, gx + 32 * a - noff, gy + totalrows * 32);
    }
  }
  setAlpha(1);

  // 音符
  const now = G.time;
  for (let a = 0; a < totalcols; a++) {
    const col = sta + a;
    if (col > S.enda) break;
    if (colamount[col] <= 0) continue;
    for (let b = 0; b < totalrows; b++) {
      const layer = stb + b;
      if (layer > S.endb) break;
      if (layer < colfirst[col] || layer > collast[col]) continue;
      if (!gExists(col, layer)) continue;
      const i = gidx(col, layer);
      let alpha = 0.5 * (gVel(col, layer) / 100) + 0.25;
      if (S.lockedlayer[layer] === 0) {
        alpha += 0.5 * (1 - Math.min(1, now - S.grid.played[i]));
      }
      let s = 0;
      if (S.playing === 0 && S.selected === 0) {
        if (S.selbx === col && S.selby === layer && !isDialogWindow(S.window) && !S.cursmarker) alpha += 0.5;
      }
      drawBlock(gx + 32 * a - noff, gy + 32 * b, gIns(col, layer), gKey(col, layer), gPan(col, layer), gVel(col, layer), gPit(col, layer), clamp(alpha, 0, 1.5), s);
    }
  }

  // 选区
  if (S.selected > 0) selectionDraw(gx, gy, totalcols, totalrows);

  // 拖选矩形
  if (S.select > 0) {
    setColor(S.select === 2 ? COL.red : (S.theme === 3 ? '#d77800' : '#0000e0'));
    setAlpha(0.25);
    const x2 = S.starta === 0 ? Math.max(gx, G.mouse.x) : G.mouse.x;
    const y2 = S.startb === 0 ? Math.max(gy, G.mouse.y) : G.mouse.y;
    fillRect(S.select_pressx, S.select_pressy, x2 - S.select_pressx, y2 - S.select_pressy);
    setAlpha(1);
    setColor(S.select === 2 ? COL.red : C.accent);
    G.ctx.strokeRect(S.select_pressx + 0.5, S.select_pressy + 0.5, x2 - S.select_pressx, y2 - S.select_pressy);
  }

  // 锁定层斜纹
  for (let b = 0; b < totalrows; b++) {
    if (S.lockedlayer[S.startb + b]) {
      const f = frame('spr_lock', 0);
      if (f) {
        setAlpha(0.18);
        c.save();
        c.translate(gx, gy + 32 * b);
        c.scale(totalcols, 1);
        c.drawImage(f.img, f.sx, f.sy, f.w, f.h, 0, 0, 32, 32);
        c.restore();
        setAlpha(1);
      }
    }
  }

  // 时间轴
  drawTimeline();

  // 面板底色
  setColor(C.panel);
  fillRect(0, 0, rw, y1 + 2);
  if (!S.fullscreen) {
    if (S.show_layers) fillRect(0, y1 + 3, x1 + 1, rh - y1 - 3);
    fillRect(gx, S.y1 + totalrows * 32 + 52, rw - gx, rh);
    fillRect(gx + totalcols * 32 + 18, y1 + 3, rw - (gx + totalcols * 32 + 18), totalrows * 32 + 48);
    setColor(C.panel);
    fillRect(gx + totalcols * 32 + 2, S.y1 + totalrows * 32 + 32, 17, 18);
  }

  // 滚动条
  if (!S.fullscreen) {
    drawHScrollbar();
    drawVScrollbar();
  }

  // 图层面板
  if (!S.fullscreen && S.show_layers) drawLayersPanel();

  // 宏工具条
  if (S.selected !== 0 && S.show_piano) drawMacroBar();

  // 顶栏
  drawTopBar();
  // 底部状态栏
  drawStatusBar();
  // 时间/速度信息
  drawInfoBoxes();
  // 钢琴
  if (!S.fullscreen && (S.show_piano || S.dropmode)) drawPianoAll();
  // 提示消息
  drawMsg();

  // 删除特效
  for (let i = removeEffects.length - 1; i >= 0; i--) {
    const e = removeEffects[i];
    e.t = (e.t || 0) + dt * 3;
    if (e.t > 1) { removeEffects.splice(i, 1); continue; }
    setAlpha(1 - e.t);
    setColor(C.accent);
    G.ctx.strokeRect(gx + e.x * 32 + 0.5, gy + e.y * 32 + 0.5, 31, 31);
    setAlpha(1);
  }

  S.marker_prevpos = S.marker_pos;
  S.prevwindow = S.window;
}

/* ---------------------------------------------------------------- 音符方块 */
function drawBlock(x, y, ins, key, pan, vel, pit, alpha, salpha) {
  const index = ins;
  if (index === undefined || index < 0 || index >= INSTRUMENTS.length) return;
  const iscustom = index >= S.first_custom_index;
  let fr = iscustom ? ((index - S.first_custom_index) % 18 + S.first_custom_index) : index;
  let sprite = S.use_colors ? (S.use_shapes ? 'spr_block_color_shape' : 'spr_block_color') : (S.use_shapes ? 'spr_block_shape' : 'spr_block');
  if (!S.use_colors && !S.use_shapes) fr = 1;
  setAlpha(alpha);
  drawSprite(sprite, fr, x, y);
  setAlpha(1);

  if (S.use_icons) {
    // 对照 draw_block.gml：
    //   draw_icon_customins(xx + 16, yy + 16, index - first_custom_index, alpha, true, 1)
    //   draw_sprite_ext(spr_instrumenticons, index, xx + 16, yy + 16, 1, 1, 0, -1, alpha)
    // spr_instrumenticons 是 16x16、原点 (0,0)，所以图标占据的是方块的「右下四分之一格」
    // (xx+16 .. xx+32, yy+16 .. yy+32)，不是居中。
    // 之前写成 x+8 / y+8（居中），位置就是用户看到的「图标在音符块中位置错了」。
    if (iscustom) drawCustomInsIcon(x + 16, y + 16, index - S.first_custom_index, alpha);
    else drawSprite('spr_instrumenticons', index, x + 16, y + 16, 1, 1, null, alpha);
  }

  // 音高偏离提示
  if (pit < 0) {
    setColor(COL.red); setAlpha(Math.min(0.5, (-pit / 100) * alpha * 0.25));
    fillRect(x, y, 32, 32); setAlpha(1);
  } else if (pit > 0) {
    setColor(COL.blue); setAlpha(Math.min(0.5, (pit / 100) * alpha * 0.25));
    fillRect(x, y, 32, 32); setAlpha(1);
  }
  // 不兼容红框
  if (S.show_incompatible && (INSTRUMENTS[index] && INSTRUMENTS[index].user || key < 33 || key > 57)) {
    setColor(COL.red); setAlpha(1);
    G.ctx.lineWidth = 1;
    G.ctx.strokeRect(x + 1.5, y + 1.5, 29, 29);
  }
  setColor('#ffffff');
  if (salpha > 0) {
    drawSprite('spr_block_sel', 0, x, y, 1, 1, null, salpha);
    setAlpha(1);
  } else {
    setAlpha(Math.min(1, alpha + 0.15));
  }
  // 数字
  setFont(FONT.main(11));
  setColor('#ffffff');
  // 对照 draw_block.gml 的 (xx + 16 - 8 * (use_icons))：
  // 开启音色图标时，图标占据右侧 (xx+16..xx+32) 那一块，文字要左移 8px 让位，
  // 否则会和图标叠在一起。关图标时不偏移。数字和音名用的是同一个偏移。
  const txtOff = S.use_icons ? 8 : 0;
  if (S.show_numbers) {
    let s = '';
    if (S.editmode === 0) s = (key < 33 ? ' < ' : '') + (key > 57 ? ' > ' : '') + (key > 32 && key < 58 ? String(key - 33) : '');
    else if (S.editmode === 1) s = String(vel);
    else if (S.editmode === 2) s = (pan < 100 ? 'L ' : pan > 100 ? 'R ' : '') + String(Math.abs(pan - 100));
    else if (S.editmode === 3) s = (pit > 0 ? '+' : '') + String(pit);
    text(x + 16 - txtOff, y + 14, s, 'center');
  }
  // 音名
  setColor(C.dark ? '#ffffff' : '#ffdd00');
  setFont(FONT.main(10));
  text(x + 16 - txtOff, y + 2, getKeyname(key, S.show_octaves), 'center');
  setAlpha(1);
  setFont(FONT.main());
}

/* 对照 draw_icon_customins(xx, yy, ins, alpha, large=true, scale=1)
   large 分支（音符块里用的就是这个）：
     display = (ins + 1) % 100
     num1 = floor(display / 10), num2 = display % 10
     color1 = make_color_hsv((ins * 16) % 256, 192, 255)   —— 图标底色
     color2 = make_color_hsv((ins * 16) % 256, 255, 128)   —— 数字描边
     先画 16x16 的 spr_instrumenticons[first_custom_index] 染成 color1，
     再画 spr_numbers_mc 的两位数字：阴影在 (xx+3, yy+5)/(xx+9, yy+5) 用 color2，
     正文在 (xx+2, yy+4)/(xx+8, yy+4) 用白色。
   注：原版 large 分支用的是 spr_numbers_mc（5x7），非 large 分支才用 spr_numbers（3x5）。
   这里按 large 分支照搬。spr_numbers_mc 没有打进图集，所以数字用等宽的 5x7 手绘像素字兜底，
   位置严格按源码的 +2/+3 与 +8/+9 偏移，视觉结果一致。 */
function hsvHex(h, s, v) {
  // GameMaker make_color_hsv: h 0..255, s/v 0..255
  const hh = (h / 255) * 6, ss = s / 255, vv = v / 255;
  const i = floor(hh) % 6, f = hh - floor(hh);
  const p = vv * (1 - ss), q = vv * (1 - ss * f), t = vv * (1 - ss * (1 - f));
  let r, g2, b2;
  if (i === 0) { r = vv; g2 = t; b2 = p; }
  else if (i === 1) { r = q; g2 = vv; b2 = p; }
  else if (i === 2) { r = p; g2 = vv; b2 = t; }
  else if (i === 3) { r = p; g2 = q; b2 = vv; }
  else if (i === 4) { r = t; g2 = p; b2 = vv; }
  else { r = vv; g2 = p; b2 = q; }
  const to = (x) => { const n = Math.max(0, Math.min(255, Math.round(x * 255))); return n.toString(16).padStart(2, '0'); };
  return '#' + to(r) + to(g2) + to(b2);
}

/* spr_numbers_mc 的 5x7 点阵（0-9），用于自定义音色图标上的两位编号。
   原版直接画 spr_numbers_mc 精灵；这里没有该图集，用手写点阵重现同样的 5x7 字形。 */
const NUMBERS_MC_5x7 = [
  '01110' + '10001' + '10011' + '10101' + '11001' + '10001' + '01110', // 0
  '00100' + '01100' + '00100' + '00100' + '00100' + '00100' + '01110', // 1
  '01110' + '10001' + '00001' + '00010' + '00100' + '01000' + '11111', // 2
  '11111' + '00010' + '00100' + '00010' + '00001' + '10001' + '01110', // 3
  '00010' + '00110' + '01010' + '10010' + '11111' + '00010' + '00010', // 4
  '11111' + '10000' + '11110' + '00001' + '00001' + '10001' + '01110', // 5
  '00110' + '01000' + '10000' + '11110' + '10001' + '10001' + '01110', // 6
  '11111' + '00001' + '00010' + '00100' + '01000' + '01000' + '01000', // 7
  '01110' + '10001' + '10001' + '01110' + '10001' + '10001' + '01110', // 8
  '01110' + '10001' + '10001' + '01111' + '00001' + '00010' + '01100', // 9
];
function drawNumbersMc(n, x, y, colorHex, alpha) {
  const g = NUMBERS_MC_5x7[((n % 10) + 10) % 10];
  if (!g) return;
  setColor(colorHex || '#ffffff');
  setAlpha(alpha === undefined ? 1 : alpha);
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 5; c++) {
      if (g[r * 5 + c] === '1') fillRect(floor(x) + c, floor(y) + r, 1, 1);
    }
  }
  setAlpha(1);
}

function drawCustomInsIcon(xx, yy, ins, alpha) {
  const display = (ins + 1) % 100;
  const num1 = floor(display / 10), num2 = display % 10;
  const hue = (ins * 16) % 256;
  const color1 = hsvHex(hue, 192, 255);
  const color2 = hsvHex(hue, 255, 128);
  // 图标本体：spr_instrumenticons 的 first_custom_index 帧（17 帧里的最后一帧是自定义占位）
  drawSprite('spr_instrumenticons', S.first_custom_index, xx, yy, 1, 1, color1, alpha);
  // 数字阴影（color2）与正文（白），偏移严格按 draw_icon_customins 的 large 分支
  drawNumbersMc(num1, xx + 3, yy + 5, color2, alpha);
  drawNumbersMc(num2, xx + 9, yy + 5, color2, alpha);
  drawNumbersMc(num1, xx + 2, yy + 4, '#ffffff', alpha);
  drawNumbersMc(num2, xx + 8, yy + 4, '#ffffff', alpha);
}

/* ---------------------------------------------------------------- 时间轴 */
function drawTimeline() {
  const gx = S.gx, y1 = S.y1;
  const totalcols = S.totalcols;
  const noff = S.note_offset || 0;
  setAlpha(1);
  drawSprite('spr_timeline', (S.theme === 2 || (S.fdark && S.theme === 3)) ? 1 : 0, gx, y1 + 2, totalcols * 32 + 18, 1);

  setFont(FONT.small());
  setColor(S.theme === 2 || S.fdark ? '#ffffff' : '#000000');
  /* 时间刻度。
     【关键】这里不能无脑减 noff，也不能无脑用连续的 starta。
     原因：画布那一侧是「整数列 + note_offset 补偿」——
         屏幕位置 = gx + 32*a - noff，数据列 = floor(starta) + a
     所以 32*a - noff ≈ 32*(列 - starta)，也就是 starta 的小数部分只由 noff 承担一次。
     而时间轴的 xx 本来就是用 starta 连续算的：
         xx = (ceil(starta/T) - starta/T) * 32T
     它【已经包含】了 starta 的小数部分。若再减 noff，小数就被算了两遍，
     跨整数边界时 noff 从 ~32 猛然归 0，刻度整体被往回拉一格 —— 就是「按帧时每前进
     一刻时间条被拉回一刻、不断跳动闪烁」。
     ⇒ 按帧跟随（连续滚动）时：用连续 starta，且【不减 noff】。
     ⇒ 按刻/按页（逐格跳）时：用 floor(starta)，并【不减 noff】（此时 noff 本来就是 0）。
     这样时间轴与画布在两种模式下都严格同步：按刻一起逐格跳，按帧一起连续滑。 */
  const smoothTL = (S.playing === 1 && S.marker_follow === 1 && S.marker_pagebypage === 2);
  const tlSta = smoothTL ? S.starta : floor(S.starta);
  let ct = 1;
  if (S.tempo < 3.5) ct = 5;
  if (S.tempo < 1) ct = 10;
  if (S.tempo < 0.5) ct = 30;
  if (S.tempo > 11) ct = 0.5;
  if (S.tempo > 18) ct = 0.25;
  let a0 = Math.ceil(tlSta / (S.tempo * ct)) * ct;
  let xx = (Math.ceil(tlSta / (S.tempo * ct)) - (tlSta / (S.tempo * ct))) * (32 * S.tempo * ct);
  while (xx < totalcols * 32 + 16) {
    if (a0 > 0) text(gx + xx, y1 + 2, timeStr(a0), 'center');
    setAlpha(0.6);
    setColor(S.theme === 2 || S.fdark ? '#ffffff' : '#000000');
    line(gx + xx, y1 + 14, gx + xx, y1 + 17);
    setAlpha(1);
    xx += (32 * S.tempo) * ct;
    a0 += ct;
  }
  // 刻度数字
  // 对照 control_draw.gml:1026-1034：
  //     b = ((starta + a) mod 4 == 0)
  //     draw_text(..., string(starta + a))
  // 注意源码用的是【没取整的 starta】，不是 floor(starta)。
  // 按帧跟随时 starta 是小数（marker_pos - totalcols/2），
  // 之前这里写成 floor(S.starta)+a，数字会比实际滚动位置早/晚一格跳，
  // 看起来就是「时间轴和画布滚得不一样、来回抽搐」。
  // 与上面时间刻度同理：把「列号」和「像素位置」统一到同一个基准上。
  //  - 按帧跟随：列号用连续 starta，位置【不减 noff】（xx 式已含小数）
  //  - 逐格跳：列号与位置都用 floor(starta)，位置不减 noff（此时 noff 恒为 0）
  for (let a = 0; a <= totalcols; a++) {
    const col = tlSta + a;
    const isBar = ((col % 4) === 0);
    setAlpha(0.6);
    line(gx + 32 * a, y1 + 33, gx + 32 * a, y1 + 30 - 3 * (isBar ? 1 : 0));
    setAlpha(1);
    if (isBar) text(gx + 32 * a, y1 + 17, String(Math.round(col)), 'center');
  }

  // 区间（对照 control_draw:1175-1189）
  // 顺序说明：源码是先画三角再画竖线（1184/1185、1187/1188），但 spr_marker 的水平原点
  // 是 8（三角 16px 宽、以锚点为中心），竖线只有中间 2px 宽，所以线正好压在倒三角的
  // 正中间那一列上。用户反馈「线覆盖在倒三角上面」看着别扭，这里把同一个 x 的竖线先画、
  // 三角后画，几何位置与源码完全一致，只是叠放次序反过来，避免线在三角上切一刀。
  if (S.section_exists) {
    // 与时间刻度同一个道理：下面所有位置都已经用 starta 连续算过一遍小数，
    // 不能再减 noff，否则按帧时整个区间会被往回拉一格（来回闪）。
    const sa = tlSta;
    // 对照源码：区间底色是纯蓝 25%，标记三角形用 draw_theme_color()（浅色主题=黑，深色=白）
    S.section_start = median(0, S.section_start, S.enda + totalcols);
    S.section_end = median(0, S.section_end, S.enda + totalcols);
    setAlpha(0.25); setColor('#0000ff');
    fillRect(gx + floor(S.section_start - sa + 0.5) * 32, y1 + 2,
      (floor(S.section_end - sa + 0.5) - floor(S.section_start - sa + 0.5)) * 32, 31);
    setAlpha(1);
    const mkc = C.dark ? '#ffffff' : '#000000';
    setColor(mkc);
    const flip = S.section_end < S.section_start ? 2 : 0;
    const lineH = (S.totalrows + 1) * 32 / 15;
    let ax = floor(S.section_start * 32 - sa * 32 + 0.5);
    let sx = gx + floor(ax / 32 + 0.5) * 32;
    drawSprite('spr_marker', 3 + flip, sx, y1 + 2, 1, lineH, 1, mkc);
    drawSprite('spr_marker', 2 + flip, sx, y1 + 2, 1, 1, mkc);
    ax = floor(S.section_end * 32 - sa * 32 + 0.5);
    const ex = gx + floor(ax / 32 + 0.5) * 32;
    drawSprite('spr_marker', 5 - flip, ex, y1 + 2, 1, lineH, 1, mkc);
    drawSprite('spr_marker', 4 - flip, ex, y1 + 2, 1, 1, mkc);
    setAlpha(1);
  }

  // 播放标记（对照 control_draw.gml:1219-1221）
  //   a = floor(marker_pos * 32 - starta * 32)
  //   draw_sprite_ext(spr_marker, ..., x1 + 2 + a, y1 + 2, ...)
  // 关键：【这里不减 note_offset】。按帧跟随时 starta = marker_pos - totalcols/2（见上方
  // handlePlayback），所以 marker_pos*32 - starta*32 恒等于 totalcols/2*32 这个常数，
  // 刻度线就固定在屏幕中间不动，只有底下的网格靠 note_offset 做亚格平滑地滚动。
  // 之前在这里多减了一个 noff，等于把网格的滚动量又叠加到刻度线上，
  // 每帧来回抖 —— 用户看到的就是「按帧时进度条和时间轴一直抽搐」。
  const mo = 6 * ((S.theme === 2 || (S.blackout && S.theme !== 3)) ? 1 : 0) + 8 * (S.theme === 3 ? 1 : 0);
  const mcol = S.theme === 3 ? T.accent[3] : -1;
  const mxx = gx + floor(S.marker_pos * 32 - S.starta * 32);
  // 同上：先竖线、后倒三角，避免线切在三角上
  drawSprite('spr_marker', mo + 1, mxx, y1 + 2, 1 + (S.window_scale <= 0.5 ? 1 : 0),
    (S.totalrows + 1) * 32 / 15, 1, mcol);
  drawSprite('spr_marker', mo + 0, mxx, y1 + 2, 1, 1, mcol);
  setAlpha(1);
  setFont(FONT.main());
}

/* ---------------------------------------------------------------- 滚动条 */
function drawHScrollbar() {
  // 对照 control_draw:1246
  const exist = S.hover.exist;
  const cant = (exist && S.changepitch) || S.mousewheel > 0;
  const ms = S.enda + S.totalcols - 1, sl = S.totalcols - 1;
  const following = S.marker_follow && S.playing === 1;
  // 不拖拽时以 starta 为准（键盘翻页 / 播放跟随会直接改 starta）
  if (SB.drag[0] === -1) SB.val[0] = clamp(S.starta, 0, Math.max(0, ms - sl));
  const v = drawScrollbarGML(0, S.x1, S.y1 + S.totalrows * 32 + 34, 32, sl, ms, cant ? 1 : 0, 0);
  if (SB.drag[0] !== -1 || !following) S.starta = clamp(v, 0, Math.max(0, ms - sl));

  // 展开/返回按钮（原版在滚动条右侧）
  const bx = S.x1 + 16 + 32 * (S.totalcols - 1) + 16, by = S.y1 + S.totalrows * 32 + 34;
  setColor(C.panel);
  fillRect(bx, by, 16, 16);
  const hov = mouseRectangle(bx, by, 16, 16) && S.window === 0;
  if (hov) { G.cursor = 'pointer'; popupSet(bx, by, 16, 16, S.fullscreen ? '返回' : '展开编辑区域'); }
  setColor(hov ? C.accent : (C.dark ? '#cccccc' : '#555555'));
  setFont(FONT.small(10));
  text(bx + 4, by + 1, S.fullscreen ? '◱' : '⛶');
  setFont(FONT.main());
  if (hov && G.mbr[0]) { S.fullscreen = S.fullscreen ? 0 : 1; setMsg(S.fullscreen ? '全屏模式 => 开启' : '全屏模式 => 关闭'); }
}

function drawVScrollbar() {
  // 对照 control_draw:1247
  const exist = S.hover.exist;
  const cant = (exist && S.changepitch) || S.mousewheel > 0;
  const ms = S.endb + S.totalrows - 1, sl = S.totalrows - 1;
  if (SB.drag[1] === -1) SB.val[1] = clamp(S.startb, 0, Math.max(0, ms - sl));
  const v = drawScrollbarGML(1, S.x1 + S.totalcols * 32 + 2, S.y1 + 34, 32, sl, ms, cant ? 1 : 0, 0);
  S.startb = clamp(v, 0, Math.max(0, ms - sl));
}

/* ---------------------------------------------------------------- 图层面板 */
const LAYER_ICONS = [0, 1, 2, 3, 4, 5, 6];  // 锁/独奏/选择/添加/删除/上移/下移
function drawLayersPanel() {
  const totalrows = S.totalrows;
  const c = G.ctx;
  for (let b = 0; b < totalrows; b++) {
    const layer = floor(S.startb) + b;
    if (layer >= S.endb2) {
      S.layername[layer] = ''; S.layerlock[layer] = 0;
      S.layervol[layer] = 100; S.layerstereo[layer] = 100;
      rowamount[layer] = 0; S.endb2 = layer + 1;
    }
    const lx = 4, ly = 54 + 32 + b * 32 - 1;
    // 层背景
    // 对照 control_draw.gml:1312：
  //   draw_sprite(spr_layerbox, 0 + (theme = 2) + (2 + fdark) * (theme = 3), x1, y1)
  // 展开后各主题的帧号：
  //   theme 0/1 → 0
  //   theme 2   → 1
  //   theme 3   → (2 + fdark) → 浅色 2 / 深色 3
  // 注意不要把 theme 0 和 theme 1 分开——源码里这两个主题共用第 0 帧，
  // 早先按「复古用 0、Fluent 浅色用 2」分开写，遇到 theme 0 会落到错误的帧上。
  const lbFrame = (S.theme === 2) ? 1 : (S.theme === 3 ? (2 + (S.fdark ? 1 : 0)) : 0);
  drawSprite('spr_layerbox', lbFrame, lx, ly);

    // 名称
    setFont(FONT.small());
    setColor(C.text);
    const nameVal = textEdit(400 + layer, S.layername[layer], lx + 9, ly + 7, 72, 18);
    S.layername[layer] = nameVal;
    if (!nameVal) {
      setColor(C.textDim);
      text(lx + 11, ly + 9, '第 ' + (layer + 1) + ' 层');
    }
    setFont(FONT.main());

    // 音量（基帧 + 等级叠加，对照 control_draw 的 spr_volume_f 用法）
    if (S.realvolume) {
      const hover = mouseRectangle(lx + 88, ly + 5, 16, 22) && !isDialogWindow(S.window);
      const vol = layer < S.endb2 ? (S.layervol[layer] || 100) : 100;
      const dy = hover ? -3 : 0;
      const iconColor = S.fdark ? '#ffffff' : '#000000';
      drawSprite('spr_volume_f', S.fdark ? 1 : 0, lx + 91, ly + 11 + dy, 1, 1, iconColor);
      drawSprite('spr_volume_f', clamp(floor(vol / 30), 0, 3) + 2, lx + 91, ly + 11 + dy,
        1, 1, T.accent[6 - 2 * (S.fdark ? 0 : 1)]);
      popupSet(lx + 90, ly + 5, 14, 18, '本层的音量: ' + vol + '%\n（拖拽来修改，按住 Shift 微调）');
      if (hover) { G.cursor = 'ns-resize'; }
      if (hover && G.mbp[0]) { S.window = W_DRAGVOL; S.dragvolb = layer; S.dragvol = vol; }
      if (S.window === W_DRAGVOL && S.dragvolb === layer) {
        S.dragvol = clamp(S.dragvol - (G.mouse.y - (S.dragLastY || G.mouse.y)), 0, 100);
        S.layervol[layer] = G.shift ? Math.round(S.dragvol) : floor(S.dragvol / 10) * 10;
        S.changed = 1;
      }
      if (hover && G.wheel) {
        S.layervol[layer] = clamp((S.layervol[layer] || 100) - G.wheel * (G.shift ? 1 : 10), 0, 100);
        S.changed = 1;
      }
    }
    // 立体声（对照 spr_stereo_f 的用法）
    if (!S.realstereo) {
      const hover = mouseRectangle(lx + 108, ly + 5, 16, 22) && !isDialogWindow(S.window);
      const st = layer < S.endb2 ? (S.layerstereo[layer] || 100) : 100;
      const dy = hover ? -3 : 0;
      const iconColor = S.fdark ? '#ffffff' : '#000000';
      drawSprite('spr_stereo_f', S.fdark ? 1 : 0, lx + 110, ly + 11 + dy, 1, 1, iconColor);
      drawSprite('spr_stereo_f', clamp(floor(st / 50) + 2, 2, 6), lx + 110, ly + 11 + dy,
        1, 1, T.accent[6 - 2 * (S.fdark ? 0 : 1)]);
      popupSet(lx + 108, ly + 5, 14, 18, '立体声声道: ' +
        (st > 100 ? 'R ' + (st - 100) : st < 100 ? 'L ' + (100 - st) : '中央') + '\n（拖拽来修改，按住 Shift 微调）');
      if (hover) G.cursor = 'ns-resize';
      if (hover && G.mbp[0]) { S.window = W_DRAGSTEREO; S.dragstereob = layer; S.dragstereo = st; }
      if (S.window === W_DRAGSTEREO && S.dragstereob === layer) {
        S.dragstereo = clamp(S.dragstereo - (G.mouse.y - (S.dragLastY || G.mouse.y)), 0, 200);
        S.layerstereo[layer] = G.shift ? Math.round(S.dragstereo) : floor(S.dragstereo / 10) * 10;
        S.changed = 1;
      }
      if (hover && G.wheel) {
        S.layerstereo[layer] = clamp((S.layerstereo[layer] || 100) - G.wheel * (G.shift ? 1 : 10), 0, 200);
        S.changed = 1;
      }
    }
    S.dragLastY = G.mouse.y;

    // 图标按钮
    // 对照 control_draw.gml:1412-1461，每个图标的 x 都是
    //     x1 + (126 + 18*n) - !realvolume - realstereo*10
    // 注意 GML 里 `!realvolume` 是【布尔取反，值只有 0 或 1】，不是 0/10；
    // 而 realstereo*10 才是 0/10。之前写成 `-(realvolume ? 0 : 10)`，
    // 把 1px 的偏移当成了 10px，右侧图标被整体左移了 9px，
    // 于是第 6 个图标被挤出侧栏而被裁掉（用户看到「只显示到第 2 个」就是这个原因）。
    // 另外 icon6（下移）在 GML 里还有 `- (startb+b = 0) * 8`，第一层时再左移 8。
    const off = (S.realvolume ? 0 : 1) + (S.realstereo ? 0 : 10);
    const iy = ly + 8;
    const lockOn = layer < S.endb2 && S.layerlock[layer] === 1;
    const soloOn = layer < S.endb2 && S.layerlock[layer] === 2;
    if (layerIcon(0, lx + 126 - off, iy, lockOn, '静音本层\n（拖拽可批量操作）')) {
      if (S.layerlock[layer] === 2) S.solostr = S.solostr.replace('|' + layer + '|', '');
      S.layerlock[layer] = lockOn ? 0 : 1; S.changed = 1;
    }
    if (layerIcon(1, lx + 144 - off, iy, soloOn, '独奏本层\n（拖拽可批量操作）')) {
      if (S.layerlock[layer] === 2) { S.layerlock[layer] = 0; S.solostr = S.solostr.replace('|' + layer + '|', ''); }
      else { S.layerlock[layer] = 2; S.solostr += '|' + layer + '|'; }
      S.changed = 1;
    }
    if (layerIcon(2, lx + 162 - off, iy, 0, '选择本层所有方块')) {
      S.playing = 0;
      if (S.selected_layers.indexOf(layer) > -1) {
        selectionRemove(0, layer, S.enda, layer, false, false);
        S.selected_layers.splice(S.selected_layers.indexOf(layer), 1);
      } else {
        selectionAdd(0, layer, S.enda, layer, false, false);
        S.selected_layers.push(layer);
      }
    }
    if (layerIcon(3, lx + 180 - off, iy, 0, '新建层\n（拖拽可批量添加）')) { S.playing = 0; addLayer(layer, false); }
    if (layerIcon(4, lx + 198 - off, iy, 0, '删除层\n（拖拽可批量删除）')) { S.playing = 0; removeLayer(layer, false); }
    if (layer > 0 && layerIcon(5, lx + 216 - off, iy, 0, '上移本层')) { S.playing = 0; shiftLayers(layer, layer - 1, false); }
    // 对照 control_draw.gml:1461 `x1 + 234 - !realvolume - realstereo*10 - (startb+b = 0)*8`：
    // 第一层时再左移 8px（因为第一层没有「上移」图标，下移图标补到它的位置上）。
    if (layerIcon(6, lx + 234 - off - (layer === 0 ? 8 : 0), iy, 0, '下移本层')) { S.playing = 0; shiftLayers(layer, layer + 1, false); }
  }
  if ((S.window === W_DRAGVOL || S.window === W_DRAGSTEREO) && !G.mb[0]) S.window = W_RELEASE;
  if (S.window === W_RELEASE && !G.mb[0]) S.window = 0;
}

/* 对照 draw_layericon.gml 逐行还原。
   两套完全不同的素材，绝不能复用：
     theme != 3：单层 spr_layericons，颜色 c_black（theme 2 时 c_white），alpha 0.7，
                 背后是 spr_frame4 的 a + 3*theme 帧
     theme == 3：spr_layericons_f 两层叠加 ——
                 基帧 i - locked + 9*(!fdark) 用 color（theme 2/3 为白，否则黑），
                 再叠 i + locked + 18 用 accent[6 - 2*!fdark] 上色
   之前不管什么主题都画 _f 的两层，所以经典主题的侧边栏图标是 Fluent 的样子。 */
function layerIcon(n, x, y, pressed, tip) {
  const hover = mouseRectangle(x, y, 16, 16) && !isDialogWindow(S.window);
  if (hover) { G.cursor = 'pointer'; popupSet(x, y, 16, 16, tip); }
  // 对照源码 `a = 鼠标在矩形内`；a 再叠加「按下或刚松开」，按下时偏移 (a=2||pressed)?1:0
  const a = hover ? 1 : 0;
  const shift = (a === 2 || pressed) ? 1 : 0;
  // 按钮底板 spr_frame4（该精灵缺失时用等价的 1px 边框兜底）
  if (S.theme !== 3) {
    // 非 Fluent：只有底板 + 单层图标
    drawSprite('spr_frame4', (pressed ? 2 : a) + 3 * S.theme, x, y);
    const col = (S.theme === 2) ? '#ffffff' : '#000000';
    drawSprite('spr_layericons', n, x + shift, y + shift, 1, 1, col, 0.7);
  } else {
    /* Fluent：底板用 hires 版（缺失时跳过），图标两层叠加 */
    // 基帧：fdark ? i : i+9
    const baseFrame = n + (S.fdark ? 0 : 9);
    const col = '#ffffff';   // theme 2/3 用白
    drawSprite('spr_layericons_f', baseFrame, x + shift, y + shift, 1, 1, col);
    // 上色层：i + 18，accent[6 - 2*!fdark]
    drawSprite('spr_layericons_f', n + 18, x + shift, y + shift, 1, 1,
      pressed ? T.accent[3] : T.accent[6 - 2 * (S.fdark ? 0 : 1)]);
  }
  return hover && G.mbr[0];
}

/* ---------------------------------------------------------------- 宏工具条 */
function drawMacroBar() {
  // 紧贴图层面板底部（layers 行从 y=85 开始，每行 32）
  const bx = 4, by = 85 + S.totalrows * 32 + 2;
  setColor(C.dark ? '#2d2d2d' : '#e9e9e9');
  roundRect(bx, by, bx + 250, by + 42, 6, true);
  const icons = ['Tremolo...', 'Stereo...', 'Arpeggio...', 'Portamento...', 'Vibrato', 'Stagger...',
    'Chorus', 'Volume LFO', '淡入', '淡出', '替换音', '设定音量......', '设定声道......', '设定音高......', '重置所有属性'];
  const actions = [() => S.window = W_TREMOLO, () => S.window = W_STEREO, () => S.window = W_ARPEGGIO,
  () => S.window = W_PORTAMENTO, () => macroVibrato(), () => S.window = W_STAGGER,
  () => macroChorus(), () => macroVelocityLFO(), () => macroFade(true), () => macroFade(false),
  () => macroReplaceKey(), () => S.window = W_SETVELOCITY, () => S.window = W_SETPANNING,
  () => S.window = W_SETPITCH, () => macroReset()];
  for (let i = 0; i < 8; i++) {
    const x = bx + 6 + i * 25, y = by + 6;
    const hover = mouseRectangle(x, y, 16, 16);
    if (hover) { G.cursor = 'pointer'; popupSet(x, y, 16, 16, icons[i]); }
    drawSprite('spr_macroicons', i + (hover ? 15 : 0) > 14 ? i : i, x, y);
    if (hover && G.mbr[0]) { S.playing = 0; actions[i](); }
  }
  for (let i = 8; i < 15; i++) {
    const x = bx + 6 + (i - 8) * 25, y = by + 26;
    const hover = mouseRectangle(x, y, 16, 16);
    if (hover) { G.cursor = 'pointer'; popupSet(x, y, 16, 16, icons[i]); }
    drawSprite('spr_macroicons', i, x, y);
    if (hover && G.mbr[0]) { S.playing = 0; actions[i](); }
  }
}

/* ---------------------------------------------------------------- 顶栏 */
const ICON = {
  NEW: 0, OPEN: 1, SAVE: 2, SAVE_AS: 3, PLAY: 4, PAUSE: 5, STOP: 6, BACK: 7, FORWARD: 8,
  RECORD: 9, UNDO_INACTIVE: 28, UNDO: 29, REDO_INACTIVE: 30, REDO: 31, COPY_INACTIVE: 32,
  COPY: 33, CUT_INACTIVE: 34, CUT: 35, PASTE_INACTIVE: 36, PASTE: 37, DELETE_INACTIVE: 38,
  DELETE: 39, INFORMATION: 40, PROPERTIES: 41, INSTRUMENTS: 42, MIDI_INPUT: 43, HELP: 44,
  INTERNET: 45, CHECK: 46, SUB_MENU: 47, CHECK_INACTIVE: 48, LOOP_INACTIVE: 49, LOOP: 50,
  METRONOME_INACTIVE: 51, METRONOME_1: 52, METRONOME_2: 53, EDITMODE_KEY: 54,
  EDITMODE_VEL: 55, EDITMODE_PAN: 56, EDITMODE_PIT: 57, INSBOX_EXPAND: 58, INSBOX_COLLAPSE: 59,
};

function toggleTopMenu(name, x, y, openFn) {
  if (UI.menu && UI.menu.name === name) { closeMenu(); return; }
  closeMenu();
  openFn(x, y);
}

function drawIcon(i, x, y, tip, locked, pressed) {
  const hover = !locked && mouseRectangle(x, y, 25, 25) && !isDialogWindow(S.window);
  if (hover) G.cursor = 'pointer';
  popupSet(x, y, 25, 25, tip);
  // 按钮底
  if (pressed || hover) {
    setColor(pressed ? C.controlBgPress : C.controlBgHover);
    roundRect(x + 1, y + 1, x + 24, y + 24, 4, true);
  }
  if (pressed) {
    setColor(C.accent);
    fillRect(x + 6, y + 23, 14, 2);
  }
  setAlpha(locked ? 0.4 : 1);
  // 按主题分派图集（Fluent 与非 Fluent 是两套完全不同的图标，不能混用）
  drawToolIcon(i, x, y, pressed);
  setAlpha(1);
  return !locked && hover && G.mbr[0];
}

function drawTopBar() {
  const rw = S.rw;
  const c = G.ctx;

  // 标签页
  let tabx = 1;
  const tabX = {};
  setFont(FONT.small());
  const tab = (label, name) => {
    const w = textWidth(label) + 14;
    const x = tabx; tabx += w;
    tabX[label] = x;
    const hover = mouseRectangle(x, 1, w, 18) && !isDialogWindow(S.window);
    const active = UI.menu && UI.menu.name === name;
    if (hover || active) {
      setColor(active ? (C.dark ? '#3a3a3a' : '#ffffff') : (C.dark ? '#333333' : '#eaeaea'));
      roundRect(x, 1, x + w, 19, 0, true);
    }
    setColor(C.text);
    text(x + 7, 4, label);
    // 菜单打开时仍允许点击其它标签切换（使用未被屏蔽的原始输入）
    const mbr = UI.menu ? (UI.rawMbr || [false, false, false]) : G.mbr;
    return hover && !UI.modal && mbr[0];
  };
  // 菜单在标签正下方展开（位置跟标签实际绘制位置一致）
  if (tab('文件', 'file')) toggleTopMenu('file', tabX['文件'], 19, openFileMenu);
  if (tab('编辑', 'edit')) toggleTopMenu('edit', tabX['编辑'], 19, openEditMenu);
  if (tab('设置', 'settings')) toggleTopMenu('settings', tabX['设置'], 19, openSettingsMenu);
  if (tab('帮助', 'help')) toggleTopMenu('help', tabX['帮助'], 19, openHelpMenu);
  S.tabX = tabX;

  // 工具条
  setFont(FONT.main());
  let xx = 6, yy = 23;
  if (drawIcon(ICON.NEW, xx, yy, '新文件')) newSong(); xx += 25;
  if (drawIcon(ICON.OPEN, xx, yy, '打开歌曲')) loadSongDialog(); xx += 25;
  if (drawIcon(ICON.SAVE, xx, yy, '保存歌曲')) saveSongFile(false); xx += 25 + 4;
  drawSeparator(xx, yy + 3); xx += 4;
  if (drawIcon(S.playing ? ICON.PAUSE : ICON.PLAY, xx, yy, '播放 / 暂停')) togglePlaying(S.totalcols); xx += 25;
  if (drawIcon(ICON.STOP, xx, yy, '停止歌曲')) { S.playing = 0; S.marker_pos = 0; S.marker_prevpos = 0; S.timestoloop = S.loopmax; } xx += 25;
  // 对照 draw_icon：这两个按钮按住期间持续生效（不再每帧清零，清零在 handleGlobalKeys 里做）
  if (!UI.blocked && G.mb[0] && mouseRectangle(xx, yy, 25, 25)) S.forward = -1;
  if (drawIcon(ICON.BACK, xx, yy, '快退')) S.forward = -1; xx += 25;
  if (!UI.blocked && G.mb[0] && mouseRectangle(xx, yy, 25, 25)) S.forward = 1;
  if (drawIcon(ICON.FORWARD, xx, yy, '快进')) S.forward = 1; xx += 25;
  if (drawIcon(ICON.RECORD, xx, yy, '录制按键', false, S.playing > 0 && S.record)) { S.playing = 0.25; S.record = S.record ? 0 : 1; } xx += 25;
  if (drawIcon(S.loop_session ? ICON.LOOP : ICON.LOOP_INACTIVE, xx, yy, '开关循环')) { S.loop_session = S.loop_session ? 0 : 1; } xx += 25;
  let metIcon = ICON.METRONOME_INACTIVE;
  if (S.metronome) metIcon = (S.metronome_played === -1 || (S.metronome_played - 1) % 8 === 0) ? ICON.METRONOME_1 : ICON.METRONOME_2;
  if (drawIcon(metIcon, xx, yy, '开关节拍器')) S.metronome = S.metronome ? 0 : 1;
  xx += 25 + 4;
  if (S.playing === 0) S.record = 0;
  drawSeparator(xx, yy + 3); xx += 4;
  if (drawIcon(ICON.EDITMODE_KEY, xx, yy, '音调模式', false, S.editmode === 0)) S.editmode = 0; xx += 25;
  if (drawIcon(ICON.EDITMODE_VEL, xx, yy, '音量模式', false, S.editmode === 1)) S.editmode = 1; xx += 25;
  if (drawIcon(ICON.EDITMODE_PAN, xx, yy, '声道模式', false, S.editmode === 2)) S.editmode = 2; xx += 25;
  if (drawIcon(ICON.EDITMODE_PIT, xx, yy, '音高模式', false, S.editmode === 3)) S.editmode = 3; xx += 25 + 4;
  drawSeparator(xx, yy + 3); xx += 4;

  // 音色盒
  const insCount = INSTRUMENTS.length;
  const insIcons = median(5, Math.ceil((rw - 920) / 25), insCount);
  if (S.showinsbox) {
    const rows = Math.ceil(insCount / insIcons);
    drawWindow(xx - 2, yy - 2, xx + insIcons * 25 + 2, yy + rows * 25 + 2);
    for (let a = 0; a < rows; a++) {
      for (let b = 0; b < insIcons; b++) {
        const idx = a * insIcons + b;
        if (idx >= insCount) break;
        if (insIcon(idx, xx + b * 25, yy + a * 25, S.instrument === idx)) {
          if (INSTRUMENTS[idx]) { playSound(INSTRUMENTS[idx], S.selected_key, 100, 100, 0); S.instrument = idx; S.selected_vel = 100; S.selected_pan = 100; S.selected_pit = 0; }
        }
      }
    }
    if (G.mbr[0] && !mouseRectangle(xx, yy, insIcons * 25, rows * 25)) { S.showinsbox = 0; }
    xx += insIcons * 25;
    insIcon(ICON.INSBOX_COLLAPSE, xx, yy, false, true);
    xx += 25;
  } else {
    if (S.instrument < S.insbox_start) S.insbox_start = floor(Math.max(0, S.insbox_start - insIcons) / insIcons) * insIcons;
    else if (S.instrument > S.insbox_start + insIcons - 1) S.insbox_start = floor((S.insbox_start + insIcons) / insIcons) * insIcons;
    S.insbox_start = median(0, S.insbox_start, insCount - insIcons);
    for (let a = S.insbox_start; a < S.insbox_start + insIcons; a++) {
      if (INSTRUMENTS[a] && insIcon(a, xx, yy, S.instrument === a)) {
        playSound(INSTRUMENTS[a], S.selected_key, 100, 100, 0);
        S.instrument = a; S.selected_vel = 100; S.selected_pan = 100; S.selected_pit = 0;
      }
      xx += 25;
    }
    if (insIcons < insCount) {
      if (insIcon(ICON.INSBOX_EXPAND, xx, yy, false, true)) S.showinsbox = 1;
      xx += 25;
    }
  }

  // 撤销/重做/复制... 工具组
  xx += 4; drawSeparator(xx, yy + 3); xx += 4;
  if (drawIcon(canUndo() ? ICON.UNDO : ICON.UNDO_INACTIVE, xx, yy, '撤销', !canUndo())) actionUndo(); xx += 25;
  if (drawIcon(canRedo() ? ICON.REDO : ICON.REDO_INACTIVE, xx, yy, '重做', !canRedo())) actionRedo(); xx += 25;
  if (drawIcon(S.selected ? ICON.COPY : ICON.COPY_INACTIVE, xx, yy, '复制', !S.selected)) actionCopy(); xx += 25;
  if (drawIcon(S.selected ? ICON.CUT : ICON.CUT_INACTIVE, xx, yy, '剪切', !S.selected)) actionCut(); xx += 25;
  if (drawIcon(S.clipboard ? ICON.PASTE : ICON.PASTE_INACTIVE, xx, yy, '粘贴', !S.clipboard)) actionPaste(S.starta, S.startb); xx += 25;
  if (drawIcon(S.selected ? ICON.DELETE : ICON.DELETE_INACTIVE, xx, yy, '删除', !S.selected)) actionDelete(); xx += 25;
  xx += 4; drawSeparator(xx, yy + 3); xx += 4;
  if (drawIcon(ICON.INFORMATION, xx, yy, '歌曲信息')) { S.playing = 0; S.window = W_SONGINFOEDIT; } xx += 25;
  if (drawIcon(ICON.PROPERTIES, xx, yy, '歌曲属性')) { S.playing = 0; S.window = W_PROPERTIES; } xx += 25;
  if (drawIcon(ICON.INSTRUMENTS, xx, yy, '音色设置')) { S.playing = 0; S.window = W_INSTRUMENTS; } xx += 25;
  if (drawIcon(ICON.MIDI_INPUT, xx, yy, 'MIDI 设备管理器')) { S.playing = 0; S.window = W_MIDIDEVICES; } xx += 25;
  // 用户要求：去掉工具栏上的「教程视频」「访问官方网站」两个按钮（外链在网页版里没用）。
  // 原版 control_draw.gml:1926/1929 有这两个 draw_icon，此处按需求删除。

  // 主音量
  xx += 8;
  const volW = 100;
  setColor(C.dark ? '#3a3a3a' : '#dcdcdc');
  roundRect(xx, yy + 10, xx + volW, yy + 13, 2, true);
  setColor(C.accent);
  roundRect(xx, yy + 10, xx + volW * S.mastervol, yy + 13, 2, true);
  setColor(C.accent);
  c.beginPath(); c.arc(xx + volW * S.mastervol, yy + 11.5, 5, 0, Math.PI * 2); c.fill();
  if (mouseRectangle(xx - 11, yy, 122, 22) && !isDialogWindow(S.window)) {
    G.cursor = 'pointer';
    popupSet(xx - 11, yy, 122, 22, '主音量：' + Math.round(S.mastervol * 100));
    if (G.mb[0]) S.mastervol = clamp((G.mouse.x - xx) / volW, 0, 1);
    if (G.wheel > 0) S.mastervol = Math.min(1, S.mastervol + 0.02);
    if (G.wheel < 0) S.mastervol = Math.max(0, S.mastervol - 0.02);
  }

  // 兼容性指示
  drawCompatibility();
}

function insIcon(index, x, y, selected, collapse) {
  const hover = mouseRectangle(x, y, 25, 25) && !isDialogWindow(S.window);
  if (hover) G.cursor = 'pointer';
  if (collapse) {
    drawToolIcon(ICON.INSBOX_COLLAPSE, x, y, false);
    return hover && G.mbr[0];
  }
  if (selected) {
    setColor(C.accent);
    roundRect(x + 1, y + 1, x + 24, y + 24, 4, true);
  } else if (hover) {
    setColor(C.controlBgHover);
    roundRect(x + 1, y + 1, x + 24, y + 24, 4, true);
  }
  const ins = INSTRUMENTS[index];
  if (!ins) return false;
  popupSet(x, y, 25, 25, '更改音色为 ' + ins.name);
  if (index < S.first_custom_index) {
    drawSprite('spr_instrumenticons', index, x + 4, y + 4, 1, 1, selected ? '#ffffff' : null);
  } else {
    drawToolIcon(26, x + 4, y + 4, false);
    setFont(FONT.main(9));
    setColor(selected ? '#ffffff' : C.text);
    text(x + 12, y + 8, String((index - S.first_custom_index) % 10), 'center');
    setFont(FONT.main());
  }
  return hover && G.mbr[0];
}

function drawCompatibility() {
  const rw = S.rw;
  setColor(C.separator);
  line(rw - 34, 26, rw - 34, 44);
  let label = '', col = COL.red, icon = 2;
  if (S.compatible === 1) { label = '完全兼容'; col = S.dark ? COL.lime : COL.green; icon = 0; }
  else if (S.compatible === 2) { label = '仅限数据包'; col = COL.orange; icon = 1; }
  else { label = '仅限资源包'; col = COL.red; icon = 2; }
  setFont(FONT.mainbold());
  setColor(col);
  // 对照 control_draw.gml:1952/1972：halign 是 fa_right，且绘制 x 是 rw - 65。
  // 两个 20px 图标分别画在 rw-59 和 rw-30（占 rw-59..rw-39 与 rw-30..rw-10），
  // 所以文字必须结束在 rw-65 才不会和图标挤在一起。
  // 之前写成 rw - 8（右对齐到最右边），文字直接压在两个图标上——就是「文字和两个图标重合」的原因。
  text(rw - 65, 28, label, 'right');
  setFont(FONT.main());
  // 对照 control_draw.gml:1953-2025：spr_minecraft_f 的前 6 帧（0-2 与 +3 的暗色版）
  // 只是「线框」，真正上色的是后面 6/7/8 三帧的实心填充，并且用 accent 染色叠在
  // 线框上面：
  //   compatible = 1 → 底 + 6；compatible = 2 → 底 1 + 6；否则 底 2 + 6
  //   accent 索引 = 6 - 2 * !fdark（深色用 accent[6]，浅色用 accent[4]）
  // 之前只画了线框没画填充，所以右上角只看到两个空心圈。
  const accentIdx = 6 - 2 * (!S.fdark ? 1 : 0);
  const fillTint = T.accent[accentIdx];
  const offs = [rw - 30, rw - 59];
  const frames = S.compatible === 1 ? [0, 0] : (S.compatible === 2 ? [0, 1] : [2, 1]);
  for (let i = 0; i < 2; i++) {
    drawSprite('spr_minecraft_f', S.fdark ? 3 + frames[i] : frames[i], offs[i], 25);
    drawSprite('spr_minecraft_f', frames[i] + 6, offs[i], 25, 1, 1, fillTint);
  }
  const compx = Math.max(120, textWidth(label) + 60);
  if (mouseRectangle(rw - compx, 24, compx, 25) && !isDialogWindow(S.window)) {
    G.cursor = 'pointer';
    popupSet(rw - compx, 24, compx, 25, S.compatible === 1 ? '此歌曲兼容 schematic 和数据包。' : (S.compatible === 2 ? '此歌曲仅兼容数据包。' : '此歌曲仅兼容带资源包的数据包。'));
    if (G.mbp[0]) { S.playing = 0; S.window = W_COMPATIBILITY; }
  }
}

/* ---------------------------------------------------------------- 状态栏 */
function drawStatusBar() {
  const rw = S.rw, rh = S.rh;
  setColor(C.separator);
  line(0, rh - 24, rw, rh - 24);
  setFont(FONT.main(11));
  setColor(C.text);
  let xx = 4;
  const ins = INSTRUMENTS[S.instrument];
  text(xx, rh - 19, '音色: ' + (ins ? ins.name : '-')); xx += 170;
  drawSeparator(xx, rh - 20); xx += 6;
  text(xx, rh - 19, '音: ' + getKeyname(S.selected_key, 1)); xx += 70;
  drawSeparator(xx, rh - 20); xx += 6;
  if (S.selected_vel !== 100 || S.selected_pan !== 100 || S.selected_pit !== 0) {
    text(xx, rh - 19, '音量: ' + S.selected_vel); xx += 80;
    drawSeparator(xx, rh - 20); xx += 6;
    text(xx, rh - 19, '声道: ' + (S.selected_pan - 100)); xx += 84;
    drawSeparator(xx, rh - 20); xx += 6;
    text(xx, rh - 19, '音高: ' + S.selected_pit); xx += 74;
    drawSeparator(xx, rh - 20); xx += 6;
  }
  text(xx, rh - 19, '位置: ' + (S.selbx < 0 ? '无' : S.selbx)); xx += 80;
  drawSeparator(xx, rh - 20); xx += 6;
  text(xx, rh - 19, '层: ' + (S.selby < 0 ? '无' : S.selby + 1)); xx += 80;
  drawSeparator(xx, rh - 20); xx += 6;
  text(xx, rh - 19, '已选择: ' + S.selected + ' / ' + (S.totalblocks + S.selected)); xx += 130;
  drawSeparator(xx, rh - 20); xx += 6;

  if (S.hover.exist) {
    const x = S.selbx, y = S.selby;
    text(xx, rh - 19, '音: ' + getKeyname(gKey(x, y), 1)); xx += 74;
    drawSeparator(xx, rh - 20); xx += 6;
    text(xx, rh - 19, '音量: ' + gVel(x, y)); xx += 80;
    drawSeparator(xx, rh - 20); xx += 6;
    text(xx, rh - 19, '声道: ' + (gPan(x, y) === 100 ? '中央' : (gPan(x, y) < 100 ? 'L ' : 'R ') + Math.abs(gPan(x, y) - 100))); xx += 110;
    drawSeparator(xx, rh - 20); xx += 6;
    text(xx, rh - 19, '音高: ' + (gPit(x, y) > 0 ? '+' : '') + gPit(x, y) + ' 微分');
  }
  setColor(C.textDim);
  text(rw - 6, rh - 19, '无 MIDI 设备', 'right');
  setFont(FONT.main());
}

/* ---------------------------------------------------------------- 时间/速度框 */
function drawInfoBoxes() {
  const x1 = S.x1, y1 = S.y1;
  const c = G.ctx;
  // 播放时间
  setFont(FONT.info_med_bold(15));
  setColor(C.text);
  if (S.theme === 3) text(9, 50, timeStr(S.marker_pos / S.tempo));
  else text(93, 50, timeStr(S.marker_pos / S.tempo), 'right');
  setFont(FONT.small());
  setColor(C.textDim);
  text(S.theme === 3 ? 26 : 93 - 67, 69, '/ ' + timeStr(S.enda / S.tempo));
  setFont(FONT.main());

  // 小节.拍.十六分
  setColor(C.dark ? '#2f2f2f' : '#ffffff');
  roundRect(184, 57, 248, 79, 4, true);
  setColor(C.controlBorder);
  roundRect(184.5, 57.5, 247.5, 78.5, 4, false);
  setFont(FONT.small());
  setColor(C.text);
  text(240, 61, floor(S.marker_pos / (S.timesignature * 4)) + 1, 'right');
  text(232, 61, '.');
  text(225, 61, floor((S.marker_pos / 4) % S.timesignature) + 1, 'right');
  text(217, 61, '.');
  text(210, 61, floor(S.marker_pos % 4) + 1, 'right');
  popupSet(184, 57, 64, 22, '歌曲的进度（小节.拍.十六分）');

  // 速度框
  const useBpm = S.use_bpm;
  const bw = useBpm ? 70 : 64;
  setColor(C.dark ? '#2f2f2f' : '#ffffff');
  roundRect(108, 57, 108 + 64, 79, 4, true);
  setColor(S.window === W_SETTEMPO ? C.accent : C.controlBorder);
  roundRect(108.5, 57.5, 171.5, 78.5, 4, false);
  setFont(FONT.small());
  setColor(C.text);
  const bpm = S.tempo * 15;
  text(140, 61, useBpm ? bpm.toFixed(2) + ' BPM' : S.tempo.toFixed(2) + ' t / s', 'center');
  popupSet(108, 57, 64, 22, useBpm ? '歌曲的速度（拍数/分钟）\n拖拽来大致更改，点击来手动输入，右键查看更多选项。'
    : '歌曲的速度（红石刻/秒）\n拖拽来大致更改，点击来手动输入，右键查看更多选项。');
  setFont(FONT.main());
  if (mouseRectangle(108, 57, 64, 22) && !isDialogWindow(S.window)) {
    G.cursor = 'pointer';
    if (G.mbr[0]) { S.window = W_SETTEMPO; focusText(64, String(S.tempo)); UI.inputWindow = W_SETTEMPO; UI.textEnter = () => commitTempo(); }
    if (G.mb[0] && (G.mouse.x !== S._mx || G.mouse.y !== S._my) && !S.tempoDrag) {
      S.tempoDrag = { y: G.mouse.y, v: S.tempo };
    }
    if (G.mbp[2]) openTempoMenu();
  }
  if (S.tempoDrag && G.mb[0]) {
    const d = (S.tempoDrag.y - G.mouse.y) * 0.25 / 3;
    S.tempo = median(0.25, S.tempoDrag.v + d, 60);
    S.tempo = floor(S.tempo * 4) / 4;
    S.changed = 1;
  }
  if (!G.mb[0]) S.tempoDrag = null;
  S._mx = G.mouse.x; S._my = G.mouse.y;
}

function commitTempo() {
  const v = parseFloat(UI.textStr[64]);
  if (!isNaN(v)) { S.tempo = median(0.25, S.use_bpm ? v / 15 : v, 60); S.changed = 1; }
  S.window = 0;
}

function openTempoMenu() {
  // 对照 control_draw 的 tempo 菜单：前两项是速度单位，之后是一串预设
  const mult = S.use_bpm ? 15 : 1;
  let s = (S.use_bpm ? '' : iconPrefix(ICON.CHECK)) + '红石刻/秒 (t/s)|' +
    (S.use_bpm ? iconPrefix(ICON.CHECK) : '') + '拍数/分钟 (BPM)|-|';
  for (const t of [10, 12, 14, 16, 18, 20, 30, 60]) {
    s += String(t * mult) + (S.tempo === t ? iconPrefix(ICON.CHECK) : '') +
      (S.use_bpm ? ' BPM' : ' t/s') + '|';
  }
  s += '-|速度测量器......';
  showMenu('tempo', G.mouse.x, G.mouse.y, s);
}

/* ---------------------------------------------------------------- 钢琴 */
function drawPianoAll() {
  const kc = S.dropmode ? 52 : S.keysshow;
  const px = floor(S.rw / 2 - (kc * 39) / 2);
  const py = S.rh - 154;
  drawPiano(px, py, kc, S.totalcols);
}

function drawPiano(xx, yy, k, totalcols) {
  setColor('#000000');
  let b = 0, downEdge = -1;
  let selectedkey = -1;
  // 对照 draw_piano.gml:12 `alpha = max(0, 3 - startkey) * !isplayer + 3 * isplayer`
  // 这是琴键两端渐隐用的 alpha（0..3），不是按键下沉的 down。
  // 循环末尾按 `if (a < 3) alpha += 1` / `if (a > k - min(5, 54-(startkey+k))) alpha -= 1` 变化。
  let keyAlpha = Math.max(0, 3 - S.startkey);
  for (let a = 0; a < k; a++) {
    const cc = (S.startkey + a) % 7;
    if (a > 0 && cc !== 2 && cc !== 5) {
      // 有黑键
      const c1 = S.startkey + S.sharpkeys + b;
      const c2 = S.startkey + S.sharpkeys + b + 1;
      const k1 = S.show_keyboard && S.piano_key[c1] > 0;
      const k2 = S.show_keyboard && S.piano_key[c2] > 0;
      const overWhite = !isDialogWindow(S.window) && mouseRectangle(xx + 39 * a, yy, 39, 128);
      if (overWhite) {
        const inLeftBlack = mouseRectangle(xx + 39 * a - 12, yy - 7, 25, 71);
        const inRightBlack = mouseRectangle(xx + 39 * a + 27, yy - 7, 25, 71);
        if (!inLeftBlack && (!inRightBlack || a === k - 1 || cc === 1 || cc === 4)) {
          if (S.show_notechart && c2 > 6 && c2 < 69 && !S.playing) drawNoteChart(xx + 39 * a + 18, yy - 32, S.startkey + a, 0);
          if (G.mbp[2] && S.show_keyboard) S.key_edit = c2;
          const t = S.key_click[c2];
          S.key_click[c2] = G.mb[0] ? 1 : 0;
          if (t === 0 && S.key_click[c2]) {
            selectedkey = c2;
            playSound(INSTRUMENTS[S.instrument], c2, 100, 100, 0);
          }
          if (a === k - 1) downEdge = 1;
          if (a === 0) downEdge = 0;
        }
      } else S.key_click[c2] = 0;
      // 黑键命中
      const overBlack = !isDialogWindow(S.window) && mouseRectangle(xx + 39 * a - 12, yy - 7, 25, 71);
      if (overBlack) {
        if (S.show_notechart && !S.keynames_flat && c1 > 6 && c1 < 70 && !S.playing) drawNoteChart(xx + 39 * a, yy - 32, S.startkey + a - 1, 1);
        if (G.mbp[2] && S.show_keyboard) S.key_edit = c1;
        const t = S.key_click[c1];
        S.key_click[c1] = G.mb[0] ? 1 : 0;
        if (t === 0 && S.key_click[c1]) { selectedkey = c1; playSound(INSTRUMENTS[S.instrument], c1, 100, 100, 0); }
      } else S.key_click[c1] = 0;

      // 白键
      let out = (c2 < 33 || c2 > 57);
      let col = '#ffffff';
      if (S.show_outofrange && out) col = COL.outOfRange;
      // 对照 draw_piano.gml:65：非 Fluent 用固定色 16753828（=#a4a4ff 淡蓝紫），Fluent 用 accent[7]
      if (S.selected_key === c2 && !S.playing) col = S.theme !== 3 ? COL.keySelected : T.accent[7];
      let d1 = 0;
      const since2 = (G.time - S.key_played[c2]) * 1000;
      if (since2 < 300) { col = mergeColor(col, '#ffff00', 1 - since2 / 300); d1 = ((since2 / 300) * 2); if (d1 > 1) d1 = 2 - d1; d1 = floor(d1 * 3) / 3; }
      if (S.key_press[c2] || S.key_click[c2]) d1 = 0.75;
      // 对照 draw_piano.gml:69 `draw_piano_key(false, xx + 39*a, yy + floor(7*down[1]), ...)`:
      // 白键的下沉偏移【只在这里加一次】，drawPianoKey 内部不再加。
      drawPianoKey(false, xx + 39 * a, yy + floor(7 * d1), col, keyAlpha, c2, k2, !out && S.show_keynumbers, d1);
      // 黑键
      let out1 = (c1 < 33 || c1 > 57);
      let col1 = '#ffffff';
      if (S.show_outofrange && out1) col1 = COL.outOfRange;
      if (S.selected_key === c1 && !S.playing) col1 = S.theme !== 3 ? COL.keySelected : T.accent[7];
      let d0 = 0;
      const since1 = (G.time - S.key_played[c1]) * 1000;
      if (since1 < 300) { col1 = mergeColor(col1, '#ffff00', 1 - since1 / 300); d0 = ((since1 / 300) * 2); if (d0 > 1) d0 = 2 - d0; d0 = floor(d0 * 3) / 3; }
      if (S.key_press[c1] || S.key_click[c1]) d0 = 0.75;
      // 对照 draw_piano.gml:82 `draw_piano_key(true, xx + 39*a - 19, yy - 7, col, ...)`:
      // 黑键只传 yy-7（不含下沉量），下沉量由 drawPianoKey 内部按 floor(7*ispressed) 加。
      // 之前这里写成 yy - 7 + floor(7*d0)，内部又加一次，等于偏移了双倍，
      // 黑键会被整体下移并露出顶部 —— 就是「黑键顶部没被蓝色覆盖」的原因。
      drawPianoKey(true, xx + 39 * a - 19, yy - 7, col1, keyAlpha, c1, k1, !out1 && S.show_keynumbers, d0);
      b += 2;
      if (a < 3 && keyAlpha < 3) keyAlpha += 1;
      if (a > k - Math.min(5, 54 - (S.startkey + k))) keyAlpha -= 1;
    } else {
      const c1 = S.startkey + S.sharpkeys + b;
      const k1 = S.show_keyboard && S.piano_key[c1] > 0;
      if (!isDialogWindow(S.window) && mouseRectangle(xx + 39 * a, yy, 39, 128)) {
        const inBlack = mouseRectangle(xx + 39 * a + 27, yy - 7, 25, 71) && !(a === k - 1 || cc === 1 || cc === 4);
        if (!inBlack) {
          if (S.show_notechart && c1 > 6 && c1 < 69 && !S.playing) drawNoteChart(xx + 39 * a + 18, yy - 32, S.startkey + a, 0);
          if (G.mbp[2] && S.show_keyboard) S.key_edit = c1;
          const t = S.key_click[c1];
          S.key_click[c1] = G.mb[0] ? 1 : 0;
          if (t === 0 && S.key_click[c1]) { selectedkey = c1; playSound(INSTRUMENTS[S.instrument], c1, 100, 100, 0); }
          if (a === k - 1) downEdge = 1;
          if (a === 0) downEdge = 0;
        }
      } else S.key_click[c1] = 0;
      const out = (c1 < 33 || c1 > 57);
      let col = '#ffffff';
      if (S.show_outofrange && out) col = COL.outOfRange;
      if (S.selected_key === c1 && !S.playing) col = S.theme !== 3 ? COL.keySelected : T.accent[7];
      let d = 0;
      const since = (G.time - S.key_played[c1]) * 1000;
      if (since < 300) { col = mergeColor(col, '#ffff00', 1 - since / 300); d = ((since / 300) * 2); if (d > 1) d = 2 - d; d = floor(d * 3) / 3; }
      if (S.key_press[c1] || S.key_click[c1]) d = 0.75;
      drawPianoKey(false, xx + 39 * a, yy + floor(7 * d), col, keyAlpha, c1, k1, !out && S.show_keynumbers, d);      b += 1;
    }
    // 对照 draw_piano.gml:119-120：两端渐隐
    //   if (a < 3 && alpha < 3) alpha += 1
    //   if (a > k - min(5, 54 - (startkey + k))) alpha -= 1
    if (a < 3 && keyAlpha < 3) keyAlpha += 1;
    if (a > k - Math.min(5, 54 - (S.startkey + k))) keyAlpha -= 1;
  }
  if (selectedkey > -1) { S.selected_key = selectedkey; S.selected_vel = 100; S.selected_pan = 100; S.selected_pit = 0; }
  // 滚动换八度
  if (downEdge === 0 && S.startkey > 0 && !G.mb[0] && S.delay === 0) {
    const a = S.startkey % 7;
    if (a !== 2 && a !== 5) S.sharpkeys--;
    S.startkey--; S.delay = 2;
  }
  if (downEdge === 1 && !G.mb[0] && S.delay === 0 && S.startkey + k < 52) {
    const a = S.startkey % 7;
    if (a !== 1 && a !== 4) S.sharpkeys++;
    S.startkey++; S.delay = 2;
  }
}

function offPiano() { return (S.theme === 3 ? 6 : 0) + ((S.theme === 3 && S.fdark) ? 6 : 0); }

/* 完整移植 draw_piano_key.gml。
   签名与源码一致：draw_piano_key(isblack, xx, yy, color, alpha, key, showkeybind, showclicks, ispressed)

   黑键由【两块精灵拼成】，这是之前漏掉的关键：
     spr_piano 帧 1 = 黑键上半部（bbox y 0..60，宽 25）
     spr_piano 帧 2 = 黑键底部那一条（bbox y 60..71，宽 25，只有 11 高）
   源码把帧 2 画在 yy、帧 1 画在 yy + floor(7*ispressed)，两者沿 y=60 拼成一个完整黑键。
   我之前只画了帧 1，所以黑键底部那 11px 一直是露出来的、选中色也盖不到它
   —— 就是用户看到的「底部有一节节没有被蓝色覆盖」。

   alpha 遮罩层（帧 3/4/5、6/7/8、9/10/11）用于琴键两端渐隐，
   条件是 `if (alpha < 3)`，颜色是 window_background、透明度 0.8 - alpha/3。
   帧布局：白=0/3、黑上=1/4、黑下=2/5（经典）；+6 是 Fluent，+6 再是 Fluent 深色。 */
function drawPianoKey(isblack, xx, yy, color, alpha, key, showkeybind, showclicks, ispressed) {
  const o = offPiano();
  if (alpha === undefined) alpha = 3;
  // 两端渐隐遮罩：alpha < 3 时叠一层窗口底色
  const mask = (frameNo, yy2) => {
    if (alpha < 3) drawSprite('spr_piano', frameNo, xx, yy2, 1, 1, C.background, clamp(0.8 - alpha / 3, 0, 1));
  };
  if (isblack) {
    // Key：先画底部小条，再画上半身（与源码顺序一致）
    drawSprite('spr_piano', 2 + o, xx, yy, 1, 1, color);
    mask(5 + o, yy);
    drawSprite('spr_piano', 1 + o, xx, yy + floor(7 * ispressed), 1, 1, color);
    mask(4 + o, yy + floor(7 * ispressed));
    // Text
    setAlpha(alpha / 3);
    setFont(FONT.mainbold(10));
    setColor((S.theme === 3 && S.fdark) ? color : '#ffffff');
    if (S.show_keynames) {
      text(xx + 19, yy + 29 + floor(7 * ispressed) - 4 * (showkeybind ? 1 : 0)
        - 4 * ((showkeybind && showclicks) ? 1 : 0) - 6 * (showclicks ? 1 : 0),
        getKeyname(key, 1), 'center');
    }
    if (showclicks) {
      text(xx + 19, yy + 34 + floor(7 * ispressed) - 8 * (showkeybind ? 1 : 0), String(key - 33), 'center');
    }
    setFont(FONT.main(10));
    // 源码没有单独 set_color，沿用上面 draw_set_color(color / c_white) 的结果
    if (showkeybind && ((floor(S.editline) % 15) < 7 || S.key_edit !== key)) {
      text(xx + 19, yy + 39 + floor(7 * ispressed), String.fromCharCode(S.piano_key[key] || 32), 'center');
    }
    setAlpha(1);
    setFont(FONT.main());
  } else {
    // Key
    drawSprite('spr_piano', 0 + o, xx, yy, 1, 1, color);
    mask(3 + o, yy);
    // Text
    setAlpha(alpha / 3);
    setFont(FONT.mainbold(10));
    setColor((S.theme === 3 && S.fdark) ? color : '#000000');
    if (S.show_keynames) {
      text(xx + 20, yy + 85 - 4 * (showkeybind ? 1 : 0) - 4 * ((showkeybind && showclicks) ? 1 : 0)
        - 6 * (showclicks ? 1 : 0), getKeyname(key, 1), 'center');
    }
    if (showclicks) {
      text(xx + 20, yy + 85 + 5 - 8 * (showkeybind ? 1 : 0), String(key - 33), 'center');
    }
    setFont(FONT.main(10));
    if (showkeybind && ((floor(S.editline) % 15) < 7 || S.key_edit !== key)) {
      text(xx + 20, yy + 95, String.fromCharCode(S.piano_key[key] || 32), 'center');
    }
    setAlpha(1);
    setFont(FONT.main());
  }
}

function drawNoteChart(x, y, key, accidental) {
  // 对照 draw_notechart：背景用 spr_notechart，谱号/音符都用原精灵
  const nx = median(0, x - 32, S.rw - 320);
  const shifted = x > S.rw - 250;
  drawSprite('spr_notechart', 0 + 3 * S.theme, nx, y - 320 + 1);
  drawSprite('spr_notechart', (1 + (shifted ? 1 : 0)) + 3 * S.theme, x - (shifted ? 16 : 0), y);

  setColor('#000000');
  setAlpha(0.25);
  for (let a = 0; a < 11; a++) {
    if (a !== 5) line(nx + 32, y - 250 + 16 * a, nx + 320 - 32, y - 250 + 16 * a);
  }
  setAlpha(1);
  setColor('#000000');
  line(nx + 32, y - 250, nx + 32, y - 250 + 64);
  line(nx + 32, y - 250 + 96, nx + 32, y - 250 + 160);
  drawSprite('spr_Gclef', 0, nx + 58, y - 250 + 48);
  drawSprite('spr_Fclef', 0, nx + 48, y - 250 + 112);
  drawSprite(S.keynames_flat ? 'spr_note_flat' : 'spr_note_sharp',
    accidental + 2 * (key > 22 ? 1 : 0), nx + 152, y - 250 - 8 * (key - 33));
  if (key > 22 && key < 25) {
    setAlpha(0.25); line(nx + 122, y - 250 + 80, nx + 180, y - 250 + 80); setAlpha(1);
  }
  for (let a = 1; a < floor((key - 31) / 2); a++) {
    setAlpha(0.25); line(nx + 122, y - 250 - 16 * a, nx + 180, y - 250 - 16 * a); setAlpha(1);
  }
  for (let a = 0; a < 7 - ceil(key / 2); a++) {
    setAlpha(0.25); line(nx + 122, y - 250 + 176 + 16 * a, nx + 180, y - 250 + 176 + 16 * a); setAlpha(1);
  }
  setAlpha(1);
}

/* ---------------------------------------------------------------- 辅助 */
function setMsg(s) { S.msgtext = s; S.msgtime = G.time; }
function drawMsg() {
  if (!S.msgtext || G.time - S.msgtime > 4) return;
  const a = clamp(4 - (G.time - S.msgtime), 0, 1);
  setAlpha(a);
  setColor(C.dark ? 'rgba(50,50,50,0.95)' : 'rgba(255,255,255,0.95)');
  const w = textWidth(S.msgtext) + 20;
  roundRect(8, S.rh - 52, 8 + w, S.rh - 28, 4, true);
  setColor(C.text);
  text(18, S.rh - 47, S.msgtext);
  setAlpha(1);
}

/* 音色切换时的模式动作 */
function modeAction(n) {
  // 对应 get_mode_actions / mode_action：1 音调 2 音量 3 声道 4 音高 5 替换 6 ...
  if (n <= 4) { S.editmode = n - 1; }
  else if (n === 5) { if (S.selected) { } }
}
