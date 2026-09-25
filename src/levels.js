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

export function builder(cols) {
  const g = Array.from({ length: ROWS }, () => Array(cols).fill('.'));
  const set = (c, r, ch) => { if (r >= 0 && r < ROWS && c >= 0 && c < g[0].length) g[r][c] = ch; };
  const things = [];
  const D = { duo: true };
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
    wind(c, w, top, id) { things.push({ type: 'wind', c, w, top, id }); return L; },
    // calls world.setpiece().trigger(id) when the player passes column c
    trigger(id, c) { things.push({ type: 'trigger', id, c }); return L; },

    // ---- duo only: teamwork obstacles. Gates, cracked blocks and duo walls can't
    // be climbed; gates and cracked barriers starting at row 0 reach above the screen.
    // Insert n columns of flat ground (surface s) at column 'at', shifting everything
    // right of it. Call the team* helpers right-to-left so earlier columns stay valid.
    insertFlat(at, n, s) {
      for (let r = 0; r < ROWS; r++) g[r].splice(at, 0, ...Array(n).fill(r >= s ? '#' : '.'));
      for (const t of things) {
        if (t.c >= at) t.c += n;
        if (t.c0 != null && t.c0 >= at) t.c0 += n;
        if (t.c1 != null && t.c1 >= at) t.c1 += n;
        if (t.patrol) t.patrol = t.patrol.map((c) => (c >= at ? c + n : c));
      }
      return L;
    },
    // lever-driven pieces (duo): a bridge that appears, a hidden platform (recon)
    bridge(id, c, r, w) { things.push({ type: 'bridge', id, c, r, w, ...D }); return L; },
    ghost(c, r, w = 1) { things.push({ type: 'ghost', c, r, w, ...D }); return L; },
    // lane turret (LoL duo): fires along row r toward dir; a lever with id switches it off
    turret(c, r, dir, id, len = 20) { things.push({ type: 'enemy', kind: 'lane', c, r, c0: c, c1: c, dir, id, len, ...D }); return L; },
    duoBlock(c, r, w = 1, h = 1) { things.push({ type: 'duoblock', c, r, w, h, ...D }); return L; },
    crack(c, r, w = 1, h = 1) { things.push({ type: 'crack', c, r, w, h, ...D }); return L; },
    lever(c, r, door) { things.push({ type: 'lever', c, r, door, ...D }); return L; },
    gate(id, c, s) { return L.door(id, c, 0, s, D); },
    // throw: the lever that opens the gate sits on a ledge higher than any jump;
    // the raccoon has to throw the cat up there (needs ground surface row 8)
    teamThrow(id, at, s = 8) {
      L.insertFlat(at, 10, s);
      L.plat(at + 2, s - 7, 3);
      return L.lever(at + 3, s - 8, id).gate(id, at + 8, s);
    },
    // wall + cracks: a wall only the raccoon can climb, then a cracked barrier only
    // the cat can smash. The raccoon throws the cat over, the cat breaks through.
    teamWall(at, s = 8) {
      L.insertFlat(at, 10, s);
      return L.duoBlock(at + 2, s - 7, 1, 7).crack(at + 6, 0, 1, s);
    },
    // cage: the gate's lever is locked inside cracked blocks; only the cat frees it
    teamCage(id, at, s) {
      L.insertFlat(at, 9, s);
      L.crack(at + 2, s - 2, 1, 2).crack(at + 3, s - 2, 1, 1).crack(at + 4, s - 2, 1, 2);
      return L.lever(at + 3, s - 1, id).gate(id, at + 7, s);
    },
    // hold: plates on both sides of a gate; one holds while the other passes. The
    // plates sit 4 columns from the gate: a hold plate keeps the gate open only 150ms
    // after you step off, and running from the plate to the gate takes ~0.5s, so
    // nobody gets through alone (the gate never closes on someone standing in it)
    teamHold(id, at, s) {
      L.insertFlat(at, 13, s);
      return L.gate(id, at + 6, s).plate(at + 2, s - 1, id, 0, D).plate(at + 10, s - 1, id, 0, D);
    },
    build() { return { rows: g.map((row) => row.join('')), things }; },
  };
  return L;
}

