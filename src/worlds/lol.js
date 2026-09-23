import Phaser from 'phaser';
import { makeCanvas, rng, fbm, vGradient, glow, addTexture, poly, ridge, mix } from '../art/util.js';
import { paintSmoothTerrain, capBand, speckle, wave } from '../art/terrain.js';
import { TILE, TOP, ROWS } from '../levels.js';

// Summoner's Rift — mossy stone lanes, jungle canopy, hextech-blue light,
// turrets along the lane and the enemy Nexus at the end.

const GOLD = '#c8aa6e', GOLD_DK = '#785a28', HEX = '#0ac8b9', HEX_HI = '#9ffcf1';
const C = {
  moss: '#2f7a4c', mossHi: '#5fc083', mossDk: '#1c4f36',
  stoneTop: '#5f6b73', stoneDeep: '#262c34', mortar: 'rgba(10,14,20,0.45)',
};

function turret(ctx, x, gy, s, col) {
  // stone base
  poly(ctx, [[x - 26 * s, gy], [x - 18 * s, gy - 40 * s], [x + 18 * s, gy - 40 * s], [x + 26 * s, gy]], col.stone);
  // tapering body with metal plates
  poly(ctx, [[x - 16 * s, gy - 40 * s], [x - 9 * s, gy - 120 * s], [x + 9 * s, gy - 120 * s], [x + 16 * s, gy - 40 * s]], col.metal);
  ctx.fillStyle = col.trim;
  ctx.fillRect(x - 17 * s, gy - 44 * s, 34 * s, 5 * s);
  ctx.fillRect(x - 12 * s, gy - 86 * s, 24 * s, 4 * s);
  // claws holding the orb
  poly(ctx, [[x - 20 * s, gy - 118 * s], [x - 9 * s, gy - 122 * s], [x - 4 * s, gy - 150 * s]], col.trim);
  poly(ctx, [[x + 20 * s, gy - 118 * s], [x + 9 * s, gy - 122 * s], [x + 4 * s, gy - 150 * s]], col.trim);
  glow(ctx, x, gy - 136 * s, 30 * s, col.orb, 0.8);
  ctx.fillStyle = col.orbCore; ctx.beginPath(); ctx.arc(x, gy - 136 * s, 8 * s, 0, Math.PI * 2); ctx.fill();
}

function jungleTree(ctx, x, gy, s, col, r) {
  ctx.fillStyle = col.trunk;
  ctx.beginPath();
  ctx.moveTo(x - 16 * s, gy); ctx.bezierCurveTo(x - 4 * s, gy - 60 * s, x - 22 * s, gy - 110 * s, x - 6 * s, gy - 170 * s);
  ctx.lineTo(x + 6 * s, gy - 170 * s); ctx.bezierCurveTo(x + 2 * s, gy - 110 * s, x + 20 * s, gy - 60 * s, x + 18 * s, gy);
  ctx.fill();
  for (let i = 0; i < 9; i++) {
    const a = r() * Math.PI - Math.PI;
    const d = 30 + r() * 50;
    ctx.fillStyle = i % 3 === 0 ? col.leafHi : col.leaf;
    ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * d * s, gy - 175 * s + Math.sin(a) * d * 0.5 * s, (40 + r() * 25) * s, (22 + r() * 12) * s, r() - 0.5, 0, Math.PI * 2); ctx.fill();
  }
}

function ruinArch(ctx, x, gy, s, col) {
  ctx.fillStyle = col.stone;
  ctx.fillRect(x - 60 * s, gy - 130 * s, 24 * s, 130 * s);
  ctx.fillRect(x + 36 * s, gy - 130 * s, 24 * s, 130 * s);
  ctx.beginPath(); ctx.moveTo(x - 64 * s, gy - 130 * s); ctx.quadraticCurveTo(x, gy - 200 * s, x + 64 * s, gy - 130 * s);
  ctx.lineTo(x + 64 * s, gy - 150 * s); ctx.quadraticCurveTo(x, gy - 225 * s, x - 64 * s, gy - 150 * s); ctx.fill();
  ctx.fillStyle = col.trim;
  ctx.fillRect(x - 62 * s, gy - 132 * s, 28 * s, 4 * s); ctx.fillRect(x + 34 * s, gy - 132 * s, 28 * s, 4 * s);
  glow(ctx, x, gy - 172 * s, 16 * s, col.rune, 0.9);
}

