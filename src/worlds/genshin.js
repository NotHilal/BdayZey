import Phaser from 'phaser';
import { makeCanvas, rng, fbm, vGradient, glow, cloud, addTexture, poly, ridge, mix } from '../art/util.js';
import { paintSmoothTerrain, capBand, speckle, wave } from '../art/terrain.js';
import { TILE, TOP, ROWS } from '../levels.js';

// Mondstadt — Starfell Valley: bright anime sky, Dragonspine in the distance,
// the city of Mondstadt on its lake island, windmills and cel-shaded meadows.

const C = {
  grass: '#86d04f', grassHi: '#c3ef76', grassDk: '#4f9b35',
  rockTop: '#d9c6a3', rockMid: '#b9a282', rockDeep: '#8b7964', rockLine: 'rgba(92,70,50,0.35)',
  wood: '#a8733f', woodHi: '#d29a5c', woodDk: '#6e4524',
};

function windmill(ctx, x, gy, s, col, angle = 0.3) {
  // stone tower
  poly(ctx, [[x - 14 * s, gy], [x - 9 * s, gy - 62 * s], [x + 9 * s, gy - 62 * s], [x + 14 * s, gy]], col.wall);
  ctx.fillStyle = col.shade; ctx.fillRect(x + 3 * s, gy - 60 * s, 8 * s, 60 * s);
  // roof
  poly(ctx, [[x - 13 * s, gy - 60 * s], [x, gy - 80 * s], [x + 13 * s, gy - 60 * s]], col.roof);
  // door & window
  ctx.fillStyle = col.dark; ctx.fillRect(x - 3 * s, gy - 12 * s, 6 * s, 12 * s); ctx.fillRect(x - 2 * s, gy - 44 * s, 4 * s, 6 * s);
  // sails
  const hx = x, hy = gy - 58 * s;
  for (let i = 0; i < 4; i++) {
    const a = angle + (i * Math.PI) / 2;
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(a);
    ctx.fillStyle = col.sailFrame; ctx.fillRect(-1.2 * s, 0, 2.4 * s, 46 * s);
    ctx.fillStyle = col.sail; ctx.fillRect(1.2 * s, 8 * s, 9 * s, 36 * s);
    ctx.strokeStyle = col.sailFrame; ctx.lineWidth = 0.8 * s;
    for (let k = 1; k < 6; k++) { ctx.beginPath(); ctx.moveTo(1.2 * s, 8 * s + k * 6 * s); ctx.lineTo(10.2 * s, 8 * s + k * 6 * s); ctx.stroke(); }
    ctx.restore();
  }
  ctx.fillStyle = col.dark; ctx.beginPath(); ctx.arc(hx, hy, 3 * s, 0, Math.PI * 2); ctx.fill();
}

function roundTree(ctx, x, gy, s, col, r) {
  ctx.fillStyle = col.trunk; ctx.fillRect(x - 3 * s, gy - 26 * s, 6 * s, 26 * s);
  const blobs = [[0, -38, 18], [-13, -30, 13], [13, -30, 13], [-6, -48, 12], [8, -46, 12]];
  blobs.forEach(([dx, dy, rr]) => { ctx.fillStyle = col.leaf; ctx.beginPath(); ctx.arc(x + dx * s, gy + dy * s, rr * s * (0.9 + r() * 0.2), 0, Math.PI * 2); ctx.fill(); });
  blobs.slice(0, 3).forEach(([dx, dy, rr]) => { ctx.fillStyle = col.leafHi; ctx.beginPath(); ctx.arc(x + dx * s - 4 * s, gy + dy * s - 5 * s, rr * s * 0.5, 0, Math.PI * 2); ctx.fill(); });
}

