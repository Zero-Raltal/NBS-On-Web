/* cbnd.js — 从 cbnote 的 .cbnd 与指令 .txt 导入
 *
 * 这两条导入路径的数据来源都是 ZeroRaltal 的 cbnote（MCBE-CBNoteBlock）。
 * 格式说明全部基于 cbnote-v9.html 的实际实现，没有臆造：
 *
 *   .cbnd（N.3 / N.4 位流，不是字节对齐的）：
 *     [8b  tempo]                       每秒刻数（t/s），cbnote 里就是 NBS 的 tempo
 *     [16b 起始标志，必须为 0]
 *     循环 {
 *       [4b  乐器编号 0..15]            顺序见 CBND_INSTRUMENT_ORDER
 *       [7b  音高 key]                  cbnote 内部 key（C4 = 54，见 keyToPitch）
 *       循环 {
 *         [16b tick+1]                  0x0000 = 本音符结束
 *       }                              0xFFFF = 整首结束
 *     }
 *     [16b 循环起点+1][8b 循环次数]      可选，紧跟 0xFFFF 之后，位连续
 *
 *   指令 .txt（G1 generateCommands / G2 generateJavaCommands）：
 *     基岩版：execute as @a[scores={t=N}] at @s run playsound note.harp @s ~ ~ ~ 1 <pitch>
 *             execute as @a[scores={t=-1..}] at @s unless entity @s[scores={t=!3..7,t=!9}] run playsound ...
 *     爪哇版：execute as @a[scores={t=N}] at @s run playsound minecraft:block.note_block.harp record @s ~ ~ ~ 1 <pitch>
 *     音高：基岩版 pitch = 2^((key-54)/12)，爪哇版相同（key 已夹到 33..57）
 *
 * 移植守则：只做「读」这一侧，且尽量复用已有的 Song 数据结构与 addBlock 流程，
 * 不重复实现一套写歌曲的逻辑。
 */

/* ---------------------------------------------------------------- 共用量化
   cbnote 的 16 个乐器顺序（N.1）。与我们 INSTRUMENTS 前 16 项逐个对应：
     harp / bass / bd / snare / hat / guitar / flute / bell /
     chime / xylophone / iron_xylophone / cow_bell / didgeridoo / bit / banjo / pling
   注意第 5 项在 cbnote 里叫 'hat'，在我们这里叫 'Click'（NBS 原版的 Click 就是
   Minecraft 的 hat 音色），所以按【下标】映射，不能按名字匹配。 */
const CBND_INSTRUMENT_ORDER = [
  'harp', 'bass', 'bd', 'snare', 'hat', 'guitar', 'flute', 'bell',
  'chime', 'xylophone', 'iron_xylophone', 'cow_bell', 'didgeridoo', 'bit', 'banjo', 'pling',
];

/* cbnote 的音符 key 与 NBS 的 key 是同一套编号：
   keyToPitch(key) = 2^((key-54)/12)，而 Minecraft 的 note.harp pitch 也以 C4(=54) 为 1.0，
   NBS 的 play_sound 又是 0.5*2^((key-78)/12)。
   两侧都以「C4 = 1.0 播放速率」为基准，所以 key 可以【直接】用，不需要 ±12 修正。 */

/* NBS 的乐器编号与 cbnote 的 CBND_INSTRUMENT_ORDER 下标一致，
   但打击乐（2..4）在 Minecraft 里音高固定，导入时仍按 key 写入即可。 */

/* ---------------------------------------------------------------- 位读取 */
class CbndBitReader {
  constructor(bytes) {
    this.bytes = bytes;
    this.bitIndex = 0;
    this.length = bytes.length * 8;
  }
  readBits(bitLength) {
    if (this.bitIndex + bitLength > this.length) {
      throw new Error('CBND 数据长度不足（文件可能已损坏）');
    }
    let value = 0;
    for (let i = 0; i < bitLength; i++) {
      const byteIndex = Math.floor(this.bitIndex / 8);
      // 高位先读，与 cbnote 的 BitWriter 一致
      const bitOffset = 7 - (this.bitIndex % 8);
      const bit = (this.bytes[byteIndex] >> bitOffset) & 1;
      value = (value << 1) | bit;
      this.bitIndex++;
    }
    return value;
  }
  get remaining() { return this.length - this.bitIndex; }
}

