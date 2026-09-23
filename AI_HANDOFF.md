# AI handoff: Zey's Sweet Quest

This is context for an AI assistant continuing work on this project. Read it before changing anything.

## What this is
A birthday platformer for Zey. A pixel-art raccoon crosses 5 worlds (Minecraft, Genshin Impact,
League of Legends, Valorant, Red Dead Redemption 2) and collects 3 franui in each. Franui are
chocolate-dipped frozen raspberries. Once all 3 are collected, the world's goal unlocks. After
world 5 comes a finale screen with a birthday letter.
Goal of the project: **pretty, recognizable visuals that look like each game's world.** This is a personal project, not for sale.

## Stack
- Phaser 3.90 (Arcade physics) and Vite 8. Plain JS ES modules, no TypeScript, no framework.
- Deployment target: Vercel (auto-detects Vite; build `npm run build`, output `dist`).
- `npm install` then `npm run dev`.

## Key design decision: art is generated in code
There are no image assets except **real Minecraft textures** in `public/assets/mc/` (downloaded
from the InventivetalentDev/minecraft-assets repo, version 1.20.4). Everything else (the raccoon,
franui, skies, parallax backgrounds, terrain, props, goals) is **painted onto canvases in JS at
load time** and registered as Phaser textures. To change how something looks, edit the paint
code in `src/worlds/<world>.js` or `src/art/`.

## File map
| File | Role |
|---|---|
| `index.html` | Page shell + DOM overlays (title, HUD, world-clear, finale letter, touch buttons, rotate hint). **The birthday letter text is here.** |
| `src/style.css` | All UI styling. Sizes use `cqw` units (the `#stage` is a 16:9 container). |
| `src/main.js` | Phaser config: 1280x720, Scale.FIT, arcade gravity. |
| `src/scenes/BootScene.js` | Builds shared sprites (raccoon, franui, FX), waits for fonts, calls `ui.init`. |
| `src/scenes/GameScene.js` | The game: builds a world from its painter, collision, player controller, camera, collectibles, death/respawn, win. Modes: `play`, `attract` (title background pan), `finale`. |
| `src/ui.js` | DOM UI and flow (title → worlds → clear screens → finale). Restarts the scene with `{world, mode}`. |
| `src/state.js` | Run stats (deaths, time, franui). |
| `src/sfx.js` | WebAudio synthesized chiptune SFX (no audio files), with a mute toggle. |
| `src/levels.js` | Level layouts via a builder API, plus `parseLevel`. |
| `src/art/util.js` | Canvas helpers: seeded `rng`, `fbm` noise, gradients, `glow`, `cloud`, `ridge`, `addTexture`, `chunkedImage`. |
| `src/art/terrain.js` | `paintSmoothTerrain`: shared painter for non-pixel worlds (rounded corners, caps, edge shading). Each world passes a style object. |
| `src/art/sprites.js` | Raccoon: vector shapes drawn on a 43x28 canvas, then `pixelize()` (palette snap + outline), scaled 3x. Also franui and FX textures. |
| `src/worlds/*.js` | One module per world (see the contract below). `index.js` sets the order. |
| `tools/` | Headless Chrome scripts (see Testing). |

## Level format (`src/levels.js`)
- Grid is 11 rows tall; `TILE = 64`; row r spans `y = 16 + r*64`, so the bottom row ends at y=720.
- Builder calls: `ground(c0, c1, surfaceRow)` fills from the surface row down to the bottom;
  `block(c, r, w, h)` places a solid 'B' block, which each world styles (crate, pillar, barrel);
  `plat(c, r, w)` places a one-way platform; `haz(c, r, w)` places hazards; `put(c, r, 'P'|'c'|'k'|'G')` places the start, franui, checkpoint and goal.
- Characters: `#` ground, `B` block, `-` one-way platform, `^` hazard, `c` franui, `P` start, `k` checkpoint, `G` goal.
- Each world needs exactly 3 `c`, one `P` and one `G`. Ground is usually surface row 8 (y=528).
- **Physics limits (measured):** a full jump rises about 216px, just over 3 tiles. Horizontal air distance is about 5 tiles.
  Keep ledges at most 3 rows up, and keep gaps at most 4 tiles (at most 3 if the jump also goes up).
  Constants are at the top of `GameScene.js` (MOVE 340, JUMP 960, GRAV 2000, coyote time 100ms, jump buffer 130ms).
- Falling below the screen kills you. In Minecraft, pits hold lava (`^` on the bottom row).

