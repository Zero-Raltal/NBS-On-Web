/* =========================================================================
   schematic.js — schematic / 结构方块 / 数据包导出
   严格照搬 GML 原版：
     · schematic_export()        红石布线（直轨 / 环线 / 经典 三种布局）
     · reset_schematic_export()  参数默认值
     · draw_window_schematic_export()
     · datapack_export() + dat_generate()
     · draw_window_datapack_export()
   以及辅助：schematic_* / sch_block_read·write / sch_data_read·write /
   block_walkway / block_other / block_circuit / block_repeater /
   block_get_ins / block_get_name / block_get_namespaced_id /
   TAG_* (NBT) / gzzip (gzip) / dat_instrument / dat_pitch /
   string_path / dat_getpath / dat_preview / calculate_size。

   注：代码注释里的「照搬」指与 <name>.gml 逐句对应；红石时序是否在
   Minecraft 里真的响，本环境无法验证，故只保证结构与原版一致。
   ========================================================================= */
'use strict';

/* ---------------------------------------------------------------- 方块 ID */
const SCH_REPEATER = 93, SCH_TORCHON = 76, SCH_TORCHOFF = 75, SCH_WIRE = 55,
  SCH_LADDER = 65, SCH_RAIL = 66, SCH_POWEREDRAIL = 27;

/* schematic 缓冲区。
   照搬 sch_block_write 的寻址：t = x*2000*256 + z*2000 + y，d = sqrt(2000*256*2000)。
   GML 用二维数组 sch_block[t div d, t mod d]，这里等价地用一个 Map 以 t 为键
   （t 在 len<=2000 / wid<=203 / hei<=256 的范围内是唯一的），默认值 0。 */
const SCH_D = 32000;          // = sqrt(2000*256*2000)
let SCH_BLOCK = new Map();
let SCH_DATA = new Map();
function schT(x, y, z) { return x * 2000 * 256 + z * 2000 + y; }
function schBlockWrite(x, y, z, val) { SCH_BLOCK.set(schT(x, y, z), val); }
function schBlockRead(x, y, z) { const v = SCH_BLOCK.get(schT(x, y, z)); return v === undefined ? 0 : v; }
function schDataWrite(x, y, z, val) { SCH_DATA.set(schT(x, y, z), val); }
function schDataRead(x, y, z) { const v = SCH_DATA.get(schT(x, y, z)); return v === undefined ? 0 : v; }

/* block_walkway / block_other / block_circuit / block_repeater */
function blockWalkway(x, y, z) {
  schBlockWrite(x, y, z, S.sch_exp_walkway_block);
  schDataWrite(x, y, z, S.sch_exp_walkway_data);
}
function blockOther(x, y, z, id, data) {
  schBlockWrite(x, y, z, id);
  schDataWrite(x, y, z, data);
}
function blockCircuit(x, y, z) {
  schBlockWrite(x, y, z, S.sch_exp_circuit_block);
  schDataWrite(x, y, z, S.sch_exp_circuit_data);
}
function blockRepeater(x, y, z, delay, direction, powered) {
  schBlockWrite(x, y, z, 93 + powered);
  schDataWrite(x, y, z, delay * 4 + direction);
}

/* ---------------------------------------------------------------- 参数默认值 */
// 照搬 reset_schematic_export(argument0)
function resetSchematicExport(mode) {
  if (!mode) {
    S.sch_exp_tab = 0;
    S.sch_exp_remember = 1;
    S.sch_br_remember = 1;
  }
  const n = (typeof INSTRUMENTS !== 'undefined' ? INSTRUMENTS.length : 0) + 240;
  for (let a = 0; a < n; a++) S.sch_exp_ins_data[a] = 0;
  const blk = [3, 5, 4, 12, 20, 35, 82, 41, 174, 216, 42, 88, 86, 133, 170, 89];
  for (let a = 0; a < 16; a++) S.sch_exp_ins_block[a] = blk[a];
  for (let a = 0; a < 240; a++) S.sch_exp_ins_block[16 + a] = 1;

  S.sch_exp_walkway_block = 1;
  S.sch_exp_walkway_data = 0;
  S.sch_exp_circuit_block = 1;
  S.sch_exp_circuit_data = 0;
  S.sch_exp_ground_block = 1;
  S.sch_exp_ground_data = 0;

  S.sch_exp_minecraft_old = false;
  S.sch_exp_layout = 1;          // 0 = 环形过道, 1 = 普通过道, 2 = 经典
  S.sch_exp_stereo = 4;
  S.sch_exp_notesperrow = 20;
  S.sch_exp_layer1 = 1;
  S.sch_exp_layer2 = 1;
  S.sch_exp_layer3 = 1;
  S.sch_exp_polyphony = 0;
  S.sch_exp_includelocked = 0;
  S.sch_exp_compress = 1;
  S.sch_exp_velocity = 1;
  S.sch_exp_circuitry = 1;
  S.sch_exp_vertical = 0;
  S.sch_exp_range_start = 0;
  S.sch_exp_range_end = 0;
  S.sch_exp_loop = 1;
  S.sch_exp_glass = 1;
  S.sch_exp_minecart = 0;
  S.sch_exp_chest = 1;
  S.sch_exp_minecraft_old = false;
}

// 照搬 dat_reset(argument0)
function datReset(mode) {
  if (!mode) {
    S.dat_tab = 0;
    S.dat_remember = 1;
  }
  S.dat_name = '';
  S.dat_namespace = '';
  S.dat_path = '';
  S.dat_source = 'record';
  S.dat_mcversion = 1;           // 默认 1.21+
  S.dat_usezip = 1;
  S.dat_includelocked = 0;
  S.dat_includeoutofrange = 0;
  S.dat_enableradius = 0;
  S.dat_radius = 16;
  S.dat_radiusvalue = 0;
  S.dat_enablelooping = 0;
  S.dat_remember = 1;
  S.dat_vis_type = 'Arc';
  S.dat_glow = 1;
  S.dat_yval = 100;
  S.dat_xval = 0;
  S.dat_zval = 0;
  S.dat_visualizer = 0;
}

/* ---------------------------------------------------------------- 字符串工具 */
// GML 的 string_lettersdigits：只保留字母和数字
function stringLettersDigits(s) {
  return String(s == null ? '' : s).replace(/[^0-9A-Za-z]/g, '');
}
// 照搬 string_path：小写、空格换下划线、只保留 _ 和字母数字
function stringPath(s) {
  s = String(s == null ? '' : s).toLowerCase().replace(/ /g, '_');
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '_' || /[0-9a-z]/.test(ch)) out += ch;
  }
  return out;
}
// 照搬 dat_getpath
function datGetPath(s) {
  let opath = String(s == null ? '' : s).toLowerCase().replace(/ /g, '_');
  let path = '';
  let prev = '';
  if (opath !== '') {
    for (let i = 1; i <= opath.length + 1; i++) {
      const ch = i <= opath.length ? opath[i - 1] : '';
      if (ch === '_' || (ch === '/' && prev !== '/' && i > 1) || (/[0-9a-zA-Z]/.test(ch) && ch !== '')) path += ch;
      prev = ch;
    }
    if (path.endsWith('/')) path = path.slice(0, -1);
  }
  return path;
}
// 照搬 dat_preview
function datPreview(name, namespace, path) {
  let preview;
  if (stringLettersDigits(name) === '') preview = '<输入名称>';
  else if (stringLettersDigits(namespace) === '') preview = '/function ' + stringPath(name) + ':play';
  else if (stringLettersDigits(path) === '') preview = '/function ' + stringPath(namespace) + ':' + stringPath(name) + '/play';
  else preview = '/function ' + stringPath(namespace) + ':' + datGetPath(path) + '/' + stringPath(name) + '/play';
  return preview.length > 60 ? '...' + preview.slice(preview.length - 57) : preview;
}

/* GML 的 string(real)：最多两位小数、去掉多余的 0 */
function gs(v) {
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (!isFinite(v)) return String(v);
  const r = Math.round(v * 100) / 100;
  return String(r);
}

/* ---------------------------------------------------------------- 方块名 */
// 照搬 block_get_name(val, data)
function blockGetName(val, data) {
  let color = '';
  if (val === 35 || val === 95 || val === 159 || val === 160 || val === 171 || val === 172) {
    color = ['White', 'Orange', 'Magenta', 'Light Blue', 'Yellow', 'Lime', 'Pink', 'Gray',
      'Light Gray', 'Cyan', 'Purple', 'Blue', 'Brown', 'Green', 'Red', 'Black'][data] || 'White';
    if (color !== 'White') color += ' ';
    else color = 'White ';
  }
  const T = {
    0: 'Air', 1: 'Stone', 2: 'Grass Block', 3: 'Dirt', 4: 'Cobblestone', 5: 'Wood Planks',
    7: 'Bedrock', 12: 'Sand', 13: 'Gravel', 14: 'Gold Ore', 15: 'Iron Ore', 16: 'Coal Ore',
    17: 'Wood', 18: 'Leaves', 19: 'Sponge', 20: 'Glass', 21: 'Lapis Lazuli Ore',
    22: 'Lapis Lazuli Block', 23: 'Dispenser', 24: 'Sandstone', 25: 'Note Block', 26: 'Bed',
    27: 'Powered Rail', 28: 'Detector Rail', 29: 'Sticky Piston', 30: 'Cobweb', 33: 'Piston',
    35: color + 'Wool', 41: 'Block of Gold', 42: 'Block of Iron', 45: 'Bricks', 46: 'TNT',
    47: 'Bookshelf', 48: 'Moss stone', 49: 'Obsidian', 52: 'Monster Spawner', 54: 'Chest',
    56: 'Diamond Ore', 57: 'Block of Diamond', 58: 'Crafting Table', 60: 'Farmland',
    61: 'Furnace', 62: 'Burning Furnace', 73: 'Redstone Ore', 74: 'Glowing Redstone Ore',
    78: 'Snow', 79: 'Ice', 80: 'Snow', 82: 'Clay', 86: 'Pumpkin', 87: 'Netherrack',
    88: 'Soul Sand', 89: 'Glowstone', 91: "Jack - o'Lantern", 92: 'Cake',
    95: color + 'Stained Glass', 97: 'Monster Egg', 98: 'Stone Bricks',
    99: 'Brown Mushroom', 100: 'Red Mushroom', 103: 'Melon', 110: 'Mycelium',
    112: 'Nether Brick', 121: 'End Stone', 123: 'Redstone Lamp (inactive)',
    124: 'Redstone Lamp (active)', 126: 'Wooden Slab', 129: 'Emerald Ore',
    133: 'Block of Emerald', 137: 'Command Block', 138: 'Beacon', 151: 'Daylight Sensor',
    152: 'Block of Redstone', 153: 'Nether Quartz Ore', 155: 'Block of Quartz',
    159: color + 'Terracotta', 160: color + 'Stained Glass Pane',
    161: 'Leaves (Acacia / Dark Oak)', 162: 'Wood (Acacia / Dark Oak)', 165: 'Slime Block',
    168: 'Prismarine', 169: 'Sea Lantern', 170: 'Hay Bale', 171: color + 'Carpet',
    172: color + 'Terracotta', 173: 'Block of Coal', 174: 'Packed Ice',
    179: 'Red Sandstone', 201: 'Purpur Block', 202: 'Purpur Pillar', 206: 'End Bricks',
    208: 'Grass Path', 210: 'Repeating Command Block', 211: 'Chain Command Block',
    212: 'Frosted Ice', 213: 'Magma Block', 214: 'Nether Wart Block',
    215: 'Red Nether Brick', 216: 'Bone Block', 251: color + 'Concrete',
    252: color + 'Concrete Powder',
  };
  return T[val] === undefined ? '' : T[val];
}

// 照搬 block_get_namespaced_id(val, data)
function blockGetNamespacedId(val, data) {
  let color = '';
  if (val === 35 || val === 95 || val === 159 || val === 160 || val === 171 || val === 172 || val === 251 || val === 252) {
    color = ['white_', 'orange_', 'magenta_', 'light_blue_', 'yellow_', 'lime_', 'pink_', 'gray_',
      'light_gray_', 'cyan_', 'purple_', 'blue_', 'brown_', 'green_', 'red_', 'black_'][data] || 'white_';
  }
  const T = {
    0: 'air', 1: 'stone', 2: 'grass_block', 3: 'dirt', 4: 'cobblestone', 5: 'oak_planks',
    7: 'bedrock', 12: 'sand', 13: 'gravel', 14: 'gold_ore', 15: 'iron_ore', 16: 'coal_ore',
    17: 'oak_log', 18: 'oak_leaves', 19: 'sponge', 20: 'glass', 21: 'lapis_ore',
    22: 'lapis_block', 23: 'dispenser', 24: 'sandstone', 25: 'note_block', 26: 'bed',
    27: 'golden_rail', 28: 'detector_rail', 29: 'sticky_piston', 30: 'cobweb', 33: 'piston',
    35: color + 'wool', 41: 'gold_block', 42: 'iron_block', 45: 'brick_block', 46: 'tnt',
    47: 'bookshelf', 48: 'mossy_cobblestone', 49: 'obsidian', 52: 'mob_spawner', 54: 'chest',
    56: 'diamond_ore', 57: 'diamond_block', 58: 'crafting_table', 60: 'farmland',
    61: 'furnace', 62: 'lit_furnace', 73: 'redstone_ore', 74: 'lit_redstone_ore',
    78: 'snow_layer', 79: 'ice', 80: 'snow', 82: 'clay', 86: 'pumpkin', 87: 'netherrack',
    88: 'soul_sand', 89: 'glowstone', 91: 'jack_o_lantern', 92: 'cake',
    95: color + 'stained_glass', 97: 'infested_stone', 98: 'stone_bricks',
    99: 'brown_mushroom_block', 100: 'red_mushroom_block', 103: 'melon', 110: 'mycelium',
    112: 'nether_brick', 121: 'end_stone', 123: 'redstone_lamp', 124: 'lit_redstone_lamp',
    126: 'oak_slab', 129: 'emerald_ore', 133: 'emerald_block', 137: 'command_block',
    138: 'beacon', 151: 'daylight_detector', 152: 'redstone_block', 153: 'quartz_ore',
    155: 'quartz_block', 159: color + 'terracotta', 160: color + 'stained_glass_pane',
    161: 'dark_oak_leaves', 162: 'dark_oak_log', 165: 'slime_block', 168: 'prismarine',
    169: 'sea_lantern', 170: 'hay_block', 171: color + 'carpet', 172: 'terracotta',
    173: 'coal_block', 174: 'packed_ice', 179: 'red_sandstone', 201: 'purpur_block',
    202: 'purpur_pillar', 206: 'end_bricks', 208: 'grass_path',
    210: 'repeating_command_block', 211: 'chain_command_block', 212: 'frosted_ice',
    213: 'magma', 214: 'nether_wart_block', 215: 'red_nether_brick', 216: 'bone_block',
    251: color + 'concrete', 252: color + 'concrete_powder',
  };
  return T[val] === undefined ? '' : T[val];
}

