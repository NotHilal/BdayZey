import Phaser from 'phaser';
import { TILE, TOP } from './levels.js';
import { makeCanvas, addTexture, hexToRgb } from './art/util.js';
import { sfx } from './sfx.js';
import { ui } from './ui.js';

// Level mechanics that every world shares: secret alcoves, timed doors and
// pressure plates, franui carriers, wind currents, set-piece triggers and the
// enemy loop. The look comes from the world module (see AI_HANDOFF.md):
//   world.enemy(scene, thing, level)   -> { update(ms, dt, player) -> 'kill'?, hitbox(), stompable, stomp(), reset() }
//   world.carrier(scene, thing)        -> { obj, carryY, tick?(ms, moving) }
//   world.setpiece(scene, level)       -> { trigger?(id), update?(ms, dt, player) -> 'kill'?, reset?(), win?() }
//   world.mech = { door, trim, plate } colors; world.caveColor; world.windTint

export const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
export const colX = (c) => c * TILE + TILE / 2;
export const rowFeet = (r) => TOP + (r + 1) * TILE;
const approach = (v, t, s) => (v < t ? Math.min(v + s, t) : Math.max(v - s, t));
const hexNum = (h) => { const [r, g, b] = hexToRgb(h); return (r << 16) | (g << 8) | b; };

// Deterministic back-and-forth motion (depends only on time, so it looks the
// same on every client). Returns x and the walking direction (0 while pausing).
export function pingPong(ms, x0, x1, speed, pause = 500) {
  const len = Math.abs(x1 - x0);
  if (len < 1 || speed <= 0) return { x: x0, dir: 0 };
  const run = (len / speed) * 1000, leg = run + pause;
  const u = ms % (leg * 2);
  if (u < leg) { const k = Math.min(1, u / run); return { x: x0 + k * len, dir: k < 1 ? 1 : 0 }; }
  const k = Math.min(1, (u - leg) / run);
  return { x: x1 - k * len, dir: k < 1 ? -1 : 0 };
}

export class Mechanics {
  // opts.duo: include the co-op pieces (things marked duo) that only exist online
  constructor(scene, level, world, opts = {}) {
    this.scene = scene; this.level = level; this.world = world;
    this.t = 0;
    this.remoteRect = null; // the duo partner's body, set by DuoLink
    // What enemies and set-pieces see. players: the living players ({x, cy, bottom});
    // nearest(x): the closest one, for aiming/aggro. In duo the host decides for both
    // (follow = false) and the guest only mirrors the host's state (follow = true);
    // emit(kind, data) sends a set-piece event to the partner (set.receive on their side).
    this.ai = {
      follow: false, players: [], emit: () => {},
      nearest(x) { let best = null; for (const q of this.players) if (!best || Math.abs(q.x - x) < Math.abs(best.x - x)) best = q; return best; },
    };
    const of = (type) => level.things.filter((t) => t.type === type && (!t.duo || opts.duo));
    this.secrets = of('secret').map((t) => this.secret(t));
    this.doors = {};
    of('door').forEach((t) => { this.doors[t.id] = this.door(t); });
    this.plates = of('plate').map((t) => this.plate(t));
    this.cracks = of('crack').map((t, i) => this.crack(t, i));
    this.levers = of('lever').map((t) => this.lever(t));
    this.winds = of('wind').map((t) => this.wind(t));
    this.triggers = of('trigger').map((t) => ({ ...t, x: t.c * TILE, fired: false }));
    this.carriers = new Map(of('carrier').map((t) => [t, this.carrier(t)]));
    this.enemies = of('enemy').map((t) => world.enemy?.(scene, t, level)).filter(Boolean);
    this.set = world.setpiece?.(scene, level) || {};
  }

