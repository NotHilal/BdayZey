// Relay reconnect test: two players in a duo game, the relay server is killed
// and restarted mid-game; both must reconnect by themselves and keep playing.
// Needs the dev server on :5199 (`npx vite --port 5199`); the game connects to :8787.
// This script starts/stops the relay on :8787 itself (nothing else may use that port).
// Usage: node tools/relay-drop.mjs
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { CHROME } from './browser.mjs';

const BASE = process.env.BASE || 'http://localhost:5199';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let relay = null;
const startRelay = async () => {
  relay = spawn(process.execPath, ['server/relay.mjs'], { env: { ...process.env, PORT: '8787' }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) { try { await fetch('http://localhost:8787/'); return; } catch { await sleep(100); } }
  throw new Error('relay did not start');
};
const stopRelay = () => new Promise((r) => { relay.once('exit', r); relay.kill(); });

let fails = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  ' + info : ''}`); if (!ok) fails++; };
const until = async (page, fn, ms = 8000, arg) => { const t = Date.now(); while (Date.now() - t < ms) { if (await page.evaluate(fn, arg)) return true; await sleep(150); } return false; };
const click = (page, sel) => page.evaluate((s) => document.querySelector(s).click(), sel);

await startRelay();
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', protocolTimeout: 30000,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
const errs = [];
const open = async (name) => {
  const p = await browser.newPage();
  await p.setViewport({ width: 1280, height: 720 });
  p.on('pageerror', (e) => errs.push(`${name}: ${e.message}`));
  return p;
};
const A = await open('host'), B = await open('guest');
await A.goto(`${BASE}/?timer&canvas&fps=20`, { waitUntil: 'networkidle0' });
await sleep(1200);
await click(A, '#duoBtn'); await click(A, '#createBtn');
await until(A, () => /^[A-Z]{4}$/.test(document.getElementById('roomCode').textContent));
const code = await A.$eval('#roomCode', (e) => e.textContent);
await B.goto(`${BASE}/?timer&canvas&fps=20&room=${code}`, { waitUntil: 'networkidle0' });
await until(A, () => !document.getElementById('duoStartBtn').hidden);
await click(A, '#duoStartBtn');
check('game starts over the relay', (await until(A, () => !!window.__game?.link)) && (await until(B, () => !!window.__game?.link)));
await sleep(2000);

// how many partner snapshots has A received so far?
const snaps = () => A.evaluate(() => window.__game.link.snaps.at(-1)?.t || 0);

// short outage: under the 8 s limit, nobody should even see the pause screen
await stopRelay();
await sleep(3000);
await startRelay();
const before = await snaps();
check('host hears the guest again after a 3 s outage', await until(A, (b) => (window.__game.link.snaps.at(-1)?.t || 0) > b, 10000, before));
check('no disconnect screen for a short outage', await A.evaluate(() => document.getElementById('lostOverlay').hidden) && await B.evaluate(() => document.getElementById('lostOverlay').hidden));

// long outage: the pause screen shows, then goes away by itself on reconnect
await stopRelay();
check('long outage shows "partner disconnected"', await until(A, () => !document.getElementById('lostOverlay').hidden, 15000));
await startRelay();
check('it clears by itself when the server is back', (await until(A, () => document.getElementById('lostOverlay').hidden, 15000)) && (await until(B, () => document.getElementById('lostOverlay').hidden, 15000)));
check('game running again on both', await A.evaluate(() => window.__game.sys.isActive()) && await B.evaluate(() => window.__game.sys.isActive()));

console.log('errors:', errs.length ? errs : 'none');
console.log(fails ? `${fails} FAILED` : 'all passed');
await browser.close();
await stopRelay();
process.exit(fails || errs.length ? 1 : 0);