/* 照搬 block_get_ins（schematic 里没用到，但保留以便对照） */
function blockGetIns(block) {
  const m = {
    1: 2, 4: 2, 5: 1, 7: 2, 12: 3, 13: 3, 14: 2, 15: 2, 16: 2, 17: 1, 20: 4, 21: 2, 22: 2,
    23: 2, 24: 2, 25: 1, 35: 5, 41: 7, 43: 2, 44: 2, 45: 2, 47: 1, 48: 2, 49: 2, 53: 1,
    54: 1, 56: 1, 61: 2, 62: 2, 67: 2, 73: 2, 74: 2, 82: 6, 84: 1, 85: 1, 87: 2, 88: 3,
    89: 2, 97: 2, 98: 2, 107: 1, 108: 2, 109: 2, 174: 8, 216: 9,
  };
  return m[block] === undefined ? 0 : m[block];
}

/* ---------------------------------------------------------------- 乐器 / 音高 */
// 照搬 dat_instrument
function datInstrument(n) {
  const str = 'minecraft:block.note_block.';
  const names = ['harp', 'bass', 'basedrum', 'snare', 'hat', 'guitar', 'flute', 'bell',
    'chime', 'xylophone', 'iron_xylophone', 'cow_bell', 'didgeridoo', 'bit', 'banjo', 'pling'];
  if (n < 16) return str + names[n];
  const ins = INSTRUMENTS[n];
  return 'minecraft:' + (ins ? ins.name : 'harp');
}
// 照搬 dat_pitch：把 key 换算成 playsound 的 pitch，格式化为 6 位小数
function datPitch(key) {
  if (key < 33) key -= 9;
  else if (key > 57) key -= 57;
  else key -= 33;
  return (0.5 * Math.pow(2, key / 12)).toFixed(6);
}

/* ---------------------------------------------------------------- 尺寸计算 */
// 照搬 calculate_locked_layers
function calculateLockedLayers() {
  for (let c = 0; c <= S.endb; c++) {
    S.lockedlayer[c] = 0;
    if (S.solostr !== '') {
      if (S.solostr.indexOf('|' + c + '|') < 0) S.lockedlayer[c] = 1;
      else if (S.layerlock[c] === 1) S.lockedlayer[c] = 1;
    } else if (c < S.endb2) {
      if (S.layerlock[c] === 1) S.lockedlayer[c] = 1;
    }
  }
}

/* 照搬 calculate_size 的统计部分（去掉弹窗，弹窗在 schematicPrepare 里做）。
   注意原版 92-93 行把 scp_exp_enda 拼错了（少了个 h），而后面读的也是
   同一个错名，所以行为等价——这里统一用 schExpEnda。 */
function calculateSize() {
  S.schExpEnda = [0, 0];
  S.sch_exp_totalblocks = [0, 0];
  S.sch_exp_repeaters = [[0, 0, 0], [0, 0, 0]];
  S.sch_exp_maxheight = [0, 0];

  const schColamount = [[], []];
  calculateLockedLayers();

  for (let a = 0; a <= S.enda; a++) {
    if (colamount[a] > 0) {
      let c = 0, d = 0;
      for (let b = colfirst[a]; b <= collast[a]; b++) {
        if (gExists(a, b)) {
          if (gKey(a, b) > 32 && gKey(a, b) < 58) {
            c += 1;
            S.sch_exp_totalblocks[1] += 1;
            if (S.lockedlayer[b] === 0) {
              d += 1;
              S.sch_exp_totalblocks[0] += 1;
            }
          }
        }
      }
      S.sch_exp_maxheight[0] = Math.max(S.sch_exp_maxheight[0], collast[a]);
      S.sch_exp_maxheight[1] = Math.max(S.sch_exp_maxheight[1], c);
      schColamount[1][a] = c;
      schColamount[0][a] = d;
      if (c > 0) S.schExpEnda[1] = a;
      if (d > 0) S.schExpEnda[0] = a;
    }
  }
  S.sch_colamount = schColamount;

  const cnt = [[0, 0, 0], [0, 0, 0]];
  for (let a = 0; a <= S.enda; a++) {
    for (let b = 0; b < 2; b++) {
      if (a <= S.schExpEnda[b]) {
        S.sch_exp_repeaters[b][2] += 1;
        if ((schColamount[b][a] || 0) > 0) {
          S.sch_exp_repeaters[b][0] += 1;
          cnt[b][0] = 0;
          S.sch_exp_repeaters[b][1] += 1;
          cnt[b][1] = 0;
        } else {
          cnt[b][0] += 1;
          cnt[b][1] += 1;
        }
        if (cnt[b][0] === 4) { S.sch_exp_repeaters[b][0] += 1; cnt[b][0] = 0; }
        if (cnt[b][1] === 2) { S.sch_exp_repeaters[b][1] += 1; cnt[b][1] = 0; }
      }
    }
  }
  S.sch_exp_tempo = 0;
  if (S.tempo > 10) S.sch_exp_tempo = 0;
  if (S.tempo < 10) S.sch_exp_tempo = 0;
  if (S.tempo < 7.5) S.sch_exp_tempo = 1;
  if (S.tempo < 3.75) S.sch_exp_tempo = 2;
  return 1;
}

// 照搬 schematic_length()
function schematicLength() {
  const rep = S.sch_exp_repeaters[S.sch_exp_includelocked][S.sch_exp_tempo];
  const npr = S.sch_exp_notesperrow;
  let len;
  if (S.sch_exp_layout < 2) {
    len = 2 + Math.ceil(rep / npr) * 3;
    if (S.sch_exp_layout === 0) len += 3 * ((Math.ceil(rep / npr) % 2) === 0 ? 1 : 0);
  } else {
    len = Math.max(6, Math.ceil((rep + 2) / npr) * 3 + 1);
  }
  return len;
}
// 照搬 schematic_width()
function schematicWidth() {
  if (S.sch_exp_layout < 2) return S.sch_exp_notesperrow * 2 + 3 + 4 * (S.sch_exp_layout === 0 ? 1 : 0);
  return S.sch_exp_notesperrow * 2 + 3;
}
// 照搬 schematic_height()
function schematicHeight() {
  return 4 + 3 * Math.ceil(S.sch_exp_maxheight[S.sch_exp_compress] / 4);
}

/* ---------------------------------------------------------------- NBT 写入
   照搬 TAG_Byte / TAG_Short / TAG_Int / TAG_Float / TAG_Double / TAG_String /
   TAG_List / TAG_Compound / TAG_End —— 它们写的都是「带名字的 tag」，
   TAG_End 用来结束一个 compound 的 payload。全部大端。
   ByteWriter 来自 nbs.js（小端），这里只补大端方法。 */
class NbtWriter extends ByteWriter {
  be16(v) { v = v & 0xffff; this.a.push((v >>> 8) & 0xff, v & 0xff); }
  be32(v) { v = v >>> 0; this.a.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff); }
  beFloat(v) {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setFloat32(0, v, false);
    for (let i = 0; i < 4; i++) this.a.push(b[i]);
  }
  beDouble(v) {
    const b = new Uint8Array(8);
    new DataView(b.buffer).setFloat64(0, v, false);
    for (let i = 0; i < 8; i++) this.a.push(b[i]);
  }
  // buffer_write_string_short_be
  beStr(s) {
    const enc = new TextEncoder().encode(s == null ? '' : String(s));
    this.be16(enc.length);
    for (let i = 0; i < enc.length; i++) this.a.push(enc[i]);
  }
  tagCompound(name) { this.a.push(10); this.beStr(name); }
  tagEnd() { this.a.push(0); }
  tagByte(name, v) { this.a.push(1); this.beStr(name); this.a.push(v & 0xff); }
  tagShort(name, v) { this.a.push(2); this.beStr(name); this.be16(v); }
  tagInt(name, v) { this.a.push(3); this.beStr(name); this.be32(v); }
  tagFloat(name, v) { this.a.push(5); this.beStr(name); this.beFloat(v); }
  tagDouble(name, v) { this.a.push(6); this.beStr(name); this.beDouble(v); }
  tagString(name, v) { this.a.push(8); this.beStr(name); this.beStr(v); }
  tagList(name, len, type) { this.a.push(9); this.beStr(name); this.a.push(type); this.be32(len); }
  tagByteArray(name, len) { this.a.push(7); this.beStr(name); this.be32(len); }
}

/* ---------------------------------------------------------------- CRC32 / gzip / zip */
let CRC_TABLE = null;
function crcTable() {
  if (CRC_TABLE) return CRC_TABLE;
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  CRC_TABLE = t;
  return t;
}
function crc32(bytes) {
  const t = crcTable();
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/* gzzip(file, dest) 的等价物：gzip 包一层。
   按任务约定用「stored」deflate 块（BTYPE=00），不压缩。 */
function gzipStore(data) {
  const out = [];
  out.push(0x1f, 0x8b, 0x08, 0x00);        // magic, CM=deflate, FLG=0
  out.push(0, 0, 0, 0);                     // MTIME = 0
  out.push(0x00, 0xff);                     // XFL = 0, OS = 255 (unknown)
  const MAX = 65535;
  let pos = 0;
  if (data.length === 0) {
    out.push(0x01, 0x00, 0x00, 0xff, 0xff); // 一个空的 final stored 块
  }
  while (pos < data.length) {
    const n = Math.min(MAX, data.length - pos);
    const final = (pos + n >= data.length) ? 1 : 0;
    out.push(final, n & 0xff, (n >>> 8) & 0xff, (~n) & 0xff, ((~n) >>> 8) & 0xff);
    for (let i = 0; i < n; i++) out.push(data[pos + i]);
    pos += n;
  }
  const c = crc32(data);
  out.push(c & 0xff, (c >>> 8) & 0xff, (c >>> 16) & 0xff, (c >>> 24) & 0xff);
  const sz = data.length >>> 0;
  out.push(sz & 0xff, (sz >>> 8) & 0xff, (sz >>> 16) & 0xff, (sz >>> 24) & 0xff);
  return new Uint8Array(out);
}

/* 手写 STORE 型 ZIP：本地文件头 + 数据 + 中央目录 + EOCD。
   原版调 `7za a -tzip`；浏览器里没有外部进程，所以自己拼。 */
function zipStore(files) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  const list = [];
  let offset = 0;
  const DOS_TIME = 0;         // 00:00:00
  const DOS_DATE = 0x0021;    // 1980-01-01
  for (const f of files) {
    const nameB = enc.encode(f.name);
    const data = f.data;
    const crc = crc32(data);
    const lh = [];
    const w16 = (v) => { lh.push(v & 0xff, (v >>> 8) & 0xff); };
    const w32 = (v) => { lh.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff); };
    w32(0x04034b50);
    w16(20);                  // version needed
    w16(0x0800);              // flag: UTF-8 文件名
    w16(0);                   // method: store
    w16(DOS_TIME); w16(DOS_DATE);
    w32(crc);
    w32(data.length); w32(data.length);
    w16(nameB.length); w16(0);
    for (let i = 0; i < nameB.length; i++) lh.push(nameB[i]);
    chunks.push(new Uint8Array(lh), data);
    list.push({ nameB, crc, size: data.length, offset });
    offset += lh.length + data.length;
  }
  const cdStart = offset;
  for (const e of list) {
    const cd = [];
    const w16 = (v) => { cd.push(v & 0xff, (v >>> 8) & 0xff); };
    const w32 = (v) => { cd.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff); };
    w32(0x02014b50);
    w16(20); w16(20);         // version made by / needed
    w16(0x0800);              // flag
    w16(0);                   // method
    w16(DOS_TIME); w16(DOS_DATE);
    w32(e.crc);
    w32(e.size); w32(e.size);
    w16(e.nameB.length);      // name len
    w16(0); w16(0);           // extra len, comment len
    w16(0); w16(0);           // disk start, internal attrs
    w32(0);                   // external attrs
    w32(e.offset);
    for (let i = 0; i < e.nameB.length; i++) cd.push(e.nameB[i]);
    central.push(new Uint8Array(cd));
    offset += cd.length;
  }
  const eocd = [];
  const e16 = (v) => { eocd.push(v & 0xff, (v >>> 8) & 0xff); };
  const e32 = (v) => { eocd.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff); };
  e32(0x06054b50);
  e16(0); e16(0);
  e16(list.length); e16(list.length);
  e32(offset - cdStart);
  e32(cdStart);
  e16(0);
  const total = chunks.reduce((s, c) => s + c.length, 0)
    + central.reduce((s, c) => s + c.length, 0) + eocd.length;
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  for (const c of central) { out.set(c, p); p += c.length; }
  out.set(new Uint8Array(eocd), p);
  return out;
}

/* ---------------------------------------------------------------- 状态初始化 */
/* GML 里 sch_exp_* / dat_* 都挂在 obj_controller 上，control_create 时就有
   固定长度的数组。JS 这边用 S 存，字段在第一次用到时补出来。 */
function ensureSchematicState() {
  if (!S.sch_exp_ins_block) {
    S.sch_exp_ins_block = new Array(256).fill(1);
    S.sch_exp_ins_data = new Array(256).fill(0);
    S.sch_exp_totalblocks = [0, 0];
    S.sch_exp_repeaters = [[0, 0, 0], [0, 0, 0]];
    S.sch_exp_maxheight = [0, 0];
    S.sch_exp_tempo = 0;
    S.sch_colamount = [[], []];
    S.schExpEnda = [0, 0];
    if (!S.lockedlayer) S.lockedlayer = [];
  }
  if (S.structure === undefined) S.structure = false;
  if (S.command_block === undefined) S.command_block = false;
  if (S.warning_schematic === undefined) S.warning_schematic = 0;
  if (S.schStatsDirty === undefined) S.schStatsDirty = true;
  // 全部默认值只补一次，之后由用户改
  if (S.sch_exp_notesperrow === undefined) resetSchematicExport(false);
  if (S.dat_name === undefined) datReset(false);
  if (S.sch_exp_tab === undefined) S.sch_exp_tab = 0;
  if (S.dat_tab === undefined) S.dat_tab = 0;
  if (S.sch_exp_scrollbar === undefined) S.sch_exp_scrollbar = 0;
}

/* ---------------------------------------------------------------- 导出主流程 */
/* 照搬 schematic_export()。
   GML 版先弹保存对话框拿文件名，再开 obj_dummy2 干活；JS 版直接算完，
   用 downloadBytes() 落地（gzzip 那一步由 gzipStore 代替）。 */
