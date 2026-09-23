# AI handoff: Zey's Sweet Quest

This is context for an AI assistant continuing work on this project. Read it before changing anything.

## What this is
A birthday platformer for Zey. A pixel-art raccoon crosses 5 worlds (Minecraft, Genshin Impact,
League of Legends, Valorant, Red Dead Redemption 2) and collects 3 franui in each. Franui are
chocolate-dipped frozen raspberries. **Franui are optional: the goal is always open**, and the
clear screen and finale show how many were found. After world 5 comes a finale screen with a birthday letter.
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
- metadata: `key, name, blurb, accent, pixel (false for smooth art), dustTint, clearText`
- `preload(scene)` (optional; only Minecraft loads files) and `setup(scene)` (optional)
- `paintSky(ctx, W, H)` paints a screen-fixed sky
- `layers()` returns parallax layers `[{factor, top, height, nearest?, paint(ctx, x0, x1, width)}]`
- `pitFill(ctx, x0, x1)` (optional) paints what shows at the bottom of pits (lake, river, canyon)
- `paintTerrain(ctx, level, x0, x1)`. Smooth worlds call `paintSmoothTerrain` with `{fill, block, top, plat, radius, edgeLight, edgeDark}`
- `decorate(scene, level, add)` adds props (flowers, brush, pots…); `add(key, x, y, {depth, sway, flip, scale, origin})`
- `hazard(scene, h, level)` creates the visuals and **returns the hitbox** `{x, y, w, h}`
- `checkpoint(scene, k)` returns `{activate()}`
- `goal(scene, g)` returns `{zone:{x,y,w,h}, activate(), celebrate()}`. `activate` runs once when the world loads (the exit is always open); `celebrate` runs on reaching the goal.
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

## Planned: make the worlds less repetitive
Right now every world plays the same way (run right, static hazards, gaps, 3 franui, goal); only the art changes.
The owner wants these four changes:

1. **Moving hazards / one enemy type per world.** All hazards are static today. Ideas:
   - Minecraft: a creeper that walks and explodes.
   - Genshin: a hilichurl or slime that patrols.
   - League: Teemo popping out of the brush.
   - Valorant: Cypher tripwires that switch on and off.
   - RDR2: rattlesnakes.

   Implement them as sprites with simple patrol or timer logic. Enemies need a way to kill the player; `GameScene.update` only checks the static `this.hazards` rectangles, so an enemy can either keep its own rect in that array updated every frame, or use a physics overlap that calls `die()`. The world module should create them, e.g. through a new optional `enemies(scene, level)` hook.
2. **Vary how the franui are hidden, per world.**
   - Secret areas behind fake walls.
   - Timed doors or switches.
   - A franui carried by a moving object (a floating Seelie in Genshin, a Scuttle Crab in League).

   Don't always place them on a platform above the path.
3. **Pacing inside each level.** A calm opening, a harder middle, and a small set-piece near the goal:
   - the portal igniting;
   - the Nexus shield dropping;
   - a Spike countdown timer in Valorant;
   - a posse chasing you in RDR2.

   Tune the layouts in `src/levels.js`.
4. **Music per world.** A short looping chiptune in each game's style. Add it to `src/sfx.js` as a simple WebAudio sequencer (no audio files, same approach as the SFX), with a track chosen per world and respecting the mute toggle.

## Planned: online Duo mode
The owner wants a **Solo / Duo** choice. **Duo is online**: two people on their own devices (PC or
phone) play through the 5 worlds together as two different characters. **Solo must keep working
exactly as it does now.** Nothing below is implemented yet.

### Open decisions (ask the owner before building)
- **Second character:** the raccoon is Zey. The partner is probably the owner; ask which animal or look they want (a fox, cat and red panda were suggested).
- **Realtime service:** see the networking choice below.

### Networking choice
Vercel hosts only static files and serverless functions; **it cannot run a persistent WebSocket game server.** Options:
1. **Recommended: a managed realtime relay.** Use Supabase Realtime "broadcast" channels (free tier, `@supabase/supabase-js`) or PartyKit/Cloudflare. Each room is one channel; both clients publish and subscribe. It works from a static site and handles NAT and firewalls reliably. That reliability matters for a birthday gift.
2. **Alternative: PeerJS (WebRTC peer-to-peer).** No backend and lower latency, but it depends on the free public PeerJS broker. Without a TURN server, some networks (mobile carriers, strict Wi-Fi) fail to connect.

