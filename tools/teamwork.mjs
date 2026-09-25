// Duo puzzle physics for the new duo levels (duoLevels.js): each puzzle can't be
// done alone and can be done with the intended combination. One page plays one
// character on the duo layout (dev-only ?duolevel&char=…); the partner is
// simulated (their blocks via abil.remote, their throw via me.launch, their body
// on a plate via mech.remoteRect). Dev server on :5199. Usage: node tools/teamwork.mjs
import puppeteer from 'puppeteer-core';
import { CHROME } from './browser.mjs';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 120000, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const THROW = -1490; // DuoLink's throw
const T = 64, TOP = 16, feetOf = (row) => TOP + row * T, colX = (c) => c * T + T / 2;

// run an input script inside the page in game time. Steps:
//   ['set', {left,right,jump,ability}]  ['wait', ms]  ['apex']  ['land']  ['q'] (tap Q)
//   ['launch', vx, vy] (thrown)  ['put', x, feetY]  ['face', ±1]  ['js', code]
// Usage: node tools/teamwork.mjs [minecraft genshin lol valorant rdr2]  (default: all)
// returns min feet y, max right, final x/feet, dead, franui got
const run = (steps) => page.evaluate(async (steps) => {
  const g = window.__game, t = window.__ui.touch, b = g.player.body;
  let minY = 1e9, maxX = -1e9, died = false;
  const track = () => { if (b.enable) { minY = Math.min(minY, b.bottom); maxX = Math.max(maxX, b.right); } if (g.dead) died = true; };
  g.events.on('postupdate', track);
  const wait = (ms) => new Promise((r) => { const t0 = g.mech.t; const f = () => (g.mech.t - t0 >= ms ? r() : setTimeout(f, 8)); f(); });
  const until = (fn, ms) => new Promise((r) => { const t0 = g.mech.t; const f = () => (fn() || g.mech.t - t0 > ms ? r() : setTimeout(f, 5)); f(); });
  for (const s of steps) {
    if (s[0] === 'set') Object.assign(t, s[1]);
    else if (s[0] === 'wait') await wait(s[1]);
    else if (s[0] === 'apex') await until(() => b.velocity.y > -60, 2500);
    else if (s[0] === 'land') await until(() => b.blocked.down || b.touching.down, 3000);
    else if (s[0] === 'q') { t.ability = true; await wait(70); t.ability = false; await wait(70); }
    else if (s[0] === 'launch') g.me.launch(s[1], s[2]);
    else if (s[0] === 'put') { b.reset(s[1], s[2] - 42); b.setVelocity(0, 0); await wait(120); }
    else if (s[0] === 'face') { g.me.facing = s[1]; g.player.setFlipX(s[1] < 0); }
    else if (s[0] === 'js') new Function('g', s[1])(g);
  }
  g.events.off('postupdate', track);
  Object.assign(t, { left: false, right: false, jump: false, ability: false });
  return { minFeet: Math.round(minY), maxRight: Math.round(maxX), x: Math.round(g.player.x), feet: Math.round(b.bottom), dead: died || g.dead, got: g.sweets.filter((s) => s.got).length };
}, steps);
let fails = 0;
const check = (name, r, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${JSON.stringify(r)}`); if (!ok) fails++; };
let WORLD = 0;
const load = async (char, col, row = 7) => {
  await page.goto(`http://localhost:5199/?world=${WORLD}&duolevel&char=${char}&x=${col}&quality=lite`, { waitUntil: 'networkidle0', timeout: 120000 });
  await page.waitForFunction(() => window.__game?.player, { timeout: 120000 });
  await sleep(1200);
  await run([['put', colX(col), feetOf(row + 1)], ['land'], ['wait', 200]]);
};
const partnerBlocks = (cells) => ['js', `${JSON.stringify(cells)}.forEach(([c, r]) => g.abil.remote({ op: 'add', c, r }));`];
// a full jump while pushing one way, then keep pushing
const jumpPush = (dir, ms = 1400) => [['set', { [dir]: true, jump: true }], ['wait', 60], ['apex'], ['set', { jump: false }], ['wait', ms], ['set', { [dir]: false }], ['land']];
// tower: jump, place a block under yourself on the way up, land on it
const towerUp = [['set', { jump: true }], ['wait', 300], ['q'], ['set', { jump: false }], ['land'], ['wait', 150]];
// bridge: 3 blocks forward over a gap, then jump the rest
const bridge3 = [['face', 1], ['q'], ['set', { right: true }], ['wait', 190], ['set', { right: false }], ['q'], ['set', { right: true }], ['wait', 190], ['set', { right: false }], ['q'],
  ['set', { right: true }], ['wait', 200], ['set', { jump: true }], ['wait', 60], ['apex'], ['set', { jump: false }], ['wait', 700], ['land']];