function schematicExport() {
  ensureSchematicState();

  const REPEATER = SCH_REPEATER, TORCHON = SCH_TORCHON, TORCHOFF = SCH_TORCHOFF,
    WIRE = SCH_WIRE, LADDER = SCH_LADDER, RAIL = SCH_RAIL, POWEREDRAIL = SCH_POWEREDRAIL;

  let chestx = -1, chesty = -1, chestz = -1;
  const insnum = INSTRUMENTS.length;
  const ins = [];
  const insNames = ['harp', 'bass', 'basedrum', 'snare', 'hat', 'guitar', 'flute', 'bell',
    'chime', 'xylophone', 'iron_xylophone', 'cow_bell', 'didgeridoo', 'bit', 'banjo', 'pling'];
  for (let a = 0; a < 16; a++) ins[a] = insNames[a];
  for (let a = 0; a < 240; a++) ins[16 + a] = 'harp';

  const layers = Math.ceil(S.sch_exp_maxheight[S.sch_exp_compress ? 1 : 0] / 4);
  const blockspr = S.sch_exp_notesperrow;
  const layout = S.sch_exp_layout;
  const sch_loop = (S.sch_exp_loop && layout === 0) ? 1 : 0;
  const minecart = (S.sch_exp_minecart && layout < 2) ? 1 : 0;
  const chest = (S.sch_exp_chest && minecart) ? 1 : 0;

  const len = schematicLength();
  const wid = schematicWidth();
  const hei = schematicHeight();
  const noteblocks = { n: 0, x: [], y: [], z: [], note: [], ins: [], pit: [] };

  let signx = 0, signy = 0, signz = 0;

  SCH_BLOCK = new Map();
  SCH_DATA = new Map();

  /* 原版是 for(a<len) for(b<wid) for(c<hei) 写 0 —— Map 默认就是 0，省略。
     但地面仍要按原样铺。 */
  // Create floor
  for (let a = 0; a < len; a++) {
    for (let b = 0; b < wid; b++) {
      schBlockWrite(a, b, 0, S.sch_exp_ground_block);
      schDataWrite(a, b, 0, S.sch_exp_ground_data);
    }
  }

  let cyy = 0, lturnx = -1, lturny = -1, lturndel = 0;

  if (layout < 2) {
    /* ------------------------------ 过道式（普通过道 / 环形过道） */
    // Create pillar with ladder
    let yy = Math.round(wid / 2);
    cyy = yy;
    for (let b = 1; b < hei - 2; b++) {
      for (let a = 0; a < 3; a++) blockWalkway(1, yy + a, b);
      blockOther(0, yy + 2, b, LADDER, 2);
    }
    // Create walkway
    for (let a = -minecart; a < 3 + ((minecart && layout === 0) ? 1 : 0); a++) {
      for (let b = 2; b < len; b++) {
        blockWalkway(b, yy + a, hei - 3);
        if (a === -1) {          // Minecart right side
          if (b === len - 1 && layout === 1) {
            blockWalkway(b, yy + a, hei - 2);
          } else if (b % 12 === 2) {
            blockWalkway(b, yy + a, hei - 2);
            if (b > 3) blockOther(b, yy + a, hei - 1, RAIL, 0);
          } else if (b % 12 === 3) {
            blockOther(b, yy - 1, hei - 2, POWEREDRAIL, 4);
            blockOther(b, yy - 2, hei - 2, TORCHOFF, 5);
            blockWalkway(b, yy - 2, hei - 3);
            blockOther(b, yy - 2, hei - 4, TORCHON, 5);
          } else if (b % 12 === 1) {
            blockOther(b, yy + a, hei - 2, RAIL, 5);
          } else {
            blockOther(b, yy + a, hei - 2, RAIL, 0);
          }
        }
      }
    }
    if (chest) {
      chestx = 2; chesty = yy - 1; chestz = hei - 1;
      blockOther(chestx, chesty, chestz, 54, 4);
    }
    // Controls
    blockCircuit(1, yy, hei - 2);
    blockCircuit(1, yy + 1, hei - 2);
    blockOther(1, yy, hei - 1, 35, 11);
    blockOther(1, yy + 1, hei - 1, 35, 11);
    blockOther(2, yy, hei - 1, 68, 3);
    blockOther(2, yy + 1, hei - 1, 77, 3);
    if (sch_loop) {
      blockOther(2, yy, hei - 2, 68, 3);
      blockOther(2, yy + 1, hei - 2, 69, 3 + 8);
      blockOther(1, yy + 1, hei - 3, WIRE, 15);
      blockCircuit(0, yy + 1, hei - 3);
      blockOther(0, yy, hei - 3, TORCHOFF, 1);
    }
    signx = 2; signy = yy; signz = hei - 1;
    // Back
    blockCircuit(0, yy + 1, hei - 2);
    blockOther(0, yy + 1, hei - 1, WIRE, 0);
    blockCircuit(0, yy, hei - 2);
    blockOther(0, yy, hei - 1, WIRE, 0);
    blockCircuit(0, yy - 1, hei - 2);
    blockOther(0, yy - 1, hei - 1, WIRE, 0);
    blockOther(0, yy - 2, hei - 2, TORCHON, 1);
    blockCircuit(0, yy - 2, hei - 4);
    blockOther(0, yy - 2, hei - 3, WIRE, 15);
    blockOther(0, yy - 3, hei - 4, TORCHOFF, 1);

    // Create vertical transmission
    let d = 0;
    for (let a = layers - 1; a >= 0; a--) {
      if (a > 0) {
        blockOther(0, yy - 1 - d, a * 3 + 1, TORCHON, 2);
        blockCircuit(0, yy - 1, a * 3 - 1 + d);
        blockOther(0, yy - 1, a * 3 + d, WIRE, 15);
        blockOther(0, yy - 2, a * 3 - 1 + d, TORCHOFF, 1);
      }
      let p = 0;
      let c = a * 2;
      for (let b = yy - 2 - d; b >= 0; b--) {
        blockCircuit(0, b, a * 3 + 1);
        blockOther(0, b, a * 3 + 2, WIRE, 0);
        p += 1;
        if (c > 0 && b < yy - 3 - d) {
          blockRepeater(0, b, a * 3 + 2, Math.min(4, c) - 1, 1, 0);
          c -= 4;
          p = 0;
        }
        if (p === 16 || b === 1) {
          blockRepeater(0, b, a * 3 + 2, 0, 1, 0);
          p = 0;
        }
      }
      for (let b = 0; b < 4; b++) {
        blockOther(b, 0, a * 3 + 2, WIRE, 0);
        blockCircuit(b, 0, a * 3 + 1);
      }
      // Add repeaters to even out delay
      d = d ? 0 : 1;
    }

    /* ---------------------------- 音符盒铺放（过道式） */
    let xx = 3, yy2 = 0;
    let rep = 0, dir = 1, circ = 1;
    lturnx = -1; lturny = -1; lturndel = 0;

    for (let a = 0; a <= S.enda; a++) {
      let nblocks = 0;
      const nbi = [], nbk = [], nbp = [];
      rep += 1;
      if (S.sch_exp_tempo === 1) rep += 1;
      if (S.sch_exp_tempo === 2) rep += 3;
      if (colamount[a] > 0) {
        for (let b = 0; b <= collast[a]; b++) {
          if (gExists(a, b) && (S.lockedlayer[b] === 0 || S.sch_exp_includelocked)) {
            if ((gKey(a, b) > 32 && gKey(a, b) < 58) ||
              (S.structure && S.command_block && gKey(a, b) >= 9 && gKey(a, b) <= 81)) {
              nbi[nblocks] = gIns(a, b);
              nbk[nblocks] = gKey(a, b);
              nbp[nblocks] = gPit(a, b);
              nblocks += 1;
            } else if (!S.sch_exp_compress) {
              nbi[nblocks] = -1; nbk[nblocks] = 0; nbp[nblocks] = 0; nblocks += 1;
            }
          } else if (!S.sch_exp_compress) {
            nbi[nblocks] = -1; nbk[nblocks] = 0; nbp[nblocks] = 0; nblocks += 1;
          }
        }
      }
      if (nblocks > 0 || rep === 4) {
        nblocks -= 1;
        for (let b = 0; b < layers; b++) {
          const y1 = yy2 + dir;
          blockRepeater(xx, y1, b * 3 + 2, rep - 1, 3 * (dir === 1 ? 1 : 0) + (dir === -1 ? 1 : 0), 0);
          blockCircuit(xx, y1, b * 3 + 1);
          blockCircuit(xx, y1 + dir, b * 3 + 2);
          if (b > 0) {
            blockCircuit(xx, y1, b * 3);
            blockCircuit(xx, y1 + dir, b * 3);
          }
          blockCircuit(xx, y1 + dir * 2, b * 3 + 1);
          if (nblocks > -1) {            // Note block #1
            blockOther(xx, y1 + dir, b * 3 + 1, WIRE, 0);
            if (nbi[nblocks] > -1) {
              blockOther(xx - 1, y1 + dir * 2, b * 3 + 1, 25, 0);
              blockOther(xx - 1, y1 + dir * 2, b * 3, S.sch_exp_ins_block[nbi[nblocks]], S.sch_exp_ins_data[nbi[nblocks]]);
              const k = noteblocks.n++;
              noteblocks.x[k] = xx - 1; noteblocks.y[k] = y1 + dir * 2; noteblocks.z[k] = b * 3 + 1;
              noteblocks.note[k] = nbk[nblocks] - 33;
              noteblocks.ins[k] = nbi[nblocks]; noteblocks.pit[k] = nbp[nblocks];
            }
            nblocks -= 1;
          }
          if (nblocks > -1) {            // Note block #2
            if (nbi[nblocks] > -1) {
              blockOther(xx + 1, y1 + dir * 2, b * 3 + 1, 25, 0);
              blockOther(xx + 1, y1 + dir * 2, b * 3, S.sch_exp_ins_block[nbi[nblocks]], S.sch_exp_ins_data[nbi[nblocks]]);
              const k = noteblocks.n++;
              noteblocks.x[k] = xx + 1; noteblocks.y[k] = y1 + dir * 2; noteblocks.z[k] = b * 3 + 1;
              noteblocks.note[k] = nbk[nblocks] - 33;
              noteblocks.ins[k] = nbi[nblocks]; noteblocks.pit[k] = nbp[nblocks];
            }
            nblocks -= 1;
          }
          if (nblocks > -1) {            // Note block #3
            if (nbi[nblocks] > -1) {
              blockOther(xx - 1, y1 + dir, b * 3 + 2, 25, 0);
              blockOther(xx - 1, y1 + dir, b * 3 + 1, S.sch_exp_ins_block[nbi[nblocks]], S.sch_exp_ins_data[nbi[nblocks]]);
              const k = noteblocks.n++;
              noteblocks.x[k] = xx - 1; noteblocks.y[k] = y1 + dir; noteblocks.z[k] = b * 3 + 2;
              noteblocks.note[k] = nbk[nblocks] - 33;
              noteblocks.ins[k] = nbi[nblocks]; noteblocks.pit[k] = nbp[nblocks];
            }
            nblocks -= 1;
          }
          if (nblocks > -1) {            // Note block #4
            if (nbi[nblocks] > -1) {
              blockOther(xx + 1, y1 + dir, b * 3 + 2, 25, 0);
              blockOther(xx + 1, y1 + dir, b * 3 + 1, S.sch_exp_ins_block[nbi[nblocks]], S.sch_exp_ins_data[nbi[nblocks]]);
              const k = noteblocks.n++;
              noteblocks.x[k] = xx + 1; noteblocks.y[k] = y1 + dir; noteblocks.z[k] = b * 3 + 2;
              noteblocks.note[k] = nbk[nblocks] - 33;
              noteblocks.ins[k] = nbi[nblocks]; noteblocks.pit[k] = nbp[nblocks];
            }
            nblocks -= 1;
          }
        }
        rep = 0;
        yy2 += 2 * dir;
        let turn = 0;
        // Switch direction?
        if (layout === 0) {
          if (circ === 1) {
            if (dir === 1) {
              if (xx === len - 2) {
                if (yy2 >= cyy) {
                  circ = -1;
                  turn = 0;
                  yy2 += 1;
                  for (let b = 0; b < layers; b++) {
                    for (let c = 0; c < 2; c++) {
                      blockCircuit(xx, yy2 + c, b * 3 + 1);
                      blockOther(xx, yy2 + c, b * 3 + 2, WIRE, 0);
                    }
                  }
                  yy2 += 1;
                }
              } else {
                turn = (yy2 >= cyy - 2) ? 1 : 0;
              }
            }
            if (dir === -1) turn = (yy2 <= 2) ? 1 : 0;
          } else {
            if (dir === 1) turn = (yy2 >= wid - 3) ? 1 : 0;
            if (dir === -1) turn = (yy2 <= cyy + 5) ? 1 : 0;
          }
        } else {
          if (dir === 1) turn = (yy2 >= wid - 3) ? 1 : 0;
          if (dir === -1) turn = (yy2 <= 2) ? 1 : 0;
        }
        if (a === S.enda) turn = 0;
        if (turn) {
          for (let b = 0; b < layers; b++) {   // Connect to new row
            blockOther(xx, yy2, b * 3 + 1, WIRE, 0);
            if (b > 0 && b < layers - 1) blockCircuit(xx, yy2, b * 4);
            blockOther(xx, yy2 + dir, b * 3 + 2, WIRE, 0);
            blockCircuit(xx, yy2 + dir, b * 3 + 1);
            for (let c = 0; c < 4; c++) {
              blockOther(xx + c * circ, yy2 + dir * 2, b * 3 + 2, WIRE, 0);
              blockCircuit(xx + c * circ, yy2 + dir * 2, b * 3 + 1);
            }
          }
          yy2 += dir * 2;
          dir = -dir;
          if (circ === -1 && dir === 1) {
            lturnx = xx;
            lturny = yy2 - 1;
            lturndel = (S.enda - a) - 8;
          }
          xx += 3 * circ;
          if (xx <= 0) break;
        }
      }
    }

    if (layout === 0 && minecart) {
      for (let b = 2; b < len; b++) {        // Add minecart to left side
        if (b === 2) {
          blockWalkway(b, cyy + 3, hei - 2);
        } else if (b < lturnx) {
          if (b % 12 === 6) {
            blockOther(b, cyy + 3, hei - 2, POWEREDRAIL, 8);
            blockOther(b, cyy + 2, hei - 2, TORCHON, 5);
          } else {
            blockOther(b, cyy + 3, hei - 2, RAIL, 0);
          }
        } else if (b % 12 === 6) {
          blockOther(b, cyy + 3, hei - 2, POWEREDRAIL, 5);
          blockOther(b, cyy + 4, hei - 2, TORCHOFF, 5);
          blockWalkway(b, cyy + 4, hei - 3);
          blockOther(b, cyy + 4, hei - 4, TORCHON, 5);
        } else if (b % 12 === 7) {
          blockOther(b, cyy + 3, hei - 1, RAIL, 0);
          blockWalkway(b, cyy + 3, hei - 2);
        } else if (b % 12 === 8) {
          blockOther(b, cyy + 3, hei - 2, RAIL, 4);
        } else {
          blockOther(b, cyy + 3, hei - 2, RAIL, 0);
        }
      }
      // Turn
      blockOther(len - 1, cyy - 1, hei - 2, RAIL, 8);
      blockOther(len - 1, cyy, hei - 2, RAIL, 1);
      blockOther(len - 1, cyy + 1, hei - 2, RAIL, 1);
      blockOther(len - 1, cyy + 2, hei - 2, RAIL, 1);
      blockOther(len - 1, cyy + 3, hei - 2, RAIL, 9);
    }

    if (sch_loop && lturnx > -1) {           // Loop
      let xx2 = lturnx, yy3 = lturny;
      const zz = (layers - 1) * 3;
      blockOther(xx2, yy3, zz + 1, TORCHON, 1);
      let aa = 15;
      for (let b = xx2 - 1; b > 3; b--) {
        if (zz > 0) blockCircuit(b, yy3, zz);
        if (lturndel > 0 || aa === 0) {
          blockRepeater(b, yy3, zz + 1, median(1, lturndel, 4) - 1, 0, 1);
          lturndel -= 4;
          aa = 15;
        } else {
          blockOther(b, yy3, zz + 1, WIRE, aa);
          blockCircuit(b, yy3, zz + 2);
          aa -= 1;
        }
      }
      blockOther(2, cyy + 1, hei - 4, TORCHON, 5);
      blockCircuit(2, cyy + 1, hei - 5);
      blockOther(2, cyy + 1, hei - 6, TORCHOFF, 4);
      blockCircuit(3, cyy + 1, hei - 6);
    }
  } else {
    /* ------------------------------ 经典布局 */
    // Floor
    for (let a = 0; a < len; a++) {
      for (let b = 0; b < wid - 1; b++) {
        if (a > 0 && b > 0 && a < len - 1 && b < wid - 2 && S.sch_exp_glass) {
          blockOther(a, b, hei - 3, 20, 0);
          blockOther(a, b, hei - 3, 20, 0);
        } else {
          blockWalkway(a, b, hei - 3);
          blockWalkway(a, b, hei - 3);
        }
      }
    }
    // Controls
    blockWalkway(2, wid - 2, hei - 2);
    blockWalkway(3, wid - 2, hei - 2);
    blockOther(2, wid - 2, hei - 1, 35, 11);
    blockOther(3, wid - 2, hei - 1, 35, 11);
    blockOther(2, wid - 3, hei - 1, 68, 5);
    blockOther(3, wid - 3, hei - 1, 77, 1);
    // Back
    blockOther(3, wid - 1, hei - 1, WIRE, 0);
    blockCircuit(3, wid - 1, hei - 2);
    blockOther(2, wid - 1, hei - 2, WIRE, 0);
    blockCircuit(2, wid - 1, hei - 3);
    blockOther(1, wid - 1, hei - 3, TORCHON, 4);
    // Layers
    let c = 1;
    for (let a = layers - 1; a >= 0; a--) {
      let d = a * 2;
      for (let b = wid - 2 - c; b > wid - 8; b--) {
        blockCircuit(1, b, a * 3 + 1);
        if (d > 0 && b < wid - 2 - c) {
          blockRepeater(1, b, a * 3 + 2, Math.min(4, d) - 1, 1, 0);
          d -= 4;
        } else {
          blockOther(1, b, a * 3 + 2, WIRE, 0);
        }
      }
      if (a > 0) blockOther(1, wid - 1 - c, a * 3 + 1, TORCHON, 2);
      blockCircuit(1, wid - 1, a * 3 + 3 - c);
      blockOther(1, wid - 1, a * 3 + 4 - c, WIRE, 15);
      blockOther(1, wid - 2, a * 3 + 3 - c, TORCHOFF, 1);
      c = c ? 0 : 1;
    }
    // Ladder
    for (let cc = 1; cc < hei - 2; cc++) {
      blockWalkway(0, wid - 2, cc);
      blockOther(0, wid - 1, cc, 65, 4);
    }
    signx = 2; signy = wid - 3; signz = hei - 1;
    let xx = 1, yy = wid - 7;
    let rep = 0, dir = -1;
    for (let a = 0; a <= S.enda; a++) {
      let nblocks = 0;
      const nbi = [], nbk = [], nbp = [];
      rep += 1;
      if (S.sch_exp_tempo === 1) rep += 1;
      if (S.sch_exp_tempo === 2) rep += 3;
      if (colamount[a] > 0) {
        for (let b = 0; b <= collast[a]; b++) {
          if (gExists(a, b) && (S.lockedlayer[b] === 0 || S.sch_exp_includelocked)) {
            if ((gKey(a, b) > 32 && gKey(a, b) < 58) ||
              (S.structure && S.command_block && gKey(a, b) >= 9 && gKey(a, b) <= 81)) {
              nbi[nblocks] = gIns(a, b);
              nbk[nblocks] = gKey(a, b);
              nbp[nblocks] = gPit(a, b);
              nblocks += 1;
            } else if (!S.sch_exp_compress) {
              nbi[nblocks] = -1; nbk[nblocks] = 0; nbp[nblocks] = 0; nblocks += 1;
            }
          } else if (!S.sch_exp_compress) {
            nbi[nblocks] = -1; nbk[nblocks] = 0; nbp[nblocks] = 0; nblocks += 1;
          }
        }
      }
      if (nblocks > 0 || rep === 4) {
        nblocks -= 1;
        for (let b = 0; b < layers; b++) {
          const y1 = yy + dir;
          blockRepeater(xx, y1, b * 3 + 2, rep - 1, 3 * (dir === 1 ? 1 : 0) + (dir === -1 ? 1 : 0), 0);
          blockCircuit(xx, y1, b * 3 + 1);
          blockCircuit(xx, y1 + dir, b * 3 + 2);
          if (b > 0) {
            blockCircuit(xx, y1, b * 3);
            blockCircuit(xx, y1 + dir, b * 3);
          }
          blockCircuit(xx, y1 + dir * 2, b * 3 + 1);
          if (nblocks > -1) {
            blockOther(xx, y1 + dir, b * 3 + 1, WIRE, 0);
            if (nbi[nblocks] > -1) {
              blockOther(xx - 1, y1 + dir * 2, b * 3 + 1, 25, 0);
              blockOther(xx - 1, y1 + dir * 2, b * 3, S.sch_exp_ins_block[nbi[nblocks]], S.sch_exp_ins_data[nbi[nblocks]]);
              const k = noteblocks.n++;
              noteblocks.x[k] = xx - 1; noteblocks.y[k] = y1 + dir * 2; noteblocks.z[k] = b * 3 + 1;
              noteblocks.note[k] = nbk[nblocks] - 33;
              noteblocks.ins[k] = nbi[nblocks]; noteblocks.pit[k] = nbp[nblocks];
            }
            nblocks -= 1;
          }
          if (nblocks > -1) {
            if (nbi[nblocks] > -1) {
              blockOther(xx + 1, y1 + dir * 2, b * 3 + 1, 25, 0);
              blockOther(xx + 1, y1 + dir * 2, b * 3, S.sch_exp_ins_block[nbi[nblocks]], S.sch_exp_ins_data[nbi[nblocks]]);
              const k = noteblocks.n++;
              noteblocks.x[k] = xx + 1; noteblocks.y[k] = y1 + dir * 2; noteblocks.z[k] = b * 3 + 1;
              noteblocks.note[k] = nbk[nblocks] - 33;
              noteblocks.ins[k] = nbi[nblocks]; noteblocks.pit[k] = nbp[nblocks];
            }
            nblocks -= 1;
          }
          if (nblocks > -1) {
            if (nbi[nblocks] > -1) {
              blockOther(xx - 1, y1 + dir, b * 3 + 2, 25, 0);
              blockOther(xx - 1, y1 + dir, b * 3 + 1, S.sch_exp_ins_block[nbi[nblocks]], S.sch_exp_ins_data[nbi[nblocks]]);
              const k = noteblocks.n++;
              noteblocks.x[k] = xx - 1; noteblocks.y[k] = y1 + dir; noteblocks.z[k] = b * 3 + 2;
              noteblocks.note[k] = nbk[nblocks] - 33;
              noteblocks.ins[k] = nbi[nblocks]; noteblocks.pit[k] = nbp[nblocks];
            }
            nblocks -= 1;
          }
          if (nblocks > -1) {
            if (nbi[nblocks] > -1) {
              blockOther(xx + 1, y1 + dir, b * 3 + 2, 25, 0);
              blockOther(xx + 1, y1 + dir, b * 3 + 1, S.sch_exp_ins_block[nbi[nblocks]], S.sch_exp_ins_data[nbi[nblocks]]);
              const k = noteblocks.n++;
              noteblocks.x[k] = xx + 1; noteblocks.y[k] = y1 + dir; noteblocks.z[k] = b * 3 + 2;
              noteblocks.note[k] = nbk[nblocks] - 33;
              noteblocks.ins[k] = nbi[nblocks]; noteblocks.pit[k] = nbp[nblocks];
            }
            nblocks -= 1;
          }
        }
        rep = 0;
        yy += 2 * dir;
        let turn = 0;
        if (dir === 1) turn = (yy >= wid - 4) ? 1 : 0;
        if (dir === -1) turn = (yy <= 2) ? 1 : 0;
        if (a === S.enda) turn = 0;
        if (turn) {
          for (let b = 0; b < layers; b++) {   // Connect to new row
            blockOther(xx, yy, b * 3 + 1, WIRE, 0);
            if (b > 0) blockCircuit(xx, yy, b * 4);
            blockOther(xx, yy + dir, b * 3 + 2, WIRE, 0);
            blockCircuit(xx, yy + dir, b * 3 + 1);
            for (let cc = 0; cc < 4; cc++) {
              blockOther(xx + cc, yy + dir * 2, b * 3 + 2, WIRE, 0);
              blockCircuit(xx + cc, yy + dir * 2, b * 3 + 1);
            }
          }
          yy += dir * 2;
          dir = -dir;
          xx += 3;
        }
      }
    }
  }

  /* ------------------------------ 写 NBT */
  return schematicWriteNbt({
    len, wid, hei, insnum, ins, noteblocks, sch_loop, minecart, chest,
    signx, signy, signz, chestx, chesty, chestz, cyy,
  });
}

