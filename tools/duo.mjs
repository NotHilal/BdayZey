// Duo test: two pages in one browser. One creates a room, the other joins via
// the invite link (BroadcastChannel transport when no Supabase keys are set).
// Checks both see each other, franui/checkpoints are shared, revive works,
// both must reach the goal, "next world" moves both, and disconnect handling.
// Needs the dev server on :5199. Usage: node tools/duo.mjs
import puppeteer from 'puppeteer-core';
import { CHROME } from './browser.mjs';

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  ' + info : ''}`); if (!ok) fails++; };
const until = async (page, fn, ms = 8000, arg) => { const t = Date.now(); while (Date.now() - t < ms) { if (await page.evaluate(fn, arg)) return true; await sleep(150); } return false; };
const click = (page, sel) => page.evaluate((s) => document.querySelector(s).click(), sel);
const put = (page, x, feetY) => page.evaluate((x, y) => { const g = window.__game; g.player.body.reset(x, y - 42); g.player.body.setVelocity(0, 0); }, x, feetY);

// --- lobby
const A = await open('host'), B = await open('guest');
await A.goto('http://localhost:5199/?timer&canvas&fps=20', { waitUntil: 'networkidle0' });
await sleep(1500);
await click(A, '#duoBtn');
await click(A, '#createBtn');
await until(A, () => /^[A-Z]{4}$/.test(document.getElementById('roomCode').textContent));
const code = await A.$eval('#roomCode', (e) => e.textContent);
console.log('room', code);
await A.screenshot({ path: 'shots/duo-lobby.png' });
await B.goto(`http://localhost:5199/?timer&canvas&fps=20&room=${code}`, { waitUntil: 'networkidle0' });
check('host sees partner join', await until(A, () => !document.getElementById('duoStartBtn').hidden));
check('guest is told which character', await until(B, () => /raccoon/.test(document.getElementById('duoStatus').textContent)));
await click(A, '#duoStartBtn');
check('guest starts with host', await until(B, () => window.__ui?.screen === 'play' && !!window.__game?.link));
await until(A, () => window.__ui?.screen === 'play' && !!window.__game?.link);
const chars = await Promise.all([A, B].map((p) => p.evaluate(() => window.__game.me.ch.key)));
check('host is the cat, guest the raccoon', chars[0] === 'cat' && chars[1] === 'raccoon', chars.join('/'));
check('co-op gate exists in duo', await A.evaluate(() => !!window.__game.mech.doors.coop));
await sleep(2500);

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

// --- shared checkpoint
await put(A, 42 * 64 + 32, 464);
check('checkpoint shared', await until(B, () => window.__game.checkpoints[0].on, 4000));

// --- revive: guest dies next to host, host pops the bubble
await put(A, 44 * 64 + 32, 464); await put(B, 43 * 64 + 32, 464);
await sleep(600);
await B.evaluate(() => window.__game.die());
check('guest becomes a ghost bubble', await until(B, () => !!window.__game.link.ghost, 3000));
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

// --- disconnect
await B.close();
check('host notices the partner left', await until(A, () => !document.getElementById('lostOverlay').hidden, 9000));
await click(A, '#soloBtn');
check('continue solo resumes the game', await until(A, () => document.getElementById('lostOverlay').hidden && window.__game.sys.isActive() && !window.__game.link, 4000));

console.log('errors:', errs.length ? errs : 'none');
console.log(fails ? `${fails} FAILED` : 'all passed');
await browser.close();
process.exit(fails || errs.length ? 1 : 0);
