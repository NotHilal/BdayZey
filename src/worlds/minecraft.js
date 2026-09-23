import Phaser from 'phaser';
import { makeCanvas, rng, fbm, vGradient, glow, addTexture } from '../art/util.js';
import { TILE, TOP, ROWS } from '../levels.js';

// Real Minecraft block textures (16x16), drawn at 4x so one block = one tile.
const TEX = [
  'grass_block_top', 'grass_block_side', 'dirt', 'stone', 'cobblestone', 'oak_planks', 'oak_log',
  'oak_leaves', 'birch_log', 'birch_leaves', 'coal_ore', 'iron_ore', 'diamond_ore', 'gold_ore',
  'obsidian', 'torch', 'poppy', 'dandelion', 'short_grass', 'tall_grass_top', 'tall_grass_bottom',
  'cornflower', 'oxeye_daisy', 'glowstone', 'crafting_table_front', 'bookshelf', 'sun', 'clouds', 'creeper',
];
const GRASS = '#91bd59';
const FOLIAGE = '#77ab2f';
const BIRCH = '#80a755';
const PX = 4; // screen px per texel

let T = {}; // texture name -> canvas/image (tinted where needed)

function tint(img, color) {
  const { canvas, ctx } = makeCanvas(img.width, img.height);
  ctx.drawImage(img, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, img.width, img.height);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(img, 0, 0);
  return canvas;
}

function blit(ctx, name, x, y, scale = PX, alpha = 1) {
  const img = T[name];
  ctx.imageSmoothingEnabled = false;
  if (alpha !== 1) ctx.globalAlpha = alpha;
  ctx.drawImage(img, 0, 0, 16, 16, Math.round(x), Math.round(y), 16 * scale, 16 * scale);
  if (alpha !== 1) ctx.globalAlpha = 1;
}

// Minecraft-style directional shading for faces seen from the side.
function shade(ctx, x, y, w, h, a) {
  ctx.fillStyle = `rgba(0,0,0,${a})`;
  ctx.fillRect(x, y, w, h);
}

function oakTree(ctx, x, groundY, scale, r, birch = false) {
  const b = 16 * scale;
  const trunkH = 4 + Math.floor(r() * 2);
  for (let i = 1; i <= trunkH; i++) blit(ctx, birch ? 'birch_log' : 'oak_log', x, groundY - i * b, scale);
  const top = groundY - trunkH * b;
  const leaves = birch ? 'birch_leaves' : 'oak_leaves';
  // canopy: 5 wide x 2, then 3 wide x 2 (classic oak shape, side view)
  const rows = [[-2, 2, 1], [-2, 2, 0], [-1, 1, -1], [-1, 1, -2]];
  for (const [a, bnd, dy] of rows) {
    for (let i = a; i <= bnd; i++) {
      // corners are randomly missing like real oaks
      if ((i === a || i === bnd) && dy <= -1 && r() < 0.5) continue;
      if ((i === a || i === bnd) && dy === 1 && r() < 0.25) continue;
      blit(ctx, leaves, x + i * b, top + (dy - 1) * b, scale);
    }
  }
}

