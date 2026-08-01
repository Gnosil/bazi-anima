/* 程序化像素图标 —— 不用外部图片，全部 16×16 网格上画。
 * 只允许三档色：dark / base / light（见 tokens.wuXing）。
 * 这样任何五行/十神都能复用同一套形状，配色由 token 决定。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./tokens'));
  else root.Sprites = factory(root.DS);
})(typeof self !== 'undefined' ? self : this, function (DS) {

  // 位图用字符串数组表达：. 透明 / 1 dark / 2 base / 3 light
  const ICONS = {
    // 木 —— 松柏，三层树冠 + 树干
    wood: [
      '................',
      '.......33.......',
      '......3223......',
      '.....322223.....',
      '....32222223....',
      '...3222222223...',
      '......3223......',
      '.....322223.....',
      '....32222223....',
      '...3222222223...',
      '..322222222223..',
      '.......11.......',
      '.......11.......',
      '......1111......',
      '.....111111.....',
      '................',
    ],
    // 火 —— 焰，外描边(dark) + 焰身(base) + 焰心(light)
    fire: [
      '................',
      '.......1........',
      '......121.......',
      '......121.......',
      '.....12221......',
      '.....12221......',
      '....1222221.....',
      '....1223221.....',
      '...122333221....',
      '...122333221....',
      '..12233333221...',
      '..12223332221...',
      '..12222222221...',
      '...122222221....',
      '....1122211.....',
      '................',
    ],
    // 土 —— 山峦
    earth: [
      '................',
      '................',
      '................',
      '.......3........',
      '......333.......',
      '.....32223......',
      '.....322223.....',
      '....32222223....',
      '...3222222223...',
      '..322222222223..',
      '.32222222222223.',
      '.11111111111111.',
      '..111111111111..',
      '................',
      '................',
      '................',
    ],
    // 金 —— 元宝
    metal: [
      '................',
      '................',
      '................',
      '....33333333....',
      '...3222222223...',
      '..322222222223..',
      '.32222222222223.',
      '.32233333333223.',
      '.32222222222223.',
      '.13222222222231.',
      '..131111111131..',
      '...1111111111...',
      '................',
      '................',
      '................',
      '................',
    ],
    // 水 —— 三道波
    water: [
      '................',
      '................',
      '..33............',
      '.3223..33.......',
      '3222232223..33..',
      '.1222222223.322.',
      '..11111112232231',
      '................',
      '..33............',
      '.3223..33.......',
      '3222232223..33..',
      '.1222222223.322.',
      '..11111112232231',
      '................',
      '................',
      '................',
    ],
  };

  const WX_TO_ICON = { 木:'wood', 火:'fire', 土:'earth', 金:'metal', 水:'water' };

  /** 在 canvas 上画一个 16×16 图标
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} key ICONS 的 key
   * @param {{dark,base,light}} pal
   * @param {number} scale 整数倍
   * @param {number} ox @param {number} oy 偏移（原始像素单位，会乘 scale）
   */
  function drawIcon(ctx, key, pal, scale, ox = 0, oy = 0) {
    const map = ICONS[key];
    if (!map) return;
    const c = { '1': pal.dark, '2': pal.base, '3': pal.light };
    ctx.imageSmoothingEnabled = false;
    for (let y = 0; y < map.length; y++) {
      const row = map[y];
      for (let x = 0; x < row.length; x++) {
        const col = c[row[x]];
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect((ox + x) * scale, (oy + y) * scale, scale, scale);
      }
    }
  }

  /** 画一个「干支牌」：带斜角边框的方块，中间留给文字（文字用 DOM 叠，不画在 canvas 上） */
  function drawTile(ctx, pal, size, scale, opts = {}) {
    const s = scale, n = size;
    const px = (x, y, col) => { ctx.fillStyle = col; ctx.fillRect(x * s, y * s, s, s); };
    ctx.imageSmoothingEnabled = false;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const edge = x === 0 || y === 0 || x === n - 1 || y === n - 1;
      const corner = (x + y < 2) || (x + (n - 1 - y) < 2) || ((n - 1 - x) + y < 2) || ((n - 1 - x) + (n - 1 - y) < 2);
      if (corner) continue;                                  // 切角 → 像素味
      if (edge) px(x, y, opts.selected ? pal.light : pal.dark);
      else if (y === 1 || x === 1) px(x, y, pal.base);        // 内高光
      else px(x, y, opts.fill || DS.base.bg2);
    }
  }

  return { ICONS, WX_TO_ICON, drawIcon, drawTile };
});