/* 把上层收集到的数据写成 NBT 字节，然后 gzip 落地。
   对照 schematic_export.gml 第 585 行之后的 buffer 写入段。 */
function schematicWriteNbt(m) {
  const { len, wid, hei, insnum, ins, noteblocks, sch_loop, minecart, chest,
    signx, signy, signz, chestx, chesty, chestz, cyy } = m;
  const w = new NbtWriter();
  const old = !!S.sch_exp_minecraft_old;
  const structure = !!S.structure;

  if (!structure) {
    w.tagCompound('Schematic');
    w.tagShort('Height', hei);
    w.tagShort('Length', len);
    w.tagShort('Width', wid);
    w.tagList('Entities', minecart, 10);
    if (minecart) {
      w.tagString('id', old ? 'Minecart' : 'minecraft:minecart');
      w.tagByte('OnGround', 0);
      w.tagShort('Air', 300);
      w.tagShort('Fire', -1);
      w.tagInt('Type', 0);
      w.tagFloat('FallDistance', 0);
      w.tagList('Motion', 3, 6);
      w.beDouble(0); w.beDouble(0); w.beDouble(0);
      w.tagList('Pos', 3, 6);
      w.beDouble(wid - 1 - (cyy - 1 - 0.5));
      w.beDouble(hei - 1);
      w.beDouble(3.5);
      w.tagList('Rotation', 2, 5);
      w.beFloat(0); w.beFloat(0);
      w.tagEnd();
    }
    w.tagList('TileEntities', 1 + noteblocks.n + sch_loop + chest, 10);
    w.tagString('id', old ? 'Sign' : 'minecraft:sign');
    w.tagInt('x', wid - 1 - signy);
    w.tagInt('y', signz);
    w.tagInt('z', signx);
    if (old) {
      w.tagString('Text1', 'Song generated');
      w.tagString('Text2', 'by the');
      w.tagString('Text3', 'Minecraft Note');
      w.tagString('Text4', 'Block Studio');
    } else {
      w.tagString('Text1', '{"text": "Song generated"}');
      w.tagString('Text2', '{"text": "by the"}');
      w.tagString('Text3', '{"text": "Minecraft Note"}');
      w.tagString('Text4', '{"text": "Block Studio"}');
    }
    w.tagEnd();
    if (sch_loop) {
      w.tagString('id', old ? 'Sign' : 'minecraft:sign');
      w.tagInt('x', wid - 1 - signy);
      w.tagInt('y', signz - 1);
      w.tagInt('z', signx);
      if (old) {
        w.tagString('Text1', 'Looping ON');
        w.tagString('Text2', '');
        w.tagString('Text3', '');
        w.tagString('Text4', 'Looping OFF');
      } else {
        w.tagString('Text1', '{"text": "Looping ON"}');
        w.tagString('Text2', '{"text": ""}');
        w.tagString('Text3', '{"text": ""}');
        w.tagString('Text4', '{"text": "Looping OFF"}');
      }
      w.tagEnd();
    }
    for (let a = 0; a < noteblocks.n; a++) {
      w.tagString('id', old ? 'Music' : 'minecraft:noteblock');
      w.tagInt('x', wid - 1 - noteblocks.y[a]);
      w.tagInt('y', noteblocks.z[a]);
      w.tagInt('z', noteblocks.x[a]);
      w.tagByte('note', noteblocks.note[a]);
      w.tagEnd();
    }
    if (chest) {
      w.tagString('id', old ? 'Chest' : 'minecraft:chest');
      w.tagInt('x', wid - 1 - chesty);
      w.tagInt('y', chestz);
      w.tagInt('z', chestx);
      w.tagList('Items', 27, 10);
      for (let a = 0; a < 27; a++) {
        w.tagString('id', old ? '328' : 'minecraft:minecart');
        w.tagShort('Damage', 0);
        w.tagByte('Count', 1);
        w.tagByte('Slot', a);
        w.tagEnd();
      }
      w.tagEnd();
    }
    w.tagString('Materials', 'Alpha');
    w.tagByteArray('Blocks', len * wid * hei);
    for (let c = 0; c < hei; c++) {
      for (let a = 0; a < len; a++) {
        for (let b = wid - 1; b >= 0; b--) w.byte(schBlockRead(a, b, c));
      }
    }
    w.tagByteArray('Data', len * wid * hei);
    for (let c = 0; c < hei; c++) {
      for (let a = 0; a < len; a++) {
        for (let b = wid - 1; b >= 0; b--) w.byte(schDataRead(a, b, c));
      }
    }
    w.tagCompound('Version');
    if (old) {
      w.tagString('Name', '1.8');
      w.tagByte('Snapshot', 0);
    } else {
      w.tagInt('Id', 922);
      w.tagString('Name', '1.11.2');
      w.tagByte('Snapshot', 0);
    }
    w.tagEnd();
    w.tagEnd();
  } else {
    /* ------------------------ 1.13+ 结构方块格式 ------------------------ */
    w.tagCompound('');
    w.tagInt('DataVersion', 1519);
    w.tagList('size', 3, 3);
    w.be32(32);
    w.be32(hei);
    w.be32(len <= 32 ? len : 32);
    w.tagList('palette', 29 + insnum * 26, 10);
    // 0..2：过道 / 电路 / 地面
    w.tagString('Name', 'minecraft:' + blockGetNamespacedId(S.sch_exp_walkway_block, S.sch_exp_walkway_data));
    w.tagEnd();
    w.tagString('Name', 'minecraft:' + blockGetNamespacedId(S.sch_exp_circuit_block, S.sch_exp_circuit_data));
    w.tagEnd();
    w.tagString('Name', 'minecraft:' + blockGetNamespacedId(S.sch_exp_ground_block, S.sch_exp_ground_data));
    w.tagEnd();
    // 3 .. 3+insnum-1：各音色的底座方块
    for (let a = 0; a < insnum; a++) {
      w.tagString('Name', 'minecraft:' + blockGetNamespacedId(S.sch_exp_ins_block[a], S.sch_exp_ins_data[a]));
      if (a === 9) {
        w.tagCompound('Properties');
        w.tagString('axis', 'y');
        w.tagEnd();
      }
      w.tagEnd();
    }
    // 之后：每个音色 25 个音符盒状态
    for (let a = 0; a < insnum; a++) {
      for (let b = 0; b < 25; b++) {
        if (!S.command_block) {
          w.tagString('Name', 'minecraft:note_block');
          w.tagCompound('Properties');
          w.tagString('instrument', ins[a]);
          w.tagString('note', String(b));
          w.tagString('powered', 'false');
          w.tagEnd();
          w.tagEnd();
        } else {
          w.tagString('Name', 'minecraft:command_block');
          w.tagCompound('Properties');
          w.tagString('facing', 'up');
          w.tagEnd();
          w.tagEnd();
        }
      }
    }
    const palStr = (name, props) => {
      w.tagString('Name', name);
      if (props) {
        w.tagCompound('Properties');
        for (const k of Object.keys(props)) w.tagString(k, props[k]);
        w.tagEnd();
      }
      w.tagEnd();
    };
    palStr('minecraft:blue_wool');
    palStr('minecraft:air');
    palStr('minecraft:ladder', { facing: 'north', waterlogged: 'false' });
    palStr('minecraft:redstone_wire', { east: 'side', north: 'side', power: '0', south: 'side', west: 'side' });
    for (let a = 1; a < 5; a++) palStr('minecraft:repeater', { delay: String(a), facing: 'east', locked: 'false', powered: 'false' });
    for (let a = 1; a < 5; a++) palStr('minecraft:repeater', { delay: String(a), facing: 'west', locked: 'false', powered: 'false' });
    palStr('minecraft:repeater', { delay: '4', facing: 'south', locked: 'false', powered: 'true' });
    palStr('minecraft:redstone_torch', { lit: 'false' });
    palStr('minecraft:redstone_torch', { lit: 'true' });
    palStr('minecraft:stone_button', { face: 'wall', facing: 'south', powered: 'false' });
    palStr('minecraft:oak_wall_sign', { facing: 'south', waterlogged: 'false' });
    palStr('minecraft:powered_rail', { powered: 'false', shape: 'north_south' });
    palStr('minecraft:chest', { facing: 'west', type: 'single', waterlogged: 'false' });
    palStr('minecraft:rail', { shape: 'north_south', waterlogged: 'false' });
    palStr('minecraft:redstone_wall_torch', { lit: 'false', facing: 'east' });
    palStr('minecraft:redstone_wall_torch', { lit: 'true', facing: 'east' });
    palStr('minecraft:redstone_wall_torch', { lit: 'false', facing: 'west' });
    palStr('minecraft:redstone_wall_torch', { lit: 'true', facing: 'west' });
    palStr('minecraft:lever', { powered: 'true', facing: 'south', face: 'wall' });
    palStr('minecraft:redstone_wall_torch', { lit: 'true', facing: 'north' });

    w.tagList('entities', minecart, 10);
    if (minecart) {
      w.tagList('pos', 3, 6);
      w.beDouble(wid - 1 - (cyy - 1 - 0.5));
      w.beDouble(hei - 1);
      w.beDouble(3.5);
      w.tagList('blockPos', 3, 3);
      w.be32(wid - 1 - (cyy - 1 - 0.5) - 0.5);
      w.be32(hei - 1);
      w.be32(3);
      w.tagCompound('');
      w.tagByte('OnGround', 0);
      w.tagShort('Air', 300);
      w.tagShort('Fire', -1);
      w.tagFloat('FallDistance', 0);
      w.tagList('Motion', 3, 6);
      w.beDouble(0); w.beDouble(0); w.beDouble(0);
      w.tagList('Rotation', 2, 5);
      w.beFloat(0); w.beFloat(0);
      w.tagList('Pos', 3, 6);
      w.beDouble(wid - 1 - (cyy - 1 - 0.5));
      w.beDouble(hei - 1);
      w.beDouble(3.5);
      w.tagEnd();
      w.tagEnd();
    }

    w.tagList('blocks', hei * len * wid + 1 + sch_loop, 10);
    // 告示牌（方块实体写在 nbt 里）
    w.tagCompound('nbt');
    w.tagString('Color', 'black');
    w.tagString('id', 'minecraft:sign');
    w.tagString('Text1', '{"text": "Song generated"}');
    w.tagString('Text2', '{"text": "by the"}');
    w.tagString('Text3', '{"text": "Minecraft Note"}');
    w.tagString('Text4', '{"text": "Block Studio"}');
    w.tagEnd();
    w.tagList('pos', 3, 3);
    w.be32(wid - 1 - signy);
    w.be32(signz);
    w.be32(signx);
    w.tagInt('state', insnum * 26 + 19);
    w.tagEnd();
    if (sch_loop) {
      w.tagCompound('nbt');
      w.tagString('Color', 'black');
      w.tagString('id', 'minecraft:sign');
      w.tagString('Text1', '{"text": "Looping ON"}');
      w.tagString('Text2', '{"text": ""}');
      w.tagString('Text3', '{"text": ""}');
      w.tagString('Text4', '{"text": "Looping OFF"}');
      w.tagEnd();
      w.tagList('pos', 3, 3);
      w.be32(wid - 1 - signy);
      w.be32(signz - 1);
      w.be32(signx);
      w.tagInt('state', insnum * 26 + 19);
      w.tagEnd();
    }
    for (let a = 0; a < noteblocks.n; a++) {
      if (S.command_block) {
        w.tagCompound('nbt');
        let soundname = datInstrument(noteblocks.ins[a]);
        const pv = noteblocks.note[a] + noteblocks.pit[a] / 100;
        const soundpitch = datPitch(noteblocks.note[a] + 33 + noteblocks.pit[a] / 100);
        if (pv < 0) soundname += '_-1';
        else if (pv > 24) soundname += '_1';
        w.tagString('Command', 'playsound ' + soundname + ' block @a ~ ~ ~ 3 ' + gs(soundpitch));
        w.tagByte('TrackOutput', 0);
        w.tagByte('powered', 0);
        w.tagByte('auto', 0);
        w.tagByte('conditionMet', 1);
        w.tagByte('UpdateLastExecution', 1);
        w.tagEnd();
      }
      w.tagList('pos', 3, 3);
      w.be32(wid - 1 - noteblocks.y[a]);
      w.be32(noteblocks.z[a]);
      w.be32(noteblocks.x[a]);
      w.tagInt('state', 3 + insnum + (noteblocks.ins[a] * 25 + noteblocks.note[a]) * (S.command_block ? 0 : 1));
      w.tagEnd();
    }
    if (chest) {
      w.tagCompound('nbt');
      w.tagList('Items', 27, 10);
      for (let a = 0; a < 27; a++) {
        w.tagByte('Count', 1);
        w.tagString('id', 'minecraft:minecart');
        w.tagByte('Slot', a);
        w.tagEnd();
      }
      w.tagString('id', 'minecraft:chest');
      w.tagEnd();
      w.tagList('pos', 3, 3);
      w.be32(wid - 1 - chesty);
      w.be32(chestz);
      w.be32(chestx);
      w.tagInt('state', insnum * 26 + 21);
      w.tagEnd();
    }
    // 其余方块
    for (let c = 0; c < hei; c++) {
      for (let a = 0; a < len; a++) {
        for (let b = wid - 1; b >= 0; b--) {
          const blk = schBlockRead(a, b, c);
          if (blk !== 25 && blk !== 54) {
            w.tagList('pos', 3, 3);
            w.be32(wid - b - 1);
            w.be32(c);
            w.be32(a);
            const dat = schDataRead(a, b, c);
            if (blk === 0) w.tagInt('state', insnum * 26 + 4);
            else if (blk === S.sch_exp_walkway_block && dat === S.sch_exp_walkway_data) w.tagInt('state', 0);
            else if (blk === S.sch_exp_circuit_block && dat === S.sch_exp_circuit_data) w.tagInt('state', 1);
            else if (blk === S.sch_exp_ground_block && dat === S.sch_exp_ground_data) w.tagInt('state', 2);
            else if (blk === 35 && dat === 11) w.tagInt('state', insnum * 26 + 3);
            else if (blk === 65) w.tagInt('state', insnum * 26 + 5);
            else if (blk === 55) w.tagInt('state', insnum * 26 + 6);
            else if (blk === 93 && dat === 3) w.tagInt('state', insnum * 26 + 7);
            else if (blk === 93 && dat === 3 + 4) w.tagInt('state', insnum * 26 + 8);
            else if (blk === 93 && dat === 3 + 4 * 2) w.tagInt('state', insnum * 26 + 9);
            else if (blk === 93 && dat === 3 + 4 * 3) w.tagInt('state', insnum * 26 + 10);
            else if (blk === 93 && dat === 1) w.tagInt('state', insnum * 26 + 11);
            else if (blk === 93 && dat === 1 + 4) w.tagInt('state', insnum * 26 + 12);
            else if (blk === 93 && dat === 1 + 4 * 2) w.tagInt('state', insnum * 26 + 13);
            else if (blk === 93 && dat === 1 + 4 * 3) w.tagInt('state', insnum * 26 + 14);
            else if (blk === 94) w.tagInt('state', insnum * 26 + 15);
            else if (blk === 75 && dat === 5) w.tagInt('state', insnum * 26 + 16);
            else if (blk === 76 && dat === 5) w.tagInt('state', insnum * 26 + 17);
            else if (blk === 77) w.tagInt('state', insnum * 26 + 18);
            else if (blk === 27) w.tagInt('state', insnum * 26 + 20);
            else if (blk === 66) w.tagInt('state', insnum * 26 + 22);
            else if (blk === 75 && dat === 1) w.tagInt('state', insnum * 26 + 23);
            else if (blk === 76 && dat === 1) w.tagInt('state', insnum * 26 + 24);
            else if (blk === 75 && dat === 2) w.tagInt('state', insnum * 26 + 25);
            else if (blk === 76 && dat === 2) w.tagInt('state', insnum * 26 + 26);
            else if (blk === 69) w.tagInt('state', insnum * 26 + 27);
            else if (blk === 75 && dat === 4) w.tagInt('state', insnum * 26 + 28);
            else {
              let done = false;
              for (let i = 0; i < insnum; i++) {
                if (blk === S.sch_exp_ins_block[i] && dat === S.sch_exp_ins_data[i]) { w.tagInt('state', 3 + i); done = true; break; }
              }
              if (!done) w.tagInt('state', insnum * 26 + 4);
            }
            w.tagEnd();
          }
        }
      }
    }
    w.tagEnd();
  }

  const raw = w.bytes();
  const gz = gzipStore(raw);
  const base = S.structure
    ? (String(S.filename || S.song_name || 'song').toLowerCase().replace(/ /g, '_').replace(/\.[^.]*$/, '') + '.nbt')
    : (String(S.filename || S.song_name || 'song').replace(/\.[^.]*$/, '') + '.schematic');
  downloadBytes(gz, base);
  return gz;
}