  // ------------------------------------------------------------ secrets
  secret(t) {
    const s = this.scene, w = this.world;
    const x = t.c * TILE, y = TOP + t.r * TILE, W = t.w * TILE, H = t.h * TILE;
    s.add.rectangle(x, y, W, H, w.caveColor ?? 0x000000, 0.6).setOrigin(0).setDepth(-0.5);
    // the fake wall is the world's own terrain painter, clipped to the alcove
    const { canvas, ctx } = makeCanvas(W, H);
    ctx.imageSmoothingEnabled = w.pixel === false;
    ctx.save();
    ctx.translate(-x, -y);
    ctx.beginPath(); ctx.rect(x, y, W, H); ctx.clip();
    w.paintTerrain(ctx, this.level.view, x, x + W);
    ctx.restore();
    const key = `w_secret_${t.c}_${t.r}`;
    addTexture(s, key, canvas, w.pixel !== false);
    const img = s.add.image(x, y, key).setOrigin(0).setDepth(12);
    // an occasional glint gives curious players a hint
    const glint = s.add.particles(0, 0, 'fx-star', {
      x: { min: x + 10, max: x + W - 10 }, y: { min: y + 10, max: y + H - 10 }, lifespan: 700,
      scale: { start: 0.4, end: 0 }, alpha: { start: 0.8, end: 0 }, frequency: 1600, tint: 0xfff3c4, blendMode: 'ADD',
    }).setDepth(13);
    return { rect: { x, y, w: W, h: H }, img, glint, found: false };
  }

  reveal(sec) {
    sec.found = true;
    sec.glint.stop();
    this.scene.tweens.add({ targets: sec.img, alpha: 0.12, duration: 350 });
    sfx.secret();
    ui.toast('SECRET FOUND!');
  }

  // ------------------------------------------------------ doors & plates
  door(t) {
    const s = this.scene, m = this.world.mech || {};
    const x = t.c * TILE, y = TOP + t.r * TILE, H = t.h * TILE;
    const key = `w_door_${t.h}`;
    if (!s.textures.exists(key)) {
      const { canvas, ctx } = makeCanvas(56, H);
      ctx.fillStyle = m.trim || '#555b66'; ctx.fillRect(0, 0, 56, H);
      ctx.fillStyle = m.door || '#3a414b'; ctx.fillRect(4, 4, 48, H - 8);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (let yy = 16; yy < H - 8; yy += 16) ctx.fillRect(4, yy, 48, 3);
      ctx.fillStyle = this.world.accent; ctx.fillRect(4, H / 2 - 5, 48, 10);
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(4, 4, 6, H - 8);
      addTexture(s, key, canvas);
    }
    const img = s.add.image(x + TILE / 2, y, key).setOrigin(0.5, 0).setDepth(8);
    // gates that start at the top row reach far above the screen: no jumping over
    const up = t.r === 0 ? 400 : 0;
    const zone = s.add.zone(x + TILE / 2, y + H / 2 - up / 2, 48, H + up);
    s.physics.add.existing(zone, true);
    s.physics.add.collider(s.player, zone);
    const barBg = s.add.rectangle(x + TILE / 2, y - 12, 50, 6, 0x000000, 0.5).setDepth(14).setVisible(false);
    const bar = s.add.rectangle(x + 7, y - 12, 50, 6, hexNum(this.world.accent)).setOrigin(0, 0.5).setDepth(15).setVisible(false);
    const d = {
      rect: { x: x + 8, y, w: 48, h: H }, open: false, until: 0, ms: 0,
      openFor(ms, now) {
        d.until = now + ms; d.ms = ms;
        if (d.open) return;
        d.open = true;
        zone.body.enable = false;
        s.tweens.killTweensOf(img);
        s.tweens.add({ targets: img, scaleY: 0.08, duration: 260, ease: 'Quad.out' });
        // hold plates (short ms) don't need a countdown bar
        const timed = ms >= 1000 && !d.forever;
        barBg.setVisible(timed); bar.setVisible(timed);
        sfx.door();
      },
      // levers open a gate for good
      openForever() { d.forever = true; d.openFor(1e12, 0); },
      close(instant) {
        if (!d.open || d.forever) return;
        d.open = false;
        zone.body.enable = true;
        s.tweens.killTweensOf(img);
        if (instant) img.setScale(1); else s.tweens.add({ targets: img, scaleY: 1, duration: 220, ease: 'Quad.in' });
        barBg.setVisible(false); bar.setVisible(false);
        if (!instant) sfx.door();
      },
      update(now, pr) {
        if (!d.open || d.forever) return;
        const left = d.until - now;
        bar.scaleX = Math.max(0, left / d.ms);
        if (d.ms >= 1000 && Math.ceil(left / 1000) !== d.lastSec) { d.lastSec = Math.ceil(left / 1000); if (left > 0) sfx.tick(); }
        // never close on top of the player
        if (left <= 0 && !(pr && overlap(pr, d.rect))) d.close(false);
      },
    };
    return d;
  }