export default {
  key: 'minecraft',
  name: 'MINECRAFT',
  blurb: 'Overworld · Plains',
  accent: '#7fd34e',
  hudBg: 'rgba(24,18,12,.72)',

  preload(scene) {
    TEX.forEach((n) => { if (!scene.textures.exists('mc_' + n)) scene.load.image('mc_' + n, `assets/mc/${n}.png`); });
    if (!scene.textures.exists('mc_lava')) scene.load.spritesheet('mc_lava', 'assets/mc/lava_still.png', { frameWidth: 16, frameHeight: 16 });
    if (!scene.textures.exists('mc_portal')) scene.load.spritesheet('mc_portal', 'assets/mc/nether_portal.png', { frameWidth: 16, frameHeight: 16 });
  },

  setup(scene) {
    T = {};
    TEX.forEach((n) => { T[n] = scene.textures.get('mc_' + n).getSourceImage(); });
    T.grass_block_top = tint(T.grass_block_top, GRASS);
    T.oak_leaves = tint(T.oak_leaves, FOLIAGE);
    T.birch_leaves = tint(T.birch_leaves, BIRCH);
    T.short_grass = tint(T.short_grass, GRASS);
    T.tall_grass_top = tint(T.tall_grass_top, GRASS);
    T.tall_grass_bottom = tint(T.tall_grass_bottom, GRASS);
    ['mc_lava', 'mc_portal', 'mc_torch'].forEach((k) => scene.textures.get(k).setFilter(Phaser.Textures.FilterMode.NEAREST));
    if (!scene.anims.exists('mc-lava')) scene.anims.create({ key: 'mc-lava', frames: scene.anims.generateFrameNumbers('mc_lava', { frames: [...Array(20).keys(), ...[...Array(18).keys()].reverse().map((i) => i + 1)] }), frameRate: 10, repeat: -1 });
    if (!scene.anims.exists('mc-portal')) scene.anims.create({ key: 'mc-portal', frames: scene.anims.generateFrameNumbers('mc_portal', { start: 0, end: 31 }), frameRate: 16, repeat: -1 });
  },

  paintSky(ctx, W, H) {
    vGradient(ctx, 0, 0, W, H, [[0, '#6f9cf5'], [0.55, '#9fc3ff'], [0.8, '#c6dcff'], [1, '#d7e6ff']]);
    // the square sun (additive, like the game)
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(T.sun, 0, 0, 32, 32, 930, 36, 32 * 5, 32 * 5);
    ctx.globalCompositeOperation = 'source-over';
  },

  layers(level) {
    const r = rng(7);
    return [
      // flat blocky clouds sampled from the real clouds.png mask
      {
        factor: 0.08, top: 40, height: 140, nearest: true,
        paint(ctx, x0, x1) {
          const img = T.clouds;
          const tmp = makeCanvas(img.width, img.height);
          tmp.ctx.drawImage(img, 0, 0);
          const data = tmp.ctx.getImageData(0, 0, img.width, img.height).data;
          const cell = 20;
          ctx.fillStyle = 'rgba(255,255,255,0.92)';
          const bands = [[30, 20, 3], [120, 90, 2], [200, 40, 2]];
          for (const [row, yOff, thick] of bands) {
            for (let cx = Math.floor(x0 / cell); cx <= x1 / cell; cx++) {
              const px = ((cx % 256) + 256) % 256;
              if (data[(row * 256 + px) * 4 + 3] > 0) {
                ctx.fillRect(cx * cell, yOff, cell, 8 * thick);
                ctx.fillStyle = 'rgba(214,226,245,0.9)';
                ctx.fillRect(cx * cell, yOff + 8 * thick, cell, 6);
                ctx.fillStyle = 'rgba(255,255,255,0.92)';
              }
            }
          }
        },
      },
      // far mountains: blocky terrain fading into the sky
      {
        factor: 0.18, top: 120, height: 600, nearest: true,
        paint(ctx, x0, x1) {
          const b = 16; // 1 texel-per-px blocks, 16px each
          for (let x = Math.floor(x0 / b) * b; x < x1 + b; x += b) {
            const h = 170 + fbm(x * 0.004, 3) * 250;
            const top = Math.round((520 - h) / b) * b;
            ctx.fillStyle = '#8fb2d8';
            ctx.fillRect(x, top, b, 600 - top);
            ctx.fillStyle = '#a3c7a0';
            ctx.fillRect(x, top, b, 4);
            if (h > 330) { ctx.fillStyle = '#e8f0fa'; ctx.fillRect(x, top, b, 12); }
          }
        },
      },
      // mid hills with trees and a creeper, hazed
      {
        factor: 0.4, top: 150, height: 570, nearest: true,
        paint(ctx, x0, x1, width) {
          const b = 32; // half-size blocks in the distance
          const surf = (x) => Math.round((190 + fbm(x * 0.0022, 11) * 190) / b) * b;
          for (let x = Math.floor(x0 / b) * b; x < x1 + b; x += b) {
            const top = surf(x);
            blit(ctx, 'grass_block_side', x, top, 2);
            for (let y = top + b; y < 570; y += b) blit(ctx, 'dirt', x, y, 2);
          }
          const pos = rng(21);
          for (let tx = 60, i = 0; tx < width; tx += 180 + pos() * 260, i++) {
            const gx = Math.floor(tx / b) * b;
            if (gx < x0 - 200 || gx > x1 + 200) continue;
            const tr = rng(500 + i);
            oakTree(ctx, gx, surf(gx), 2, tr, tr() < 0.3);
          }
          // a creeper minding its business
          const cxp = Math.floor((width * 0.37) / b) * b;
          if (cxp > x0 - 100 && cxp < x1 + 100) {
            const cr = T.creeper, g = surf(cxp), s = 4;
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(cr, 4, 20, 4, 6, cxp, g - 6 * s, 4 * s, 6 * s);
            ctx.drawImage(cr, 4, 20, 4, 6, cxp + 4 * s, g - 6 * s, 4 * s, 6 * s);
            ctx.drawImage(cr, 20, 20, 8, 12, cxp, g - 18 * s, 8 * s, 12 * s);
            ctx.drawImage(cr, 8, 8, 8, 8, cxp, g - 26 * s, 8 * s, 8 * s);
          }
          // atmospheric haze
          ctx.globalCompositeOperation = 'source-atop';
          ctx.fillStyle = 'rgba(165,195,240,0.34)';
          ctx.fillRect(x0, 0, x1 - x0, 570);
          ctx.globalCompositeOperation = 'source-over';
        },
      },
    ];
  },

  paintTerrain(ctx, level, x0, x1) {
    const r = rng(99);
    const ores = [];
    for (let i = 0; i < 4000; i++) ores.push(r());
    ctx.imageSmoothingEnabled = false;
    const c0 = Math.max(0, Math.floor(x0 / TILE) - 1), c1 = Math.min(level.cols - 1, Math.ceil(x1 / TILE) + 1);
    for (let c = c0; c <= c1; c++) {
      let depth = 0;
      for (let row = 0; row < ROWS; row++) {
        const ch = level.at(c, row);
        const x = c * TILE, y = TOP + row * TILE;
        if (ch === '#') {
          const exposed = !level.solid(c, row - 1) && level.at(c, row - 1) !== '^';
          if (exposed) depth = 0; else depth++;
          const k = ores[(c * 13 + row * 7) % ores.length];
          if (depth === 0) blit(ctx, 'grass_block_side', x, y);
          else if (depth < 3) blit(ctx, 'dirt', x, y);
          else blit(ctx, k < 0.08 ? 'coal_ore' : k < 0.11 ? 'iron_ore' : k < 0.12 ? 'diamond_ore' : k < 0.125 ? 'gold_ore' : 'stone', x, y);
          // soft ambient occlusion from exposed edges
          if (!level.solid(c - 1, row) && level.at(c - 1, row) !== '^') shade(ctx, x, y, 8, TILE, 0.18);
          if (!level.solid(c + 1, row) && level.at(c + 1, row) !== '^') shade(ctx, x + TILE - 8, y, 8, TILE, 0.28);
          if (depth > 0) shade(ctx, x, y, TILE, TILE, Math.min(0.35, depth * 0.07));
        } else if (ch === 'B') {
          const k = ores[(c * 31 + row * 17) % ores.length];
          blit(ctx, k < 0.2 ? 'crafting_table_front' : k < 0.35 ? 'bookshelf' : 'cobblestone', x, y);
          shade(ctx, x, y + TILE - 6, TILE, 6, 0.3);
        } else if (ch === '-') {
          // oak slab (top half)
          ctx.drawImage(T.oak_planks, 0, 0, 16, 8, x, y, TILE, TILE / 2);
          shade(ctx, x, y + TILE / 2 - 4, TILE, 4, 0.35);
        }
      }
    }
  },

  decorate(scene, level, add) {
    const r = rng(5);
    const flowers = ['poppy', 'dandelion', 'cornflower', 'oxeye_daisy'];
    // flatten decorative canvases once
    const mk = (name) => {
      const key = 'w_mc_' + name;
      if (!scene.textures.exists(key)) addTexture(scene, key, T[name], true);
      return key;
    };
    const busy = new Set();
    level.ents.hazards.forEach((h) => { busy.add(h.c); });
    [level.ents.goal, ...level.ents.checkpoints].forEach((e) => e && busy.add(e.c));
    for (let c = 0; c < level.cols; c++) {
      for (let row = 1; row < ROWS; row++) {
        if (level.at(c, row) !== '#' || level.solid(c, row - 1) || level.at(c, row - 1) !== '.') continue;
        if (busy.has(c)) continue;
        const x = c * TILE, y = TOP + row * TILE;
        const k = r();
        if (k < 0.3) add(mk('short_grass'), x, y - TILE, { depth: 6, origin: [0, 0], scale: PX });
        else if (k < 0.42) add(mk(flowers[Math.floor(r() * flowers.length)]), x, y - TILE, { depth: 6, origin: [0, 0], scale: PX });
        else if (k < 0.47 && level.at(c, row - 2) === '.') {
          add(mk('tall_grass_bottom'), x, y - TILE, { depth: 6, origin: [0, 0], scale: PX });
          add(mk('tall_grass_top'), x, y - TILE * 2, { depth: 6, origin: [0, 0], scale: PX });
        }
      }
    }
    // full-size trees in the play plane (behind the raccoon)
    const treeCols = [5, 29, 88];
    treeCols.forEach((c, i) => {
      let row = 0;
      while (row < ROWS && !level.solid(c, row)) row++;
      const { canvas, ctx } = makeCanvas(TILE * 5, TILE * 8);
      oakTree(ctx, TILE * 2, TILE * 8, PX, rng(40 + i), i === 1);
      const key = 'w_mc_tree' + i;
      addTexture(scene, key, canvas, true);
      add(key, c * TILE - TILE * 2, TOP + row * TILE - TILE * 8, { depth: -5, origin: [0, 0] });
    });
  },

  hazard(scene, h, level) {
    // lava block: animated, sits a little lower than a full block like a source block
    const s = scene.add.sprite(h.x, h.y + 8, 'mc_lava').setOrigin(0, 0).setScale(PX).setDepth(4);
    s.play({ key: 'mc-lava', startFrame: (h.c * 3) % 20 });
    s.setCrop(0, 0, 16, 14);
    const surface = level.at(h.c, h.r - 1) !== '^';
    if (surface) {
      const g = scene.add.image(h.x + TILE / 2, h.y + 10, 'fx-dot').setDepth(3).setScale(4, 2.2).setTint(0xff7a1a).setAlpha(0.45).setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({ targets: g, alpha: 0.25, duration: 900 + Math.random() * 600, yoyo: true, repeat: -1 });
    }
    return { x: h.x + 6, y: h.y + 22, w: TILE - 12, h: TILE - 22 };
  },

  ambient(scene, level) {
    // lava embers popping from pits
    const lavaTops = level.ents.hazards.filter((h) => level.at(h.c, h.r - 1) !== '^');
    if (!lavaTops.length) return;
    const zone = {
      getRandomPoint(p) {
        const h = lavaTops[Math.floor(Math.random() * lavaTops.length)];
        p.x = h.x + Math.random() * TILE; p.y = h.y + 10;
        return p;
      },
    };
    scene.add.particles(0, 0, 'fx-px', {
      emitZone: { type: 'random', source: zone },
      lifespan: 1200, speedY: { min: -140, max: -60 }, speedX: { min: -20, max: 20 }, gravityY: 120,
      scale: { start: 1, end: 0.2 }, tint: [0xffd35a, 0xff8a1c, 0xff5a10], frequency: 90, blendMode: 'ADD',
    }).setDepth(5);
  },

  checkpoint(scene, k) {
    // a fence post with a torch that lights up
    const x = k.x, y = k.y;
    const g = scene.add.graphics().setDepth(7);
    g.fillStyle(0x6b4f2f, 1).fillRect(x - 6, y - 56, 12, 56);
    g.fillStyle(0x4b371f, 1).fillRect(x + 2, y - 56, 4, 56);
    g.fillStyle(0x8a6a3f, 1).fillRect(x - 14, y - 44, 28, 8);
    const torch = scene.add.image(x, y - 56, 'mc_torch').setOrigin(0.5, 1).setScale(PX).setDepth(8).setAlpha(0.35).setTint(0x777777);
    const light = scene.add.image(x, y - 80, 'fx-dot').setScale(5).setTint(0xffc45a).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD).setDepth(6);
    return {
      activate() {
        torch.setAlpha(1).clearTint();
        scene.tweens.add({ targets: light, alpha: 0.55, duration: 300 });
        scene.tweens.add({ targets: light, scale: 4.4, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      },
    };
  },

  goal(scene, gl) {
    // nether portal: 4x5 obsidian frame; lights up once every franui is found
    // bottom obsidian row replaces the ground blocks so you can walk straight in
    const left = gl.x - TILE * 1.5, bottom = gl.y + TILE;
    const cont = scene.add.container(0, 0).setDepth(-2);
    const obs = [];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) {
      if (i > 0 && i < 3 && j > 0 && j < 4) continue;
      obs.push(scene.add.image(left + i * TILE, bottom - (j + 1) * TILE, 'mc_obsidian').setOrigin(0, 0).setScale(PX));
    }
    scene.textures.get('mc_obsidian').setFilter(Phaser.Textures.FilterMode.NEAREST);
    cont.add(obs);
    const inner = [];
    for (let i = 1; i < 3; i++) for (let j = 1; j < 4; j++) {
      const s = scene.add.sprite(left + i * TILE, bottom - (j + 1) * TILE, 'mc_portal').setOrigin(0, 0).setScale(PX).setAlpha(0);
      s.play({ key: 'mc-portal', startFrame: (i + j * 5) % 32 });
      inner.push(s);
    }
    cont.add(inner);
    const glowS = scene.add.image(gl.x + TILE / 2, bottom - TILE * 2.5, 'fx-dot').setScale(14, 16).setTint(0xa040ff).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD).setDepth(-3);
    let parts = null;
    return {
      zone: { x: left + TILE, y: bottom - TILE * 4, w: TILE * 2, h: TILE * 3 + 4 },
      activate() {
        scene.tweens.add({ targets: inner, alpha: 0.9, duration: 700 });
        scene.tweens.add({ targets: glowS, alpha: 0.45, duration: 900 });
        parts = scene.add.particles(0, 0, 'fx-px', {
          x: { min: left + TILE, max: left + TILE * 3 }, y: { min: bottom - TILE * 4, max: bottom - TILE },
          lifespan: 1400, speedX: { min: -30, max: 30 }, speedY: { min: -40, max: 10 }, scale: { start: 1, end: 0 },
          tint: [0xc07bff, 0x7d2cff, 0xe2b8ff], frequency: 60, blendMode: 'ADD',
        }).setDepth(-1);
      },
      celebrate() {
        scene.tweens.add({ targets: glowS, alpha: 0.9, scaleX: 20, scaleY: 22, duration: 700 });
        if (parts) parts.frequency = 15;
      },
    };
  },

  post(scene) {},
};