## World module contract (`src/worlds/<key>.js`)
Each world exports an object with:
- metadata: `key, name, blurb, accent, pixel (false for smooth art), dustTint, goalHint, clearText`
- `preload(scene)` (optional; only Minecraft loads files) and `setup(scene)` (optional)
- `paintSky(ctx, W, H)` paints a screen-fixed sky
- `layers()` returns parallax layers `[{factor, top, height, nearest?, paint(ctx, x0, x1, width)}]`
- `pitFill(ctx, x0, x1)` (optional) paints what shows at the bottom of pits (lake, river, canyon)
- `paintTerrain(ctx, level, x0, x1)`. Smooth worlds call `paintSmoothTerrain` with `{fill, block, top, plat, radius, edgeLight, edgeDark}`
- `decorate(scene, level, add)` adds props (flowers, brush, pots…); `add(key, x, y, {depth, sway, flip, scale, origin})`
- `hazard(scene, h, level)` creates the visuals and **returns the hitbox** `{x, y, w, h}`
- `checkpoint(scene, k)` returns `{activate()}`
- `goal(scene, g)` returns `{zone:{x,y,w,h}, activate(), celebrate()}`. `activate` runs when all 3 franui are collected; `celebrate` runs on reaching the goal.
- `ambient(scene, level)` adds particles; `post(scene)` adds screen overlays (vignette, rays, grain).

What each world currently has:
- **Minecraft:** real textures, lava pits, oak trees, creeper, nether-portal goal, torch checkpoints.
- **Genshin:** Dragonspine, Mondstadt cathedral, windmills, Electro crystal hazards, Teleport Waypoint goal, lamp checkpoints, lake in pits.
- **LoL:** Summoner's Rift at night, turrets, ruins, Teemo-mushroom hazards, ward checkpoints, Nexus goal ("VICTORY"), river in pits.
- **Valorant (Ascent):** floating island, Italian town, arcade, KINGDOM crates, molly-fire hazards, ult-orb checkpoints, Spike goal ("SPIKE DEFUSED").
- **RDR2:** sunset, mesas, western town, cactus hazards, barrels, tumbleweeds, film grain, letterbox bars, campfire goal ("HONOR ▲").

## Gotchas (learned the hard way)
1. **Generated textures must use the `w_` prefix.** `GameScene.create()` deletes all `w_*` textures when a world loads.
2. **Wide images are chunked into pieces of at most 2048px** (`chunkedImage`), because phone GPUs have texture size limits. Each chunk calls
   `paint()` again, so **all randomness in paint code must be deterministic per object**. Use a
   separate `rng` for positions and `rng(seed + index)` for each tree or cloud. Never share one
   rng across skipped and drawn objects, or chunks won't match at the seams.
3. Style functions passed to `paintSmoothTerrain` are called detached, so **don't use `this`** in them. Use module-level caches instead (see `boxes` in valorant.js, `barrel` in rdr2.js).
4. Arcade static bodies: solid cells are merged into horizontal runs. One-way platforms disable down, left and right collision.
5. Parallax layers are only visible above roughly y=460, because the ground sits at 464–528. Put background content higher than that.
6. Debug URL params only work in dev (`import.meta.env.DEV`): `?world=0..4`, `&x=<column>` (spawn column), `&debug` (physics boxes).
   Also dev-only: `window.__game` (the scene) and `window.__ui`, which the test scripts use.
7. Headless Chrome with SwiftShader runs at about 33fps. Tests that measure timing must wait long enough.

## Testing (`tools/`)
The scripts need the dev server on **port 5199**: `npx vite --port 5199`. They use the Chrome path hardcoded in the scripts
(`C:/Program Files/Google/Chrome/Application/chrome.exe`); edit it on another machine.
- `node tools/shot.mjs "http://localhost:5199/?world=2&x=30" shots/out.png 4000` takes a screenshot.
- `node tools/flow.mjs` plays the full game automatically (teleports to each franui and goal, clicks through every screen, checks the finale, reports errors). **Run it after any change.**
- `node tools/mobile.mjs` takes iPhone landscape and portrait screenshots.
Screenshots go to `shots/`, which is gitignored.

## Status
- All 5 worlds are built and visually checked. The full automated playthrough passes with no console errors. The production build works.
- **Not yet done or verified:**
  - A human hasn't played it. Difficulty and control feel are untested.
  - Performance on real phones is unverified.
  - Nothing is committed to git yet.
  - It hasn't been deployed to Vercel.
- The original single-file version is in git history (commit bf121ca).

## Ideas for next steps
- Have a person play it; tune difficulty and level layouts in `levels.js`.
- Music (a looping track per world), moving platforms, a Genshin wind-current updraft mechanic.
- Pigeons in Ascent, a horse at the RDR2 camp, a Scuttle Crab in the LoL river.
- Personalize the finale letter in `index.html`.
- Small cleanups: unused `hudBg` and `belly` fields, and some unused imports in the world files.