const nearLever = ['js', 'window.__lever = g.mech.nearLever({ x: g.player.body.x, y: g.player.body.y, w: 56, h: 46 });'];
const leverNow = () => page.evaluate(() => window.__lever);
// glide: jump, let go, press jump again and hold it while pushing one way
const glide = (dir, ms = 3500) => [['set', { [dir]: true, jump: true }], ['wait', 60], ['apex'], ['set', { jump: false }], ['wait', 60], ['set', { jump: true }], ['wait', ms], ['set', { jump: false, [dir]: false }], ['land']];
// climb: run into the wall, jump, keep pushing into it
const climb = (dir, ms = 2600) => [['set', { [dir]: true, jump: true }], ['wait', ms], ['set', { jump: false, [dir]: false }], ['land']];

// ---------------------------------------------------------------- World 1 · Minecraft
async function minecraft() {
  // 1 · mine: ore wall at cols 15-16, from the sky
  await load('raccoon', 12); { const r = await run(jumpPush('right')); check('1 raccoon cannot pass the ore wall', r, r.maxRight <= 15 * T); }
  await load('cat', 14); { const r = await run([['face', 1], ['q'], ['set', { right: true }], ['wait', 300], ['set', { right: false }], ['q'], ['set', { right: true }], ['wait', 900], ['set', { right: false }]]); check('1 cat mines through the ore wall', r, r.x > 17 * T); }

  // 2 · build: cliff at col 27 is 4 rows high (surface row 4 = feet 272)
  await load('cat', 24); { const r = await run(jumpPush('right')); check('2 cat cannot climb the 4-high cliff', r, r.minFeet > feetOf(4)); }
  await load('raccoon', 25); { const r = await run([['face', 1], ['q'], ...jumpPush('right', 400), ...jumpPush('right', 900)]); check('2 raccoon builds a step and climbs', r, r.feet === feetOf(4) && r.x > 27 * T); }
  // franui 1 in the ore pocket (row 6) in the plateau's right face: the cat mines it from the raccoon's step at (38,7)
  await load('cat', 40); { const r = await run([partnerBlocks([[38, 7]]), ['set', { left: true, jump: true }], ['wait', 60], ['set', { jump: false }], ['wait', 300], ['set', { left: false }], ['land'], ['face', -1], ['q'], ['set', { left: true }], ['wait', 250], ['set', { left: false }], ['q'], ['set', { left: true }], ['wait', 700], ['set', { left: false }]]); check("2 cat on the raccoon's step mines to franui 1", r, r.got === 1); }

  // 3 · bridge: lava pit cols 42-47 (6 wide)
  await load('cat', 40); { const r = await run(jumpPush('right', 1600)); check('3 cat cannot jump the lava pit', r, r.maxRight < 48 * T); }
  await load('raccoon', 41); { const r = await run(bridge3); check('3 raccoon bridges (3 blocks) and jumps across, grabbing franui 2', r, r.x >= 48 * T && !r.dead && r.got === 1); }

  // 4 · hold gate at col 57: plates at 53 and 61
  await load('raccoon', 53); { const r = await run([['wait', 500], ['set', { right: true }], ['wait', 2500], ['set', { right: false }]]); check('4 alone from the plate: the gate stops you', r, r.maxRight <= 57 * T + 8); }
  await load('raccoon', 55); { const r = await run([['js', `g.mech.remoteRect = { x: ${colX(53)} - 28, y: ${feetOf(8)} - 46, w: 56, h: 46 };`], ['set', { right: true }], ['wait', 1500], ['set', { right: false }], ['js', 'g.mech.remoteRect = null;']]); check('4 partner holds the plate: through', r, r.x > 58 * T); }
  await load('raccoon', 52); { const r = await run([['face', 1], ['q'], ['q'], ['q'], ['set', { right: true }], ['wait', 2500], ['set', { right: false }]]); check('4 blocks on the plate do not open the gate', r, r.maxRight <= 57 * T + 8); }

  // 6 · lever up on the slab (row 3, feet 208) walled in by ore at 86 and 88
  await load('raccoon', 82, 9); { const r = await run([...towerUp, ...towerUp, ...towerUp, ['set', { right: true, jump: true }], ['wait', 60], ['apex'], ['set', { jump: false }], ['wait', 700], ['set', { right: false }], ['land']]); check('6 raccoon cannot reach the slab (3-block tower + jump)', r, r.minFeet > feetOf(3)); }
  await load('cat', 84, 9); { const r = await run([['launch', 0, THROW], ['wait', 60], ['apex'], ['wait', 600], ['land']]); check('6 a thrown cat lands on the slab', r, r.feet === feetOf(3)); }
  await load('cat', 84, 9);
  {
    const r = await run([['launch', 0, THROW], ['wait', 60], ['apex'], ['wait', 600], ['land'], ['set', { right: true }], ['wait', 400], ['set', { right: false }], ['face', 1], ['q'], ['set', { right: true }], ['wait', 400], ['set', { right: false }], ['js', 'window.__lever = g.mech.nearLever({ x: g.player.body.x, y: g.player.body.y, w: 56, h: 46 });']]);
    const lv = await page.evaluate(() => window.__lever);
    check('6 cat mines the ore and reaches the lever', { ...r, lever: lv }, lv === 0);
  }
  await load('cat', 89, 9); { const r = await run([['launch', -160, THROW], ['set', { left: true }], ['wait', 1300], ['set', { left: false }], ['land'], ['js', 'window.__lever = g.mech.nearLever({ x: g.player.body.x, y: g.player.body.y, w: 56, h: 46 });']]); const lv = await page.evaluate(() => window.__lever); check('6 no way around the ore (thrown from the right side)', { ...r, lever: lv }, lv === -1); }

  // 7 · franui 3 on the shelf (row 1, feet 80) at cols 101-106, franui at 103
  const shelfThrow = [['launch', 160, THROW], ['wait', 450], ['set', { right: true }], ['wait', 1300], ['set', { right: false }], ['land']];
  await load('cat', 99, 9); { const r = await run(shelfThrow); check('7 thrown from the ground: falls short of the shelf', r, r.minFeet > feetOf(1) && r.got === 0); }
  await load('cat', 99, 9); { const r = await run([partnerBlocks([[99, 9]]), ['put', colX(99), feetOf(9)], ...shelfThrow]); check("7 thrown from the raccoon's block: onto the shelf, franui 3", r, r.feet === feetOf(1) && r.got === 1); }

  // 8 · bridge + mine: lava 117-122, ore wall 125-126
  await load('raccoon', 116); { const r = await run([...bridge3, ['set', { right: true }], ['wait', 800], ['set', { right: false }]]); check('8 raccoon bridges across but the ore stops him', r, r.x >= 123 * T && r.maxRight <= 125 * T && !r.dead); }
  await load('cat', 116);
  {
    const r = await run([partnerBlocks([[117, 8], [118, 8], [119, 8]]), ['set', { right: true }], ['wait', 650], ['set', { jump: true }], ['wait', 60], ['apex'], ['set', { jump: false }], ['wait', 700], ['land'], ['wait', 300], ['set', { right: false }],
      ['face', 1], ['q'], ['set', { right: true }], ['wait', 300], ['set', { right: false }], ['q'], ['set', { right: true }], ['wait', 900], ['set', { right: false }]]);
    check('8 cat crosses the raccoon\'s bridge and mines through', r, r.x > 127 * T && !r.dead);
  }

  // 10 · finale: cliff at col 153 is 6 rows high (surface row 2 = feet 144)
  await load('cat', 151); { const r = await run(jumpPush('right')); check('10 cat cannot climb the 6-high cliff', r, r.minFeet > feetOf(2)); }
  await load('raccoon', 152); { const r = await run([...towerUp, ...towerUp, ...jumpPush('right', 900)]); check('10 a 2-block tower is not enough', r, r.minFeet > feetOf(2)); }
  await load('raccoon', 152); { const r = await run([...towerUp, ...towerUp, ...towerUp, ...jumpPush('right', 900)]); check('10 raccoon towers up 3 and climbs the cliff', r, r.feet === feetOf(2)); }
  await load('cat', 151); { const r = await run([partnerBlocks([[152, 7], [152, 6], [152, 5]]), ...jumpPush('right', 250), ...jumpPush('right', 900)]); check('10 cat climbs the raccoon\'s tower onto the cliff', r, r.feet === feetOf(2)); }
  // up top the blocks are needed again for the void (160-165): take the tower back first
  await load('raccoon', 159, 1); { await run([['js', 'g.abil.mine = [0, 1, 2].map((i) => g.abil.add(152, 7 - i));'], ['face', 1], ['q'], ['wait', 200]]); const n = await page.evaluate(() => window.__game.abil.mine.length); check('10 with the tower still standing, no block for the void', { blocks: n }, n === 3); }
  await load('raccoon', 159, 1); { const r = await run([['js', 'g.abil.mine = [0, 1, 2].map((i) => g.abil.add(152, 7 - i));'], ['set', { ability: true }], ['wait', 600], ['set', { ability: false }], ['wait', 100], ...bridge3, ['set', { right: true }], ['wait', 800], ['set', { right: false }]]); check('10 hold Q takes the tower back; bridge the void; the last ore stops him', r, r.x >= 166 * T && r.maxRight <= 169 * T && !r.dead); }

  // goal: needs all 3 franui (the portal lights on the 3rd)
  await load('raccoon', 182);
  {
    const r = await run([['set', { right: true }], ['wait', 700], ['set', { right: false }], ['wait', 300]]);
    const st = await page.evaluate(() => ({ won: window.__game.done, open: window.__game.goalOpen }));
    check('goal: without the franui the portal is shut', { ...r, ...st }, !st.won && !st.open);
    const r2 = await run([['js', 'g.sweets.forEach((s) => { if (!s.got) g.collect(s); });'], ['wait', 200], ['set', { left: true }], ['wait', 300], ['set', { left: false, right: true }], ['wait', 600], ['set', { right: false }], ['wait', 300]]);
    const st2 = await page.evaluate(() => ({ won: window.__game.done, open: window.__game.goalOpen }));
    check('goal: with all 3 the portal lights and lets you through', { ...r2, ...st2 }, st2.won && st2.open);
  }
}

