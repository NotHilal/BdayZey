# Zey's Sweet Quest 🦝🍫

A birthday platformer: a raccoon crosses five worlds — Minecraft, Genshin Impact,
League of Legends, Valorant and Red Dead Redemption 2 — collecting 3 franui in each.

Built with [Phaser 3](https://phaser.io) + [Vite](https://vitejs.dev). All art except the
Minecraft block textures is painted in code at startup (`src/worlds/*.js`, `src/art/`).

## Run locally

```sh
npm install
npm run dev        # http://localhost:5173
```

Dev-only URL params: `?world=0..4` jumps into a world, `&x=40` spawns at column 40,
`&debug` shows physics boxes.

## Duo (online co-op)

Title screen → **Duo online**: one player creates a room and sends the 4-letter code or invite
link, the other joins. One plays the raccoon, the other the cat.

Across devices this needs a free [Supabase](https://supabase.com) project (Realtime is on by default):

1. Create a project, then copy **Project URL** and the **anon public key** from Project Settings → API.
2. Copy `.env.example` to `.env.local` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. On Vercel, add the same two variables under Project → Settings → Environment Variables, then redeploy.

Without the keys, Duo runs in test mode: it only links tabs of the same browser.

## Deploy to Vercel

Push the repo to GitHub, then "Add New → Project" on vercel.com and import it.
Vercel detects Vite automatically (build: `npm run build`, output: `dist`).

## Layout

- `src/levels.js` – level layouts (builder API: `ground`, `plat`, `block`, `haz`, …)
- `src/worlds/<world>.js` – each world's sky, parallax layers, terrain, hazards, goal, effects
- `src/scenes/GameScene.js` – physics, player controller, camera, collectibles
- `src/art/sprites.js` – the raccoon (vector → pixel-art pipeline) and franui
- `src/ui.js`, `src/style.css` – title / HUD / world-clear / finale screens
- `src/mechanics.js` – secrets, timed doors, carriers, wind, set-piece triggers, enemies
- `src/player.js`, `src/duo.js`, `src/net.js` – player controller, duo sync, networking
- `src/sfx.js`, `src/tracks.js` – synthesized sound effects and per-world music
- `tools/` – headless-browser test scripts (`flow`, `mechanics`, `duo`, `tour`); dev server on port 5199
