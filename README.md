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

## Deploy to Vercel

Push the repo to GitHub, then "Add New → Project" on vercel.com and import it.
Vercel detects Vite automatically (build: `npm run build`, output: `dist`).

## Layout

- `src/levels.js` – level layouts (builder API: `ground`, `plat`, `block`, `haz`, …)
- `src/worlds/<world>.js` – each world's sky, parallax layers, terrain, hazards, goal, effects
- `src/scenes/GameScene.js` – physics, player controller, camera, collectibles
- `src/art/sprites.js` – the raccoon (vector → pixel-art pipeline) and franui
- `src/ui.js`, `src/style.css` – title / HUD / world-clear / finale screens
- `tools/` – headless-Chrome screenshot and full-playthrough test scripts
