import { TILE, TOP, ROWS } from './levels.js';
import { overlap } from './mechanics.js';
import { CLIMB_TIME, GRAV } from './player.js';
import { sfx } from './sfx.js';
import { ui } from './ui.js';

// Per-world duo abilities, from the level's kit (duoLevels.js). Most are on Q (F
// works too); glide (jump) and climb (push into a wall) live in player.js and only
// get their HUD/hints here. Worlds without a kit keep the old duo moves.
//
//   Minecraft  cat mine     Q breaks the cracked ore in front of you (on the ground)
//              rac build    tap Q places a block (step / bridge tile / under you in
//                           the air), hold Q takes them all back; 3 blocks
//   Genshin    cat glide    jump, press jump again in the air and hold it
//              rac climb    push into any wall; stamina runs out
//   LoL        cat flash    Q blinks you 3 tiles forward, through thin walls (not
//                           gates or ore); 2.5s cooldown
//              rac shield   hold Q: a shield in front of you stops turret shots,
//                           for whoever is behind it too; you walk slower
//   Valorant   cat recon    Q reveals the hidden platforms for both, 5s; 6s cooldown
//              rac barrier  Q raises a 3-high ice wall in front of you for 6s (one
//                           at a time): a step, or a wall
//   RDR2       cat deadeye  Q slows the world (enemies, movers, gate timers) for both,
//                           3s; 9s cooldown
//              rac lasso    Q ropes the nearest lever in front within 6 tiles, or
//                           else yanks the cat over to you (7 tiles)
// Blocks never press plates, so a gate still needs two players. Everything the
// partner must see goes over the link ('block' and 'ab' messages, and state flags
// for glide/shield in DuoLink).
export const MAX_BLOCKS = 3;
const HOLD_MS = 450;
export const FLASH = { dist: 192, cd: 2500 };
export const RECON = { ms: 5000, cd: 6000 };
export const BARRIER = { ms: 6000, rows: 3 };
export const DEADEYE = { ms: 3000, cd: 9000, scale: 0.3 };
export const LASSO = { lever: 6 * TILE, partner: 7 * TILE, cd: 1200 };

const ICON = { mine: '⛏', build: '🧱', glide: '🪂', wallClimb: '🧗', flash: '⚡', shield: '🛡', recon: '👁', barrier: '🧊', deadeye: '🎯', lasso: '🪢' };

export class Abilities {
  constructor(scene) {
    this.scene = scene;
    this.kit = scene.me.abilities;
    // blocks collide as one tall body per stack (like the terrain), so there are no
    // seams to snag on when you jump up along a tower
    this.group = scene.physics.add.staticGroup();
    scene.physics.add.collider(scene.player, this.group);
    this.mine = []; this.theirs = []; // { c, r, img }
    this.walls = []; // ice barriers { c, r, img, zone, until, mine }
    this.qPrev = false; this.qMs = 0; this.held = false;
    this.cd = 0; this.chip = null;
    this.hints = new Set(); this.t = 0;
    this.key = ui.coarse ? (ICON[this.qKind()] || '✋') : 'Q';
    this.tex = scene.world.buildTexture?.(scene) ?? fallbackTexture(scene);
    this.prompt = scene.add.container(0, 0).setDepth(40).setVisible(false);
    this.prompt.add([
      scene.add.circle(0, 0, 17, 0x000000, 0.6).setStrokeStyle(2, 0xffe27a, 0.9),
      scene.add.text(0, 1, this.key, { fontFamily: '"Press Start 2P"', fontSize: '14px', color: '#ffe27a' }).setOrigin(0.5),
    ]);
    this.fx = scene.add.graphics().setDepth(27);        // shield, lasso rope, stamina
    this.overlay = scene.add.rectangle(0, 0, 1280, 720, 0x7a4a1c, 0).setOrigin(0).setScrollFactor(0).setDepth(90);
    this.rope = null;
    this.updateChip();
  }

  // the kit's Q ability, if any
  qKind() { return ['mine', 'build', 'flash', 'shield', 'recon', 'barrier', 'deadeye', 'lasso'].find((k) => this.kit[k]); }

