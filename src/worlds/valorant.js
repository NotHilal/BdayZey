import Phaser from 'phaser';
import { makeCanvas, rng, fbm, vGradient, glow, cloud, addTexture, poly, ridge, mix } from '../art/util.js';
import { paintSmoothTerrain, capBand, speckle, wave } from '../art/terrain.js';
import { TILE, TOP, ROWS } from '../levels.js';

// Ascent — sunny Italian town, terracotta roofs, the floating island in the
// sky, crates on site, Brimstone's molly fires and the planted Spike.

let boxes = null;
const RED = '#ff4655', INK = '#0f1923', CREAM = '#ece8e1';
const C = {
  paveTop: '#e6dccb', paveEdge: '#b9ab94', stoneTop: '#d6bf98', stoneDeep: '#8a7156', mortar: 'rgba(90,64,40,0.35)',
};

function house(ctx, x, gy, w, h, col, r) {
  ctx.fillStyle = col.wall; ctx.fillRect(x, gy - h, w, h);
  ctx.fillStyle = col.wallShade; ctx.fillRect(x + w - 8, gy - h, 8, h);
  // terracotta roof
  poly(ctx, [[x - 6, gy - h], [x + w * 0.5, gy - h - w * 0.22], [x + w + 6, gy - h]], col.roof);
  ctx.fillStyle = col.roofDk; ctx.fillRect(x - 6, gy - h - 3, w + 12, 4);
  // windows with shutters
  const rows = Math.max(1, Math.floor((h - 30) / 42));
  const cols = Math.max(1, Math.floor(w / 34));
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const wx = x + 10 + i * ((w - 20) / cols) + ((w - 20) / cols - 14) / 2, wy = gy - h + 18 + j * 42;
    ctx.fillStyle = col.window;
    ctx.beginPath(); ctx.roundRect(wx, wy, 14, 22, [7, 7, 0, 0]); ctx.fill();
    ctx.fillStyle = col.shutter; ctx.fillRect(wx - 6, wy + 2, 5, 20); ctx.fillRect(wx + 15, wy + 2, 5, 20);
    if (r() < 0.3) { ctx.fillStyle = '#6fa347'; ctx.fillRect(wx - 3, wy + 20, 20, 5); ctx.fillStyle = '#e25c68'; ctx.fillRect(wx + 2, wy + 18, 3, 3); ctx.fillRect(wx + 10, wy + 18, 3, 3); }
  }
}

function campanile(ctx, x, gy, s, col) {
  ctx.fillStyle = col.wall; ctx.fillRect(x - 18 * s, gy - 230 * s, 36 * s, 230 * s);
  ctx.fillStyle = col.wallShade; ctx.fillRect(x + 10 * s, gy - 230 * s, 8 * s, 230 * s);
  ctx.fillStyle = col.dark;
  ctx.beginPath(); ctx.roundRect(x - 10 * s, gy - 210 * s, 20 * s, 30 * s, [10 * s, 10 * s, 0, 0]); ctx.fill();
  ctx.fillStyle = col.trim; ctx.fillRect(x - 22 * s, gy - 234 * s, 44 * s, 6 * s); ctx.fillRect(x - 20 * s, gy - 175 * s, 40 * s, 4 * s);
  poly(ctx, [[x - 20 * s, gy - 234 * s], [x, gy - 280 * s], [x + 20 * s, gy - 234 * s]], col.roof);
}

function cypress(ctx, x, gy, s, col) {
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.ellipse(x, gy - 50 * s, 11 * s, 52 * s, 0, 0, Math.PI * 2); ctx.fill();
}