function nexus(ctx, x, gy, s, col) {
  poly(ctx, [[x - 90 * s, gy], [x - 70 * s, gy - 30 * s], [x + 70 * s, gy - 30 * s], [x + 90 * s, gy]], col.stone);
  poly(ctx, [[x - 60 * s, gy - 30 * s], [x - 40 * s, gy - 60 * s], [x + 40 * s, gy - 60 * s], [x + 60 * s, gy - 30 * s]], col.stone2);
  glow(ctx, x, gy - 140 * s, 110 * s, col.glow, 0.55);
  poly(ctx, [[x, gy - 230 * s], [x + 34 * s, gy - 140 * s], [x, gy - 62 * s], [x - 34 * s, gy - 140 * s]], col.crystal);
  poly(ctx, [[x, gy - 230 * s], [x, gy - 62 * s], [x - 34 * s, gy - 140 * s]], col.crystalHi);
  [[-60, -120], [60, -120]].forEach(([dx, dy]) => {
    poly(ctx, [[x + dx * s, gy + (dy - 40) * s], [x + (dx + 10) * s, gy + dy * s], [x + dx * s, gy + (dy + 30) * s], [x + (dx - 10) * s, gy + dy * s]], col.crystal);
  });
}

// ------------------------------------------------------------- sprites
function shroomTexture() {
  // Teemo's Noxious Trap
  const { canvas, ctx } = makeCanvas(64, 64);
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(32, 61, 22, 4, 0, 0, Math.PI * 2); ctx.fill();
  poly(ctx, [[25, 62], [27, 40], [37, 40], [39, 62]], '#e7dcc0');
  ctx.fillStyle = '#c9b996'; ctx.fillRect(33, 42, 5, 20);
  ctx.fillStyle = '#7a2f5c';
  ctx.beginPath(); ctx.ellipse(32, 38, 27, 17, 0, Math.PI, 0); ctx.fill();
  ctx.beginPath(); ctx.ellipse(32, 38, 27, 6, 0, 0, Math.PI); ctx.fill();
  ctx.fillStyle = '#b04a86';
  ctx.beginPath(); ctx.ellipse(28, 32, 20, 11, -0.1, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#e8f07a';
  [[20, 30, 4], [33, 25, 5], [44, 32, 3.5], [27, 36, 2.5], [40, 37, 2.5]].forEach(([x, y, r]) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); });
  return canvas;
}

function brushTexture(seed) {
  const { canvas, ctx } = makeCanvas(110, 70);
  const r = rng(seed);
  for (let i = 0; i < 26; i++) {
    const bx = 8 + r() * 94, h = 30 + r() * 38, lean = (r() - 0.5) * 30;
    ctx.fillStyle = i % 4 === 0 ? '#6fd39b' : i % 2 ? '#2f8a5b' : '#3fa56e';
    ctx.beginPath(); ctx.moveTo(bx - 5, 70); ctx.quadraticCurveTo(bx + lean * 0.3, 70 - h * 0.6, bx + lean, 70 - h); ctx.quadraticCurveTo(bx + lean * 0.2 + 3, 70 - h * 0.5, bx + 5, 70); ctx.fill();
  }
  return canvas;
}

