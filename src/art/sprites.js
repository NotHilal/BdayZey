import { makeCanvas, addTexture, hexToRgb, glow } from './util.js';

// ---------------------------------------------------------------------------
// Pixel-art pipeline: paint with vector shapes on a tiny canvas, then snap
// every pixel to the palette, harden alpha, and add a 1px outline. Scaled up
// with nearest-neighbour this reads as hand-made pixel art but lets us
// animate limbs and tail with real angles.
// ---------------------------------------------------------------------------
function pixelize(src, palette, outline) {
  const { width: w, height: h } = src.canvas;
  const img = src.ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const pal = palette.map(hexToRgb);
  const solid = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = d[i * 4 + 3];
    if (a < 110) { d[i * 4 + 3] = 0; continue; }
    // un-premultiply towards the fill color then snap to palette
    let best = 0, bd = 1e9;
    for (let p = 0; p < pal.length; p++) {
      const dr = d[i * 4] - pal[p][0], dg = d[i * 4 + 1] - pal[p][1], db = d[i * 4 + 2] - pal[p][2];
      const dist = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
      if (dist < bd) { bd = dist; best = p; }
    }
    d[i * 4] = pal[best][0]; d[i * 4 + 1] = pal[best][1]; d[i * 4 + 2] = pal[best][2]; d[i * 4 + 3] = 255;
    solid[i] = 1;
  }
  if (outline) {
    const oc = hexToRgb(outline);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (solid[i]) continue;
      const n = (x > 0 && solid[i - 1]) || (x < w - 1 && solid[i + 1]) || (y > 0 && solid[i - w]) || (y < h - 1 && solid[i + w]);
      if (n) { d[i * 4] = oc[0]; d[i * 4 + 1] = oc[1]; d[i * 4 + 2] = oc[2]; d[i * 4 + 3] = 255; }
    }
  }
  src.ctx.putImageData(img, 0, 0);
  return src;
}

function upscale(src, scale) {
  const out = makeCanvas(src.canvas.width * scale, src.canvas.height * scale);
  out.ctx.imageSmoothingEnabled = false;
  out.ctx.drawImage(src.canvas, 0, 0, out.canvas.width, out.canvas.height);
  return out;
}

// ------------------------------- raccoon -----------------------------------
export const RACCOON = { W: 43, H: 28, SCALE: 3 };
const R = {
  outline: '#17161d',
  furDark: '#4f4f5a',
  fur: '#7e7f8b',
  furLight: '#a9aab4',
  belly: '#cfccc4',
  white: '#f4f1ea',
  mask: '#1f1e26',
  nose: '#0c0b0f',
  ring: '#2d2c34',
  paw: '#26252c',
  earIn: '#c98e8e',
  shine: '#ffffff',
};
const R_PAL = Object.values(R);

function ellipse(ctx, x, y, rx, ry, color, rot = 0) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fill();
}
function limb(ctx, x, y, len, angle, width, color, pawColor) {
  // angle 0 = straight down; positive swings forward (to the right)
  const ex = x + Math.sin(angle) * len;
  const ey = y + Math.cos(angle) * len;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
  ellipse(ctx, ex + 0.4, ey - 0.3, width * 0.62, width * 0.5, pawColor);
}

