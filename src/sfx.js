// Tiny WebAudio synth for chiptune-style sound effects (no audio files needed).
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

function noise({ dur = 0.1, vol = 0.1, delay = 0, hp = 400 }) {
  if (muted) return;
  const a = ctx(); if (!a) return;
  const t0 = a.currentTime + delay;
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter();
  f.type = 'highpass'; f.frequency.value = hp;
  s.buffer = buf; g.gain.value = vol;
  s.connect(f).connect(g).connect(a.destination);
  s.start(t0);
}

const NOTES = [523.25, 659.25, 783.99, 1046.5];
export const sfx = {
  init() { ctx(); },
  get muted() { return muted; },
  toggle() { muted = !muted; try { localStorage.setItem('zsq-muted', muted ? '1' : '0'); } catch {} return muted; },
  jump() { tone({ freq: 300, to: 620, dur: 0.12, vol: 0.05 }); },
  land() { noise({ dur: 0.07, vol: 0.06, hp: 900 }); },
  collect(n) {
    const k = [1, 1.122, 1.26][Math.min(2, n - 1)] || 1;
    NOTES.forEach((f, i) => tone({ freq: f * k, dur: 0.1, vol: 0.05, delay: i * 0.055, type: 'triangle' }));
  },
  unlock() { [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone({ freq: f, dur: 0.16, vol: 0.05, delay: 0.25 + i * 0.07, type: 'square' })); },
  checkpoint() { tone({ freq: 660, dur: 0.08, vol: 0.05, type: 'triangle' }); tone({ freq: 990, dur: 0.14, vol: 0.05, delay: 0.08, type: 'triangle' }); },
  nope() { tone({ freq: 220, to: 180, dur: 0.14, vol: 0.05 }); },
  die() { tone({ freq: 520, to: 90, dur: 0.35, vol: 0.07, type: 'sawtooth' }); noise({ dur: 0.18, vol: 0.05 }); },
  win() { [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5].forEach((f, i) => tone({ freq: f, dur: i > 3 ? 0.3 : 0.12, vol: 0.06, delay: i * 0.11, type: 'square' })); },
};