function floatingIsland(ctx, x, y, s) {
  // hanging rock
  ctx.fillStyle = '#b89f86';
  ctx.beginPath(); ctx.moveTo(x - 170 * s, y);
  ctx.quadraticCurveTo(x - 120 * s, y + 70 * s, x - 30 * s, y + 150 * s);
  ctx.lineTo(x, y + 190 * s); ctx.lineTo(x + 30 * s, y + 140 * s);
  ctx.quadraticCurveTo(x + 130 * s, y + 70 * s, x + 180 * s, y); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#9d846c';
  ctx.beginPath(); ctx.moveTo(x + 10 * s, y); ctx.quadraticCurveTo(x + 120 * s, y + 70 * s, x + 30 * s, y + 140 * s); ctx.lineTo(x, y + 190 * s); ctx.lineTo(x + 180 * s, y); ctx.fill();
  // grass + town on top
  ctx.fillStyle = '#a7c78a'; ctx.fillRect(x - 172 * s, y - 6 * s, 354 * s, 10 * s);
  const col = { wall: '#f0e6d6', wallShade: '#dccdb6', roof: '#d0875f', roofDk: '#b8704c', window: '#9ab3c8', shutter: '#8fa98a' };
  const r = rng(2);
  [[-150, 50, 60], [-95, 40, 80], [-40, 60, 55], [30, 45, 70], [85, 55, 50], [130, 40, 60]].forEach(([dx, w, h]) => house(ctx, x + dx * s, y - 4 * s, w * s, h * s, col, r));
  campanile(ctx, x + 10 * s, y - 4 * s, 0.55 * s, { wall: '#f3eadb', wallShade: '#dccdb6', dark: '#8a9aa8', trim: '#e0d3be', roof: '#d0875f' });
}

// ---------------------------------------------------------------- sprites
function spikeTexture(armed) {
  const { canvas, ctx } = makeCanvas(90, 110);
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(45, 106, 36, 6, 0, 0, Math.PI * 2); ctx.fill();
  // base plates
  poly(ctx, [[12, 106], [20, 88], [70, 88], [78, 106]], '#3a414b');
  poly(ctx, [[20, 88], [26, 78], [64, 78], [70, 88]], '#56606d');
  // core cylinder
  const g = ctx.createLinearGradient(30, 0, 60, 0);
  g.addColorStop(0, '#6f7b88'); g.addColorStop(0.5, '#c9d2dc'); g.addColorStop(1, '#4f5864');
  ctx.fillStyle = g; ctx.fillRect(31, 20, 28, 60);
  ctx.fillStyle = '#2b313a'; ctx.fillRect(31, 36, 28, 4); ctx.fillRect(31, 60, 28, 4);
  // top cap
  poly(ctx, [[28, 20], [45, 4], [62, 20]], '#3a414b');
  // lights
  const lc = armed ? RED : '#3fe0c5';
  glow(ctx, 45, 50, 22, lc, 0.8);
  ctx.fillStyle = lc; ctx.fillRect(40, 44, 10, 12);
  ctx.fillRect(22, 92, 6, 4); ctx.fillRect(62, 92, 6, 4);
  return canvas;
}

function orbTexture(on) {
  const { canvas, ctx } = makeCanvas(60, 110);
  poly(ctx, [[14, 110], [20, 92], [40, 92], [46, 110]], '#4a525e');
  ctx.fillStyle = '#707a88'; ctx.fillRect(18, 88, 24, 5);
  const col = on ? '#6ff2d8' : '#8c96a5';
  glow(ctx, 30, 50, 28, col, on ? 0.85 : 0.35);
  poly(ctx, [[30, 26], [44, 50], [30, 74], [16, 50]], on ? '#39d9bd' : '#6d7785');
  poly(ctx, [[30, 26], [30, 74], [16, 50]], on ? '#b7fff1' : '#98a2b0');
  return canvas;
}

function crateTexture() {
  const { canvas, ctx } = makeCanvas(64, 64);
  ctx.fillStyle = '#c29a62'; ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#a57c48'; for (let i = 0; i < 4; i++) ctx.fillRect(0, 8 + i * 14, 64, 2);
  ctx.strokeStyle = '#6a4d2c'; ctx.lineWidth = 7; ctx.strokeRect(3.5, 3.5, 57, 57);
  ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(6, 58); ctx.lineTo(58, 6); ctx.stroke();
  ctx.fillStyle = '#e9d9b8'; ctx.fillRect(0, 0, 64, 2);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 60, 64, 4);
  return canvas;
}

function metalBoxTexture() {
  const { canvas, ctx } = makeCanvas(64, 64);
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, '#7f8b98'); g.addColorStop(1, '#4b5561');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#394250'; ctx.fillRect(0, 0, 64, 5); ctx.fillRect(0, 59, 64, 5); ctx.fillRect(0, 0, 5, 64); ctx.fillRect(59, 0, 5, 64);
  ctx.fillStyle = RED; ctx.fillRect(5, 24, 54, 8);
  ctx.fillStyle = CREAM; ctx.font = 'bold 11px sans-serif'; ctx.fillText('KINGDOM', 8, 50);
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(5, 5, 54, 2);
  return canvas;
}

