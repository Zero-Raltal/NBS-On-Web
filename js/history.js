/* =========================================================================
   history.js — 撤销 / 重做
   GML 版用 16 列参数数组 + switch 反演；这里用「操作闭包对」实现，
   语义与 action_undo / action_redo 一致，但更不易出错。
   ========================================================================= */
'use strict';

const H_ADD = 0, H_REMOVE = 1, H_CHANGE = 2;
const H_SELECTADD = 3, H_SELECTREMOVE = 4, H_SELECTCHANGE = 5;
const H_SELECTMOVE = 6, H_SELECTPASTE = 7, H_SELECT = 8;
const H_ADDLAYER = 9, H_REMOVELAYER = 10, H_SWAPLAYER = 11, H_STEREOIZE = 12;

let histUndo = [], histRedo = [];

function historyReset() { histUndo = []; histRedo = []; }

function historyPush(undoFn, redoFn) {
  histUndo.push({ undoFn, redoFn });
  if (histUndo.length > 300) histUndo.shift();
  histRedo = [];
}

function historySet(type, ...a) {
  switch (type) {
    case H_ADD: {
      const [x, y, ins, key, vel, pan, pit] = a;
      historyPush(() => removeBlock(x, y), () => addBlock(x, y, ins, key, vel, pan, pit));
      break;
    }
    case H_REMOVE: {
      const [x, y, ins, key, vel, pan, pit] = a;
      historyPush(() => addBlock(x, y, ins, key, vel, pan, pit), () => removeBlock(x, y));
      break;
    }
    case H_CHANGE: {
      const [x, y, ins, key, vel, pan, pit, pins, pkey, pvel, ppan, ppit] = a;
      historyPush(
        () => changeBlock(x, y, pins, pkey, pvel, ppan, ppit),
        () => changeBlock(x, y, ins, key, vel, pan, pit)
      );
      break;
    }
    case H_ADDLAYER: {
      const { index } = a[0];
      historyPush(() => removeLayer(index, true), () => addLayer(index, true));
      break;
    }
    case H_REMOVELAYER: {
      const snap = a[0];
      historyPush(
        () => {
          addLayer(snap.index, true, snap.name, snap.lock, snap.vol, snap.stereo);
          for (const b of snap.blocks) addBlock(b.x, snap.index, b.ins, b.key, b.vel, b.pan, b.pit, false);
        },
        () => removeLayer(snap.index, true)
      );
      break;
    }
    case H_SWAPLAYER: {
      const [to, from] = a;
      historyPush(() => shiftLayers(to, from, true), () => shiftLayers(from, to, true));
      break;
    }
  }
}

function actionUndo() {
  const e = histUndo.pop();
  if (!e) return;
  e.undoFn();
  histRedo.push(e);
  S.changed = 1;
  if (typeof recalcSong === 'function') recalcSong();
  S.playing = 0;
}
function actionRedo() {
  const e = histRedo.pop();
  if (!e) return;
  e.redoFn();
  histUndo.push(e);
  S.changed = 1;
  if (typeof recalcSong === 'function') recalcSong();
  S.playing = 0;
}
const canUndo = () => histUndo.length > 0;
const canRedo = () => histRedo.length > 0;
