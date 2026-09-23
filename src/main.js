import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.js';
import { GameScene } from './scenes/GameScene.js';

const params = new URLSearchParams(location.search);
const debug = import.meta.env.DEV && params.has('debug');
// dev-only: ?timer drives the game loop with setTimeout instead of
// requestAnimationFrame, so background tabs keep running (tools/duo.mjs)
const timer = import.meta.env.DEV && params.has('timer');
// dev-only: ?canvas uses the Canvas renderer (two software-WebGL pages in one
// headless browser can stall each other)
const canvas = import.meta.env.DEV && params.has('canvas');

new Phaser.Game({
  type: canvas ? Phaser.CANVAS : Phaser.AUTO,
  parent: 'game',
  width: 1280,
  height: 720,
  backgroundColor: '#000000',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: { default: 'arcade', arcade: { gravity: { y: 2000 }, debug } },
  render: { antialias: true, roundPixels: true },
  input: { activePointers: 3 },
  fps: { forceSetTimeOut: timer, target: (import.meta.env.DEV && +params.get('fps')) || 60 },
  scene: [BootScene, GameScene],
});
