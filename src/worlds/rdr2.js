import Phaser from 'phaser';
import { makeCanvas, rng, fbm, vGradient, glow, addTexture, poly, ridge, mix } from '../art/util.js';
import { paintSmoothTerrain, capBand, speckle, wave } from '../art/terrain.js';
import { TILE, TOP, ROWS } from '../levels.js';
import { colX, rowFeet } from '../mechanics.js';
import { sfx } from '../sfx.js';
import { ui } from '../ui.js';

// New Austin at golden hour — mesas, a frontier town silhouetted against the
// sunset, cacti, tumbleweeds, and the gang's campfire waiting at the end.

const C = {
  soil: '#d08c55', soilHi: '#f0b77a', soilDk: '#9c5a34',
  rockTop: '#c26a40', rockDeep: '#6e3222', band: 'rgba(90,30,15,0.28)', bandHi: 'rgba(255,200,150,0.14)',
  wood: '#8a6440', woodHi: '#b88a5c', woodDk: '#5a3f26',
};

function mesa(ctx, x, gy, w, h, col) {
  const top = gy - h;
  ctx.fillStyle = col.body;
  ctx.beginPath();
  ctx.moveTo(x - w * 0.62, gy);
  ctx.lineTo(x - w * 0.5, top + h * 0.35); ctx.lineTo(x - w * 0.46, top + 6); ctx.lineTo(x - w * 0.4, top);
  ctx.lineTo(x + w * 0.38, top); ctx.lineTo(x + w * 0.45, top + 8); ctx.lineTo(x + w * 0.5, top + h * 0.4);
  ctx.lineTo(x + w * 0.64, gy); ctx.closePath(); ctx.fill();
  // shadowed side
  ctx.fillStyle = col.shade;
  ctx.beginPath(); ctx.moveTo(x + w * 0.1, top); ctx.lineTo(x + w * 0.38, top); ctx.lineTo(x + w * 0.45, top + 8); ctx.lineTo(x + w * 0.5, top + h * 0.4); ctx.lineTo(x + w * 0.64, gy); ctx.lineTo(x + w * 0.2, gy); ctx.closePath(); ctx.fill();
  // strata
  ctx.strokeStyle = col.line; ctx.lineWidth = 2;
  for (let k = 1; k < 5; k++) { const y = top + (h * k) / 5; ctx.beginPath(); ctx.moveTo(x - w * 0.55, y); ctx.lineTo(x + w * 0.56, y + 3); ctx.stroke(); }
  ctx.fillStyle = col.lit; ctx.fillRect(x - w * 0.4, top, w * 0.5, 3);
}

function building(ctx, x, gy, w, h, sign, col) {
  // false front facade
  ctx.fillStyle = col.wall; ctx.fillRect(x, gy - h, w, h);
  ctx.fillRect(x + w * 0.1, gy - h - 16, w * 0.8, 18);
  ctx.fillStyle = col.dark;
  ctx.fillRect(x + w * 0.35, gy - 34, w * 0.3, 34);
  ctx.fillRect(x + 8, gy - h + 26, 14, 18); ctx.fillRect(x + w - 22, gy - h + 26, 14, 18);
  // porch roof + posts
  ctx.fillStyle = col.roof; ctx.fillRect(x - 6, gy - 46, w + 12, 7);
  ctx.fillRect(x - 2, gy - 40, 4, 40); ctx.fillRect(x + w - 2, gy - 40, 4, 40);
  if (sign) {
    ctx.fillStyle = col.sign; ctx.fillRect(x + w * 0.12, gy - h - 12, w * 0.76, 14);
    ctx.fillStyle = col.signText; ctx.font = 'bold 11px Georgia, serif'; ctx.textAlign = 'center';
    ctx.fillText(sign, x + w / 2, gy - h - 1); ctx.textAlign = 'left';
  }
  // warm window light
  glow(ctx, x + w / 2, gy - 18, 26, '#ffcf7a', 0.45);
}

function waterTower(ctx, x, gy, col) {
  ctx.fillStyle = col.wall;
  [-20, 16].forEach((d) => ctx.fillRect(x + d, gy - 90, 4, 90));
  ctx.fillRect(x - 24, gy - 50, 48, 3);
  ctx.fillRect(x - 26, gy - 130, 52, 42);
  poly(ctx, [[x - 30, gy - 130], [x, gy - 150], [x + 30, gy - 130]], col.roof);
}

function windpump(ctx, x, gy, col, a = 0.4) {
  ctx.strokeStyle = col.wall; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x - 16, gy); ctx.lineTo(x - 3, gy - 120); ctx.moveTo(x + 16, gy); ctx.lineTo(x + 3, gy - 120); ctx.stroke();
  ctx.lineWidth = 1.5;
  for (let k = 1; k < 5; k++) { const y = gy - k * 24; const s = 16 - k * 3; ctx.beginPath(); ctx.moveTo(x - s, y); ctx.lineTo(x + s, y - 24); ctx.stroke(); }
  ctx.fillStyle = col.wall;
  for (let i = 0; i < 14; i++) {
    ctx.save(); ctx.translate(x, gy - 126); ctx.rotate(a + (i / 14) * Math.PI * 2);
    ctx.fillRect(0, -2, 26, 4); ctx.restore();
  }
  ctx.fillRect(x, gy - 130, 30, 5);
  poly(ctx, [[x + 30, gy - 138], [x + 44, gy - 128], [x + 30, gy - 118]], col.wall);
}