Put the service keys in Vite env vars (`VITE_...`) and document them in the README. Hide all networking behind one module, `src/net.js` (`createRoom()`, `joinRoom(code)`, `send(type, payload)`, `on(type, cb)`, `leave()`), so the transport can be swapped.

### Authority model
- **Each client owns its own character.** Movement is simulated locally, so controls feel instant. Send the own-player state about 15–20 times per second:
  `{x, y, vx, vy, anim, flipX, dead, world}`.
- **The remote character is interpolated.** Render it about 100ms behind, lerping between the last snapshots. Never run physics on it, except as a moving platform for stacking.
- **The host (the room creator) is authoritative for shared world state:**
  - collected franui;
  - checkpoints;
  - pressure plates and doors;
  - enemies and moving platforms (once they exist);
  - world transitions.

  The guest sends *requests* (e.g. `collect {id}`); the host confirms and broadcasts the result.
- **Level art is already deterministic** (seeded rng), so both clients build identical worlds from the same `LEVELS` data. Only state changes need to be sent.

### Message types (suggested)
`hello {name, character}` · `state {…}` (frequent) · `collect {world, id}` · `checkpoint {id}` ·
`plate {id, down}` · `die` · `revive` · `throw {vx, vy}` · `atGoal {world}` · `nextWorld {index}` ·
`ping`/`pong` · `bye`.

### Co-op rules and mechanics
- **Different abilities** for the two characters:
  - Raccoon: wall-climb, and can grab and throw the partner upward. A throw sends a `throw` event; the partner applies the velocity locally.
  - Partner: double jump, and heavy enough to hold pressure plates.
- **Stacking:** the remote player's body acts as a kinematic one-way platform locally, so you can stand on your partner's head.
- **Revive instead of respawn:** a dead player becomes a floating ghost bubble that follows the partner. The partner touches it to revive. If both are dead, both respawn at the checkpoint.
- **World clear:** needs **both** players at the goal (or one at the goal plus a "warp partner to me" after a few seconds). The host then sends `nextWorld`.
- **Franui** are a shared count for the team. They stay optional, as in solo.
- **Co-op level pieces** only appear in duo:
  - add new level chars, e.g. `D` for a door and `_` for a plate;
  - add a builder flag or a duo variant per level;
  - `parseLevel` ignores them in solo.
- **Per-world duo twists:**
  - Minecraft: place and mine blocks.
  - Genshin: combine elements.
  - League: one player blocks turret shots with a shield.
  - Valorant: a Sage wall platform, plus planting the Spike.
  - RDR2: one player rides, the other lassos.
- **Camera:** each client follows its own player. Show an off-screen arrow pointing to the partner. The online version needs no shared camera.

### Lobby and UI
- Title screen: **Solo** / **Duo** buttons.
- Duo → **Create room** shows a 4-letter code plus a share link (`?room=ABCD`); or **Join room** takes a code. A waiting screen shows until the partner arrives.
- HUD in duo: the partner's name with a connection dot, and the shared franui count.
- Disconnect: pause and show "Partner disconnected — waiting… / Continue solo".
- Finale: the letter can mention both players.

### Suggested build order
1. Refactor the player code in `GameScene.js` into a reusable `Player` class (input source + sprite + body). Solo uses a single `Player` with keyboard or touch input.
2. Build `src/net.js` and the lobby. Show the remote player as an interpolated ghost sprite (no interactions yet). Test with two browser tabs.
3. Sync shared state (franui, checkpoints, world transitions) with host authority.
4. Add the co-op mechanics (revive, stacking, throw), then plates and doors, then the per-world twists.
5. Second character sprite: reuse the `sprites.js` pipeline (vector shapes → `pixelize()`), making a new `drawX(params)` like `drawRaccoon`.

### Testing duo
- Extend `tools/` with a puppeteer script that opens **two pages**: one creates a room, the other joins with the code. It should check that both see each other, that collecting a franui updates both, and that both reaching the goal advances both.
- Also test on two real devices on different networks (e.g. a phone on mobile data plus a PC).

## Ideas for next steps
- Have a person play it; tune difficulty and level layouts in `levels.js`.
- Music (a looping track per world), moving platforms, a Genshin wind-current updraft mechanic.
- Pigeons in Ascent, a horse at the RDR2 camp, a Scuttle Crab in the LoL river.
- Personalize the finale letter in `index.html`.
- Small cleanups: unused `hudBg` and `belly` fields, and some unused imports in the world files.
