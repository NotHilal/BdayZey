import { sfx } from './sfx.js';
import { CHARACTERS } from './art/sprites.js';

export const MOVE = 340, ACC_GROUND = 3000, ACC_AIR = 1900, DECEL_GROUND = 3600, DECEL_AIR = 900;
export const JUMP = 960, GRAV = 2000, FALL_MULT = 1.25, MAX_FALL = 1150;
const COYOTE = 100, BUFFER = 130;
export const CLIMB_TIME = 1.3;
const CLIMB_SPEED = 240;
export const GLIDE_FALL = 110; // cat's glider (Genshin duo): fall speed while gliding
// player hitbox inside the 129x84 character frame (facing right)
export const BODY = { w: 56, h: 46, ox: 51, oy: 33 };

const approach = (v, t, s) => (v < t ? Math.min(v + s, t) : v > t ? Math.max(v - s, t) : v);

// One playable character: sprite + arcade body + platformer controller.
// Solo uses a single Player with keyboard/touch input. In duo each client
// simulates only its own Player; the partner is drawn from network snapshots.
// abilities (duo only, from the world's kit in duoLevels.js): movement ones live
// here: wallClimb (hold into a wall), glide (press jump again in the air and hold).
// The Q abilities are in abilities.js. (doubleJump still works if passed, but no
// character has it.) speedMul slows walking (the raccoon behind his shield).
export class Player {
  constructor(scene, x, y, charKey = 'raccoon', abilities = {}) {
    this.scene = scene;
    this.ch = CHARACTERS[charKey];
    this.abilities = abilities;
    const s = (this.sprite = scene.physics.add.sprite(x, y - 42, this.ch.key, 0).setDepth(20));
    s.body.setSize(BODY.w, BODY.h).setOffset(BODY.ox, BODY.oy);
    s.body.setMaxVelocity(MOVE * 1.5, MAX_FALL);
    s.setCollideWorldBounds(true);
    // Squash & stretch must stay visual: Phaser scales the body with the sprite,
    // and a wider body on landing can push into a wall and slip through it.
    const body = s.body, updateBounds = body.updateBounds;
    body.updateBounds = function () {
      updateBounds.call(this);
      this.transform.scaleX = this.transform.scaleX < 0 ? -1 : 1;
      this.transform.scaleY = this.transform.scaleY < 0 ? -1 : 1;
      if (this.width !== this.sourceWidth || this.height !== this.sourceHeight) {
        this.width = this.sourceWidth; this.height = this.sourceHeight;
        this.halfWidth = Math.floor(this.width / 2); this.halfHeight = Math.floor(this.height / 2);
        this.updateCenter();
      }
    };
    this.facing = 1;
    this.resetState();
    this.play('idle');
  }

  get body() { return this.sprite.body; }

  play(name) { this.anim = name; this.sprite.play(`${this.ch.anim}-${name}`, true); }

  resetState() {
    this.jumpBuffer = 0; this.coyote = 0; this.wasGround = false; this.jumpHeldPrev = false; this.lastVy = 0;
    this.airJumps = 0; this.climb = CLIMB_TIME; this.climbing = false; this.launched = false;
    this.gliding = false; this.glideOn = false; this.lock = 0; this.speedMul = 1;
    this.glider?.setVisible(false);
    this.body.maxVelocity.x = MOVE * 1.5;
  }

  // thrown by the partner (duo): keeps rising even without holding jump.
  // lockMs: no steering for that long (the lasso's yank flies its own arc)
  launch(vx, vy, lockMs = 0) {
    this.body.maxVelocity.y = Math.max(MAX_FALL, -vy); // the fall cap would cut the throw short
    this.body.maxVelocity.x = Math.max(MOVE * 1.5, Math.abs(vx));
    this.lock = lockMs;
    this.body.setVelocity(vx, vy);
    this.launched = true;
    this.coyote = 0;
    this.squash(0.8, 1.25);
  }

