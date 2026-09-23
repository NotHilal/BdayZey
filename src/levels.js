// Level layouts. Grid is ROWS tall; row r spans y = TOP + r*TILE.
// Legend: '#' solid ground   'B' solid block (world-styled: crate, ruin, ...)
//         '-' one-way platform '^' hazard   'c' franui   'P' start
//         'k' checkpoint      'G' goal
export const TILE = 64;
export const ROWS = 11;
export const TOP = 16; // 16 + 11*64 = 720
export const LAST = ROWS - 1;

function builder(cols) {
  const g = Array.from({ length: ROWS }, () => Array(cols).fill('.'));
  const set = (c, r, ch) => { if (r >= 0 && r < ROWS && c >= 0 && c < cols) g[r][c] = ch; };
  const L = {
    // solid ground from surface row s down to the bottom, columns c0..c1 inclusive
    ground(c0, c1, s) { for (let c = c0; c <= c1; c++) for (let r = s; r <= LAST; r++) set(c, r, '#'); return L; },
    block(c, r, w = 1, h = 1, ch = 'B') { for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) set(c + i, r + j, ch); return L; },
    plat(c, r, w) { for (let i = 0; i < w; i++) set(c + i, r, '-'); return L; },
    haz(c, r, w = 1) { for (let i = 0; i < w; i++) set(c + i, r, '^'); return L; },
    put(c, r, ch) { set(c, r, ch); return L; },
    rows() { return g.map((row) => row.join('')); },
  };
  return L;
}

function minecraft() {
  const L = builder(100);
  L.ground(0, 14, 8).put(2, 7, 'P');
  L.ground(8, 9, 7);
  L.haz(15, LAST, 3);                       // lava pit
  L.ground(18, 30, 8);
  L.plat(22, 5, 4).put(24, 4, 'c');         // franui 1 on an oak slab
  L.ground(31, 33, 7).ground(34, 36, 6);
  L.haz(37, LAST, 4);
  L.ground(41, 52, 7).put(42, 6, 'k');
  L.haz(46, 7, 2);                          // lava pool in the ground
  L.haz(53, LAST, 10);                      // lava lake with stepping blocks
  L.block(55, 6, 2, 1).block(59, 5, 2, 1).put(60, 3, 'c');
  L.ground(63, 75, 7).put(66, 6, 'k');
  L.ground(70, 71, 6).ground(72, 73, 5).ground(74, 75, 4);
  L.haz(76, LAST, 4);
  L.plat(77, 3, 3).put(78, 2, 'c');
  L.ground(80, 99, 8).put(95, 7, 'G');
  return L.rows();
}

function genshin() {
  const L = builder(104);
  L.ground(0, 12, 8).put(2, 7, 'P');
  L.ground(13, 16, 7);
  L.ground(20, 27, 8).haz(24, 7);
  L.plat(28, 6, 4);                         // wooden bridge over the gap
  L.ground(33, 41, 7).plat(35, 4, 3).put(36, 3, 'c').put(39, 6, 'k');
  L.ground(45, 48, 6);
  L.ground(49, 58, 8).haz(52, 7, 2);
  L.plat(55, 5, 2).plat(58, 3, 2).put(59, 2, 'c');
  L.ground(63, 76, 7).put(64, 6, 'k').haz(68, 6);
  L.ground(71, 73, 5);
  L.plat(74, 3, 3).put(75, 2, 'c');
  L.ground(80, 84, 8).haz(83, 7);
  L.plat(86, 6, 3);
  L.ground(90, 103, 8).put(99, 7, 'G');
  return L.rows();
}

