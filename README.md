# Zey's Sweet Quest 🦝🍫

A birthday platformer: a raccoon crosses five worlds — Minecraft, Genshin Impact,
League of Legends, Valorant and Red Dead Redemption 2 — collecting 3 franui in each.

Built with [Phaser 3](https://phaser.io) + [Vite](https://vitejs.dev). All art except the
Minecraft block textures is painted in code at startup (`src/worlds/*.js`, `src/art/`).

## Run locally

```sh
npm install
npm run dev        # game on http://localhost:5173 + duo relay on :8787
npm run dev -- --host   # same, reachable from a phone on your Wi-Fi
```

Dev-only URL params: `?world=0..4` jumps into a world, `&x=40` spawns at column 40,
`&debug` shows physics boxes.

## Duo (online co-op)

Title screen → **Duo online**: one player creates a room and sends the 4-letter code or invite
link, the other joins. One plays the raccoon, the other the cat.

Players connect through our own small WebSocket relay (`server/relay.mjs`), which `npm run dev`
starts for you. It reconnects by itself after network drops. Locally, any browsers on this PC (or
a phone on the same Wi-Fi with `--host`) can play together; over the internet, deploy it (below).

## Deploy to a Hetzner server (game + relay)

One small server hosts both the game and the relay, with automatic HTTPS (Caddy).

1. In the Hetzner console, create a server: Ubuntu 24.04, the smallest type (CX22 or similar) is plenty.
   Add your SSH key when creating it. Note its IPv4 address.
2. Pick a domain: your own domain with an A record pointing at the IP, or without one use
   `<ip-with-dashes>.sslip.io` (e.g. `49-12-34-56.sslip.io`).
3. From this folder (Git Bash): `bash deploy/deploy.sh root@<ip> <domain>`
   It builds the game, uploads `dist/`, `server/` and `deploy/`, installs Node + Caddy,
   and starts the relay as a service. Run the same command again to publish updates.
4. Open `https://<domain>`. Invite links look like `https://<domain>/?room=ABCD`.

The relay is served at `wss://<domain>/relay`, which the game finds by itself. If you host the game
somewhere else (e.g. Vercel), set `VITE_RELAY_URL=wss://<domain>/relay` there.

## Layout

- `src/levels.js` – level layouts (builder API: `ground`, `plat`, `block`, `haz`, …)
- `src/worlds/<world>.js` – each world's sky, parallax layers, terrain, hazards, goal, effects
- `src/scenes/GameScene.js` – physics, player controller, camera, collectibles
- `src/art/sprites.js` – the raccoon (vector → pixel-art pipeline) and franui
- `src/ui.js`, `src/style.css` – title / HUD / world-clear / finale screens
- `src/mechanics.js` – secrets, timed doors, carriers, wind, set-piece triggers, enemies
- `src/player.js`, `src/duo.js`, `src/net.js` – player controller, duo sync, networking
- `src/sfx.js`, `src/tracks.js` – synthesized sound effects and per-world music
- `server/relay.mjs`, `deploy/` – duo relay server and the Hetzner setup
- `tools/` – headless-browser test scripts (`flow`, `mechanics`, `duo`, `relay-drop`, `tour`); dev server on port 5199
