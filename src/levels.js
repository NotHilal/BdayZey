// Level layouts. Grid is ROWS tall; row r spans y = TOP + r*TILE.
// Legend: '#' solid ground   'B' solid block (world-styled: crate, ruin, ...)
//         '-' one-way platform '^' hazard   'c' franui   'P' start
//         'k' checkpoint      'G' goal
// Everything that is not a grid cell (secrets, doors, carriers, enemies, wind,
// set-piece triggers) goes in `things`; each world gives them their look.
// Pacing in every level: a calm opening, a harder middle with the world's
// enemy, and a set-piece before the goal (see each world's `setpiece`).
export const TILE = 64;
export const ROWS = 11;
export const TOP = 16; // 16 + 11*64 = 720
export const LAST = ROWS - 1;

function builder(cols) {
  const g = Array.from({ length: ROWS }, () => Array(cols).fill('.'));
  const set = (c, r, ch) => { if (r >= 0 && r < ROWS && c >= 0 && c < cols) g[r][c] = ch; };
  const things = [];
  const L = {
    // solid ground from surface row s down to the bottom, columns c0..c1 inclusive
    ground(c0, c1, s) { for (let c = c0; c <= c1; c++) for (let r = s; r <= LAST; r++) set(c, r, '#'); return L; },
    block(c, r, w = 1, h = 1, ch = 'B') { for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) set(c + i, r + j, ch); return L; },
    plat(c, r, w) { for (let i = 0; i < w; i++) set(c + i, r, '-'); return L; },
    haz(c, r, w = 1) { for (let i = 0; i < w; i++) set(c + i, r, '^'); return L; },
    put(c, r, ch) { set(c, r, ch); return L; },
    // hidden alcove: empty cells drawn as ground ('#') or blocks ('B') until you walk in
    secret(c, r, w, h, look = '#') { L.block(c, r, w, h, '.'); things.push({ type: 'secret', c, r, w, h, look }); return L; },
    // timed door, h cells tall from row r; a pressure plate (standing row r) opens it for ms.
    // ms 0 = hold plate (open only while someone stands on it). opts.duo: online co-op only
    door(id, c, r, h = 2, opts = {}) { things.push({ type: 'door', id, c, r, h, ...opts }); return L; },
    plate(c, r, door, ms = 3000, opts = {}) { things.push({ type: 'plate', c, r, door, ms, ...opts }); return L; },
    // a franui riding something. path: { patrol: [c0, c1], speed } or { orbit: [rx, ry], period }
    carry(kind, c, r, path) { things.push({ type: 'carrier', kind, c, r, ...path }); return L; },
    // enemy standing in row r, patrolling columns c0..c1
    enemy(kind, c, r, c0 = c, c1 = c) { things.push({ type: 'enemy', kind, c, r, c0, c1 }); return L; },
    // updraft over columns c..c+w-1 that lifts you up to row `top`
    wind(c, w, top) { things.push({ type: 'wind', c, w, top }); return L; },
    // calls world.setpiece().trigger(id) when the player passes column c
    trigger(id, c) { things.push({ type: 'trigger', id, c }); return L; },
    build() { return { rows: g.map((row) => row.join('')), things }; },
  };
  return L;
}

