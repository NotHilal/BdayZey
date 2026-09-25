// Tiny WebAudio synth: chiptune-style sound effects and a step sequencer for
// the per-world music (no audio files needed). Track data lives in tracks.js.
import { TRACKS } from './tracks.js';

let ac = null;
let muted = false;
try { muted = localStorage.getItem('zsq-muted') === '1'; } catch {}

function ctx() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}

function tone({ freq = 440, to = null, dur = 0.12, type = 'square', vol = 0.08, delay = 0 }) {
  if (muted) return;
  const a = ctx(); if (!a) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

let noiseBuf = null;
function noiseSource(a) {
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = a.createBufferSource();
  s.buffer = noiseBuf; s.loop = true;
  return s;
}

function noise({ dur = 0.1, vol = 0.1, delay = 0, hp = 400, lp = 0, dest = null, at = null }) {
  if (muted) return;
  const a = ctx(); if (!a) return;
  const t0 = at ?? a.currentTime + delay;
  const s = noiseSource(a), g = a.createGain(), f = a.createBiquadFilter();
  f.type = 'highpass'; f.frequency.value = hp;
  let node = s.connect(f);
  if (lp) { const l = a.createBiquadFilter(); l.type = 'lowpass'; l.frequency.value = lp; node = node.connect(l); }
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  node.connect(g).connect(dest || a.destination);
  s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.02);
}

const NOTES = [523.25, 659.25, 783.99, 1046.5];
export const sfx = {
  init() { ctx(); },
  get muted() { return muted; },
  toggle() {
    muted = !muted;
    try { localStorage.setItem('zsq-muted', muted ? '1' : '0'); } catch {}
    if (muted) music.pause(); else music.resume();
    return muted;
  },
  jump() { tone({ freq: 300, to: 620, dur: 0.12, vol: 0.05 }); },
  land() { noise({ dur: 0.07, vol: 0.06, hp: 900 }); },
  collect(n) {
    const k = [1, 1.122, 1.26][Math.min(2, n - 1)] || 1;
    NOTES.forEach((f, i) => tone({ freq: f * k, dur: 0.1, vol: 0.05, delay: i * 0.055, type: 'triangle' }));
  },
  unlock() { [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone({ freq: f, dur: 0.16, vol: 0.05, delay: 0.25 + i * 0.07, type: 'square' })); },
  checkpoint() { tone({ freq: 660, dur: 0.08, vol: 0.05, type: 'triangle' }); tone({ freq: 990, dur: 0.14, vol: 0.05, delay: 0.08, type: 'triangle' }); },
  mine() { noise({ dur: 0.12, vol: 0.12, hp: 300, lp: 2500 }); tone({ freq: 180, to: 90, dur: 0.1, vol: 0.05, type: 'square' }); },
  place() { noise({ dur: 0.06, vol: 0.1, hp: 200, lp: 1800 }); tone({ freq: 240, to: 200, dur: 0.06, vol: 0.04, type: 'square' }); },
  nope() { tone({ freq: 220, to: 180, dur: 0.14, vol: 0.05 }); },
  die() { tone({ freq: 520, to: 90, dur: 0.35, vol: 0.07, type: 'sawtooth' }); noise({ dur: 0.18, vol: 0.05 }); },
  win() { [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5].forEach((f, i) => tone({ freq: f, dur: i > 3 ? 0.3 : 0.12, vol: 0.06, delay: i * 0.11, type: 'square' })); },
  // level mechanics
  secret() { [587.33, 739.99, 880, 1174.66, 1479.98].forEach((f, i) => tone({ freq: f, dur: 0.14, vol: 0.045, delay: i * 0.07, type: 'triangle' })); },
  stomp() { tone({ freq: 420, to: 110, dur: 0.14, vol: 0.07 }); noise({ dur: 0.06, vol: 0.05, hp: 1500 }); },
  plate() { tone({ freq: 160, to: 120, dur: 0.08, vol: 0.06, type: 'square' }); },
  door() { noise({ dur: 0.3, vol: 0.05, hp: 150, lp: 900 }); tone({ freq: 110, to: 80, dur: 0.25, vol: 0.04, type: 'sawtooth' }); },
  tick() { tone({ freq: 1400, dur: 0.03, vol: 0.03, type: 'square' }); },
  wind() { noise({ dur: 0.7, vol: 0.05, hp: 500, lp: 2500 }); },
  fuse() { noise({ dur: 1.25, vol: 0.06, hp: 2500 }); },
  boom() { noise({ dur: 0.8, vol: 0.25, hp: 40, lp: 1200 }); tone({ freq: 120, to: 35, dur: 0.6, vol: 0.12, type: 'sawtooth' }); },
  shot() { tone({ freq: 900, to: 220, dur: 0.22, vol: 0.05, type: 'sawtooth' }); },
  gun() { noise({ dur: 0.18, vol: 0.16, hp: 600 }); tone({ freq: 180, to: 50, dur: 0.12, vol: 0.06, type: 'square' }); },
  beep(hi) { tone({ freq: hi ? 1976 : 1568, dur: 0.07, vol: 0.05, type: 'square' }); },
  zap() { tone({ freq: 1200, to: 2400, dur: 0.06, vol: 0.025, type: 'sawtooth' }); },
  rattle() { for (let i = 0; i < 6; i++) noise({ dur: 0.04, vol: 0.05, hp: 4000, delay: i * 0.06 }); },
  hehe() { [880, 1046.5, 880, 1046.5].forEach((f, i) => tone({ freq: f, to: f * 1.1, dur: 0.06, vol: 0.035, delay: i * 0.09, type: 'square' })); },
  cluck() { tone({ freq: 720, to: 520, dur: 0.07, vol: 0.04, type: 'square' }); tone({ freq: 760, to: 540, dur: 0.07, vol: 0.04, type: 'square', delay: 0.1 }); },
  ignite() { noise({ dur: 0.08, vol: 0.12, hp: 3000 }); noise({ dur: 1.2, vol: 0.07, hp: 200, lp: 1600, delay: 0.1 }); tone({ freq: 70, to: 140, dur: 1.2, vol: 0.05, type: 'sawtooth', delay: 0.1 }); },
};