/* ---------------------------------------------------------------- 解析 CBND
   返回 { tempo, notes:[{tick,key,instrument,velocity}], loop, songLength }
   notes 里的 tick 是「第几刻」（0 起），与 NBS 的列号同一含义。 */
function parseCBND(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  if (bytes.length < 3) throw new Error('CBND 文件过小，不是有效的 .cbnd');
  const reader = new CbndBitReader(bytes);

  const tempo = reader.readBits(8);
  const startMarker = reader.readBits(16);
  if (startMarker !== 0) throw new Error('无效的 .cbnd 文件：起始标志不是 0');

  const notes = [];
  let maxTick = 0;
  let isEnd = false;
  // 防御：位流被截断时 readBits 会抛错；这里再加一个音符数量上限，
  // 避免损坏文件把内存吃光（正常歌曲不可能超过 10 万个音符）。
  const NOTE_LIMIT = 100000;

  while (!isEnd) {
    if (notes.length > NOTE_LIMIT) throw new Error('CBND 音符数量异常，文件可能已损坏');
    const instrId = reader.readBits(4);
    const key = reader.readBits(7);
    // 每个音符后面跟一串 tick+1，直到读到 0 表示这个音符结束。
    while (true) {
      const tVal = reader.readBits(16);
      if (tVal === 0) break;
      if (tVal === 0xFFFF) { isEnd = true; break; }
      const tick = tVal - 1;
      if (tick > maxTick) maxTick = tick;
      notes.push({
        tick: tick,
        key: key,
        velocity: 100,
        instrument: instrId & 15,
      });
    }
  }

  const songLength = maxTick + 1;

  /* 循环标记：0xFFFF 之后若还剩 ≥24 位就是 [16b 起点+1][8b 次数]。
     这与 cbnote N.4.1 的判别方式相同 —— 老文件在 0xFFFF 后最多只剩 0~7 个填充位，
     永远不足 24，所以不会误判。 */
  let loop = null;
  if (reader.remaining >= 24) {
    const raw = reader.readBits(16);
    const count = reader.readBits(8);
    if (raw >= 1 && raw <= 0xFFFE && (raw - 1) < songLength) {
      loop = { enabled: true, startTick: raw - 1, totalLoops: count };
    }
  }

  if (!notes.length) throw new Error('CBND 里没有任何音符');
  return { tempo, notes, loop, songLength, isCbnd: true };
}

/* ---------------------------------------------------------------- 指令文本
   txt 解析的核心难点不是正则，而是【预处理】：玩家把指令从游戏里复制出来、
   或从聊天框/记事本/网页里转存，会带上各种破坏匹配的字符。逐项处理：

   1. 换行   CRLF / CR / LF 三种混用          → 统一成 \n
   2. 续行   行尾反斜杠 `\`（bash/记事本习惯） → 与下一行拼接
   3. 零宽   零宽空格 / BOM / 零宽连接符       → 直接删除
   4. 全角   全角空格、全角括号、全角逗号、
             全角等号、全角方块括号            → 转成半角
   5. 斜杠   行首 `/`（可多次，含全角／）       → 去掉
             行首 `\`（部分导出工具会转义斜杠）  → 去掉
   6. 引号   成对的 " 和 ' （含全角“”‘’）      → 删除
   7. 空白   制表符、不间断空格、多余空格       → 归并为单空格
   8. 注释   以 # 或 // 开头的整行              → 丢弃
   9. 中括号 中文输入法打出的【】［］           → 转成 [] */