/* ---------------------------------------------------------------- 数据包导出 */
/* 照搬 dat_generate(functionpath, functiondir, objective)。
   GML 版通过 dat_writefile 落盘；这里改成往 files 数组里 push，
   最后统一 zipStore 打包。functiondir 变成 zip 内的路径前缀。 */
function datGenerate(files, functionpath, functiondir, objective) {
  const source = S.dat_source;
  const br = '\r\n';
  const lockedAllowed = (b) => S.lockedlayer[b] === 0 || S.dat_includelocked;

  for (let a = 0; a <= S.enda; a++) {
    if (colamount[a] > 0) {
      let str = '';
      for (let b = 0; b <= collast[a]; b++) {
        if (gExists(a, b) && lockedAllowed(b)) {
          const key = gKey(a, b) + gPit(a, b) / 100;
          if ((key >= 33 && key <= 57) || (S.dat_includeoutofrange && key >= 9 && key <= 81)) {
            const insIndex = gIns(a, b);
            const instrument = datInstrument(insIndex);
            const pitch = datPitch(key);
            const blockvolume = S.layervol[b] / 100 / 100 * gVel(a, b);
            const s = (S.layerstereo[b] + gPan(a, b)) / 2;
            let blockposition = 0;
            if (s > 100) blockposition = (s - 100) / -100;
            if (s === 100) blockposition = 0;
            if (s < 100) blockposition = ((s - 100) * -1) / 100;

            let soundname = instrument;
            if (key < 33) soundname += '_-1';
            else if (key > 57) soundname += '_1';

            if (S.dat_enableradius) {
              str += 'execute at @s run playsound ' + soundname + ' ' + source + ' @a ~ ~ ~ ' +
                gs(S.dat_radiusvalue) + ' ' + gs(pitch) + br;
            } else {
              str += 'playsound ' + soundname + ' ' + source + ' @s ^' + gs(blockposition * 2) +
                ' ^ ^ ' + gs(blockvolume) + ' ' + gs(pitch) + ' 1' + br;
            }

            if (S.dat_visualizer === 1) {
              const insIndex2 = insIndex;
              const team_number = String(insIndex2 + 1);
              const numeric_id = S.sch_exp_ins_block[insIndex2];
              const block_id = blockGetNamespacedId(numeric_id, 0);
              const xv = (v) => gs(v);
              const glow = S.dat_glow === 1;
              const tags = 'Tags:["nbs","nbs_' + team_number + '"],Glowing:1,';
              const vtype = S.dat_vis_type;
              if (vtype === 'Arc') {
                str += 'summon minecraft:falling_block ' + xv((key - 45) * -1 + S.dat_xval) + ' ' +
                  xv(S.dat_yval) + ' ' + xv((insIndex2 * 2) + S.dat_zval) +
                  ' {BlockState:{Name:"minecraft:' + block_id + '"},' + (glow ? tags : '') +
                  'Time:-120,DropItem:0,Motion:[0.0d,1.0d,1.0d]}' + br;
                if (glow) str += 'team join nbs_' + team_number + ' @e[tag=nbs_' + team_number + ']' + br;
              } else if (vtype === 'Fall') {
                str += 'summon minecraft:falling_block ' + xv(key - 45 + S.dat_xval) + ' ' +
                  xv(S.dat_yval) + ' ' + xv((insIndex2 * 2) + S.dat_zval) +
                  ' {BlockState:{Name:"minecraft:' + block_id + '"},' + (glow ? tags : '') +
                  'Time:-80,DropItem:0,Motion:[0.0d,-1.3d,0.0d]}' + br;
                if (glow) str += 'team join nbs_' + team_number + ' @e[tag=nbs_' + String(insIndex2 + 1) + ']' + br;
              } else if (vtype === 'Piano Roll') {
                str += 'summon minecraft:falling_block ' + xv((key - 45) * -1 + S.dat_xval) + ' ' +
                  xv(S.dat_yval) + ' ' + xv(S.dat_zval) +
                  ' {BlockState:{Name:"minecraft:' + block_id + '"},' + (glow ? tags : '') +
                  'Time:-50,DropItem:0,NoGravity:1,Motion:[0.0d,0.0d,2.5d]}' + br;
                if (glow) str += 'team join nbs_' + team_number + ' @e[tag=nbs_' + String(insIndex2 + 1) + ']' + br;
              } else if (vtype === 'Rise') {
                str += 'summon minecraft:falling_block ' + xv(key - 45 + S.dat_xval) + ' ' +
                  xv(S.dat_yval) + ' ' + xv((insIndex2 * 2) + S.dat_zval) +
                  ' {BlockState:{Name:"minecraft:' + block_id + '"},' + (glow ? tags : '') +
                  'Time:-50,DropItem:0,Glowing:1,NoGravity:1,Motion:[0.0d,1.0d,0.0d]}' + br;
                if (glow) str += 'team join nbs_' + team_number + ' @e[tag=nbs_' + String(insIndex2 + 1) + ']' + br;
              } else if (vtype === 'Bounce') {
                str += 'summon minecraft:falling_block ' + team_number + ' ' + xv(S.dat_yval) + ' ' +
                  xv((insIndex2 * 2) + S.dat_zval) +
                  ' {BlockState:{Name:"minecraft:' + block_id + '"},' + (glow ? tags : '') +
                  'Time:-80,DropItem:0,Motion:[0.0d,1.3d,0.0d]}' + br;
                if (glow) str += 'team join nbs_' + team_number + ' @e[tag=nbs_' + String(insIndex2 + 1) + ']' + br;
              } else if (vtype === 'Fountain') {
                str += 'summon minecraft:falling_block ' + team_number + ' ' + xv(S.dat_yval) + ' ' +
                  xv((insIndex2 * 2) + S.dat_zval) +
                  ' {BlockState:{Name:"minecraft:' + block_id + '"},' + (glow ? tags : '');
                if (key > 45) str += 'Time:-80,DropItem:0,Motion:[0.5d,1.5d,0.0d]}' + br;
                else str += 'Time:-80,DropItem:0,Motion:[-0.5d,1.5d,0.0d]}' + br;
                if (glow) str += 'team join nbs_' + team_number + ' @e[tag=nbs_' + String(insIndex2) + ']' + br;
              } else if (vtype === 'Rittai Onkyou') {
                str += 'summon minecraft:falling_block ' + gs(blockposition * 48) + ' 90 ' + gs(blockvolume * 48) +
                  ' {"Tags":["nbs"],BlockState:{Name:"minecraft:' + block_id + '"},Time:-80,DropItem:0,Motion:[0.0d,-1.3d,0.0d]}' + br +
                  'summon minecraft:falling_block ' + gs(blockposition * 48) + ' 90 ' + gs((blockvolume * 48) - 1) +
                  ' {"Tags":["nbs"],BlockState:{Name:"minecraft:note_block"},Time:-80,DropItem:0,Motion:[0.0d,-1.3d,0.0d]}' + br +
                  'particle minecraft:note ' + gs(blockposition * 48) + ' 90 ' + gs((blockvolume * 48) - 2) +
                  ' 0 0 0 1 1 force @p' + br;
              }
            }
          }
        }
      }
      if (a < S.enda) {
        str += 'scoreboard players set @s ' + objective + '_t ' + a;
      } else {                                 // Last tick
        if (S.dat_enablelooping) {
          str += 'scoreboard players set @s ' + objective + ' ' + (S.loopstart * 80) + br;
          str += 'scoreboard players set @s ' + objective + '_t ' + (S.loopstart - 1);
        } else {
          str += 'function ' + functionpath + 'stop';
        }
      }
      files.push({ name: functiondir + 'notes/' + a + '.mcfunction', text: str });
    }
  }

  /* 生成二分查找树，找出当前应该播放哪一拍 */
  const length = S.enda;
  const steps = Math.floor(Math.log2(length || 1)) + 1;
  const pow = Math.pow(2, steps);
  for (let step = 0; step < steps; step++) {
    const searchrange = Math.floor(pow / Math.pow(2, step));
    const segments = Math.floor(pow / searchrange);
    for (let segment = 0; segment < segments; segment++) {
      let str = '';
      const half = Math.floor(searchrange / 2);
      const lower = searchrange * segment;
      const min1 = lower;
      const max1 = lower + half - 1;
      const min2 = lower + half;
      const max2 = lower + searchrange - 1;
      if (min1 <= length) {
        if (step === steps - 1) {             // Last step, play the tick
          if (colamount[min1] > 0) {
            str += 'execute as @s[scores={' + objective + '=' + (min1 * 80) + '..' + ((max1 + 1) * 80 + 160) +
              ',' + objective + '_t=..' + (min1 - 1) + '}] run function ' + functionpath + 'notes/' + min1 + '\r\n';
          }
          if (min2 <= length) {
            if (colamount[min2] > 0) {
              str += 'execute as @s[scores={' + objective + '=' + (min2 * 80) + '..' + ((max2 + 1) * 80 + 160) +
                ',' + objective + '_t=..' + (min2 - 1) + '}] run function ' + functionpath + 'notes/' + min2 + '\r\n';
            }
          }
        } else {                              // Don't play yet, refine the search
          for (let i = min1; i <= Math.min(max1, length); i++) {
            if (colamount[i] > 0) {
              str += 'execute as @s[scores={' + objective + '=' + (min1 * 80) + '..' + ((max1 + 1) * 80 + 160) +
                '}] run function ' + functionpath + 'tree/' + min1 + '_' + max1 + '\r\n';
              break;
            }
          }
          for (let i = min2; i <= Math.min(max2, length); i++) {
            if (colamount[i] > 0) {
              str += 'execute as @s[scores={' + objective + '=' + (min2 * 80) + '..' + ((max2 + 2) * 80 + 160) +
                '}] run function ' + functionpath + 'tree/' + min2 + '_' + max2 + '\r\n';
              break;
            }
          }
        }
        if (str !== '') files.push({ name: functiondir + 'tree/' + min1 + '_' + max2 + '.mcfunction', text: str });
      } else break;
    }
  }
}