function saguaro(ctx, x, gy, s, col) {
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.roundRect(x - 7 * s, gy - 90 * s, 14 * s, 90 * s, 7 * s); ctx.fill();
  ctx.beginPath(); ctx.roundRect(x - 26 * s, gy - 60 * s, 8 * s, 30 * s, 4 * s); ctx.fill();
  ctx.fillRect(x - 26 * s, gy - 36 * s, 22 * s, 7 * s);
  ctx.beginPath(); ctx.roundRect(x + 17 * s, gy - 72 * s, 8 * s, 34 * s, 4 * s); ctx.fill();
  ctx.fillRect(x + 4 * s, gy - 44 * s, 20 * s, 7 * s);
}

// ---------------------------------------------------------------- sprites
function cactusTexture() {
  const { canvas, ctx } = makeCanvas(64, 72);
  const body = '#4f8a3c', hi = '#7cb85a', dk = '#34622a';
  ctx.fillStyle = 'rgba(60,30,10,0.35)'; ctx.beginPath(); ctx.ellipse(32, 70, 24, 4, 0, 0, Math.PI * 2); ctx.fill();
  const arm = (x, y, w, h) => {
    ctx.fillStyle = dk; ctx.beginPath(); ctx.roundRect(x, y, w, h, w / 2); ctx.fill();
    ctx.fillStyle = body; ctx.beginPath(); ctx.roundRect(x + 1, y, w - 4, h, w / 2); ctx.fill();
    ctx.fillStyle = hi; ctx.fillRect(x + 3, y + w / 2, 2, h - w);
  };
  arm(24, 6, 16, 66);
  arm(8, 24, 11, 24); ctx.fillStyle = body; ctx.fillRect(12, 42, 14, 8);
  arm(45, 16, 11, 26); ctx.fillStyle = body; ctx.fillRect(38, 36, 12, 8);
  // spines
  ctx.fillStyle = '#f3e7c6';
  const r = rng(5);
  for (let i = 0; i < 40; i++) ctx.fillRect(8 + r() * 48, 8 + r() * 60, 1.5, 1.5);
  ctx.fillStyle = '#ff7aa3'; ctx.beginPath(); ctx.arc(32, 7, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffd1df'; ctx.beginPath(); ctx.arc(31, 6, 1.6, 0, Math.PI * 2); ctx.fill();
  return canvas;
}

function tumbleweedTexture() {
  const { canvas, ctx } = makeCanvas(48, 48);
  const r = rng(8);
  ctx.strokeStyle = '#a07a4a'; ctx.lineWidth = 1.4;
  for (let i = 0; i < 40; i++) {
    const a = r() * Math.PI * 2, b = a + 1 + r() * 2;
    ctx.beginPath(); ctx.arc(24 + (r() - 0.5) * 8, 24 + (r() - 0.5) * 8, 10 + r() * 12, a, b); ctx.stroke();
  }
  ctx.strokeStyle = '#6f5230';
  for (let i = 0; i < 16; i++) { const a = r() * Math.PI * 2; ctx.beginPath(); ctx.arc(24, 24, 6 + r() * 16, a, a + 1.2); ctx.stroke(); }
  return canvas;
}

function bushTexture(seed) {
  const { canvas, ctx } = makeCanvas(60, 34);
  const r = rng(seed);
  ctx.strokeStyle = '#8f7a4a'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 22; i++) {
    const bx = 10 + r() * 40;
    ctx.beginPath(); ctx.moveTo(30, 34); ctx.quadraticCurveTo(bx, 20, bx + (r() - 0.5) * 20, 34 - 10 - r() * 22); ctx.stroke();
  }
  ctx.fillStyle = '#a4935a';
  for (let i = 0; i < 12; i++) { ctx.beginPath(); ctx.arc(10 + r() * 40, 8 + r() * 18, 2 + r() * 2, 0, Math.PI * 2); ctx.fill(); }
  return canvas;
}