// p: { legs:[backFar, backNear, frontFar, frontNear] angles, bob, tail, squash, blink, mouth }
function drawRaccoon(p) {
  const c = makeCanvas(RACCOON.W, RACCOON.H);
  const ctx = c.ctx;
  const g = RACCOON.H - 1.5; // paw line
  const bob = p.bob || 0;
  const by = 15.5 + bob; // body center y

  ctx.translate(7, 0);
  // --- tail: thick, fluffy, ringed; held back and slightly raised
  const tailBaseX = 9, tailBaseY = by - 2;
  const sway = p.tail || 0;
  const pts = [];
  for (let i = 0; i <= 30; i++) {
    const t = i / 30;
    const x = tailBaseX - t * 11.5;
    const y = tailBaseY - t * 5.2 - Math.sin(t * Math.PI) * 1.6 + Math.sin(sway + t * 2.4) * t * 1.6;
    const r = 3.0 + Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5) * 0.6 - Math.max(0, t - 0.8) * 5;
    pts.push([x, y, r, t]);
  }
  for (const [x, y, r] of pts) ellipse(ctx, x, y, r, r, R.fur);
  for (const [x, y, r] of pts) ellipse(ctx, x + 0.3, y - r * 0.45, r * 0.6, r * 0.4, R.furLight);
  // dark rings painted only onto the tail (source-atop), perpendicular to its direction
  ctx.globalCompositeOperation = 'source-atop';
  ctx.strokeStyle = R.ring;
  ctx.lineWidth = 1.9;
  [0.2, 0.42, 0.64, 0.86, 1.02].forEach((tb, k) => {
    const i = Math.min(pts.length - 2, Math.round(tb * 30));
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    ctx.lineWidth = k === 4 ? 4.5 : 1.9;
    ctx.beginPath(); ctx.moveTo(x0 - nx * 6, y0 - ny * 6); ctx.lineTo(x0 + nx * 6, y0 + ny * 6); ctx.stroke();
  });
  ctx.globalCompositeOperation = 'source-over';

  // --- far-side legs (darker)
  const L = p.legs || [0, 0, 0, 0];
  limb(ctx, 11.5, by + 2, g - by - 2.5, L[0], 3.2, R.ring, R.paw);
  limb(ctx, 22.5, by + 2, g - by - 2.5, L[2], 3.2, R.ring, R.paw);

  // --- body: hunched raccoon back, higher at the hips
  ellipse(ctx, 17, by + 0.5, 8.6, 5.8, R.fur, 0.1);
  ellipse(ctx, 12.8, by - 1.4, 6.4, 5.9, R.fur, 0);
  ellipse(ctx, 13.5, by - 4.2, 5.8, 2.2, R.furDark, -0.05); // darker hunched back
  ellipse(ctx, 19.5, by - 2.6, 4.5, 1.6, R.furDark, 0.25);
  ellipse(ctx, 18, by + 4, 5.5, 1.7, R.furLight, 0.05);

  // --- near-side legs
  limb(ctx, 12.5, by + 2.5, g - by - 3, L[1], 3.6, R.furDark, R.paw);
  limb(ctx, 23.5, by + 2.5, g - by - 3, L[3], 3.6, R.furDark, R.paw);

  // --- head
  const hx = 27 + (p.headX || 0), hy = by - 5.5 + (p.headY || 0);
  // ears
  ctx.fillStyle = R.furDark;
  ctx.beginPath(); ctx.moveTo(hx - 4.8, hy - 1.5); ctx.lineTo(hx - 3.6, hy - 7); ctx.lineTo(hx - 0.8, hy - 3.2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(hx - 1.8, hy - 2.6); ctx.lineTo(hx - 0.2, hy - 7.6); ctx.lineTo(hx + 2.4, hy - 3.2); ctx.fill();
  ctx.fillStyle = R.white;
  ctx.beginPath(); ctx.moveTo(hx - 1.0, hy - 3.2); ctx.lineTo(hx - 0.2, hy - 6.6); ctx.lineTo(hx + 1.4, hy - 3.4); ctx.fill();
  ctx.fillStyle = R.earIn;
  ctx.beginPath(); ctx.moveTo(hx - 0.6, hy - 3.4); ctx.lineTo(hx - 0.2, hy - 5.4); ctx.lineTo(hx + 0.6, hy - 3.6); ctx.fill();
  // skull + cheek ruff
  ellipse(ctx, hx, hy, 5.4, 4.8, R.fur);
  ellipse(ctx, hx - 1.8, hy + 2.6, 3.4, 2.6, R.furLight);
  // white brow + muzzle
  ellipse(ctx, hx + 1.6, hy - 1.9, 3.9, 1.5, R.white, -0.1);
  ellipse(ctx, hx + 4.2, hy + 1.6, 4.0, 2.5, R.white, 0.12);
  // black bandit mask sweeping back to the cheek
  ellipse(ctx, hx + 1.2, hy + 0.2, 4.4, 1.9, R.mask, 0.05);
  ellipse(ctx, hx - 2.4, hy + 0.9, 2.2, 1.5, R.mask, 0.4);
  // eye shine
  if (!p.blink) { ctx.fillStyle = R.shine; ctx.fillRect(Math.round(hx + 2), Math.round(hy - 0.8), 1, 1); }
  // nose
  ellipse(ctx, hx + 7.8, hy + 1.1, 1.3, 1.1, R.nose);
  if (p.mouth) { ctx.fillStyle = R.mask; ctx.fillRect(Math.round(hx + 5), Math.round(hy + 3), 2, 1); }

  // squash & stretch is applied by the game via scale; keep frames clean
  pixelize(c, R_PAL, R.outline);
  return c;
}

