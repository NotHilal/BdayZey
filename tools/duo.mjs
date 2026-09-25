// Duo test: two pages in one browser. One creates a room, the other joins via
// the invite link, through the relay (started here if it isn't running).
// Checks both see each other, franui/checkpoints are shared, revive works,
// both must reach the goal, "next world" moves both, and disconnect handling.
// Needs the dev server on :5199. Usage: node tools/duo.mjs
import puppeteer from 'puppeteer-core';
import { CHROME } from './browser.mjs';
import { spawn } from 'node:child_process';

const relayUp = await fetch('http://localhost:8787/').then(() => true, () => false);
const relay = relayUp ? null : spawn(process.execPath, ['server/relay.mjs'], { stdio: 'ignore' });
if (relay) await new Promise((r) => setTimeout(r, 600));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', protocolTimeout: 30000,
  // both pages share one renderer thread (same origin): ?timer keeps the
  // background tab running, ?canvas&fps=20 keeps the thread from saturating
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
const errs = [];
const open = async (name) => {
  const p = await browser.newPage();
  await p.setViewport({ width: 1280, height: 720 });
  p.on('pageerror', (e) => errs.push(`${name}: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errs.push(`${name}: ${m.text()}`); });
  return p;
};
const BASE = process.env.BASE || 'http://localhost:5199';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  ' + info : ''}`); if (!ok) fails++; };
const until = async (page, fn, ms = 8000, arg) => { const t = Date.now(); while (Date.now() - t < ms) { if (await page.evaluate(fn, arg)) return true; await sleep(150); } return false; };
const click = (page, sel) => page.evaluate((s) => document.querySelector(s).click(), sel);
const put = (page, x, feetY) => page.evaluate((x, y) => { const g = window.__game; g.player.body.reset(x, y - 42); g.player.body.setVelocity(0, 0); }, x, feetY);

// --- lobby
const A = await open('host'), B = await open('guest');
await A.goto(`${BASE}/?timer&canvas&fps=20`, { waitUntil: 'networkidle0' });
await sleep(1500);
await click(A, '#duoBtn');
await click(A, '#createBtn');
await until(A, () => /^[A-Z]{4}$/.test(document.getElementById('roomCode').textContent));
const code = await A.$eval('#roomCode', (e) => e.textContent);
console.log('room', code);
await A.screenshot({ path: 'shots/duo-lobby.png' });
await B.goto(`${BASE}/?timer&canvas&fps=20&room=${code}`, { waitUntil: 'networkidle0' });
check('host sees partner join', await until(A, () => !document.getElementById('duoStartBtn').hidden));
check('guest is told which character', await until(B, () => /raccoon/.test(document.getElementById('duoStatus').textContent)));
await click(A, '#duoStartBtn');
check('guest starts with host', await until(B, () => window.__ui?.screen === 'play' && !!window.__game?.link));
await until(A, () => window.__ui?.screen === 'play' && !!window.__game?.link);
const chars = await Promise.all([A, B].map((p) => p.evaluate(() => window.__game.me.ch.key)));
check('host is the cat, guest the raccoon', chars[0] === 'cat' && chars[1] === 'raccoon', chars.join('/'));
check('co-op gate exists in duo', await A.evaluate(() => !!window.__game.mech.doors.coop));
await sleep(2500);
const [ta, tb] = await Promise.all([A, B].map((p) => p.evaluate(() => window.__game.mech.t)));
check('guest clock follows the host', Math.abs(ta - tb) < 500, `diff ${Math.round(ta - tb)}ms`);

// --- presence: each draws the other near their real position
await put(A, 600, 528); await put(B, 700, 528);
await sleep(800);
await A.screenshot({ path: 'shots/duo-play.png' });
const seen = await A.evaluate(() => { const r = window.__game.link.remote; return { vis: r.visible, x: Math.round(r.x) }; });
check('host sees the guest', seen.vis && Math.abs(seen.x - 700) < 40, JSON.stringify(seen));
const seen2 = await B.evaluate(() => { const r = window.__game.link.remote; return { vis: r.visible, x: Math.round(r.x) }; });
check('guest sees the host', seen2.vis && Math.abs(seen2.x - 600) < 40, JSON.stringify(seen2));

// --- shared franui: the guest grabs the lake franui, both count it
const idx = await B.evaluate(() => window.__game.sweets.findIndex((s) => !s.carrier && s.x > 3800));
await B.evaluate((i) => { const g = window.__game; const s = g.sweets[i]; g.player.body.reset(s.img.x, s.img.y - 10); g.player.body.setVelocity(0, 0); }, idx);
check('guest collect confirmed by host', await until(B, (i) => window.__game.sweets[i].got, 4000, idx));
check('host counts it too', await until(A, (i) => window.__game.sweets[i].got, 4000, idx));

// positions come from the level: duo levels are longer than solo ones
const spot = await A.evaluate(() => { const g = window.__game, k = g.checkpoints[0], e = g.mech.enemies[0].hitbox(); return { kx: k.x, ky: k.y, ex: e.x + 14, ey: e.y + e.h }; });

// --- shared checkpoint
await put(A, spot.kx, spot.ky);
check('checkpoint shared', await until(B, () => window.__game.checkpoints[0].on, 4000));

// --- teamwork: the cat pulls the lever on the high ledge; the gate opens for both
const press = async (page) => { await page.keyboard.down('KeyE'); await sleep(250); await page.keyboard.up('KeyE'); };
const lever = await A.evaluate(() => { const l = window.__game.mech.levers[0]; return { x: l.x, feet: l.feet }; });
await put(A, lever.x, lever.feet); await sleep(500);
await press(A);
check('cat pulls the lever on the high ledge', await until(A, () => window.__game.mech.levers[0].on, 3000));
check('its gate opens on both screens, for good', await until(B, () => window.__game.mech.doors.mcThrow.open && window.__game.mech.doors.mcThrow.forever, 3000));

// --- only the cat can smash cracked blocks
const crack = await A.evaluate(() => window.__game.mech.cracks[0].rect);
const faceRight = (page) => page.evaluate(() => { const g = window.__game; g.me.facing = 1; g.player.setFlipX(false); g.player.body.setOffset(51, 33); });
await put(B, crack.x - 36, crack.y + crack.h); await faceRight(B); await sleep(500);
await press(B);
await sleep(600);
check('the raccoon cannot smash cracks', !(await A.evaluate(() => window.__game.mech.cracks[0].broken)) && !(await B.evaluate(() => window.__game.mech.cracks[0].broken)));
await put(A, crack.x - 36, crack.y + crack.h); await faceRight(A); await sleep(500);
await press(A);
check('the cat smashes the crack', await until(A, () => window.__game.mech.cracks[0].broken, 3000));
check('it is gone on both screens', await until(B, () => window.__game.mech.cracks[0].broken, 3000));
await put(B, spot.kx, spot.ky);

// --- shared creeper: the guest walks up to it; the host's creeper reacts to the guest,
// blows up on both screens, and only the guest gets hit
await put(A, spot.kx, spot.ky); await put(B, spot.ex - 130, spot.ey);
check('creeper goes off for the guest on the host screen', await until(A, () => !window.__game.mech.enemies[0].hitbox(), 8000));
check('and is gone on the guest screen too', await until(B, () => !window.__game.mech.enemies[0].hitbox(), 3000));
check('the blast hits the guest (ghost bubble)', await until(B, () => !!window.__game.link.ghost, 3000));
check('the host far away is fine', !(await A.evaluate(() => window.__game.dead)));
// --- revive: the host pops the guest's bubble
check('host sees the bubble', await until(A, () => window.__game.link.theirBubble.visible, 3000));
await A.screenshot({ path: 'shots/duo-bubble.png' });
await sleep(1500);
const bub = await A.evaluate(() => { const b = window.__game.link.theirBubble; return { x: b.x, y: b.y }; });
await A.evaluate((b) => { const g = window.__game; g.player.body.reset(b.x, b.y); g.player.body.setVelocity(0, 0); g.player.body.setAllowGravity(false); }, bub);
check('host popping the bubble revives the guest', await until(B, () => !window.__game.link.ghost && !window.__game.dead, 4000));
await A.evaluate(() => window.__game.player.body.setAllowGravity(true));

// --- goal: one player alone waits, both → clear
const goal = await A.evaluate(() => { const z = window.__game.goal.zone; return { x: z.x + z.w / 2, y: z.y + z.h }; });
await A.evaluate(() => window.__game.openGoal());
await B.evaluate(() => window.__game.openGoal());
await put(A, goal.x, goal.y - 4);
await sleep(1500);
check('host waits at the goal alone', await A.evaluate(() => window.__game.link.atGoal && !window.__game.link.won));
await put(B, goal.x, goal.y - 4);
check('both at goal clears the world for both', (await until(A, () => !document.getElementById('clearOverlay').hidden, 6000)) && (await until(B, () => !document.getElementById('clearOverlay').hidden, 6000)));
await sleep(900);
await click(A, '#nextBtn');
check('next world starts for both', (await until(A, () => window.__game.worldIndex === 1 && window.__ui.screen === 'play', 6000)) && (await until(B, () => window.__game.worldIndex === 1 && window.__ui.screen === 'play', 6000)));

// --- throw: the raccoon (guest) throws the cat up
await sleep(2200);
await put(A, 400, 528); await put(B, 440, 528);
await sleep(700);
await B.keyboard.down('KeyE'); await sleep(250); await B.keyboard.up('KeyE');
check('raccoon throws the cat up', await until(A, () => window.__game.player.y < 340, 2500));

// --- shared turret: the host aims and fires, the guest receives the same shots
await Promise.all([A, B].map((p) => p.evaluate(() => window.__game.scene.restart({ world: 2, mode: 'play' }))));
await until(A, () => window.__game.worldIndex === 2 && !!window.__game.link, 8000);
await until(B, () => window.__game.worldIndex === 2 && !!window.__game.link, 8000);
await sleep(2000);
const turret = await A.evaluate(() => window.__game.level.things.find((t) => t.type === 'trigger' && t.id === 'turret').c);
await put(A, (turret - 5) * 64 + 32, 528); await put(B, (turret - 6) * 64 + 32, 528);
check('guest gets the host turret shots', await until(B, () => (window.__game.link.fxCount || 0) >= 2, 10000));

// --- disconnect
await B.close();
check('host notices the partner left', await until(A, () => !document.getElementById('lostOverlay').hidden, 9000));
await click(A, '#soloBtn');
check('continue solo resumes the game', await until(A, () => document.getElementById('lostOverlay').hidden && window.__game.sys.isActive() && !window.__game.link, 4000),
  await A.evaluate(() => JSON.stringify({ overlay: document.getElementById('lostOverlay').hidden, active: window.__game.sys.isActive(), paused: window.__game.sys.isPaused(), link: !!window.__game.link, screen: window.__ui.screen, dead: window.__game.dead })));

console.log('errors:', errs.length ? errs : 'none');
console.log(fails ? `${fails} FAILED` : 'all passed');
await browser.close();
relay?.kill();
process.exit(fails || errs.length ? 1 : 0);