function skullTexture() {
  const { canvas, ctx } = makeCanvas(46, 26);
  ctx.fillStyle = '#efe4cc';
  ctx.beginPath(); ctx.ellipse(23, 14, 9, 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#efe4cc'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(15, 8); ctx.quadraticCurveTo(4, 8, 3, 1); ctx.moveTo(31, 8); ctx.quadraticCurveTo(42, 8, 43, 1); ctx.stroke();
  ctx.fillStyle = '#3a2618'; ctx.beginPath(); ctx.arc(19, 12, 2.2, 0, Math.PI * 2); ctx.arc(27, 12, 2.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(21, 19, 1.5, 3); ctx.fillRect(24, 19, 1.5, 3);
  return canvas;
}

function barrelTexture() {
  const { canvas, ctx } = makeCanvas(64, 64);
  const g = ctx.createLinearGradient(6, 0, 58, 0);
  g.addColorStop(0, '#6a4526'); g.addColorStop(0.4, '#a8743f'); g.addColorStop(1, '#5a391f');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(10, 2); ctx.quadraticCurveTo(2, 32, 10, 62); ctx.lineTo(54, 62); ctx.quadraticCurveTo(62, 32, 54, 2); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(40,20,10,0.5)'; ctx.lineWidth = 1.5;
  for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(10 + i * 7.3, 2); ctx.lineTo(10 + i * 7.3, 62); ctx.stroke(); }
  ctx.fillStyle = '#3b3530';
  [10, 50].forEach((y) => ctx.fillRect(4, y, 56, 5));
  ctx.fillStyle = '#6a625a'; [10, 50].forEach((y) => ctx.fillRect(4, y, 56, 1.5));
  return canvas;
}

function lanternPost(lit) {
  const { canvas, ctx } = makeCanvas(40, 110);
  ctx.fillStyle = '#5a3f26'; ctx.fillRect(16, 20, 7, 90);
  ctx.fillRect(16, 20, 20, 5);
  ctx.fillStyle = '#2d2a26'; ctx.fillRect(26, 25, 12, 4);
  ctx.fillStyle = lit ? '#ffcf6a' : '#6b5d4a'; ctx.fillRect(27, 29, 10, 14);
  ctx.strokeStyle = '#2d2a26'; ctx.lineWidth = 1.5; ctx.strokeRect(27, 29, 10, 14);
  ctx.fillStyle = '#2d2a26'; ctx.fillRect(26, 43, 12, 3);
  return canvas;
}

function campTexture(lit) {
  const { canvas, ctx } = makeCanvas(240, 150);
  // canvas tent
  poly(ctx, [[10, 150], [70, 40], [150, 150]], '#d8c7a0');
  poly(ctx, [[70, 40], [150, 150], [95, 150]], '#b9a67e');
  poly(ctx, [[62, 150], [70, 90], [80, 150]], '#4a3522');
  ctx.strokeStyle = '#6a553a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(70, 40); ctx.lineTo(70, 28); ctx.stroke();
  // log seats and fire ring
  ctx.fillStyle = '#6b4a2e'; ctx.beginPath(); ctx.roundRect(150, 136, 60, 12, 6); ctx.fill();
  ctx.fillStyle = '#8b6a48'; ctx.beginPath(); ctx.ellipse(208, 142, 5, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#7a7266';
  for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.ellipse(160 + i * 9, 146, 5, 4, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.strokeStyle = '#3a2618'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(170, 144); ctx.lineTo(200, 132); ctx.moveTo(170, 132); ctx.lineTo(200, 144); ctx.stroke();
  if (!lit) { ctx.fillStyle = '#4a4440'; ctx.beginPath(); ctx.ellipse(185, 138, 12, 5, 0, 0, Math.PI * 2); ctx.fill(); }
  return canvas;
}

export default {
  key: 'rdr2',
  name: 'RED DEAD REDEMPTION 2',
  blurb: 'New Austin · Golden Hour',
  accent: '#e8472f',
  pixel: false,
  dustTint: 0xe8c9a0,
  clearText: 'HONOR INCREASED',
  caveColor: 0x1a0d05,

  paintSky(ctx, W, H) {
    vGradient(ctx, 0, 0, W, H, [[0, '#2f3569'], [0.28, '#8a4f6f'], [0.52, '#e07a4a'], [0.72, '#f6b35e'], [1, '#ffe0a0']]);
    glow(ctx, 900, 430, 420, '#ffd27a', 0.55);
    glow(ctx, 900, 430, 110, '#fff2c8', 0.9);
    ctx.fillStyle = '#fff4d6'; ctx.beginPath(); ctx.arc(900, 430, 52, 0, Math.PI * 2); ctx.fill();
    // long streaky clouds lit from below
    const r = rng(3);
    for (let i = 0; i < 14; i++) {
      const y = 60 + r() * 260, x = r() * W, w = 160 + r() * 360;
      const g = ctx.createLinearGradient(0, y - 8, 0, y + 10);
      g.addColorStop(0, 'rgba(120,60,90,0.55)'); g.addColorStop(1, 'rgba(255,170,120,0.75)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(x, y, w / 2, 6 + r() * 6, 0, 0, Math.PI * 2); ctx.fill();
    }
  },

  layers() {
    return [
      {
        factor: 0.08, top: 240, height: 360,
        paint(ctx, x0, x1, width) {
          const col = { body: '#9a5a6a', shade: '#7f4a60', line: 'rgba(80,40,60,0.25)', lit: '#e89a7a' };
          const pos = rng(2);
          for (let x = 60, i = 0; x < width + 300; x += 260 + pos() * 300, i++) {
            const mr = rng(80 + i);
            const w = 200 + mr() * 220, h = 150 + mr() * 100;
            if (x + w < x0 || x - w > x1) continue;
            mesa(ctx, x, 360, w, h, col);
          }
          ctx.globalCompositeOperation = 'source-atop';
          ctx.fillStyle = 'rgba(255,190,150,0.28)'; ctx.fillRect(x0, 0, x1 - x0, 360);
          ctx.globalCompositeOperation = 'source-over';
        },
      },
      {
        factor: 0.2, top: 250, height: 400,
        paint(ctx, x0, x1, width) {
          const col = { body: '#b8573a', shade: '#8e3f2c', line: 'rgba(90,30,15,0.3)', lit: '#ffb07a' };
          const pos = rng(6);
          for (let x = 200, i = 0; x < width + 300; x += 420 + pos() * 400, i++) {
            const mr = rng(120 + i);
            const w = 220 + mr() * 200, h = 180 + mr() * 110;
            if (x + w < x0 || x - w > x1) continue;
            mesa(ctx, x, 400, w, h, col);
          }
          ridge(ctx, x0, x1, 400, (x) => 330 - fbm(x * 0.005, 4) * 40, '#c77a4a');
          for (let x = Math.floor(x0 / 70) * 70; x < x1 + 70; x += 70) {
            if (rng(x + 11)() < 0.45) saguaro(ctx, x, 334 - fbm(x * 0.005, 4) * 40 + 6, 0.7, '#6d5a3a');
          }
        },
      },
      {
        // frontier town silhouette against the sun
        factor: 0.4, top: 200, height: 520,
        paint(ctx, x0, x1, width) {
          const base = 330;
          const col = { wall: '#5e3a2a', dark: '#3a2218', roof: '#4a2c1f', sign: '#2a1810', signText: '#f0c98a' };
          ridge(ctx, x0, x1, 520, (x) => base - 4 + Math.sin(x * 0.01) * 3, '#8e5236');
          const signs = ['SALOON', 'STORE', 'SHERIFF', 'HOTEL', 'GUNSMITH', 'BANK', 'DOCTOR', 'BARBER', 'STABLES'];
          const pos = rng(15);
          let x = 120, i = 0;
          while (x < width) {
            const gapChance = pos();
            const w = 80 + pos() * 70, h = 60 + pos() * 60;
            if (gapChance < 0.25) { x += 160 + pos() * 200; continue; }
            if (x + w > x0 - 40 && x < x1 + 40) building(ctx, x, base, w, h, signs[i % signs.length], col);
            x += w + 10 + pos() * 30; i++;
          }
          [0.22, 0.58, 0.9].forEach((f) => { const wx = width * f; if (wx > x0 - 100 && wx < x1 + 100) waterTower(ctx, wx, base, col); });
          [0.1, 0.45, 0.75].forEach((f, k) => { const wx = width * f; if (wx > x0 - 100 && wx < x1 + 100) windpump(ctx, wx, base, { wall: '#4a2c1f' }, k); });
          // telegraph poles and sagging wires
          ctx.strokeStyle = '#3a2218'; ctx.lineWidth = 3;
          const step = 220;
          for (let px = Math.floor(x0 / step) * step - step; px < x1 + step; px += step) {
            ctx.fillStyle = '#3a2218'; ctx.fillRect(px - 2, base - 110, 5, 110); ctx.fillRect(px - 14, base - 104, 30, 3);
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(px - 12, base - 104); ctx.quadraticCurveTo(px + step / 2 - 12, base - 84, px + step - 12, base - 104); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(px + 12, base - 104); ctx.quadraticCurveTo(px + step / 2 + 12, base - 86, px + step + 12, base - 104); ctx.stroke();
          }
        },
      },
    ];
  },

  pitFill(ctx, x0, x1) {
    vGradient(ctx, x0, 60, x1 - x0, 140, [[0, 'rgba(90,40,25,0)'], [0.3, '#5a2a1c'], [1, '#26120c']]);
  },

  paintTerrain(ctx, level, x0, x1) {
    paintSmoothTerrain(ctx, level, x0, x1, {
      radius: 12,
      edgeLight: 'rgba(255,210,150,0.35)',
      edgeDark: 'rgba(50,15,5,0.45)',
      fill(ctx, x, y, c, r, depth) {
        const t0 = Math.min(1, depth / 3), t1 = Math.min(1, (depth + 1) / 3);
        const g = ctx.createLinearGradient(0, y, 0, y + TILE);
        g.addColorStop(0, mix(C.rockTop, C.rockDeep, t0)); g.addColorStop(1, mix(C.rockTop, C.rockDeep, t1));
        ctx.fillStyle = g; ctx.fillRect(x, y, TILE, TILE);
        // sandstone strata
        for (let k = 0; k < 4; k++) {
          const yy = y + 10 + k * 15;
          ctx.fillStyle = k % 2 ? C.band : C.bandHi;
          ctx.beginPath();
          ctx.moveTo(x, yy + wave(x, 5, k)); ctx.lineTo(x + TILE, yy + wave(x + TILE, 5, k));
          ctx.lineTo(x + TILE, yy + 5 + wave(x + TILE, 5, k)); ctx.lineTo(x, yy + 5 + wave(x, 5, k)); ctx.fill();
        }
        speckle(ctx, x, y, TILE, TILE, 3, ['rgba(255,220,180,0.2)', 'rgba(60,20,10,0.2)'], c * 41 + r * 3, [1.5, 4]);
      },
      block(ctx, x, y) {
        barrel ??= barrelTexture();
        ctx.drawImage(barrel, x, y);
      },
      top(ctx, x, y, lo, ro, c) {
        capBand(ctx, x, y - 2, TILE, 16, lo, ro, C.soilDk, { amp: 6, seed: 7, ext: 6 });
        capBand(ctx, x, y - 4, TILE, 10, lo, ro, C.soil, { amp: 4, seed: 8, ext: 4 });
        capBand(ctx, x, y - 4, TILE, 3, lo, ro, C.soilHi, { amp: 1, seed: 9, ext: 3 });
        // pebbles
        speckle(ctx, x, y - 2, TILE, 6, 3, ['#a9754a', '#e8c49a'], c * 7 + 1, [1.5, 3]);
      },
      plat(ctx, x, y, le, re) {
        // weathered boardwalk
        ctx.fillStyle = C.woodDk; ctx.fillRect(x, y + 4, TILE, 16);
        for (let i = 0; i < 2; i++) {
          ctx.fillStyle = i ? C.wood : '#957048';
          ctx.fillRect(x + i * 32 + 1, y, 30, 14);
          ctx.fillStyle = C.woodHi; ctx.fillRect(x + i * 32 + 1, y, 30, 2);
          ctx.fillStyle = 'rgba(40,20,10,0.4)'; ctx.fillRect(x + i * 32 + 6, y + 6, 18, 1);
        }
        ctx.fillStyle = C.woodDk;
        if (le) ctx.fillRect(x + 4, y + 14, 7, 40);
        if (re) ctx.fillRect(x + TILE - 11, y + 14, 7, 40);
      },
    });
  },

  decorate(scene, level, add) {
    for (let i = 0; i < 2; i++) addTexture(scene, 'w_rd_bush' + i, bushTexture(i + 2));
    addTexture(scene, 'w_rd_skull', skullTexture());
    const r = rng(29);
    const busy = new Set(level.ents.hazards.map((h) => h.c));
    if (level.ents.goal) [-2, -1, 0, 1, 2].forEach((d) => busy.add(level.ents.goal.c + d));
    level.ents.checkpoints.forEach((k) => busy.add(k.c));
    for (let c = 0; c < level.cols; c++) for (let row = 1; row < ROWS; row++) {
      if (level.at(c, row) !== '#' || level.at(c, row - 1) !== '.' || busy.has(c)) continue;
      const x = c * TILE + 32, y = TOP + row * TILE + 4;
      const k = r();
      if (k < 0.22) add('w_rd_bush' + Math.floor(r() * 2), x + (r() - 0.5) * 30, y, { depth: 6 });
      else if (k < 0.26) add('w_rd_skull', x, y - 2, { depth: 6, flip: r() < 0.5 });
    }
  },

  hazard(scene, h) {
    if (!scene.textures.exists('w_rd_cactus')) addTexture(scene, 'w_rd_cactus', cactusTexture());
    scene.add.image(h.x + TILE / 2, h.y + TILE + 4, 'w_rd_cactus').setOrigin(0.5, 1).setDepth(4);
    return { x: h.x + 14, y: h.y + 10, w: TILE - 28, h: TILE - 10 };
  },

  ambient(scene) {
    if (!scene.textures.exists('w_rd_tumble')) addTexture(scene, 'w_rd_tumble', tumbleweedTexture());
    const roll = () => {
      if (!scene.sys.isActive()) return;
      const cam = scene.cameras.main;
      const y = 500 + Math.random() * 14;
      const t = scene.add.image(cam.scrollX - 60, y, 'w_rd_tumble').setDepth(26).setScale(0.8 + Math.random() * 0.6).setAlpha(0.95);
      const dur = 5000 + Math.random() * 3000;
      scene.tweens.add({ targets: t, x: cam.scrollX + 1400, angle: 720, duration: dur, onComplete: () => t.destroy() });
      scene.tweens.add({ targets: t, y: y - 26, duration: 380, yoyo: true, repeat: Math.floor(dur / 760), ease: 'Quad.out' });
      scene.time.delayedCall(4000 + Math.random() * 6000, roll);
    };
    scene.time.delayedCall(1500, roll);
    scene.add.particles(0, 0, 'fx-dot', {
      x: { min: -40, max: 1280 }, y: { min: 300, max: 700 }, lifespan: 4000, speedX: { min: 40, max: 110 }, speedY: { min: -10, max: 5 },
      scale: { min: 0.05, max: 0.14 }, alpha: { start: 0.7, end: 0 }, frequency: 90, tint: 0xf0c890,
    }).setScrollFactor(0).setDepth(25);
  },

  checkpoint(scene, k) {
    if (!scene.textures.exists('w_rd_lamp0')) { addTexture(scene, 'w_rd_lamp0', lanternPost(false)); addTexture(scene, 'w_rd_lamp1', lanternPost(true)); }
    const img = scene.add.image(k.x, k.y + 4, 'w_rd_lamp0').setOrigin(0.5, 1).setDepth(7);
    const light = scene.add.image(k.x + 12, k.y - 70, 'fx-dot').setScale(4).setTint(0xffb04a).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD).setDepth(8);
    return {
      activate() {
        img.setTexture('w_rd_lamp1');
        scene.tweens.add({ targets: light, alpha: 0.7, duration: 300 });
        scene.tweens.add({ targets: light, scale: 3.4, duration: 300, yoyo: true, repeat: -1 });
      },
    };
  },

  goal(scene, gl) {
    addTexture(scene, 'w_rd_camp0', campTexture(false));
    addTexture(scene, 'w_rd_camp1', campTexture(true));
    const img = scene.add.image(gl.x - 60, gl.y + 4, 'w_rd_camp0').setOrigin(0.5, 1).setDepth(-2);
    const fx = gl.x - 60 - 120 + 185, fy = gl.y - 10;
    const glowImg = scene.add.image(fx, fy - 20, 'fx-dot').setScale(8).setTint(0xff9a3a).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD).setDepth(-1);
    return {
      zone: { x: gl.x - 90, y: gl.y - 140, w: 150, h: 140 },
      activate() {
        img.setTexture('w_rd_camp1');
        scene.tweens.add({ targets: glowImg, alpha: 0.7, duration: 400 });
        scene.tweens.add({ targets: glowImg, scale: 7, duration: 180, yoyo: true, repeat: -1 });
        scene.add.particles(fx, fy, 'fx-dot', {
          x: { min: -10, max: 10 }, lifespan: { min: 400, max: 800 }, speedY: { min: -150, max: -80 }, speedX: { min: -14, max: 14 },
          scale: { start: 0.6, end: 0.05 }, tint: [0xffe27a, 0xff8a1c, 0xff4a1c], frequency: 25, blendMode: 'ADD',
        }).setDepth(0);
        scene.add.particles(fx, fy - 40, 'fx-px', {
          x: { min: -8, max: 8 }, lifespan: 1400, speedY: { min: -120, max: -60 }, speedX: { min: -30, max: 30 },
          scale: { start: 0.6, end: 0 }, tint: 0xffc060, frequency: 120, blendMode: 'ADD',
        }).setDepth(0);
      },
      celebrate() {
        scene.tweens.add({ targets: glowImg, scale: 14, duration: 600 });
        const t = scene.add.text(640, 240, 'HONOR ▲', { fontFamily: 'Georgia, serif', fontSize: '54px', color: '#ffffff', stroke: '#2a1208', strokeThickness: 8, fontStyle: 'bold' })
          .setOrigin(0.5).setScrollFactor(0).setDepth(300).setAlpha(0);
        scene.tweens.add({ targets: t, alpha: 1, y: 220, duration: 500 });
      },
    };
  },

  carrier(scene) {
    if (!scene.textures.exists('w_rd_hen0')) { addTexture(scene, 'w_rd_hen0', henTexture(false)); addTexture(scene, 'w_rd_hen1', henTexture(true)); }
    const obj = scene.add.image(0, 0, 'w_rd_hen0').setOrigin(0.5, 1).setDepth(14);
    return {
      obj, carryY: 58,
      tick(ms, moving) {
        obj.setTexture(!moving && Math.floor(ms / 260) % 3 === 0 ? 'w_rd_hen1' : 'w_rd_hen0');
        if (moving) obj.y -= Math.abs(Math.sin(ms / 90)) * 3;
      },
    };
  },

  // Rattlesnake: slithers, rattles when you get close, then strikes.
  // In duo the host runs it (it goes for the closest player); the guest mirrors getState().
  enemy(scene, t) {
    if (t.kind !== 'snake') return null;
    if (!scene.textures.exists('w_rd_snake0')) { addTexture(scene, 'w_rd_snake0', snakeTexture(false)); addTexture(scene, 'w_rd_snake1', snakeTexture(true)); }
    const feet = rowFeet(t.r) + 3, x0 = colX(t.c0) - 16, x1 = colX(t.c1) + 16;
    const spr = scene.add.image(colX(t.c), feet, 'w_rd_snake0').setOrigin(0.32, 1).setDepth(15).setScale(1.25);
    let state, x, dir, timer, gone;
    const STATES = ['slither', 'rattle', 'strike', 'cool'];
    const reset = () => { state = 'slither'; x = colX(t.c); dir = 1; timer = 0; gone = 0; spr.setVisible(true).setTexture('w_rd_snake0'); };
    reset();
    return {
      stompable: true,
      update(ms, dt) {
        if (gone > 0) { gone -= dt; if (gone <= 0) { spr.setVisible(true).setAlpha(0); scene.tweens.add({ targets: spr, alpha: 1, duration: 400 }); } return; }
        const ai = scene.mech.ai;
        timer -= dt;
        if (ai.follow) { /* the host decides; setState() moves it */ }
        else if (state === 'slither') {
          x += dir * 30 * dt;
          if (x > x1) { x = x1; dir = -1; } else if (x < x0) { x = x0; dir = 1; }
          const q = ai.nearest(x);
          if (q && Math.abs(q.x - x) < 150 && Math.abs(q.bottom - feet) < 70) {
            dir = q.x < x ? -1 : 1; state = 'rattle'; timer = 0.55; sfx.rattle();
          }
        } else if (state === 'rattle' && timer <= 0) { state = 'strike'; timer = 0.35; }
        else if (state === 'strike' && timer <= 0) { state = 'cool'; timer = 0.9; }
        else if (state === 'cool' && timer <= 0) state = 'slither';
        spr.setTexture(state === 'strike' ? 'w_rd_snake1' : 'w_rd_snake0');
        spr.setFlipX(dir < 0);
        spr.setOrigin(dir < 0 ? 0.68 : 0.32, 1);
        spr.setPosition(x + (state === 'rattle' ? Math.sin(ms / 20) * 1.5 : 0), feet);
      },
      hitbox() {
        if (gone > 0) return null;
        if (state === 'strike') return dir > 0 ? { x: x - 28, y: feet - 34, w: 96, h: 34 } : { x: x - 68, y: feet - 34, w: 96, h: 34 };
        return { x: x - 28, y: feet - 22, w: 56, h: 22 };
      },
      getState() { return [Math.round(x), dir, STATES.indexOf(state), gone > 0 ? 1 : 0]; },
      setState([sx, sd, st, g]) {
        x = sx; dir = sd;
        const next = STATES[st];
        if (next === 'rattle' && state !== 'rattle' && !gone) sfx.rattle();
        state = next;
        if (g && gone <= 0) { gone = 6; spr.setVisible(false); }
        else if (!g && gone > 0) { gone = 0; spr.setVisible(true).setAlpha(1); }
      },
      stomp() {
        gone = 6; spr.setVisible(false); state = 'slither';
        const poof = scene.add.particles(x, feet - 10, 'fx-puff', {
          speed: { min: 60, max: 180 }, lifespan: 500, scale: { start: 1, end: 0 }, tint: 0xe8c9a0, emitting: false,
        }).setDepth(30);
        poof.explode(12);
        scene.time.delayedCall(600, () => poof.destroy());
      },
      reset,
    };
  },

  // A posse rides in from behind: keep running to camp.
  setpiece(scene, level) {
    if (!scene.textures.exists('w_rd_rider0')) { addTexture(scene, 'w_rd_rider0', riderTexture(0)); addTexture(scene, 'w_rd_rider1', riderTexture(1)); }
    const SPEED = 255;
    const surface = (c) => { for (let r = 0; r < ROWS; r++) if (level.solid(c, r)) return TOP + r * TILE; return null; };
    let riders = [], front = 0, active = false, gunT = 0, stopped = false;
    const clear = () => { riders.forEach((r) => r.img.destroy()); riders = []; active = false; };
    return {
      trigger(id) {
        if (id !== 'posse' || active) return;
        const p = scene.player;
        active = true; stopped = false;
        front = p.x - 760; gunT = 1.2;
        riders = [0, 1, 2].map((i) => {
          const img = scene.add.image(front - i * 120, TOP + 8 * TILE, 'w_rd_rider0').setOrigin(0.5, 1).setDepth(18).setScale(1 - i * 0.06);
          return { img, off: i * 120, y: surface(Math.floor((front - i * 120) / TILE)) ?? TOP + 8 * TILE, ph: i * 0.37 };
        });
        ui.toast('A POSSE IS ON YOUR TAIL · RIDE FOR CAMP!');
        sfx.gun();
      },
      update(ms, dt, p) {
        if (!active) return;
        if (!stopped) front += SPEED * dt;
        for (const r of riders) {
          const x = front - r.off;
          const c = Math.floor(x / TILE);
          const s = surface(c);
          const target = s ?? r.y - 90;
          r.y += (target - r.y) * Math.min(1, dt * (s != null ? 12 : 3));
          if (s != null && r.y > s) r.y = s;
          const gallop = Math.floor(ms / 110 + r.ph * 10) % 2;
          r.img.setTexture(gallop ? 'w_rd_rider1' : 'w_rd_rider0');
          r.img.setPosition(x, r.y - (stopped ? 0 : Math.abs(Math.sin(ms / 110 + r.ph)) * 6));
        }
        if (stopped || !p) return;
        gunT -= dt;
        if (gunT <= 0) {
          gunT = 0.8 + Math.random() * 0.5;
          const r = riders[Math.floor(Math.random() * riders.length)];
          const flash = scene.add.image(r.img.x + 70, r.img.y - 112, 'fx-dot').setScale(1.4).setTint(0xffe27a).setBlendMode(Phaser.BlendModes.ADD).setDepth(30);
          scene.tweens.add({ targets: flash, alpha: 0, scale: 0.4, duration: 150, onComplete: () => flash.destroy() });
          const dx = p.x + (Math.random() - 0.5) * 180;
          const s = surface(Math.floor(dx / TILE));
          if (s != null) {
            const dust = scene.add.particles(dx, s, 'fx-puff', {
              speed: { min: 40, max: 140 }, angle: { min: 220, max: 320 }, lifespan: 450, scale: { start: 0.9, end: 0 }, tint: 0xe8c9a0, emitting: false,
            }).setDepth(22);
            dust.explode(8);
            scene.time.delayedCall(500, () => dust.destroy());
          }
          sfx.gun();
        }
        // caught by the lead rider
        if (p.x - 26 < front + 70) return 'kill';
      },
      reset() { clear(); },
      win() {
        stopped = true;
        riders.forEach((r) => scene.tweens.add({ targets: r.img, alpha: 0, duration: 1200, delay: 300 }));
      },
    };
  },

  post(scene) {
    // warm grade, vignette, cinematic bars and film grain
    const { canvas, ctx } = makeCanvas(1280, 720);
    const g = ctx.createRadialGradient(640, 360, 280, 640, 360, 820);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(50,20,5,0.55)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 1280, 720);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1280, 26); ctx.fillRect(0, 694, 1280, 26);
    addTexture(scene, 'w_rd_vig', canvas);
    scene.add.image(0, 0, 'w_rd_vig').setOrigin(0).setScrollFactor(0).setDepth(45);

    const grain = makeCanvas(256, 256);
    const id = grain.ctx.createImageData(256, 256);
    for (let i = 0; i < id.data.length; i += 4) { const v = Math.random() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 22; }
    grain.ctx.putImageData(id, 0, 0);
    addTexture(scene, 'w_rd_grain', grain.canvas);
    const ts = scene.add.tileSprite(0, 0, 1280, 720, 'w_rd_grain').setOrigin(0).setScrollFactor(0).setDepth(46);
    scene.time.addEvent({ delay: 60, loop: true, callback: () => { ts.tilePositionX = Math.random() * 256; ts.tilePositionY = Math.random() * 256; } });
  },
};

