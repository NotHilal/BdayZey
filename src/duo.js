import Phaser from 'phaser';
import { net } from './net.js';
import { ui, IRIS_MS } from './ui.js';
import { sfx } from './sfx.js';
import { CHARACTERS } from './art/sprites.js';
import { makeCanvas, addTexture, glow } from './art/util.js';
import { TILE, TOP } from './levels.js';
import { overlap } from './mechanics.js';
import { gliderTexture } from './player.js';

// Online duo. Each client simulates its own character and sends its state ~16
// times a second; the partner is drawn from those snapshots, 100ms in the past.
// The host (room creator) is authoritative for collected franui; checkpoints,
// stomps and set-pieces are idempotent so either side may announce them.
const SEND_MS = 60;
const DELAY_MS = 100;
const LOST_MS = 8000; // the relay reconnects by itself; only give up on longer gaps
const GHOST_LINGER = 0.8, GHOST_SPEED = 140; // ghost bubble: s floating at the death spot, then top speed (px/s)
const REVIVE_INVULN_MS = 1000; // after a revive nothing can kill you for this long
const GHOST_NEAR = 280; // closer than this to the partner, the bubble starts circling them
const GHOST_KEEP = 95, GHOST_MIN = 80; // bubble distance from the partner's centre: prefers / at least (pop reach is 70)
// (no timeout: a bubble waits until it's popped, or both are down)
const other = (c) => (c === 'cat' ? 'raccoon' : 'cat');

export const duo = {
  active: false,
  host: false,
  me: 'raccoon',
  partner: 'cat',
  code: null,
  connected: false,
  lost: false,
  lastSeen: 0,
  _offs: [],
  _beat: null,

  // Create a room and wait for someone to join. Resolves with the room code;
  // onPartner() runs once the partner is in.
  async create(char, onPartner) {
    this.reset();
    const code = await net.createRoom();
    Object.assign(this, { code, host: true, me: char, partner: other(char) });
    this._listen(onPartner);
    this._offs.push(net.on('hello', () => net.send('welcome', { char: this.me })));
    return code;
  },

  // Join a room by code. Resolves once the host answered.
  async join(code, onPartner) {
    this.reset();
    await net.joinRoom(code);
    this.code = net.room; this.host = false;
    return new Promise((resolve, reject) => {
      const hello = setInterval(() => net.send('hello'), 700);
      net.send('hello');
      const fail = setTimeout(() => { clearInterval(hello); off(); reject(new Error('No one is waiting in room ' + this.code)); }, 15000);
      const off = net.on('welcome', (d) => {
        clearInterval(hello); clearTimeout(fail); off();
        this.partner = d.char; this.me = other(d.char);
        this.connected = true;
        this._listen(onPartner);
        this._seen();
        resolve(this.code);
      });
    });
  },

  _listen(onPartner) {
    let first = true;
    this._offs.push(net.on('*', (d, msg) => {
      if (msg.t === 'bye') { this._lose(); return; }
      this._seen();
      if (first && (msg.t === 'hello' || msg.t === 'welcome' || msg.t === 'ping')) { first = false; this.connected = true; onPartner?.(); }
    }));
    this._beat = setInterval(() => {
      net.send('ping');
      if (this.connected && !this.lost && performance.now() - this.lastSeen > LOST_MS) this._lose();
    }, 1000);
  },

  _seen() {
    this.lastSeen = performance.now();
    if (this.lost) { this.lost = false; ui.partnerLost(false); }
  },

  _lose() {
    if (!this.active || this.lost) return;
    this.lost = true;
    ui.partnerLost(true);
  },

  // stop playing together (leaving the lobby, or starting a solo game)
  reset() {
    this._offs.forEach((off) => off());
    this._offs = [];
    clearInterval(this._beat);
    net.leave();
    Object.assign(this, { active: false, connected: false, lost: false, code: null });
  },
};