  // --------------------------------------------- cracked blocks (duo)
  // Drawn with the world's own block look plus cracks; only the cat breaks them.
  crack(t, i) {
    const s = this.scene, w = this.world;
    const x = t.c * TILE, y = TOP + t.r * TILE, W = t.w * TILE, H = t.h * TILE;
    const cells = new Set();
    for (let a = 0; a < t.w; a++) for (let b = 0; b < t.h; b++) cells.add((t.c + a) + ',' + (t.r + b));
    const base = this.level.view;
    const view = { ...base, at: (c, r) => (cells.has(c + ',' + r) ? 'B' : base.at(c, r)) };
    view.solid = (c, r) => { const ch = view.at(c, r); return ch === '#' || ch === 'B'; };
    const { canvas, ctx } = makeCanvas(W, H);
    ctx.imageSmoothingEnabled = w.pixel === false;
    ctx.save();
    ctx.translate(-x, -y);
    ctx.beginPath(); ctx.rect(x, y, W, H); ctx.clip();
    w.paintTerrain(ctx, view, x, x + W);
    ctx.restore();
    // cracks: a dark zigzag with a light edge in every cell
    for (let a = 0; a < t.w; a++) for (let b = 0; b < t.h; b++) {
      const cx = a * TILE, cy = b * TILE;
      const pts = [[cx + 18, cy + 4], [cx + 30, cy + 22], [cx + 22, cy + 34], [cx + 40, cy + 50], [cx + 34, cy + 62]];
      for (const [col, off, lw] of [['rgba(255,255,255,0.35)', 2, 2], ['rgba(20,10,5,0.8)', 0, 3]]) {
        ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath();
        pts.forEach(([px, py], k) => (k ? ctx.lineTo(px + off, py) : ctx.moveTo(px + off, py)));
        ctx.moveTo(cx + 30 + off, cy + 22); ctx.lineTo(cx + 50 + off, cy + 16);
        ctx.stroke();
      }
    }
    const key = `w_crack_${i}`;
    addTexture(s, key, canvas, w.pixel !== false);
    const img = s.add.image(x, y, key).setOrigin(0).setDepth(4);
    const up = t.r === 0 ? 400 : 0;
    const zone = s.add.zone(x + W / 2, y + H / 2 - up / 2, W, H + up);
    s.physics.add.existing(zone, true);
    s.physics.add.collider(s.player, zone);
    return { t, rect: { x, y, w: W, h: H }, img, zone, broken: false };
  }

  // break crack i (returns false if it was already broken)
  smash(i) {
    const k = this.cracks[i];
    if (!k || k.broken) return false;
    k.broken = true;
    k.zone.body.enable = false;
    const s = this.scene, r = k.rect;
    const bits = s.add.particles(0, 0, 'fx-px', {
      x: { min: r.x, max: r.x + r.w }, y: { min: r.y, max: r.y + r.h }, speed: { min: 80, max: 300 }, lifespan: 800,
      scale: { start: 2.4, end: 0 }, gravityY: 900, tint: [0x7a6a5a, 0xb8a58c, 0x4a3f36], emitting: false,
    }).setDepth(30);
    bits.explode(Math.min(80, 14 * k.t.w * k.t.h));
    s.time.delayedCall(900, () => bits.destroy());
    s.tweens.add({ targets: k.img, alpha: 0, duration: 200, onComplete: () => k.img.destroy() });
    s.cameras.main.shake(160, 0.006);
    sfx.boom();
    return true;
  }

  // the crack right in front of a player (pr body rect, facing ±1), or -1
  nearCrack(pr, facing) {
    const reach = { x: facing > 0 ? pr.x : pr.x - 34, y: pr.y - 10, w: pr.w + 34, h: pr.h + 20 };
    return this.cracks.findIndex((k) => !k.broken && overlap(reach, k.rect));
  }