let barrel = null;

// Camp hen (faces right); peck lowers the head.
function henTexture(peck) {
  const { canvas, ctx } = makeCanvas(52, 50);
  const ell = (x, y, rx, ry, c, rot = 0) => { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); ctx.fill(); };
  ctx.strokeStyle = '#d9962f'; ctx.lineWidth = 2.5;
  [[22, 38, 20, 49], [30, 38, 32, 49]].forEach(([a, b, c, d]) => { ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke(); });
  poly(ctx, [[6, 14], [14, 30], [4, 26]], '#8a5a2e');
  ell(24, 30, 17, 11, '#efe6d4');
  ell(21, 29, 10, 6, '#b07a45', 0.2);
  const hx = peck ? 42 : 38, hy = peck ? 34 : 16;
  ctx.fillStyle = '#efe6d4'; ctx.beginPath(); ctx.moveTo(32, 26); ctx.lineTo(hx - 4, hy + 2); ctx.lineTo(hx + 4, hy + 4); ctx.lineTo(38, 30); ctx.fill();
  ell(hx, hy, 7, 6.5, '#efe6d4');
  ell(hx - 1, hy - 7, 4, 3, '#d23a2a');
  ell(hx + 3, hy + 6, 2, 3, '#d23a2a');
  poly(ctx, [[hx + 6, hy - 1], [hx + 12, hy + 1], [hx + 6, hy + 3]], '#e8a33a');
  ctx.fillStyle = '#1a1a1a'; ctx.fillRect(hx + 2, hy - 2, 2, 2);
  return canvas;
}