function potTexture(seed) {
  const { canvas, ctx } = makeCanvas(56, 80);
  const r = rng(seed);
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = i % 2 ? '#5f9a3e' : '#7fbf52';
    ctx.beginPath(); ctx.ellipse(28 + (r() - 0.5) * 30, 26 + r() * 18, 10 + r() * 6, 6 + r() * 4, r() * 3, 0, Math.PI * 2); ctx.fill();
  }
  if (seed % 2) { ctx.fillStyle = '#ff7b8a'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(14 + r() * 28, 20 + r() * 20, 3, 0, Math.PI * 2); ctx.fill(); } }
  poly(ctx, [[10, 46], [46, 46], [40, 80], [16, 80]], '#c4633f');
  ctx.fillStyle = '#a4502f'; ctx.fillRect(8, 44, 40, 7);
  ctx.fillStyle = '#e08560'; ctx.fillRect(8, 44, 40, 2);
  return canvas;
}

export default {
  key: 'valorant',
  name: 'VALORANT',
  blurb: 'Ascent · Attacking B Site',
  accent: '#ff4655',
  pixel: false,
  dustTint: 0xf2e6d0,
  goalHint: 'DEFUSER READY — REACH THE SPIKE!',
  clearText: 'SPIKE DEFUSED',

  paintSky(ctx, W, H) {
    vGradient(ctx, 0, 0, W, H, [[0, '#6fa9dc'], [0.5, '#a9cfe9'], [0.8, '#f1e2c6'], [1, '#f6e4c5']]);
    glow(ctx, 240, 80, 240, '#fff4d6', 0.6);
  },

  layers() {
    return [
      {
        // floating island + far hills
        factor: 0.07, top: 20, height: 560,
        paint(ctx, x0, x1, width) {
          const pos = rng(5);
          for (let x = 0, i = 0; x < width + 200; x += 380 + pos() * 300, i++) {
            const cr = rng(40 + i);
            cloud(ctx, x, 150 + cr() * 120, 120 + cr() * 150, '#fffaf0', '#e9dccb', cr);
          }
          floatingIsland(ctx, width * 0.55, 150, 0.9);
          ridge(ctx, x0, x1, 560, (x) => 430 - fbm(x * 0.004, 6) * 90, '#b9c9c6');
          const cr = rng(1);
          for (let x = Math.floor(x0 / 30) * 30; x < x1 + 30; x += 30) { if (rng(x + 7)() < 0.35) cypress(ctx, x, 440 - fbm(x * 0.004, 6) * 90 + 10, 0.6, '#8fa996'); }
        },
      },
      {
        // the town: houses, bell tower, canal
        factor: 0.3, top: 150, height: 450,
        paint(ctx, x0, x1, width) {
          const base = 360;
          const col = { wall: '#e8d7b8', wallShade: '#d2bc98', roof: '#c1623c', roofDk: '#9d4a2b', window: '#6f8aa0', shutter: '#5d8a6a' };
          const col2 = { wall: '#dcb88c', wallShade: '#c49c70', roof: '#b4553a', roofDk: '#8f3f28', window: '#5f7a90', shutter: '#3f6f8f' };
          const pos = rng(8);
          for (let x = -40, i = 0; x < width; i++) {
            const w = 70 + pos() * 70, h = 120 + pos() * 120;
            if (x + w > x0 - 20 && x < x1 + 20) house(ctx, x, base, w, h, i % 3 === 1 ? col2 : col, rng(60 + i));
            x += w + 4 + pos() * 10;
          }
          [0.2, 0.62].forEach((f) => { const x = width * f; if (x > x0 - 100 && x < x1 + 100) campanile(ctx, x, base, 1, { wall: '#efe2c8', wallShade: '#d6c3a3', dark: '#50606c', trim: '#dccaa8', roof: '#c1623c' }); });
          // canal
          vGradient(ctx, x0, base, x1 - x0, 90, [[0, '#6fa6b8'], [1, '#3f7688']]);
          ctx.fillStyle = 'rgba(255,255,255,0.4)';
          for (let x = Math.floor(x0 / 40) * 40; x < x1; x += 40) { const rr = rng(x); ctx.fillRect(x + rr() * 20, base + 10 + rr() * 60, 12 + rr() * 20, 2); }
          ctx.fillStyle = '#cdb896'; ctx.fillRect(x0, base - 6, x1 - x0, 8);
          ctx.globalCompositeOperation = 'source-atop';
          ctx.fillStyle = 'rgba(230,220,200,0.28)'; ctx.fillRect(x0, 0, x1 - x0, 450);
          ctx.globalCompositeOperation = 'source-over';
        },
      },
      {
        // nearer arcade with arches and market awnings
        factor: 0.55, top: 240, height: 480,
        paint(ctx, x0, x1, width) {
          const base = 300;
          ctx.fillStyle = '#d9c3a0'; ctx.fillRect(x0, base - 150, x1 - x0, 480);
          for (let x = Math.floor(x0 / 90) * 90; x < x1 + 90; x += 90) {
            ctx.fillStyle = '#6d5a48';
            ctx.beginPath(); ctx.roundRect(x + 16, base - 110, 58, 110, [29, 29, 0, 0]); ctx.fill();
            ctx.fillStyle = '#c4ab86'; ctx.fillRect(x, base - 150, 12, 150);
            const rr = rng(x + 3);
            if (rr() < 0.4) {
              const ac = rr() < 0.5 ? '#2f7f8f' : RED;
              ctx.fillStyle = ac; poly(ctx, [[x + 10, base - 70], [x + 80, base - 70], [x + 88, base - 50], [x + 2, base - 50]], ac);
              ctx.fillStyle = CREAM; for (let k = 0; k < 4; k++) ctx.fillRect(x + 14 + k * 18, base - 70, 8, 20);
            }
          }
          ctx.fillStyle = '#c9ae86'; ctx.fillRect(x0, base - 160, x1 - x0, 12);
          ctx.fillStyle = '#b89c74'; ctx.fillRect(x0, base - 162, x1 - x0, 3);
          ctx.globalCompositeOperation = 'source-atop';
          ctx.fillStyle = 'rgba(60,40,30,0.18)'; ctx.fillRect(x0, 0, x1 - x0, 480);
          ctx.globalCompositeOperation = 'source-over';
        },
      },
    ];
  },

  pitFill(ctx, x0, x1) {
    vGradient(ctx, x0, 100, x1 - x0, 100, [[0, '#5f9aad'], [1, '#2b5566']]);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    for (let x = Math.floor(x0 / 36) * 36; x < x1; x += 36) { const rr = rng(x + 1); ctx.fillRect(x + rr() * 20, 108 + rr() * 70, 10 + rr() * 24, 2); }
    ctx.fillStyle = '#cdb896'; ctx.fillRect(x0, 96, x1 - x0, 6);
  },

  paintTerrain(ctx, level, x0, x1) {
    paintSmoothTerrain(ctx, level, x0, x1, {
      radius: 4,
      edgeLight: 'rgba(255,245,225,0.3)',
      edgeDark: 'rgba(60,40,20,0.35)',
      fill(ctx, x, y, c, r, depth) {
        const t0 = Math.min(1, depth / 3), t1 = Math.min(1, (depth + 1) / 3);
        const g = ctx.createLinearGradient(0, y, 0, y + TILE);
        g.addColorStop(0, mix(C.stoneTop, C.stoneDeep, t0)); g.addColorStop(1, mix(C.stoneTop, C.stoneDeep, t1));
        ctx.fillStyle = g; ctx.fillRect(x, y, TILE, TILE);
        // big ashlar blocks
        ctx.strokeStyle = C.mortar; ctx.lineWidth = 2;
        const off = (r % 2) * 32;
        ctx.beginPath(); ctx.moveTo(x, y + 0.5); ctx.lineTo(x + TILE, y + 0.5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + off + 0.5, y); ctx.lineTo(x + off + 0.5, y + TILE); ctx.stroke();
        speckle(ctx, x, y, TILE, TILE, 3, ['rgba(255,255,255,0.15)', 'rgba(90,60,30,0.15)'], c * 31 + r * 7, [2, 5]);
      },
      block(ctx, x, y, c, r) {
        boxes ??= { crate: crateTexture(), metal: metalBoxTexture() };
        ctx.drawImage((c + r) % 3 === 0 ? boxes.metal : boxes.crate, x, y);
      },
      top(ctx, x, y, lo, ro) {
        // paving slabs with a curb
        ctx.fillStyle = C.paveEdge; ctx.fillRect(x - (lo ? 4 : 0), y - 2, TILE + (lo ? 4 : 0) + (ro ? 4 : 0), 16);
        ctx.fillStyle = C.paveTop; ctx.fillRect(x - (lo ? 4 : 0), y - 4, TILE + (lo ? 4 : 0) + (ro ? 4 : 0), 12);
        ctx.fillStyle = 'rgba(120,100,80,0.35)'; ctx.fillRect(x + 31, y - 4, 2, 12);
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(x - (lo ? 4 : 0), y - 4, TILE + (lo ? 4 : 0) + (ro ? 4 : 0), 2);
      },
      plat(ctx, x, y, le, re) {
        // metal catwalk
        ctx.fillStyle = '#4b5561'; ctx.fillRect(x, y, TILE, 16);
        ctx.fillStyle = '#8c98a6'; ctx.fillRect(x, y, TILE, 4);
        ctx.fillStyle = '#2f3740';
        for (let i = 0; i < 4; i++) ctx.fillRect(x + 4 + i * 16, y + 6, 10, 6);
        ctx.fillStyle = RED; ctx.fillRect(x, y + 14, TILE, 3);
        if (le) { ctx.fillStyle = '#394250'; ctx.fillRect(x, y, 6, 30); }
        if (re) { ctx.fillStyle = '#394250'; ctx.fillRect(x + TILE - 6, y, 6, 30); }
      },
    });
  },

  decorate(scene, level, add) {
    for (let i = 0; i < 3; i++) addTexture(scene, 'w_val_pot' + i, potTexture(i + 1));
    const r = rng(23);
    const busy = new Set(level.ents.hazards.map((h) => h.c));
    if (level.ents.goal) [-1, 0, 1].forEach((d) => busy.add(level.ents.goal.c + d));
    level.ents.checkpoints.forEach((k) => busy.add(k.c));
    for (let c = 0; c < level.cols; c++) for (let row = 1; row < ROWS; row++) {
      if (level.at(c, row) !== '#' || level.at(c, row - 1) !== '.' || busy.has(c)) continue;
      if (r() < 0.14) add('w_val_pot' + Math.floor(r() * 3), c * TILE + 32, TOP + row * TILE - 2, { depth: 6 });
    }
    // site letter painted on the wall behind the Spike
    const g = level.ents.goal;
    if (g) {
      const t = scene.add.text(g.x - 20, g.y - 250, 'B', { fontFamily: '"Press Start 2P"', fontSize: '96px', color: '#ece8e1', stroke: '#0f1923', strokeThickness: 10 }).setOrigin(0.5).setDepth(-6).setAlpha(0.85);
      scene.add.rectangle(g.x - 20, g.y - 250, 150, 150, 0xff4655, 0.85).setDepth(-7).setAngle(45).setScale(0.8);
      t.setDepth(-6);
    }
  },

  hazard(scene, h) {
    // Brimstone incendiary: burning patch on the ground
    const x = h.x + TILE / 2, y = h.y + TILE;
    scene.add.ellipse(x, y - 2, 70, 12, 0x1a0e08, 0.7).setDepth(3);
    const g = scene.add.image(x, y - 16, 'fx-dot').setScale(3.4, 2).setTint(0xff6a1a).setAlpha(0.6).setBlendMode(Phaser.BlendModes.ADD).setDepth(3);
    scene.tweens.add({ targets: g, alpha: 0.35, duration: 180, yoyo: true, repeat: -1 });
    scene.add.particles(x, y - 4, 'fx-dot', {
      x: { min: -28, max: 28 }, lifespan: { min: 380, max: 700 }, speedY: { min: -140, max: -70 }, speedX: { min: -12, max: 12 },
      scale: { start: 0.55, end: 0.05 }, alpha: { start: 1, end: 0 }, tint: [0xffe27a, 0xff8a1c, 0xff4a1c], frequency: 22, blendMode: 'ADD',
    }).setDepth(5);
    scene.add.particles(x, y - 30, 'fx-dot', {
      x: { min: -20, max: 20 }, lifespan: 1200, speedY: { min: -60, max: -30 }, scale: { start: 0.4, end: 1.2 }, alpha: { start: 0.25, end: 0 },
      tint: 0x3a3030, frequency: 160,
    }).setDepth(4);
    return { x: h.x + 10, y: h.y + 30, w: TILE - 20, h: TILE - 30 };
  },

  ambient(scene) {
    scene.add.particles(0, 0, 'fx-dot', {
      x: { min: 0, max: 1280 }, y: { min: 60, max: 660 }, lifespan: 6000, speedX: { min: 4, max: 20 }, speedY: { min: -6, max: 6 },
      scale: { min: 0.04, max: 0.1 }, alpha: { start: 0.8, end: 0 }, frequency: 140, tint: 0xfff2d0,
    }).setScrollFactor(0).setDepth(25);
  },

  checkpoint(scene, k) {
    if (!scene.textures.exists('w_val_orb0')) { addTexture(scene, 'w_val_orb0', orbTexture(false)); addTexture(scene, 'w_val_orb1', orbTexture(true)); }
    const img = scene.add.image(k.x, k.y + 4, 'w_val_orb0').setOrigin(0.5, 1).setDepth(7);
    return {
      activate() {
        img.setTexture('w_val_orb1');
        scene.tweens.add({ targets: img, y: img.y - 4, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      },
    };
  },

  goal(scene, gl) {
    addTexture(scene, 'w_val_spike0', spikeTexture(true));
    addTexture(scene, 'w_val_spike1', spikeTexture(false));
    const img = scene.add.image(gl.x, gl.y + 4, 'w_val_spike0').setOrigin(0.5, 1).setDepth(-2);
    const pulse = scene.add.image(gl.x, gl.y - 56, 'fx-dot').setScale(4).setTint(0xff4655).setBlendMode(Phaser.BlendModes.ADD).setDepth(-1);
    scene.tweens.add({ targets: pulse, alpha: 0.1, duration: 420, yoyo: true, repeat: -1 });
    const ring = scene.add.ellipse(gl.x, gl.y, 40, 10, 0xff4655, 0).setStrokeStyle(3, 0xff4655, 0.9).setDepth(-1);
    scene.tweens.add({ targets: ring, width: 340, height: 70, alpha: 0, duration: 1100, repeat: -1 });
    return {
      zone: { x: gl.x - 50, y: gl.y - 110, w: 100, h: 110 },
      activate() {
        pulse.setTint(0x3fe0c5);
        ring.setStrokeStyle(3, 0x3fe0c5, 0.9);
      },
      celebrate() {
        img.setTexture('w_val_spike1');
        scene.tweens.killTweensOf(pulse);
        pulse.setAlpha(1);
        scene.tweens.add({ targets: pulse, scale: 16, alpha: 0, duration: 800 });
        const band = scene.add.rectangle(640, 250, 1280, 110, 0x0f1923, 0.85).setScrollFactor(0).setDepth(299).setScale(1, 0);
        const t = scene.add.text(640, 250, 'SPIKE DEFUSED', { fontFamily: '"Press Start 2P"', fontSize: '40px', color: '#3fe0c5' }).setOrigin(0.5).setScrollFactor(0).setDepth(300).setAlpha(0);
        scene.add.rectangle(640, 196, 1280, 4, 0xff4655).setScrollFactor(0).setDepth(300);
        scene.tweens.add({ targets: band, scaleY: 1, duration: 250 });
        scene.tweens.add({ targets: t, alpha: 1, duration: 300, delay: 150 });
      },
    };
  },

  post(scene) {
    const { canvas, ctx } = makeCanvas(1280, 720);
    const g = ctx.createRadialGradient(640, 360, 300, 640, 360, 820);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(60,35,15,0.35)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 1280, 720);
    addTexture(scene, 'w_val_vig', canvas);
    scene.add.image(0, 0, 'w_val_vig').setOrigin(0).setScrollFactor(0).setDepth(45);
  },
};