  get any() { return !!(this.qKind() || this.kit.glide || this.kit.wallClimb); }

  chipText() {
    const k = this.qKind() || (this.kit.glide ? 'glide' : this.kit.wallClimb ? 'wallClimb' : null);
    if (!k) return null;
    const cd = this.cd > 0 ? ` ${Math.ceil(this.cd / 1000)}s` : '';
    const name = { mine: 'MINE', build: `${MAX_BLOCKS - this.mine.length}/${MAX_BLOCKS}`, glide: 'GLIDE', wallClimb: 'CLIMB', flash: 'FLASH', shield: 'SHIELD', recon: 'RECON', barrier: 'ICE WALL', deadeye: 'DEAD EYE', lasso: 'LASSO' }[k];
    return `${ICON[k]} ${name}${cd}`;
  }

  updateChip() {
    const t = this.chipText();
    if (t !== this.chip) { this.chip = t; ui.kitChip(t); }
  }

  hint(id, msg) {
    if (this.hints.has(id)) return;
    this.hints.add(id);
    ui.toast(msg);
  }

  send(k, d = {}) { this.scene.link?.send('ab', { ...d, k }); }

  // ------------------------------------------------------------ per frame
  update(delta, inp) {
    const sc = this.scene, p = sc.player, b = p.body, key = this.key, me = sc.me;
    this.t += delta;
    if (this.cd > 0) this.cd -= delta;
    const alive = !sc.dead && !sc.done && b.enable;
    const q = !!inp.ability && alive;
    const press = q && !this.qPrev;
    const onGround = b.blocked.down || b.touching.down;
    const pr = alive ? { x: b.x, y: b.y, w: b.width, h: b.height } : null;
    this.fx.clear();

    if (this.kit.mine) {
      if (press) this.mineFront(pr, onGround);
    } else if (this.kit.build) {
      if (press) { this.qMs = 0; this.held = false; }
      if (q) {
        this.qMs += delta;
        if (!this.held && this.qMs >= HOLD_MS) { this.held = true; this.recall(true); }
      } else if (this.qPrev && !this.held && alive) this.place(onGround);
    } else if (this.kit.flash) {
      if (press) this.flash();
    } else if (this.kit.shield) {
      this.shieldDir = q ? me.facing : 0;
      me.speedMul = q ? 0.55 : 1;
      if (press) sfx.plate();
      if (this.shieldDir) this.drawShield(this.shieldRect());
    } else if (this.kit.recon) {
      if (press) this.recon();
    } else if (this.kit.barrier) {
      if (press) this.barrier(onGround);
    } else if (this.kit.deadeye) {
      if (press) this.deadeye();
    } else if (this.kit.lasso) {
      if (press) this.lasso();
    }
    this.qPrev = q;

    // partner's shield (drawn from their snapshot)
    if (sc.mech.remoteShield) this.drawShield(sc.mech.remoteShield);
    // ice walls melt
    const now = sc.time.now;
    this.walls = this.walls.filter((w) => { if (now < w.until) return true; this.melt(w); return false; });
    // dead eye tint
    this.overlay.setFillStyle(0x7a4a1c, sc.mech.timeScale < 1 ? 0.22 : 0);
    // lasso rope, briefly
    if (this.rope && now < this.rope.until) this.fx.lineStyle(3, 0xc9a06a, 1).lineBetween(p.x, p.y - 6, this.rope.x, this.rope.y);
    // climbing stamina
    if (this.kit.wallClimb && alive && !onGround && me.climb < CLIMB_TIME) {
      const k = Math.max(0, me.climb / CLIMB_TIME), x = p.x - 24, y = b.y - 18;
      this.fx.fillStyle(0x000000, 0.55).fillRect(x - 2, y - 2, 52, 9);
      this.fx.fillStyle(k > 0.3 ? 0xffe27a : 0xff5a5a, 1).fillRect(x, y, 48 * k, 5);
    }

    // "Q" bubble over ore the cat can mine right now
    const crackI = pr && this.kit.mine ? sc.mech.nearCrack(pr, me.facing) : -1;
    const canMine = crackI >= 0 && onGround;
    this.prompt.setVisible(canMine);
    if (canMine) {
      const k = sc.mech.cracks[crackI].rect;
      this.prompt.setPosition(k.x + k.w / 2, Math.max(60, Math.min(k.y + k.h - 40, b.y - 40)) + Math.sin(this.t / 150) * 3);
    }
    // hints, once each
    if (this.t > 2600) {
      if (this.kit.build) this.hint('build', `RACCOON: TAP ${key} TO BUILD A BLOCK · HOLD ${key} TO TAKE THEM ALL BACK`);
      if (this.kit.mine) this.hint('mine', `CAT: ${key} MINES THE CRACKED ORE IN FRONT OF YOU`);
      if (this.kit.glide) this.hint('glide', 'CAT: JUMP, THEN PRESS JUMP AGAIN AND HOLD IT TO GLIDE');
      if (this.kit.wallClimb) this.hint('climb', 'RACCOON: PUSH INTO A WALL TO CLIMB IT · WATCH YOUR STAMINA');
      if (this.kit.flash) this.hint('flash', `CAT: ${key} FLASHES YOU FORWARD · EVEN THROUGH THIN WALLS`);
      if (this.kit.shield) this.hint('shield', `RACCOON: HOLD ${key} TO RAISE YOUR SHIELD · IT STOPS SHOTS FOR BOTH OF YOU`);
      if (this.kit.recon) this.hint('recon', `CAT: ${key} REVEALS HIDDEN PLATFORMS FOR 5 SECONDS`);
      if (this.kit.barrier) this.hint('barrier', `RACCOON: ${key} RAISES AN ICE WALL IN FRONT OF YOU FOR 6 SECONDS`);
      if (this.kit.deadeye) this.hint('deadeye', `CAT: ${key} IS DEAD EYE · THE WORLD SLOWS DOWN FOR 3 SECONDS`);
      if (this.kit.lasso) this.hint('lasso', `RACCOON: ${key} LASSOES A LEVER, OR THE CAT, FROM AFAR`);
    }
    if (pr && this.kit.build && sc.mech.nearCrack(pr, me.facing) >= 0) this.hint('noMine', 'ONLY THE CAT CAN MINE ORE');
    this.updateChip();
  }

