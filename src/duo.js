import Phaser from 'phaser';
import { net } from './net.js';
import { ui } from './ui.js';
import { sfx } from './sfx.js';
import { CHARACTERS } from './art/sprites.js';
import { makeCanvas, addTexture, glow } from './art/util.js';

// Online duo. Each client simulates its own character and sends its state ~16
// times a second; the partner is drawn from those snapshots, 100ms in the past.
// The host (room creator) is authoritative for collected franui; checkpoints,
// stomps and set-pieces are idempotent so either side may announce them.
const SEND_MS = 60;
const DELAY_MS = 100;
const LOST_MS = 8000; // the relay reconnects by itself; only give up on longer gaps
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

  // stop playing together (after a disconnect, or leaving the lobby)
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
    this.atGoal = false; this.partnerAtGoal = false; this.waitT = 0; this.won = false;
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
      on('crack', (d) => scene.mech.smash(d.i)),
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
    if (duo.host || duo.lost) { this.hostCollect(i); return; }
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
    if (duo.lost || !partner || partner.g || partner.goal) return false;
    this.ghost = { x, y, t: 0 };
    this.myBubble.setPosition(x, y).setVisible(true).setScale(0.3);
    this.scene.tweens.add({ targets: this.myBubble, scale: 1, duration: 300, ease: 'Back.out' });
    ui.toast('WAIT FOR YOUR PARTNER TO POP YOUR BUBBLE');
    return true;
  }

  revived() {
    if (!this.ghost) return;
    // come back where the bubble is: right next to the partner who popped it
    const x = this.myBubble.x, y = this.myBubble.y;
    this.ghost = null;
    this.myBubble.setVisible(false);
    sfx.checkpoint();
    this.scene.respawnAt(x, y + 40, false);
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
    if (duo.lost) { sc.win(); return; }
    this.atGoal = true; this.waitT = 0;
    sc.done = true;
    p.body.setVelocity(0, 0);
    p.body.setAllowGravity(false);
    sc.me.play('happy');
    this.send('atGoal');
    if (!this.checkBothAtGoal()) ui.toast('WAITING FOR YOUR PARTNER…');
  }

  checkBothAtGoal() {
    if (this.won || !this.atGoal || !(this.partnerAtGoal || duo.lost)) return false;
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
        g: g ? 1 : 0, gx: g ? Math.round(this.myBubble.x) : 0, gy: g ? Math.round(this.myBubble.y) : 0,
        goal: this.atGoal ? 1 : 0, vis: p.visible ? 1 : 0,
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
    } else this.lastHeadX = null;

    // partner can press plates and find secrets too
    sc.mech.remoteRect = partnerAlive ? { x: r.x - 28, y: r.y - 9, w: 56, h: 46 } : null;

    // pop the partner's bubble to revive them
    this.reviveT -= dt;
    if (r && r.g && !sc.dead && b.enable && this.reviveT <= 0 && Math.hypot(p.x - r.gx, b.center.y - r.gy) < 70) {
      this.reviveT = 1;
      this.send('revive');
      sfx.collect(1);
      ui.toast('PARTNER REVIVED!');
    }

    // my ghost bubble floats after the partner
    if (this.ghost) {
      this.ghost.t += dt;
      const bub = this.myBubble;
      if (partnerAlive) {
        bub.x += (r.x - bub.x) * Math.min(1, dt * 1.6);
        bub.y += (r.y - 110 - bub.y) * Math.min(1, dt * 1.6);
      }
      bub.y += Math.sin(now / 280) * 0.4;
      // both down (or waited too long): everyone back to the checkpoint
      if ((r && r.g && this.ghost.t > 0.8) || this.ghost.t > 20 || duo.lost) this.ghostRespawn();
    }

    // action key (E / ✋) does what fits where you stand: call the partner from the
    // goal, pull a lever, smash a crack (cat), or throw the partner up (raccoon)
    const act = inp.action && !this.actionPrev;
    this.actionPrev = inp.action;
    const mech = sc.mech;
    const alive = !sc.dead && !sc.done && b.enable;
    const pr = alive ? { x: b.x, y: b.y, w: b.width, h: b.height } : null;
    const leverI = pr ? mech.nearLever(pr) : -1;
    const crackI = pr ? mech.nearCrack(pr, sc.me.facing) : -1;
    const canSmash = crackI >= 0 && duo.me === 'cat';
    const canThrow = alive && duo.me === 'raccoon' && partnerAlive && Math.abs(p.x - r.x) < 90 && Math.abs(p.y - r.y) < 70;
    if (act && this.atGoal && !this.won) { this.send('warp'); ui.toast('CALLING YOUR PARTNER…'); }
    else if (act && leverI >= 0) { if (mech.pull(leverI)) this.send('lever', { i: leverI }); }
    else if (act && canSmash) {
      if (mech.smash(crackI)) this.send('crack', { i: crackI });
      sc.me.squash(1.25, 0.8);
    } else if (act && canThrow) {
      this.send('throw', { vx: sc.me.facing * 160, vy: -1350 });
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

    // host: share the clock and the enemy states. If the host is gone, the guest
    // takes over running the enemies itself.
    sc.mech.ai.follow = !duo.host && !duo.lost;
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
    return { ...b, x: far ? b.x : a.x + (b.x - a.x) * k, y: far ? b.y : a.y + (b.y - a.y) * k, gx: a.gx + (b.gx - a.gx) * k, gy: a.gy + (b.gy - a.gy) * k };
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
    if (this.scene.mech) this.scene.mech.remoteRect = null;
  }
}
