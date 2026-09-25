// Duo levels designed for two players (solo levels live in levels.js and are
// untouched). Each world has its own ability kit, and difficulty rises world by
// world. Worlds not redone yet fall back to the old duo layouts (solo + inserts).
//
// A level can add to the usual builder output:
//   kit: { cat: {...}, raccoon: {...} }   abilities per character (see player.js / abilities.js)
//   openOnFranui: true                    the goal opens when the 3rd franui is found
// In duo the goal never lets you through before all 3 franui are found.
//
// Physics to design with (measured): a jump climbs ~216px (3 rows, not 4) and
// crosses gaps up to 4 tiles; the raccoon's throw lifts the cat ~544px (8 rows);
// the raccoon has 3 blocks (a step, a bridge tile, or a tower under himself).
import { builder, LAST, DUO_LEVELS as OLD_DUO } from './levels.js';

// World 1 · Minecraft: tutorial. Cat MINES ore (Q), raccoon BUILDS blocks (Q).
// Each ability alone first, then small combos, then a finale that needs both.
function minecraft() {
  const L = builder(191);
  // start
  L.ground(0, 11, 8).put(2, 7, 'P');
  // 1 · mine: an ore wall from the sky to the ground; only the cat gets through
  L.ground(12, 19, 8).crack(15, 0, 1, 8).crack(16, 0, 1, 8);
  // 2 · build: a cliff 4 blocks high (one too many to jump); the raccoon builds a
  //     step. Franui 1 hides in ore in the far side of the plateau, one block up:
  //     the raccoon builds a step there too and the cat mines in from it.
  //     (Ore sits on a face you climb down, not up: a wall made of separate
  //     bodies can snag a jump that pushes against it.)
  L.ground(20, 26, 8).ground(27, 37, 4);
  L.block(35, 6, 3, 1, '.').crack(37, 6, 1, 1).crack(36, 6, 1, 1).put(35, 6, 'c');
  // 3 · bridge: a lava pit too wide to jump; three blocks, then a jump.
  //     Franui 2 hangs over the lava
  L.ground(38, 41, 8).haz(42, LAST, 6).put(45, 6, 'c');
  // 4 · hold gate: one holds a plate while the other goes through
  L.ground(48, 64, 8).put(50, 7, 'k');
  L.gate('mcHold', 57, 8).plate(53, 7, 'mcHold', 0).plate(61, 7, 'mcHold', 0);
  // 5 · creeper field
  L.ground(65, 80, 8).put(66, 7, 'k').haz(69, 8, 2);
  L.enemy('creeper', 74, 7, 72, 77);
  // 6 · throw + mine (down in a hollow): the lever for the gate is up on a ledge,
  //     walled in by ore. The raccoon throws the cat up from under the slab, the
  //     cat mines through to the lever
  L.ground(81, 110, 10).plat(83, 3, 3).block(86, 3, 3, 1).block(87, 0, 1, 2);
  L.crack(86, 0, 1, 3).crack(88, 0, 1, 3).lever(87, 2, 'mcLever').gate('mcLever', 91, 10);
  // 7 · build + throw: franui 3 on a shelf at the very top. A throw from the
  //     ground falls short; from a block (or the raccoon's head) it makes it.
  //     Throw from a column or two left of the shelf, not from right under it
  L.put(97, 9, 'k').block(101, 1, 6, 1).put(103, 0, 'c');
  // 8 · bridge + mine: bridge the lava, then the cat mines through the ore wall
  L.ground(111, 116, 8).haz(117, LAST, 6).ground(123, 130, 8);
  L.crack(125, 0, 1, 8).crack(126, 0, 1, 8).put(128, 7, 'k');
  // 9 · creeper
  L.ground(131, 144, 8);
  L.enemy('creeper', 138, 7, 136, 141);
  // 10 · finale: a cliff 6 blocks high. The raccoon towers up (jump + Q under
  //      himself, 3 times) and both climb; up top he takes his blocks back to
  //      bridge the void; the cat mines the last ore; down to the portal, which
  //      lights up once all 3 franui are found
  L.ground(145, 152, 8).put(146, 7, 'k').ground(153, 159, 2);
  L.haz(160, LAST, 6).ground(166, 172, 2).crack(169, 0, 1, 2);
  L.ground(173, 190, 8).put(184, 7, 'G');
  return {
    ...L.build(),
    kit: { cat: { mine: true }, raccoon: { build: true } },
    openOnFranui: true,
  };
}

