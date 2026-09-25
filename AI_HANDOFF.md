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
| `src/player.js` | `Player`: sprite + body + platformer controller (movement constants live here). Duo abilities: `doubleJump` (cat), `wallClimb` (raccoon), `launch()` (thrown). |
| `src/mechanics.js` | Shared level mechanics: secret alcoves, timed doors + pressure plates, franui carriers, wind currents, set-piece triggers, the enemy loop. |
| `src/duo.js` | Duo session (`duo`: create/join, heartbeat, disconnect) and `DuoLink` (per-world sync: partner rendering, shared franui/checkpoints/stomps, revive, head-stacking, throw, both-at-goal). |
| `src/net.js` | Transport wrapper: `createRoom/joinRoom/send/on/leave`. WebSocket relay with auto-reconnect/rejoin, or BroadcastChannel (same browser only) in dev without `VITE_RELAY_URL`. |
| `server/relay.mjs` | Relay: rooms of 2, server-made 4-letter codes, forwards JSON messages, pings, flood limit; reconnects may recreate a room after a restart. |
| `deploy/` | Hetzner setup: `deploy.sh` (build + upload + setup), `setup.sh` (Node, Caddy, systemd), `Caddyfile`, `zsq-relay.service`. |
| `src/ui.js` | DOM UI and flow (title → lobby → worlds → clear screens → finale). |
| `src/state.js` | Run stats (deaths, time, franui). |
| `src/sfx.js` | Synthesized SFX + the music step sequencer (`music.play(key)`), mute toggle. |
| `src/tracks.js` | Music data: one original loop per world + Happy Birthday for the finale. Format documented at the top. |
| `src/levels.js` | Level layouts via a builder API (grid + `things`), plus `parseLevel`. |
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
  `mech.ai.nearest(x)`, the closest living player. The guest has `ai.follow = true` and only mirrors; if the host
  drops, the guest takes over. Set-piece events go through `ai.emit(kind, data)` → partner's `setpiece.receive()`
  (the LoL turret's aim/bolt). Triggers fire when either player passes them. Hits are always checked against the
  local player only (e.g. a creeper blast kills whoever is in range on their own screen).
- New enemies with state need `getState()/setState()` and must check `scene.mech.ai.follow` before deciding anything.
- Abilities (duo only): **both double-jump**. Raccoon: climbs real walls (hold into the wall; tap jump while pushing
  in to hop up; jump away to kick off) and throws the partner up. Cat: smashes cracked blocks. The action key E / ✋
  does what fits: call partner (at goal) > pull lever > smash (cat) > throw (raccoon). An "E" bubble marks it, and
  one-time toasts explain each obstacle. Also: stand on your partner's head; revive bubbles; partner presses plates.
- **Duo levels** (`DUO_LEVELS`, built with `duo = true`) are the solo levels plus inserted stretches holding
  teamwork obstacles (`teamThrow / teamWall / teamCage / teamHold` in the builder; `insertFlat` shifts everything
  right, so call them right-to-left with solo column numbers). Solo levels are untouched.
  - throw: gate + lever on a ledge 7 rows up; only a thrown cat reaches it (raccoon throws).
  - wall: 7-row duo wall only the raccoon can climb, then a full-height cracked barrier only the cat can smash.
  - cage: gate whose lever is inside cracked blocks (cat).  hold: gate with hold plates on both sides.
  Per world: Minecraft throw + hold + wall; Genshin throw + cage + hold; LoL throw + wall + hold;
  Valorant throw + wall (Spike timer +18 s in duo); RDR2 throw + cage.
  Gates and cracks aren't climbable (`GameScene.climbable` only accepts grid walls), gates/cracks starting at row 0
  extend 400px above the screen, levers open gates for good, cracks/levers are shared (`lever`, `crack` messages).
  Measured limits (`tools/teamwork.mjs`): double jump ≈ 380px (feet reach y≈149 from 528), throw ≈ 600px+.
- Disconnect: after 8 s without messages the game pauses with "Continue solo".
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
10. `R.belly` in `sprites.js` isn't painted directly but is part of the raccoon palette used by `pixelize()`, so it's kept.

## Testing (`tools/`)
Dev server on **port 5199**: `npx vite --port 5199`. Browser path auto-detected in `tools/browser.mjs` (Chrome or Edge;
override with `CHROME=...`).
- `node tools/flow.mjs`: full solo playthrough (all 15 franui, every world, finale). **Run after any change.**
- `node tools/mechanics.mjs`: plates/doors, wind, secrets, stomp, creeper, turret, spike, posse.
- `node tools/duo.mjs`: two pages; lobby, presence, shared franui/checkpoint, lever + crack teamwork, shared creeper, revive,
  both-at-goal, next world, throw, shared turret, disconnect. (The last check, "continue solo", failed once and then
  passed 3 runs in a row; if it flakes again, look at a player being a ghost when the partner leaves.)
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
