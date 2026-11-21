/* =========================================================================
   schexport.js — 轨道（直轨）导出 / 分支导出
   严格照搬 GML 原版：
     · branch_export()                 分支导出（*.schematic）
     · draw_window_branch_export()     分支导出窗口（550x400，两页：设计 / 方块）
     · track_export()                  直轨导出（结构方块 *.nbt）
     · draw_window_track_export()      直轨导出窗口（550x400，两页：设计 / 方块）
   以及辅助：
     · schNew / schSizeOf / schCellSet / schFill / schSave
       —— 对应 GMschematic 的 schematic_create / schematic_size /
          schematic_cell_set / schematic_fill / schematic_save；
          GML 里那是 obj_schematic 实例 + DLL 文件句柄，浏览器端改成
          一个普通对象 + 内存里的 NBT 字节流。
     · trkWalkway / trkCircuit / trkOther / trkRepeater
       —— 对应 block_walkway_track / block_circuit_track /
          block_other_track / block_repeater_track。

   【与 GML 的差异（全部为浏览器平台所限，非功能性改动）】
   1. 保存对话框：GML 用 get_save_filename_ext() 弹窗取文件名，用户取消则
      直接 return 0。浏览器没有同步的保存对话框，改为按歌曲名推导默认文件名
      后直接落地（downloadBytes）。因此「取消保存」这条分支不存在。
   2. gzzip()：GML 调外部 7za 生成 gzip，这里用 schematic.js 里的 gzipStore()
      （手写 stored-deflate，不压缩但格式合法）。
   3. buffer_save / buffer_delete / 临时文件：不存在，全部在内存里拼字节。
   4. show_debug_message / log：无对应输出，删掉（不影响功能）。
   5. instance_destroy / with(create(obj_dummy2)) / schematic_start()：
      GameMaker 的实例与 DLL 初始化机制，浏览器里用局部变量和普通对象替代。
   6. window = -1（导出期间隐藏窗口）：我们的窗口是 S.window，导出是同步的、
      不会重绘，所以不需要这一句；由调用方在完成后关闭窗口。
   7. ds_list_find_index(other.instrument_list, ins) → insIndex() / gIns()。
   8. GML 的 `=` 在条件里是相等比较 → JS 用 ===；单行 if 语句加花括号。
   9. spr_schematic_br（分支窗口设计页的示意图）原先不在图集里，本次已补：
      在 assets.js 的 ATLAS_SETS 与 tools/build-atlas.py 的 DOWNSAMPLE 中各加一项，
      重新打包后 atlas 里已有该图，draw_sprite 的调用与 GML 保持一致。
   ========================================================================= */
'use strict';

/* =========================================================================
   一、本地 schematic 缓冲区（GMschematic 的 obj_schematic 等价物）
   -------------------------------------------------------------------------
   GML 的寻址方式是：
       t = a * xysize * zsize + b + c * xysize
       sch.block[t div dsize, t mod dsize] = 值
   也就是把 t 拆成「二维数组的两个下标」。因为 b < ysize <= xysize 且
   c < zsize，t 在合法坐标范围内是唯一的，所以「二维数组 + 除法拆分」
   与「以 t 为键的 Map」完全等价（后者默认值为 0）。
   这里用 Map，避免为 2000x2000x256 这种尺寸分配巨量内存。
   ========================================================================= */
function schNew() {
  return {
    xsize: 0, ysize: 0, zsize: 0,
    dsize: 1, xysize: 1,
    blk: new Map(),      // t -> block id
    dat: new Map(),      // t -> block data
  };
}

function schIndex(sch, a, b, c) {
  return a * sch.xysize * sch.zsize + b + c * sch.xysize;
}

/* 照搬 schematic_size(id, xsize, ysize, zsize) */
function schSizeOf(sch, xs, ys, zs) {
  sch.xsize = xs;
  sch.ysize = ys;
  sch.zsize = zs;
  sch.dsize = Math.sqrt(sch.xsize * sch.ysize * sch.zsize);
  sch.xysize = Math.max(sch.xsize, sch.ysize) + 1;
  // 原版是把所有格子显式清零；Map 的默认值就是 0，清空即可
  sch.blk.clear();
  sch.dat.clear();
}

/* 照搬 schematic_cell_set(id, x, y, z, block, data)：越界返回 0 */
function schCellSet(sch, xx, yy, zz, block, data) {
  if (xx < 0 || yy < 0 || zz < 0 || xx >= sch.xsize || yy >= sch.ysize || zz >= sch.zsize) return 0;
  const t = schIndex(sch, xx, yy, zz);
  sch.blk.set(t, block);
  sch.dat.set(t, data);
  return 1;
}

/* 照搬 schematic_fill(id, x1,y1,z1, x2,y2,z2, block, data)：
   先把三个轴上的起止坐标排成 min/max，再逐格填，越界的格子跳过。 */
function schFill(sch, x1, y1, z1, x2, y2, z2, block, data) {
  let tmp;
  if (x1 > x2) { tmp = x1; x1 = x2; x2 = tmp; }
  if (y1 > y2) { tmp = y1; y1 = y2; y2 = tmp; }
  if (z1 > z2) { tmp = z1; z1 = z2; z2 = tmp; }
  for (let a = x1; a <= x2; a++) {
    for (let b = y1; b <= y2; b++) {
      for (let c = z1; c <= z2; c++) {
        if (a < 0 || b < 0 || c < 0 || a >= sch.xsize || b >= sch.ysize || c >= sch.zsize) continue;
        const t = schIndex(sch, a, b, c);
        sch.blk.set(t, block);
        sch.dat.set(t, data);
      }
    }
  }
}

function schGetBlock(sch, t) { const v = sch.blk.get(t); return v === undefined ? 0 : v; }
function schGetData(sch, t) { const v = sch.dat.get(t); return v === undefined ? 0 : v; }

/* 照搬 schematic_save(id, filename)。
   GML 写的是 legacy .schematic：Length/Width/Height 三个 short、
   Materials = "Alpha"、Entities 空、TileEntities = 全部音符盒、
   Blocks/Data 两个 byte 数组（顺序 c 外层 / a 中层 / b 从大到小）。
   文件名与 gzip 落地按本项目的既有做法（downloadBytes + gzipStore）。 */
function schSave(sch, fileName) {
  const w = new NbtWriter();
  w.tagCompound('Schematic');
  w.tagShort('Length', sch.xsize);
  w.tagShort('Width', sch.ysize);
  w.tagShort('Height', sch.zsize);
  w.tagString('Materials', 'Alpha');
  // 原版调用 nbt_tag_list(file, "Entities", 10, 0)：type = 10, len = 0。
  // 我们的 tagList(name, len, type) 参数顺序是 (名字, 长度, 元素类型)。
  w.tagList('Entities', 0, 10);
  w.tagList('TileEntities', S.sch_exp_totalnoteblocks, 10);
  for (let a = 0; a < S.sch_exp_polyphony; a++) {
    for (let b = 0; b <= S.sch_exp_range_end - S.sch_exp_range_start; b++) {
      if (NB.note[a][b] !== 0) {
        w.tagString('id', 'minecraft:noteblock');
        w.tagInt('x', NB.x[a][b]);
        w.tagInt('y', NB.y[a][b]);
        w.tagInt('z', NB.z[a][b]);
        w.tagByte('note', NB.key[a][b]);
        w.tagEnd();
      }
    }
  }
  // Blocks：c 外层、a 中层、b 从 ysize-1 递减
  w.tagByteArray('Blocks', sch.xsize * sch.ysize * sch.zsize);
  for (let c = 0; c < sch.zsize; c++) {
    for (let a = 0; a < sch.xsize; a++) {
      for (let b = sch.ysize - 1; b >= 0; b--) {
        w.byte(schGetBlock(sch, schIndex(sch, a, b, c)));
      }
    }
  }
  // Data：同样的顺序
  w.tagByteArray('Data', sch.xsize * sch.ysize * sch.zsize);
  for (let c = 0; c < sch.zsize; c++) {
    for (let a = 0; a < sch.xsize; a++) {
      for (let b = sch.ysize - 1; b >= 0; b--) {
        w.byte(schGetData(sch, schIndex(sch, a, b, c)));
      }
    }
  }
  w.tagEnd();                       // 结束外层 "Schematic" compound

  const gz = gzipStore(w.bytes());
  downloadBytes(gz, fileName);
  return gz;
}

/* =========================================================================
   二、branch_export() —— 照搬 branch_export.gml
   -------------------------------------------------------------------------
   GML 里的 nblocknote / nblockins / nblockvel / nblockkey /
   noteblockzvel / noteblockxpos / noteblockx / noteblocky / noteblockz
   都是 obj_controller 上的二维实例数组，这里用一个模块级对象 NB 承载
   （二维数组的二维部分用普通数组），导出结束后仍然保留 —— 因为
   schSave() 要读它们。写入方是 branchExport()，读取方是 schSave()。
   ========================================================================= */
const NB = {
  note: [], ins: [], vel: [], key: [],
  zvel: [], xpos: [], x: [], y: [], z: [],
};