// ------------------------------------------------------------------ music
// Tracks are compiled into a list of events per 16th-note step and played by a
// look-ahead scheduler (setInterval + precise AudioContext timestamps).
const NOTE_IDX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function noteFreq(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) return null;
  const semi = NOTE_IDX[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (+m[3] + 1) * 12;
  return 440 * Math.pow(2, (semi - 69) / 12);
}
const QUALITY = { '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], sus4: [0, 5, 7], dim: [0, 3, 6] };
function chordTones(sym) {
  const m = /^([A-G][#b]?)(.*)$/.exec(sym);
  const root = NOTE_IDX[m[1][0]] + (m[1][1] === '#' ? 1 : m[1][1] === 'b' ? -1 : 0);
  return { root, tones: QUALITY[m[2]] ?? QUALITY[''] };
}
// chord degree token -> semitones above the root: 1 3 5 7 8 10 12 (8 = octave)
function degree(ch, d) {
  const t = ch.tones;
  const map = { 1: 0, 3: t[1], 5: t[2], 7: t[3] ?? 12, 8: 12, 10: 12 + t[1], 12: 12 + t[2] };
  return map[d] ?? 0;
}
const tokens = (s) => s.replace(/\|/g, ' ').trim().split(/\s+/);

function compile(tr) {
  const spb = tr.steps || 16;
  const total = spb * tr.chords.length;
  const events = Array.from({ length: total }, () => []);
  const chords = tr.chords.map(chordTones);
  const midi = (oct, semis) => 440 * Math.pow(2, ((oct + 1) * 12 + semis - 69) / 12);
  for (const v of tr.voices) {
    const tk = v.notes ? tokens(v.notes) : null;
    const pat = v.pattern ? tokens(v.pattern) : null;
    for (let i = 0; i < total; i++) {
      const tok = tk ? tk[i % tk.length] : pat[i % pat.length];
      if (tok === '.' || tok === '-') continue;
      let len = 1;
      const src = tk || pat, n = src.length;
      while (len < 64 && src[(i + len) % n] === '-') len++;
      let freqs;
      if (v.drums) freqs = tok;
      else if (tk) freqs = tok.split('+').map(noteFreq).filter(Boolean);
      else {
        const ch = chords[Math.floor(i / spb)];
        freqs = tok.split('+').map((d) => (d === 'R' ? midi(v.octave, ch.root) : midi(v.octave, ch.root + degree(ch, +d))));
      }
      events[i].push({ v, freqs, len });
    }
  }
  return { events, total, stepDur: 60 / tr.bpm / 4, swing: tr.swing || 0 };
}

let bus = null;
function musicBus(a) {
  if (!bus) { bus = a.createGain(); bus.gain.value = 0.9; bus.connect(a.destination); }
  return bus;
}

function playNote(a, f, t, dur, v) {
  const o = a.createOscillator(), g = a.createGain();
  o.type = v.type || 'triangle';
  o.frequency.setValueAtTime(f, t);
  const atk = v.attack ?? 0.01, rel = v.release ?? 0.08;
  let node = o;
  if (v.lp) { const fl = a.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = v.lp; node = node.connect(fl); }
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v.vol, t + atk);
  let end;
  if (v.pluck) { end = t + atk + v.pluck; g.gain.exponentialRampToValueAtTime(0.0001, end); }
  else { const hold = t + Math.max(atk, dur * 0.92); g.gain.setValueAtTime(v.vol, hold); end = hold + rel; g.gain.exponentialRampToValueAtTime(0.0001, end); }
  if (v.vib) {
    const l = a.createOscillator(), lg = a.createGain();
    l.frequency.value = 5.2; lg.gain.value = f * 0.01;
    l.connect(lg).connect(o.frequency);
    l.start(t + 0.12); l.stop(end + 0.05);
  }
  node.connect(g).connect(musicBus(a));
  o.start(t); o.stop(end + 0.05);
}

function playDrum(a, kind, t, vol = 1) {
  const out = musicBus(a);
  if (kind.includes('k')) {
    const o = a.createOscillator(), g = a.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    g.gain.setValueAtTime(0.16 * vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.2);
  }
  if (kind.includes('s')) {
    noise({ dur: 0.14, vol: 0.06 * vol, hp: 1400, dest: out, at: t });
    const o = a.createOscillator(), g = a.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(200, t);
    g.gain.setValueAtTime(0.04 * vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.1);
  }
  if (kind.includes('h')) noise({ dur: 0.035, vol: 0.022 * vol, hp: 7000, dest: out, at: t });
  if (kind.includes('t')) {
    const o = a.createOscillator(), g = a.createGain();
    o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.2);
    g.gain.setValueAtTime(0.09 * vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.3);
  }
}

let song = null, songName = null, timer = null, step = 0, nextTime = 0;
function schedule() {
  const a = ac; if (!a || !song) return;
  // coming back from a background tab: skip ahead instead of catching up
  if (nextTime < a.currentTime - 0.25) nextTime = a.currentTime + 0.05;
  while (nextTime < a.currentTime + 0.15) {
    const swing = step % 2 === 1 ? song.swing * song.stepDur : 0;
    for (const e of song.events[step]) {
      if (e.v.drums) playDrum(a, e.freqs, nextTime + swing, e.v.vol ?? 1);
      else e.freqs.forEach((f) => playNote(a, f, nextTime + swing, e.len * song.stepDur, e.v));
    }
    nextTime += song.stepDur;
    step = (step + 1) % song.total;
  }
}

export const music = {
  get playing() { return songName; },
  play(name) {
    if (songName === name) return;
    this.stop();
    const tr = TRACKS[name];
    if (!tr) return;
    songName = name;
    song = compile(tr);
    this.resume();
  },
  resume() {
    if (muted || !song || timer) return;
    const a = ctx(); if (!a) return;
    const b = musicBus(a);
    b.gain.cancelScheduledValues(a.currentTime);
    b.gain.setValueAtTime(0.9, a.currentTime);
    step = 0;
    nextTime = a.currentTime + 0.08;
    timer = setInterval(schedule, 25);
    schedule();
  },
  pause() {
    clearInterval(timer); timer = null;
    if (ac && bus) { bus.gain.cancelScheduledValues(ac.currentTime); bus.gain.setTargetAtTime(0, ac.currentTime, 0.03); }
  },
  stop() {
    this.pause();
    song = null; songName = null;
  },
};
