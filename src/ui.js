import { run, fmtTime } from './state.js';
import { sfx } from './sfx.js';
import { WORLDS } from './worlds/index.js';

const $ = (id) => document.getElementById(id);
let game = null;
let franuiURL = '';
let toastTimer = null;
let clearTimer = null;
let finaleCycle = null;
let screen = 'title'; // title | play | clear | finale

function scene() { return game.scene.getScene('game'); }
function startWorld(i, mode = 'play') {
  const s = scene();
  if (s.sys.isActive() || s.sys.isPaused()) s.scene.restart({ world: i, mode });
  else game.scene.start('game', { world: i, mode });
}
function show(id, on) { $(id).hidden = !on; }
function sweetImgs(n, got) {
  return Array.from({ length: n }, (_, i) => `<img src="${franuiURL}" alt="" class="${i < got ? 'got' : ''}">`).join('');
}

export const ui = {
  touch: { left: false, right: false, jump: false },

  get screen() { return screen; },

  init(g) {
    game = g;
    if (import.meta.env.DEV) window.__ui = this;
    franuiURL = g.textures.getBase64('franui');
    // raccoon portrait for title/finale cards
    const frame = g.textures.getFrame('raccoon', 0);
    ['titleRaccoon', 'finaleRaccoon'].forEach((id) => {
      const c = $(id); const x = c.getContext('2d');
      x.imageSmoothingEnabled = false;
      x.drawImage(frame.source.image, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight, 0, 0, c.width, c.height);
    });

    $('startBtn').addEventListener('click', () => this.begin());
    $('nextBtn').addEventListener('click', () => this.next());
    $('replayBtn').addEventListener('click', () => this.replay());
    $('muteBtn').addEventListener('click', () => { $('muteBtn').textContent = sfx.toggle() ? '🔇' : '🔊'; });
    $('muteBtn').textContent = sfx.muted ? '🔇' : '🔊';

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const go = e.code === 'Enter' || e.code === 'Space';
      if (screen === 'title' && go) { e.preventDefault(); this.begin(); }
      else if (screen === 'clear' && (go || e.code === 'ArrowRight' || e.code === 'KeyD')) { e.preventDefault(); this.next(); }
    });

    // touch controls: only on touch-first devices
    const coarse = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    if (coarse) {
      const bind = (id, key) => {
        const el = $(id);
        const on = (e) => { e.preventDefault(); this.touch[key] = true; el.classList.add('on'); sfx.init(); };
        const off = () => { this.touch[key] = false; el.classList.remove('on'); };
        el.addEventListener('pointerdown', on);
        el.addEventListener('pointerup', off);
        el.addEventListener('pointercancel', off);
        el.addEventListener('pointerleave', off);
      };
      bind('tLeft', 'left'); bind('tRight', 'right'); bind('tJump', 'jump');
    }
    this.coarse = coarse;

    // debug: ?world=3 jumps straight into a world
    const q = new URLSearchParams(location.search);
    if (import.meta.env.DEV && q.has('world')) {
      run.reset();
      screen = 'play';
      show('titleOverlay', false);
      startWorld(+q.get('world'));
    } else {
      startWorld(0, 'attract');
    }

    setInterval(() => { if (screen === 'play') $('hudTimer').textContent = '⏱ ' + fmtTime(run.elapsed); }, 100);
  },

  begin() {
    sfx.init();
    run.reset();
    screen = 'play';
    show('titleOverlay', false);
    startWorld(0);
  },

  worldStart(i, world) {
    run.newWorld();
    screen = 'play';
    show('hud', true);
    show('touch', this.coarse);
    document.documentElement.style.setProperty('--accent', world.accent);
    $('hudWorld').textContent = `${i + 1} · ${world.name}`;
    this.sweets(0);
    this.deaths(run.deaths);
  },

  sweets(n) { $('hudSweets').innerHTML = sweetImgs(3, n); },
  deaths(n) { $('hudDeaths').textContent = '💀 ' + n; },

  toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
  },

  worldCleared(i, world) {
    screen = 'clear';
    this.touch.left = this.touch.right = this.touch.jump = false;
    show('touch', false);
    $('clearKicker').textContent = `WORLD ${i + 1} OF ${WORLDS.length} COMPLETE`;
    $('clearTitle').textContent = world.clearText || `${world.name} CLEARED!`;
    $('clearSweets').innerHTML = sweetImgs(3, 3);
    $('clearDeaths').textContent = run.levelDeaths;
    $('clearTotal').textContent = `${run.totalSweets}/${WORLDS.length * 3}`;
    $('clearTime').textContent = fmtTime(run.elapsed);
    $('nextBtn').textContent = i + 1 < WORLDS.length ? 'NEXT WORLD ▶' : 'OPEN YOUR PRESENT 🎁';
    this.clearIndex = i;
    show('clearOverlay', true);
    // ignore inputs for a moment so a held key doesn't skip the screen
    screen = 'clear-wait';
    clearTimeout(clearTimer);
    clearTimer = setTimeout(() => { screen = 'clear'; $('nextBtn').focus(); }, 700);
  },

  next() {
    if (screen !== 'clear') return;
    show('clearOverlay', false);
    const n = this.clearIndex + 1;
    if (n < WORLDS.length) { screen = 'play'; startWorld(n); }
    else this.finale();
  },

  finale() {
    screen = 'finale';
    show('hud', false);
    show('touch', false);
    $('finaleSweets').innerHTML = sweetImgs(WORLDS.length * 3, WORLDS.length * 3);
    $('finDeaths').textContent = run.deaths;
    $('finTime').textContent = fmtTime(run.elapsed);
    const conf = $('confetti');
    conf.innerHTML = '';
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const colors = ['#ff5c8a', '#f6c453', '#2dd4bf', '#a78bfa', '#ffffff', '#7fd34e'];
      for (let i = 0; i < 60; i++) {
        const el = document.createElement('i');
        el.style.left = Math.random() * 100 + '%';
        el.style.background = colors[i % colors.length];
        el.style.animationDuration = 3 + Math.random() * 4 + 's';
        el.style.animationDelay = -Math.random() * 6 + 's';
        conf.appendChild(el);
      }
    }
    show('finaleOverlay', true);
    // slideshow of all five worlds behind the letter
    let w = 0;
    startWorld(w, 'finale');
    clearInterval(finaleCycle);
    finaleCycle = setInterval(() => { w = (w + 1) % WORLDS.length; startWorld(w, 'finale'); }, 8000);
  },

  replay() {
    clearInterval(finaleCycle);
    show('finaleOverlay', false);
    this.begin();
  },
};