// ------------------------------- cat ---------------------------------------
// The duo partner: a fluffy seal-point Ragdoll. Cream body and white chest
// ruff, dark brown mask, ears, legs and plume tail, blue eyes. Same canvas and
// poses as the raccoon so hitbox and animations line up.
const C = {
  outline: '#1a1310',
  point: '#5a3e2e',
  pointDark: '#35241b',
  cream: '#e6d6bc',
  creamLight: '#f5ecdc',
  creamShade: '#c9b393',
  white: '#fbf8f1',
  eye: '#5a95e0',
  shine: '#ffffff',
  nose: '#1f1510',
  earIn: '#8c5e4c',
};
const C_PAL = Object.values(C);

function drawCat(p) {
  const c = makeCanvas(RACCOON.W, RACCOON.H);
  const ctx = c.ctx;
  const g = RACCOON.H - 1.5;
  const bob = p.bob || 0;
  const by = 15.5 + bob;

  ctx.translate(7, 0);
  // --- tail: long fluffy plume in the point color, carried up
  const sway = p.tail || 0;
  const pts = [];
  for (let i = 0; i <= 30; i++) {
    const t = i / 30;
    const x = 9.5 - t * 8.5 - Math.sin(t * Math.PI) * 1.5;
    const y = by - 3 - t * 8.5 + Math.sin(sway + t * 2.6) * t * 1.8;
    pts.push([x, y, 2.8 + Math.sin(Math.min(1, t * 1.3) * Math.PI * 0.5) * 1.9 - Math.max(0, t - 0.9) * 8]);
  }
  for (const [x, y, r] of pts) ellipse(ctx, x, y, r, r, C.point);
  for (const [x, y, r] of pts.slice(4)) ellipse(ctx, x + 0.4, y - r * 0.4, r * 0.5, r * 0.35, C.creamShade);

  // --- far legs
  const L = p.legs || [0, 0, 0, 0];
  limb(ctx, 11.5, by + 2, g - by - 2.5, L[0], 3.2, C.pointDark, C.pointDark);
  limb(ctx, 22.5, by + 2, g - by - 2.5, L[2], 3.2, C.pointDark, C.pointDark);

  // --- body: fluffy, cream with a shaded back
  ellipse(ctx, 17.5, by + 0.6, 8.2, 6.4, C.cream, 0.05);
  ellipse(ctx, 13.5, by - 0.2, 6.2, 6.4, C.cream);
  ellipse(ctx, 15.5, by - 4.6, 6.0, 2.0, C.creamShade, -0.05);
  ellipse(ctx, 18.5, by + 4.4, 5.5, 1.8, C.creamLight, 0.05);
  // fur tufts on the belly line
  [11, 14.5, 18, 21.5].forEach((x) => ellipse(ctx, x, by + 6, 1.5, 1.2, C.cream));

  // --- near legs: seal point legs
  limb(ctx, 12.5, by + 2.5, g - by - 3, L[1], 3.6, C.point, C.pointDark);
  limb(ctx, 23.5, by + 2.5, g - by - 3, L[3], 3.6, C.point, C.pointDark);

  // --- head
  const hx = 26.5 + (p.headX || 0), hy = by - 5.8 + (p.headY || 0);
  // white chest ruff under the chin
  ellipse(ctx, hx - 2.5, hy + 5.2, 4.6, 3.6, C.white);
  ellipse(ctx, hx - 4.5, hy + 6.8, 3.4, 2.6, C.creamLight);
  // ears (dark points)
  ctx.fillStyle = C.point;
  ctx.beginPath(); ctx.moveTo(hx - 5.2, hy - 1.2); ctx.lineTo(hx - 4.2, hy - 7.4); ctx.lineTo(hx - 0.8, hy - 3.4); ctx.fill();
  ctx.beginPath(); ctx.moveTo(hx - 1.4, hy - 2.8); ctx.lineTo(hx + 1.2, hy - 8.0); ctx.lineTo(hx + 3.4, hy - 2.6); ctx.fill();
  ctx.fillStyle = C.earIn;
  ctx.beginPath(); ctx.moveTo(hx - 0.2, hy - 3.2); ctx.lineTo(hx + 1.2, hy - 6.2); ctx.lineTo(hx + 2.2, hy - 3.2); ctx.fill();
  // round fluffy skull and cheek fur
  ellipse(ctx, hx, hy, 6.2, 5.6, C.cream);
  ellipse(ctx, hx - 2.4, hy + 2.4, 3.6, 2.8, C.creamLight);
  // seal-point mask over the face and muzzle
  ellipse(ctx, hx + 2.6, hy + 0.9, 4.2, 3.6, C.point, 0.1);
  ellipse(ctx, hx + 4.6, hy + 1.6, 2.8, 2.2, C.pointDark, 0.1);
  // blue eye
  if (!p.blink) {
    ctx.fillStyle = C.eye; ctx.fillRect(Math.round(hx + 2), Math.round(hy - 0.8), 2, 1);
    ctx.fillStyle = C.shine; ctx.fillRect(Math.round(hx + 2), Math.round(hy - 0.8), 1, 1);
  } else { ctx.fillStyle = C.pointDark; ctx.fillRect(Math.round(hx + 2), Math.round(hy - 0.4), 2, 1); }
  // nose
  ellipse(ctx, hx + 6.8, hy + 1.2, 0.9, 0.8, C.nose);
  if (p.mouth) { ctx.fillStyle = C.pointDark; ctx.fillRect(Math.round(hx + 4.5), Math.round(hy + 3.2), 2, 1); }

  pixelize(c, C_PAL, C.outline);
  return c;
}

