import Phaser from 'phaser';
import { WORLDS } from '../worlds/index.js';
import { LEVELS, parseLevel, TILE, TOP, ROWS } from '../levels.js';
import { makeCanvas, chunkedImage, addTexture } from '../art/util.js';
import { run } from '../state.js';
import { ui } from '../ui.js';
import { sfx } from '../sfx.js';

const W = 1280, H = 720;
const MOVE = 340, ACC_GROUND = 3000, ACC_AIR = 1900, DECEL_GROUND = 3600, DECEL_AIR = 900;
const JUMP = 960, GRAV = 2000, FALL_MULT = 1.25, MAX_FALL = 1150;
const COYOTE = 100, BUFFER = 130;
// player hitbox inside the 129x84 raccoon frame (facing right)
const BODY = { w: 56, h: 46, ox: 51, oy: 33 };

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
    const level = parseLevel(LEVELS[world.key]);
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
      imgs.forEach(({ key, x }) => {
        this.add.image(x, layer.top, key).setOrigin(0).setScrollFactor(layer.factor, 1).setDepth(-90 + i);
      });
      layer.after?.(this, i);
    });

    // --- whatever lies at the bottom of pits (water, river, canyon...)
    if (world.pitFill) {
      chunkedImage(this, 'w_pit', level.width, 200, (ctx, x0, x1) => world.pitFill(ctx, x0, x1), {})
        .forEach(({ key, x }) => this.add.image(x, H - 200, key).setOrigin(0).setDepth(-1));
    }

    // --- terrain (painted once, in chunks)
    chunkedImage(this, 'w_terrain', level.width, H, (ctx, x0, x1) => world.paintTerrain(ctx, level, x0, x1), { nearest: world.pixel !== false })
      .forEach(({ key, x }) => this.add.image(x, 0, key).setOrigin(0).setDepth(0));

    // --- collision: merge horizontal runs of solid cells into static bodies
    this.solids = this.physics.add.staticGroup();
    this.oneWays = this.physics.add.staticGroup();
    for (let r = 0; r < ROWS; r++) {
      let c = 0;
      while (c < level.cols) {
        if (level.solid(c, r)) {
          const s = c;
          while (c < level.cols && level.solid(c, r)) c++;
          this.addRect(this.solids, s * TILE, TOP + r * TILE, (c - s) * TILE, TILE);
        } else if (level.at(c, r) === '-') {
          const s = c;
          while (c < level.cols && level.at(c, r) === '-') c++;
          const b = this.addRect(this.oneWays, s * TILE, TOP + r * TILE, (c - s) * TILE, 18);
          b.body.checkCollision.down = false; b.body.checkCollision.left = false; b.body.checkCollision.right = false;
        } else c++;
      }
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
      this.tweens.add({ targets: [img, glowImg], y: s.y - 7, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut', delay: i * 200 });
      this.tweens.add({ targets: glowImg, scale: 1.2, alpha: 0.45, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      const sparkle = this.add.particles(s.x, s.y, 'fx-star', {
        x: { min: -22, max: 22 }, y: { min: -26, max: 20 }, lifespan: 700, scale: { start: 0.45, end: 0 },
        alpha: { start: 1, end: 0 }, frequency: 380, tint: 0xfff3c4, blendMode: 'ADD',
      }).setDepth(11);
      return { ...s, img, glowImg, sparkle, got: false, i };
    });

    // --- checkpoints & goal
    this.checkpoints = level.ents.checkpoints.map((k) => ({ ...k, obj: world.checkpoint(this, k), on: false }));
    this.goal = world.goal(this, level.ents.goal);

    // --- player
    this.start = level.ents.start;
    const q = new URLSearchParams(location.search);
    if (import.meta.env.DEV && q.has('x')) this.start = { x: +q.get('x') * TILE + TILE / 2, y: TOP + 2 * TILE };
    this.respawn = { x: this.start.x, y: this.start.y };
    this.player = this.physics.add.sprite(this.start.x, this.start.y - 42, 'raccoon', 0).setDepth(20);
    this.player.body.setSize(BODY.w, BODY.h).setOffset(BODY.ox, BODY.oy);
    this.player.body.setMaxVelocity(MOVE * 1.5, MAX_FALL);
    this.player.setCollideWorldBounds(true);
    this.player.play('rc-idle');
    this.facing = 1;
    this.physics.add.collider(this.player, this.solids);
    this.physics.add.collider(this.player, this.oneWays);
    this.shadow = this.add.ellipse(0, 0, 58, 10, 0x000000, 0.22).setDepth(19);

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
      cam.startFollow(this.player, true, 0.1, 0.1, 0, 60);
      cam.setDeadzone(80, 400);
      cam.fadeIn(450, 0, 0, 0);
    }

    // --- input
    this.keys = this.input.keyboard.addKeys({
      left: 'LEFT', right: 'RIGHT', up: 'UP', a: 'A', d: 'D', w: 'W', space: 'SPACE', z: 'Z',
    });
    this.input.keyboard.addCapture('LEFT,RIGHT,UP,DOWN,SPACE');
    this.jumpBuffer = 0; this.coyote = 0; this.wasGround = false; this.dead = false; this.done = false;
    this.jumpHeldPrev = false;

    this.events.once('shutdown', () => this.cleanup());

    if (this.mode === 'play') {
      ui.worldStart(this.worldIndex, world);
      this.banner();
    }
    // debug hook for the screenshot/flow scripts in tools/
    if (import.meta.env.DEV) window.__game = this;
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
    };
  }

  update(time, delta) {
    if (this.mode !== 'play' || this.dead || this.done) return;
    const dt = Math.min(delta, 50) / 1000;
    const p = this.player, b = p.body;
    const inp = this.input_();
    const onGround = b.blocked.down || b.touching.down;

    // horizontal
    const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    const target = dir * MOVE;
    const acc = dir !== 0 ? (onGround ? ACC_GROUND : ACC_AIR) : (onGround ? DECEL_GROUND : DECEL_AIR);
    b.velocity.x = approach(b.velocity.x, target, acc * dt);
    if (dir !== 0 && dir !== this.facing) {
      this.facing = dir;
      p.setFlipX(dir < 0);
      b.setOffset(dir < 0 ? p.width - BODY.ox - BODY.w : BODY.ox, BODY.oy);
      if (onGround) this.puff(p.x, b.bottom, 3);
    }

    // jump: coyote time + buffer + variable height
    this.coyote = onGround ? COYOTE : this.coyote - delta;
    const pressed = inp.jump && !this.jumpHeldPrev;
    this.jumpBuffer = pressed ? BUFFER : this.jumpBuffer - delta;
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      b.velocity.y = -JUMP;
      this.jumpBuffer = 0; this.coyote = 0;
      this.puff(p.x, b.bottom, 6);
      this.squash(0.8, 1.2);
      sfx.jump();
    }
    if (!inp.jump && b.velocity.y < -380) b.velocity.y = -380;
    b.setGravityY(b.velocity.y > 0 ? GRAV * (FALL_MULT - 1) : 0);
    this.jumpHeldPrev = inp.jump;

    // landing
    if (onGround && !this.wasGround) {
      if (this.lastVy > 500) { this.puff(p.x, b.bottom, 8); this.squash(1.22, 0.8); sfx.land(); }
    }
    this.lastVy = b.velocity.y;
    this.wasGround = onGround;

    // animation
    if (!onGround) p.play(b.velocity.y < 0 ? 'rc-jump' : 'rc-fall', true);
    else if (Math.abs(b.velocity.x) > 40) {
      p.play('rc-run', true);
      p.anims.timeScale = 0.6 + Math.abs(b.velocity.x) / MOVE * 0.5;
    } else p.play('rc-idle', true);
    if (onGround && Math.abs(b.velocity.x) > 200 && Math.random() < 0.08) this.puff(p.x - this.facing * 20, b.bottom, 1);

    // blob shadow on the ground below
    this.updateShadow();

    // hazards
    const px = b.x, py = b.y, pw = b.width, ph = b.height;
    for (const h of this.hazards) {
      if (px < h.x + h.w && px + pw > h.x && py < h.y + h.h && py + ph > h.y) return this.die();
    }
    if (b.top > H + 40) return this.die();

    // sweets
    for (const s of this.sweets) {
      if (s.got) continue;
      if (Math.abs(p.x - s.x) < 46 && Math.abs(b.center.y - s.img.y) < 50) this.collect(s);
    }
    // checkpoints
    for (const k of this.checkpoints) {
      if (!k.on && Math.abs(p.x - k.x) < 50 && Math.abs(b.bottom - k.y) < 90) {
        k.on = true; k.obj.activate(); this.respawn = { x: k.x, y: k.y };
        sfx.checkpoint();
        ui.toast('CHECKPOINT');
      }
    }
    // goal
    const z = this.goal.zone;
    if (px < z.x + z.w && px + pw > z.x && py < z.y + z.h && py + ph > z.y) {
      if (run.levelSweets >= 3) this.win();
      else if (!this.goalNag || time - this.goalNag > 2500) { this.goalNag = time; ui.toast(`FIND ALL 3 FRANUI FIRST · ${run.levelSweets}/3`); sfx.nope(); }
    }
    run.elapsed += delta;
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

  squash(sx, sy) {
    const p = this.player;
    // only stop the previous squash, not other player tweens (e.g. the respawn fade-in)
    this.squashTween?.stop();
    p.setScale(sx, sy);
    this.squashTween = this.tweens.add({ targets: p, scaleX: 1, scaleY: 1, duration: 220, ease: 'Back.out' });
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
      this.goal.activate();
      sfx.unlock();
      this.time.delayedCall(700, () => ui.toast(this.world.goalHint || 'THE EXIT IS OPEN!'));
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
    this.cameras.main.shake(180, 0.008);
    this.cameras.main.flash(160, 255, 60, 80, false);
    this.time.delayedCall(650, () => {
      burst.destroy();
      p.body.enable = true;
      p.body.reset(this.respawn.x, this.respawn.y - 42);
      p.setVisible(true).setAlpha(0);
      this.tweens.add({ targets: p, alpha: 1, duration: 250 });
      this.squash(0.7, 1.3);
      this.dead = false; this.jumpBuffer = 0;
    });
  }

  win() {
    this.done = true;
    const p = this.player;
    p.body.setVelocity(0, 0);
    p.body.setAllowGravity(false);
    p.play('rc-happy');
    this.goal.celebrate();
    sfx.win();
    this.tweens.add({ targets: p, y: p.y - 30, duration: 300, yoyo: true, ease: 'Quad.out' });
    this.time.delayedCall(900, () => {
      this.tweens.add({ targets: p, alpha: 0, scale: 0.4, duration: 500 });
    });
    this.time.delayedCall(1500, () => ui.worldCleared(this.worldIndex, this.world));
  }

  cleanup() {
    this.tweens.killAll();
    this.world.cleanup?.(this);
  }
}

function approach(v, target, step) {
  if (v < target) return Math.min(v + step, target);
  if (v > target) return Math.max(v - step, target);
  return v;
}