  // ------------------------------------------------------------- mining
  mineFront(pr, onGround) {
    const sc = this.scene;
    if (!pr || !onGround) return;
    const i = sc.mech.nearCrack(pr, sc.me.facing);
    if (i < 0) return;
    if (sc.mech.smash(i, true)) sc.link?.send('crack', { i });
    sc.me.squash(1.25, 0.8);
  }

  // ------------------------------------------------------------ building
  place(onGround) {
    if (this.mine.length >= MAX_BLOCKS) {
      sfx.nope();
      ui.toast(`OUT OF BLOCKS · HOLD ${this.key} TO TAKE THEM BACK`);
      return;
    }
    const cell = this.target(onGround);
    if (!cell) { sfx.nope(); return; }
    // a step right against you: step back a little to make room for it
    if (cell.nudge) { const p = this.scene.player; p.body.reset(p.x + cell.nudge, p.y); }
    this.mine.push(this.add(cell.c, cell.r));
    this.scene.link?.send('block', { op: 'add', c: cell.c, r: cell.r });
    sfx.place();
  }

  // where a tap of Q puts a block right now (or null)
  target(onGround) {
    const sc = this.scene, p = sc.player, b = p.body;
    if (!onGround) {
      // in the air: on top of whatever is below you, if your feet are already above
      // that spot (you land on it). One block per jump, like pillaring in Minecraft;
      // no floating blocks, so a tower grows one row at a time
      const c = Math.floor(p.x / TILE);
      let r = Math.max(0, Math.floor((b.bottom - TOP) / TILE));
      while (r < ROWS && !this.solidAt(c, r)) r++;
      r--;
      if (r < 0 || TOP + r * TILE < b.bottom) return null;
      return this.free(c, r) ? { c, r } : null;
    }
    // on the ground: the column in front of the one you stand in
    const f = sc.me.facing;
    const c = Math.floor(b.center.x / TILE) + f;
    const rs = Math.round((b.bottom - TOP) / TILE); // the row you stand on
    // a gap in front (floor and below it empty): extend the floor, a bridge
    if (this.empty(c, rs) && this.empty(c, rs + 1)) return this.free(c, rs) ? { c, r: rs } : null;
    // otherwise a step at body height; if you're poking into that column, you
    // get nudged back out of it (by at most half a body)
    const nudge = this.nudgeFor(c);
    return this.free(c, rs - 1, nudge) ? { c, r: rs - 1, nudge } : null;
  }

