// Lite mode for weak GPUs. The game is limited by how many pixels the GPU has to
// blend each frame, and the purely cosmetic full-screen overlays (vignettes, sun
// rays, film grain) and screen-wide ambient particles are the cheapest to drop.
// It switches on by itself when a world can't hold MIN_FPS, and is remembered.
// URL override: ?quality=lite or ?quality=high.
const KEY = 'zsq-lite';
const MIN_FPS = 48;
const WARMUP_MS = 1500, SAMPLE_MS = 4000; // skip the hitches right after a world loads

const forced = new URLSearchParams(location.search).get('quality');
let saved = false;
try { saved = localStorage.getItem(KEY) === '1'; } catch {}

export const quality = {
  lite: forced ? forced === 'lite' : saved,
  auto: !forced,
};

// per-world frame-rate watcher; returns true the moment lite mode turns on
export function fpsWatch() {
  let t = 0, ms = 0, frames = 0, done = !quality.auto || quality.lite;
  return (rawDelta) => {
    if (done || document.hidden) return false;
    t += rawDelta;
    if (t < WARMUP_MS) return false;
    ms += rawDelta; frames++;
    if (ms < SAMPLE_MS) return false;
    done = true;
    if (frames * 1000 / ms >= MIN_FPS) return false;
    quality.lite = true;
    try { localStorage.setItem(KEY, '1'); } catch {}
    return true;
  };
}

// hide the cosmetic extras of a built scene
export function applyLite(scene) {
  for (const o of scene.children.list) {
    if (o.scrollFactorX !== 0) continue;
    // vignettes, sun rays, film grain: screen-fixed, full width, above the action but under banners
    if (o.depth >= 45 && o.depth < 100 && o.width >= 1280) o.setVisible(false);
    // drifting seeds, dust, motes
    else if (o.type === 'ParticleEmitter') { o.stop(); o.setVisible(false); }
  }
}