  // --------------------------------------------------------- levers (duo)
  lever(t) {
    const s = this.scene;
    const x = colX(t.c), feet = rowFeet(t.r);
    s.add.rectangle(x, feet - 6, 40, 12, 0x3d3a44).setDepth(7);
    s.add.rectangle(x, feet - 13, 28, 4, 0x5c5866).setDepth(7);
    const handle = s.add.container(x, feet - 12).setDepth(7).setAngle(-35);
    handle.add([s.add.rectangle(0, -18, 5, 36, 0x8a6a3f), s.add.circle(0, -38, 7, hexNum(this.world.accent))]);
    const glowImg = s.add.image(x, feet - 40, 'fx-dot').setScale(1.4).setTint(hexNum(this.world.accent)).setAlpha(0.6).setBlendMode(Phaser.BlendModes.ADD).setDepth(6);
    s.tweens.add({ targets: glowImg, alpha: 0.2, duration: 700, yoyo: true, repeat: -1 });
    return { t, x, feet, on: false, handle, glowImg };
  }

  pull(i) {
    const l = this.levers[i];
    if (!l || l.on) return false;
    l.on = true;
    this.scene.tweens.add({ targets: l.handle, angle: 35, duration: 200, ease: 'Back.out' });
    this.scene.tweens.killTweensOf(l.glowImg);
    l.glowImg.setAlpha(0);
    this.doors[l.t.door]?.openForever();
    sfx.unlock();
    ui.toast('GATE OPEN!');
    return true;
  }

  // the lever a player is standing at, or -1
  nearLever(pr) {
    const cx = pr.x + pr.w / 2, bottom = pr.y + pr.h;
    return this.levers.findIndex((l) => !l.on && Math.abs(cx - l.x) < 52 && Math.abs(bottom - l.feet) < 40);
  }

  plate(t) {
    const s = this.scene, m = this.world.mech || {};
    const x = colX(t.c), feet = rowFeet(t.r);
    s.add.rectangle(x, feet - 3, 56, 8, hexNum(m.trim || '#444a55')).setDepth(7);
    const top = s.add.rectangle(x, feet - 9, 44, 6, hexNum(m.plate || this.world.accent)).setDepth(7);
    const glowImg = s.add.image(x, feet - 10, 'fx-dot').setScale(2.4, 0.8).setTint(hexNum(m.plate || this.world.accent)).setAlpha(0.35).setBlendMode(Phaser.BlendModes.ADD).setDepth(6);
    const p = {
      down: false, x, hold: !t.ms,
      update: (now, pr, onGround, rr) => {
        const onIt = (r) => Math.abs(r.x + r.w / 2 - x) < 36 && Math.abs(r.y + r.h - feet) < 12;
        const on = (!!pr && onGround && onIt(pr)) || (!!rr && onIt(rr));
        // ms 0 = a hold plate: the door is only open while someone stands on it
        if (on) this.doors[t.door]?.openFor(t.ms || 150, now);
        if (on !== p.down) {
          p.down = on;
          top.y = feet - (on ? 5 : 9);
          glowImg.setAlpha(on ? 0.9 : 0.35);
          if (on) sfx.plate();
        }
      },
    };
    return p;
  }

  // -------------------------------------------------------------- wind
  wind(t) {
    const s = this.scene;
    const x = t.c * TILE, w = t.w * TILE, top = TOP + t.top * TILE;
    const tint = this.world.windTint ?? 0xffffff;
    s.add.rectangle(x, top, w, 900, tint, 0.08).setOrigin(0).setDepth(-0.4).setBlendMode(Phaser.BlendModes.ADD);
    s.add.particles(0, 0, 'fx-streak', {
      x: { min: x + 6, max: x + w - 6 }, y: { min: 560, max: 760 }, lifespan: 1300, speedY: { min: -620, max: -380 },
      rotate: -90, scaleX: { min: 1, max: 2.2 }, scaleY: 0.6, alpha: { start: 0.7, end: 0 }, frequency: 40, tint, blendMode: 'ADD',
    }).setDepth(24);
    s.add.particles(0, 0, 'fx-dot', {
      x: { min: x, max: x + w }, y: { min: top + 60, max: 720 }, lifespan: 1600, speedY: { min: -260, max: -120 }, speedX: { min: -20, max: 20 },
      scale: { start: 0.2, end: 0 }, alpha: { start: 0.8, end: 0 }, frequency: 70, tint, blendMode: 'ADD',
    }).setDepth(24);
    return { rect: { x, y: top, w, h: 900 }, inside: false };
  }