/* 照搬 datapack_export()。原版跑 7za 打包，这里用 zipStore 手写 ZIP。 */
function datapackExport() {
  ensureSchematicState();
  const o = S;
  calculateLockedLayers();

  const name = stringPath(o.dat_name);
  let namespace = stringPath(o.dat_namespace);
  let path = datGetPath(o.dat_path);
  const objective = 'nbs_' + stringLettersDigits(o.dat_name).slice(0, 10);
  const tag = objective;

  const pack_format = (o.dat_mcversion === 0) ? 41 : 48;
  const function_registry = (o.dat_mcversion === 0) ? 'functions' : 'function';

  const playspeed = Math.min(Math.round(o.tempo * 4), 120);
  const rootfunction = '0_' + gs(Math.pow(2, Math.floor(Math.log2(o.enda || 1)) + 1) - 1);
  const add_teams = (o.dat_visualizer && o.dat_glow) ? 1 : 0;
  const br = '\r\n';

  /* 命名空间 / 路径解析（照搬 40-50 行）。
     GML 里 `namespace = ""` 在 if 里是「比较」，行为等价于 ===。 */
  let functionpath;
  if (namespace === '') {
    path = '';
    namespace = name;
    functionpath = namespace + ':';
  } else if (path === '') {
    path = name;
    functionpath = namespace + ':' + path + '/';
  } else {
    path += '/' + name;
    functionpath = namespace + ':' + path + '/';
  }

  // 目录结构：dat_makefolders 创建目录，这里只算前缀
  const functiondir = 'data/' + namespace + '/' + function_registry + '/' + (path === '' ? '' : path + '/');
  const files = [];

  // pack.mcmeta
  files.push({
    name: 'pack.mcmeta',
    text: '{\n\t"pack": {\n\t\t"pack_format": ' + pack_format + ',\n\t\t"description": "' +
      String(o.dat_name).replace(/"/g, '\\"') + '\\nMade with Note Block Studio"\n\t}\n}',
  });
  // data/minecraft/tags/<registry>/load.json & tick.json
  files.push({ name: 'data/minecraft/tags/' + function_registry + '/load.json', text: '{"values": ["' + functionpath + 'load"]}' });
  files.push({ name: 'data/minecraft/tags/' + function_registry + '/tick.json', text: '{"values": ["' + functionpath + 'tick"]}' });

  // load.mcfunction
  let s = 'scoreboard objectives add ' + objective + ' dummy' + br;
  s += 'scoreboard objectives add ' + objective + '_t dummy' + br;
  s += 'scoreboard players set speed ' + objective + ' ' + playspeed;
  files.push({ name: functiondir + 'load.mcfunction', text: s });

  // tick.mcfunction
  s = 'execute as @a[tag=' + tag + '] run scoreboard players operation @s ' + objective + ' += speed ' + objective + br;
  if (o.dat_enableradius) s += 'execute as @a[tag=' + tag + '] run function ' + functionpath + 'tree/' + rootfunction;
  else s += 'execute as @a[tag=' + tag + '] at @s run function ' + functionpath + 'tree/' + rootfunction;
  files.push({ name: functiondir + 'tick.mcfunction', text: s });

  // play.mcfunction
  s = 'tag @s add ' + tag + br;
  s += 'scoreboard players set @s ' + objective + '_t -1' + br;
  if (add_teams) s += 'function ' + functionpath + 'add_teams';
  files.push({ name: functiondir + 'play.mcfunction', text: s });

  // pause.mcfunction
  files.push({ name: functiondir + 'pause.mcfunction', text: 'tag @s remove ' + tag });

  // stop.mcfunction
  s = 'tag @s remove ' + tag + br;
  s += 'scoreboard players reset @s ' + objective + br;
  s += 'scoreboard players reset @s ' + objective + '_t';
  if (add_teams) s += br + 'function ' + functionpath + 'remove_teams';
  files.push({ name: functiondir + 'stop.mcfunction', text: s });

  // uninstall.mcfunction
  const zipName = String(o.dat_name || 'datapack') + '.zip';
  s = 'tag @e remove ' + tag + br;
  s += 'scoreboard objectives remove ' + objective + br;
  s += 'scoreboard objectives remove ' + objective + '_t' + br;
  if (add_teams) {
    s += 'kill @e[type=falling_block,tag=nbs]' + br;
    s += 'function ' + functionpath + 'remove_teams' + br;
  }
  s += 'datapack disable "file/' + zipName + '"' + br;
  s += 'tellraw @s ["",{"text":"[NBS] ","color":"gold","bold":true},{"text":"Data pack ","color":"yellow"},{"text":"' +
    zipName + '","color":"gold","underlined":true},{"text":" uninstalled successfully. You may now remove it from your data pack folder.","color":"yellow"}]';
  files.push({ name: functiondir + 'uninstall.mcfunction', text: s });

  if (add_teams) {
    const colors = ['dark_gray', 'red', 'black', 'yellow', 'light_purple', 'green', 'dark_red', 'dark_aqua',
      'dark_green', 'blue', 'aqua', 'dark_blue', 'dark_gray', 'dark_green', 'gray', 'gold', 'white'];
    s = '';
    for (let a = 1; a <= 17; a++) s += 'team add nbs_' + a + br;
    for (let a = 1; a <= 17; a++) s += 'team modify nbs_' + a + ' color ' + colors[a - 1] + (a < 17 ? br : '');
    files.push({ name: functiondir + 'add_teams.mcfunction', text: s });

    s = '';
    for (let a = 1; a <= 17; a++) s += 'team remove nbs_' + a + (a < 17 ? br : '');
    files.push({ name: functiondir + 'remove_teams.mcfunction', text: s });
  }

  // 生成二分树和每一拍
  datGenerate(files, functionpath, functiondir, objective);

  // 打包
  const enc = new TextEncoder();
  const zipEntries = files.map(f => ({
    name: f.name,
    data: f.data || enc.encode(f.text),
  }));
  const zip = zipStore(zipEntries);
  downloadBytes(zip, zipName, 'application/zip');
  return { zip, functionpath, zipName, files };
}

/* ---------------------------------------------------------------- 导出窗口 */
/* 窗口 ID 在 editor.js 里统一声明（W_SCHEMATIC_EXPORT = 14、W_DATAPACK_EXPORT = 30，
   与 macros.gml 的 w_schematic_export / w_datapack_export 一致）。
   这里不能再 const 一遍：浏览器里多个 <script> 共享同一个全局词法环境，
   重复声明会直接 SyntaxError。 */

/* 通用：画分页标签，返回被点击的序号（-1 = 没点）。
   对照 draw_window_*_export 里 spr_tabbuttons 那段（theme 0/3 的简化版）。 */
function exportTabs(x1, y1, labels, active) {
  let bx = x1 + 8, clicked = -1;
  setFont(FONT.main());
  for (let i = 0; i < labels.length; i++) {
    const tw = textWidth(labels[i]) + 16;
    const hover = mouseRectangle(bx, y1 + 28, tw, 18);
    if (i !== active) {
      setColor(hover ? C.controlBgHover : C.headerBg);
      roundRect(bx, y1 + 28, bx + tw, y1 + 46, 4, true);
      setColor(C.controlBorder);
      roundRect(bx + 0.5, y1 + 28.5, bx + tw - 0.5, y1 + 46.5, 4, false);
      setColor(C.textDim);
      text(bx + 8, y1 + 31, labels[i]);
    }
    if (hover && G.mb[0]) clicked = i;
    bx += tw + 4;
  }
  // 选中的那个最后画，压在邻居上面
  if (active >= 0 && active < labels.length) {
    let ax = x1 + 8;
    for (let i = 0; i < active; i++) ax += textWidth(labels[i]) + 20;
    const tw = textWidth(labels[active]) + 16;
    setColor(C.dialog);
    roundRect(ax, y1 + 24, ax + tw, y1 + 48, 4, true);
    setColor(C.controlBorder);
    roundRect(ax + 0.5, y1 + 24.5, ax + tw - 0.5, y1 + 48.5, 4, false);
    setFont(FONT.mainbold());
    setColor(C.text);
    text(ax + 8, y1 + 29, labels[active]);
    setFont(FONT.main());
  }
  return clicked;
}

/* 块选择菜单的候选表（对照 menub = 0..9 的那几张硬编码表）。 */
const SCH_BLOCK_GROUPS = [
  [[0, 0], [2, 0], [3, 0], [18, 0], [19, 0]],
  [[5, 0], [17, 0], [25, 0], [47, 0]],
  [[1, 0], [4, 0], [7, 0], [14, 0], [15, 0], [16, 0], [21, 0], [22, 0], [24, 0], [48, 0], [49, 0], [73, 0], [87, 0], [89, 0]],
  [[12, 0], [13, 0], [88, 0]],
  [[20, 0]],
  null,   // 羊毛
  [[82, 0]],
  [[41, 0]],
  [[174, 0]],
  [[216, 0]],
];

/* 生成方块选择菜单的字符串（照搬 draw_window_schematic_export 里 str += ... 那段）。
   curId/curData 用来打勾；mode='all' 时枚举 block_get_name 非空的全部方块。 */
function schBlockMenuString(entries, curId, curData) {
  let str = '';
  let d = 0, sm = 0;
  for (let a = 0; a < entries.length; a++) {
    const [id, data] = entries[a];
    const isColorBlock = (id === 35 || id === 95 || id === 159);
    if (isColorBlock) {
      const titles = { 35: '羊毛', 95: '染色玻璃', 159: '彩色陶瓦' };
      str += titles[id] + '|\\|';
      for (let c = 0; c < 16; c++) {
        str += (curId === id && curData === c) ? iconPrefix(ICON.CHECK) : '';
        str += id + ', ' + c + '$' + blockGetName(id, c) + '|';
      }
      str += '/|';
      a += 16;          // 这一组已经展开成 16 个子项（含表头的 [id,0]）
    } else {
      str += (curId === id) ? iconPrefix(ICON.CHECK) : '';
      str += id + ', ' + data + '$' + blockGetName(id, data) + '|';
    }
    d++;
    if (d % 25 === 0 && a < entries.length - 1) { str += '-|更多......|\\|'; sm++; }
  }
  for (let i = 0; i < sm; i++) str += '/|';
  return str;
}

/* 枚举所有可用的底座方块（对应 GML 里 for(a=0;a<256;a++) 那一段）。 */
function schAllBlocks(skipGlassAndNote) {
  const out = [];
  for (let a = 0; a < 256; a++) {
    if ((a === 20 || a === 25) && skipGlassAndNote) continue;
    if (a === 35 || a === 95 || a === 159) {
      out.push([a, 0]);
      for (let c = 0; c < 16; c++) out.push([a, c]);
    } else if (blockGetName(a, 0) !== '') {
      out.push([a, 0]);
    }
  }
  return out;
}

/* ---------------------------------------------------------------- Schematic 导出窗口 */
/* 对照 draw_window_schematic_export.gml：550x400，两页（设计 / 方块） */
function drawSchematicExport() {
  ensureSchematicState();
  // 每次重算统计（原版靠 calculate_size() 在打开前算一次，这里跟随参数变化）
  calculateSize();

  const x1 = floor(S.rw / 2 - 275), y1 = floor(S.rh / 2 - 200);
  const x2 = x1 + 550, y2 = y1 + 400;
  drawWindow(x1, y1, x2, y2);
  drawWindowTitle(x1, y1, '导出 Schematic');
  setFont(FONT.main());

  // 记住我的更改
  if (drawCheckbox(x1 + 12, y1 + 374, !!S.sch_exp_remember, '记住我的更改', false, true)) {
    S.sch_exp_remember = S.sch_exp_remember ? 0 : 1;
  }

  const tab = exportTabs(x1, y1, ['设计', '方块'], S.sch_exp_tab);
  if (tab > -1) S.sch_exp_tab = tab;

  // 内容面板
  setColor(C.controlBg);
  roundRect(x1 + 6, y1 + 46, x2 - 6, y1 + 362, 4, true);
  setColor(C.controlBorder);
  roundRect(x1 + 6.5, y1 + 46.5, x2 - 6.5, y1 + 361.5, 4, false);

  setFont(FONT.main());
  setColor(C.text);

  if (S.sch_exp_tab === 0) {
    /* ------------------------------ 设计页 */
    // 布局示意图。对照 draw_window_schematic_export.gml:96：
    //     draw_sprite(spr_schematic_exp, sch_exp_layout, x1 + 15, y1 + 56)
    // 帧号就是 sch_exp_layout（1=普通过道 0=环形过道 2=玻璃地板）。
    // 之前这套精灵没进图集，弹窗里这块是空的（用户报的「图片不见了」）。
    drawSprite('spr_schematic_exp', clamp(S.sch_exp_layout | 0, 0, 2), x1 + 15, y1 + 56);

    let lx = x1;
    // 以下坐标全部照 draw_window_schematic_export.gml 的「设计」页：
    //   布局文字 y1+220、两个单选 y1+240/260、
    //   版本文字 y1+280、三个单选 y1+300/320/340
    // 之前整体写高了 20px，示意图（y1+56 起、高 150）正好压住「布局：」这行字。
    // 另外原版布局只有两个单选（普通过道/环形过道），没有第三个，
    // 这里删掉多出来的那项，保持与原版一致。
    text(lx + 16, y1 + 220, '布局：');
    if (drawRadiobox(lx + 32, y1 + 240, S.sch_exp_layout === 1, '普通过道')) S.sch_exp_layout = 1;
    if (drawRadiobox(lx + 32, y1 + 260, S.sch_exp_layout === 0, '环形过道')) S.sch_exp_layout = 0;

    text(lx + 16, y1 + 280, 'Minecraft 版本：');
    if (drawRadiobox(lx + 32, y1 + 300, !!S.structure, '1.13+（结构方块）')) {
      S.structure = true;
    }
    if (drawRadiobox(lx + 32, y1 + 320, (!S.sch_exp_minecraft_old && !S.structure), '1.11-1.12（Schematic）')) {
      S.sch_exp_minecraft_old = false; S.structure = false;
    }
    if (drawRadiobox(lx + 32, y1 + 340, (S.sch_exp_minecraft_old && !S.structure), 'pre 1.11（Schematic）')) {
      S.sch_exp_minecraft_old = true; S.structure = false;
    }

    lx += 20;

    text(lx + 170, y1 + 220, '每行中继器：');
    S.sch_exp_notesperrow = clamp(
      Math.round(drawDragValue(5, lx + 300, y1 + 216, S.sch_exp_notesperrow, 1)), 5, 100);
    if (S.sch_exp_notesperrow < 5) S.sch_exp_notesperrow = 5;

    if (drawCheckbox(lx + 170, y1 + 240, !!S.sch_exp_includelocked, '包含锁定图层', false, true)) {
      S.sch_exp_includelocked = S.sch_exp_includelocked ? 0 : 1;
    }
    if (drawCheckbox(lx + 170, y1 + 260, !!S.sch_exp_compress, '压缩图层', false, true)) {
      S.sch_exp_compress = S.sch_exp_compress ? 0 : 1;
    }
    // 以下 y 坐标照 GML：
    //   矿车 y1+280 / 箱子 y1+300 / 循环 y1+320 / 命令方块 y1+320+(layout=0)*20
    //   玻璃地板（非两种过道布局时）y1+290
    // 之前矿车写成 y1+262 与「压缩图层」(y1+260) 只差 2px，两个勾选框糊在一起了。
    if (S.sch_exp_layout === 0 || S.sch_exp_layout === 1) {
      if (drawCheckbox(lx + 170, y1 + 280, !!S.sch_exp_minecart, '包含矿车道', false, true)) {
        S.sch_exp_minecart = S.sch_exp_minecart ? 0 : 1;
      }
      if (drawCheckbox(lx + 186, y1 + 300, !!S.sch_exp_chest, '附带一箱矿车', !S.sch_exp_minecart)) {
        S.sch_exp_chest = S.sch_exp_chest ? 0 : 1;
      }
      if (S.sch_exp_layout === 0) {
        if (drawCheckbox(lx + 170, y1 + 320, !!S.sch_exp_loop, '包含循环开关', false, true)) {
          S.sch_exp_loop = S.sch_exp_loop ? 0 : 1;
        }
      }
      if (S.structure) {
        const cbY = y1 + 320 + (S.sch_exp_layout === 0 ? 20 : 0);
        if (drawCheckbox(lx + 170, cbY, !!S.command_block, '使用命令方块', false, true)) {
          S.command_block = !S.command_block;
        }
      }
    } else {
      if (drawCheckbox(lx + 170, y1 + 290, !!S.sch_exp_glass, '玻璃地板')) {
        S.sch_exp_glass = S.sch_exp_glass ? 0 : 1;
      }
    }

    lx -= 20;

    // 右侧统计（GML: y1+220 起，每行 16px）
    setFont(FONT.main());
    text(lx + 380, y1 + 220, '音符盒：');
    text(lx + 380, y1 + 236, '中继器：');
    text(lx + 380, y1 + 252, '大小：');
    const tb = Math.max(0, S.sch_exp_totalblocks[S.sch_exp_includelocked ? 1 : 0] || 0);
    const rp = S.sch_exp_repeaters[S.sch_exp_includelocked ? 1 : 0][S.sch_exp_tempo] || 0;
    const mh = Math.ceil((S.sch_exp_maxheight[S.sch_exp_compress ? 1 : 0] || 0) / 4);
    text(lx + 520, y1 + 220, String(tb), 'right');
    text(lx + 520, y1 + 236, rp + 'x' + mh, 'right');
    text(lx + 520, y1 + 252, schematicLength() + 'x' + schematicWidth() + 'x' + schematicHeight(), 'right');

    // 速度单选：GML 是 y1+220+16*3 起，三个选项间距 20
    text(lx + 380, y1 + 268, '速度：');
    const tempos = ['10 红石刻 / 秒', '5 红石刻 / 秒', '2.5 红石刻 / 秒'];
    for (let i = 0; i < 3; i++) {
      if (drawRadiobox(lx + 396, y1 + 288 + i * 20, S.sch_exp_tempo === i, tempos[i])) S.sch_exp_tempo = i;
    }
  } else {
    /* ------------------------------ 方块页 */
    // 表头
    setFont(FONT.small()); setColor(C.textDim);
    text(x1 + 16, y1 + 54, '音色');
    text(x1 + 16 + 252, y1 + 54, '方块');
    text(x1 + 16 + 252 + 60, y1 + 54, '方块名称');
    setFont(FONT.main());

    const rows = 9;
    const sc = S.sch_exp_scrollbar || 0;
    for (let a = 0; a < rows; a++) {
      const b = floor(sc + a);
      if (b >= INSTRUMENTS.length) break;
      const ins = INSTRUMENTS[b];
      const ry = y1 + 74 + 20 * a;
      setColor(C.text);
      text(x1 + 16, ry, ins.name);
      text(x1 + 16 + 252, ry, S.sch_exp_ins_block[b] + ', ' + S.sch_exp_ins_data[b]);
      // 下拉按钮
      if (button2(x1 + 16 + 252 + 60 - 25, ry - 2, 20, '▾')) {
        openSchInsBlockMenu(x1 + 16 + 252, ry + 16, b);
      }
      text(x1 + 16 + 252 + 60, ry, blockGetName(S.sch_exp_ins_block[b], S.sch_exp_ins_data[b]));
      setColor(C.separator);
      line(x1 + 12, y1 + 90 + 20 * a, x2 - 22, y1 + 90 + 20 * a);
    }
    if (INSTRUMENTS.length > rows) {
      SB.val[4] = S.sch_exp_scrollbar;
      S.sch_exp_scrollbar = drawScrollbarGML(4, x2 - 26, y1 + 71, 17, rows, INSTRUMENTS.length, 0, 1);
    } else S.sch_exp_scrollbar = 0;

    // 三个方块选择器
    const labels = ['过道所用方块：', '电路所用方块：', '地面所用方块：'];
    for (let i = 0; i < 3; i++) {
      const by = y1 + 265 + i * 30;
      text(x1 + 16, by + 4, labels[i]);
      setColor(C.controlBgHover);
      roundRect(x1 + 200, by, x1 + 340, by + 21, 4, true);
      setColor(C.controlBorder);
      roundRect(x1 + 200.5, by + 0.5, x1 + 339.5, by + 20.5, 4, false);
      setColor(C.text);
      let bid, bdat;
      if (i === 0) { bid = S.sch_exp_walkway_block; bdat = S.sch_exp_walkway_data; }
      else if (i === 1) { bid = S.sch_exp_circuit_block; bdat = S.sch_exp_circuit_data; }
      else { bid = S.sch_exp_ground_block; bdat = S.sch_exp_ground_data; }
      text(x1 + 204, by + 4, blockGetName(bid, bdat));
      if (button2(x1 + 200 + 121, by + 2, 20, '▾') || (mouseRectangle(x1 + 200, by, 140, 21) && G.mbp[0])) {
        openSchBlockMenu(x1 + 200, by + 23, i);
      }
    }
  }

  /* ------------------------------ 按钮 */
  if (button2(x1 + 470, y1 + 368, 72, '导出')) {
    if ((S.sch_exp_totalblocks[S.sch_exp_includelocked ? 1 : 0] || 0) <= 0) {
      messageDialog('没有方块可以导出！', '导出 Schematic');
    } else if (schematicLength() >= 2000 || schematicWidth() >= 2000 || schematicHeight() >= 256) {
      messageDialog('这个 Schematic 太大了。大小限制为 2000x2000x256。\n可以更改「每行中继器」来减小大小。', '错误');
    } else {
      try {
        schematicExport();
        S.window = 0;
        messageDialog('Schematic 已保存！', '导出 Schematic');
      } catch (e) {
        messageDialog('导出失败：' + e.message, '错误');
      }
    }
  }
  if (button2(x1 + 470 - 80, y1 + 368, 72, '取消') || G.keysPressed['Escape']) closeWindow();
  if (button2(x1 + 470 - 160, y1 + 368, 72, '使用默认值')) {
    confirmDialogOn((yes) => { if (yes) resetSchematicExport(1); }, '你确定吗？', '确定');
  }
}

/* 打开「音色 → 底座方块」下拉菜单 */
function openSchInsBlockMenu(mx, my, insIndex) {
  const entries = schAllBlocks(false);
  const str = schBlockMenuString(entries, S.sch_exp_ins_block[insIndex], S.sch_exp_ins_data[insIndex]);
  UI.menu = null;
  /* 调用方传进来的是 dialogFrame() 内的【设计坐标】，而 drawMenu 画在屏幕空间，
     必须换算（与原版 show_menu_ext 一致 —— 那个函数内部处理窗口坐标）。
     漏了这一步，竖屏或窗口居中时下拉框会飞到窗口左上角附近。 */
  const sp = dlgToScreen(mx, my);
  showMenu('schexport_insblock', sp.x, sp.y, str);
  UI.menuTargetIns = insIndex;
  if (S.windowsound) playUISound('show');
}

/* 打开「过道/电路/地面」方块下拉菜单 */
function openSchBlockMenu(mx, my, which) {
  let curId, curDat;
  if (which === 0) { curId = S.sch_exp_walkway_block; curDat = S.sch_exp_walkway_data; }
  else if (which === 1) { curId = S.sch_exp_circuit_block; curDat = S.sch_exp_circuit_data; }
  else { curId = S.sch_exp_ground_block; curDat = S.sch_exp_ground_data; }
  const entries = schAllBlocks(which === 1);   // 电路不用玻璃/音符盒
  const str = schBlockMenuString(entries, curId, curDat);
  UI.menu = null;
  const sp = dlgToScreen(mx, my);   // 设计坐标 → 屏幕坐标（同 openSchInsBlockMenu）
  showMenu('schexport_block', sp.x, sp.y, str);
  UI.menuTargetBlock = which;
  if (S.windowsound) playUISound('show');
}

/* 菜单回调：把 "id, data" 写回对应字段。
   对照 menu_click.gml 里 schexport_block / schexport_insblock 的处理。 */
function schMenuApply(menu, label) {
  const m = /^(\d+),\s*(\d+)$/.exec(String(label));
  if (!m) return;
  const id = parseInt(m[1], 10), data = parseInt(m[2], 10);
  if (menu === 'schexport_insblock') {
    const i = UI.menuTargetIns;
    if (i >= 0 && i < 256) { S.sch_exp_ins_block[i] = id; S.sch_exp_ins_data[i] = data; }
  } else if (menu === 'schexport_block') {
    const w = UI.menuTargetBlock;
    if (w === 0) { S.sch_exp_walkway_block = id; S.sch_exp_walkway_data = data; }
    else if (w === 1) { S.sch_exp_circuit_block = id; S.sch_exp_circuit_data = data; }
    else if (w === 2) { S.sch_exp_ground_block = id; S.sch_exp_ground_data = data; }
  }
}

/* ---------------------------------------------------------------- 数据包导出窗口 */
/* 对照 draw_window_datapack_export.gml：550x430，两页（设置 / 效果） */
function drawDatapackExport() {
  ensureSchematicState();
  // 原版在 Name 框里直接回填 song_name / filename（GML 98-100 行）
  if (S.song_name !== '') S.dat_name = S.song_name;
  else if (S.filename !== '' && S.filename !== '-player') {
    const fn = String(S.filename).replace(/^.*[\\/]/, '');
    S.dat_name = fn.replace(/\.[^.]*$/, '');
  } else S.dat_name = '';

  const x1 = floor(S.rw / 2 - 275), y1 = floor(S.rh / 2 - 215);
  const x2 = x1 + 550, y2 = y1 + 430;
  drawWindow(x1, y1, x2, y2);
  drawWindowTitle(x1, y1, '导出数据包');
  setFont(FONT.main());

  const tab = exportTabs(x1, y1, ['设置', '效果'], S.dat_tab);
  if (tab > -1) S.dat_tab = tab;

  setColor(C.controlBg);
  roundRect(x1 + 6, y1 + 46, x2 - 6, y1 + 392, 4, true);
  setColor(C.controlBorder);
  roundRect(x1 + 6.5, y1 + 46.5, x2 - 6.5, y1 + 391.5, 4, false);

  setColor(C.text);
  setFont(FONT.main());

  /* 示意图裁剪：spr_datapack_exp 是 429x332 的大图，
     GML 把它画在 x1+66, y1-40（设置页）和 x1+125, y1+55（效果页）。
     GameMaker 里窗口内容区由窗口自身裁剪，越界部分看不见；
     浏览器画布没有这个自动裁剪，直接画会盖住标题栏和窗口外的界面。
     所以这里显式把绘制限制在内容面板范围内（pushClip/popClip 见 core.js）。 */
  const PANEL = [x1 + 6, y1 + 46, x2 - 6, y1 + 392];

  if (S.dat_tab === 0) {
    /* ------------------------------ 设置页 */
    // 对照 GML 93 行：draw_sprite(spr_datapack_exp, 2, x1+66, y1-40)。
    // 注意该精灵只有帧 0~1，帧 2 越界 —— GameMaker 越界帧不绘制任何东西，
    // 所以原版这一页顶部其实是空的（不是漏画）。frame() 已按此行为返回 null。
    pushClip(PANEL[0], PANEL[1], PANEL[2], PANEL[3]);
    drawSprite('spr_datapack_exp', 2, x1 + 66, y1 - 40);
    popClip();

    text(x1 + 16, y1 + 208, '唯一名称：');
    S.dat_name = inputBox(50, S.dat_name, x1 + 16, y1 + 225, 145, 20);

    // 名称空/命名空空 → 标签灰显（照搬 105-107 行的 draw_set_color(c_gray)）
    setColor(stringPath(S.dat_name) !== '' && stringPath(S.dat_namespace) !== '' ? C.text : C.textDim);
    text(x1 + 16, y1 + 255, '命名空间：');
    setColor(C.text);
    S.dat_namespace = inputBox(51, S.dat_namespace, x1 + 16, y1 + 272, 145, 20);

    setColor(stringPath(S.dat_name) !== '' && stringPath(S.dat_namespace) !== '' && datGetPath(S.dat_path) !== ''
      ? C.text : C.textDim);
    text(x1 + 16, y1 + 301, '路径：');
    setColor(C.text);
    S.dat_path = inputBox(52, S.dat_path, x1 + 16, y1 + 318, 145, 20);

    text(x1 + 16, y1 + 348, '命令预览：');
    setFont(FONT.mainbold());
    if (stringPath(S.dat_name) === '') setColor(C.textDim);
    text(x1 + 16, y1 + 365, datPreview(S.dat_name, S.dat_namespace, S.dat_path));
    setFont(FONT.main());
    setColor(C.text);

    // 音源
    text(x1 + 187, y1 + 208, '音源');
    const sources = [
      ['ambient', 192, 228], ['block', 192, 247], ['hostile', 192, 266],
      ['master', 192, 285], ['music', 192, 304],
      ['neutral', 264, 228], ['player', 264, 247], ['record', 264, 266],
      ['voice', 264, 285], ['weather', 264, 304],
    ];
    for (const [v, sx, sy] of sources) {
      if (drawRadiobox(x1 + sx, y1 + sy, S.dat_source === v, v)) S.dat_source = v;
    }

    // Minecraft 版本
    text(x1 + 187, y1 + 334, 'Minecraft 版本');
    if (drawRadiobox(x1 + 192, y1 + 354, S.dat_mcversion === 0, '1.13-1.20')) S.dat_mcversion = 0;
    if (drawRadiobox(x1 + 192, y1 + 374, S.dat_mcversion === 1, '1.21+')) S.dat_mcversion = 1;

    // 导出为 ZIP（浏览器里只能出 ZIP，仍画出来并保持可勾选，值恒为 1）
    if (drawCheckbox(x1 + 192, y1 + 404, true, '导出为 ZIP', false, true)) S.dat_usezip = 1;
    S.dat_usezip = 1;

    // 锁定图层
    if (drawCheckbox(x1 + 362, y1 + 213, !!S.dat_includelocked, '包含锁定图层', false, true)) {
      S.dat_includelocked = S.dat_includelocked ? 0 : 1;
    }
    // 超范围音符
    if (drawCheckbox(x1 + 362, y1 + 238, !!S.dat_includeoutofrange, '包含超范围音符', false, true)) {
      S.dat_includeoutofrange = S.dat_includeoutofrange ? 0 : 1;
    }
    // 附近收听
    if (drawCheckbox(x1 + 362, y1 + 263, !!S.dat_enableradius, '附近收听', false, true)) {
      S.dat_enableradius = S.dat_enableradius ? 0 : 1;
    }
    if (S.dat_enableradius) {
      S.dat_radius = clamp(Math.round(drawDragValue(6, x1 + 490, y1 + 279, S.dat_radius, 2)), 16, 100000);
      S.dat_radiusvalue = 1 + (S.dat_radius - 16) * 0.06;
    } else {
      setColor(C.textDim);
      text(x1 + 490, y1 + 283, String(S.dat_radius));
      setColor(C.text);
    }
    text(x1 + 380, y1 + 283, '半径（方块）：');

    // 循环
    if (drawCheckbox(x1 + 362, y1 + 313, !!S.dat_enablelooping, '启用循环', false, true)) {
      S.dat_enablelooping = S.dat_enablelooping ? 0 : 1;
    }
    if (S.dat_enablelooping) {
      S.loopstart = clamp(Math.round(drawDragValue(7, x1 + 490, y1 + 329, S.loopstart, 0.5)), 0, S.enda);
    } else {
      setColor(C.textDim);
      text(x1 + 490, y1 + 333, String(S.loopstart));
      setColor(C.text);
    }
    text(x1 + 380, y1 + 333, '循环起点：');

    // 额外音色包按钮
    if (button2(x1 + 380, y1 + 362, 152, '获取额外音色包', !S.dat_includeoutofrange)) {
      messageDialog('额外音色包在原版里会打开网页下载。\n本版本不做外链，请自行安装 NBS 的 Extra Notes 资源包。', '提示');
    }
  } else {
    /* ------------------------------ 效果页 */
    // 对照 GML 182 行：效果页画的是帧 1（可视化类型预览图）
    pushClip(PANEL[0], PANEL[1], PANEL[2], PANEL[3]);
    drawSprite('spr_datapack_exp', 1, x1 + 125, y1 + 55);
    popClip();

    if (drawCheckbox(x1 + 33, y1 + 55, !!S.dat_visualizer, '启用可视化', false, true)) {
      S.dat_visualizer = S.dat_visualizer ? 0 : 1;
    }
    text(x1 + 33, y1 + 75, '可视化类型');
    const types = ['Arc', 'Fall', 'Rise', 'Bounce', 'Piano Roll', 'Fountain', 'Rittai Onkyou'];
    for (let i = 0; i < types.length; i++) {
      if (drawRadiobox(x1 + 33, y1 + 95 + i * 20, S.dat_vis_type === types[i], types[i])) S.dat_vis_type = types[i];
    }
    if (drawCheckbox(x1 + 33, y1 + 235, !!S.dat_glow, '添加发光')) {
      S.dat_glow = S.dat_glow ? 0 : 1;
    }
    text(x1 + 33, y1 + 255, '生成高度：');
    S.dat_yval = clamp(Math.round(drawDragValue(11, x1 + 33, y1 + 275, S.dat_yval, 0.5)), 0, 255);

    text(x1 + 33, y1 + 295, '地图内位置：');
    text(x1 + 33, y1 + 318, 'X 值：');
    S.dat_xval = parseFloat(inputBox(53, String(S.dat_xval), x1 + 83, y1 + 315, 40, 20)) || 0;
    text(x1 + 33, y1 + 338, 'Z 值：');
    S.dat_zval = parseFloat(inputBox(54, String(S.dat_zval), x1 + 83, y1 + 335, 40, 20)) || 0;

    if (button2(x1 + 13, y1 + 360, 152, '获取音符盒贴图')) {
      messageDialog('贴图包在原版里会打开网页下载。\n本版本不做外链。', '提示');
    }
  }

  /* ------------------------------ 按钮 */
  if (button2(x1 + 470, y1 + 398, 72, '导出')) {
    if (stringLettersDigits(S.dat_name) === '') {
      messageDialog('请为数据包输入一个有效的名称。', '错误');
    } else if ((datGetPath(S.dat_path).match(/\//g) || []).length >= 5) {
      messageDialog('路径最多只能包含 5 层子文件夹。', '错误');
    } else {
      try {
        const r = datapackExport();
        S.window = 0;
        const fp = r.functionpath;
        messageDialog(
          '数据包已保存！\n\n如想在游戏内播放，使用命令：\n\n' +
          '/function ' + fp + 'play\n' +
          '/function ' + fp + 'pause\n' +
          '/function ' + fp + 'stop\n\n' +
          '如果你想从你的世界中卸载它，\n使用命令：\n\n' +
          '/function ' + fp + 'uninstall\n\n' +
          '然后从「datapacks」文件夹取出就行了。', '导出数据包');
      } catch (e) {
        messageDialog('导出失败：' + e.message, '错误');
      }
    }
  }
  if (button2(x1 + 470 - 80, y1 + 398, 72, '取消') || G.keysPressed['Escape']) closeWindow();
  if (button2(x1 + 310, y1 + 398, 72, '使用默认值')) {
    confirmDialogOn((yes) => { if (yes) datReset(1); }, '你确定吗？', '确定');
  }
  if (drawCheckbox(x1 + 12, y1 + 404, !!S.dat_remember, '记住我的更改', false, true)) {
    S.dat_remember = S.dat_remember ? 0 : 1;
  }
}