// Bubble a dead player floats in until the partner touches it.
function bubbleTexture(scene) {
  if (scene.textures.exists('duo-bubble')) return;
  const { canvas, ctx } = makeCanvas(96, 96);
  glow(ctx, 48, 48, 48, '#bfe9ff', 0.35);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(48, 48, 40, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(190,230,255,0.25)'; ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.ellipse(34, 30, 9, 5, -0.6, 0, Math.PI * 2); ctx.fill();
  addTexture(scene, 'duo-bubble', canvas);
}

// Per-world link between this client's scene and the partner.
export class DuoLink {
  constructor(scene) {
    this.scene = scene;
    this.w = scene.worldIndex;
    bubbleTexture(scene);
    const pc = CHARACTERS[duo.partner], mc = CHARACTERS[duo.me];
    this.remote = scene.add.sprite(-999, -999, pc.key, 0).setDepth(19).setVisible(false);
    this.remoteAnim = pc.anim;
    const bubble = (key) => {
      const c = scene.add.container(0, 0).setDepth(26).setVisible(false);
      c.add([scene.add.image(0, 0, 'duo-bubble'), scene.add.image(0, 4, key, 0).setScale(0.55).setAlpha(0.85)]);
      return c;
    };
    this.myBubble = bubble(mc.key);
    this.theirBubble = bubble(pc.key);
    // the partner's head is a one-way platform you can stand on
    this.head = scene.add.zone(-999, -999, 52, 12);
    scene.physics.add.existing(this.head, true);
    Object.assign(this.head.body.checkCollision, { down: false, left: false, right: false });
    scene.physics.add.collider(scene.player, this.head);
    // off-screen arrow pointing at the partner
    this.arrow = scene.add.graphics().setScrollFactor(0).setDepth(150);
    this.arrowIcon = scene.add.image(0, 0, pc.key, 0).setScale(0.4).setScrollFactor(0).setDepth(151).setVisible(false);

    this.snaps = [];
    this.clockT = 0; this.foesT = 0;
    this.key = ui.coarse ? '✋' : 'E';
    this.hints = new Set();
    this.prompt = scene.add.container(0, 0).setDepth(40).setVisible(false);
    this.prompt.add([
      scene.add.circle(0, 0, 17, 0x000000, 0.6).setStrokeStyle(2, 0xffffff, 0.9),
      scene.add.text(0, 1, this.key, { fontFamily: '"Press Start 2P"', fontSize: '14px', color: '#ffffff' }).setOrigin(0.5),
    ]);
    // the host runs enemies and set-pieces for both players; the guest mirrors them
    const ai = scene.mech.ai;
    ai.follow = !duo.host;
    ai.emit = (k, d) => this.send('fx', { ...d, k });
    this.sendT = 0;
    this.ghost = null;
    this.atGoal = false; this.partnerAtGoal = false; this.waitT = 0; this.won = false; this.wiping = false;
    this.actionPrev = false; this.reviveT = 0; this.lastHeadX = null;

    // stomps are shared: wrap each enemy so a local stomp is announced
    this.stomps = scene.mech.enemies.map((e, i) => {
      const orig = e.stomp?.bind(e);
      if (orig) e.stomp = () => { orig(); this.send('stomp', { i }); };
      return orig;
    });

    const on = (t, cb) => net.on(t, (d) => { if (d.w === this.w) cb(d); });
    this.offs = [
      on('state', (d) => { this.snaps.push({ ...d, t: performance.now() }); if (this.snaps.length > 30) this.snaps.shift(); this.partnerAtGoal = !!d.goal; this.checkBothAtGoal(); }),
      on('collect', (d) => { if (duo.host) this.hostCollect(d.i); }),
      on('collected', (d) => { const s = scene.sweets[d.i]; if (s && !s.got) scene.collect(s); }),
      on('checkpoint', (d) => scene.activateCheckpoint(d.i)),
      on('stomp', (d) => { const e = scene.mech.enemies[d.i]; if (e?.hitbox?.()) this.stomps[d.i]?.(); }),
      on('revive', () => this.revived()),
      on('throw', (d) => this.thrown(d)),
      on('atGoal', () => { this.partnerAtGoal = true; this.checkBothAtGoal(); }),
      on('warp', () => this.warped()),
      on('lever', (d) => scene.mech.pull(d.i)),
      on('crack', (d) => scene.mech.smash(d.i, !!scene.level.kit)),
      on('block', (d) => scene.abil?.remote(d)),
      on('ab', (d) => scene.abil?.remoteAb(d)),
      // host → guest: world clock (keeps time-based movers in step) and enemy states
      on('clock', (d) => { if (!duo.host && Math.abs(scene.mech.t - (d.t + 40)) > 120) scene.mech.t = d.t + 40; }),
      on('foes', (d) => { if (!duo.host) d.s.forEach((st, i) => { if (st) scene.mech.enemies[i]?.setState?.(st); }); }),
      on('fx', (d) => { this.fxCount = (this.fxCount || 0) + 1; scene.mech.set.receive?.(d.k, d); }),
    ];
  }

  send(type, payload = {}) { net.send(type, { ...payload, w: this.w }); }

  hint(id, msg) {
    if (this.hints.has(id)) return;
    this.hints.add(id);
    ui.toast(msg);
  }

  // ------------------------------------------------------------ franui
  touchSweet(s) {
    const i = this.scene.sweets.indexOf(s);
    if (duo.host) { this.hostCollect(i); return; }
    const now = performance.now();
    if (s.pending && now - s.pending < 1000) return;
    s.pending = now;
    this.send('collect', { i });
  }

  hostCollect(i) {
    const s = this.scene.sweets[i];
    if (!s || s.got) return;
    this.scene.collect(s);
    this.send('collected', { i });
  }

  // ------------------------------------------------------ revive / ghost
  // called when the local player dies; returns true if we float as a ghost
  becomeGhost(x, y) {
    const partner = this.partnerState();
    // (if the partner is a bubble too, both are down: update() plays the circle wipe)
    if (!partner || partner.goal) return false;
    // (a fall into a pit starts the bubble at the edge of the screen, not below it)
    const y0 = Math.min(y, 460);
    const rnd = () => Math.random() * Math.PI * 2;
    this.ghost = { x, y: y0, t: 0, home: { x, y: y0 }, vx: 0, vy: -40, ang: rnd(), spin: Math.random() < 0.5 ? 1 : -1, ph: [rnd(), rnd(), rnd(), rnd()] };
    this.myBubble.setPosition(x, this.ghost.y).setVisible(true).setScale(0.3);
    this.scene.tweens.add({ targets: this.myBubble, scale: 1, duration: 300, ease: 'Back.out' });
    this.scene.follow(this.myBubble); // the screen goes with the bubble (respawnAt switches back)
    ui.toast('WAIT FOR YOUR PARTNER TO POP YOUR BUBBLE');
    return true;
  }

  revived() {
    if (!this.ghost) return;
    // come back on safe ground just behind the partner who popped it (never where
    // the bubble is: that may hang over a pit), and can't die for a moment
    const r = this.partnerState();
    const spot = r ? this.safeSpot(r) : { x: this.myBubble.x, feet: this.myBubble.y + 40 };
    this.ghost = null;
    this.myBubble.setVisible(false);
    sfx.checkpoint();
    this.scene.respawnAt(spot.x, spot.feet, false, REVIVE_INVULN_MS);
  }

  // A safe place to stand 1-3 columns behind the partner (they face away from it),
  // measured from where they last stood on real ground. Solid floor, no hazard,
  // nothing in the way between them and it. Else in front of them, else their spot.
  safeSpot(r) {
    const sc = this.scene, lv = sc.level, m = sc.mech;
    const ax = r.sx || r.x, af = r.sy || r.y + 42;
    const c0 = Math.floor(ax / TILE), rs = Math.round((af - TOP) / TILE); // their column, the row they stand on
    const behind = r.f ? 1 : -1; // flipX means they face left
    const solid = (c, row) => (sc.abil ? sc.abil.solidAt(c, row) : lv.solid(c, row)) || lv.at(c, row) === '-';
    const blocked = (rect) => Object.values(m.doors).some((d) => !d.open && overlap(rect, d.rect)) || m.cracks.some((k) => !k.broken && overlap(rect, k.rect));
    const body = (c, surf) => ({ x: c * TILE + 4, y: TOP + surf * TILE - 50, w: TILE - 8, h: 50 });
    const standable = (c, surf) => {
      const row = surf - 1;
      if (row < 0 || solid(c, row) || lv.at(c, row) === '^' || !solid(c, surf) || lv.at(c, surf) === '^') return false;
      const rect = body(c, surf);
      return !blocked(rect) && !sc.hazards.some((h) => overlap(rect, { x: h.x - 12, y: h.y - 12, w: h.w + 24, h: h.h + 24 }));
    };
    for (const side of [behind, -behind]) {
      for (let d = 1; d <= 3; d++) {
        const c = c0 + side * d;
        // a wall or a shut gate in the way at body height: nothing further this side
        if (solid(c, rs - 1) || blocked(body(c, rs))) break;
        for (const surf of [rs, rs + 1]) if (standable(c, surf)) return { x: c * TILE + TILE / 2, feet: TOP + surf * TILE };
      }
    }
    return { x: ax, feet: af };
  }

  // both players are bubbles: the screen closes in a circle on my bubble, I'm
  // back at the last checkpoint, and it opens again on me. The partner's client
  // does the same (checkpoints are shared, so they come back at the same one).
  bothDown() {
    this.wiping = true;
    const sc = this.scene, cam = sc.cameras.main;
    const at = (x, y) => [(x - cam.scrollX) / cam.width, (y - cam.scrollY) / cam.height];
    sc.time.delayedCall(500, () => {
      const g = this.ghost;
      ui.iris(true, ...(g ? at(g.x, g.y) : [0.5, 0.5]));
      sc.time.delayedCall(IRIS_MS + 250, () => {
        if (this.ghost) this.ghostRespawn();
        cam.centerOn(sc.player.x, sc.player.y);
        // open a frame later, once the camera has settled on the checkpoint
        sc.time.delayedCall(60, () => { ui.iris(false, ...at(sc.player.x, sc.player.y)); this.wiping = false; });
      });
    });
  }

  // Free-flying bubble, unpredictable the whole way. It steers toward a target that
  // keeps moving and overshoots a little, with a soft random wobble on top:
  // - on the way to the partner it meanders up and down, sometimes drifting back;
  // - near the partner it circles them loosely, switching direction now and then;
  // - and every so often it has a "mood" for a moment: a little loop, a hover, or a
  //   gust that knocks it off course.
  // It stays just out of reach of a partner standing still (see below).
  flyBubble(g, r, dt) {
    const t = g.t, ph = g.ph;
    const noise = (a, b, k) => Math.sin(t * a + ph[k]) * 0.6 + Math.sin(t * b + ph[(k + 1) % 4]) * 0.4; // smooth, -1..1
    const free = r && t >= GHOST_LINGER;
    let tx, ty;
    if (!free) {
      // no partner to go to (yet): bob about where it is
      tx = g.home.x + noise(0.7, 1.9, 0) * 50;
      ty = g.home.y - 20 + noise(0.9, 2.3, 1) * 35;
    } else if (Math.hypot(r.x - g.x, r.y - g.y) > GHOST_NEAR) {
      // on the way: a wandering point ahead, pulled up and down, sometimes behind it
      const ahead = 200 + noise(0.35, 0.9, 3) * 160;
      tx = g.x + Math.sign(r.x - g.x) * ahead;
      ty = r.y - 110 + noise(0.5, 1.3, 2) * 150;
    } else {
      // around the partner
      g.ang += (g.spin * 0.8 + noise(0.5, 1.3, 2) * 1.2) * dt;
      if (Math.random() < dt * 0.12) g.spin = -g.spin;
      const rx = 150 + noise(0.4, 1.1, 3) * 45;
      tx = r.x + Math.cos(g.ang) * rx;
      ty = r.y - 95 + Math.sin(g.ang) * 70 + noise(0.6, 1.7, 0) * 25;
    }
    if (free) {
      // moods
      g.moodT = (g.moodT ?? 1 + Math.random()) - dt;
      if (g.moodT <= 0) {
        const k = Math.random();
        g.mood = k < 0.55 ? 'fly' : k < 0.75 ? 'loop' : k < 0.87 ? 'hover' : 'gust';
        g.moodT = { fly: 1.2 + Math.random() * 2, loop: 1.1 + Math.random() * 0.8, hover: 0.4 + Math.random() * 0.5, gust: 0.4 }[g.mood];
        g.at = { x: g.x, y: g.y };
        g.loopA = Math.atan2(g.vy, g.vx) - Math.PI / 2; g.loopDir = Math.random() < 0.5 ? 1 : -1;
        if (g.mood === 'gust') { const a = Math.random() * Math.PI * 2; g.vx += Math.cos(a) * 170; g.vy += Math.sin(a) * 120; }
      }
      if (g.mood === 'loop') {
        g.loopA += g.loopDir * 2.8 * dt;
        tx = g.at.x + Math.cos(g.loopA) * 65; ty = g.at.y - 30 + Math.sin(g.loopA) * 65;
      } else if (g.mood === 'hover') {
        tx = g.at.x + noise(1.7, 3.3, 1) * 20; ty = g.at.y + noise(1.9, 3.7, 2) * 20;
      }
      // aim around the partner, never at them
      const ax = tx - r.x, ay = ty - (r.y + 14), ad = Math.hypot(ax, ay) || 1;
      if (ad < GHOST_KEEP + 20) { tx = r.x + (ax / ad) * (GHOST_KEEP + 20); ty = r.y + 14 + (ay / ad) * (GHOST_KEEP + 20); }
    }
    g.vx += ((tx - g.x) * 1.5 - g.vx * 1.1 + noise(1.3, 2.9, 1) * 70) * dt;
    g.vy += ((ty - g.y) * 1.5 - g.vy * 1.1 + noise(1.1, 3.1, 2) * 70) * dt;
    // it slides around a partner who stands still instead of floating into them
    // (that would pop it); once they move or jump it doesn't dodge, so they can catch it
    const still = !!r && this.partnerStill(g, r, dt);
    if (still) {
      const dx = g.x - r.x, dy = g.y - (r.y + 14), d = Math.hypot(dx, dy) || 1;
      if (d < GHOST_KEEP) { const push = (GHOST_KEEP - d) * 14 * dt; g.vx += (dx / d) * push; g.vy += (dy / d) * push; }
    }
    const sp = Math.hypot(g.vx, g.vy), max = g.mood === 'gust' ? GHOST_SPEED * 1.5 : GHOST_SPEED;
    if (sp > max) { g.vx *= max / sp; g.vy *= max / sp; }
    g.x += g.vx * dt;
    g.y = Phaser.Math.Clamp(g.y + g.vy * dt, 70, 640);
    // and a firm floor, sliding round the edge: popping stays the partner's move
    if (still) {
      const dx = g.x - r.x, dy = g.y - (r.y + 14), d = Math.hypot(dx, dy) || 1;
      if (d < GHOST_MIN) { g.x = r.x + (dx / d) * GHOST_MIN; g.y = r.y + 14 + (dy / d) * GHOST_MIN; }
    }
  }

  // is the partner (nearly) standing still? smoothed speed of their snapshots
  partnerStill(g, r, dt) {
    const v = g.pr && dt > 0 ? Math.hypot(r.x - g.pr.x, r.y - g.pr.y) / dt : 0;
    g.pr = { x: r.x, y: r.y };
    g.pv = (g.pv ?? 0) * 0.85 + Math.min(v, 1500) * 0.15;
    return g.pv < 40;
  }

  ghostRespawn() {
    this.ghost = null;
    this.myBubble.setVisible(false);
    const r = this.scene.respawn;
    this.scene.respawnAt(r.x, r.y, true);
  }

  // ---------------------------------------------------------- co-op moves
  thrown(d) {
    const sc = this.scene;
    if (sc.dead || sc.done) return;
    sc.me.launch(d.vx, d.vy);
    sc.puff(sc.player.x, sc.player.body.bottom, 8);
    sfx.jump();
  }

  warped() {
    const sc = this.scene;
    if (this.atGoal) return;
    const z = sc.goal.zone;
    if (this.ghost) { this.ghost = null; this.myBubble.setVisible(false); }
    sc.respawnAt(z.x + z.w / 2, z.y + z.h - 2, false);
  }

  // --------------------------------------------------------------- goal
  reachGoal() {
    if (this.atGoal) return;
    const sc = this.scene, p = sc.player;
    this.atGoal = true; this.waitT = 0;
    sc.done = true;
    p.body.setVelocity(0, 0);
    p.body.setAllowGravity(false);
    sc.me.play('happy');
    this.send('atGoal');
    if (!this.checkBothAtGoal()) ui.toast('WAITING FOR YOUR PARTNER…');
  }

  checkBothAtGoal() {
    if (this.won || !this.atGoal || !this.partnerAtGoal) return false;
    this.won = true;
    this.scene.win();
    return true;
  }

  partnerState() { return this.snaps[this.snaps.length - 1] || null; }

  // ------------------------------------------------------------ per frame
  update(delta, inp) {
    const sc = this.scene, p = sc.player, b = p.body;
    if (!duo.active) { this.destroy(); sc.link = null; return; }
    const now = performance.now(), dt = delta / 1000;

    // send my state
    this.sendT -= delta;
    if (this.sendT <= 0) {
      this.sendT = SEND_MS;
      const g = this.ghost;
      this.send('state', {
        x: Math.round(p.x), y: Math.round(p.y), a: sc.me.anim, f: p.flipX ? 1 : 0,
        g: g ? 1 : 0, gx: g ? Math.round(g.x) : 0, gy: g ? Math.round(g.y) : 0,
        goal: this.atGoal ? 1 : 0, vis: p.visible ? 1 : 0,
        sx: this.safe ? this.safe.x : 0, sy: this.safe ? this.safe.feet : 0,
        gl: sc.me.gliding ? 1 : 0, sh: sc.abil?.shieldDir || 0,
      });
    }

    // partner, interpolated DELAY_MS in the past
    const r = this.sample(now - DELAY_MS);
    const partnerAlive = r && !r.g && r.vis;
    this.remote.setVisible(!!partnerAlive);
    this.theirBubble.setVisible(!!(r && r.g));
    if (r) {
      if (partnerAlive) {
        this.remote.setPosition(r.x, r.y).setFlipX(!!r.f);
        const key = `${this.remoteAnim}-${r.a}`;
        if (this.remote.anims.currentAnim?.key !== key) this.remote.play(key);
      }
      if (r.g) this.theirBubble.setPosition(r.gx, r.gy + Math.sin(now / 300) * 4);
    }

    // stand on the partner's head (and ride along when they move)
    const hb = this.head.body;
    hb.enable = !!partnerAlive;
    if (partnerAlive) {
      this.head.setPosition(r.x, r.y - 3);
      hb.updateFromGameObject();
      const standing = b.enable && b.touching.down && Math.abs(b.bottom - (r.y - 9)) < 6 && Math.abs(p.x - r.x) < 40;
      if (standing && this.lastHeadX != null) b.x += r.x - this.lastHeadX;
      this.lastHeadX = r.x;
      this.onHead = standing;
    } else { this.lastHeadX = null; this.onHead = false; }

    // where I last stood safely on real ground (sent along: a revived partner
    // comes back next to it)
    if (!sc.dead && !sc.done && b.enable && b.blocked.down && !this.onHead && !sc.hazards.some((h) => b.x < h.x + h.w + 20 && b.right > h.x - 20 && b.y < h.y + h.h && b.bottom > h.y - 10)) {
      this.safe = { x: Math.round(p.x), feet: Math.round(b.bottom) };
    }

    // partner can press plates and find secrets too
    sc.mech.remoteRect = partnerAlive ? { x: r.x - 28, y: r.y - 9, w: 56, h: 46 } : null;
    // their glider and raised shield (the shield stops shots on my screen too)
    if (!this.remoteGlider) this.remoteGlider = sc.add.image(0, 0, gliderTexture(sc)).setDepth(19).setVisible(false);
    this.remoteGlider.setVisible(!!(partnerAlive && r.gl));
    if (partnerAlive && r.gl) this.remoteGlider.setPosition(r.x, r.y - 30).setFlipX(!!r.f);
    sc.mech.remoteShield = partnerAlive && r.sh ? (() => {
      const left = r.x + (r.f ? -42.5 : -13.5), right = left + 56, feet = r.y + 37;
      return { x: r.sh > 0 ? right + 2 : left - 18, y: feet - 110, w: 16, h: 110 };
    })() : null;

    // pop the partner's bubble to revive them
    this.reviveT -= dt;
    if (r && r.g && !sc.dead && b.enable && this.reviveT <= 0 && Math.hypot(p.x - r.gx, b.center.y - r.gy) < 70) {
      this.reviveT = 1;
      this.send('revive');
      sfx.collect(1);
      ui.toast('PARTNER REVIVED!');
    }

    // my ghost bubble floats where I died for a moment, then flies to the partner
    // (the spot may be out of reach, e.g. deep in a pit)
    if (this.ghost) {
      const g = this.ghost;
      g.t += dt;
      this.flyBubble(g, partnerAlive ? r : null, dt);
      this.myBubble.setPosition(g.x, g.y);
      // a soft wobble, like a soap bubble (after its pop-in)
      if (g.t > 0.35) this.myBubble.setScale(1 + Math.sin(g.t * 5.3) * 0.04, 1 - Math.sin(g.t * 5.3) * 0.04);
      // both down: circle wipe, then back to the checkpoint
      if (r && r.g && !this.wiping) this.bothDown();
    }

    // action key (E / ✋) does what fits where you stand: call the partner from the
    // goal, pull a lever, smash a crack (cat), or throw the partner up (raccoon)
    const act = inp.action && !this.actionPrev;
    this.actionPrev = inp.action;
    const mech = sc.mech;
    const alive = !sc.dead && !sc.done && b.enable;
    const pr = alive ? { x: b.x, y: b.y, w: b.width, h: b.height } : null;
    const leverI = pr ? mech.nearLever(pr) : -1;
    // (worlds with a kit break ore with Q instead: abilities.js)
    const crackI = pr && !sc.level.kit ? mech.nearCrack(pr, sc.me.facing) : -1;
    const canSmash = crackI >= 0 && !!sc.me.abilities.smash;
    const canThrow = alive && duo.me === 'raccoon' && partnerAlive && Math.abs(p.x - r.x) < 90 && Math.abs(p.y - r.y) < 70;
    if (act && this.atGoal && !this.won) { this.send('warp'); ui.toast('CALLING YOUR PARTNER…'); }
    else if (act && leverI >= 0) { if (mech.pull(leverI)) this.send('lever', { i: leverI }); }
    else if (act && canSmash) {
      if (mech.smash(crackI)) this.send('crack', { i: crackI });
      sc.me.squash(1.25, 0.8);
    } else if (act && canThrow) {
      this.send('throw', { vx: sc.me.facing * 160, vy: -1490 }); // ~8.5 rows, see duoLevels.js
      sc.me.squash(1.2, 0.85);
      sfx.stomp();
    }

    // "E" bubble over whatever you can use right now
    let at = null;
    if (leverI >= 0) { const l = mech.levers[leverI]; at = [l.x, l.feet - 78]; }
    else if (canSmash) { const k = mech.cracks[crackI].rect; at = [k.x + k.w / 2, Math.max(60, Math.min(k.y + k.h - 40, b.y - 40))]; }
    else if (canThrow) at = [r.x, r.y - 70];
    this.prompt.setVisible(!!at);
    if (at) this.prompt.setPosition(at[0], at[1] + Math.sin(now / 150) * 3);

    // one-time hints so both players learn what each obstacle wants
    if (pr) {
      if (crackI >= 0) this.hint(duo.me === 'cat' ? 'crackCat' : 'crackRaccoon',
        duo.me === 'cat' ? `CAT: ${this.key} TO SMASH CRACKED BLOCKS` : 'ONLY THE CAT CAN SMASH CRACKED BLOCKS');
      const high = mech.levers.find((l) => !l.on && Math.abs(p.x - l.x) < 140 && b.bottom - l.feet > 200);
      if (high) this.hint('throw', duo.me === 'raccoon' ? `TOO HIGH! STAND NEXT TO THE CAT AND PRESS ${this.key} TO THROW IT` : 'TOO HIGH! LET THE RACCOON THROW YOU UP THERE');
      const plate = mech.plates.find((pl) => pl.hold && Math.abs(p.x - pl.x) < 200);
      if (plate) this.hint('hold', 'ONE OF YOU HOLDS THE PLATE, THE OTHER GOES THROUGH');
      if (canThrow) this.hint('throwReady', `RACCOON: ${this.key} THROWS THE CAT`);
      if (sc.me.climbing) this.hint('climb', 'KEEP PUSHING INTO THE WALL TO CLIMB · TAP JUMP TO HOP UP');
    }
    if (this.atGoal && !this.won) {
      this.waitT += dt;
      if (this.waitT > 5 && this.waitT - dt <= 5) ui.toast(ui.coarse ? 'TAP ✋ TO CALL YOUR PARTNER' : 'PRESS E TO CALL YOUR PARTNER');
    }

    this.drawArrow(r, partnerAlive);

    // host: share the clock and the enemy states
    if (duo.host) {
      if ((this.clockT -= delta) <= 0) { this.clockT = 500; this.send('clock', { t: Math.round(sc.mech.t) }); }
      if ((this.foesT -= delta) <= 0) {
        this.foesT = 83;
        const s = sc.mech.enemies.map((e) => e.getState?.() ?? null);
        if (s.some(Boolean)) this.send('foes', { s });
      }
    }
  }

  // interpolate between the two snapshots around time t
  sample(t) {
    const s = this.snaps;
    if (!s.length) return null;
    let i = s.length - 1;
    while (i > 0 && s[i - 1].t > t) i--;
    const a = s[Math.max(0, i - 1)], b = s[i];
    if (a === b || b.t <= a.t || t >= b.t) return b;
    const k = Phaser.Math.Clamp((t - a.t) / (b.t - a.t), 0, 1);
    const far = Math.abs(b.x - a.x) > 300 || Math.abs(b.y - a.y) > 300; // respawn/teleport: snap
    // the bubble only has a position once the partner is one (before that it's 0,0)
    const bub = a.g && b.g;
    return { ...b, x: far ? b.x : a.x + (b.x - a.x) * k, y: far ? b.y : a.y + (b.y - a.y) * k,
      gx: bub ? a.gx + (b.gx - a.gx) * k : b.gx, gy: bub ? a.gy + (b.gy - a.gy) * k : b.gy };
  }

  drawArrow(r, alive) {
    const g = this.arrow;
    g.clear();
    this.arrowIcon.setVisible(false);
    if (!r) return;
    const cam = this.scene.cameras.main;
    const x = (alive ? r.x : r.gx) - cam.scrollX, y = (alive ? r.y : r.gy) - cam.scrollY;
    const m = 40;
    if (x > -20 && x < 1300 && y > -20 && y < 740) return;
    const cx = Phaser.Math.Clamp(x, m, 1280 - m), cy = Phaser.Math.Clamp(y, m + 50, 720 - m);
    const a = Math.atan2(y - cy, x - cx);
    g.fillStyle(0x000000, 0.45).fillCircle(cx, cy, 30);
    g.fillStyle(0xffffff, 0.95);
    const tip = (d, o) => [cx + Math.cos(a + o) * d, cy + Math.sin(a + o) * d];
    const [x1, y1] = tip(42, 0), [x2, y2] = tip(30, 0.35), [x3, y3] = tip(30, -0.35);
    g.fillTriangle(x1, y1, x2, y2, x3, y3);
    this.arrowIcon.setPosition(cx, cy + 4).setVisible(true);
  }

  destroy() {
    this.offs.forEach((off) => off());
    this.offs = [];
    if (this.scene.mech) Object.assign(this.scene.mech.ai, { follow: false, emit: () => {} });
    if (this.scene.mech) { this.scene.mech.remoteRect = null; this.scene.mech.remoteShield = null; }
  }
}