// GML 的 real()：把输入框里的字符串转成数字，非法输入当 0
function realOf(v) {
  if (typeof v === 'number') return v;
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

/* 只补齐「缺失的容器」，绝不覆盖用户已经设好的值。
   -------------------------------------------------------------------------
   为什么不直接用 ensureSchematicState()：那个函数在首次调用时会执行
   resetSchematicExport(false)，把一次性的默认值写进 S —— 其中就包括
   sch_exp_range_start / range_end / polyphony / velocity / circuitry。
   窗口路径里这样没问题（先建默认值、再让用户改），但导出函数本身不能这样做：
   原版 branch_export.gml / track_export.gml 全程只读这些变量、从不重置，
   否则「先设好参数、再调导出」时参数会被悄悄清成默认值
   （实测会让范围变成 0..0、复音数变成 0，导出一个只有电路的空 schematic）。
   所以导出函数入口用这个「只补不改」的版本。 */
function ensureSchArrays() {
  if (!S.sch_exp_ins_block) S.sch_exp_ins_block = new Array(256).fill(1);
  if (!S.sch_exp_ins_data) S.sch_exp_ins_data = new Array(256).fill(0);
  if (!S.sch_exp_totalblocks) S.sch_exp_totalblocks = [0, 0];
  if (!S.sch_exp_maxheight) S.sch_exp_maxheight = [0, 0];
  if (!S.lockedlayer) S.lockedlayer = [];
  if (S.sch_exp_walkway_block === undefined) S.sch_exp_walkway_block = 1;
  if (S.sch_exp_walkway_data === undefined) S.sch_exp_walkway_data = 0;
  if (S.sch_exp_circuit_block === undefined) S.sch_exp_circuit_block = 1;
  if (S.sch_exp_circuit_data === undefined) S.sch_exp_circuit_data = 0;
  if (S.sch_exp_ground_block === undefined) S.sch_exp_ground_block = 1;
  if (S.sch_exp_ground_data === undefined) S.sch_exp_ground_data = 0;
  if (S.sch_exp_includelocked === undefined) S.sch_exp_includelocked = 0;
  if (S.sch_exp_polyphony === undefined) S.sch_exp_polyphony = 1;
  if (S.sch_exp_velocity === undefined) S.sch_exp_velocity = 0;
  if (S.sch_exp_circuitry === undefined) S.sch_exp_circuitry = 1;
  if (S.sch_exp_stereo === undefined) S.sch_exp_stereo = 4;
  if (S.sch_exp_layer1 === undefined) S.sch_exp_layer1 = 1;
  if (S.sch_exp_layer2 === undefined) S.sch_exp_layer2 = 1;
  if (S.sch_exp_layer3 === undefined) S.sch_exp_layer3 = 1;
  if (!S.sch_exp_layer_index) S.sch_exp_layer_index = [1, 1, 1];
  if (!S.sch_exp_layer) S.sch_exp_layer = [0, 0, 0];
  if (S.sch_exp_totalnoteblocks === undefined) S.sch_exp_totalnoteblocks = 0;
  if (S.sch_exp_range_start === undefined) S.sch_exp_range_start = 0;
  if (S.sch_exp_range_end === undefined) S.sch_exp_range_end = 0;
  if (S.command_block === undefined) S.command_block = false;
}

function branchExport() {
  /* 原版这里读的 sch_exp_ins_block / sch_exp_circuit_block / sch_exp_totalblocks
     等都是 obj_controller 上的常驻变量，永远存在。我们的对应字段由
     ensureSchematicState() 惰性创建，所以入口处必须先确保它们存在，
     否则「不打开窗口直接调用」时会读到 undefined。
     注意用 ensureSchArrays()（只补不改），不能用 ensureSchematicState()，
     原因见该函数上方的说明。 */
  ensureSchArrays();
  const o = S;                       // 原版 obj_controller

  /* 【差异 1】原版这里先 get_save_filename_ext() 取文件名，取消则 return 0。
     浏览器没有同步保存对话框，直接按歌曲名推导（与 schematic.js 同一写法）。 */
  const fn = String(S.filename || S.song_name || 'song').replace(/\.[^.]*$/, '') + '.schematic';

  // schematic_start()：初始化 GMschematic 的 DLL，浏览器里无需任何操作
  const mySchematic = schNew();

  // 计算这份 schematic 的尺寸
  const range_len = S.sch_exp_range_end - S.sch_exp_range_start + 1;
  const sch_len = range_len * 2;

  let sch_wid, sch_hei;
  if (S.sch_exp_velocity === 1) {
    sch_wid = 35;
    sch_hei = 2;
  } else {
    sch_wid = 3;
  }
  // 注意：原版这两行是分开的，第二行无条件覆盖第一行里的 sch_hei
  if (S.sch_exp_polyphony === 1) sch_hei = 2; else sch_hei = 3;

  schSizeOf(mySchematic, sch_wid, sch_len + 1, sch_hei);

  let lineloc = 0;
  if (S.sch_exp_circuitry === 1) {
    // 主线路
    if (S.sch_exp_velocity === 1) lineloc = 17; else lineloc = 1;
    schFill(mySchematic, lineloc, 0, 0, lineloc, sch_len - 1, 0,
      S.sch_exp_circuit_block, S.sch_exp_circuit_data);

    // 中继器 / 方块 交替排布
    for (let a = 0; a < sch_len; a += 2) {
      schCellSet(mySchematic, lineloc, a, 1, 93, 3);
    }
    for (let a = 1; a < sch_len; a += 2) {
      schCellSet(mySchematic, lineloc, a, 1, S.sch_exp_circuit_block, S.sch_exp_circuit_data);
    }
  }

  // 复音数 / 层号 数组转换（层号从 1 起，这里转成 0 起）
  if (!S.sch_exp_layer) S.sch_exp_layer = [0, 0, 0];
  for (let a = 0; a < S.sch_exp_polyphony; a++) {
    S.sch_exp_layer[a] = S.sch_exp_layer_index[a] - 1;
  }

  // 统计哪些音符要被写进数组
  S.sch_exp_totalnoteblocks = 0;
  for (let a = 0; a < S.sch_exp_polyphony; a++) {
    let ticks = 0;
    for (let b = 0; b < range_len; b++) {
      const layer = S.sch_exp_layer[a];
      const tick = S.sch_exp_range_start + b;
      let accepted = 0;
      if (gExists(tick, layer)) {
        const key = gKey(tick, layer);
        if (key > 32 && key < 58) {
          switch (S.sch_exp_stereo) {
            case 1: if (gPan(tick, layer) > 100) accepted = 1; break;   // 右声道
            case 2: if (gPan(tick, layer) < 100) accepted = 1; break;   // 左声道
            case 3: if (gPan(tick, layer) === 100) accepted = 1; break; // 居中
            case 4: accepted = 1; break;                               // 全部
          }
        } else {
          /* 原版这里直接 message() + window = w_branch_export + return 0，
             也就是「中止导出、回到窗口」。JS 里用返回值 false 让调用方
             决定要不要弹窗；消息文本按原版中文改写。 */
          messageDialog('错误：部分音符超出音域！\n请调整微调音高，或改用音域更高/更低的自定义音色。', '错误');
          return false;
        }
      }
      if (!NB.note[a]) { NB.note[a] = []; NB.ins[a] = []; NB.vel[a] = []; NB.key[a] = []; }
      if (!NB.zvel[a]) { NB.zvel[a] = []; NB.xpos[a] = []; }
      if (!NB.x[a]) { NB.x[a] = []; NB.y[a] = []; NB.z[a] = []; }
      if (accepted === 1) {
        NB.note[a][ticks] = gKey(tick, layer);
        NB.ins[a][ticks] = gIns(tick, layer);
        NB.vel[a][ticks] = gVel(tick, layer);
        NB.key[a][ticks] = NB.note[a][ticks] - 33;
        S.sch_exp_totalnoteblocks++;
        accepted = 0;
      } else {
        NB.note[a][ticks] = 0;
        NB.ins[a][ticks] = 0;
        NB.vel[a][ticks] = 0;
        NB.key[a][ticks] = 0;
      }
      NB.zvel[a][ticks] = 0;
      NB.xpos[a][ticks] = 0;
      ticks++;
    }
  }

  // 把音符盒放进 schematic
  for (let a = 0; a < S.sch_exp_polyphony; a++) {   // 逐层
    let b = 1;
    let offset = 0;
    // 原版是三条单行 if：if a=0 offset=0 / if a=1 offset=1 / if a=2 offset=-1
    if (a === 0) offset = 0;
    if (a === 1) offset = 1;
    if (a === 2) offset = -1;
    for (let c = 0; c < range_len; c++) {           // 逐刻
      if (NB.note[a][c] !== 0) {
        const xpos = range_len * 2 - b;             // 反转 x 坐标（只用于 NBT 数据）
        if (S.sch_exp_velocity === 0) {
          schCellSet(mySchematic, lineloc + offset, b, 1, 25, 0);
          schCellSet(mySchematic, lineloc + offset, b, 0, S.sch_exp_ins_block[NB.ins[a][c]], 0);
          NB.x[a][c] = xpos;
          NB.y[a][c] = 1;
          NB.z[a][c] = lineloc + offset;
        } else {
          // 根据音量算音符盒的 z 位置，先把数值存起来，再铺电路
          let zvel = Math.round(32 - NB.vel[a][c] / 100 * 32) + 1;
          if (zvel <= 18 && zvel >= 16) zvel = 15;
          let direc;
          if (zvel > 17) direc = -1; else direc = 1;
          NB.zvel[a][c] = zvel;
          NB.xpos[a][c] = xpos;
          if (S.sch_exp_circuitry === 1) {
            // 把红石线接到音符盒上
            schFill(mySchematic, lineloc, b, 0, zvel, b, 0,
              S.sch_exp_circuit_block, S.sch_exp_circuit_data);
            schFill(mySchematic, lineloc + -direc, b, 1, zvel, b, 1, 55, 0);
          }
        }
      }
      b += 2;
    }
  }

  if (S.sch_exp_velocity === 1) {   // 复音数为 1 或 2 时，音量互相独立
    /* 原版这里的 j 是 obj_controller 上的实例变量，从不重置 ——
       当两个 zvel 都为 0 时它会保留上一次的值。为了完全复现这一行为，
       把 j 放在两个循环之外（不能每轮重置成 0）。 */
    let j = 0;
    for (let a = 0; a < S.sch_exp_polyphony; a++) {
      let b = 1;
      let offset = 0;
      if (a === 0) offset = 0;
      if (a === 1) offset = 1;
      if (a === 2) offset = -1;
      for (let c = 0; c < range_len; c++) {
        if (NB.note[a][c] !== 0) {
          const xpos = range_len * 2 - b;   // 反转 x 坐标（只用于 NBT 数据）
          let freespace = 0;
          if (S.sch_exp_polyphony === 2) {      // 检查音符盒是否冲突
            let layer_correction = 0;
            if (NB.zvel[0][c] !== NB.zvel[1][c]) {
              // 音量不同时，在音符盒旁边补一段红石
              if (NB.zvel[0][c] !== 0) j = 0;
              else if (NB.zvel[1][c] !== 0) j = 1;
              if (j !== 0) {
                schCellSet(mySchematic, NB.zvel[j][c], b, 1,
                  S.sch_exp_circuit_block, S.sch_exp_circuit_data);
                schCellSet(mySchematic, NB.zvel[j][c], b, 2, 55, 0);
                if (NB.zvel[0][c] !== 0 && NB.zvel[1][c] !== 0) {
                  if (NB.zvel[0][c] > lineloc && NB.zvel[0][c] < NB.zvel[1][c]) layer_correction = 1;
                  else if (NB.zvel[0][c] < lineloc && NB.zvel[0][c] > NB.zvel[1][c]) layer_correction = 1;
                }
              }
            }
            if (layer_correction === 1) {   // 挪动第 0 层的位置并补连接红石
              freespace++;
              schCellSet(mySchematic, NB.zvel[0][c], b, 1,
                S.sch_exp_circuit_block, S.sch_exp_circuit_data);
              schCellSet(mySchematic, NB.zvel[0][c], b, 2, 55, 0);
              schCellSet(mySchematic, NB.zvel[0][c], b + freespace, 1, 25, 0);
              schCellSet(mySchematic, NB.zvel[0][c], b + freespace, 0,
                S.sch_exp_ins_block[NB.ins[a][c]], 0);
              NB.x[0][c] = NB.xpos[0][c] - freespace;
              layer_correction = 0;
              freespace = 0;
            }
          }
          if (S.sch_exp_polyphony !== 3) {
            schCellSet(mySchematic, NB.zvel[a][c], b + offset, 1, 25, 0);
            schCellSet(mySchematic, NB.zvel[a][c], b + offset, 0,
              S.sch_exp_ins_block[NB.ins[a][c]], 0);
            NB.x[a][c] = NB.xpos[a][c] - offset;
            NB.y[a][c] = 1;
            NB.z[a][c] = NB.zvel[a][c];
          }
          if (S.sch_exp_polyphony === 3) {   // 复音数为 3 时全部按第 0 层的音量摆
            let fix;
            if (a === 1) fix = 1; else fix = 0;   // 只偏移第 2 层
            let shiftblock = 0;
            j = 0;
            if (NB.zvel[0][c] !== 0) j = 0;
            else if (NB.zvel[1][c] !== 0) j = 1;
            else if (NB.zvel[2][c] !== 0) j = 2;
            if (NB.zvel[0][c] === 0) {
              // 在选中的那一层的音符盒旁边补红石
              schCellSet(mySchematic, NB.zvel[j][c], b, 1,
                S.sch_exp_circuit_block, S.sch_exp_circuit_data);
              schCellSet(mySchematic, NB.zvel[j][c], b, 2, 55, 0);
            }
            if (a === 2) {
              if (NB.zvel[2][c] > 17) shiftblock = 1; else shiftblock = -1;
            }
            schCellSet(mySchematic, NB.zvel[j][c] + shiftblock, b + fix, 1, 25, 0);
            schCellSet(mySchematic, NB.zvel[j][c] + shiftblock, b + fix, 2, 0, 0);
            schCellSet(mySchematic, NB.zvel[j][c] + shiftblock, b + fix, 0,
              S.sch_exp_ins_block[NB.ins[a][c]], 0);
            NB.x[a][c] = NB.xpos[j][c] - fix;
            NB.y[a][c] = 1;
            NB.z[a][c] = NB.zvel[j][c] + shiftblock;
          }
        }
        b += 2;
      }
    }
  }

  schSave(mySchematic, fn);
  // schematic_destroy(mySchematic) / schematic_end()：释放 DLL 资源，浏览器里无需操作
  messageDialog('Schematic 已保存！', '导出分支');
  return true;
}

/* =========================================================================
   四、菜单入口的门控
   -------------------------------------------------------------------------
   对照 menu_click.gml:54-62：
       if (sel = b + 14) { if (calculate_size()) window = w_schematic_export }
       if (sel = b + 15) { if (calculate_size()) window = w_track_export   }
       if (sel = b + 16) { if (calculate_size()) window = w_branch_export  }
   三个导出共用同一个 calculate_size()，它兼做「一次性警告 + 三项兼容性确认 +
   selection_place(0) + 空歌检查 + 速度提示」。
   【为什么不去改 dialogs.js 里 schematic 那一份】那儿已经有一份等价实现，
   这里把同一套流程写成可复用函数，只给直轨 / 分支两个新入口用，
   以免动到已工作正常的 schematic 入口。两个入口的行为完全一致。
   ========================================================================= */
function openSchexportWindow(target) {
  // 每次打开都让 calculateSize() 重新按当前速度推算一次档位（calculate_size.gml:128-132）
  S.sch_exp_tempo_ready = 0;

  // ---- 一次性警告（calculate_size.gml:4-8）----
  if (!S.warning_schematic) {
    S.warning_schematic = 1;
    if (typeof saveSettings === 'function') saveSettings();
    messageDialog('导出的 schematic 只与 Minecraft: Java Edition 1.12 及以下兼容。\n如想在 1.13 和以上使用，请使用结构方块格式导出。\n\n此警告将不再提示。', '警告');
  }

  const doAfterChecks = () => {
    if (calculateSize()) {
      selectionPlace(false);
      if (S.totalblocks - S.block_outside <= 0) {
        messageDialog('没有方块可以导出！', '错误');
      } else {
        S.playing = 0;
        S.window = target;
      }
    }
  };

  // 三项兼容性确认（calculate_size.gml:9-20 / :32-43）
  const asks = [];
  if (S.block_outside > 0) {
    asks.push(['一些方块在 Minecraft 的2八度范围外。你想无视这些方块导出 Schematic 吗？', 'Minecraft 兼容性']);
  }
  if (S.block_custom > 0) {
    asks.push(['一些方块带有自定义音色。继续导出吗？', 'Minecraft 兼容性']);
  }
  if (S.block_pitched > 0) {
    asks.push(['一些方块带有音符盒不支持的微分音。继续导出吗？', 'Minecraft 兼容性']);
  }
  const runAsk = (i) => {
    if (i >= asks.length) {
      // 速度不兼容只提示、不拦截（calculate_size.gml:18-20）
      if (S.tempo !== 10 && S.tempo !== 5 && S.tempo !== 2.5) {
        messageDialog('歌曲的速度与 Minecraft 不兼容。所以，在游戏内的播放会和软件内的有差别。', '速度');
      }
      doAfterChecks();
      return;
    }
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

function ensureBranchState() {
  ensureSchematicState();
  if (S.sch_br_remember === undefined) S.sch_br_remember = 1;
  if (!S.sch_exp_layer_index) S.sch_exp_layer_index = [1, 1, 1];
  if (S.sch_exp_totalnoteblocks === undefined) S.sch_exp_totalnoteblocks = 0;
  if (!S.sch_exp_layer) S.sch_exp_layer = [0, 0, 0];
  if (S.sch_exp_range_start === undefined) S.sch_exp_range_start = 0;
  if (S.sch_exp_range_end === undefined) S.sch_exp_range_end = 0;
}

function drawBranchExport() {
  ensureBranchState();
  // 尺寸统计（层数上限 sch_exp_maxheight[0] 要用）
  calculateSize();

  const x1 = floor(S.rw / 2 - 275), y1 = floor(S.rh / 2 - 200);
  const x2 = x1 + 550, y2 = y1 + 400;
  drawWindow(x1, y1, x2, y2);
  drawWindowTitle(x1, y1, '导出分支');
  setFont(FONT.main());

  // 记住我的更改（绑定 sch_br_remember，Fluent 主题下画成开关）
  if (drawCheckbox(x1 + 12, y1 + 374, !!S.sch_br_remember, '记住我的更改', false, true)) {
    S.sch_br_remember = S.sch_br_remember ? 0 : 1;
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
    /* 原版：draw_sprite(spr_schematic_br, 0, x1 + 15, y1 + 56)
       这套示意图原先没有被打进图集，本次已补上：
       nbsweb/js/assets.js 的 ATLAS_SETS 里加了 'spr_schematic_br'，
       tools/build-atlas.py 的 DOWNSAMPLE 里给它同样的 (4, 64) 参数
       （原图 520x150，与 spr_schematic_exp 同尺寸、同属写实风格配图），
       重新打包后 nbsweb/assets/atlas/spr_schematic_br.png 为 520x150、1 帧。 */
    drawSprite('spr_schematic_br', 0, x1 + 15, y1 + 56);

    text(x1 + 16, y1 + 220, '分布：');
    if (drawRadiobox(x1 + 32, y1 + 240, S.sch_exp_stereo === 4, '全部')) S.sch_exp_stereo = 4;
    if (drawRadiobox(x1 + 32, y1 + 260, S.sch_exp_stereo === 3, '中间')) S.sch_exp_stereo = 3;
    if (drawRadiobox(x1 + 32, y1 + 280, S.sch_exp_stereo === 2, '左部分')) S.sch_exp_stereo = 2;
    if (drawRadiobox(x1 + 32, y1 + 300, S.sch_exp_stereo === 1, '右部分')) S.sch_exp_stereo = 1;

    text(x1 + 170, y1 + 220, '复音数：');
    S.sch_exp_polyphony = median(1,
      Math.round(drawDragValue(18, x1 + 260, y1 + 220, S.sch_exp_polyphony, 1)), 3);
    text(x1 + 170, y1 + 240, '主层数：');
    S.sch_exp_layer1 = median(1,
      Math.round(drawDragValue(15, x1 + 260, y1 + 240, S.sch_exp_layer1, 1)),
      S.sch_exp_maxheight[0] + 1);
    S.sch_exp_layer_index[0] = S.sch_exp_layer1;

    text(x1 + 170, y1 + 260, '和弦层 1：');
    text(x1 + 170, y1 + 280, '和弦层 2：');
    if (S.sch_exp_polyphony > 1) {
      S.sch_exp_layer2 = median(1,
        Math.round(drawDragValue(16, x1 + 260, y1 + 260, S.sch_exp_layer2, 1)),
        S.sch_exp_maxheight[0] + 1);
      S.sch_exp_layer_index[1] = S.sch_exp_layer2;
    } else {
      setColor(C.textDim);
      text(x1 + 260, y1 + 260, '无');
      setColor(C.text);
    }
    if (S.sch_exp_polyphony > 2) {
      S.sch_exp_layer3 = median(1,
        Math.round(drawDragValue(17, x1 + 260, y1 + 280, S.sch_exp_layer3, 1)),
        S.sch_exp_maxheight[0] + 1);
      S.sch_exp_layer_index[2] = S.sch_exp_layer3;
    } else {
      setColor(C.textDim);
      text(x1 + 260, y1 + 280, '无');
      setColor(C.text);
    }

    if (drawCheckbox(x1 + 170, y1 + 300, !!S.sch_exp_velocity, '开启音量变化', false, true)) {
      S.sch_exp_velocity = S.sch_exp_velocity ? 0 : 1;
    }
    let schwidth;
    if (S.sch_exp_velocity === 1) schwidth = 35; else schwidth = 1;
    if (S.sch_exp_polyphony > 1 && S.sch_exp_velocity === 0) schwidth = 3;

    // 原版第 6 个参数是 true：这一项在窗口里是锁定的（不能在导出分支时关掉）
    if (drawCheckbox(x1 + 170, y1 + 320, !!S.sch_exp_circuitry, '导出电路', true, true)) {
      S.sch_exp_circuitry = S.sch_exp_circuitry ? 0 : 1;
    }

    text(x1 + 380, y1 + 256, '大小：');
    text(x1 + 520, y1 + 256, (S.enda * 2 + 4) + 'x2x' + schwidth, 'right');

    text(x1 + 380, y1 + 280, '范围：');
    S.sch_exp_range_start = inputBox(55, S.sch_exp_range_start, x1 + 380, y1 + 300, 40, 21);
    S.sch_exp_range_end = inputBox(56, S.sch_exp_range_end, x1 + 425, y1 + 300, 40, 21);
  } else {
    /* ------------------------------ 方块页 */
    // 表头（原版从右往左画，宽度依次 220 / 60 / 252）
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
      // 下拉箭头（x1+12+4+tabw[0]+tabw[1]-25）
      if (button2(x1 + 16 + 252 + 60 - 25, ry - 2, 20, '▾')) {
        openSchInsBlockMenu(x1 + 16 + 252, ry + 16, b);
      }
      text(x1 + 16 + 252 + 60, ry, blockGetName(S.sch_exp_ins_block[b], S.sch_exp_ins_data[b]));
      setColor(C.separator);
      line(x1 + 12, y1 + 90 + 20 * a, x1 + 528, y1 + 90 + 20 * a);
    }
    if (INSTRUMENTS.length > rows) {
      SB.val[4] = S.sch_exp_scrollbar;
      S.sch_exp_scrollbar = drawScrollbarGML(4, x1 + 524, y1 + 71, 17, rows, INSTRUMENTS.length, 0, 1);
    } else S.sch_exp_scrollbar = 0;

    // 分支导出只用得到「电路所用方块」（过道/地面那一套只有 schematic 导出用）
    text(x1 + 16, y1 + 300, '电路所用方块：');
    const by = y1 + 265 + 30;
    setColor(C.controlBgHover);
    roundRect(x1 + 200, by, x1 + 340, by + 21, 4, true);
    setColor(C.controlBorder);
    roundRect(x1 + 200.5, by + 0.5, x1 + 339.5, by + 20.5, 4, false);
    setColor(C.text);
    text(x1 + 204, by + 4, blockGetName(S.sch_exp_circuit_block, S.sch_exp_circuit_data));
    // 原版：draw_abutton(x1+200+121, y1+267+30) 或整框按下 → show_menu_ext("schexport_block", ...)
    if (button2(x1 + 200 + 121, by + 2, 20, '▾') || (mouseRectangle(x1 + 200, by, 140, 21) && G.mbp[0])) {
      openSchBlockMenu(x1 + 200, by + 23, 1);
    }
  }

  /* ------------------------------ 按钮 */
  if (button2(x1 + 470, y1 + 368, 72, '导出')) {
    if ((S.sch_exp_totalblocks[S.sch_exp_includelocked ? 1 : 0] || 0) <= 0) {
      messageDialog('没有方块可以导出！', '导出分支');
    } else if (realOf(S.sch_exp_range_end) === 0 ||
      S.sch_exp_range_start === '' || S.sch_exp_range_end === '') {
      messageDialog('请输入范围！', '导出分支');
    } else if (realOf(S.sch_exp_range_start) > realOf(S.sch_exp_range_end)) {
      messageDialog('起始刻必须小于结束刻！', '导出分支');
    } else if (realOf(S.sch_exp_range_end) > S.enda) {
      messageDialog('结束刻超出歌曲长度！\n歌曲长度为' + S.enda + '。', '导出分支');
    } else {
      S.sch_exp_range_start = realOf(S.sch_exp_range_start);
      S.sch_exp_range_end = realOf(S.sch_exp_range_end);
      try {
        if (branchExport()) closeWindow();
      } catch (e) {
        messageDialog('导出失败：' + e.message, '错误');
      }
    }
  }
  if (button2(x1 + 470 - 80, y1 + 368, 72, '取消')) {
    S.sch_exp_tab = 0;     // 原版：windowclose = 1; selected_tab_sch = 0
    closeWindow();
  }
  if (button2(x1 + 470 - 160, y1 + 368, 72, '使用默认值')) {
    confirmDialogOn((yes) => { if (yes) resetSchematicExport(1); }, '你确定吗？', '确定');
  }
}

/* =========================================================================
   trackExport() —— 照搬 track_export.gml
   -------------------------------------------------------------------------
   与 GML 的两处等价改写（均已在文件头「差异」列表里登记）：
   · blocks 列表长度：原版先写占位长度 114514 再回填，这里先收集后写正确长度。
   · 九个「放置音符盒」分组：逐行比对确认九份只差 adds / y1 偏移 / 变量后缀，
     因此用 trkPlaceGroup() 传参复用，顺序与数值完全一致。
   ========================================================================= */
function trackExport() {
  // 同 branchExport()：只补缺失的数组，不覆盖调用方已设好的参数
  ensureSchArrays();

  const insnum = INSTRUMENTS.length;
  const layers = 4;

  // 原版：ins[0..15] 是固定名字，16..255 全是 "harp"
  const ins = [];
  const insNames = ['harp', 'bass', 'basedrum', 'snare', 'hat', 'guitar', 'flute', 'bell',
    'chime', 'xylophone', 'iron_xylophone', 'cow_bell', 'didgeridoo', 'bit', 'banjo', 'pling'];
  for (let a = 0; a < 16; a++) ins[a] = insNames[a];
  for (let a = 0; a < 240; a++) ins[16 + a] = 'harp';

  const len = 40 + S.enda * 2;
  const wid = 99;
  const hei = 20;
  const yy = Math.round(wid / 2) - 1;      // 49
  const signx = 2, signy = yy, signz = hei - 1;

  // 初始化本次导出的累积容器
  TRK.insnum = insnum;
  TRK.blocks = [];
  TRK.total = 0;
  TRK.nb = 0;
  TRK.nx = []; TRK.ny = []; TRK.nz = [];
  TRK.nnote = []; TRK.nins = []; TRK.npit = [];

  const WIRE = SCH_WIRE;

  /* 调色板里固定的那一段（walkway / circuit / ground 之后的部分），
     顺序严格照 track_export.gml:116-246。 */
  const paletteFixed = [];
  paletteFixed.push({ name: 'minecraft:blue_wool' });
  paletteFixed.push({ name: 'minecraft:air' });
  paletteFixed.push({ name: 'minecraft:ladder', props: [['facing', 'north'], ['waterlogged', 'false']] });
  paletteFixed.push({ name: 'minecraft:redstone_wire', props: [['east', 'side'], ['north', 'side'], ['power', '0'], ['south', 'side'], ['west', 'side']] });
  for (let a = 1; a < 5; a++) {
    paletteFixed.push({ name: 'minecraft:repeater', props: [['delay', String(a)], ['facing', 'north'], ['locked', 'false'], ['powered', 'false']] });
  }
  for (let a = 1; a < 5; a++) {
    paletteFixed.push({ name: 'minecraft:repeater', props: [['delay', String(a)], ['facing', 'west'], ['locked', 'false'], ['powered', 'false']] });
  }
  paletteFixed.push({ name: 'minecraft:repeater', props: [['delay', '0'], ['facing', 'east'], ['locked', 'false'], ['powered', 'false']] });
  paletteFixed.push({ name: 'minecraft:redstone_torch', props: [['lit', 'false']] });
  paletteFixed.push({ name: 'minecraft:redstone_torch', props: [['lit', 'true']] });
  paletteFixed.push({ name: 'minecraft:stone_button', props: [['face', 'wall'], ['facing', 'south'], ['powered', 'false']] });
  paletteFixed.push({ name: 'minecraft:oak_wall_sign', props: [['facing', 'south'], ['waterlogged', 'false']] });
  paletteFixed.push({ name: 'minecraft:powered_rail', props: [['powered', 'false'], ['shape', 'north_south']] });
  paletteFixed.push({ name: 'minecraft:chest', props: [['facing', 'west'], ['type', 'single'], ['waterlogged', 'false']] });
  paletteFixed.push({ name: 'minecraft:rail', props: [['shape', 'north_south'], ['waterlogged', 'false']] });
  paletteFixed.push({ name: 'minecraft:redstone_wall_torch', props: [['lit', 'false'], ['facing', 'east']] });
  paletteFixed.push({ name: 'minecraft:redstone_wall_torch', props: [['lit', 'true'], ['facing', 'east']] });
  paletteFixed.push({ name: 'minecraft:redstone_wall_torch', props: [['lit', 'false'], ['facing', 'west']] });
  paletteFixed.push({ name: 'minecraft:redstone_wall_torch', props: [['lit', 'true'], ['facing', 'west']] });
  paletteFixed.push({ name: 'minecraft:lever', props: [['powered', 'true'], ['facing', 'south'], ['face', 'wall']] });
  paletteFixed.push({ name: 'minecraft:redstone_wall_torch', props: [['lit', 'true'], ['facing', 'north']] });
  paletteFixed.push({ name: 'minecraft:smooth_stone_slab', props: [['type', 'top']] });

  /* 出口告示牌 —— 在调色板之后、walkway 之前就写进 blocks 列表的第一条
     （对照 track_export.gml:251-265）。 */
  const signNbt = {
    Color: 'black',
    id: 'minecraft:sign',
    Text1: '{"text": "Song generated"}',
    Text2: '{"text": "by the"}',
    Text3: '{"text": "Minecraft Note"}',
    Text4: '{"text": "Block Studio"}',
  };
  /* 出口告示牌 —— 在调色板之后、walkway 之前，是 blocks 列表的第一条
     （对照 track_export.gml:251-265：pos 写 (99-signy, signz, signx)，
     state = insnum*26+19）。这里直接入栈，不走 trkPush()，因为原版的
     pos 表达式就是这三个值本身（而 trkPush 会把第 1 个参数当成 y 再换算一次）。 */
  TRK.blocks.push({
    px: 99 - signy, pz: signz, py: signx,
    state: insnum * 26 + 19, nbt: signNbt,
  });
  TRK.total++;

  // ---- 过道（track_export.gml:268-272）----
  for (let a = 0; a < 3; a++) {
    for (let b = 2; b < len + 2; b++) {
      trkWalkway(b, yy + a, hei - 3);
    }
  }

  // ---- 控制电路（track_export.gml:274-417）----
  trkCircuit(1, yy, hei - 2);
  trkCircuit(1, yy + 1, hei - 2);
  trkOther(1, yy, hei - 1, 35, 11);        // 羊毛
  trkOther(1, yy + 1, hei - 1, 35, 11);
  trkOther(2, yy, hei - 1, 68, 3);         // 按钮
  trkOther(2, yy + 1, hei - 1, 77, 3);
  // 后方
  trkCircuit(0, yy + 1, hei - 2);
  trkOther(0, yy + 1, hei - 1, WIRE, 0);
  trkOther(0, yy, hei - 2, SCH_TORCHON, 1);

  trkOther(0, yy, hei - 3, WIRE, 0);
  trkCircuit(0, yy, hei - 4);
  trkOther(0, yy + 1, hei - 4, SCH_TORCHOFF, 2);

  trkOther(0, yy + 1, hei - 5, WIRE, 0);
  trkCircuit(0, yy + 1, hei - 6);

  for (let a = 0; a < 13; a++) {
    trkRepeater(1 + 2 * a, yy + 1, hei - 5 - a, 0, 2, 0);
    trkOther(2 + 2 * a, yy + 1, hei - 5 - a, WIRE, 0);
    trkCircuit(1 + 2 * a, yy + 1, hei - 6 - a);
    trkCircuit(2 + 2 * a, yy + 1, hei - 6 - a);
  }

  for (let a = 0; a < 4; a++) {
    trkRepeater(27 + a * 2, yy + 1, hei - 18, 0, 2, 0);
    trkCircuit(27 + a * 2, yy + 1, hei - 19);
    trkCircuit(28 + a * 2, yy + 1, hei - 18);
  }

  for (let a = 0; a < 11; a++) {
    trkCircuit(34, yy - a, hei - 19);
    trkOther(34, yy - a, hei - 18, WIRE, 0);
    trkCircuit(34, yy + 2 + a, hei - 19);
    trkOther(34, yy + 2 + a, hei - 18, WIRE, 0);
  }

  for (let a = 0; a < 12; a++) {
    trkCircuit(34, yy - 11 - a, hei - 18);
    if (a !== 4) trkOther(34, yy - 11 - a, hei - 17, WIRE, 0);
    else trkRepeater(34, yy - 11 - a, hei - 17, 0, 1, 0);
    trkCircuit(34, yy + 13 + a, hei - 18);
    if (a !== 4) trkOther(34, yy + 13 + a, hei - 17, WIRE, 0);
    else trkRepeater(34, yy + 13 + a, hei - 17, 0, 3, 0);
  }

  for (let a = 0; a < 12; a++) {
    trkCircuit(34, yy - 23 - a, hei - 17);
    if (a !== 8) trkOther(34, yy - 23 - a, hei - 16, WIRE, 0);
    else trkRepeater(34, yy - 23 - a, hei - 16, 0, 1, 0);
    trkCircuit(34, yy + 25 + a, hei - 17);
    if (a !== 8) trkOther(34, yy + 25 + a, hei - 16, WIRE, 0);
    else trkRepeater(34, yy + 25 + a, hei - 16, 0, 3, 0);
  }

  for (let a = 0; a < 12; a++) {
    trkCircuit(34, yy - 35 - a, hei - 16);
    trkOther(34, yy - 35 - a, hei - 15, WIRE, 0);
    trkCircuit(34, yy + 37 + a, hei - 16);
    trkOther(34, yy + 37 + a, hei - 15, WIRE, 0);
  }

  trkCircuit(35, yy - 11, hei - 18);
  trkCircuit(36, yy - 11, hei - 18);
  trkCircuit(37, yy - 11, hei - 18);
  trkCircuit(35, yy - 11 - 12, hei - 17);
  trkCircuit(36, yy - 11 - 12, hei - 17);
  trkCircuit(37, yy - 11 - 12, hei - 17);
  trkCircuit(35, yy - 11 - 12 - 12, hei - 16);
  trkCircuit(36, yy - 11 - 12 - 12, hei - 16);
  trkCircuit(37, yy - 11 - 12 - 12, hei - 16);
  trkCircuit(35, yy - 11 - 12 - 12 - 12, hei - 16);
  trkCircuit(36, yy - 11 - 12 - 12 - 12, hei - 15);
  trkCircuit(37, yy - 11 - 12 - 12 - 12, hei - 15);
  trkCircuit(34, yy - 11 - 12 - 12 - 12, hei - 15);
  trkCircuit(35, yy + 11 + 2, hei - 18);
  trkCircuit(36, yy + 11 + 2, hei - 18);
  trkCircuit(37, yy + 11 + 2, hei - 18);
  trkCircuit(35, yy + 11 + 12 + 2, hei - 17);
  trkCircuit(36, yy + 11 + 12 + 2, hei - 17);
  trkCircuit(37, yy + 11 + 12 + 2, hei - 17);
  trkCircuit(35, yy + 11 + 12 + 12 + 2, hei - 16);
  trkCircuit(36, yy + 11 + 12 + 12 + 2, hei - 16);
  trkCircuit(37, yy + 11 + 12 + 12 + 2, hei - 16);
  trkCircuit(35, yy + 11 + 12 + 12 + 12 + 2, hei - 16);
  trkCircuit(36, yy + 11 + 12 + 12 + 12 + 2, hei - 15);
  trkCircuit(37, yy + 11 + 12 + 12 + 12 + 2, hei - 15);
  trkCircuit(34, yy + 11 + 12 + 12 + 12 + 2, hei - 15);
  trkCircuit(35, yy + 1, hei - 19);
  trkCircuit(36, yy + 1, hei - 18);
  trkCircuit(37, yy + 1, hei - 19);

  trkOther(36, yy - 11, hei - 17, WIRE, 0);
  trkOther(37, yy - 11, hei - 17, WIRE, 0);
  trkOther(36, yy - 11 - 12, hei - 16, WIRE, 0);
  trkOther(37, yy - 11 - 12, hei - 16, WIRE, 0);
  trkOther(36, yy - 11 - 12 - 12, hei - 15, WIRE, 0);
  trkOther(37, yy - 11 - 12 - 12, hei - 15, WIRE, 0);
  trkOther(36, yy - 11 - 12 - 12 - 12, hei - 14, WIRE, 0);
  trkOther(37, yy - 11 - 12 - 12 - 12, hei - 14, WIRE, 0);
  trkOther(36, yy + 11 + 2, hei - 17, WIRE, 0);
  trkOther(37, yy + 11 + 2, hei - 17, WIRE, 0);
  trkOther(36, yy + 11 + 12 + 2, hei - 16, WIRE, 0);
  trkOther(37, yy + 11 + 12 + 2, hei - 16, WIRE, 0);
  trkOther(36, yy + 11 + 12 + 12 + 2, hei - 15, WIRE, 0);
  trkOther(37, yy + 11 + 12 + 12 + 2, hei - 15, WIRE, 0);
  trkOther(36, yy + 11 + 12 + 12 + 12 + 2, hei - 14, WIRE, 0);
  trkOther(37, yy + 11 + 12 + 12 + 12 + 2, hei - 14, WIRE, 0);
  trkOther(37, yy + 1, hei - 18, WIRE, 0);

  trkRepeater(35, yy - 11, hei - 17, 2, 2, 0);
  trkRepeater(35, yy - 11 - 12, hei - 16, 1, 2, 0);
  trkRepeater(35, yy - 11 - 12 - 12, hei - 15, 0, 2, 0);
  trkRepeater(35, yy - 11 - 12 - 12 - 12, hei - 15, 0, 2, 0);
  trkRepeater(35, yy + 11 + 2, hei - 17, 2, 2, 0);
  trkRepeater(35, yy + 11 + 12 + 2, hei - 16, 1, 2, 0);
  trkRepeater(35, yy + 11 + 12 + 12 + 2, hei - 15, 0, 2, 0);
  trkRepeater(35, yy + 11 + 12 + 12 + 12 + 2, hei - 15, 0, 2, 0);
  trkRepeater(35, yy + 1, hei - 18, 2, 2, 0);

  for (let a = 0; a < 4; a++) {
    for (let b = 0; b < 13; b++) {
      const bx = 37 + ((b % 2 === 0) ? 1 : 0);
      trkOther(bx, yy - 11 - 12 * a, hei - 17 + b + a, 44, 2);
      trkOther(bx, yy - 11 - 12 * a, hei - 16 + b + a, WIRE, 2);
      trkOther(bx, yy + 11 + 12 * a + 2, hei - 17 + b + a, 44, 2);
      trkOther(bx, yy + 11 + 12 * a + 2, hei - 16 + b + a, WIRE, 2);
    }
    for (let b = 0; b < 4; b++) {
      trkCircuit(39, yy - 11 - 12 * a, hei - 17 + 4 * b + a);
      trkRepeater(39, yy - 11 - 12 * a, hei - 16 + 4 * b + a, 0, 2, 0);
      trkCircuit(39, yy + 11 + 12 * a + 2, hei - 17 + 4 * b + a);
      trkRepeater(39, yy + 11 + 12 * a + 2, hei - 16 + 4 * b + a, 0, 2, 0);
    }
  }

  for (let b = 0; b < 13; b++) {
    const bx = 37 + ((b % 2 === 0) ? 1 : 0);
    trkOther(bx, yy + 1, hei - 18 + b, 44, 2);
    trkOther(bx, yy + 1, hei - 17 + b, WIRE, 2);
  }
  for (let b = 0; b < 4; b++) {
    trkCircuit(39, yy + 1, hei - 18 + 4 * b);
    trkRepeater(39, yy + 1, hei - 17 + 4 * b, 0, 2, 0);
  }

  /* ---- 添加音符盒（track_export.gml:419-1177）---- */
  let xx = -1 + 40;
  const dir = 1;

  const gc = trkGroup();      // center
  const gl1 = trkGroup(), gl2 = trkGroup(), gl3 = trkGroup(), gl4 = trkGroup();
  const gr1 = trkGroup(), gr2 = trkGroup(), gr3 = trkGroup(), gr4 = trkGroup();
  const allGroups = [gc, gl1, gl2, gl3, gl4, gr1, gr2, gr3, gr4];

  for (let a = 0; a <= S.enda; a++) {
    for (const g of allGroups) { g.n = 0; g.ins = []; g.key = []; g.pit = []; }

    if (colamount[a] > 0) {
      for (let b = 0; b <= collast[a]; b++) {
        if (gExists(a, b) && (S.lockedlayer[b] === 0 || S.sch_exp_includelocked)) {
          const key = gKey(a, b);
          if ((key > 32 && key < 58) ||
            (S.structure && S.command_block && key >= 9 && key <= 81)) {
            let cpan;
            if (S.layerstereo[b] === 100) cpan = gPan(a, b);
            else cpan = (S.layerstereo[b] + gPan(a, b)) / 2;
            const cvol = (S.layervol[b] / 100) * gVel(a, b);
            const cpanvol = (cpan - 100) * cvol + 100;
            const insIdx = gIns(a, b);

            /* 九组阈值判定，逐字照搬 GML 的布尔表达式
               （含原版 r4 里两处 cpanvol / cpan 混用、以及 ins 用 -!cond 的写法）。 */
            const mL = (cpan > 80 && cpan < 120) || (cpan > 0 && cpan <= 80);
            const mR = (cpan > 80 && cpan < 120) || (cpan > 120 && cpan <= 200);
            const cC = (cpan > 80 && cpan < 120 && cvol > 0.8);
            const c1 = (((cpan > 80 && cpan < 120 && cvol <= 0.8) || (cpan > 0 && cpan <= 80)) && cvol > 0.6)
              || (cpanvol >= 120 && cpanvol < 140);
            const c2 = (mL && cvol > 0.4 && cvol <= 0.6) || (cpanvol >= 140 && cpanvol < 160);
            const c3 = (mL && cvol > 0.2 && cvol <= 0.4) || (cpanvol >= 160 && cpanvol < 180);
            const c4 = (mL && cvol > 0.0 && cvol <= 0.2) || (cpanvol >= 180);
            const r1 = (((cpan > 80 && cpan < 120 && cvol <= 0.8) || (cpan > 120 && cpan <= 200)) && cvol > 0.6)
              || (cpanvol > 60 && cpanvol <= 80);
            const r2 = (mR && cvol > 0.4 && cvol <= 0.6) || (cpanvol > 40 && cpanvol <= 60);
            const r3 = (mR && cvol > 0.2 && cvol <= 0.4) || (cpanvol > 20 && cpanvol <= 40);
            const r4 = (mR && cvol > 0.0 && cvol <= 0.2) || (cpanvol <= 20);
            /* 【原版笔误，必须保留】GML 第 518 行（r4 的 nblockinsr4）里，
               「乘的那半」用的是 `cpanvol <= 20`，而「! 取反的那半」写的是
               `cpan <= 20`（少了 vol）。其余八组的两半完全一致，只有 r4 不同。
               这里把取反那半单独写成 r4neg，逐字复现这个不一致。 */
            const r4neg = (mR && cvol > 0.0 && cvol <= 0.2) || (cpan <= 20);

            // ins 的写法是 `index * bool - !bool`：命不中时结果是 -1
            gc.ins[gc.n] = insIdx * (cC ? 1 : 0) - (cC ? 0 : 1);
            gc.key[gc.n] = key * (cC ? 1 : 0);
            gc.pit[gc.n] = gPit(a, b) * (cC ? 1 : 0);
            gc.n++;

            gl4.ins[gl4.n] = insIdx * (c4 ? 1 : 0) - (c4 ? 0 : 1);
            gl4.key[gl4.n] = key * (c4 ? 1 : 0);
            gl4.pit[gl4.n] = gPit(a, b) * (c4 ? 1 : 0);
            gl4.n++;
            gl3.ins[gl3.n] = insIdx * (c3 ? 1 : 0) - (c3 ? 0 : 1);
            gl3.key[gl3.n] = key * (c3 ? 1 : 0);
            gl3.pit[gl3.n] = gPit(a, b) * (c3 ? 1 : 0);
            gl3.n++;
            gl2.ins[gl2.n] = insIdx * (c2 ? 1 : 0) - (c2 ? 0 : 1);
            gl2.key[gl2.n] = key * (c2 ? 1 : 0);
            gl2.pit[gl2.n] = gPit(a, b) * (c2 ? 1 : 0);
            gl2.n++;
            gl1.ins[gl1.n] = insIdx * (c1 ? 1 : 0) - (c1 ? 0 : 1);
            gl1.key[gl1.n] = key * (c1 ? 1 : 0);
            gl1.pit[gl1.n] = gPit(a, b) * (c1 ? 1 : 0);
            gl1.n++;

            gr1.ins[gr1.n] = insIdx * (r1 ? 1 : 0) - (r1 ? 0 : 1);
            gr1.key[gr1.n] = key * (r1 ? 1 : 0);
            gr1.pit[gr1.n] = gPit(a, b) * (r1 ? 1 : 0);
            gr1.n++;
            gr2.ins[gr2.n] = insIdx * (r2 ? 1 : 0) - (r2 ? 0 : 1);
            gr2.key[gr2.n] = key * (r2 ? 1 : 0);
            gr2.pit[gr2.n] = gPit(a, b) * (r2 ? 1 : 0);
            gr2.n++;
            gr3.ins[gr3.n] = insIdx * (r3 ? 1 : 0) - (r3 ? 0 : 1);
            gr3.key[gr3.n] = key * (r3 ? 1 : 0);
            gr3.pit[gr3.n] = gPit(a, b) * (r3 ? 1 : 0);
            gr3.n++;
            gr4.ins[gr4.n] = insIdx * (r4 ? 1 : 0) - (r4neg ? 0 : 1);   // 注意用 r4neg（见上方笔误说明）
            gr4.key[gr4.n] = key * (r4 ? 1 : 0);
            gr4.pit[gr4.n] = gPit(a, b) * (r4 ? 1 : 0);
            gr4.n++;
          }
        }
      }
    }

    // 九个计数器各自减 1（track_export.gml:526-534）
    for (const g of allGroups) g.n -= 1;

    /* 九个分组依次放置。y1 = yy + dir + ydelta，ydelta 依次为
       0 / -12 / -24 / -36 / -48（左）与 0 / +12 / +24 / +36 / +48（右），
       center 只有一组（ydelta = 0），左右各四组。adds 依次 1..5。 */
    trkPlaceGroup(1, 0, gc, xx, yy, dir, layers);
    trkPlaceGroup(2, -12, gl1, xx, yy, dir, layers);
    trkPlaceGroup(3, -24, gl2, xx, yy, dir, layers);
    trkPlaceGroup(4, -36, gl3, xx, yy, dir, layers);
    trkPlaceGroup(5, -48, gl4, xx, yy, dir, layers);
    trkPlaceGroup(2, +12, gr1, xx, yy, dir, layers);
    trkPlaceGroup(3, +24, gr2, xx, yy, dir, layers);
    trkPlaceGroup(4, +36, gr3, xx, yy, dir, layers);
    trkPlaceGroup(5, +48, gr4, xx, yy, dir, layers);

    xx += 2 * dir;
  }

  /* ---- 音符盒的 nbt（playsound 命令方块数据）---- */
  for (let a = 0; a < TRK.nb; a++) {
    let soundname = datInstrument(TRK.nins[a]);
    const rel = TRK.nnote[a] + TRK.npit[a] / 100;
    if (rel < 0) soundname += '_-1';
    else if (rel > 24) soundname += '_1';
    const soundpitch = datPitch(TRK.nnote[a] + 33 + TRK.npit[a] / 100);
    const state = 3 + insnum + (TRK.nins[a] * 25 + TRK.nnote[a]) * (S.command_block ? 0 : 1);
    TRK.blocks.push({
      px: 99 - TRK.ny[a], pz: TRK.nz[a], py: TRK.nx[a], state,
      nbt: {
        Command: 'playsound ' + soundname + ' block @a ~ ~ ~ 3 ' + soundpitch,
        TrackOutput: 0,
        powered: 0,
        auto: 0,
        conditionMet: 1,
        UpdateLastExecution: 1,
      },
    });
    TRK.total++;
  }

  /* ---- 写出结构方块 NBT ---- */
  const w = new NbtWriter();
  w.tagCompound('');
  w.tagInt('DataVersion', 1519);
  w.tagList('size', 3, 3);
  w.be32(32);
  w.be32(hei);
  w.be32(32);

  // 调色板：walkway / circuit / ground + 每个音色的底座 + 音符盒(或命令方块) + 固定段
  w.tagList('palette', 30 + insnum * 26, 10);
  w.tagString('Name', 'minecraft:' + blockGetNamespacedId(S.sch_exp_walkway_block, S.sch_exp_walkway_data));
  w.tagEnd();
  w.tagString('Name', 'minecraft:' + blockGetNamespacedId(S.sch_exp_circuit_block, S.sch_exp_circuit_data));
  w.tagEnd();
  w.tagString('Name', 'minecraft:' + blockGetNamespacedId(S.sch_exp_ground_block, S.sch_exp_ground_data));
  w.tagEnd();
  for (let a = 0; a < insnum; a++) {
    w.tagString('Name', 'minecraft:' + blockGetNamespacedId(S.sch_exp_ins_block[a], S.sch_exp_ins_data[a]));
    if (a === 9) {
      w.tagCompound('Properties');
      w.tagString('axis', 'y');
      w.tagEnd();
    }
    w.tagEnd();
  }
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
  for (const p of paletteFixed) {
    w.tagString('Name', p.name);
    if (p.props) {
      w.tagCompound('Properties');
      for (const [k, v] of p.props) w.tagString(k, v);
      w.tagEnd();
    }
    w.tagEnd();
  }

  w.tagList('entities', 0, 10);

  // blocks：长度已确定，一次写对（原版是回填 114514 这个占位值）
  w.tagList('blocks', TRK.blocks.length, 10);
  for (const blk of TRK.blocks) {
    if (blk.nbt) {
      w.tagCompound('nbt');
      for (const k of Object.keys(blk.nbt)) {
        const v = blk.nbt[k];
        if (typeof v === 'string') w.tagString(k, v);
        else w.tagByte(k, v);
      }
      w.tagEnd();
    }
    w.tagList('pos', 3, 3);
    w.be32(blk.px);
    w.be32(blk.pz);
    w.be32(blk.py);
    w.tagInt('state', blk.state);
    w.tagEnd();
  }

  w.tagEnd();     // 结束最外层 compound

  const gz = gzipStore(w.bytes());
  // 原版：filename_new_ext(string_replace_all(string_lower(filename), " ", "_"), "") + ".nbt"
  const base = String(S.filename || S.song_name || 'song').toLowerCase().replace(/ /g, '_').replace(/\.[^.]*$/, '') + '.nbt';
  downloadBytes(gz, base);

  messageDialog('结构已保存！', '导出直轨');
  return true;
}

/* =========================================================================
   六、draw_window_track_export() —— 550x400，两页（设计 / 方块）
   坐标全部照 draw_window_track_export.gml 的中文分支（language = 1）。
   ========================================================================= */
function ensureTrackState() {
  ensureBranchState();
  if (S.sch_exp_remember === undefined) S.sch_exp_remember = 1;
  if (S.command_block === undefined) S.command_block = false;
}

function drawTrackExport() {
  ensureTrackState();
  calculateSize();

  const x1 = floor(S.rw / 2 - 275), y1 = floor(S.rh / 2 - 200);
  const x2 = x1 + 550, y2 = y1 + 400;
  drawWindow(x1, y1, x2, y2);
  drawWindowTitle(x1, y1, '导出直轨');
  setFont(FONT.main());

  // 记住我的更改（绑定 sch_exp_remember，对照 gml:33）
  if (drawCheckbox(x1 + 12, y1 + 374, !!S.sch_exp_remember, '记住我的更改', false, true)) {
    S.sch_exp_remember = S.sch_exp_remember ? 0 : 1;
  }

  const tab = exportTabs(x1, y1, ['设计', '方块'], S.sch_exp_tab);
  if (tab > -1) S.sch_exp_tab = tab;

  setColor(C.controlBg);
  roundRect(x1 + 6, y1 + 46, x2 - 6, y1 + 362, 4, true);
  setColor(C.controlBorder);
  roundRect(x1 + 6.5, y1 + 46.5, x2 - 6.5, y1 + 361.5, 4, false);

  setFont(FONT.main());
  setColor(C.text);

  if (S.sch_exp_tab === 0) {
    /* ------------------------------ 设计页（gml:114-130）*/
    // 示意图：draw_sprite(spr_schematic_exp, sch_exp_layout, x1+15, y1+56)
    drawSprite('spr_schematic_exp', clamp(S.sch_exp_layout | 0, 0, 2), x1 + 15, y1 + 56);

    text(x1 + 16, y1 + 220, '分布:');
    /* 原版这两个单选的第 4 个参数是 1（锁定为选中、点了也不改值）：
       draw_radiobox(x1+32, y1+240, 1, "普通过道", ...) —— 直轨导出只有这一种布局。 */
    drawRadiobox(x1 + 32, y1 + 240, true, '普通过道');
    text(x1 + 16, y1 + 280, '导出为 Minecraft 版本:');
    drawRadiobox(x1 + 32, y1 + 300, true, '1.13+');

    if (drawCheckbox(x1 + 170, y1 + 240, !!S.sch_exp_includelocked, '包括已静音的层', false, true)) {
      S.sch_exp_includelocked = S.sch_exp_includelocked ? 0 : 1;
    }
    if (drawCheckbox(x1 + 170, y1 + 260, !!S.command_block, '使用命令方块', false, true)) {
      S.command_block = !S.command_block;
    }

    text(x1 + 380, y1 + 220, '音符盒:');
    text(x1 + 380, y1 + 220 + 16 * 1, '中继器:');
    text(x1 + 380, y1 + 220 + 16 * 2, '大小:');
    text(x1 + 520, y1 + 220, String(Math.max(0, (S.sch_exp_totalblocks[S.sch_exp_includelocked ? 1 : 0] || 0))), 'right');
    text(x1 + 520, y1 + 220 + 16 * 1, String(66 + S.enda * 9), 'right');
    text(x1 + 520, y1 + 220 + 16 * 2, (39 + S.enda * 2) + 'x' + 98 + 'x' + 19, 'right');

    text(x1 + 380, y1 + 220 + 16 * 3, '速度:');
    drawRadiobox(x1 + 396, y1 + 220 + 16 * 3 + 20, true, '10 红石刻 / 秒');
  } else {
    /* ------------------------------ 方块页（gml:166-226）*/
    setFont(FONT.small()); setColor(C.textDim);
    text(x1 + 16, y1 + 54, '音色');
    text(x1 + 16 + 252, y1 + 54, '方块');
    text(x1 + 16 + 252 + 60, y1 + 54, '方块名称');
    setFont(FONT.main());

    const rows = 9;
    const sc = S.sch_exp_scrollbar || 0;
    let lastRow = 0;
    for (let a = 0; a < rows; a++) {
      const b = floor(sc + a);
      if (b >= INSTRUMENTS.length) break;
      lastRow = a;
      const ins = INSTRUMENTS[b];
      const ry = y1 + 74 + 20 * a;
      setColor(C.text);
      text(x1 + 16, ry, ins.name);
      text(x1 + 16 + 252, ry, S.sch_exp_ins_block[b] + ', ' + S.sch_exp_ins_data[b]);
      if (button2(x1 + 16 + 252 + 60 - 25, ry - 2, 20, '▾')) {
        openSchInsBlockMenu(x1 + 16 + 252, ry + 16, b);
      }
      text(x1 + 16 + 252 + 60, ry, blockGetName(S.sch_exp_ins_block[b], S.sch_exp_ins_data[b]));
      setColor(C.separator);
      line(x1 + 12, y1 + 90 + 20 * a, x2 - 22, y1 + 90 + 20 * a);
    }
    // 列分隔线（gml:183-184）
    setColor(C.separator);
    line(x1 + 9 + 252, y1 + 70, x1 + 9 + 252, y1 + 70 + 20 * (lastRow + 1));
    line(x1 + 8 + 252 + 60, y1 + 70, x1 + 8 + 252 + 60, y1 + 70 + 20 * (lastRow + 1));

    if (INSTRUMENTS.length > rows) {
      SB.val[4] = S.sch_exp_scrollbar;
      S.sch_exp_scrollbar = drawScrollbarGML(4, x1 + 524, y1 + 71, 17, rows, INSTRUMENTS.length, 0, 1);
    } else S.sch_exp_scrollbar = 0;

    // 两个方块选择器：过道用（0）与电路用（1）；直轨没有「地面」那一项
    const labels = ['过道所用方块:', '电路所用方块:'];
    for (let i = 0; i < 2; i++) {
      const by = y1 + 265 + i * 30;
      text(x1 + 16, by + 4, labels[i]);
      setColor(C.controlBgHover);
      roundRect(x1 + 200, by, x1 + 340, by + 21, 4, true);
      setColor(C.controlBorder);
      roundRect(x1 + 200.5, by + 0.5, x1 + 339.5, by + 20.5, 4, false);
      setColor(C.text);
      const bid = (i === 0) ? S.sch_exp_walkway_block : S.sch_exp_circuit_block;
      const bdat = (i === 0) ? S.sch_exp_walkway_data : S.sch_exp_circuit_data;
      text(x1 + 204, by + 4, blockGetName(bid, bdat));
      if (button2(x1 + 200 + 121, by + 2, 20, '▾') || (mouseRectangle(x1 + 200, by, 140, 21) && G.mbp[0])) {
        openSchBlockMenu(x1 + 200, by + 23, i);
      }
    }
  }

  /* ------------------------------ 按钮（gml:244-258，中文分支）*/
  if (button2(x1 + 470, y1 + 368, 72, '导出')) {
    if ((S.sch_exp_totalblocks[S.sch_exp_includelocked ? 1 : 0] || 0) <= 0) {
      // 原版这里的标题就是「导出 Schematic」，中文分支也一样，照搬
      messageDialog('没有方块可以导出！', '导出 Schematic');
    } else {
      try {
        if (trackExport()) closeWindow();
      } catch (e) {
        messageDialog('导出失败：' + e.message, '错误');
      }
    }
  }
  if (button2(x1 + 470 - 80, y1 + 368, 72, '取消')) closeWindow();
  if (button2(x1 + 470 - 160, y1 + 368, 72, '使用默认值')) {
    confirmDialogOn((yes) => { if (yes) resetSchematicExport(1); }, '你确定吗？', '确定');
  }
}



/* block_other_track / block_circuit_track / block_repeater_track /
   block_walkway_track 的等价物 —— 都往同一个 blocks 数组里追加一条。
   原版每个函数体都只有「算 state」「写 pos 三个 int」「写 state」「计数」，
   这里照搬同样的顺序与同样的 state 算式。 */
function trkStateOther(id, data, insnum) {
  // 逐行照搬 block_other_track.gml 的 state 判定链
  if (id === 0) return insnum * 26 + 4;                       // air
  else if (id === 35 && data === 11) return insnum * 26 + 3;  // blue_wool
  else if (id === 65) return insnum * 26 + 5;                 // ladder
  else if (id === 55) return insnum * 26 + 6;                 // redstone_wire
  else if (id === 75 && data === 5) return insnum * 26 + 16;  // unlit torch
  else if (id === 76 && data === 5) return insnum * 26 + 17;  // lit torch
  else if (id === 77) return insnum * 26 + 18;                // south stone_button
  else if (id === 27) return insnum * 26 + 20;                // ns powered_rail
  else if (id === 66) return insnum * 26 + 22;                // ns rail
  else if (id === 75 && data === 1) return insnum * 26 + 23;  // east unlit walltorch
  else if (id === 76 && data === 1) return insnum * 26 + 24;  // east lit walltorch
  else if (id === 75 && data === 2) return insnum * 26 + 25;  // west unlit walltorch
  else if (id === 76 && data === 2) return insnum * 26 + 26;  // west lit walltorch
  else if (id === 69) return insnum * 26 + 27;                // south lever
  else if (id === 75 && data === 4) return insnum * 26 + 28;  // north lit walltorch
  else if (id === 44) return insnum * 26 + 29;                // top slab
  // else 分支：在已注册的底座方块表里找 id / data 都相同的项
  for (let i = 0; i < insnum; i++) {
    if (id === S.sch_exp_ins_block[i] && data === S.sch_exp_ins_data[i]) return 3 + i;
  }
  return insnum * 26 + 4;
}

/* 直轨导出用的四个 block_*_track 等价物。
   GML 里它们直接往 buffer 写 tag；这里往 TRK.blocks 追加一条记录，
   由 trackExport() 最后统一写出（理由见上方 track_export() 的说明）。
   坐标按原版换算：NBT 里的 pos = (99 - y, z, x)。 */
const TRK = {
  insnum: 0, blocks: [], total: 0,
  // GML 的 noteblockx/y/z/note/ins/pit 与 noteblocks 计数
  nb: 0, nx: [], ny: [], nz: [], nnote: [], nins: [], npit: [],
};

function trkPush(x, y, z, state, nbt) {
  const rec = { px: 99 - y, pz: z, py: x, state };
  if (nbt) rec.nbt = nbt;
  TRK.blocks.push(rec);
  TRK.total++;
}

// block_walkway_track(x, y, z)：state 恒为 0
function trkWalkway(x, y, z) { trkPush(x, y, z, 0, null); }
// block_circuit_track(x, y, z)：state 恒为 1
function trkCircuit(x, y, z) { trkPush(x, y, z, 1, null); }
// block_other_track(x, y, z, id, data)
function trkOther(x, y, z, id, data) { trkPush(x, y, z, trkStateOther(id, data, TRK.insnum), null); }
/* block_repeater_track(x, y, z, delay, direction, powered)
   注意原版这个函数体里【没有】用 powered 参与 state 计算。 */
function trkRepeater(x, y, z, delay, direction, powered) {
  let dir;
  if (direction === 1) {
    if (delay === 0) dir = 11;
    else if (delay === 1) dir = 12;
    else if (delay === 2) dir = 13;
    else if (delay === 3) dir = 14;
  } else if (direction === 2) {
    if (delay === 0) dir = 7;
    else if (delay === 1) dir = 8;
    else if (delay === 2) dir = 9;
    else if (delay === 3) dir = 10;
  } else if (direction === 3) {
    dir = 15;
  }
  trkPush(x, y, z, TRK.insnum * 26 + dir, null);
}

/* 一个「放置音符盒」分组的 9 份副本共用的计数器。
   GML 用的是 nblocks / nblockins / nblockkey / nblockpit 以及
   带 l1..l4 / r1..r4 后缀的三套同名变量，这里合成一个对象。 */
function trkGroup() { return { n: 0, ins: [], key: [], pit: [] }; }

/* 照搬九个分组里完全相同的那个循环体（已逐行比对确认九份只差
   adds / y1 的偏移量 / 变量后缀 / 一处注释笔误）。
   adds    ：该组的 adds 值（1..5）
   ydelta  ：y1 = yy + dir + ydelta
   g       ：该组的计数器对象 */
function trkPlaceGroup(adds, ydelta, g, xx, yy, dir, layers) {
  for (let b = 0; b < layers + 0; b++) {          // 放置方块
    const y1 = yy + dir + ydelta;
    const x1 = xx;
    trkRepeater(x1 + 2, y1, b * 4 + 2 + adds, 0, 2, 0);
    trkCircuit(x1 + dir, y1, b * 4 + 2 + adds);
    trkCircuit(x1 + 2, y1, b * 4 + adds);
    trkCircuit(x1 + dir, y1, b * 4 + adds);
    trkCircuit(x1 + dir * 2, y1, b * 4 + 1 + adds);
    trkOther(x1 + dir, y1, b * 4 + 1 + adds, 55, 0);

    /* 四个音符盒槽位。每个槽位：先放音符盒(25)、再放底座方块、
       再补一条电路，然后把坐标与音高记进 noteblock* 数组。 */
    const slots = [
      // pos 的 x/y/z 与「音符盒方块」的坐标、以及补电路用的 z
      { bx: x1 + dir * 2, by: y1 - 1, bz: b * 4 + 1 + adds, blockz: b * 4 + adds, circz: b * 4 - 1 + adds },
      { bx: x1 + dir * 2, by: y1 + 1, bz: b * 4 + 1 + adds, blockz: b * 4 + adds, circz: b * 4 - 1 + adds },
      { bx: x1 + dir, by: y1 - 1, bz: b * 4 + 2 + adds, blockz: b * 4 + 1 + adds, circz: b * 4 + adds },
      { bx: x1 + dir, by: y1 + 1, bz: b * 4 + 2 + adds, blockz: b * 4 + 1 + adds, circz: b * 4 + adds },
    ];
    for (const sl of slots) {
      if (g.n > -1) {
        if (g.ins[g.n] > -1) {
          trkOther(sl.bx, sl.by, sl.bz, 25, 0);
          trkOther(sl.bx, sl.by, sl.blockz,
            S.sch_exp_ins_block[g.ins[g.n]], S.sch_exp_ins_data[g.ins[g.n]]);
          trkCircuit(sl.bx, sl.by, sl.circz);
          TRK.nx[TRK.nb] = sl.bx;
          TRK.ny[TRK.nb] = sl.by;
          TRK.nz[TRK.nb] = sl.bz;
          TRK.nnote[TRK.nb] = g.key[g.n] - 33;
          TRK.nins[TRK.nb] = g.ins[g.n];
          TRK.npit[TRK.nb] = g.pit[g.n];
          TRK.nb += 1;
        }
        g.n -= 1;
      }
    }
  }
}