function mondstadtCity(ctx, x, baseY, s, col) {
  // island rock
  poly(ctx, [[x - 190 * s, baseY], [x - 160 * s, baseY - 26 * s], [x + 170 * s, baseY - 30 * s], [x + 200 * s, baseY]], col.rock);
  // outer wall
  ctx.fillStyle = col.wall; ctx.fillRect(x - 160 * s, baseY - 62 * s, 330 * s, 36 * s);
  for (let i = 0; i < 22; i++) ctx.fillRect(x - 160 * s + i * 15 * s, baseY - 68 * s, 8 * s, 6 * s);
  // houses with slate roofs
  const houses = [[-130, 40], [-100, 52], [-70, 44], [40, 50], [75, 42], [110, 56], [140, 40]];
  houses.forEach(([dx, h]) => {
    ctx.fillStyle = col.wallLight; ctx.fillRect(x + dx * s, baseY - (62 + h) * s, 26 * s, h * s);
    poly(ctx, [[x + (dx - 3) * s, baseY - (62 + h) * s], [x + (dx + 13) * s, baseY - (80 + h) * s], [x + (dx + 29) * s, baseY - (62 + h) * s]], col.roof);
  });
  // cathedral of Barbatos: tall body, rose window, twin spires
  ctx.fillStyle = col.wallLight; ctx.fillRect(x - 40 * s, baseY - 160 * s, 80 * s, 100 * s);
  poly(ctx, [[x - 44 * s, baseY - 160 * s], [x, baseY - 200 * s], [x + 44 * s, baseY - 160 * s]], col.roof);
  [[-52, 230], [52, 230], [0, 250]].forEach(([dx, h]) => {
    ctx.fillStyle = col.wall; ctx.fillRect(x + (dx - 9) * s, baseY - (h - 40) * s, 18 * s, (h - 100) * s);
    poly(ctx, [[x + (dx - 11) * s, baseY - (h - 40) * s], [x + dx * s, baseY - (h + 10) * s], [x + (dx + 11) * s, baseY - (h - 40) * s]], col.roof);
  });
  ctx.fillStyle = col.window; ctx.beginPath(); ctx.arc(x, baseY - 128 * s, 11 * s, 0, Math.PI * 2); ctx.fill();
  // bridge to the shore
  ctx.fillStyle = col.wall; ctx.fillRect(x + 190 * s, baseY - 10 * s, 150 * s, 6 * s);
  for (let i = 0; i < 5; i++) ctx.fillRect(x + (200 + i * 30) * s, baseY - 6 * s, 5 * s, 10 * s);
}