function minecraft(duo = false) {
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
  L.haz(53, LAST, 10);                      // lava lake with stepping blocks
  L.block(55, 6, 2, 1).block(59, 5, 2, 1).put(60, 3, 'c');   // franui 3 above the lake
  L.ground(63, 75, 7).put(64, 6, 'k');
  L.enemy('creeper', 68, 6, 67, 69);
  L.ground(70, 71, 6).ground(72, 73, 5).ground(74, 75, 4);
  L.haz(76, LAST, 4);
  L.plat(77, 3, 3);
  // set-piece: the portal ignites as you walk up to it
  L.ground(80, 99, 8).put(95, 7, 'G').trigger('ignite', 87);
  if (duo) {
    L.teamWall(90, 8);                      // after the portal trigger: climb + smash
    L.teamHold('coop', 48, 7);              // after the lava pool: one holds, the other passes
    L.teamThrow('mcThrow', 11, 8);          // right after the start: learn the throw
  }
  return L.build();
}

function genshin(duo = false) {
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
  if (duo) {
    L.teamHold('giHold', 96, 8);            // before the waypoint
    L.teamCage('giCage', 38, 7);            // in the meadow with the Seelie
    L.teamThrow('giThrow', 8, 8);
  }
  return L.build();
}

function lol(duo = false) {
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
  if (duo) {
    L.teamHold('lolHold', 101, 8);          // between the fallen turret and the Nexus
    L.teamWall(78, 8);
    L.teamThrow('lolThrow', 8, 8);
  }
  return L.build();
}

function valorant(duo = false) {
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
  if (duo) {
    L.teamWall(100, 8);                     // after the plant: smash through with the Spike ticking
    L.teamThrow('valThrow', 11, 8);
  }
  return L.build();
}

function rdr2(duo = false) {
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
  if (duo) {
    L.teamCage('rdCage', 45, 6);            // on the mesa
    L.teamThrow('rdThrow', 6, 8);
  }
  return L.build();
}

export const LEVELS = {
  minecraft: minecraft(),
  genshin: genshin(),
  lol: lol(),
  valorant: valorant(),
  rdr2: rdr2(),
};

// Duo versions: the same levels with extra ground and teamwork obstacles
export const DUO_LEVELS = {
  minecraft: minecraft(true),
  genshin: genshin(true),
  lol: lol(true),
  valorant: valorant(true),
  rdr2: rdr2(true),
};

// Parse a layout into grid + entities.
export function parseLevel(def) {
  const { rows, things = [] } = def;
  const cols = rows[0].length;
  // duo levels (duoLevels.js) may add: kit (abilities per character), openOnFranui
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
  const level = { rows, things, cols, width: cols * TILE, at, solid, ents, kit: def.kit, openOnFranui: !!def.openOnFranui, def };
  // `view` is how the terrain painters see the level: secret cells look solid
  const fake = new Map();
  things.filter((t) => t.type === 'secret').forEach((t) => {
    for (let i = 0; i < t.w; i++) for (let j = 0; j < t.h; j++) fake.set((t.c + i) + ',' + (t.r + j), t.look);
  });
  const vat = (c, r) => fake.get(c + ',' + r) ?? at(c, r);
  level.view = { ...level, at: vat, solid: (c, r) => { const ch = vat(c, r); return ch === '#' || ch === 'B'; } };
  // duo walls look and collide like 'B' blocks (only duo levels have them)
  const walls = new Set();
  things.filter((t) => t.type === 'duoblock').forEach((t) => {
    for (let i = 0; i < t.w; i++) for (let j = 0; j < t.h; j++) walls.add((t.c + i) + ',' + (t.r + j));
  });
  const dat = (c, r) => (walls.has(c + ',' + r) ? 'B' : vat(c, r));
  const dsolid = (c, r) => { const ch = dat(c, r); return ch === '#' || ch === 'B'; };
  level.view.at = dat; level.view.solid = dsolid;
  level.solidDuo = (c, r) => walls.has(c + ',' + r);
  return level;
}