// ---------------------------------------------------------------- World 2 · Genshin
async function genshin() {
  // 1 · climb the 6-high cliff (cols 20-25, surface row 2); tunnel gate at col 23
  await load('cat', 18); { const r = await run(jumpPush('right')); check('G1 cat cannot climb the cliff', r, r.minFeet > feetOf(2)); }
  await load('raccoon', 18); { const r = await run([...climb('right', 1500)]); check('G1 raccoon climbs the cliff', r, r.minFeet <= feetOf(2) + 2); }
  await load('raccoon', 23, 1); { const r = await run([nearLever]); check('G1 the tunnel lever is up there', { ...r, lever: await leverNow() }, (await leverNow()) === 0); }
  await load('cat', 19); { const r = await run([['set', { right: true }], ['wait', 1500], ['set', { right: false }]]); check('G1 the tunnel gate stops the cat', r, r.maxRight <= 23 * T + 8); }
  await load('cat', 19); { const r = await run([['js', 'g.mech.pull(0);'], ['set', { right: true }], ['wait', 2200], ['set', { right: false }]]); check('G1 lever pulled: the cat walks through', r, r.x > 26 * T); }
  // 2 · gorge 43-52 below the hill (39-42, surface row 5)
  await load('raccoon', 41, 4); { const r = await run(jumpPush('right', 1500)); check('G2 raccoon cannot jump the gorge', r, r.maxRight < 53 * T || r.dead); }
  await load('cat', 41, 4); { const r = await run(glide('right')); check('G2 cat glides over the gorge, grabbing franui 1', r, r.x >= 53 * T && !r.dead && r.got === 1); }
  await load('raccoon', 41, 4); { const r = await run([['js', "g.mech.pull(g.mech.levers.findIndex((l) => l.t.door === 'giBridge'));"], ['set', { right: true }], ['wait', 3200], ['set', { right: false }], ['land']]); check("G2 the cat's lever lays the bridge for the raccoon", r, r.x >= 53 * T && !r.dead); }
  // 4 · rock pillar 95-97, top row 1 (feet 80)
  await load('cat', 93); { const r = await run(jumpPush('right')); check('G4 cat cannot get over the pillar alone', r, r.maxRight <= 95 * T); }
  await load('raccoon', 93); { const r = await run([...climb('right', 3000)]); check('G4 raccoon climbs the pillar, franui 2', r, r.minFeet <= feetOf(1) + 2 && r.got === 1); }
  await load('cat', 94); { const r = await run([['launch', 160, THROW], ['set', { right: true }], ['wait', 900], ['set', { right: false }], ['land']]); check('G4 a thrown cat gets over the pillar', r, r.x > 98 * T && !r.dead); }
  // 5 · chasm 107-122 (16 wide), island at 113-115 row 2
  await load('cat', 106); { const r = await run(glide('right', 5000)); check('G5 a glide from the ground falls short', r, r.maxRight < 123 * T || r.dead); }
  await load('cat', 106); { const r = await run([['launch', 160, THROW], ['wait', 700], ['set', { right: true }], ['wait', 60], ['set', { jump: true }], ['wait', 1500], ['set', { right: false }], ['wait', 1500], ['set', { jump: false }], ['land']]); check('G5 thrown, the cat glides to the island: franui 3', r, r.feet === feetOf(2) && !r.dead && r.got === 1); }
  await load('cat', 114, 1); { const r = await run(glide('right', 3500)); check('G5 from the island she glides on to the far side', r, r.x >= 123 * T && !r.dead); }
  // 6 · finale: cliff 141-150 (surface row 2), wind at 139-140 off until the lever
  await load('cat', 138); { const r = await run([['set', { right: true }], ['wait', 300], ['set', { right: false }], ['wait', 1500], ...jumpPush('right')]); check('G6 wind off: the cat cannot get up the cliff', r, r.minFeet > feetOf(2)); }
  await load('raccoon', 138); { const r = await run([...climb('right', 1500)]); check('G6 raccoon climbs the finale cliff', r, r.minFeet <= feetOf(2) + 2); }
  await load('raccoon', 144, 1); { const r = await run([nearLever]); check('G6 the wind lever is up there', { ...r, lever: await leverNow() }, (await leverNow()) >= 0); }
  await load('cat', 137); { const r = await run([['js', "g.mech.pull(g.mech.levers.findIndex((l) => l.t.door === 'giWind'));"], ['set', { right: true }], ['wait', 250], ['set', { right: false }], ['wait', 1800], ['set', { right: true }], ['wait', 900], ['set', { right: false }], ['land']]); check('G6 the wind lifts the cat onto the cliff', r, r.feet === feetOf(2)); }
  await load('raccoon', 152); { const r = await run(jumpPush('right', 1500)); check('G6 raccoon cannot jump the valley', r, r.maxRight < 169 * T || r.dead); }
  await load('cat', 149, 1); { const r = await run(glide('right', 6000)); check('G6 cat glides the valley from the cliff top', r, r.x >= 169 * T && !r.dead); }
}

const WORLDS_ = { minecraft: [0, minecraft], genshin: [1, genshin] };
const pick = process.argv.slice(2);
for (const [name, [w, fn]] of Object.entries(WORLDS_)) {
  if (pick.length && !pick.includes(name)) continue;
  WORLD = w;
  console.log(`--- ${name}`);
  await fn();
}

console.log('errors:', errs.length ? errs : 'none');
await browser.close();
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