  // inp: { left, right, jump }; m: flags from Mechanics.update ({ inWind })
  update(delta, inp, m = {}) {
    const dt = delta / 1000, sc = this.scene;
    const p = this.sprite, b = p.body;
    const onGround = b.blocked.down || b.touching.down;

    // horizontal (not while flying a lasso yank)
    const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    const acc = dir !== 0 ? (onGround ? ACC_GROUND : ACC_AIR) : (onGround ? DECEL_GROUND : DECEL_AIR);
    if (this.lock > 0) this.lock -= delta;
    else b.velocity.x = approach(b.velocity.x, dir * MOVE * this.speedMul, acc * dt);
    if (onGround && this.lock <= 0) b.maxVelocity.x = MOVE * 1.5;
    if (dir !== 0 && dir !== this.facing) {
      this.facing = dir;
      p.setFlipX(dir < 0);
      b.setOffset(dir < 0 ? p.width - BODY.ox - BODY.w : BODY.ox, BODY.oy);
      if (onGround) sc.puff(p.x, b.bottom, 3);
    }

    // jump: coyote time + buffer + variable height
    if (onGround) { this.airJumps = 1; this.climb = CLIMB_TIME; }
    this.coyote = onGround ? COYOTE : this.coyote - delta;
    const pressed = inp.jump && !this.jumpHeldPrev;
    this.jumpBuffer = pressed ? BUFFER : this.jumpBuffer - delta;

    // raccoon (duo): climb walls while pushing into them, jump off them
    // only real walls can be climbed (not gates or cracked blocks): scene.climbable()
    let wall = (b.blocked.left && inp.left) ? -1 : (b.blocked.right && inp.right) ? 1 : 0;
    if (wall && sc.climbable && !sc.climbable(wall)) wall = 0;
    this.climbing = !!this.abilities.wallClimb && !onGround && wall !== 0 && this.climb > 0;
    if (this.climbing) {
      // stamina only runs down while actually climbing (not while still rising from a jump)
      if (b.velocity.y >= -CLIMB_SPEED) this.climb -= dt;
      b.velocity.y = Math.min(b.velocity.y, -CLIMB_SPEED);
      if (pressed) {
        // jump while pushing into the wall: hop up it; otherwise kick off away from it
        const into = (wall > 0 && inp.right) || (wall < 0 && inp.left);
        b.velocity.y = -JUMP * 0.9;
        if (!into) b.velocity.x = -wall * MOVE * 1.2;
        this.climbing = false; this.jumpBuffer = 0;
        sfx.jump();
      }
    }

    // (a throw still counts as "on the ground" for a frame: don't let jump replace it)
    if (this.jumpBuffer > 0 && this.coyote > 0 && !this.launched) {
      b.velocity.y = -JUMP;
      this.jumpBuffer = 0; this.coyote = 0;
      sc.puff(p.x, b.bottom, 6);
      this.squash(0.8, 1.2);
      sfx.jump();
    } else if (pressed && this.abilities.doubleJump && !onGround && this.coyote <= 0 && this.airJumps > 0 && !this.climbing) {
      // duo: one extra jump in the air
      this.airJumps--;
      b.velocity.y = -JUMP * 0.85;
      this.jumpBuffer = 0;
      sc.puff(p.x, b.bottom, 8);
      this.squash(0.85, 1.15);
      sfx.jump();
    }
    if (this.launched && b.velocity.y >= 0) { this.launched = false; b.maxVelocity.y = MAX_FALL; }
    // cat (Genshin duo): glide. Press jump again in the air and hold it: slow fall
    if (this.abilities.glide) {
      if (onGround || !inp.jump || this.climbing) this.glideOn = false;
      else if (pressed && this.coyote <= 0) this.glideOn = true;
      const was = this.gliding;
      this.gliding = this.glideOn && b.velocity.y > 0;
      if (this.gliding) b.maxVelocity.y = GLIDE_FALL;
      else if (was) b.maxVelocity.y = MAX_FALL;
      this.gliderImg().setVisible(this.gliding).setPosition(p.x, p.y - 30).setFlipX(this.facing < 0);
    }
    if (!inp.jump && !m.inWind && !this.climbing && !this.launched && b.velocity.y < -380) b.velocity.y = -380;
    b.setGravityY(b.velocity.y > 0 && !m.inWind && !this.gliding ? GRAV * (FALL_MULT - 1) : 0);
    this.jumpHeldPrev = inp.jump;

    // landing
    if (onGround && !this.wasGround && this.lastVy > 500) { sc.puff(p.x, b.bottom, 8); this.squash(1.22, 0.8); sfx.land(); }
    this.lastVy = b.velocity.y;
    this.wasGround = onGround;

    // animation
    if (!onGround) this.play(b.velocity.y < 0 ? 'jump' : 'fall');
    else if (Math.abs(b.velocity.x) > 40) {
      this.play('run');
      p.anims.timeScale = 0.6 + Math.abs(b.velocity.x) / MOVE * 0.5;
    } else this.play('idle');
    if (onGround && Math.abs(b.velocity.x) > 200 && Math.random() < 0.08) sc.puff(p.x - this.facing * 20, b.bottom, 1);
  }

  // the glider drawn over the cat while gliding
  gliderImg() {
    if (!this.glider) this.glider = this.scene.add.image(0, 0, gliderTexture(this.scene)).setDepth(21).setVisible(false);
    return this.glider;
  }

  // landed on a stompable enemy
  bounce(jumpHeld) {
    const b = this.body;
    b.velocity.y = jumpHeld ? -JUMP * 0.85 : -JUMP * 0.6;
    this.coyote = 0;
    this.scene.puff(this.sprite.x, b.bottom, 6);
    this.squash(1.2, 0.8);
  }

  squash(sx, sy) {
    const p = this.sprite;
    // only stop the previous squash, not other player tweens (e.g. the respawn fade-in)
    this.squashTween?.stop();
    p.setScale(sx, sy);
    this.squashTween = this.scene.tweens.add({ targets: p, scaleX: 1, scaleY: 1, duration: 220, ease: 'Back.out' });
  }
}

// a small wind glider (two leaf wings) for the cat; shared with the partner's view
export function gliderTexture(scene) {
  const key = 'glider';
  if (!scene.textures.exists(key)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x3a8f6e).fillTriangle(4, 22, 48, 4, 48, 22).fillTriangle(92, 22, 48, 4, 48, 22);
    g.fillStyle(0x7fe0b8).fillTriangle(10, 20, 48, 8, 48, 20).fillTriangle(86, 20, 48, 8, 48, 20);
    g.lineStyle(2, 0xe8fff4, 0.9).lineBetween(48, 4, 48, 30);
    g.generateTexture(key, 96, 32); g.destroy();
  }
  return key;
}