  // how far to move the local player back so they're out of column c
  nudgeFor(c) {
    const b = this.scene.player.body, f = this.scene.me.facing;
    const poke = f > 0 ? b.right - c * TILE : (c + 1) * TILE - b.left;
    return poke > 0 ? -f * poke : 0;
  }

  // nothing in the grid there, and no block yet
  empty(c, r) {
    const lv = this.scene.level;
    if (c < 0 || c >= lv.cols || r < 0 || r >= ROWS) return false;
    if (lv.at(c, r) !== '.' || lv.solidDuo(c, r)) return false;
    return !this.blockAt(c, r) && !this.wallAt(c, r);
  }

  blockAt(c, r) { return [...this.mine, ...this.theirs].find((k) => k.c === c && k.r === r); }
  wallAt(c, r) { return this.walls.find((w) => w.c === c && r >= w.r && r < w.r + BARRIER.rows); }

  // something to stand on: ground, a block, an ice wall, or unbroken ore
  solidAt(c, r) {
    const lv = this.scene.level;
    if (r >= ROWS) return true;
    if (lv.solid(c, r) || lv.solidDuo(c, r) || this.blockAt(c, r) || this.wallAt(c, r)) return true;
    return this.scene.mech.cracks.some((k) => !k.broken && c >= k.t.c && c < k.t.c + k.t.w && r >= k.t.r && r < k.t.r + k.t.h);
  }

  // empty, and nothing else there: players, gates, ore, levers, plates, the goal
  // (nudge: how far the local player will be moved out of the way first)
  free(c, r, nudge = 0) {
    if (!this.empty(c, r)) return false;
    const sc = this.scene, m = sc.mech, b = sc.player.body;
    const cell = { x: c * TILE + 2, y: TOP + r * TILE + 2, w: TILE - 4, h: TILE - 4 };
    if (overlap(cell, { x: b.x + nudge, y: b.y, w: b.width, h: b.height })) return false;
    if (m.remoteRect && overlap(cell, m.remoteRect)) return false;
    if (Object.values(m.doors).some((d) => overlap(cell, d.rect))) return false;
    if (m.cracks.some((k) => !k.broken && overlap(cell, k.rect))) return false;
    if (m.levers.some((l) => l.t.c === c && l.t.r === r)) return false;
    if (m.plates.some((pl) => pl.c === c && pl.r === r)) return false;
    if (overlap(cell, sc.goal.zone)) return false;
    return true;
  }

  add(c, r) {
    const sc = this.scene, x = c * TILE + TILE / 2, y = TOP + r * TILE + TILE / 2;
    const img = sc.add.image(x, y, this.tex).setDepth(3).setScale(0.6);
    sc.tweens.add({ targets: img, scale: 1, duration: 140, ease: 'Back.out' });
    sc.puff(x, y + TILE / 2, 4);
    const k = { c, r, img };
    this.bodies([...this.mine, ...this.theirs, k]);
    return k;
  }

  remove(k) {
    const sc = this.scene;
    sc.tweens.add({ targets: k.img, scale: 0.2, alpha: 0, duration: 160, onComplete: () => k.img.destroy() });
    sc.puff(k.img.x, k.img.y, 5);
  }

