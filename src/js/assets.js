/* =========================================================================
   assets.js — 图集与音色载入
   ========================================================================= */
'use strict';

const ATLAS_SETS = [
  'spr_icons', 'spr_icons_f', 'spr_icons_d', 'spr_icons_col', 'spr_block_color',
  'spr_block', 'spr_block_sel', 'spr_piano', 'spr_layerbox', 'spr_layericons_f',
  // 非 Fluent 主题的侧边栏图标（draw_layericon.gml 里 theme != 3 走 spr_layericons）
  'spr_layericons',
  'spr_macroicons', 'spr_marker', 'spr_timeline', 'spr_tempobox', 'spr_frame1',
  'spr_tabframe', 'spr_tabbar', 'spr_minecraft_f', 'spr_lock', 'spr_instrumenticons',
  'spr_notechart', 'spr_Gclef', 'spr_Fclef', 'spr_note_sharp', 'spr_note_flat',
  'spr_scrollbar_v_button_up', 'spr_scrollbar_v_button_down', 'spr_scrollbar_v_bar_up',
  'spr_scrollbar_v_bar_down', 'spr_scrollbar_v_bar_handle', 'spr_scrollbar_h_bar_left',
  'spr_scrollbar_h_bar_right', 'spr_scrollbar_h_bar_handle', 'spr_button_arrow',
  'spr_checkbox', 'spr_radiobox', 'spr_switch', 'spr_volume_f', 'spr_stereo_f',
  /* 非 Fluent 主题的音量/立体声指示器。
     对照 control_draw.gml:1341-1342 / 1376-1377：
         if (theme != 3) draw_sprite_ext(spr_volume, a / 30, ...)
         else            draw_sprite_ext(spr_volume_f, !fdark, ...)
     也就是说 theme 0/1/2 用的是【不带 _f】的 spr_volume / spr_stereo ——
     那是自带配色的实心图标，而 _f 版是 Fluent 的线稿（需要叠加 accent 上色）。
     之前只打了 _f 两套，非 Fluent 主题只能退而用 _f 版，
     于是经典/复古/暗黑的图层抽屉里出现了 Fluent 样式的音量图标 —— 这就是
     用户说的「不同主题图标混用」。这里把两套都补进图集。 */
  'spr_volume', 'spr_stereo',
  /* 按钮底板。对照 draw_button2.gml:18-21/39-50 —— 所有非 Fluent 主题都用
       draw_sprite(spr_button, m * 3 + 12 * theme + ...)
     也就是靠 12*theme 的偏移区分「经典 / 复古 / 暗黑」三套按钮浮雕，
     只有 theme 3 才手绘圆角。之前没打这套图，drawButton 只能不分主题地
     手绘 Fluent 圆角按钮，于是经典/复古/暗黑的按钮全是 Fluent 的样子。 */
  'spr_button',
  /* 非 Fluent 主题的窗口边框（draw_window.gml:36-43）。
     theme 0/1/2 用 spr_interface2 的 8 帧拼出立体边框：
       帧 0..7 = 左上角/左边/左下角/底边/右下角/右边/右上角/顶边，
       每帧再加 8*theme（经典/复古/暗黑三套），Fluent 深色再 +8。
     Fluent 则走手绘圆角 + spr_shadow（这里用 canvas 阴影等价实现）。 */
  'spr_interface2',
  /* 非 Fluent 主题的三片式输入框（draw_inputbox.gml:33）。
     n = 普通态, s = 聚焦态；帧号 = theme，一个 sprite 里装了四套主题的样式。 */
  'spr_inputbox_n_left', 'spr_inputbox_n_middle', 'spr_inputbox_n_right',
  'spr_inputbox_s_left', 'spr_inputbox_s_middle', 'spr_inputbox_s_right',
  'spr_tabbuttons', 'spr_tabsel', 'spr_yesno_f', 'spr_logo', 'spr_bigicons_f',
  'spr_block_shape', 'spr_block_color_shape', 'spr_frame4',
  // 滚动条（原版 spr_scrollbar_* 全套）
  'spr_scrollbar_h_background', 'spr_scrollbar_h_bar_fill', 'spr_scrollbar_h_button_left',
  'spr_scrollbar_h_button_right', 'spr_scrollbar_v_background', 'spr_scrollbar_v_bar_fill',
  // 导出窗口里的示意图（draw_window_schematic_export.gml:96 的
  //   draw_sprite(spr_schematic_exp, sch_exp_layout, x1+15, y1+56)
  // 和 draw_window_datapack_export.gml:93/182 的 spr_datapack_exp）。
  // 之前漏了这两套，导出弹窗里本该有的示意图就不显示了。
  // spr_schematic_br 是「导出分支」窗口设计页的示意图
  // （draw_window_branch_export.gml:103 的 draw_sprite(spr_schematic_br, 0, ...)），
  // 尺寸与 spr_schematic_exp 相同（520x150），之前也没有收录。
  'spr_schematic_exp', 'spr_datapack_exp', 'spr_schematic_br',
  // 高清（4x）素材，开启 hires 时优先使用
  'spr_icons_f_hires', 'spr_icons_d_hires', 'spr_icons_col_hires', 'spr_layericons_f_hires',
  'spr_macroicons_hires', 'spr_piano_hires', 'spr_button_arrow_hires', 'spr_bigicons_f_hires',
];

async function loadAssets(onProgress) {
  try {
    const res = await fetch('assets/atlas/atlas.json');
    G.atlas = await res.json();
  } catch (e) {
    // file:// 直接打开时 fetch 被禁止，退回到内联元数据
    G.atlas = window.__ATLAS_DATA__ || {};
  }
  let done = 0;
  const total = ATLAS_SETS.length + 18;
  for (const name of ATLAS_SETS) {
    try {
      G.assets[name] = await loadImage(`assets/atlas/${name}.png`);
    } catch (e) {
      console.warn('缺少图集', name);
    }
    done++;
    if (onProgress) onProgress(done / total, '正在载入界面素材...');
  }
  return true;
}

const SOUND_FILES = [
  'harp.ogg', 'dbass.ogg', 'bdrum.ogg', 'sdrum.ogg', 'click.ogg', 'guitar.ogg',
  'flute.ogg', 'bell.ogg', 'icechime.ogg', 'xylobone.ogg', 'iron_xylophone.ogg',
  'cow_bell.ogg', 'didgeridoo.ogg', 'bit.ogg', 'banjo.ogg', 'pling.ogg',
];
const UI_SOUND_FILES = ['invoke', 'show', 'hide', 'goback', 'ding', 'metronome', 'metronome_click'];
