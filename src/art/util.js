// Canvas painting helpers shared by every world.

export function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(w));
  canvas.height = Math.max(1, Math.ceil(h));
  const ctx = canvas.getContext('2d');
  return { canvas, ctx };
}

// Deterministic PRNG so worlds look the same on every load.
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hash-based value noise, smooth and periodic-free; good enough for terrain wobble.
function hash(n) {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}
export function noise1(x, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash(i + seed * 57.3) * (1 - u) + hash(i + 1 + seed * 57.3) * u;
}
export function fbm(x, seed = 0, oct = 3) {
  let v = 0, amp = 0.5, freq = 1, tot = 0;
  for (let i = 0; i < oct; i++) {
    v += noise1(x * freq, seed + i * 13) * amp;
    tot += amp; amp *= 0.5; freq *= 2;
  }
  return v / tot;
}

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgba(hex, a = 1) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
export function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}

export function vGradient(ctx, x, y, w, h, stops) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

export function glow(ctx, x, y, r, color, alpha = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

export function poly(ctx, pts, fill) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
}

export function roundRect(ctx, x, y, w, h, r, fill) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
}

// A ridge line across [x0,x1] drawn as a filled silhouette down to `bottom`.
export function ridge(ctx, x0, x1, bottom, fn, fill, step = 4) {
  ctx.beginPath();
  ctx.moveTo(x0, bottom);
  for (let x = x0; x <= x1 + step; x += step) ctx.lineTo(x, fn(x));
  ctx.lineTo(x1 + step, bottom);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

// Fluffy cloud from overlapping circles, shaded bottom.
export function cloud(ctx, x, y, w, color = '#ffffff', shade = '#dfe8f5', r = rng(1)) {
  const puffs = [];
  const n = Math.max(3, Math.round(w / 38));
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const px = x + t * w;
    const rad = (w / n) * (0.8 + Math.sin(t * Math.PI) * 0.9) * (0.85 + r() * 0.3);
    puffs.push([px, y - Math.sin(t * Math.PI) * rad * 0.55, rad]);
  }
  ctx.fillStyle = shade;
  puffs.forEach(([px, py, rad]) => { ctx.beginPath(); ctx.arc(px, py + rad * 0.18, rad, 0, Math.PI * 2); ctx.fill(); });
  ctx.fillStyle = color;
  puffs.forEach(([px, py, rad]) => { ctx.beginPath(); ctx.arc(px - rad * 0.08, py - rad * 0.05, rad * 0.9, 0, Math.PI * 2); ctx.fill(); });
}

// Draw a string-grid sprite. palette maps chars to colors; '.' is transparent.
export function drawGrid(ctx, rows, palette, scale = 1, ox = 0, oy = 0, flip = false) {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      const color = palette[ch];
      if (!color) continue;
      const cc = flip ? row.length - 1 - c : c;
      ctx.fillStyle = color;
      ctx.fillRect(ox + cc * scale, oy + r * scale, scale, scale);
    }
  }
}

// Register a canvas as a Phaser texture (replacing any stale one).
export function addTexture(scene, key, canvas, nearest = false) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  if (!(canvas instanceof HTMLCanvasElement)) {
    const c = makeCanvas(canvas.width, canvas.height);
    c.ctx.drawImage(canvas, 0, 0);
    canvas = c.canvas;
  }
  const tex = scene.textures.addCanvas(key, canvas);
  if (nearest) tex.setFilter(1); // Phaser.Textures.FilterMode.NEAREST
  return tex;
}

// Paint a very wide image in <=2048px chunks (GPU texture limits on phones).
// paint(ctx) draws in full-layer coordinates; each chunk is translated.
export function chunkedImage(scene, keyBase, width, height, paint, opts = {}) {
  const CH = 2048;
  const images = [];
  for (let x0 = 0, i = 0; x0 < width; x0 += CH, i++) {
    const w = Math.min(CH, width - x0);
    const { canvas, ctx } = makeCanvas(w, height);
    ctx.imageSmoothingEnabled = !opts.nearest;
    ctx.save();
    ctx.translate(-x0, 0);
    paint(ctx, x0, x0 + w);
    ctx.restore();
    const key = `${keyBase}_${i}`;
    addTexture(scene, key, canvas, opts.nearest);
    images.push({ key, x: x0 });
  }
  return images;
}
