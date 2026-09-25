import Phaser from 'phaser';
import { WORLDS } from '../worlds/index.js';
import { LEVELS, parseLevel, TILE, TOP, ROWS } from '../levels.js';
import { DUO_LEVELS } from '../duoLevels.js';
import { Abilities } from '../abilities.js';
import { makeCanvas, chunkedImage, addTexture } from '../art/util.js';
import { run } from '../state.js';
import { ui } from '../ui.js';
import { sfx, music } from '../sfx.js';
import { Mechanics } from '../mechanics.js';
import { Player, GRAV } from '../player.js';
import { duo, DuoLink } from '../duo.js';
import { quality, fpsWatch, applyLite } from '../quality.js';

const W = 1280, H = 720;

export class GameScene extends Phaser.Scene {
  constructor() { super('game'); }

  init(data) {
    this.worldIndex = data.world ?? 0;
    this.mode = data.mode ?? 'play'; // 'play' | 'attract' | 'finale'
    this.world = WORLDS[this.worldIndex];
  }

  preload() {
    this.world.preload?.(this);
  }

  create() {
    // drop the previous world's generated textures
    this.textures.getTextureKeys().filter((k) => k.startsWith('w_')).forEach((k) => this.textures.remove(k));
    const world = this.world;
    // duo plays longer versions of the levels with teamwork obstacles
    const duoPlay = this.mode === 'play' && duo.active;
    // dev-only: ?duolevel loads the duo layout alone (&char=cat to play the cat)
    const dq = new URLSearchParams(location.search);
    const devDuo = import.meta.env.DEV && this.mode === 'play' && dq.has('duolevel');
    const duoLevel = duoPlay || devDuo;
    const level = parseLevel((duoLevel ? DUO_LEVELS : LEVELS)[world.key]);
    this.level = level;
    world.setup?.(this, level);

    this.physics.world.gravity.y = GRAV;
    this.physics.world.setBounds(0, -400, level.width, H + 900);
    this.physics.world.setBoundsCollision(true, true, false, false);

    // --- sky (screen-fixed)
    const sky = makeCanvas(W, H);
    world.paintSky(sky.ctx, W, H);
    addTexture(this, 'w_sky', sky.canvas);
    this.add.image(0, 0, 'w_sky').setOrigin(0).setScrollFactor(0).setDepth(-100);
    world.skyFx?.(this);

    // --- parallax layers
    (world.layers(level) || []).forEach((layer, i) => {
      const lw = Math.ceil(W + (level.width - W) * layer.factor);
      const imgs = chunkedImage(this, `w_layer${i}`, lw, layer.height, (ctx, x0, x1) => layer.paint(ctx, x0, x1, lw), { nearest: layer.nearest });
      imgs.forEach(({ key, x, y }) => {
        this.add.image(x, layer.top + y, key).setOrigin(0).setScrollFactor(layer.factor, 1).setDepth(-90 + i);
      });
      layer.after?.(this, i);
    });

    // --- whatever lies at the bottom of pits (water, river, canyon...)
    if (world.pitFill) {
      chunkedImage(this, 'w_pit', level.width, 200, (ctx, x0, x1) => world.pitFill(ctx, x0, x1), {})
        .forEach(({ key, x, y }) => this.add.image(x, H - 200 + y, key).setOrigin(0).setDepth(-1));
    }

    // --- terrain (painted once, in chunks). Secret alcoves are painted as solid
    // and then cut out; Mechanics draws them again as a fake wall on top.
    const secrets = level.things.filter((t) => t.type === 'secret');
    chunkedImage(this, 'w_terrain', level.width, H, (ctx, x0, x1) => {
      world.paintTerrain(ctx, level.view, x0, x1);
      secrets.forEach((t) => ctx.clearRect(t.c * TILE, TOP + t.r * TILE, t.w * TILE, t.h * TILE));
    }, { nearest: world.pixel !== false })
      .forEach(({ key, x, y }) => this.add.image(x, y, key).setOrigin(0).setDepth(0));

    // --- collision: horizontal runs of solid cells, and runs of the same width in
    // consecutive rows merged into one tall body, so wall faces have no seams to
    // snag on (the raccoon climbs them in duo)
    this.solids = this.physics.add.staticGroup();
    this.oneWays = this.physics.add.staticGroup();
    const solidAt = (c, r) => level.solid(c, r) || level.solidDuo(c, r);
    const open = new Map(); // "c0,c1" -> first row of a run still growing downwards
    const flush = (key, r0, r1) => { const [c0, c1] = key.split(',').map(Number); this.addRect(this.solids, c0 * TILE, TOP + r0 * TILE, (c1 - c0) * TILE, (r1 - r0) * TILE); };
    for (let r = 0; r <= ROWS; r++) {
      const runs = new Set();
      let c = 0;
      while (r < ROWS && c < level.cols) {
        if (solidAt(c, r)) {
          const s = c;
          while (c < level.cols && solidAt(c, r)) c++;
          runs.add(s + ',' + c);
          if (!open.has(s + ',' + c)) open.set(s + ',' + c, r);
        } else if (level.at(c, r) === '-') {
          const s = c;
          while (c < level.cols && level.at(c, r) === '-') c++;
          const b = this.addRect(this.oneWays, s * TILE, TOP + r * TILE, (c - s) * TILE, 18);
          b.body.checkCollision.down = false; b.body.checkCollision.left = false; b.body.checkCollision.right = false;
        } else c++;
      }
      for (const [key, r0] of open) if (!runs.has(key)) { flush(key, r0, r); open.delete(key); }
    }

    // --- decorations (props, trees, ...)
    world.decorate?.(this, level, (key, x, y, o = {}) => {
      const img = this.add.image(x, y, key).setDepth(o.depth ?? 5);
      img.setOrigin(...(o.origin || [0.5, 1]));
      if (o.scale) img.setScale(o.scale);
      if (o.flip) img.setFlipX(true);
      if (o.alpha != null) img.setAlpha(o.alpha);
      if (o.tint != null) img.setTint(o.tint);
      if (o.sway) this.tweens.add({ targets: img, angle: { from: -o.sway, to: o.sway }, duration: 1600 + Math.random() * 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      return img;
    });

    // --- hazards
    this.hazards = level.ents.hazards.map((h) => world.hazard(this, h, level)).filter(Boolean);

    // --- collectibles
    this.sweets = level.ents.sweets.map((s, i) => {
      const glowImg = this.add.image(s.x, s.y, 'franui-glow').setDepth(9).setAlpha(0.7).setBlendMode(Phaser.BlendModes.ADD);
      const img = this.add.image(s.x, s.y, 'franui').setDepth(10);
      // carried franui are moved by their carrier every frame instead of bobbing
      if (!s.carrier) this.tweens.add({ targets: [img, glowImg], y: s.y - 7, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut', delay: i * 200 });
      this.tweens.add({ targets: glowImg, scale: 1.2, alpha: 0.45, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      const sparkle = this.add.particles(s.x, s.y, 'fx-star', {
        x: { min: -22, max: 22 }, y: { min: -26, max: 20 }, lifespan: 700, scale: { start: 0.45, end: 0 },
        alpha: { start: 1, end: 0 }, frequency: 380, tint: 0xfff3c4, blendMode: 'ADD',
      }).setDepth(11);
      return { ...s, img, glowImg, sparkle, got: false, i };
    });

    // --- checkpoints & goal
    this.checkpoints = level.ents.checkpoints.map((k) => ({ ...k, obj: world.checkpoint(this, k), on: false }));
    // the exit is open from the start, except in worlds whose set-piece opens it
    // on the way there (lateGoal); franui are optional collectibles
    this.goal = world.goal(this, level.ents.goal);
    this.goalOpen = false;
    if (!world.lateGoal) this.openGoal();

    // --- player
    this.start = level.ents.start;
    const q = new URLSearchParams(location.search);
    if (import.meta.env.DEV && q.has('x')) this.start = { x: +q.get('x') * TILE + TILE / 2, y: TOP + 2 * TILE };
    this.respawn = { x: this.start.x, y: this.start.y };
    // solo is always the raccoon; in duo each client plays its chosen character
    // with the abilities of this world's kit (duoLevels.js). Worlds not redone yet
    // keep the old duo moves. No double jump for anyone.
    const char = duoPlay ? duo.me : devDuo ? (dq.get('char') || 'raccoon') : 'raccoon';
    const OLD_KIT = { cat: { smash: true }, raccoon: { wallClimb: true } };
    const abilities = duoLevel ? { ...(level.kit ?? OLD_KIT)[char] } : {};
    // in duo the goal only lets you through with all 3 franui
    this.needAll = duoLevel;
    this.me = new Player(this, this.start.x, this.start.y, char, abilities);
    this.player = this.me.sprite;
    this.physics.add.collider(this.player, this.solids);
    this.physics.add.collider(this.player, this.oneWays);
    this.shadow = this.add.ellipse(0, 0, 58, 10, 0x000000, 0.22).setDepth(19);

    // --- enemies, secrets, doors, carriers, wind, set-piece
    this.mech = new Mechanics(this, level, world, { duo: duoLevel });
    this.sweets.forEach((s) => { if (s.carrier) s.ride = this.mech.carriers.get(s.carrier); });
    // the world's Q abilities (mine, build, ...)
    this.abil = duoLevel ? new Abilities(this) : null;

    // dust puffs
    this.dust = this.add.particles(0, 0, 'fx-puff', {
      lifespan: 420, speed: { min: 20, max: 80 }, angle: { min: 200, max: 340 }, gravityY: -40,
      scale: { start: 0.9, end: 0 }, alpha: { start: 0.7, end: 0 }, tint: world.dustTint ?? 0xe8e0d0, emitting: false,
    }).setDepth(21);

    // --- world extras
    world.ambient?.(this, level);
    world.post?.(this, level);

    // --- camera
    const cam = this.cameras.main;
    cam.setBounds(0, 0, level.width, H);
    cam.setRoundPixels(true);
    if (this.mode !== 'play') {
      this.player.setVisible(false).body.enable = false;
      this.shadow.setVisible(false);
      cam.scrollX = 0;
      this.tweens.add({ targets: cam, scrollX: level.width - W, duration: level.width * 9, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    } else {
      this.follow();
      cam.setDeadzone(80, 400);
      cam.fadeIn(450, 0, 0, 0);
    }

    // --- input
    this.keys = this.input.keyboard.addKeys({
      left: 'LEFT', right: 'RIGHT', up: 'UP', a: 'A', d: 'D', w: 'W', space: 'SPACE', z: 'Z', e: 'E', x: 'X', q: 'Q', f: 'F', r: 'R',
    });
    this.input.keyboard.addCapture('LEFT,RIGHT,UP,DOWN,SPACE');
    this.dead = false; this.done = false;
    this.invuln = 0; // ms left of not being able to die (after a revive), shown by blinking

    // --- online partner (duo only)
    this.link = duoPlay ? new DuoLink(this) : null;

    this.events.once('shutdown', () => this.cleanup());

    // weak GPUs: drop the cosmetic overlays (see quality.js)
    if (quality.lite) applyLite(this);
    this.watchFps = this.mode === 'play' ? fpsWatch() : null;

    if (this.mode === 'play') {
      music.play(world.key);
      ui.worldStart(this.worldIndex, world);
      this.banner();
    }
    // debug hook for the screenshot/flow scripts in tools/
    if (import.meta.env.DEV) window.__game = this;
  }

  // is there a climbable wall right next to the player on this side (-1/1)?
  // Gates and cracked blocks aren't part of the grid, so they can't be climbed.
  climbable(side) {
    const b = this.player.body, lv = this.level;
    const c = Math.floor((side > 0 ? b.right + 4 : b.left - 4) / TILE);
    const r = Math.floor((b.bottom - 6 - TOP) / TILE); // at the feet: climb until they clear the top
    return lv.solid(c, r) || lv.solidDuo(c, r);
  }

  // the camera follows the player, or in duo the player's bubble while they're down
  follow(target = this.player) {
    this.cameras.main.startFollow(target, true, 0.1, 0.1, 0, 60);
  }

  // at the goal without all 3 franui (duo)
  needFranui() {
    const now = this.mech.t;
    if (now - (this.needT ?? -1e9) < 3500) return;
    this.needT = now;
    sfx.nope();
    ui.toast(`FIND ALL 3 FRANUI FIRST (${run.levelSweets}/3)`);
  }

  openGoal() {
    if (this.goalOpen) return;
    this.goalOpen = true;
    this.goal.activate();
  }

  addRect(group, x, y, w, h) {
    const z = this.add.zone(x + w / 2, y + h / 2, w, h);
    group.add(z);
    z.body.updateFromGameObject?.();
    return z;
  }

  banner() {
    const w = this.world;
    const cont = this.add.container(W / 2, H * 0.36).setScrollFactor(0).setDepth(200);
    const band = this.add.rectangle(0, 0, W, 120, 0x000000, 0.45);
    const t1 = this.add.text(0, -22, `WORLD ${this.worldIndex + 1}`, { fontFamily: '"Press Start 2P"', fontSize: '18px', color: '#ffffff' }).setOrigin(0.5).setAlpha(0.85);
    const t2 = this.add.text(0, 16, w.name, { fontFamily: '"Press Start 2P"', fontSize: '34px', color: w.accent, stroke: '#000', strokeThickness: 6 }).setOrigin(0.5);
    const t3 = this.add.text(0, 48, w.blurb, { fontFamily: 'VT323', fontSize: '26px', color: '#ffffff' }).setOrigin(0.5).setAlpha(0.9);
    cont.add([band, t1, t2, t3]);
    cont.setAlpha(0);
    this.tweens.add({ targets: cont, alpha: 1, duration: 350, hold: 1500, yoyo: true, onComplete: () => cont.destroy() });
  }

  input_() {
    const k = this.keys, t = ui.touch;
    return {
      left: k.left.isDown || k.a.isDown || t.left,
      right: k.right.isDown || k.d.isDown || t.right,
      jump: k.up.isDown || k.w.isDown || k.space.isDown || k.z.isDown || t.jump,
      action: k.e.isDown || k.x.isDown || t.action,
      ability: k.q.isDown || k.f.isDown || t.ability,
    };
  }

  update(time, delta) {
    if (this.watchFps?.(delta)) applyLite(this);
    delta = Math.min(delta, 50);
    const playing = this.mode === 'play' && !this.dead && !this.done;
    const m = this.mech.update(delta, playing ? this.player : null);
    this.moveCarried();
    const inp = this.input_();
    this.link?.update(delta, inp);
    if (!playing) return;
    const p = this.player, b = p.body;

    // duo: R = give up here (stuck somewhere): become a bubble, your partner pops you
    if (this.needAll && Phaser.Input.Keyboard.JustDown(this.keys.r)) return this.die();
    this.abil?.update(delta, inp);
    this.me.update(delta, inp, m);
    if (m.bounce) { this.me.bounce(inp.jump); sfx.stomp(); }

    // blob shadow on the ground below
    this.updateShadow();
    ui.hudFade(b.top < 110);

    // hazards (not while invulnerable; falling out of the world always counts)
    const px = b.x, py = b.y, pw = b.width, ph = b.height;
    const safe = this.invuln > 0;
    if (this.invuln > 0) {
      this.invuln -= delta;
      p.setAlpha(this.invuln > 0 && Math.floor(this.invuln / 90) % 2 ? 0.35 : 1);
    }
    for (const h of this.hazards) {
      if (!safe && px < h.x + h.w && px + pw > h.x && py < h.y + h.h && py + ph > h.y) return this.die();
    }
    if ((m.die && !safe) || b.top > H + 40) return this.die();

    // sweets
    for (const s of this.sweets) {
      if (s.got) continue;
      if (Math.abs(p.x - s.x) < 46 && Math.abs(b.center.y - s.img.y) < 50) {
        if (this.link) this.link.touchSweet(s); else this.collect(s);
      }
    }
    // checkpoints
    this.checkpoints.forEach((k, i) => {
      if (!k.on && Math.abs(p.x - k.x) < 50 && Math.abs(b.bottom - k.y) < 90) {
        this.activateCheckpoint(i);
        this.link?.send('checkpoint', { i });
      }
    });
    // goal (in duo both players have to get there, with all 3 franui)
    const z = this.goal.zone;
    if (px < z.x + z.w && px + pw > z.x && py < z.y + z.h && py + ph > z.y) {
      if (this.needAll && run.levelSweets < 3) this.needFranui();
      else if (this.goalOpen) { if (this.link) this.link.reachGoal(); else this.win(); }
    }
    run.elapsed += delta;
  }

  moveCarried() {
    for (const s of this.sweets) {
      if (!s.ride || s.got) continue;
      const x = s.ride.x, y = s.ride.y - s.ride.carryY;
      s.x = x;
      s.img.setPosition(x, y + Math.sin(this.mech.t / 250) * 3);
      s.glowImg.setPosition(x, y);
      s.sparkle.setPosition(x, y);
    }
  }

  updateShadow() {
    const p = this.player, b = p.body;
    const c = Math.floor(p.x / TILE);
    let r = Math.floor((b.bottom - TOP + 2) / TILE);
    while (r < ROWS && !this.level.solid(c, r) && this.level.at(c, r) !== '-') r++;
    if (r >= ROWS) { this.shadow.setVisible(false); return; }
    const gy = TOP + r * TILE;
    const dist = gy - b.bottom;
    this.shadow.setVisible(true).setPosition(p.x, gy + 2);
    const k = Phaser.Math.Clamp(1 - dist / 260, 0.25, 1);
    this.shadow.setScale(k, 1).setAlpha(k);
  }

  puff(x, y, n) { this.dust.emitParticleAt(x, y, n); }

  squash(sx, sy) { this.me.squash(sx, sy); }

  activateCheckpoint(i) {
    const k = this.checkpoints[i];
    if (!k || k.on) return;
    k.on = true; k.obj.activate();
    // respawn at the furthest checkpoint reached (by either player in duo)
    if (k.x >= this.respawn.x) this.respawn = { x: k.x, y: k.y };
    sfx.checkpoint();
    ui.toast('CHECKPOINT');
  }

  collect(s) {
    s.got = true;
    run.levelSweets++; run.totalSweets++;
    sfx.collect(run.levelSweets);
    this.tweens.killTweensOf([s.img, s.glowImg]);
    s.sparkle.stop();
    this.tweens.add({ targets: s.img, y: s.img.y - 60, scale: 1.6, alpha: 0, duration: 500, ease: 'Cubic.out' });
    this.tweens.add({ targets: s.glowImg, scale: 3, alpha: 0, duration: 500 });
    const burst = this.add.particles(s.x, s.img.y, 'fx-star', {
      speed: { min: 120, max: 320 }, lifespan: 600, scale: { start: 0.7, end: 0 }, tint: [0xffe27a, 0xff7aa3, 0xffffff],
      blendMode: 'ADD', emitting: false,
    }).setDepth(30);
    burst.explode(22);
    this.time.delayedCall(800, () => burst.destroy());
    const txt = this.add.text(s.x, s.img.y - 30, `+1 FRANUI  ${run.levelSweets}/3`, { fontFamily: '"Press Start 2P"', fontSize: '14px', color: '#ffe27a', stroke: '#2a0f18', strokeThickness: 5 }).setOrigin(0.5).setDepth(40);
    this.tweens.add({ targets: txt, y: txt.y - 50, alpha: 0, duration: 1100, ease: 'Cubic.out', onComplete: () => txt.destroy() });
    ui.sweets(run.levelSweets);
    if (run.levelSweets >= 3) {
      sfx.unlock();
      // some duo levels open the goal with the 3rd franui (Minecraft: the portal lights)
      const opens = this.level.openOnFranui && !this.goalOpen;
      if (opens) this.openGoal();
      this.time.delayedCall(700, () => ui.toast(opens ? 'ALL 3 FRANUI FOUND · THE WAY OUT IS OPEN!' : 'ALL 3 FRANUI FOUND!'));
    }
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    run.deaths++; run.levelDeaths++;
    ui.deaths(run.deaths);
    sfx.die();
    const p = this.player;
    const burst = this.add.particles(p.x, p.body.center.y, 'fx-px', {
      speed: { min: 150, max: 380 }, lifespan: 650, scale: { start: 2.2, end: 0 }, gravityY: 600,
      tint: [0x7e7f8b, 0xf4f1ea, 0x1f1e26, 0x4f4f5a], emitting: false,
    }).setDepth(30);
    burst.explode(26);
    p.setVisible(false); p.body.enable = false; this.shadow.setVisible(false);
    this.me.glider?.setVisible(false);
    this.cameras.main.shake(180, 0.008);
    this.cameras.main.flash(160, 255, 60, 80, false);
    this.time.delayedCall(650, () => burst.destroy());
    // duo: float as a ghost bubble until the partner touches you
    if (this.link?.becomeGhost(p.x, p.body.center.y)) return;
    this.time.delayedCall(650, () => this.respawnAt(this.respawn.x, this.respawn.y, true));
  }

  // bring the player back at (x, feet y); resetWorld re-arms enemies and set-pieces;
  // invulnMs: that long nothing can kill you (a revive)
  respawnAt(x, y, resetWorld, invulnMs = 0) {
    const p = this.player;
    p.body.enable = true;
    p.body.reset(x, y - 42);
    if (resetWorld) { this.mech.reset(x); this.abil?.reset(); }
    p.setVisible(true).setAlpha(0).setScale(1);
    this.tweens.add({ targets: p, alpha: 1, duration: 250 });
    this.squash(0.7, 1.3);
    this.me.resetState();
    this.dead = false;
    this.invuln = invulnMs;
    this.follow();
  }

  win() {
    this.done = true;
    const p = this.player;
    p.body.setVelocity(0, 0);
    p.body.setAllowGravity(false);
    this.me.play('happy');
    this.mech.set.win?.();
    this.goal.celebrate();
    sfx.win();
    this.tweens.add({ targets: p, y: p.y - 30, duration: 300, yoyo: true, ease: 'Quad.out' });
    this.time.delayedCall(900, () => {
      this.tweens.add({ targets: p, alpha: 0, scale: 0.4, duration: 500 });
    });
    this.time.delayedCall(1500, () => ui.worldCleared(this.worldIndex, this.world));
  }

  cleanup() {
    this.link?.destroy();
    this.abil?.destroy();
    this.tweens.killAll();
    this.world.cleanup?.(this);
  }
}