const RUN_FRAMES = 8;
// the same poses for every character: idle x4, run x8, jump, fall, happy
function poseFrames(draw) {
  const frames = [];
  const deg = (d) => (d * Math.PI) / 180;
  // idle breathing (4) + blink
  for (let i = 0; i < 4; i++) {
    frames.push(draw({ legs: [deg(-4), deg(4), deg(-3), deg(3)], bob: i === 1 || i === 2 ? 0.5 : 0, tail: i * 0.6, blink: i === 3 }));
  }
  // run cycle: rotary gallop
  for (let i = 0; i < RUN_FRAMES; i++) {
    const ph = (i / RUN_FRAMES) * Math.PI * 2;
    frames.push(draw({
      // trot: diagonal pairs move together
      legs: [deg(Math.sin(ph + Math.PI) * 26), deg(Math.sin(ph) * 28), deg(Math.sin(ph) * 26), deg(Math.sin(ph + Math.PI) * 28)],
      bob: -Math.abs(Math.sin(ph)) * 1.1 + 0.4,
      tail: ph,
      headY: Math.sin(ph * 2) * 0.35,
    }));
  }
  // jump (legs tucked forward/back) and fall (legs reaching)
  frames.push(draw({ legs: [deg(-50), deg(-40), deg(45), deg(55)], bob: -1.2, tail: 1.6, headY: -0.6, mouth: true }));
  frames.push(draw({ legs: [deg(25), deg(15), deg(-20), deg(-10)], bob: -0.5, tail: 3.6, headY: 0.4 }));
  // happy (goal) frame
  frames.push(draw({ legs: [deg(-10), deg(-5), deg(25), deg(35)], bob: -0.6, headY: -1.2, tail: 2.2, mouth: true }));
  return frames;
}
export const raccoonFrames = () => poseFrames(drawRaccoon);

// Playable characters: texture key and animation prefix (<prefix>-idle, -run, ...)
export const CHARACTERS = {
  raccoon: { key: 'raccoon', anim: 'rc', draw: drawRaccoon, name: 'Raccoon' },
  cat: { key: 'cat', anim: 'ct', draw: drawCat, name: 'Cat' },
};

export function buildRaccoon(scene) { return buildCharacter(scene, CHARACTERS.raccoon); }
export function buildCat(scene) { return buildCharacter(scene, CHARACTERS.cat); }

function buildCharacter(scene, ch) {
  const frames = poseFrames(ch.draw);
  const key = ch.key, pre = ch.anim;

  const S = RACCOON.SCALE;
  const fw = RACCOON.W * S, fh = RACCOON.H * S;
  const sheet = makeCanvas(fw * frames.length, fh);
  sheet.ctx.imageSmoothingEnabled = false;
  frames.forEach((f, i) => sheet.ctx.drawImage(f.canvas, i * fw, 0, fw, fh));
  const tex = addTexture(scene, key, sheet.canvas, true);
  frames.forEach((_, i) => tex.add(i, 0, i * fw, 0, fw, fh));

  const anims = scene.anims;
  const mk = (key, list, rate, repeat = -1) => {
    if (anims.exists(key)) anims.remove(key);
    anims.create({ key, frames: list.map((f) => ({ key: ch.key, frame: f })), frameRate: rate, repeat });
  };
  mk(pre + '-idle', [0, 0, 1, 2, 2, 1, 0, 0, 0, 3, 0, 0], 6);
  mk(pre + '-run', Array.from({ length: RUN_FRAMES }, (_, i) => 4 + i), 16);
  mk(pre + '-jump', [4 + RUN_FRAMES], 1, 0);
  mk(pre + '-fall', [5 + RUN_FRAMES], 1, 0);
  mk(pre + '-happy', [6 + RUN_FRAMES], 1, 0);
  return { fw, fh };
}