function wardTexture(on) {
  const { canvas, ctx } = makeCanvas(44, 90);
  ctx.fillStyle = '#3b3326'; ctx.fillRect(19, 40, 6, 50);
  poly(ctx, [[10, 44], [22, 8], [34, 44]], on ? '#e6c24b' : '#6b6452');
  poly(ctx, [[22, 8], [34, 44], [22, 40]], on ? '#b8922c' : '#565042');
  ctx.fillStyle = on ? '#fff6b0' : '#8a8472';
  ctx.beginPath(); ctx.ellipse(22, 28, 5, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = on ? '#2a2210' : '#4a4436'; ctx.beginPath(); ctx.arc(22, 28, 2.4, 0, Math.PI * 2); ctx.fill();
  return canvas;
}

function nexusSprite(on) {
  const { canvas, ctx } = makeCanvas(240, 280);
  nexus(ctx, 120, 280, 1, {
    stone: '#4a4f5c', stone2: '#5d6372',
    glow: on ? '#ff4f5e' : '#6b2a36',
    crystal: on ? '#d8323f' : '#6a2a33', crystalHi: on ? '#ff8a8a' : '#8a4a52',
  });
  ctx.fillStyle = GOLD;
  ctx.fillRect(40, 248, 160, 5);
  return canvas;
}

export default {
  key: 'lol',
  name: 'LEAGUE OF LEGENDS',
  blurb: "Summoner's Rift · Mid Lane",
  accent: '#c8aa6e',
  pixel: false,
  dustTint: 0xbfeee0,
  goalHint: 'THE ENEMY NEXUS IS EXPOSED!',
  clearText: 'VICTORY',

  paintSky(ctx, W, H) {
    vGradient(ctx, 0, 0, W, H, [[0, '#07121f'], [0.4, '#0f2c3d'], [0.7, '#1f5a5c'], [1, '#3c8a74']]);
    const r = rng(9);
    for (let i = 0; i < 120; i++) {
      ctx.fillStyle = `rgba(210,255,250,${0.2 + r() * 0.6})`;
      const s = r() < 0.9 ? 1.5 : 2.5;
      ctx.fillRect(r() * W, r() * H * 0.55, s, s);
    }
    // aurora-like hextech glow
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const g = ctx.createLinearGradient(0, 60 + i * 50, 0, 200 + i * 50);
      g.addColorStop(0, 'rgba(10,200,185,0)'); g.addColorStop(0.5, `rgba(10,200,185,${0.12 - i * 0.03})`); g.addColorStop(1, 'rgba(10,200,185,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(0, 120 + i * 40);
      for (let x = 0; x <= W; x += 20) ctx.lineTo(x, 110 + i * 50 + Math.sin(x * 0.006 + i) * 40);
      ctx.lineTo(W, 260 + i * 50); ctx.lineTo(0, 260 + i * 50); ctx.fill();
    }
    ctx.restore();
    glow(ctx, 260, 110, 70, '#e8fffb', 0.35);
    ctx.fillStyle = '#e8fffb'; ctx.beginPath(); ctx.arc(260, 110, 30, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(15,44,61,0.9)'; ctx.beginPath(); ctx.arc(272, 102, 27, 0, Math.PI * 2); ctx.fill();
  },

  layers() {
    return [
      {
        // far cliffs and the enemy base glow
        factor: 0.12, top: 180, height: 420,
        paint(ctx, x0, x1, width) {
          ridge(ctx, x0, x1, 420, (x) => 150 - fbm(x * 0.003, 3) * 110, '#16384a');
          const nx = width * 0.8;
          glow(ctx, nx, 150, 160, '#ff4f5e', 0.18);
          nexus(ctx, nx, 240, 0.6, { stone: '#1c3342', stone2: '#23404f', glow: '#ff5060', crystal: '#7a3345', crystalHi: '#9a4a5a' });
          ridge(ctx, x0, x1, 420, (x) => 230 - fbm(x * 0.005, 8) * 70, '#1a4450');
        },
      },
      {
        // lane: turrets, ruins, jungle
        factor: 0.3, top: 150, height: 450,
        paint(ctx, x0, x1, width) {
          const ground = (x) => 330 - fbm(x * 0.004, 21) * 30;
          const pos = rng(14);
          const treeCol = { trunk: '#1d2a26', leaf: '#1f5a48', leafHi: '#2d7a5e' };
          for (let x = 40, i = 0; x < width; x += 140 + pos() * 180, i++) {
            if (x < x0 - 200 || x > x1 + 200) continue;
            const tr = rng(900 + i);
            jungleTree(ctx, x, ground(x) + 10, 0.8 + tr() * 0.5, treeCol, tr);
          }
          const col = { stone: '#2f4550', metal: '#3d5561', trim: '#8f7a4e', orb: '#3fe0ff', orbCore: '#d8fbff', rune: '#3fe0ff' };
          [0.15, 0.5].forEach((f) => { const x = width * f; if (x > x0 - 200 && x < x1 + 200) turret(ctx, x, ground(x) + 10, 1.1, col); });
          [0.33, 0.72].forEach((f) => { const x = width * f; if (x > x0 - 200 && x < x1 + 200) ruinArch(ctx, x, ground(x) + 10, 0.9, col); });
          ridge(ctx, x0, x1, 450, ground, '#1b4a3e');
          ctx.globalCompositeOperation = 'source-atop';
          ctx.fillStyle = 'rgba(20,70,80,0.35)'; ctx.fillRect(x0, 0, x1 - x0, 450);
          ctx.globalCompositeOperation = 'source-over';
        },
      },
      {
        // nearer jungle wall with glowing plants
        factor: 0.55, top: 260, height: 460,
        paint(ctx, x0, x1, width) {
          const ground = (x) => 250 - fbm(x * 0.006, 33) * 70;
          const pos = rng(44);
          const treeCol = { trunk: '#2a2a24', leaf: '#23654a', leafHi: '#3c8f64' };
          for (let x = 100, i = 0; x < width; x += 260 + pos() * 300, i++) {
            if (x < x0 - 250 || x > x1 + 250) continue;
            jungleTree(ctx, x, ground(x) + 20, 1.3, treeCol, rng(1100 + i));
          }
          ridge(ctx, x0, x1, 460, ground, '#1f5c45');
          for (let x = Math.floor(x0 / 38) * 38 - 38; x < x1 + 38; x += 38) {
            const gy = ground(x) + 4;
            if (rng(x)() < 0.35) { glow(ctx, x, gy - 10, 14, '#7ff2ff', 0.55); ctx.fillStyle = '#b8fff8'; ctx.beginPath(); ctx.arc(x, gy - 10, 3, 0, Math.PI * 2); ctx.fill(); }
          }
        },
      },
    ];
  },

  pitFill(ctx, x0, x1) {
    // the river that splits the map
    vGradient(ctx, x0, 110, x1 - x0, 90, [[0, '#3aa6b8'], [0.4, '#1f6f8a'], [1, '#0e3550']]);
    ctx.fillStyle = 'rgba(180,255,250,0.5)';
    const r = rng(12);
    for (let x = x0; x < x1; x += 34) ctx.fillRect(x + r() * 20, 116 + r() * 60, 10 + r() * 30, 2);
    ctx.fillStyle = '#9ffcf1'; ctx.fillRect(x0, 110, x1 - x0, 2);
  },

  paintTerrain(ctx, level, x0, x1) {
    paintSmoothTerrain(ctx, level, x0, x1, {
      radius: 10,
      edgeLight: 'rgba(160,230,220,0.18)',
      edgeDark: 'rgba(0,0,0,0.45)',
      fill(ctx, x, y, c, r, depth) {
        const t0 = Math.min(1, depth / 2.5), t1 = Math.min(1, (depth + 1) / 2.5);
        const g = ctx.createLinearGradient(0, y, 0, y + TILE);
        g.addColorStop(0, mix(C.stoneTop, C.stoneDeep, t0)); g.addColorStop(1, mix(C.stoneTop, C.stoneDeep, t1));
        ctx.fillStyle = g; ctx.fillRect(x, y, TILE, TILE);
        // cut stone blocks, staggered by row
        ctx.strokeStyle = C.mortar; ctx.lineWidth = 3;
        const off = (r % 2) * 32;
        ctx.beginPath(); ctx.moveTo(x, y + 32); ctx.lineTo(x + TILE, y + 32); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + off, y); ctx.lineTo(x + off, y + 32); ctx.moveTo(x + ((off + 32) % 64), y + 32); ctx.lineTo(x + ((off + 32) % 64), y + 64); ctx.stroke();
        speckle(ctx, x, y, TILE, TILE, 5, ['rgba(120,200,160,0.18)', 'rgba(0,0,0,0.18)'], c * 57 + r, [2, 7]);
      },
      block(ctx, x, y, c, r, info) {
        // ruin pillar with gold filigree
        const g = ctx.createLinearGradient(x, 0, x + TILE, 0);
        g.addColorStop(0, '#6d7a86'); g.addColorStop(1, '#3a434e');
        ctx.fillStyle = g; ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = GOLD_DK; ctx.fillRect(x + 6, y, 4, TILE); ctx.fillRect(x + TILE - 10, y, 4, TILE);
        if (info.top) { ctx.fillStyle = GOLD; ctx.fillRect(x - 3, y, TILE + 6, 8); ctx.fillStyle = '#f0e6d2'; ctx.fillRect(x - 3, y, TILE + 6, 2); }
        if (!info.top && !info.bottom) { glow(ctx, x + 32, y + 32, 18, HEX, 0.7); ctx.strokeStyle = HEX_HI; ctx.lineWidth = 2; ctx.strokeRect(x + 24, y + 24, 16, 16); }
        if (info.bottom || r === ROWS - 1) { ctx.fillStyle = GOLD_DK; ctx.fillRect(x - 2, y + TILE - 8, TILE + 4, 8); }
        if (info.top && info.bottom) { glow(ctx, x + 32, y + 36, 16, HEX, 0.7); ctx.fillStyle = HEX_HI; ctx.fillRect(x + 28, y + 30, 8, 12); }
      },
      top(ctx, x, y, lo, ro) {
        capBand(ctx, x, y - 2, TILE, 22, lo, ro, C.mossDk, { amp: 9, seed: 4, ext: 7 });
        capBand(ctx, x, y - 4, TILE, 14, lo, ro, C.moss, { amp: 6, seed: 5, ext: 5 });
        capBand(ctx, x, y - 4, TILE, 4, lo, ro, C.mossHi, { amp: 2, seed: 6, ext: 3 });
      },
      plat(ctx, x, y, le, re) {
        const g = ctx.createLinearGradient(0, y, 0, y + 22);
        g.addColorStop(0, '#7d8994'); g.addColorStop(1, '#3a434e');
        ctx.fillStyle = g; ctx.fillRect(x, y, TILE, 22);
        ctx.fillStyle = GOLD; ctx.fillRect(x, y, TILE, 4);
        ctx.fillStyle = GOLD_DK; ctx.fillRect(x, y + 18, TILE, 4);
        glow(ctx, x + 32, y + 12, 10, HEX, 0.8);
        ctx.fillStyle = HEX_HI; ctx.fillRect(x + 30, y + 9, 4, 6);
        if (le) { poly(ctx, [[x, y], [x + 10, y + 22], [x, y + 22]], GOLD_DK); }
        if (re) { poly(ctx, [[x + TILE, y], [x + TILE - 10, y + 22], [x + TILE, y + 22]], GOLD_DK); }
      },
    });
  },

  decorate(scene, level, add) {
    for (let i = 0; i < 3; i++) addTexture(scene, 'w_lol_brush' + i, brushTexture(i + 1));
    const r = rng(19);
    const busy = new Set(level.ents.hazards.map((h) => h.c));
    if (level.ents.goal) [-2, -1, 0, 1, 2].forEach((d) => busy.add(level.ents.goal.c + d));
    level.ents.checkpoints.forEach((k) => busy.add(k.c));
    for (let c = 0; c < level.cols; c++) for (let row = 1; row < ROWS; row++) {
      if (level.at(c, row) !== '#' || level.at(c, row - 1) !== '.' || busy.has(c)) continue;
      const x = c * TILE, y = TOP + row * TILE;
      if (r() < 0.3) add('w_lol_brush' + Math.floor(r() * 3), x + 32, y + 8, { depth: 6, sway: 2 });
    }
  },

  hazard(scene, h) {
    if (!scene.textures.exists('w_lol_shroom')) addTexture(scene, 'w_lol_shroom', shroomTexture());
    const x = h.x + TILE / 2, y = h.y + TILE + 2;
    const img = scene.add.image(x, y, 'w_lol_shroom').setOrigin(0.5, 1).setDepth(4);
    scene.tweens.add({ targets: img, scaleY: 0.94, scaleX: 1.04, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    scene.add.particles(x, y - 30, 'fx-dot', {
      lifespan: 1400, frequency: 260, speedY: { min: -30, max: -10 }, speedX: { min: -12, max: 12 },
      scale: { start: 0.25, end: 0.7 }, alpha: { start: 0.35, end: 0 }, tint: 0x8fe060, x: { min: -14, max: 14 },
    }).setDepth(5);
    return { x: h.x + 12, y: h.y + 26, w: TILE - 24, h: TILE - 26 };
  },

  ambient(scene) {
    scene.add.particles(0, 0, 'fx-dot', {
      x: { min: 0, max: 1280 }, y: { min: 120, max: 680 }, lifespan: 5000, speedX: { min: -12, max: 12 }, speedY: { min: -26, max: -6 },
      scale: { start: 0.05, end: 0.2 }, alpha: { start: 0, end: 0.9 }, frequency: 120, tint: [0x7ff2ff, 0x0ac8b9, 0xf0e6d2], blendMode: 'ADD',
    }).setScrollFactor(0).setDepth(25);
  },

  checkpoint(scene, k) {
    if (!scene.textures.exists('w_lol_ward0')) { addTexture(scene, 'w_lol_ward0', wardTexture(false)); addTexture(scene, 'w_lol_ward1', wardTexture(true)); }
    const img = scene.add.image(k.x, k.y + 4, 'w_lol_ward0').setOrigin(0.5, 1).setDepth(7);
    const light = scene.add.image(k.x, k.y - 58, 'fx-dot').setScale(5).setTint(0xffe27a).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD).setDepth(6);
    const ring = scene.add.ellipse(k.x, k.y, 20, 6, 0xffe27a, 0).setStrokeStyle(2, 0xffe27a, 0.8).setDepth(6).setVisible(false);
    return {
      activate() {
        img.setTexture('w_lol_ward1');
        scene.tweens.add({ targets: light, alpha: 0.6, duration: 300 });
        ring.setVisible(true);
        scene.tweens.add({ targets: ring, width: 260, height: 60, alpha: 0, duration: 900, repeat: -1 });
      },
    };
  },

  goal(scene, gl) {
    addTexture(scene, 'w_lol_nexus0', nexusSprite(false));
    addTexture(scene, 'w_lol_nexus1', nexusSprite(true));
    const img = scene.add.image(gl.x + 20, gl.y + 4, 'w_lol_nexus0').setOrigin(0.5, 1).setDepth(-2);
    const shield = scene.add.ellipse(gl.x + 20, gl.y - 120, 250, 260, 0x3fb8ff, 0.18).setStrokeStyle(3, 0x9fe8ff, 0.7).setDepth(-1);
    scene.tweens.add({ targets: shield, alpha: 0.6, duration: 1000, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    const glowImg = scene.add.image(gl.x + 20, gl.y - 140, 'fx-dot').setScale(9).setTint(0xff4f5e).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD).setDepth(-3);
    return {
      zone: { x: gl.x - 70, y: gl.y - 240, w: 180, h: 240 },
      activate() {
        img.setTexture('w_lol_nexus1');
        scene.tweens.killTweensOf(shield);
        scene.tweens.add({ targets: shield, scale: 1.4, alpha: 0, duration: 600, onComplete: () => shield.destroy() });
        scene.tweens.add({ targets: glowImg, alpha: 0.5, duration: 800 });
      },
      celebrate() {
        const flash = scene.add.image(gl.x + 20, gl.y - 140, 'fx-dot').setScale(2).setTint(0xfff3c4).setBlendMode(Phaser.BlendModes.ADD).setDepth(50);
        scene.tweens.add({ targets: flash, scale: 40, alpha: 0, duration: 900 });
        scene.tweens.add({ targets: img, alpha: 0, scaleY: 0.2, duration: 700, delay: 200 });
        const burst = scene.add.particles(gl.x + 20, gl.y - 140, 'fx-star', {
          speed: { min: 200, max: 500 }, lifespan: 900, scale: { start: 1, end: 0 }, tint: [0xff4f5e, 0xc8aa6e, 0xffffff], blendMode: 'ADD', emitting: false,
        }).setDepth(49);
        burst.explode(50);
        const t = scene.add.text(640, 260, 'VICTORY', { fontFamily: '"Press Start 2P"', fontSize: '64px', color: '#f0e6d2', stroke: '#785a28', strokeThickness: 10 })
          .setOrigin(0.5).setScrollFactor(0).setDepth(300).setAlpha(0).setScale(1.6);
        scene.tweens.add({ targets: t, alpha: 1, scale: 1, duration: 400, ease: 'Back.out' });
      },
    };
  },

  post(scene) {
    const { canvas, ctx } = makeCanvas(1280, 720);
    const g = ctx.createRadialGradient(640, 360, 250, 640, 360, 800);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,10,20,0.6)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 1280, 720);
    addTexture(scene, 'w_lol_vig', canvas);
    scene.add.image(0, 0, 'w_lol_vig').setOrigin(0).setScrollFactor(0).setDepth(45);
  },
};
