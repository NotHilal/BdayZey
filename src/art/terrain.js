import { TILE, TOP, ROWS } from '../levels.js';
import { rng } from './util.js';

// Generic painter for illustrated (non-pixel) terrain. A world supplies a style:
// {
//   fill(ctx, x, y, c, r, depth)          paint one solid cell body
//   block?(ctx, x, y, c, r, info)           paint a 'B' cell (crate, ruin, ...)
//   top(ctx, x, y, leftOpen, rightOpen, c)  paint the cap on a top-exposed cell
//   plat(ctx, x, y, leftEnd, rightEnd, c)   paint a one-way platform cell
//   radius                                  convex corner rounding (px)
//   edgeLight, edgeDark                     side shading colors
// }
export function paintSmoothTerrain(ctx, level, x0, x1, style) {
  const c0 = Math.max(0, Math.floor(x0 / TILE) - 1);
  const c1 = Math.min(level.cols - 1, Math.ceil(x1 / TILE) + 1);
  const isG = (c, r) => level.at(c, r) === '#' || (r >= ROWS && level.at(c, ROWS - 1) === '#');
  const R = style.radius ?? 14;

  // 1) bodies
  for (let c = c0; c <= c1; c++) {
    let depth = 0;
    for (let r = 0; r < ROWS; r++) {
      const ch = level.at(c, r);
      const x = c * TILE, y = TOP + r * TILE;
      if (ch === '#') {
        depth = isG(c, r - 1) ? depth + 1 : 0;
        style.fill(ctx, x, y, c, r, depth);
      } else if (ch === 'B') {
        (style.block || style.fill)(ctx, x, y, c, r, {
          top: !level.solid(c, r - 1), left: !level.solid(c - 1, r), right: !level.solid(c + 1, r), bottom: !level.solid(c, r + 1),
        });
      }
    }
  }

  // 2) side shading + rounded convex corners for ground
  for (let c = c0; c <= c1; c++) {
    for (let r = 0; r < ROWS; r++) {
      if (!isG(c, r)) continue;
      const x = c * TILE, y = TOP + r * TILE;
      const L = !isG(c - 1, r), Rt = !isG(c + 1, r), U = !isG(c, r - 1), D = r < ROWS - 1 && !isG(c, r + 1);
      if (L) sideShade(ctx, x, y, 1, style.edgeLight || 'rgba(255,255,255,0.18)');
      if (Rt) sideShade(ctx, x + TILE, y, -1, style.edgeDark || 'rgba(0,0,0,0.28)');
      if (D) { const g = ctx.createLinearGradient(0, y + TILE - 14, 0, y + TILE); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.35)'); ctx.fillStyle = g; ctx.fillRect(x, y + TILE - 14, TILE, 14); }
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      if (L && U) cutCorner(ctx, x, y, R, 0);
      if (Rt && U) cutCorner(ctx, x + TILE, y, R, 1);
      if (L && D) cutCorner(ctx, x, y + TILE, R, 2);
      if (Rt && D) cutCorner(ctx, x + TILE, y + TILE, R, 3);
      ctx.restore();
    }
  }

  // 3) caps on exposed tops
  for (let c = c0; c <= c1; c++) {
    for (let r = 0; r < ROWS; r++) {
      if (!isG(c, r) || isG(c, r - 1)) continue;
      const x = c * TILE, y = TOP + r * TILE;
      style.top(ctx, x, y, !isG(c - 1, r) || isG(c - 1, r - 1), !isG(c + 1, r) || isG(c + 1, r - 1), c, r);
    }
  }

  // 4) one-way platforms
  for (let c = c0; c <= c1; c++) {
    for (let r = 0; r < ROWS; r++) {
      if (level.at(c, r) !== '-') continue;
      style.plat(ctx, c * TILE, TOP + r * TILE, level.at(c - 1, r) !== '-', level.at(c + 1, r) !== '-', c, r);
    }
  }
}

function sideShade(ctx, x, y, dir, color) {
  const w = 16;
  const g = ctx.createLinearGradient(x, 0, x + dir * w, 0);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(dir > 0 ? x : x - w, y, w, TILE);
}

// corner: 0=TL 1=TR 2=BL 3=BR ; erases the square corner outside a quarter circle
function cutCorner(ctx, x, y, R, corner) {
  const sx = corner === 1 || corner === 3 ? -1 : 1;
  const sy = corner >= 2 ? -1 : 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + sx * R, y);
  ctx.arc(x + sx * R, y + sy * R, R, sy > 0 ? Math.PI * 1.5 : Math.PI * 0.5, sx > 0 ? Math.PI : 0, (sx > 0) === (sy > 0));
  ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fill();
}

// Shared helpers for styles -------------------------------------------------

// Wavy lower edge for grass-like caps. Returns y offset at absolute x.
export function wave(x, amp = 5, seed = 0) {
  return Math.sin(x * 0.11 + seed) * amp * 0.5 + Math.sin(x * 0.043 + seed * 2.1) * amp * 0.5;
}

// Draws a cap band with a wavy bottom from x..x+w, height h, extending past
// open ends so neighbouring cells join seamlessly.
export function capBand(ctx, x, y, w, h, leftOpen, rightOpen, fill, opts = {}) {
  const ext = opts.ext ?? 6, amp = opts.amp ?? 6, seed = opts.seed ?? 0;
  const xa = x - (leftOpen ? ext : 0), xb = x + w + (rightOpen ? ext : 0);
  ctx.beginPath();
  ctx.moveTo(xa, y + (leftOpen ? 4 : 0));
  if (leftOpen) ctx.quadraticCurveTo(xa, y, xa + 6, y);
  ctx.lineTo(xb - (rightOpen ? 6 : 0), y);
  if (rightOpen) ctx.quadraticCurveTo(xb, y, xb, y + 4);
  for (let px = xb; px >= xa; px -= 3) {
    let d = h + wave(px, amp, seed);
    if (leftOpen && px - xa < 10) d *= (px - xa) / 10 * 0.6 + 0.4;
    if (rightOpen && xb - px < 10) d *= (xb - px) / 10 * 0.6 + 0.4;
    ctx.lineTo(px, y + d);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

// seeded speckles in a cell
export function speckle(ctx, x, y, w, h, n, colors, seed, size = [2, 5]) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[Math.floor(r() * colors.length)];
    const s = size[0] + r() * (size[1] - size[0]);
    ctx.beginPath();
    ctx.ellipse(x + r() * w, y + r() * h, s, s * (0.5 + r() * 0.4), r() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
}