export { upscale };

// ------------------------------- franui ------------------------------------
// Frozen raspberry dipped in white then milk chocolate: glossy brown bulb
// with the pink bumpy tip peeking out on top.
export function buildFranui(scene) {
  const W = 14, H = 16;
  const c = makeCanvas(W, H);
  const ctx = c.ctx;
  const choc = '#4a2616', chocHi = '#7a4128', chocSh = '#2e160c', white = '#f7eedc';
  const rasp = '#e3346a', raspHi = '#ff7aa3', raspSh = '#a51745';
  // chocolate bulb
  ellipse(ctx, 7, 9.6, 5.6, 5.4, choc);
  ellipse(ctx, 8.4, 11.6, 3.6, 2.8, chocSh);
  ellipse(ctx, 7, 9.2, 5.1, 4.9, choc);
  ellipse(ctx, 4.8, 8.2, 1.4, 2.2, chocHi, -0.3);
  // white chocolate rim where the dip ends
  ellipse(ctx, 7, 5.6, 4.4, 1.4, white);
  // raspberry drupelets
  const bumps = [[4.6, 4.2], [6.4, 3.2], [8.3, 3.4], [9.8, 4.4], [5.4, 2.0], [7.4, 1.6], [9.0, 2.3]];
  bumps.forEach(([x, y]) => ellipse(ctx, x, y, 1.35, 1.25, rasp));
  ellipse(ctx, 6.4, 2.6, 0.6, 0.5, raspHi);
  ellipse(ctx, 9.3, 3.8, 0.5, 0.5, raspSh);
  pixelize(c, [choc, chocHi, chocSh, white, rasp, raspHi, raspSh, '#1a0c06'], '#1a0c06');
  // glossy highlight pixel
  ctx.fillStyle = '#c98a64'; ctx.fillRect(4, 8, 1, 2);
  const up = upscale(c, 3);
  addTexture(scene, 'franui', up.canvas, true);

  // halo behind collectible
  const h = makeCanvas(96, 96);
  glow(h.ctx, 48, 48, 48, '#ffd6e4', 0.55);
  addTexture(scene, 'franui-glow', h.canvas);
}

// ---------------------------- generic FX -----------------------------------
export function buildFx(scene) {
  const dot = makeCanvas(32, 32);
  glow(dot.ctx, 16, 16, 16, '#ffffff', 1);
  addTexture(scene, 'fx-dot', dot.canvas);

  const px = makeCanvas(4, 4);
  px.ctx.fillStyle = '#fff'; px.ctx.fillRect(0, 0, 4, 4);
  addTexture(scene, 'fx-px', px.canvas, true);

  const star = makeCanvas(24, 24);
  const s = star.ctx;
  s.fillStyle = '#fff';
  s.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? 12 : 3;
    s.lineTo(12 + Math.cos(a) * r, 12 + Math.sin(a) * r);
  }
  s.fill();
  addTexture(scene, 'fx-star', star.canvas);

  const puff = makeCanvas(24, 24);
  glow(puff.ctx, 12, 12, 12, '#ffffff', 0.9);
  puff.ctx.fillStyle = 'rgba(255,255,255,.8)';
  puff.ctx.beginPath(); puff.ctx.arc(12, 12, 6, 0, Math.PI * 2); puff.ctx.fill();
  addTexture(scene, 'fx-puff', puff.canvas);

  const petal = makeCanvas(12, 8);
  petal.ctx.fillStyle = '#fff';
  petal.ctx.beginPath(); petal.ctx.ellipse(6, 4, 5.5, 2.8, 0, 0, Math.PI * 2); petal.ctx.fill();
  addTexture(scene, 'fx-petal', petal.canvas);

  const streak = makeCanvas(40, 4);
  const g = streak.ctx.createLinearGradient(0, 0, 40, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,1)');
  streak.ctx.fillStyle = g; streak.ctx.fillRect(0, 0, 40, 4);
  addTexture(scene, 'fx-streak', streak.canvas);
}
