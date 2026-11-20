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
  'spr_tabbuttons', 'spr_tabsel', 'spr_yesno_f', 'spr_logo', 'spr_bigicons_f',
  'spr_block_shape', 'spr_block_color_shape', 'spr_frame4',
  // 滚动条（原版 spr_scrollbar_* 全套）
  'spr_scrollbar_h_background', 'spr_scrollbar_h_bar_fill', 'spr_scrollbar_h_button_left',
  'spr_scrollbar_h_button_right', 'spr_scrollbar_v_background', 'spr_scrollbar_v_bar_fill',
  // 导出窗口里的示意图（draw_window_schematic_export.gml:96 的
  //   draw_sprite(spr_schematic_exp, sch_exp_layout, x1+15, y1+56)
  // 和 draw_window_datapack_export.gml:93/182 的 spr_datapack_exp）。
  // 之前漏了这两套，导出弹窗里本该有的示意图就不显示了。
  'spr_schematic_exp', 'spr_datapack_exp',
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