// Rattlesnake (faces right). strike: head lunges forward and up.
function snakeTexture(strike) {
  const { canvas, ctx } = makeCanvas(116, 40);
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    pts.push([6 + t * 62, 32 - Math.sin(t * Math.PI * 2.2) * 5 * (1 - t * 0.4)]);
  }
  if (strike) for (let i = 1; i <= 8; i++) pts.push([68 + i * 4.6, 30 - i * 2]);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const stroke = (w, c) => { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); };
  stroke(11, '#4e3520');
  stroke(8, '#c29a5e');
  ctx.fillStyle = '#6b4a2a';
  for (let i = 3; i < pts.length - 2; i += 3) { const [x, y] = pts[i]; poly(ctx, [[x, y - 4], [x + 3, y], [x, y + 4], [x - 3, y]]); ctx.fill(); }
  // rattle
  ctx.fillStyle = '#e2cf9a';
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(4 - i * 3 + 3, 30 - i * 2, 2.6, 3.2, 0.4, 0, Math.PI * 2); ctx.fill(); }
  // head
  const [hx, hy] = pts[pts.length - 1];
  ctx.fillStyle = '#a57b45'; ctx.beginPath(); ctx.ellipse(hx + 6, hy - 1, 9, 6, strike ? -0.4 : 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1a1208'; ctx.fillRect(hx + 7, hy - 4, 2, 2);
  if (strike) { ctx.strokeStyle = '#d23a2a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(hx + 14, hy - 5); ctx.lineTo(hx + 20, hy - 8); ctx.moveTo(hx + 17, hy - 6.5); ctx.lineTo(hx + 20, hy - 4); ctx.stroke(); }
  return canvas;
}

// Horse and rider silhouette against the sunset (faces right). frame: legs.
function riderTexture(frame) {
  const { canvas, ctx } = makeCanvas(180, 140);
  const ink = '#26150c';
  ctx.fillStyle = ink; ctx.strokeStyle = ink; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.ellipse(84, 78, 46, 19, 0, 0, Math.PI * 2); ctx.fill();
  poly(ctx, [[112, 70], [138, 30], [152, 36], [128, 84]], ink);
  ctx.beginPath(); ctx.ellipse(150, 40, 16, 8, 0.5, 0, Math.PI * 2); ctx.fill();
  poly(ctx, [[138, 26], [142, 16], [146, 28]], ink);
  ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(40, 70); ctx.quadraticCurveTo(22, 80, 20, 104); ctx.stroke();
  ctx.lineWidth = 7;
  const legs = frame ? [[52, 90, 30, 136], [66, 92, 60, 138], [108, 90, 128, 134], [118, 88, 150, 128]] : [[52, 90, 46, 138], [66, 92, 82, 136], [108, 90, 108, 138], [118, 88, 126, 138]];
  legs.forEach(([a, b, c, d]) => { ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke(); });
  // rider: torso, head, hat, rifle
  poly(ctx, [[74, 62], [80, 26], [98, 26], [100, 62]], ink);
  ctx.beginPath(); ctx.arc(90, 18, 8, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(90, 11, 18, 3.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(82, 0, 16, 11);
  ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(94, 36); ctx.lineTo(160, 28); ctx.stroke();
  // warm rim light from the sunset behind
  ctx.globalCompositeOperation = 'source-atop';
  const g = ctx.createLinearGradient(0, 0, 0, 140);
  g.addColorStop(0, 'rgba(255,150,70,0.55)'); g.addColorStop(0.25, 'rgba(255,150,70,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 180, 140);
  ctx.globalCompositeOperation = 'source-over';
  return canvas;
}
