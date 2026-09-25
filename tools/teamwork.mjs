// Teamwork physics: checks that the duo obstacles really need both characters.
// Uses the dev-only ?duolevel&char=… (duo layout, one player). Dev server on :5199.
// Usage: node tools/teamwork.mjs
import puppeteer from 'puppeteer-core';
import { CHROME } from './browser.mjs';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 60000, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// run an input script inside the page in game time; returns min feet y and max x reached
const run = (steps) => page.evaluate(async (steps) => {
  const g = window.__game, t = window.__ui.touch, b = g.player.body;
  let minY = 1e9, maxX = -1e9;
  const track = () => { minY = Math.min(minY, b.bottom); maxX = Math.max(maxX, b.right); };
  g.events.on('postupdate', track);
  const wait = (ms) => new Promise((r) => { const t0 = g.mech.t; const f = () => (g.mech.t - t0 >= ms ? r() : setTimeout(f, 10)); f(); });
  const until = (fn, ms) => new Promise((r) => { const t0 = g.mech.t; const f = () => (fn() || g.mech.t - t0 > ms ? r() : setTimeout(f, 5)); f(); });
  for (const s of steps) {
    if (s[0] === 'set') Object.assign(t, s[1]);
    else if (s[0] === 'wait') await wait(s[1]);
    else if (s[0] === 'apex') await until(() => b.velocity.y > -60, 2000);
    else if (s[0] === 'land') await until(() => b.blocked.down, 3000);
    else if (s[0] === 'launch') g.me.launch(s[1], s[2]);
  }
  g.events.off('postupdate', track);
  Object.assign(t, { left: false, right: false, jump: false });
  return { minFeet: Math.round(minY), maxRight: Math.round(maxX), x: Math.round(g.player.x), y: Math.round(b.bottom), dead: g.dead };
}, steps);
let fails = 0;
const check = (name, r, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${JSON.stringify(r)}`); if (!ok) fails++; };
const load = async (w, x, char) => { await page.goto(`http://localhost:5199/?world=${w}&x=${x}&duolevel&char=${char}`, { waitUntil: 'networkidle0' }); await sleep(1500); await run([['land'], ['wait', 300]]); };
const dj = [['set', { jump: true }], ['wait', 60], ['apex'], ['set', { jump: false }], ['wait', 40], ['set', { jump: true }], ['wait', 60], ['apex'], ['wait', 200], ['set', { jump: false }], ['land']];

// Minecraft duo: throw ledge (plat top y=80, cols 13-15), gate at col 19, wall col 102 (top y=80), crack col 106
await load(0, 13, 'cat'); { const r = await run(dj); check('cat alone cannot reach the lever ledge', r, r.minFeet > 80); }
await load(0, 13, 'raccoon'); { const r = await run(dj); check('raccoon alone cannot reach the lever ledge', r, r.minFeet > 80); }
await load(0, 13, 'cat'); { const r = await run([['launch', 0, -1350], ['wait', 60], ['apex'], ['set', { jump: false }], ['wait', 40], ['set', { jump: true }], ['wait', 60], ['apex'], ['set', { jump: false }], ['wait', 300]]); check('a thrown cat reaches the ledge', r, r.minFeet < 80); }
const push = (dir) => [['set', { [dir]: true }], ...dj.slice(0, -1), ['wait', 1500], ['land']];
await load(0, 99, 'cat'); { const r = await run(push('right')); check('cat cannot get over the climbing wall', r, r.maxRight <= 6528); }
// real climbing: run at the wall, jump, keep pushing into it (no second press: that jumps off the wall)
await load(0, 99, 'raccoon'); { const r = await run([['set', { right: true, jump: true }], ['wait', 2200], ['set', { jump: false }], ['wait', 1200], ['land']]); check('raccoon climbs over the wall', r, r.x > 6592); }
await load(0, 99, 'raccoon'); { const r = await run([['set', { right: true, jump: true }], ['wait', 1100], ['set', { jump: false }], ['wait', 60], ['set', { jump: true }], ['wait', 900], ['set', { jump: false }], ['wait', 1000], ['land']]); check('raccoon climbs + hops over the wall', r, r.x > 6592); }
await load(0, 99, 'cat'); { const r = await run([['set', { right: true, jump: true }], ['wait', 2200], ['set', { jump: false }], ['wait', 1200], ['land']]); check('the cat cannot climb', r, r.maxRight <= 6528); }
await load(0, 104, 'raccoon'); { const r = await run(push('right')); check('raccoon cannot pass cracked blocks', r, r.maxRight <= 6784); }
await load(0, 17, 'raccoon'); { const r = await run(push('right')); check('nobody climbs or jumps over a gate', r, r.maxRight <= 1224); }
await browser.close();
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