function windriseTree(ctx, x, gy, s, col) {
  // the giant oak at Windrise
  ctx.fillStyle = col.trunk;
  ctx.beginPath();
  ctx.moveTo(x - 30 * s, gy); ctx.quadraticCurveTo(x - 12 * s, gy - 60 * s, x - 18 * s, gy - 150 * s);
  ctx.lineTo(x + 18 * s, gy - 150 * s); ctx.quadraticCurveTo(x + 12 * s, gy - 60 * s, x + 34 * s, gy);
  ctx.fill();
  const r = rng(3);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const rx = Math.cos(a) * 120 * s, ry = Math.sin(a) * 60 * s;
    ctx.fillStyle = i % 3 === 0 ? col.leafHi : col.leaf;
    ctx.beginPath(); ctx.arc(x + rx * (0.6 + r() * 0.4), gy - 190 * s + ry * (0.6 + r() * 0.4), (40 + r() * 20) * s, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = col.leaf; ctx.beginPath(); ctx.ellipse(x, gy - 190 * s, 110 * s, 60 * s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = col.leafHi; ctx.beginPath(); ctx.ellipse(x - 30 * s, gy - 215 * s, 60 * s, 25 * s, -0.2, 0, Math.PI * 2); ctx.fill();
}

// ------------------------------------------------------------------ sprites
function crystalTexture() {
  const { canvas, ctx } = makeCanvas(64, 64);
  const shard = (bx, by, h, w, tilt, dark, light) => {
    ctx.save(); ctx.translate(bx, by); ctx.rotate(tilt);
    poly(ctx, [[-w, 0], [-w, -h * 0.72], [0, -h], [w, -h * 0.72], [w, 0]], dark);
    poly(ctx, [[-w, 0], [-w, -h * 0.72], [0, -h], [0, 0]], light);
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(-w + 2, -h * 0.65, 2, h * 0.5);
    ctx.restore();
  };
  shard(20, 62, 36, 7, -0.35, '#6c35c9', '#a778ff');
  shard(46, 62, 34, 7, 0.4, '#6c35c9', '#a778ff');
  shard(33, 63, 54, 9, 0.02, '#7b3fe0', '#c29bff');
  ctx.fillStyle = '#4c3a5e'; ctx.beginPath(); ctx.ellipse(32, 62, 28, 5, 0, 0, Math.PI * 2); ctx.fill();
  return canvas;
}

function flowerTexture(kind) {
  const { canvas, ctx } = makeCanvas(40, 56);
  ctx.strokeStyle = '#4f9b35'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(20, 56); ctx.quadraticCurveTo(17, 36, 20, 22); ctx.stroke();
  ctx.fillStyle = '#5fb03e';
  ctx.beginPath(); ctx.ellipse(13, 44, 7, 3, -0.6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(26, 40, 7, 3, 0.6, 0, Math.PI * 2); ctx.fill();
  if (kind === 'aster') {
    // Windwheel Aster: pinwheel petals
    for (let i = 0; i < 6; i++) {
      ctx.save(); ctx.translate(20, 18); ctx.rotate((i / 6) * Math.PI * 2);
      ctx.fillStyle = i % 2 ? '#b9a8ff' : '#e3dcff';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(12, -4, 11, -13); ctx.quadraticCurveTo(4, -9, 0, 0); ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#ffd66b'; ctx.beginPath(); ctx.arc(20, 18, 3.5, 0, Math.PI * 2); ctx.fill();
  } else if (kind === 'dandelion') {
    glow(ctx, 20, 17, 16, '#ffffff', 0.9);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2; ctx.beginPath(); ctx.arc(20 + Math.cos(a) * 10, 17 + Math.sin(a) * 10, 2, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#e6eef0'; ctx.beginPath(); ctx.arc(20, 17, 7, 0, Math.PI * 2); ctx.fill();
  } else {
    // Cecilia: white star flower
    for (let i = 0; i < 5; i++) {
      ctx.save(); ctx.translate(20, 18); ctx.rotate((i / 5) * Math.PI * 2);
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(0, -8, 4, 9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#dbe6ff'; ctx.beginPath(); ctx.ellipse(1, -7, 1.5, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#ffe07a'; ctx.beginPath(); ctx.arc(20, 18, 3, 0, Math.PI * 2); ctx.fill();
  }
  return canvas;
}

function tuftTexture(seed) {
  const { canvas, ctx } = makeCanvas(48, 30);
  const r = rng(seed);
  for (let i = 0; i < 9; i++) {
    const bx = 6 + r() * 36, h = 12 + r() * 16, lean = (r() - 0.5) * 14;
    ctx.fillStyle = i % 3 === 0 ? C.grassHi : i % 2 ? C.grass : '#6bbd43';
    ctx.beginPath(); ctx.moveTo(bx - 3, 30); ctx.quadraticCurveTo(bx + lean * 0.3, 30 - h * 0.6, bx + lean, 30 - h); ctx.quadraticCurveTo(bx + lean * 0.2 + 2, 30 - h * 0.5, bx + 3, 30); ctx.fill();
  }
  return canvas;
}

function waypointTexture(lit) {
  const { canvas, ctx } = makeCanvas(120, 200);
  // pedestal
  poly(ctx, [[20, 200], [30, 170], [90, 170], [100, 200]], '#8b93a8');
  poly(ctx, [[30, 170], [38, 158], [82, 158], [90, 170]], '#a9b2c6');
  ctx.fillStyle = '#6c738a'; ctx.fillRect(58, 172, 4, 26);
  ctx.strokeStyle = lit ? '#7ff5ff' : '#5e6b82'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(60, 185, 26, 6, 0, 0, Math.PI * 2); ctx.stroke();
  // floating crystal
  const cy = 80;
  const body = lit ? ['#1fb5d9', '#8ff4ff', '#e6feff'] : ['#56627a', '#8391aa', '#b3bdcf'];
  poly(ctx, [[60, cy - 58], [82, cy], [60, cy + 50], [38, cy]], body[0]);
  poly(ctx, [[60, cy - 58], [60, cy + 50], [38, cy]], body[1]);
  poly(ctx, [[60, cy - 58], [70, cy - 10], [60, cy]], body[2]);
  // rune ring
  ctx.strokeStyle = lit ? 'rgba(160,250,255,0.9)' : 'rgba(150,160,180,0.5)'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.ellipse(60, cy + 4, 46, 12, 0, 0, Math.PI * 2); ctx.stroke();
  return canvas;
}

function lampTexture(lit) {
  const { canvas, ctx } = makeCanvas(40, 120);
  ctx.fillStyle = '#3d3a44'; ctx.fillRect(17, 30, 6, 90);
  ctx.fillRect(11, 112, 18, 8);
  ctx.fillRect(12, 28, 16, 4);
  poly(ctx, [[8, 28], [20, 14], [32, 28]], '#2d4f7c');
  ctx.fillStyle = lit ? '#ffe39a' : '#6c6f7a'; ctx.fillRect(12, 32, 16, 18);
  ctx.strokeStyle = '#3d3a44'; ctx.lineWidth = 2; ctx.strokeRect(12, 32, 16, 18);
  ctx.beginPath(); ctx.moveTo(20, 32); ctx.lineTo(20, 50); ctx.stroke();
  return canvas;
}

export default {
  key: 'genshin',
  name: 'GENSHIN IMPACT',
  blurb: 'Mondstadt · Starfell Valley',
  accent: '#7ff0ff',
  pixel: false,
  dustTint: 0xeafff0,
  goalHint: 'TELEPORT WAYPOINT UNLOCKED!',
  clearText: 'MONDSTADT CLEARED!',

  paintSky(ctx, W, H) {
    vGradient(ctx, 0, 0, W, H, [[0, '#3f93e6'], [0.45, '#86c8f4'], [0.75, '#cdeefd'], [1, '#f2fbff']]);
    glow(ctx, 1040, 90, 260, '#fff6d8', 0.55);
    glow(ctx, 1040, 90, 70, '#ffffff', 0.9);
  },

  layers() {
    return [
      {
        factor: 0.05, top: 0, height: 380,
        paint(ctx, x0, x1, width) {
          const pos = rng(12);
          for (let x = -100, i = 0; x < width + 200; x += 260 + pos() * 260, i++) {
            const cr = rng(300 + i);
            const y = 70 + cr() * 170, w = 150 + cr() * 240;
            if (x + w * 1.3 < x0 || x - 60 > x1) continue;
            cloud(ctx, x, y, w, '#ffffff', '#d7e3f7', cr);
          }
        },
      },
      {
        // Dragonspine and the far ranges
        factor: 0.12, top: 140, height: 460,
        paint(ctx, x0, x1, width) {
          ridge(ctx, x0, x1, 460, (x) => 250 - fbm(x * 0.003, 4) * 130, '#b6cdea');
          const peak = width * 0.55;
          const mtn = (x) => 70 + Math.pow(Math.abs(x - peak) / 520, 1.3) * 260 + (fbm(x * 0.01, 9) - 0.5) * 30;
          ridge(ctx, x0, x1, 460, mtn, '#9fb8dd');
          // snow cap with cel shade
          ctx.save();
          ctx.beginPath(); ctx.moveTo(x0, 460);
          for (let x = x0; x <= x1 + 4; x += 4) ctx.lineTo(x, mtn(x));
          ctx.lineTo(x1 + 4, 460); ctx.closePath(); ctx.clip();
          ridge(ctx, x0, x1, 0, (x) => 190 + Math.sin(x * 0.03) * 14 + Math.abs(x - peak) * 0.05, '#f4f8ff', 4);
          ctx.fillStyle = 'rgba(160,180,220,0.45)';
          ctx.beginPath(); ctx.moveTo(peak, 60);
          for (let y = 60; y < 460; y += 10) ctx.lineTo(peak + 40 + (y - 60) * 0.9 + Math.sin(y * 0.1) * 10, y);
          ctx.lineTo(x1 + 400, 460); ctx.lineTo(x1 + 400, 0); ctx.closePath(); ctx.fill();
          ctx.restore();
          ridge(ctx, x0, x1, 460, (x) => 330 - fbm(x * 0.004, 17) * 90, '#a9c8e3');
        },
      },
      {
        // Starfell Lake with the city of Mondstadt
        factor: 0.25, top: 100, height: 400,
        paint(ctx, x0, x1, width) {
          const col = { rock: '#9fb0c8', wall: '#c9d4e6', wallLight: '#dfe7f3', roof: '#5f7fae', window: '#8fd0ff' };
          vGradient(ctx, x0, 290, x1 - x0, 110, [[0, '#8fd3ee'], [1, '#b9e6f6']]);
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          const r = rng(4);
          for (let i = 0; i < 90; i++) { const x = x0 + r() * (x1 - x0), y = 300 + r() * 90; ctx.fillRect(x, y, 20 + r() * 50, 2); }
          mondstadtCity(ctx, width * 0.3, 300, 1, col);
          const wm = { wall: '#cfd8e8', shade: '#b4c0d6', roof: '#6b86b3', dark: '#7d8aa3', sail: '#eef3fb', sailFrame: '#8d97ad' };
          windmill(ctx, width * 0.62, 300, 1.2, wm, 0.4);
          windmill(ctx, width * 0.7, 300, 0.9, wm, 1.1);
          windmill(ctx, width * 0.08, 300, 1, wm, 0.8);
          // far shore
          ridge(ctx, x0, x1, 400, (x) => 300 + Math.sin(x * 0.004) * 6 - (fbm(x * 0.006, 2) * 16), '#a8cf9a');
          ctx.globalCompositeOperation = 'source-atop';
          ctx.fillStyle = 'rgba(190,220,245,0.25)'; ctx.fillRect(x0, 0, x1 - x0, 400);
          ctx.globalCompositeOperation = 'source-over';
        },
      },
      {
        // meadows, windmills, Windrise
        factor: 0.45, top: 280, height: 440,
        paint(ctx, x0, x1, width) {
          const hill = (x) => 185 - fbm(x * 0.0025, 5) * 70 + Math.sin(x * 0.001) * 10;
          ridge(ctx, x0, x1, 440, hill, '#8fd65a');
          // cel-shaded highlight along the crest
          ctx.strokeStyle = '#c9f083'; ctx.lineWidth = 6;
          ctx.beginPath(); for (let x = x0; x <= x1; x += 4) ctx.lineTo(x, hill(x) + 3); ctx.stroke();
          ridge(ctx, x0, x1, 440, (x) => hill(x) + 60 + Math.sin(x * 0.01) * 10, '#76c24a');
          const pos = rng(31);
          const treeCol = { trunk: '#7a5236', leaf: '#4f9e3a', leafHi: '#7cc653' };
          for (let x = 80, i = 0; x < width; x += 90 + pos() * 220, i++) {
            if (x < x0 - 100 || x > x1 + 100) continue;
            const tr = rng(700 + i);
            roundTree(ctx, x, hill(x) + 8, 0.9 + tr() * 0.6, treeCol, tr);
          }
          const wm = { wall: '#efe6d6', shade: '#d4c6ad', roof: '#3f6aa6', dark: '#6d5a48', sail: '#fff9ee', sailFrame: '#8a6a4b' };
          [0.18, 0.52, 0.86].forEach((f, i) => { const x = width * f; if (x > x0 - 200 && x < x1 + 200) windmill(ctx, x, hill(x) + 10, 1.5, wm, i * 0.7); });
          const wx = width * 0.38;
          if (wx > x0 - 300 && wx < x1 + 300) windriseTree(ctx, wx, hill(wx) + 20, 1, { trunk: '#7a5236', leaf: '#3f9a3e', leafHi: '#6cc24f' });
        },
      },
    ];
  },

  pitFill(ctx, x0, x1) {
    // Starfell Lake shallows
    vGradient(ctx, x0, 110, x1 - x0, 90, [[0, '#7fd6ee'], [0.3, '#4fb4d8'], [1, '#2a7fb0']]);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    const r = rng(77);
    for (let x = x0; x < x1; x += 40) { ctx.fillRect(x + r() * 30, 118 + r() * 60, 14 + r() * 26, 2); }
    ctx.fillStyle = '#c9f2ff'; ctx.fillRect(x0, 110, x1 - x0, 3);
  },

  paintTerrain(ctx, level, x0, x1) {
    paintSmoothTerrain(ctx, level, x0, x1, {
      radius: 18,
      edgeLight: 'rgba(255,248,230,0.35)',
      edgeDark: 'rgba(60,40,30,0.35)',
      fill(ctx, x, y, c, r, depth) {
        const g = ctx.createLinearGradient(0, y, 0, y + TILE);
        const t0 = Math.min(1, depth / 3), t1 = Math.min(1, (depth + 1) / 3);
        g.addColorStop(0, mix(C.rockTop, C.rockDeep, t0));
        g.addColorStop(1, mix(C.rockTop, C.rockDeep, t1));
        ctx.fillStyle = g; ctx.fillRect(x, y, TILE, TILE);
        // strata lines, continuous across cells
        ctx.strokeStyle = C.rockLine; ctx.lineWidth = 2;
        for (let k = 0; k < 3; k++) {
          const yy = y + 14 + k * 20;
          ctx.beginPath(); ctx.moveTo(x, yy + wave(x, 6, k + r)); ctx.lineTo(x + TILE, yy + wave(x + TILE, 6, k + r)); ctx.stroke();
        }
        speckle(ctx, x, y, TILE, TILE, 4, ['rgba(255,255,255,0.18)', 'rgba(80,60,40,0.2)'], c * 97 + r * 13, [2, 6]);
      },
      block(ctx, x, y) {
        ctx.fillStyle = '#a7adbd'; ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = '#c6ccd9'; ctx.fillRect(x, y, TILE, 8);
        ctx.strokeStyle = '#7ff0ff'; ctx.lineWidth = 2; ctx.strokeRect(x + 16, y + 20, 32, 28);
      },
      top(ctx, x, y, lo, ro) {
        capBand(ctx, x, y - 2, TILE, 26, lo, ro, C.grassDk, { amp: 8, seed: 1, ext: 8 });
        capBand(ctx, x, y - 4, TILE, 18, lo, ro, C.grass, { amp: 6, seed: 2, ext: 6 });
        capBand(ctx, x, y - 4, TILE, 5, lo, ro, C.grassHi, { amp: 2, seed: 3, ext: 4 });
      },
      plat(ctx, x, y, le, re) {
        // wooden bridge planks with rope rails
        ctx.fillStyle = C.woodDk; ctx.fillRect(x, y + 4, TILE, 18);
        for (let i = 0; i < 4; i++) {
          ctx.fillStyle = i % 2 ? C.wood : '#b57f47';
          ctx.fillRect(x + i * 16 + 1, y, 14, 16);
          ctx.fillStyle = C.woodHi; ctx.fillRect(x + i * 16 + 1, y, 14, 3);
        }
        ctx.fillStyle = C.woodDk;
        if (le) { ctx.fillRect(x + 2, y - 26, 6, 48); }
        if (re) { ctx.fillRect(x + TILE - 8, y - 26, 6, 48); }
        ctx.strokeStyle = '#d8c08a'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, y - 20); ctx.quadraticCurveTo(x + TILE / 2, y - 12, x + TILE, y - 20); ctx.stroke();
      },
    });
  },

  decorate(scene, level, add) {
    addTexture(scene, 'w_gi_aster', flowerTexture('aster'));
    addTexture(scene, 'w_gi_dand', flowerTexture('dandelion'));
    addTexture(scene, 'w_gi_cec', flowerTexture('cecilia'));
    for (let i = 0; i < 3; i++) addTexture(scene, 'w_gi_tuft' + i, tuftTexture(i + 3));
    const r = rng(8);
    const busy = new Set(level.ents.hazards.map((h) => h.c));
    if (level.ents.goal) busy.add(level.ents.goal.c);
    level.ents.checkpoints.forEach((k) => busy.add(k.c));
    for (let c = 0; c < level.cols; c++) for (let row = 1; row < ROWS; row++) {
      if (level.at(c, row) !== '#' || level.at(c, row - 1) !== '.' || busy.has(c)) continue;
      const x = c * TILE, y = TOP + row * TILE;
      const k = r();
      add('w_gi_tuft' + Math.floor(r() * 3), x + 10 + r() * 44, y + 6, { depth: 6, sway: 3 });
      if (k < 0.18) add('w_gi_aster', x + 16 + r() * 32, y + 6, { depth: 6, sway: 4 });
      else if (k < 0.3) add('w_gi_dand', x + 16 + r() * 32, y + 6, { depth: 6, sway: 5 });
      else if (k < 0.4) add('w_gi_cec', x + 16 + r() * 32, y + 6, { depth: 6, sway: 3 });
    }
  },

  hazard(scene, h) {
    if (!scene.textures.exists('w_gi_crystal')) addTexture(scene, 'w_gi_crystal', crystalTexture());
    const x = h.x + TILE / 2, y = h.y + TILE + 2;
    const g = scene.add.image(x, y - 26, 'fx-dot').setScale(4).setTint(0xb77dff).setAlpha(0.5).setBlendMode(Phaser.BlendModes.ADD).setDepth(3);
    scene.tweens.add({ targets: g, alpha: 0.25, scale: 3.4, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    scene.add.image(x, y, 'w_gi_crystal').setOrigin(0.5, 1).setDepth(4);
    scene.add.particles(x, y - 30, 'fx-streak', {
      lifespan: 180, frequency: 420, quantity: 2, speed: 0, rotate: { min: 0, max: 360 }, scaleX: { min: 0.3, max: 0.7 }, scaleY: 0.6,
      x: { min: -18, max: 18 }, y: { min: -24, max: 16 }, tint: 0xe0c6ff, blendMode: 'ADD',
    }).setDepth(5);
    return { x: h.x + 12, y: h.y + 20, w: TILE - 24, h: TILE - 20 };
  },

  ambient(scene) {
    // dandelion seeds drifting on the wind + anemo streaks
    scene.add.particles(0, 0, 'fx-dot', {
      x: { min: -60, max: 1280 }, y: { min: 60, max: 620 }, lifespan: 9000, speedX: { min: 25, max: 60 }, speedY: { min: -12, max: 8 },
      scale: { min: 0.12, max: 0.22 }, alpha: { start: 0.9, end: 0 }, frequency: 180, tint: 0xffffff,
    }).setScrollFactor(0).setDepth(25);
    scene.add.particles(0, 0, 'fx-streak', {
      x: { min: 0, max: 1300 }, y: { min: 80, max: 520 }, lifespan: 1100, speedX: { min: 260, max: 420 }, speedY: { min: -30, max: 30 },
      scaleX: { min: 1.5, max: 3 }, scaleY: 0.5, alpha: { start: 0.55, end: 0 }, frequency: 450, tint: 0x9ff8e4, blendMode: 'ADD',
    }).setScrollFactor(0).setDepth(24);
  },

  checkpoint(scene, k) {
    if (!scene.textures.exists('w_gi_lamp0')) { addTexture(scene, 'w_gi_lamp0', lampTexture(false)); addTexture(scene, 'w_gi_lamp1', lampTexture(true)); }
    const img = scene.add.image(k.x, k.y + 4, 'w_gi_lamp0').setOrigin(0.5, 1).setDepth(7);
    const light = scene.add.image(k.x, k.y - 72, 'fx-dot').setScale(4).setTint(0xffd98a).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD).setDepth(8);
    return {
      activate() {
        img.setTexture('w_gi_lamp1');
        scene.tweens.add({ targets: light, alpha: 0.7, duration: 300 });
        scene.tweens.add({ targets: light, scale: 3.4, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      },
    };
  },

  goal(scene, gl) {
    addTexture(scene, 'w_gi_wp0', waypointTexture(false));
    addTexture(scene, 'w_gi_wp1', waypointTexture(true));
    const base = scene.add.image(gl.x, gl.y + 4, 'w_gi_wp0').setOrigin(0.5, 1).setDepth(-2);
    scene.tweens.add({ targets: base, y: gl.y + 1, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    const halo = scene.add.image(gl.x, gl.y - 120, 'fx-dot').setScale(7).setTint(0x6ff2ff).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD).setDepth(-3);
    const beam = scene.add.rectangle(gl.x, gl.y - 60, 34, 900, 0x9ff8ff, 0).setOrigin(0.5, 1).setBlendMode(Phaser.BlendModes.ADD).setDepth(-4);
    return {
      zone: { x: gl.x - 50, y: gl.y - 200, w: 100, h: 200 },
      activate() {
        base.setTexture('w_gi_wp1');
        scene.tweens.add({ targets: halo, alpha: 0.75, duration: 600 });
        scene.tweens.add({ targets: beam, fillAlpha: 0.18, duration: 900 });
        scene.add.particles(gl.x, gl.y - 100, 'fx-dot', {
          x: { min: -40, max: 40 }, y: { min: -60, max: 60 }, lifespan: 1400, speedY: { min: -80, max: -30 },
          scale: { start: 0.35, end: 0 }, tint: [0x9ff8ff, 0xffffff], frequency: 70, blendMode: 'ADD',
        }).setDepth(-1);
      },
      celebrate() {
        scene.tweens.add({ targets: beam, fillAlpha: 0.5, scaleX: 3, duration: 500, yoyo: true, repeat: 1 });
        scene.tweens.add({ targets: halo, scale: 12, duration: 700 });
      },
    };
  },

  post(scene) {
    // soft sun shafts from the upper right
    const { canvas, ctx } = makeCanvas(1280, 720);
    for (let i = 0; i < 5; i++) {
      const x = 700 + i * 150;
      const g = ctx.createLinearGradient(x, 0, x - 500, 720);
      g.addColorStop(0, 'rgba(255,250,220,0.16)');
      g.addColorStop(1, 'rgba(255,250,220,0)');
      ctx.fillStyle = g;
      poly(ctx, [[x, -10], [x + 50 + i * 10, -10], [x - 420, 730], [x - 520, 730]]);
      ctx.fill();
    }
    addTexture(scene, 'w_gi_rays', canvas);
    const rays = scene.add.image(0, 0, 'w_gi_rays').setOrigin(0).setScrollFactor(0).setDepth(45).setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({ targets: rays, alpha: 0.55, duration: 3000, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  },
};