// World 2 · Genshin: cat GLIDES (jump, press jump again in the air, hold), raccoon
// CLIMBS any wall (stamina). Levers raise bridges and wake wind currents.
function genshin() {
  const L = builder(186);
  L.ground(0, 11, 8).put(2, 7, 'P');
  // 1 · climb: a cliff 6 high; the cat's way is a tunnel through it, shut by a gate.
  //     The raccoon climbs up and pulls the lever on top
  L.ground(12, 19, 8).ground(20, 25, 2).block(20, 7, 6, 1, '.');
  L.door('giTunnel', 23, 7, 1).lever(23, 1, 'giTunnel');
  L.ground(26, 33, 8).put(28, 7, 'k');
  // 2 · glide: a gorge 10 wide below a hill; the cat glides over (franui 1 floats
  //     on the way) and pulls the lever that lays a bridge for the raccoon
  L.ground(34, 38, 8).ground(39, 42, 5).put(47, 2, 'c');
  L.bridge('giBridge', 43, 5, 10).ground(53, 62, 8).lever(55, 7, 'giBridge').put(54, 7, 'k');
  // 3 · hold gate
  L.ground(63, 77, 8).gate('giHold', 69, 8).plate(65, 7, 'giHold', 0).plate(73, 7, 'giHold', 0);
  // 4 · slime meadow, then a rock pillar 7 high across the path: the raccoon
  //     climbs it, the raccoon throws the cat up. Franui 2 waits on top
  L.ground(78, 106, 8).put(79, 7, 'k').haz(87, 7);
  L.enemy('slime', 83, 7, 81, 85).enemy('slime', 91, 7, 89, 93);
  L.ground(95, 97, 1).put(96, 0, 'c').put(100, 7, 'k');
  // 5 · throw + glide: a chasm 16 wide. A glide from the ground falls short; thrown
  //     first, the cat glides all the way (franui 3 on an island on the way) and
  //     pulls the lever for the bridge
  L.plat(113, 2, 3).put(114, 1, 'c');
  L.ground(123, 140, 8).lever(125, 7, 'giBridge2').bridge('giBridge2', 107, 8, 16).put(124, 7, 'k');
  // 6 · finale: a cliff 6 high; the raccoon climbs and wakes the wind beside it for
  //     the cat. From the top the cat glides the whole valley and drops the last
  //     bridge; the waypoint unlocks as you reach it
  L.wind(139, 2, 0, 'giWind').ground(141, 150, 2).lever(144, 1, 'giWind');
  L.ground(151, 153, 8).put(152, 7, 'k');
  L.bridge('giBridge3', 154, 8, 15).ground(169, 185, 8).lever(171, 7, 'giBridge3');
  L.put(178, 7, 'G').trigger('waypoint', 174);
  return { ...L.build(), kit: { cat: { glide: true }, raccoon: { wallClimb: true } } };
}

// World 3 · League of Legends: cat FLASHES (Q: 3 tiles, through thin walls but
// not gates), raccoon SHIELDS (hold Q: stops turret shots for whoever is behind
// him). Lane turrets shoot along their row on a beat.
function lol() {
  const L = builder(186);
  // start; franui 1 hides behind the thin ruin wall at your back: flash through it
  L.ground(0, 24, 8).block(2, 0, 1, 8).put(0, 7, 'c').put(5, 7, 'P');
  // 1 · flash: a ruin wall with a gate at the bottom. The cat jumps and flashes
  //     through the wall above the gate, then pulls the lever
  L.block(17, 0, 1, 5).door('lolGate1', 17, 5, 3).lever(20, 7, 'lolGate1');
  // 2 · shield: a low tunnel with a turret at the end; walk behind the raccoon's shield
  L.ground(25, 45, 8).put(26, 7, 'k').block(28, 0, 13, 7).turret(41, 7, -1, null, 14);
  // 3 · flash + shield: the cat flashes over the gate wall, runs past the turret
  //     (jump its shots) and holds the plate behind it; the raccoon shields through
  L.ground(46, 68, 8).put(47, 7, 'k').block(52, 0, 1, 5).door('lolGate2', 52, 5, 3);
  L.turret(58, 7, -1, null, 6).plate(60, 7, 'lolGate2', 0);
  // 4 · Teemo meadow; franui 2 on a floating slab: a throw gets the cat there
  L.ground(69, 95, 8).put(70, 7, 'k').haz(80, 7).enemy('teemo', 76, 7).enemy('teemo', 86, 7);
  L.plat(88, 1, 3).put(89, 0, 'c');
  // 5 · throw + flash: franui 3 in a sealed chamber high in a ruin. Thrown along
  //     the ruin's face, the cat flashes in (and flashes back out). Walk under it
  L.ground(96, 115, 8).block(102, 0, 6, 7).block(104, 1, 2, 2, '.').put(104, 2, 'c');
  // 6 · turret gate: one holds the near plate (out of range), the cat dodges the
  //     shots to the far plate behind the turret, the raccoon shields through
  L.ground(116, 140, 8).put(117, 7, 'k').gate('lolHold', 128, 8);
  L.plate(124, 7, 'lolHold', 0).plate(138, 7, 'lolHold', 0).turret(136, 7, -1, null, 9);
  // 7 · finale: the last turret aims at you (shield!); pass it and the Nexus opens
  L.ground(141, 185, 8).put(142, 7, 'k').haz(147, 7).put(172, 7, 'G').trigger('turret', 160);
  return { ...L.build(), kit: { cat: { flash: true }, raccoon: { shield: true } } };
}