  // rebuild the collision: one body per vertical run of blocks/ice in a column
  bodies(blocks = [...this.mine, ...this.theirs]) {
    this.group.clear(true, true);
    const cols = new Map();
    const cells = [...blocks.map((k) => [k.c, k.r])];
    this.walls.forEach((w) => { for (let i = 0; i < BARRIER.rows; i++) cells.push([w.c, w.r + i]); });
    cells.forEach(([c, r]) => { if (!cols.has(c)) cols.set(c, []); cols.get(c).push(r); });
    for (const [c, rows] of cols) {
      rows.sort((a, b) => a - b);
      for (let i = 0; i < rows.length;) {
        let j = i;
        while (j + 1 < rows.length && rows[j + 1] === rows[j] + 1) j++;
        const h = (j - i + 1) * TILE, z = this.scene.add.zone(c * TILE + TILE / 2, TOP + rows[i] * TILE + h / 2, TILE, h);
        this.group.add(z);
        z.body.updateFromGameObject?.();
        i = j + 1;
      }
    }
  }

  // take all my blocks back (hold Q, or after a respawn)
  recall(announce) {
    if (!this.mine.length) return;
    this.mine.forEach((k) => this.remove(k));
    this.mine = [];
    this.bodies(this.theirs);
    this.scene.link?.send('block', { op: 'clear' });
    if (announce) sfx.place();
  }

  // the partner's blocks ('block' messages)
  remote(d) {
    if (d.op === 'add' && !this.blockAt(d.c, d.r)) this.theirs.push(this.add(d.c, d.r));
    else if (d.op === 'clear') { this.theirs.forEach((k) => this.remove(k)); this.theirs = []; this.bodies(this.mine); }
  }

  // --------------------------------------------------------------- flash
  // blink forward up to FLASH.dist: through thin terrain walls, but not through a
  // gate or ore (those are puzzles), and never into anything
  flash() {
    const sc = this.scene, p = sc.player, b = p.body, f = sc.me.facing;
    if (this.cd > 0 || !b.enable) { sfx.nope(); return; }
    let d = 0;
    for (let k = FLASH.dist; k >= 32; k -= 8) {
      const rect = { x: b.x + f * k, y: b.y, w: b.width, h: b.height };
      if (this.clearRect(rect) && !this.lockedBetween(b.x, rect.x, b)) { d = k; break; }
    }
    if (!d) { sfx.nope(); return; }
    const vx = b.velocity.x, vy = b.velocity.y;
    sc.puff(p.x, b.center.y, 10);
    b.reset(p.x + f * d, p.y);
    b.setVelocity(vx, Math.min(vy, 0));
    sc.puff(p.x, b.center.y, 10);
    sc.me.squash(1.3, 0.8);
    sfx.zap();
    this.cd = FLASH.cd;
  }

