# AI handoff: Zey's Sweet Quest

This is context for an AI assistant continuing work on this project. Read it before changing anything.

## What this is
A birthday platformer for Zey. A pixel-art raccoon crosses 5 worlds (Minecraft, Genshin Impact,
League of Legends, Valorant, Red Dead Redemption 2) and collects 3 franui in each. Franui are
chocolate-dipped frozen raspberries. **Franui are optional: the goal can always be reached**, and the
clear screen and finale show how many were found. After world 5 comes a finale screen with a birthday letter.
There is **Solo** (the raccoon) and an online **Duo** mode (raccoon + a seal-point Ragdoll cat, the owner's cat).
Goal of the project: **pretty, recognizable visuals that look like each game's world.** This is a personal project, not for sale.

## Stack
- Phaser 3.90 (Arcade physics) and Vite 8. Plain JS ES modules, no TypeScript, no framework.
- Duo networking: our own WebSocket relay (`server/relay.mjs`, Node + `ws`), hosted on the owner's Hetzner server
  together with the game (Caddy, see `deploy/` and README). Supabase was dropped: free projects pause when idle.
- Deployment target: Vercel (auto-detects Vite; build `npm run build`, output `dist`).
- `npm install` then `npm run dev`.

## Key design decision: art is generated in code
There are no image assets except **real Minecraft textures** in `public/assets/mc/` (downloaded
from the InventivetalentDev/minecraft-assets repo, version 1.20.4). Everything else (the raccoon,
the cat, franui, enemies, skies, parallax backgrounds, terrain, props, goals) is **painted onto canvases in JS at
load time** and registered as Phaser textures. Music and sound are synthesized too (no audio files).

## File map
| File | Role |
|---|---|
| `index.html` | Page shell + DOM overlays (title with Solo/Duo, duo lobby, HUD, spike countdown, world-clear, partner-lost, finale letter, touch buttons). **The birthday letter text is here.** |
| `src/style.css` | All UI styling. Sizes use `cqw` units (the `#stage` is a 16:9 container). |
| `src/main.js` | Phaser config. Dev-only URL flags: `?timer`, `?canvas`, `?fps=` (used by `tools/duo.mjs`). |
| `src/scenes/BootScene.js` | Builds shared sprites (raccoon, cat, franui, FX), waits for fonts, calls `ui.init`. |
| `src/scenes/GameScene.js` | Builds a world, collision, camera, collectibles, checkpoints, death/respawn, win. Modes: `play`, `attract`, `finale`. |
| `src/player.js` | `Player`: sprite + body + platformer controller (movement constants live here). Duo abilities: `wallClimb` (raccoon), `launch()` (thrown). `doubleJump` exists but is off for both. |
| `src/mechanics.js` | Shared level mechanics: secret alcoves, timed doors + pressure plates, franui carriers, wind currents, set-piece triggers, the enemy loop. |
| `src/duo.js` | Duo session (`duo`: create/join, heartbeat, disconnect) and `DuoLink` (per-world sync: partner rendering, shared franui/checkpoints/stomps, revive, head-stacking, throw, both-at-goal). |
| `src/net.js` | Transport wrapper: `createRoom/joinRoom/send/on/leave`. WebSocket relay with auto-reconnect/rejoin, or BroadcastChannel (same browser only) in dev without `VITE_RELAY_URL`. |
| `server/relay.mjs` | Relay: rooms of 2, server-made 4-letter codes, forwards JSON messages, pings, flood limit; reconnects may recreate a room after a restart. |
| `deploy/` | Hetzner setup: `deploy.sh` (build + upload + setup), `setup.sh` (Node, Caddy, systemd), `Caddyfile`, `zsq-relay.service`. |
| `src/ui.js` | DOM UI and flow (title → lobby → worlds → clear screens → finale). |
| `src/state.js` | Run stats (deaths, time, franui). |
| `src/quality.js` | Lite mode for weak GPUs: if a world runs under 48 fps it hides the cosmetic full-screen overlays (vignettes, sun rays, grain) and ambient particles; remembered in localStorage. `?quality=lite|high` overrides. |
| `src/sfx.js` | Synthesized SFX + the music step sequencer (`music.play(key)`), mute toggle. |
| `src/tracks.js` | Music data: one original loop per world + Happy Birthday for the finale. Format documented at the top. |
| `src/levels.js` | Level layouts via a builder API (grid + `things`), plus `parseLevel`. |
| `src/duoLevels.js` | Duo levels designed for two (solo untouched): per-world ability `kit`, `openOnFranui`. Redone so far: Minecraft. Other worlds fall back to the old duo layouts (solo + inserts). |
| `src/abilities.js` | Per-world duo abilities on Q (F too): `mine` (cat breaks ore = cracked blocks), `build` (raccoon: tap Q places a block, hold Q takes all back; 3 max; merged into one body per stack). Blocks sync via `block` messages. |
| `src/art/util.js`, `terrain.js` | Canvas helpers and the shared smooth-terrain painter. |
| `src/art/sprites.js` | Characters (`CHARACTERS`: raccoon, cat) drawn as vectors on 43x28, `pixelize()`d, scaled 3x; franui; FX. |
| `src/worlds/*.js` | One module per world (see the contract below). `index.js` sets the order. |
| `tools/` | Headless browser scripts (see Testing). |

## Level format (`src/levels.js`)
- Grid is 11 rows tall; `TILE = 64`; row r spans `y = 16 + r*64`, so the bottom row ends at y=720.
- Grid builder calls: `ground(c0, c1, surfaceRow)`, `block(c, r, w, h)` ('B', world-styled), `plat(c, r, w)` (one-way),
  `haz(c, r, w)`, `put(c, r, 'P'|'c'|'k'|'G')`.
- "Things" (not grid cells), each styled by the world:
  - `secret(c, r, w, h, look)`: fake wall ('#' or 'B' look) hiding an alcove.
  - `door(id, c, r, h, opts)` + `plate(c, r, id, ms, opts)`: ms 0 is a hold plate. `{duo: true}` = online-only piece.
  - `carry(kind, c, r, {patrol:[c0,c1], speed} | {orbit:[rx,ry], period})`: a franui riding something.
  - `enemy(kind, c, r, c0, c1)`; `wind(c, w, topRow)`; `trigger(id, c)` → `world.setpiece().trigger(id)`.
- Each world needs exactly 3 franui (grid `c` + carriers), one `P` and one `G`.
- **Physics limits (measured):** a full jump rises about 216px (just over 3 tiles); air distance about 5 tiles.
  Keep ledges at most 3 rows up, gaps at most 4 tiles (at most 3 if also going up).
- Pacing per level: calm opening, harder middle with the world's enemy, set-piece before the goal.

## World module contract (`src/worlds/<key>.js`)
- metadata: `key, name, blurb, accent, pixel, dustTint, clearText`, optional `lateGoal` (goal opens via set-piece),
  `caveColor`, `windTint`, `mech: {door, trim, plate}` colors
- `preload`, `setup`, `paintSky`, `layers`, `pitFill`, `paintTerrain`, `decorate`, `hazard` (returns hitbox),
  `checkpoint` → `{activate()}`, `goal` → `{zone, activate(), celebrate()}`, `ambient`, `post`
- new: `enemy(scene, thing, level)` → `{update(ms, dt, player) → 'kill'?, hitbox(), stompable, stomp(), reset()}`;
  `carrier(scene, thing)` → `{obj, carryY, tick?(ms, moving)}`;
  `setpiece(scene, level)` → `{trigger?(id), update?(ms, dt, player) → 'kill'?, reset?(), win?()}`

What each world has now:
| World | Enemy | Franui hidden by | Set-piece |
|---|---|---|---|
| Minecraft | Creeper (hisses, explodes) | pig carrier, tunnel behind fake dirt, above the lava lake | portal ignites block by block |
| Genshin | Anemo slimes (stompable) | Seelie carrier, shrine gate + plate, top of a wind current | wind current, waypoint unlocks |
| LoL | Teemo pops out of brush (stompable) | behind the wall left of the start, Scuttle Crab, ruin top | enemy turret shoots; pass it, Nexus shield drops |
| Valorant | Cypher tripwires (on/off) | fake crates, pillar top, switch room door | Spike planted: 12 s countdown |
| RDR2 | rattlesnakes (rattle, strike; stompable) | camp hen, platform, old mine behind fake rock | posse chases you to camp |

## Duo redesign (all 5 worlds built; play-testing pending, see DUO_TESTS.md)
- Each world has its own duo level in `duoLevels.js` (solo levels untouched) and its own ability pair (not carried
  over between worlds). Basics everywhere: raccoon throws the cat (E), stand on heads, plates, levers, bubbles.
  Difficulty rises per world: 1 tutorial → 5 chains under pressure. Levels are ~186-191 columns (solo ~100-112).
| World | Cat | Raccoon | Level pieces added for it |
|---|---|---|---|
| Minecraft | **mine** (Q: cracked ore in front) | **build** (tap Q: block; hold Q: take all back; 3 max) | ore = `crack` things, `crackCell`/`buildTexture` world hooks |
| Genshin | **glide** (jump, press jump again in the air, hold) | **climb** (existing wallClimb + stamina bar) | `bridge(id,…)` appears on its lever; `wind(…, id)` off until its lever |
| LoL | **flash** (Q: 3 tiles, through thin terrain walls, not gates/ore; 2.5s cd) | **shield** (hold Q: stops shots, slower walk) | `turret(c, r, dir, id, len)` lane turrets (lol.js `laneTurret`, beat on `mech.t`, no messages) |
| Valorant | **recon** (Q: hidden platforms solid+visible 5s; 6s cd) | **barrier** (Q: 3-high ice wall in front, 6s, one at a time) | `ghost(c, r, w)` hidden platforms; `spike: 40` level field |
| RDR2 | **deadeye** (Q: `mech.slow` 3s at 0.3×: enemies, posse, gate timers; 9s cd) | **lasso** (Q: lever ≤6 tiles ahead, else yank the cat ≤7 tiles) | `mech.timeScale`; yank = `me.launch(vx, vy, lockMs)` |
- Code: movement abilities in `player.js` (glide, climb, `speedMul`, `launch(…, lockMs)`), Q abilities + HUD + hints in
  `abilities.js`; sync via `ab` messages (recon/barrier/deadeye/lasso), `block` messages, and `state` flags `gl` (gliding),
  `sh` (shield dir), `sx/sy` (last safe ground). Levers also switch bridges, winds and turrets (`Mechanics.pull`).
- **In duo the goal needs all 3 franui** (`GameScene.needAll`); Minecraft's portal lights on the 3rd (`openOnFranui`).
- **R** (duo) = give up and become a bubble (so a stuck player, e.g. in RDR2's well, can always recover).
- Build rules: on the ground a block goes in the column in front (a bridge tile over a gap, else a step; you get nudged
  back if you poke into it); in the air it goes on top of whatever is below you (towers grow one row per jump). Blocks
  and ice walls never press plates. Stacked blocks/ice are merged into one body per column: separate bodies in a wall
  face snag jumps that push into them, so also keep ore off faces players climb.
- The HUD fades while the player is near the top of the screen (puzzles up there stay visible).
- Throw is vy −1490 (lifts ≈ 544px ≈ 8.5 rows): "one block higher" makes or breaks a throw with ~32px margins.
- Measured: jump ≈ 222px up, gaps ≤ 4 tiles; ground glide ≈ 13.5 tiles; a throw + glide ≈ 26 tiles.
- Verified by `tools/teamwork.mjs`: every Minecraft puzzle; Genshin puzzles 1, 2, 4 and "ground glide falls short".
  LoL/Valorant/RDR2 only pass the static level check and a load/ability smoke test: **play-test them** (DUO_TESTS.md).
- Test-harness gotcha: `?x=` spawns you in the air at row 2; after a death you respawn there (not on the ground).

### Smaller fixes made along the way (so they aren't undone)
- Connection lost: the level pauses; a **Back to title** button (`ui.toTitle`) leaves the room. No "continue solo":
  duo never turns into solo (next/replay are blocked while the partner is gone).
- Partner's bubble no longer flashes in from (0,0): `DuoLink.sample` only interpolates bubble positions between two
  bubble snapshots.
- Minecraft creeper: a stale "gone" from the host while the guest's creeper walks no longer plays a phantom explosion
  (only a fusing creeper explodes).
- RDR2 posse: it waits while you're a bubble and falls back behind you when you're revived (no instant re-death).
- Hold gates: plates 4 columns from the gate (a 2-column gap let one player sneak through in the 150ms grace).
- Double jump is off for both characters; the throw was strengthened to compensate.
- Camera follows your bubble while you're down; the bubble flies freely (moods: fly, loop, hover, gust).
- Performance: MSAA off, transparent rows trimmed from big textures, automatic lite mode (quality.js).

### Ideas (not built yet)
- World-cleared screen card "NEW ABILITY: Glide (cat)" with its key, and a short safe training area per world.
- A "both abilities" finale per world that is a longer chain; sync the Valorant Spike timer and the RDR2 posse between
  players (each client runs its own now).
- Cat riding on the raccoon's head while he climbs (Genshin); raccoon Anemo gust (updraft on Q) as a second Genshin tool.
- LoL: shield also reflects shots back at the turret; flash through Teemo's mushrooms.
- Valorant: ice wall blocks Cypher tripwires; recon also marks the tripwire timing.
- RDR2: lasso swing on hook posts; a horse the cat rides during the posse chase; dead eye marks targets.
- Moving platforms (ride-along), fast crushers for dead eye, rolling barrels.
- Automate LoL/Valorant/RDR2 puzzles in `tools/teamwork.mjs` (helpers for throw, glide, climb, Q already there).
- Performance: lower internal resolution for very weak GPUs (see Gotchas #10); lite mode already drops overlays.

## Duo (online)
- Title → **DUO ONLINE** → pick Cat or Raccoon → **Create room** (4-letter code + invite link `?room=ABCD`),
  or type a code / open the link to join (the joiner gets the other character). Host presses **Start together**.
- Networking: `net.js` → the relay at `VITE_RELAY_URL`, or `wss://<same host>/relay` in production builds. In dev
  without `VITE_RELAY_URL` it uses BroadcastChannel: **only tabs of the same browser**, for testing.
  Drops: the socket reconnects (0.5–4 s backoff) and rejoins; the partner-lost pause only shows after 8 s of silence
  and clears by itself (`tools/relay-drop.mjs` kills/restarts the relay mid-game to prove it).
- Each client simulates its own character; state ~16×/s; partner rendered 100 ms behind with interpolation.
- Host-authoritative: franui (guest sends `collect`, host confirms `collected`). Checkpoints, stomps, `next`, `replay`
  are idempotent broadcasts.
- **The host runs the world for both** (`mech.ai`): it broadcasts its world clock (`clock`, 2×/s) so every
  time-based mover (carriers, slimes, Teemo, tripwires) is in the same place on both screens, and the state of
  stateful enemies (`foes`, 12×/s, via each enemy's `getState()/setState()`: creeper, snakes). Enemy AI aims at
  `mech.ai.nearest(x)`, the closest living player. The guest has `ai.follow = true` and only mirrors. Set-piece events go through `ai.emit(kind, data)` → partner's `setpiece.receive()`
  (the LoL turret's aim/bolt). Triggers fire when either player passes them. Hits are always checked against the
  local player only (e.g. a creeper blast kills whoever is in range on their own screen).
- New enemies with state need `getState()/setState()` and must check `scene.mech.ai.follow` before deciding anything.
- Abilities (duo only): **no double jump** (turned off for both). Raccoon: climbs real walls (hold into the wall; tap jump while pushing
  in to hop up; jump away to kick off) and throws the partner up. Cat: smashes cracked blocks. The action key E / ✋
  does what fits: call partner (at goal) > pull lever > smash (cat) > throw (raccoon). An "E" bubble marks it, and
  one-time toasts explain each obstacle. Also: stand on your partner's head; revive bubbles; partner presses plates.
- **Duo levels** (`DUO_LEVELS`, built with `duo = true`) are the solo levels plus inserted stretches holding
  teamwork obstacles (`teamThrow / teamWall / teamCage / teamHold` in the builder; `insertFlat` shifts everything
  right, so call them right-to-left with solo column numbers). Solo levels are untouched.
  - throw: gate + lever on a ledge 7 rows up; only a thrown cat reaches it (raccoon throws).
  - wall: 7-row duo wall only the raccoon can climb, then a full-height cracked barrier only the cat can smash.
  - cage: gate whose lever is inside cracked blocks (cat).  hold: gate with hold plates on both sides,
    4 columns away (13-column stretch): a hold plate keeps the gate open 150ms after you step off and the gate never
    closes on someone in it, so a plate closer than ~2 columns lets one player sneak through alone.
  Per world: Minecraft throw + hold + wall; Genshin throw + cage + hold; LoL throw + wall + hold;
  Valorant throw + wall (Spike timer +18 s in duo); RDR2 throw + cage.
  Gates and cracks aren't climbable (`GameScene.climbable` only accepts grid walls), gates/cracks starting at row 0
  extend 400px above the screen, levers open gates for good, cracks/levers are shared (`lever`, `crack` messages).
  Measured limits (`tools/teamwork.mjs`): single jump ≈ 222px (feet reach y≈306 from 528); the throw (vy −1450)
  lifts the cat ≈ 514px (feet reach y≈14), clearing the 7-row ledge and wall (top y=80) with ~65px to spare.
- Death in duo: you become a bubble (the camera follows it) that floats at the death spot for 0.8 s, then flies
  freely, unpredictably (meanders, loops, hovers, gusts), to the partner and circles them loosely (`flyBubble`
  in duo.js, `GHOST_*` constants); no timeout. It keeps
  80 px from a partner standing still, so popping it takes a move or a jump. You reappear on safe ground 1-3
  columns behind them (`DuoLink.safeSpot`, from their last safe ground `sx/sy` in `state`; else in front; never
  through a wall/gate or onto a hazard) and can't die for 1 s (`GameScene.invuln`, blinking; falling out still counts). Both bubbles: circle wipe (`ui.iris`, `#iris` in style.css),
  both back at the last checkpoint.
- Disconnect: after 8 s without messages the game pauses ("connection lost") and resumes when the partner is back.
  Duo never turns into solo: no world starts, and the clear/finale screens don't move on, while the partner is gone.
- Messages: `hello welcome start ping bye state collect collected checkpoint stomp revive throw atGoal warp next replay`.

## Gotchas (learned the hard way)
1. Generated textures must use the `w_` prefix (deleted when a world loads); shared ones (`raccoon`, `cat`, `duo-bubble`) must not.
2. Wide images are chunked into ≤2048px pieces, so **paint code must be deterministic per object** (`rng(seed + i)`).
3. Style functions passed to `paintSmoothTerrain` are called detached: **no `this`**.
4. Arcade static bodies: solid cells are merged into horizontal runs. One-way platforms disable down/left/right collision.
5. Parallax layers are only visible above roughly y=460.
6. Dev-only URL params: `?world=0..4`, `&x=<column>`, `&debug`; `window.__game`, `window.__ui`.
7. Headless Chrome runs the game **slower than real time** (≈20–30 fps with the 50 ms delta cap). Tests wait in game time
   (`mech.t`), not wall time.
8. Two same-origin pages share one renderer thread: two full-speed games starve it. `tools/duo.mjs` uses
   `?timer&canvas&fps=20`. Use `page.evaluate(el.click())`, not `page.click()`, on a background page.
9. Secret alcoves: terrain is painted from `level.view` (secrets look solid), then the alcove is cut out and redrawn
   as an overlay. The decorate/collision code uses the raw `level`.
10. Performance is GPU fill rate, not JS (the main thread is ~90% idle): every pixel of every image costs, even
    transparent ones. `chunkedImage` trims empty rows; MSAA is off (`antialiasGL: false`). Screen-fixed overlays at
    depth 45–99 and full width count as cosmetic for lite mode. Screenshot scripts should pass `&quality=high`.
11. `R.belly` in `sprites.js` isn't painted directly but is part of the raccoon palette used by `pixelize()`, so it's kept.

## Testing (`tools/`)
Dev server on **port 5199**: `npx vite --port 5199`. Browser path auto-detected in `tools/browser.mjs` (Chrome or Edge;
override with `CHROME=...`).
- `node tools/flow.mjs`: full solo playthrough (all 15 franui, every world, finale). **Run after any change.**
- `node tools/mechanics.mjs`: plates/doors, wind, secrets, stomp, creeper, turret, spike, posse.
- `node tools/duo.mjs`: two pages; lobby, presence, shared franui/checkpoint, lever + crack teamwork, shared creeper, revive,
  both-at-goal, next world, throw, shared turret, disconnect. Headless runs are slow and
  flaky: which checks fail changes from run to run (seen on unchanged code too).
- `node tools/teamwork.mjs`: one player on a duo layout (`?duolevel&char=cat`); checks jumps/climbs vs the obstacles.
- `node tools/tour.mjs [prefix]`: screenshots of every new feature. `shot.mjs`, `mobile.mjs`, `death.mjs` as before.
Screenshots go to `shots/` (gitignored).

## Status
- Done: both planned features from the previous handoff (varied worlds with enemies, hidden franui, pacing,
  set-pieces, music; and online Duo). All test scripts pass; production build works.
- **Not yet done or verified:**
  - A human hasn't played it: difficulty, control feel and the new set-piece timings are untested by hand.
  - **The relay is not deployed yet**: run `deploy/deploy.sh` against the Hetzner server, then test on two real
    devices on different networks (e.g. a phone on mobile data plus a PC).
  - Performance on real phones is unverified. Not deployed to Vercel.
  - Per-world duo twists (Minecraft place/mine blocks, Genshin element combos, LoL shield block, Valorant Sage wall
    + plant, RDR2 ride/lasso) are not built. The teamwork obstacles haven't been played by two humans yet.

## Ideas for next steps
- Play-test and tune `levels.js` (Spike timer `SPIKE_TIME` in valorant.js, posse `SPEED` in rdr2.js).
- Play the duo levels together and tune; then the per-world twists above.
- Pigeons in Ascent, a horse at the RDR2 camp. Personalize the finale letter in `index.html`.