function lol() {
  const L = builder(108);
  L.ground(0, 13, 8).put(2, 7, 'P');
  L.haz(10, 7);
  L.ground(17, 22, 7).haz(20, 6);
  L.plat(23, 5, 3);
  L.ground(27, 36, 8).block(30, 6, 2, 2).haz(34, 7);
  L.plat(31, 3, 3).put(32, 2, 'c');         // franui 1 above the pillar
  L.ground(40, 44, 7).put(41, 6, 'k');
  L.plat(46, 5, 2).plat(50, 4, 2);
  L.ground(54, 62, 7).haz(57, 6, 2);
  L.block(60, 4, 2, 3);
  L.plat(62, 2, 3).put(63, 1, 'c');         // franui 2, top of the ruin
  L.ground(67, 80, 8).put(68, 7, 'k').haz(72, 7).haz(76, 7);
  L.block(74, 6, 1, 2);
  L.plat(81, 5, 3);
  L.ground(85, 88, 6).put(86, 3, 'c');      // franui 3 above the ledge
  L.ground(92, 107, 8).haz(95, 7).put(103, 7, 'G');
  return L.rows();
}

function valorant() {
  const L = builder(110);
  L.ground(0, 14, 8).put(2, 7, 'P');
  L.block(8, 7, 2, 1).block(9, 6, 1, 1);    // crate stack
  L.ground(18, 29, 8).haz(21, 7, 2);
  L.block(25, 6, 2, 2).plat(27, 4, 3).put(28, 3, 'c');
  L.ground(33, 38, 7).put(34, 6, 'k');
  L.plat(40, 6, 2).plat(44, 5, 2);
  L.ground(48, 60, 7).haz(51, 6).haz(55, 6, 2);
  L.block(58, 5, 2, 2).block(59, 4, 1, 1);
  L.plat(61, 2, 2).put(62, 1, 'c');
  L.ground(65, 76, 8).put(66, 7, 'k').haz(70, 7, 2);
  L.block(73, 6, 2, 2);
  L.plat(77, 4, 3).put(78, 3, 'c');
  L.ground(83, 86, 6);
  L.ground(90, 109, 8).haz(94, 7).put(104, 7, 'G');
  return L.rows();
}

function rdr2() {
  const L = builder(112);
  L.ground(0, 13, 8).put(2, 7, 'P').haz(10, 7);
  L.ground(17, 24, 7).haz(21, 6);
  L.plat(25, 5, 4);                          // boardwalk
  L.ground(30, 38, 8).block(33, 7, 1, 1).put(33, 3, 'c');
  L.plat(32, 4, 3);
  L.ground(42, 47, 6).put(43, 5, 'k').haz(46, 5);
  L.ground(51, 54, 8);
  L.plat(56, 6, 2).plat(59, 4, 2).put(60, 3, 'c');
  L.ground(63, 72, 7).haz(66, 6).haz(69, 6).put(64, 6, 'k');
  L.ground(76, 78, 5).haz(77, 4);
  L.plat(80, 3, 3).put(81, 2, 'c');
  L.ground(85, 90, 8).haz(88, 7);
  L.plat(92, 6, 3);
  L.ground(97, 111, 8).put(107, 7, 'G');
  return L.rows();
}

export const LEVELS = {
  minecraft: minecraft(),
  genshin: genshin(),
  lol: lol(),
  valorant: valorant(),
  rdr2: rdr2(),
};

// Parse a layout into grid + entities.
export function parseLevel(rows) {
  const cols = rows[0].length;
  const at = (c, r) => (r < 0 || r >= ROWS || c < 0 || c >= cols ? (r >= ROWS ? '#' : '.') : rows[r][c]);
  const solid = (c, r) => { const ch = at(c, r); return ch === '#' || ch === 'B'; };
  const ents = { start: null, goal: null, sweets: [], checkpoints: [], hazards: [], plats: [] };
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < cols; c++) {
    const ch = rows[r][c];
    const x = c * TILE, y = TOP + r * TILE;
    if (ch === 'P') ents.start = { x: x + TILE / 2, y: y + TILE };
    else if (ch === 'G') ents.goal = { x: x + TILE / 2, y: y + TILE, c, r };
    else if (ch === 'c') ents.sweets.push({ x: x + TILE / 2, y: y + TILE / 2 });
    else if (ch === 'k') ents.checkpoints.push({ x: x + TILE / 2, y: y + TILE, c, r });
    else if (ch === '^') ents.hazards.push({ x, y, c, r });
    else if (ch === '-') ents.plats.push({ x, y, c, r });
  }
  return { rows, cols, width: cols * TILE, at, solid, ents };
}
