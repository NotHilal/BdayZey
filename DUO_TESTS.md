# Duo test checklist

What to play-test for the new duo levels (all 5 worlds). Solo is unchanged.

## Setup
- `npm run dev -- --host`, then open the address Vite prints (not `localhost`) on two devices on the same Wi-Fi
  (PC + phone, or two PCs). One creates the room, the other joins with the code.
- Dev shortcuts (one browser, no partner): `?world=0..4&duolevel&char=cat` (or `raccoon`) loads a duo level
  alone, `&x=<column>` starts at a column. Handy to check one puzzle quickly.
- Controls: arrows/WASD move, Space/Up jump, **E** = throw the cat (raccoon) / levers / call your partner at the
  goal, **Q** (or F) = the world's ability, **R** = give up (become a bubble) if you're stuck.

## Every world, check
- [ ] The HUD chip shows your ability (e.g. `🧱 3/3`, `🪂 GLIDE`, `⚡ FLASH`, a cooldown in seconds).
- [ ] The first-time hint toast explains the ability.
- [ ] On a phone: the second touch button (ability) is there and works; hold works for build/shield.
- [ ] The goal doesn't let you through before all 3 franui ("FIND ALL 3 FRANUI FIRST").
- [ ] Death: bubble flies around, partner pops it, you come back behind them, 1s blinking invulnerability.
- [ ] Both down: circle wipe, both back at the last checkpoint.
- [ ] R turns you into a bubble.
- [ ] Nothing feels impossible; nothing can be skipped alone (the "alone" lines below).

## World 1 · Minecraft (cat MINE, raccoon BUILD) — automated physics tests pass
| # | Puzzle | Intended solution | Check alone fails |
|---|---|---|---|
| 1 | Ore wall | Cat: Q twice | Raccoon can't pass |
| 2 | 4-high cliff | Raccoon: Q = step, both jump up | Cat can't climb |
| 2b | Franui 1 in ore, far side of the plateau | Raccoon builds a step at the foot, cat stands on it and mines left | |
| 3 | Lava pit (6) | Raccoon: 3 bridge blocks, jump the rest; franui 2 over the lava | Cat can't jump it |
| 4 | Hold gate | One on each plate in turn | Can't pass alone; blocks don't press plates |
| 6 | Lever in an ore cage on a slab (in the hollow) | Raccoon throws cat from under the slab, cat mines, pulls lever | 3-block tower + jump falls short |
| 7 | Franui 3 on the top shelf | Cat on a raccoon block one column left of the shelf, thrown | Throw from the ground falls short |
| 8 | Lava + ore wall | Bridge, then mine | |
| 10 | Finale cliff (6) | Raccoon towers 3 (jump + Q ×3), cat climbs the tower; hold Q up top to take it back; bridge the void; cat mines; portal | 2-block tower too short |

## World 2 · Genshin (cat GLIDE: jump then press jump again and hold; raccoon CLIMB: push into walls) — partly automated
| # | Puzzle | Intended solution | Check |
|---|---|---|---|
| 1 | 6-high cliff, tunnel gate at its foot | Raccoon climbs, pulls the lever on top; cat walks the tunnel | ✅ tested |
| 2 | Gorge (10) below a hill | Cat glides from the hill (franui 1 on the way), pulls lever → bridge | ✅ tested |
| 3 | Hold gate | | |
| 4 | Rock pillar (7) across the path, franui 2 on top | Raccoon climbs; raccoon throws the cat over | ✅ tested |
| 5 | Chasm (16), island with franui 3 | Throw, then glide to the island, glide on; lever → bridge | ground glide falls short ✅; **thrown glide not verified** |
| 6 | Finale cliff + wind | Raccoon climbs, lever wakes the wind, cat rides it up; cat glides the valley from the top, lever → bridge; waypoint | **wind lift + finale glide not verified** |
- Tune: glide fall speed `GLIDE_FALL` (player.js), climb stamina `CLIMB_TIME`.

