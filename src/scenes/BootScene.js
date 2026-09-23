import Phaser from 'phaser';
import { buildRaccoon, buildFranui, buildFx } from '../art/sprites.js';
import { ui } from '../ui.js';

// Builds the shared sprites once, waits for the pixel fonts, then hands off to the UI.
export class BootScene extends Phaser.Scene {
  constructor() { super('boot'); }

  create() {
    buildRaccoon(this);
    buildFranui(this);
    buildFx(this);
    const fonts = Promise.all([
      document.fonts.load('16px "Press Start 2P"'),
      document.fonts.load('16px "VT323"'),
    ]).catch(() => {});
    const timeout = new Promise((r) => setTimeout(r, 2500));
    Promise.race([fonts, timeout]).then(() => ui.init(this.game));
  }
}
