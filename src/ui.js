import { run, fmtTime } from './state.js';
import { sfx, music } from './sfx.js';
import { WORLDS } from './worlds/index.js';
import { duo } from './duo.js';
import { net } from './net.js';

const EMOJI = { cat: '🐱', raccoon: '🦝' };

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
  touch: { left: false, right: false, jump: false, action: false },

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

    $('startBtn').addEventListener('click', () => { duo.reset(); this.begin(); });
    this.initDuo();
    $('nextBtn').addEventListener('click', () => this.next());
    $('replayBtn').addEventListener('click', () => this.replay());
    $('muteBtn').addEventListener('click', () => { $('muteBtn').textContent = sfx.toggle() ? '🔇' : '🔊'; });
    $('muteBtn').textContent = sfx.muted ? '🔇' : '🔊';

    window.addEventListener('keydown', (e) => {
      if (e.repeat || e.target.tagName === 'INPUT') return;
      const go = e.code === 'Enter' || e.code === 'Space';
      if (screen === 'title' && go && $('duoPanel').hidden) { e.preventDefault(); this.begin(); }
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
      bind('tLeft', 'left'); bind('tRight', 'right'); bind('tJump', 'jump'); bind('tAct', 'action');
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
    // invite link: ?room=ABCD opens the duo lobby and joins
    if (q.has('room')) { this.openDuo(true); $('codeIn').value = q.get('room').toUpperCase(); this.joinDuo(); }

    setInterval(() => { if (screen === 'play') $('hudTimer').textContent = '⏱ ' + fmtTime(run.elapsed); }, 100);
  },

  begin() {
    sfx.init();
    run.reset();
    screen = 'play';
    show('titleOverlay', false);
    startWorld(0);
  },

  // ------------------------------------------------------------------ duo lobby
  initDuo() {
    let pick = 'cat';
    $('duoBtn').addEventListener('click', () => this.openDuo(true));
    $('duoBack').addEventListener('click', () => { duo.reset(); this.openDuo(false); });
    document.querySelectorAll('.pick').forEach((b) => b.addEventListener('click', () => {
      pick = b.dataset.char;
      document.querySelectorAll('.pick').forEach((o) => o.classList.toggle('on', o === b));
    }));
    $('createBtn').addEventListener('click', async () => {
      sfx.init();
      this.duoNote('');
      try {
        const code = await duo.create(pick, () => {
          $('duoStatus').textContent = `${EMOJI[duo.partner]} Your partner is here!`;
          show('duoStartBtn', true);
          $('duoStartBtn').focus();
        });
        this.duoRoom(code, 'Waiting for your partner… send them the code or the link.');
      } catch (err) { this.duoNote(err.message); }
    });
    $('joinBtn').addEventListener('click', () => this.joinDuo());
    $('codeIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') this.joinDuo(); });
    $('duoStartBtn').addEventListener('click', () => { net.send('start'); this.beginDuo(); });
    $('copyBtn').addEventListener('click', async () => {
      const link = `${location.origin}${location.pathname}?room=${duo.code}`;
      try { await navigator.clipboard.writeText(link); $('copyBtn').textContent = 'COPIED ✓'; } catch { $('copyBtn').textContent = link; }
    });
    $('soloBtn').addEventListener('click', () => { duo.reset(); this.partnerLost(false); });
    // messages that move both players through the screens together
    net.on('start', () => { if (screen === 'title' && duo.connected) this.beginDuo(); });
    // the partner may press "next" before our own clear screen is up: remember it
    net.on('next', (d) => {
      if (!duo.active) return;
      if (this.clearIndex === d.i && screen.startsWith('clear')) { screen = 'clear'; this.next(true); }
      else this.pendingNext = d.i;
    });
    net.on('replay', () => { if (duo.active && screen === 'finale') this.replay(true); });
  },

  openDuo(on) {
    show('titleMain', !on);
    show('duoPanel', on);
    show('duoChoose', true);
    show('duoRoom', false);
    show('duoStartBtn', false);
    this.duoNote(net.online ? '' : 'Test mode (?localnet): Duo only links tabs of this same browser.');
  },

  async joinDuo() {
    const code = $('codeIn').value.trim().toUpperCase();
    if (code.length !== 4) { this.duoNote('Room codes have 4 letters.'); return; }
    sfx.init();
    this.duoNote('Connecting…');
    try {
      await duo.join(code);
      this.duoNote(net.online ? '' : 'Test mode (same browser only).');
      this.duoRoom(code, `${EMOJI[duo.me]} Connected! You play the ${duo.me}. Waiting for the host to start…`);
      show('copyBtn', false);
    } catch (err) { this.duoNote(err.message); }
  },

  duoRoom(code, status) {
    show('duoChoose', false);
    show('duoRoom', true);
    show('copyBtn', true);
    $('copyBtn').textContent = 'COPY INVITE LINK';
    $('roomCode').textContent = code;
    $('duoStatus').textContent = status;
  },

  duoNote(msg) { $('duoNote').textContent = msg; },

  beginDuo() {
    duo.active = true;
    show('duoPanel', false);
    show('titleMain', true);
    this.begin();
  },

  // partner dropped: pause and offer to carry on alone
  partnerLost(on) {
    if (!duo.active && on) return;
    show('lostOverlay', on);
    const s = game && scene();
    if (!s || screen !== 'play') return;
    if (on && s.sys.isActive()) s.scene.pause();
    else if (!on && s.sys.isPaused()) s.scene.resume();
    this.partnerChip();
  },

  partnerChip() {
    const el = $('hudPartner');
    el.hidden = !duo.active;
    if (!duo.active) return;
    el.innerHTML = `${EMOJI[duo.partner]} PARTNER <i class="dot ${duo.lost ? 'off' : 'on'}"></i>`;
  },

  worldStart(i, world) {
    run.newWorld();
    screen = 'play';
    show('hud', true);
    show('touch', this.coarse);
    show('tAct', duo.active);
    this.partnerChip();
    this.countdown(null);
    document.documentElement.style.setProperty('--accent', world.accent);
    $('hudWorld').textContent = `${i + 1} · ${world.name}`;
    this.sweets(0);
    this.deaths(run.deaths);
  },

  sweets(n) { $('hudSweets').innerHTML = sweetImgs(3, n); },

  // big set-piece timer under the HUD (Valorant spike); null hides it
  countdown(sec, label = '') {
    const el = $('countdown');
    if (sec == null) { el.hidden = true; return; }
    el.hidden = false;
    el.classList.toggle('urgent', sec <= 5);
    el.innerHTML = `<small>${label}</small>${sec.toFixed(1)}`;
  },
  deaths(n) { $('hudDeaths').textContent = '💀 ' + n; },

  toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), Math.max(1800, msg.length * 55));
  },

  worldCleared(i, world) {
    screen = 'clear';
    this.countdown(null);
    this.touch.left = this.touch.right = this.touch.jump = this.touch.action = false;
    show('touch', false);
    $('clearKicker').textContent = `WORLD ${i + 1} OF ${WORLDS.length} COMPLETE`;
    $('clearTitle').textContent = world.clearText || `${world.name} CLEARED!`;
    $('clearSweets').innerHTML = sweetImgs(3, run.levelSweets);
    $('clearDeaths').textContent = run.levelDeaths;
    $('clearTotal').textContent = `${run.totalSweets}/${WORLDS.length * 3}`;
    $('clearTime').textContent = fmtTime(run.elapsed);
    $('nextBtn').textContent = i + 1 < WORLDS.length ? 'NEXT WORLD ▶' : 'OPEN YOUR PRESENT 🎁';
    this.clearIndex = i;
    show('clearOverlay', true);
    // ignore inputs for a moment so a held key doesn't skip the screen
    screen = 'clear-wait';
    clearTimeout(clearTimer);
    clearTimer = setTimeout(() => {
      screen = 'clear'; $('nextBtn').focus();
      if (duo.active && this.pendingNext === i) { this.pendingNext = null; this.next(true); }
    }, 700);
  },

  next(fromPartner = false) {
    if (screen !== 'clear') return;
    if (duo.active && !fromPartner) net.send('next', { i: this.clearIndex });
    show('clearOverlay', false);
    const n = this.clearIndex + 1;
    if (n < WORLDS.length) { screen = 'play'; startWorld(n); }
    else this.finale();
  },

  finale() {
    screen = 'finale';
    music.play('birthday');
    show('hud', false);
    show('touch', false);
    const total = WORLDS.length * 3;
    $('finaleSweets').innerHTML = sweetImgs(total, run.totalSweets);
    $('finCount').textContent = run.totalSweets === total ? 'All fifteen franui collected.' : `${run.totalSweets} of ${total} franui collected.`;
    $('finDeaths').textContent = run.deaths;
    $('finTime').textContent = fmtTime(run.elapsed);
    show('finDuo', duo.active);
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

  replay(fromPartner = false) {
    if (duo.active && !fromPartner) net.send('replay');
    clearInterval(finaleCycle);
    show('finaleOverlay', false);
    this.begin();
  },
};