## World 3 · LoL (cat FLASH: Q, through thin walls; raccoon SHIELD: hold Q) — not automated, only load/smoke tested
| # | Puzzle | Intended solution | Watch for |
|---|---|---|---|
| 0 | Franui 1 behind the thin wall at the start | Cat flashes left and back | Flash lands inside the pocket |
| 1 | Wall with a gate at its bottom | Cat jumps and flashes through the wall above the gate; lever | Flash must NOT pass the gate itself |
| 2 | Low tunnel with a turret | Walk behind the raccoon's shield | Shots stop at the shield on BOTH screens |
| 3 | Gate wall + turret + plate behind it | Cat flashes over, runs past the turret (jump shots), holds the plate; raccoon shields through | Too hard? |
| 4 | Teemos; franui 2 on a floating slab | Throw | |
| 5 | Franui 3 sealed in a ruin chamber | Throw along the ruin face, flash in near the top of the throw, flash out | **Probably the hardest timing: tune if frustrating** |
| 6 | Turret hold gate | Raccoon on near plate, cat dodges to far plate behind the turret, raccoon shields through | |
| 7 | Nexus turret | Shield blocks its aimed shots | |
- Tune: `FLASH` (abilities.js), turret `LANE` period/speed (lol.js), each turret's range (`turret(..., len)`).

## World 4 · Valorant (cat RECON: Q reveals hidden platforms 5s; raccoon ICE WALL: Q, 3 high, 6s) — only load/smoke tested
| # | Puzzle | Intended solution | Watch for |
|---|---|---|---|
| 1 | Pit with hidden platforms | Reveal, both hop across | 5s enough for both? |
| 2 | 5-high ledge | Ice wall as a step, both climb within 6s | |
| 3 | Tripwires; crate stack (4) in the path, franui 1 | Ice wall step over the crates | |
| 4 | Ice wall + high hidden platforms over a pit, franui 2 | Raccoon's wall at the edge, reveal, hop wall → platform → platform → ledge | **Timing chain unverified** |
| 5 | Hold gate | | |
| 6 | Hidden platform up high with franui 3 at its far end | Reveal, throw the cat onto it, walk along; hidden steps below to cross the pit | |
| 7 | Spike (40s in duo): hidden bridge, 5-high ledge (ice wall), defuse | | Timer fair? (`spike: 40` in duoLevels.js) |
- Tune: `RECON`, `BARRIER` (abilities.js).

## World 5 · RDR2 (cat DEAD EYE: Q slows the world 3s; raccoon LASSO: Q) — only load/smoke tested
| # | Puzzle | Intended solution | Watch for |
|---|---|---|---|
| 1 | Lever on a slab over cactus | Raccoon lassoes it (face it, within 6 tiles) | |
| 2 | 1-second gate 10 steps from the plate | Cat: plate + dead eye, both run through | Door timer really slows |
| 3 | Canyon, lever on a rock high in it | Lasso → bridge | |
| 4 | Franui 1 at the bottom of a deep well | Cat jumps in, raccoon yanks her out from the rim | **Yank arc lands safely?** |
| 5 | Snake canyon | Dead eye slows snakes | |
| 6 | 1s gate whose plate is on a slab, franui 2 | Throw the cat up; she slows time on the plate; raccoon at the gate yanks her over; both through | **Chain unverified** |
| 7 | Posse chase: 1s gate, lasso lever over cactus, franui 3 on a slab (throw), camp | Dead eye slows the posse too | Fair under pressure? |
- Tune: `DEADEYE`, `LASSO` (abilities.js); posse `SPEED` (rdr2.js).
- Seen once in a smoke screenshot: the HUD showed 1 franui at the RDR2 start; couldn't reproduce. Keep an eye on it.

## Automated scripts (dev server on port 5199: `npx vite --port 5199`)
- `node tools/teamwork.mjs minecraft` / `genshin` — per-puzzle physics (Minecraft all pass; Genshin partly, see above).
- `node tools/duo.mjs` — two-player flow (lobby, sync, blocks, revive, goal, next world). Flaky on a busy machine.
- `node tools/flow.mjs`, `node tools/mechanics.mjs` — solo, must stay green.
- Ideas for more automation: LoL/Valorant/RDR2 sections in `teamwork.mjs` using the same helpers.