function normalizeCommandText(raw) {
  if (!raw) return '';
  let s = String(raw);

  // 3. 零宽字符 / BOM
  s = s.replace(/[\uFEFF\u200B\u200C\u200D\u2060\u00A0]/g, ' ');

  // 1. 换行统一
  s = s.replace(/\r\n?/g, '\n');

  // 2. 续行：行尾反斜杠把下一行接上来（处理 Windows 记事本、bash 风格）
  //    注意要先于「去掉行首反斜杠」执行，否则续行标记会被当成转义符吃掉。
  //    这里允许续行标记与下一行之间夹空行 —— 实际见到的换行/斜杠干扰里，
  //    「\ 后面跟一个空行再跟正文」很常见（编辑器自动整理行尾造成的），
  //    若只吃掉一个 \n，空行会把一条指令截成两半。
  s = s.replace(/\\[ \t]*\n(?:\s*\n)*/g, ' ');

  // 4. 全角 → 半角（只转会出现在指令里的那些，避免把中文正文搞乱）
  const FULLWIDTH = {
    '（': '(', '）': ')', '，': ',', '＝': '=', '｛': '{', '｝': '}',
    '［': '[', '］': ']', '：': ':', '；': ';', '　': ' ',
    '～': '~', '＠': '@', '＃': '#', '／': '/', '＼': '\\', '．': '.',
  };
  s = s.replace(/[（）,＝｛｝［］：；　～＠＃／＼．]/g, c => FULLWIDTH[c] || c);

  /* 中文输入法下【】常被用来代替花括号或方括号。判定方式看上下文更可靠，
     但预处理器没有语法分析，只能看紧邻字符：
       · 前一个字符是 `{` 或 `[`（说明括号已存在，玩家只是用【】包一层）
         → 直接脱掉外壳，只留内部内容
       · 内部含 = 或 ,（NBT/选择器特征）→ 转成花括号
       · 其余 → 转成方括号
     之前一律转方括号，会把 scores={t=5} 变成 scores={[t=5]}，
     正则匹配不到刻号，于是落到「取反式」分支，把每一刻都当成发声点。 */
  s = s.replace(/([{\[])?【([^】]*)】/g, (m, pre, inner) => {
    if (pre) return pre + inner;                   // 外层括号已存在，脱壳
    if (/[=,]/.test(inner)) return '{' + inner + '}';
    return '[' + inner + ']';
  });

  // 6. 引号全删（只删半角引号与成对全角引号，指令里的引号总是包裹参数）
  s = s.replace(/["'“”‘’]/g, '');

  // 5. 行首斜杠 / 反斜杠：可能有多个，例如 `//execute` 或 `\/execute`
  //    只处理行首，正文里的斜杠（如 minecraft:block/note_block）绝不能动。
  const lines = s.split('\n').map(line => {
    let t = line.trim();
    // 8. 注释行
    if (/^#/.test(t) || /^\/\//.test(t)) return '';
    // 去掉行首的 / 或 \（允许重复，允许之间夹空格）
    t = t.replace(/^[\/\\][ \t]*/, '');
    t = t.replace(/^[\/\\][ \t]*/, '');
    // 7. 空白归一
    t = t.replace(/[ \t]+/g, ' ').trim();
    return t;
  }).filter(l => l.length > 0);

  return lines.join('\n');
}

/* 从归一化后的文本里抽出所有 playsound 指令行。
   注意：续行拼接可能把两条指令并到一行（原文件里 `\` 后面跟的是另一条指令，
   而不是同一条的续写）。这里按 `playsound` 的结束位置切开 ——
   每条 playsound 指令的末尾是它的最后一个数字参数，之后如果还有
   `execute`/`playsound` 就是下一条。
   这样即使拼接在一起也能全部还原，不会丢音符。 */
function extractPlaysoundLines(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (!/\bplaysound\b/i.test(line)) continue;
    /* 按 `execute` 切分 —— 一条新指令以 execute 开头，而 playsound 是它的子命令，
       绝不能拿 playsound 当切分点（那会把 `execute as @a[scores={t=1}] at @s run`
       这段选择器整个丢掉，刻号全变成 undefined）。
       若整行没有 execute（裸 playsound 指令），则原样保留。 */
    const parts = /^\s*execute\b/i.test(line)
      ? line.split(/(?=\bexecute\b)/i).map(s => s.trim()).filter(Boolean)
      : [line.trim()];
    for (const p of parts) {
      if (/\bplaysound\b/i.test(p)) out.push(p);
    }
  }
  return out;
}

/* 解析一条 playsound 指令，返回
     { instrument, key, volume, pitch, ticks, negRanges, negUnless, sound }
   ticks 是「1 基刻号」数组（cbnote 的指令里刻号 = tick+1）；null 表示未显式给出。
   negRanges / negUnless 是排除区间 [[a,b],...]（同样是 1 基）。
 *
 * cbnote 的两种真实写法：
 *   基岩版： execute as @a[scores={t=N}] at @s run playsound ...
 *           execute as @a[scores={t=-1..}] at @s unless entity @s[scores={t=!a..b,t=!c}] run playsound ...
 *   爪哇版： execute as @a[scores={t=a..b}] at @s unless score @s t matches c..d run playsound ... record ...
 *
 *    注意各处 tick 的含义：
 *     · `t=-1..` 是「所有刻」的写法（-1 是下界哨兵，不是真的刻号）
 *     · `t=!a..b` 在 scores={} 里表示「排除 a..b」
 *     · 爪哇版用独立的 unless 子句表达同样的排除
 */
function parsePlaysoundCommand(line) {
  // 音色：playsound 后面的第一个参数
  const soundM = line.match(/playsound\s+([^\s]+)/i);
  if (!soundM) return null;
  let sound = soundM[1].toLowerCase();
  sound = sound.replace(/^minecraft:/, '');
  sound = sound.replace(/^block\.note_block\./, '');
  sound = sound.replace(/^note\./, '');
  if (sound === 'note') sound = 'harp';

  /* 参数：@s ~ ~ ~ <volume> <pitch>
     也可能写成 @a ~ ~ ~ 1 1（老导出）。坐标可以是 ~、~1、^ 等，统一用宽松匹配。 */
  const afterSound = line.slice(line.toLowerCase().indexOf('playsound') + 9);
  const nums = afterSound.match(/(?:~|~[-\d.]+|\^[-\d.]*)\s+(?:~|~[-\d.]+|\^[-\d.]*)\s+(?:~|~[-\d.]+|\^[-\d.]*)\s+([-\d.]+)\s+([-\d.]+)/);
  let volume = 1, pitch = 1;
  if (nums) {
    volume = parseFloat(nums[1]);
    pitch = parseFloat(nums[2]);
  } else {
    const tail = afterSound.match(/([-\d.]+)\s+([-\d.]+)\s*$/);
    if (tail) { volume = parseFloat(tail[1]); pitch = parseFloat(tail[2]); }
  }
  if (!isFinite(volume)) volume = 1;
  if (!isFinite(pitch) || pitch <= 0) pitch = 1;

  // 由 pitch 反推 key：pitch = 2^((key-54)/12)  ⇒  key = 54 + 12*log2(pitch)
  const key = Math.round(54 + 12 * Math.log2(pitch));

  /* 逐个解析所有 scores={...} 块。
     一行里可能有多个，含义取决于它在句子的哪个位置 —— 这一点很容易搞反，
     实测（对照 cbnote 的 generateCommands 输出）确认如下：

       execute as @a[scores={t=-1..}] at @s unless entity @s[scores={t=!1..2}] run playsound ...
         → cbnote 的 ticks 字段 = [0,1]（两个发声刻）
         → 所以 `t=!1..2` 里列出的【就是发声刻】（tick+1），不是「排除」。
       同理：
         ticks=[0,5]   → t=!1,t=!6
         ticks=[0,2,4] → t=!1,t=!3,t=!5

     即：当主选择器写 `t=-1..`（全部刻）时，后面 unless 里的 `t=!N` 是
     「只在这些刻发声」。`!` 在这里不是数学意义上的取反，而是基岩版选择器
     的否定参数配合 unless 形成的双重否定。

     而单刻/连续刻的情况 cbnote 会直接写成显式刻：
       t=1      → tick 0
       t=4      → tick 3
       t=1..3   → tick 0,1,2
     爪哇版则用 `t=a..b` + `unless score @s t matches c..d` 表示「a..b 里挖掉 c..d」。

     判据：主选择器是 `t=-1..`（全体）就让后面的 `!` 区间成为发声刻；
           主选择器是具体区间就让 `!` 区间成为真正的排除刻。 */
  let ticks = null;
  const negRanges = [];
  const useUnlessAsTicks = [];
  let sawAllSelector = false;

  const blockRe = /scores\s*=\s*\{([^}]*)\}/gi;
  let bm;
  while ((bm = blockRe.exec(line)) !== null) {
    const inner = bm[1];
    for (const rawPart of inner.split(',')) {
      const p = rawPart.trim();
      if (!p) continue;
      const m = p.match(/^[A-Za-z0-9_]+=(!?)(-?\d+)(?:\.\.(-?\d*))?$/);
      if (!m) continue;
      const neg = m[1] === '!';
      const a = parseInt(m[2], 10);
      const bRaw = m[3];
      const b = (bRaw === undefined || bRaw === '') ? a : parseInt(bRaw, 10);
      if (!isFinite(a)) continue;

      // `t=-1..`（或任何负下界）表示「全部刻」
      if (!neg && a < 1) { sawAllSelector = true; ticks = null; continue; }

      const lo = Math.max(1, Math.min(a, b));
      const hi = Math.max(a, b);
      if (neg) {
        // 先存着，等整行扫完再决定它是「发声刻」还是「排除刻」
        useUnlessAsTicks.push([lo, hi]);
      } else {
        ticks = ticks || [];
        for (let t = lo; t <= hi; t++) ticks.push(t);
      }
    }
  }

  // 判定：主选择器是「全部刻」→ ! 区间就是发声刻；否则是排除刻
  if (useUnlessAsTicks.length) {
    if (sawAllSelector || ticks === null) {
      ticks = [];
      for (const [a, b] of useUnlessAsTicks) for (let t = a; t <= b; t++) ticks.push(t);
    } else {
      for (const [a, b] of useUnlessAsTicks) negRanges.push([a, b]);
    }
  }

  // 爪哇版：unless score @s t matches N..M —— 这种是真正的排除
  const negUnless = [];
  const unlessRe = /unless\s+score\s+\S+\s+\S+\s+matches\s+(-?\d+)(?:\.\.(-?\d+))?/gi;
  let um;
  while ((um = unlessRe.exec(line)) !== null) {
    const a = parseInt(um[1], 10);
    const b = (um[2] === undefined) ? a : parseInt(um[2], 10);
    negUnless.push([Math.max(1, Math.min(a, b)), Math.max(a, b)]);
  }

  if (ticks) ticks = Array.from(new Set(ticks)).sort((x, y) => x - y);

  return {
    instrument: soundToInstrumentId(sound),
    key: key,
    volume: volume,
    pitch: pitch,
    ticks: ticks,
    negRanges: negRanges.length ? negRanges : null,
    negUnless: negUnless.length ? negUnless : null,
    sound: sound,
  };
}

/* 音色名 → 我们 INSTRUMENTS 的下标。
   note.harp → 0；note.bd → 2；等等。
   无法识别时退回 0（harp），与 cbnote 的 `|| 'harp'` 行为一致。 */
function soundToInstrumentId(name) {
  const order = CBND_INSTRUMENT_ORDER;
  const n = String(name || '').toLowerCase();
  // 直接命中
  let i = order.indexOf(n);
  if (i >= 0) return i;
  // 常见别名（Minecraft 的音色名与 cbnote 的缩写并不完全一致）
  const ALIAS = {
    'bass': 'bass', 'double_bass': 'bass',
    'basedrum': 'bd', 'bass_drum': 'bd', 'bd': 'bd',
    'snare': 'snare', 'snare_drum': 'snare',
    'hat': 'hat', 'click': 'hat',
    'guitar': 'guitar', 'flute': 'flute', 'bell': 'bell',
    'chime': 'chime', 'icechime': 'chime', 'ice_chime': 'chime',
    'xylophone': 'xylophone', 'xylobone': 'xylophone',
    'iron_xylophone': 'iron_xylophone', 'ironxylophone': 'iron_xylophone',
    'cow_bell': 'cow_bell', 'cowbell': 'cow_bell',
    'didgeridoo': 'didgeridoo', 'bit': 'bit', 'banjo': 'banjo', 'pling': 'pling',
    'harp': 'harp', 'piano': 'harp',
  };
  const mapped = ALIAS[n];
  if (mapped) {
    i = order.indexOf(mapped);
    if (i >= 0) return i;
  }
  return 0;
}

/* 解析整份指令文本，返回 { tempo, notes, loop, songLength, stats }
 *
 * tempo 的处理：txt 里【没有】速度信息（指令是按刻编号的，刻的实际时长取决于
 * 世界里的循环装置）。cbnote 自己的 txt 导出也不含 tempo。
 * 因此这里给一个可配置的默认值，由调用方（导入对话框）让用户改。
 */
/* 解析整份指令文本，返回 { tempo, notes, loop, songLength, stats }
 *
 * cbnote 的指令有两种形态（详见 parsePlaysoundCommand 里的注释）：
 *   · 显式刻：execute as @a[scores={t=1}] …            → tick 0
 *   · 取反式：execute as @a[scores={t=-1..}] … unless entity @s[scores={t=!1..2}] …
 *             → tick 0,1（`!` 区间列出的就是发声刻）
 * 两种都由 parsePlaysoundCommand 归一成 ticks 数组，这里只负责展开成音符。
 *
 * tempo：txt 里没有速度信息（指令按刻编号，每刻实际时长取决于循环装置），
 * 用参数给的默认值，导入后用户可在左上角速度框调整。
 */
function parseCommandText(raw, options) {
  const opt = options || {};
  const text = normalizeCommandText(raw);
  const lines = extractPlaysoundLines(text);

  if (!lines.length) {
    throw new Error('没有找到任何 playsound 指令。\n请确认文件是从 cbnote 导出的指令 txt。');
  }

  const parsed = [];
  for (const line of lines) {
    const p = parsePlaysoundCommand(line);
    if (p) parsed.push(p);
  }
  if (!parsed.length) throw new Error('playsound 指令无法解析出音色或音高');

  const notes = [];
  let maxTick1 = 0;
  for (const p of parsed) {
    let ticks = p.ticks || [];
    // 显式刻 + 爪哇版 unless 排除 → 扣掉被排除部分
    if (p.negUnless && ticks.length) {
      ticks = ticks.filter(t => {
        for (const [a, b] of p.negUnless) if (t >= a && t <= b) return false;
        return true;
      });
    }
    for (const t of ticks) {
      if (t < 1) continue;
      if (t > maxTick1) maxTick1 = t;
      notes.push({
        tick: t - 1,
        key: p.key,
        instrument: p.instrument,
        velocity: Math.round(Math.max(0, Math.min(1, p.volume)) * 100),
      });
    }
  }

  if (!notes.length) throw new Error('解析后没有得到任何音符');

  // 去重：同一刻、同乐器、同 key 只保留一个
  const seen = new Set();
  const uniq = [];
  for (const n of notes) {
    const sig = n.tick + ':' + n.instrument + ':' + n.key;
    if (seen.has(sig)) continue;
    seen.add(sig);
    uniq.push(n);
  }
  uniq.sort((a, b) => a.tick - b.tick || a.instrument - b.instrument || a.key - b.key);

  return {
    tempo: opt.tempo || 10,
    notes: uniq,
    loop: null,
    songLength: uniq[uniq.length - 1].tick + 1,
    stats: {
      commandLines: lines.length,
      parsedGroups: parsed.length,
      distinctTicks: new Set(uniq.map(n => n.tick)).size,
    },
  };
}

/* ---------------------------------------------------------------- 写进歌曲
   把 { tempo, notes, loop } 应用到当前编辑器。
   notes 按 tick 分组落到不同层，与 NBS 的行为一致：同一刻的多个音符放在不同层，
   同一个刻同一个乐器同一个 key 只保留一个。
   返回实际写入的音符数。 */
function applyCbndImport(result, songName) {
  const notes = result.notes || [];
  if (!notes.length) return 0;

  // 先重置歌曲（保留前 16 个内置音色，reset() 会把自定义音色清掉）
  reset();
  S.tempo = Math.max(0.25, Math.min(30, result.tempo || 10));
  S.filename = songName || '';

  // 需要的层数 = 同一刻的最大音符数（去重后）
  const byTick = new Map();
  for (const n of notes) {
    if (!byTick.has(n.tick)) byTick.set(n.tick, []);
    byTick.get(n.tick).push(n);
  }
  let maxLayers = 1;
  for (const arr of byTick.values()) {
    const seen = new Set();
    let cnt = 0;
    for (const n of arr) {
      const sig = n.instrument + ':' + n.key;
      if (seen.has(sig)) continue;
      seen.add(sig);
      cnt++;
    }
    if (cnt > maxLayers) maxLayers = cnt;
  }

  /* 层数：直接铺到 maxLayers 层。
     不用 addLayer() —— 那个函数是「插入并下移」，用于界面上的加层；
     这里歌曲刚 reset 过、全是空层，直接设 endb2 并保证数组够长即可。
     上限 100 层（与原版一致）。 */
  maxLayers = Math.min(maxLayers, 100);
  if (S.layername.length < maxLayers) {
    S.layername.length = maxLayers; S.layerlock.length = maxLayers;
    S.layervol.length = maxLayers; S.layerstereo.length = maxLayers;
  }
  S.endb2 = Math.max(1, maxLayers);
  S.endb = Math.max(S.endb, S.endb2);

  let written = 0;
  for (const [tick, arr] of byTick) {
    // 同一刻内去重：同乐器同 key 只放一个（cbnote 会对重复 tick 去重）
    const seen = new Set();
    let layer = 0;
    for (const n of arr) {
      const sig = n.instrument + ':' + n.key;
      if (seen.has(sig)) continue;
      seen.add(sig);
      if (layer >= S.endb2) break;
      // addBlock(x, y, ins, key, vel, pan, pit, insnum)
      // insnum=true 表示「加载时用」：不递增乐器计数、不写历史，
      // 与 loadNBSToEditor 内部的做法一致。
      addBlock(tick, layer, n.instrument, n.key, n.velocity, 100, 0, true);
      written++;
      layer++;
    }
  }

  // 循环标记（.cbnd 才可能有）
  if (result.loop && result.loop.enabled) {
    S.loop = 1;
    S.loopstart = result.loop.startTick;
    S.loopend = Math.max(0, (result.songLength || 0) - 1);
    S.loopmax = result.loop.totalLoops | 0;
    S.timestoloop = S.loopmax;
    S.section_exists = 1;
    S.section_start = S.loopstart;
    S.section_end = S.loopend;
  }

  recalcSong();
  S.changed = 0;
  historyReset();
  return written;
}

/* ---------------------------------------------------------------- 文件读取
   pickFile 只给 ArrayBuffer。txt 需要用 TextDecoder 按 UTF-8 解码，
   并处理 BOM；若 UTF-8 解出大量替换字符（\uFFFD），再试 GBK 兜底 ——
   Windows 记事本另存为 ANSI 时就是 GBK，玩家很容易踩到。 */
function decodeTextSmart(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const bad = (text.match(/\uFFFD/g) || []).length;
  // 替换字符占比超过 1% 就认为不是 UTF-8，尝试 GBK
  if (bad > 0 && bad / Math.max(1, text.length) > 0.01) {
    try {
      const gbk = new TextDecoder('gbk', { fatal: false }).decode(bytes);
      const bad2 = (gbk.match(/\uFFFD/g) || []).length;
      if (bad2 < bad) text = gbk;
    } catch (e) { /* 浏览器不支持 gbk 时保持 utf-8 结果 */ }
  }
  return text;
}

/* 供 dialogs.js 的文件菜单调用 */
function importCbndDialog() {
  pickFile('.cbnd', (ab, name) => {
    try {
      const result = parseCBND(ab);
      const n = applyCbndImport(result, name);
      if (result.loop && result.loop.enabled) {
        S.selected = 0;
        setMsg('已从 .cbnd 导入 ' + n + ' 个音符（含循环标记，起点 ' + (result.loop.startTick + 1) + '）');
      } else {
        setMsg('已从 .cbnd 导入 ' + n + ' 个音符');
      }
    } catch (e) {
      messageDialog('导入 .cbnd 失败：\n' + e.message, '错误');
    }
  });
}

function importCommandTextDialog() {
  pickFile('.txt,.log,.mcfunction,.cmds,text/plain', (ab, name) => {
    try {
      const raw = decodeTextSmart(ab);
      const result = parseCommandText(raw, { tempo: 10 });
      const n = applyCbndImport(result, name);
      setMsg('已从指令文本导入 ' + n + ' 个音符（' + result.stats.commandLines + ' 行 playsound，'
        + result.stats.distinctTicks + ' 个刻）．速度按默认 10 t/s，可用左上角速度框调整');
    } catch (e) {
      messageDialog('导入指令文本失败：\n' + e.message, '错误');
    }
  });
}