function minecraft() {
  const L = builder(100);
  // calm opening
  L.ground(0, 14, 8).put(2, 7, 'P');
  L.ground(8, 9, 7);
  L.haz(15, LAST, 3);                       // lava pit
  L.ground(18, 30, 8);
  L.plat(22, 5, 4);                         // oak slab
  L.carry('pig', 24, 7, { patrol: [19, 29], speed: 55 });   // franui 1 rides a pig
  L.ground(31, 33, 7).ground(34, 37, 5);
  L.secret(34, 6, 3, 1).put(36, 6, 'c');    // franui 2 in a tunnel inside the hill
  L.haz(38, LAST, 3);
  // harder middle
  L.ground(41, 52, 7).put(42, 6, 'k');
  L.haz(46, 7, 2);                          // lava pool in the ground
  // duo only: a tall gate with a hold plate on each side. One holds, the other
  // passes, then opens it from the far side
  L.door('coop', 50, 0, 7, { duo: true }).plate(49, 6, 'coop', 0, { duo: true }).plate(52, 6, 'coop', 0, { duo: true });
  L.haz(53, LAST, 10);                      // lava lake with stepping blocks
  L.block(55, 6, 2, 1).block(59, 5, 2, 1).put(60, 3, 'c');   // franui 3 above the lake
  L.ground(63, 75, 7).put(64, 6, 'k');
  L.enemy('creeper', 68, 6, 67, 69);
  L.ground(70, 71, 6).ground(72, 73, 5).ground(74, 75, 4);
  L.haz(76, LAST, 4);
  L.plat(77, 3, 3);
  // set-piece: the portal ignites as you walk up to it
  L.ground(80, 99, 8).put(95, 7, 'G').trigger('ignite', 87);
  return L.build();
}

function genshin() {
  const L = builder(104);
  L.ground(0, 12, 8).put(2, 7, 'P');
  L.ground(13, 16, 7);
  L.ground(20, 27, 8).haz(24, 7);
  L.enemy('slime', 26, 7, 25, 27);
  L.plat(28, 6, 4);                         // wooden bridge over the gap
  L.ground(33, 41, 7).plat(35, 4, 3).put(39, 6, 'k');
  L.carry('seelie', 36, 3, { orbit: [110, 46], period: 5200 });   // franui 1 follows a Seelie
  L.ground(45, 48, 6);
  // shrine: a pressure plate opens the gate for a few seconds
  L.ground(49, 58, 8).haz(52, 7).plat(53, 6, 2);
  L.block(55, 5, 4, 1).block(58, 6, 1, 2).door('gate', 55, 6, 2).plate(50, 7, 'gate', 3200).put(57, 7, 'c');   // franui 2
  L.ground(63, 76, 7).put(63, 6, 'k').haz(68, 6);
  L.enemy('slime', 66, 6, 65, 67);
  L.ground(71, 73, 5);
  L.plat(74, 3, 3);
  L.ground(80, 84, 8).haz(83, 7);
  // set-piece: a wind current over the gorge, then the waypoint unlocks
  L.wind(86, 3, 1);
  L.plat(90, 2, 3).put(91, 1, 'c');         // franui 3 at the top of the wind current
  L.ground(90, 103, 8).put(99, 7, 'G').trigger('waypoint', 94);
  return L.build();
}

function lol() {
  const L = builder(108);
  L.ground(0, 13, 8).put(3, 7, 'P');
  L.ground(0, 1, 5).secret(0, 7, 2, 1).put(0, 7, 'c');   // franui 1: behind the wall at the start
  L.ground(17, 22, 7);
  L.carry('scuttle', 19, 6, { patrol: [17, 22], speed: 70 });   // franui 2 rides the Scuttle Crab
  L.plat(23, 5, 3);
  L.ground(27, 36, 8).block(30, 6, 2, 2);
  L.enemy('teemo', 34, 7);
  L.plat(31, 3, 3);
  L.ground(40, 44, 7).put(41, 6, 'k');
  L.plat(46, 5, 2).plat(50, 4, 2);
  L.ground(54, 62, 7).haz(57, 6, 2);
  L.block(60, 4, 2, 3);
  L.plat(62, 2, 3).put(63, 1, 'c');         // franui 3, top of the ruin
  L.ground(67, 80, 8).put(68, 7, 'k').haz(76, 7);
  L.enemy('teemo', 71, 7);
  L.block(74, 6, 1, 2);
  L.plat(81, 5, 3);
  L.ground(85, 88, 6);
  // set-piece: the last turret shoots at you; pass it and the Nexus shield drops
  L.ground(92, 107, 8).put(93, 7, 'k').haz(95, 7).put(103, 7, 'G').trigger('turret', 99);
  return L.build();
}