  // ----------------------------------------------------------- carriers
  carrier(t) {
    const made = this.world.carrier?.(this.scene, t) || { obj: this.scene.add.image(0, 0, 'fx-dot'), carryY: 30 };
    const c = { t, obj: made.obj, carryY: made.carryY ?? 40, x: colX(t.c), y: rowFeet(t.r), face: 1 };
    c.update = (ms) => {
      let x, y, moving = true;
      if (t.patrol) {
        const p = pingPong(ms, colX(t.patrol[0]), colX(t.patrol[1]), t.speed || 60, 900);
        x = p.x; y = rowFeet(t.r); moving = p.dir !== 0;
        if (p.dir) c.face = p.dir;
      } else {
        const [rx, ry] = t.orbit || [80, 40];
        const ph = (ms / (t.period || 5000)) * Math.PI * 2;
        x = colX(t.c) + rx * Math.sin(ph);
        y = TOP + t.r * TILE + TILE / 2 + ry * Math.sin(ph * 2);
        c.face = Math.cos(ph) >= 0 ? 1 : -1;
      }
      c.x = x; c.y = y;
      c.obj.setPosition(x, y);
      c.obj.setFlipX(c.face < 0);
      made.tick?.(ms, moving);
    };
    c.update(0);
    return c;
  }

  // ------------------------------------------------------------ per frame
  // p is the player sprite (null in attract/finale mode). Returns what the
  // scene has to react to: { die, bounce, inWind }.
  update(delta, p) {
    this.t += delta;
    const now = this.t, dt = delta / 1000;
    const out = { die: false, bounce: false, inWind: false };
    for (const c of this.carriers.values()) c.update(now);
    const b = p?.body;
    const pr = b && b.enable ? { x: b.x, y: b.y, w: b.width, h: b.height } : null;
    const onGround = !!b && (b.blocked.down || b.touching.down);
    const rr = this.remoteRect;
    this.ai.players = [];
    if (pr) this.ai.players.push({ x: pr.x + pr.w / 2, cy: pr.y + pr.h / 2, bottom: pr.y + pr.h });
    if (rr) this.ai.players.push({ x: rr.x + rr.w / 2, cy: rr.y + rr.h / 2, bottom: rr.y + rr.h });

    for (const d of Object.values(this.doors)) d.update(now, pr);
    for (const pl of this.plates) pl.update(now, pr, onGround, this.remoteRect);
    for (const e of this.enemies) {
      if (e.update?.(now, dt, pr ? p : null) === 'kill') { out.die = true; continue; }
      const hb = pr && e.hitbox?.();
      if (!hb || !overlap(pr, hb)) continue;
      // landing on top of a stompable enemy defeats it
      if (e.stompable && b.velocity.y > 0 && b.prev.y + b.height <= hb.y + 16) { e.stomp(); out.bounce = true; }
      else out.die = true;
    }
    if (this.set.update?.(now, dt, pr ? p : null) === 'kill') out.die = true;
    for (const s of this.secrets) if (!s.found && ((pr && overlap(pr, s.rect)) || (rr && overlap(rr, s.rect)))) this.reveal(s);
    // set-pieces start when either player walks past the trigger
    for (const tr of this.triggers) {
      if (!tr.fired && ((pr && p.x >= tr.x) || (rr && rr.x + rr.w / 2 >= tr.x))) { tr.fired = true; this.set.trigger?.(tr.id); }
    }
    if (!pr) return out;

    for (const w of this.winds) {
      const inside = overlap(pr, w.rect);
      if (inside) {
        out.inWind = true;
        const nearTop = b.y < w.rect.y + 24;
        b.velocity.y = approach(b.velocity.y, nearTop ? -40 : -640, 5200 * dt);
        if (!w.inside) sfx.wind();
      }
      w.inside = inside;
    }
    return out;
  }

  // after a respawn at x: enemies come back, doors shut, set-pieces re-arm
  reset(rx) {
    this.enemies.forEach((e) => e.reset?.());
    Object.values(this.doors).forEach((d) => d.close(true));
    this.triggers.forEach((tr) => { if (tr.x > rx) tr.fired = false; });
    this.set.reset?.();
  }
}