// World 4 · Valorant: cat RECON (Q: hidden platforms show and hold for 5s),
// raccoon ICE WALL (Q: a 3-high wall in front of him for 6s). Spike at the end.
function valorant() {
  const L = builder(186);
  L.ground(0, 17, 8).put(2, 7, 'P');
  // 1 · recon: a pit 9 wide with hidden platforms; reveal, then both hop across
  L.ghost(20, 8, 2).ghost(24, 8, 1).ground(27, 40, 8);
  // 2 · ice wall: a ledge 5 high. The raccoon's wall is a step for both (6s!)
  L.ground(41, 48, 3);
  // 3 · Cypher's alley; franui 1 on a crate stack 4 high (ice wall, then jump)
  L.ground(49, 77, 8).put(50, 7, 'k').enemy('trip', 55, 7).haz(59, 7).enemy('trip', 63, 7);
  L.block(66, 4, 2, 4).put(66, 3, 'c');
  // 4 · recon + ice wall: the raccoon's wall, then hidden platforms high over a pit,
  //     then the far ledge; all while both still stand (franui 2 on the way)
  L.ghost(79, 4, 2).ghost(84, 4, 2).put(84, 3, 'c').ground(88, 95, 3);
  // 5 · hold gate
  L.ground(96, 117, 8).put(97, 7, 'k').gate('valHold', 103, 8).plate(99, 7, 'valHold', 0).plate(107, 7, 'valHold', 0);
  // 6 · recon + throw: franui 3 at the far end of a hidden platform up high, over a
  //     pit: reveal, get thrown onto it, walk along. Hidden steps cross the pit below
  L.ghost(118, 1, 5).put(122, 0, 'c').ghost(120, 8, 2).ground(125, 145, 8);
  // 7 · finale: the Spike is planted; a hidden bridge, a ledge for the ice wall, then defuse
  L.put(126, 7, 'k').trigger('plant', 136).enemy('trip', 141, 7);
  L.ghost(148, 8, 2).ground(152, 157, 8).ground(158, 164, 3).ground(165, 185, 8).haz(170, 7).put(178, 7, 'G');
  return { ...L.build(), kit: { cat: { recon: true }, raccoon: { barrier: true } }, spike: 40 };
}

// World 5 · Red Dead Redemption 2: cat DEAD EYE (Q: the world runs slow for 3s:
// enemies, the posse, gate timers), raccoon LASSO (Q: pulls a lever up to 6 tiles
// ahead, or yanks the cat over to him). Hardest: chains under pressure.
function rdr2() {
  const L = builder(190);
  L.ground(0, 26, 8).put(2, 7, 'P');
  // 1 · lasso: the lever for the gate sits on a rock slab over cactus
  L.haz(18, 7, 4).block(19, 4, 3, 1).lever(20, 3, 'rdGate1').gate('rdGate1', 25, 8);
  // 2 · dead eye: a plate opens the gate for 1 second only, and it's 10 steps away
  L.ground(27, 45, 8).put(28, 7, 'k').plate(30, 7, 'rdTimed', 1000).gate('rdTimed', 40, 8);
  // 3 · lasso a lever on a rock in the canyon: a bridge for both
  L.ground(46, 50, 8).block(54, 3, 1, 1).lever(54, 2, 'rdBridge').bridge('rdBridge', 51, 8, 7);
  // 4 · the well: franui 1 at the bottom of a well too deep to jump out of; the
  //     raccoon yanks the cat back up with the lasso
  L.ground(58, 64, 8).put(59, 7, 'k').ground(65, 75, 6).block(69, 6, 2, 4, '.').put(69, 9, 'c');
  // 5 · snake canyon (dead eye makes them easy)
  L.ground(76, 100, 8).put(77, 7, 'k').haz(85, 7).haz(91, 7);
  L.enemy('snake', 82, 7, 81, 84).enemy('snake', 88, 7, 87, 90).enemy('snake', 95, 7, 93, 97);
  // 6 · all together: the plate for a 1-second gate is up on a slab (throw the
  //     cat up). She stands on it and slows time; the raccoon waits at the gate and
  //     yanks her over to him; both through. Franui 2 on the slab
  L.ground(101, 125, 8).put(102, 7, 'k').block(103, 3, 3, 1).plate(104, 2, 'rdT2', 1000).put(105, 2, 'c');
  L.gate('rdT2', 110, 8);
  // 7 · finale: the posse rides in behind you. A 1-second gate (dead eye slows the
  //     posse too), a lever on a slab over cactus (lasso), franui 3 on a slab (a
  //     throw, with the posse coming), camp
  L.ground(126, 189, 8).put(127, 7, 'k').trigger('posse', 130);
  L.plate(140, 7, 'rdT3', 1000).gate('rdT3', 148, 8);
  L.haz(157, 7, 4).block(158, 4, 2, 1).lever(159, 3, 'rdGate4').gate('rdGate4', 164, 8);
  L.block(169, 3, 2, 1).put(169, 2, 'c');
  L.put(180, 7, 'G');
  return { ...L.build(), kit: { cat: { deadeye: true }, raccoon: { lasso: true } } };
}

export const DUO_LEVELS = {
  ...OLD_DUO,
  minecraft: minecraft(),
  genshin: genshin(),
  lol: lol(),
  valorant: valorant(),
  rdr2: rdr2(),
};