function valorant() {
  const L = builder(110);
  L.ground(0, 14, 8).put(2, 7, 'P');
  L.block(8, 7, 2, 1).block(9, 6, 1, 1);    // crate stack
  L.ground(18, 29, 8);
  L.enemy('trip', 21, 7);                   // Cypher tripwire
  L.block(25, 6, 2, 2).plat(27, 4, 3);
  L.ground(33, 38, 7).put(34, 6, 'k');
  L.block(36, 5, 3, 1).block(37, 4, 2, 1).block(38, 6, 1, 1);
  L.secret(36, 6, 2, 1, 'B').put(37, 6, 'c');   // franui 1 behind fake crates
  L.plat(40, 6, 2).plat(44, 5, 2);
  L.ground(48, 60, 7).haz(51, 6);
  L.enemy('trip', 55, 6);
  L.block(58, 5, 2, 2).block(59, 4, 1, 1);
  L.plat(61, 2, 2).put(62, 1, 'c');         // franui 2
  // switch room: step on the plate, the door stays open for a few seconds
  L.ground(65, 76, 8).put(66, 7, 'k');
  L.plate(67, 7, 'bdoor', 3500).haz(69, 7, 2).plat(70, 6, 2);
  L.block(72, 5, 4, 1).block(75, 6, 1, 2).door('bdoor', 72, 6, 2).put(74, 7, 'c');   // franui 3
  L.plat(77, 4, 3);
  // set-piece: the Spike is planted when you enter B site; defuse it in time
  L.ground(83, 86, 6).put(84, 5, 'k').trigger('plant', 86);
  L.ground(90, 109, 8).haz(94, 7).put(104, 7, 'G');
  L.enemy('trip', 98, 7);
  return L.build();
}

function rdr2() {
  const L = builder(112);
  L.ground(0, 13, 8).put(2, 7, 'P');
  L.ground(17, 24, 7);
  L.carry('chicken', 20, 6, { patrol: [17, 23], speed: 60 });   // franui 1 on a camp chicken
  L.plat(25, 5, 4);                          // boardwalk
  L.ground(30, 38, 8).block(33, 7, 1, 1);
  L.plat(32, 4, 3);
  L.enemy('snake', 36, 7, 35, 37);
  L.ground(42, 47, 6).put(43, 5, 'k').haz(46, 5);
  L.ground(51, 54, 8);
  L.plat(56, 6, 2).plat(59, 4, 2).put(60, 3, 'c');   // franui 2
  L.ground(63, 69, 7).put(64, 6, 'k').haz(66, 6);
  L.enemy('snake', 68, 6, 67, 68);
  L.ground(70, 72, 5).secret(70, 6, 2, 1).put(71, 6, 'c');   // franui 3 in an old mine
  L.ground(76, 78, 5).haz(77, 4);
  L.plat(80, 3, 3);
  // set-piece: a posse rides in behind you; make it to camp
  L.ground(85, 90, 8).put(85, 7, 'k').trigger('posse', 87).haz(89, 7);
  L.plat(92, 6, 3);
  L.ground(97, 111, 8).put(107, 7, 'G');
  return L.build();
}

export const LEVELS = {
  minecraft: minecraft(),
  genshin: genshin(),
  lol: lol(),
  valorant: valorant(),
  rdr2: rdr2(),
};

// Parse a layout into grid + entities.
export function parseLevel(def) {
  const { rows, things = [] } = def;
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
  things.filter((t) => t.type === 'carrier').forEach((t) => ents.sweets.push({ x: t.c * TILE + TILE / 2, y: TOP + t.r * TILE, carrier: t }));
  const level = { rows, things, cols, width: cols * TILE, at, solid, ents };
  // `view` is how the terrain painters see the level: secret cells look solid
  const fake = new Map();
  things.filter((t) => t.type === 'secret').forEach((t) => {
    for (let i = 0; i < t.w; i++) for (let j = 0; j < t.h; j++) fake.set((t.c + i) + ',' + (t.r + j), t.look);
  });
  const vat = (c, r) => fake.get(c + ',' + r) ?? at(c, r);
  level.view = { ...level, at: vat, solid: (c, r) => { const ch = vat(c, r); return ch === '#' || ch === 'B'; } };
  return level;
}