  // a body-sized rect fits there: no terrain, blocks, ice, closed gates, ore; in the level
  clearRect(rect) {
    const sc = this.scene, lv = sc.level, m = sc.mech;
    if (rect.x < 0 || rect.x + rect.w > lv.width) return false;
    const c0 = Math.floor(rect.x / TILE), c1 = Math.floor((rect.x + rect.w - 1) / TILE);
    const r0 = Math.floor((rect.y - TOP) / TILE), r1 = Math.floor((rect.y + rect.h - 1 - TOP) / TILE);
    for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) if (r >= 0 && this.solidAt(c, r)) return false;
    if (Object.values(m.doors).some((d) => !d.open && overlap(rect, d.rect))) return false;
    return !m.cracks.some((k) => !k.broken && overlap(rect, k.rect));
  }

  // a closed gate or unbroken ore between x0 and x1 at body height
  lockedBetween(x0, x1, b) {
    const m = this.scene.mech, span = { x: Math.min(x0, x1), y: b.y, w: Math.abs(x1 - x0) + b.width, h: b.height };
    return Object.values(m.doors).some((d) => !d.open && overlap(span, d.rect)) || m.cracks.some((k) => !k.broken && overlap(span, k.rect));
  }

  // -------------------------------------------------------------- shield
  shieldRect(dir = this.shieldDir) {
    const b = this.scene.player.body;
    return dir ? { x: dir > 0 ? b.right + 2 : b.left - 18, y: b.bottom - 110, w: 16, h: 110 } : null;
  }

  drawShield(r) {
    this.fx.fillStyle(0x3fb8ff, 0.35).fillRoundedRect(r.x, r.y, r.w, r.h, 6);
    this.fx.lineStyle(3, 0xc8aa6e, 1).strokeRoundedRect(r.x, r.y, r.w, r.h, 6);
  }

  // does a shot at (x, y) hit a raised shield (mine or the partner's)?
  shieldHit(x, y, rad = 10) {
    const hit = (r) => r && x + rad > r.x && x - rad < r.x + r.w && y + rad > r.y && y - rad < r.y + r.h;
    return hit(this.shieldDir ? this.shieldRect() : null) || hit(this.scene.mech.remoteShield);
  }

  // --------------------------------------------------------------- recon
  recon() {
    if (this.cd > 0) { sfx.nope(); return; }
    this.cd = RECON.cd;
    this.revealed(true);
    this.send('recon');
  }

  revealed(mine) {
    const sc = this.scene, p = sc.player;
    sc.mech.reveal(RECON.ms);
    sfx.secret();
    if (mine) {
      const ring = sc.add.circle(p.x, p.y, 20).setStrokeStyle(4, 0x3fe0c5, 0.9).setDepth(28);
      sc.tweens.add({ targets: ring, scale: 30, alpha: 0, duration: 700, onComplete: () => ring.destroy() });
    }
  }

  // ------------------------------------------------------------- barrier
  barrier(onGround) {
    const sc = this.scene, b = sc.player.body, f = sc.me.facing;
    if (!onGround) { sfx.nope(); return; }
    const c = Math.floor(b.center.x / TILE) + f, rs = Math.round((b.bottom - TOP) / TILE);
    const top = rs - BARRIER.rows;
    const old = this.walls.find((w) => w.mine);
    // same spot again: the wall just lasts longer
    if (old && old.c === c && old.r === top) { old.until = sc.time.now + BARRIER.ms; sfx.place(); this.send('barrier', { c, r: top }); return; }
    // a new wall replaces my old one: check the space as if the old one were gone,
    // and keep the old one if the new spot doesn't work
    const nudge = this.nudgeFor(c);
    this.walls = this.walls.filter((w) => w !== old);
    let ok = top >= 0 && this.solidAt(c, rs);
    for (let r = top; ok && r < rs; r++) ok = this.free(c, r, nudge);
    if (old) this.walls.push(old);
    if (!ok) { sfx.nope(); return; }
    if (old) { this.melt(old); this.walls = this.walls.filter((w) => w !== old); }
    if (nudge) { const p = sc.player; b.reset(p.x + nudge, p.y); }
    this.raise(c, top, true);
    this.send('barrier', { c, r: top });
  }

  raise(c, r, mine) {
    const sc = this.scene, x = c * TILE + TILE / 2, h = BARRIER.rows * TILE;
    const img = sc.add.image(x, TOP + (r + BARRIER.rows) * TILE, iceTexture(sc)).setOrigin(0.5, 1).setDepth(3).setScale(1, 0.1);
    sc.tweens.add({ targets: img, scaleY: 1, duration: 180, ease: 'Back.out' });
    // one wall per player: a new one replaces the old (the same spot: it lasts longer)
    const same = this.walls.find((w) => w.mine === mine && w.c === c && w.r === r);
    if (same) { same.until = sc.time.now + BARRIER.ms; return h; }
    const prev = this.walls.find((w) => w.mine === mine);
    if (prev) this.melt(prev);
    this.walls = this.walls.filter((w) => w !== prev);
    this.walls.push({ c, r, img, until: sc.time.now + BARRIER.ms, mine });
    this.bodies();
    sfx.place();
    return h;
  }

  melt(w) {
    const sc = this.scene;
    sc.tweens.add({ targets: w.img, alpha: 0, scaleY: 0.2, duration: 220, onComplete: () => w.img.destroy() });
    sc.time.delayedCall(0, () => this.bodies());
  }

  // ------------------------------------------------------------- dead eye
  deadeye() {
    if (this.cd > 0) { sfx.nope(); return; }
    this.cd = DEADEYE.cd;
    this.slowed();
    this.send('deadeye');
  }

  slowed() {
    this.scene.mech.slow(DEADEYE.ms, DEADEYE.scale);
    sfx.beep(false);
    this.scene.cameras.main.flash(120, 255, 200, 120, false);
  }

  // ---------------------------------------------------------------- lasso
  // a lever in front within range first; otherwise the cat, if she's in range
  lasso() {
    const sc = this.scene, p = sc.player, m = sc.mech, f = sc.me.facing;
    if (this.cd > 0) { sfx.nope(); return; }
    let best = -1, bd = 1e9;
    m.levers.forEach((l, i) => {
      const dx = (l.x - p.x) * f, dy = Math.abs(l.feet - 20 - p.y);
      if (!l.on && dx > -24 && dx < LASSO.lever && dy < 5 * TILE && dx < bd) { best = i; bd = dx; }
    });
    if (best >= 0) {
      const l = m.levers[best];
      this.rope = { x: l.x, y: l.feet - 40, until: sc.time.now + 350 };
      if (m.pull(best)) sc.link?.send('lever', { i: best });
      this.cd = LASSO.cd;
      sfx.cluck();
      return;
    }
    const r = m.remoteRect;
    if (r) {
      const rx = r.x + r.w / 2, ry = r.y + r.h / 2;
      const dist = Math.hypot(rx - p.x, ry - p.y);
      if (dist < LASSO.partner && dist > 90) {
        this.rope = { x: rx, y: ry, until: sc.time.now + 450 };
        this.send('lasso', { x: Math.round(p.x - f * 60), y: Math.round(sc.player.body.bottom) });
        this.cd = LASSO.cd;
        sfx.cluck();
        return;
      }
    }
    sfx.nope();
  }

  // yanked by the raccoon's lasso: fly an arc to (x, feet y) next to him
  yanked(d) {
    const sc = this.scene, b = sc.player.body;
    if (sc.dead || sc.done || !b.enable) return;
    const T = 0.62, dx = d.x - sc.player.x, dy = d.y - 30 - b.bottom;
    // rising part uses plain gravity, the fall part a bit more: aim with the average
    const g = GRAV * 1.1;
    sc.me.launch(dx / T, (dy - 0.5 * g * T * T) / T, T * 1000);
    sfx.jump();
  }

  // --------------------------------------------------- partner's abilities
  remoteAb(d) {
    if (d.k === 'recon') this.revealed(false);
    else if (d.k === 'barrier') this.raise(d.c, d.r, false);
    else if (d.k === 'deadeye') this.slowed();
    else if (d.k === 'lasso') this.yanked(d);
  }

  // respawned at a checkpoint: my blocks come back to me
  reset() { this.recall(false); }

  destroy() { ui.kitChip(null); }
}

// plain crate for worlds without their own block look
function fallbackTexture(scene) {
  const key = 'w_build';
  if (!scene.textures.exists(key)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x8a6a3f).fillRect(0, 0, TILE, TILE).fillStyle(0x6b4f2f).fillRect(4, 4, TILE - 8, TILE - 8);
    g.generateTexture(key, TILE, TILE); g.destroy();
  }
  return key;
}

// Sage-style ice wall, 1 tile wide and BARRIER.rows tall
function iceTexture(scene) {
  const key = 'w_ice';
  if (!scene.textures.exists(key)) {
    const h = BARRIER.rows * TILE, g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x9fe8ff, 0.85).fillRect(2, 0, TILE - 4, h);
    g.fillStyle(0xe6fbff, 0.8).fillRect(6, 4, 10, h - 8);
    g.lineStyle(2, 0x3fb8d8, 1);
    for (let y = 40; y < h; y += 52) g.lineBetween(2, y, TILE - 2, y - 14);
    g.strokeRect(2, 0, TILE - 4, h);
    g.generateTexture(key, TILE, h); g.destroy();
  }
  return key;
}

