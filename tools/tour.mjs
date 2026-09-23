// Screenshots a list of spots in one browser session (dev server on :5199).
// Usage: node tools/tour.mjs [filter]   e.g. `node tools/tour.mjs lol`
// Each spot: [name, world, column, waitMs, holdRightMs]; holdRight walks right first.
import puppeteer from 'puppeteer-core';
import { CHROME } from './browser.mjs';

const SPOTS = [
  ['mc-pig', 0, 16, 2600, 0], ['mc-tunnel', 0, 32, 2200, 900], ['mc-creeper', 0, 64, 2200, 700], ['mc-portal', 0, 84, 2200, 900],
  ['gi-seelie', 1, 33, 3000, 0], ['gi-shrine', 1, 49, 2400, 0], ['gi-wind', 1, 84, 2200, 600], ['gi-waypoint', 1, 92, 2200, 700],
  ['lol-secret', 2, 3, 2200, 0], ['lol-crab', 2, 15, 2600, 0], ['lol-teemo', 2, 29, 4200, 0], ['lol-turret', 2, 93, 2400, 700],
  ['val-trip', 3, 17, 2400, 0], ['val-crates', 3, 33, 2200, 0], ['val-room', 3, 66, 2200, 0], ['val-spike', 3, 85, 2200, 1200],
  ['rd-hen', 4, 15, 2600, 0], ['rd-snake', 4, 31, 2400, 900], ['rd-mine', 4, 63, 2200, 0], ['rd-posse', 4, 85, 1800, 1600],
];
const filter = process.argv[2];
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errs.push(m.text()); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const [name, world, x, wait, hold] of SPOTS) {
  if (filter && !name.startsWith(filter)) continue;
  await page.goto(`http://localhost:5199/?world=${world}&x=${x}`, { waitUntil: 'networkidle0' });
  await sleep(wait);
  if (hold) { await page.keyboard.down('ArrowRight'); await sleep(hold); await page.keyboard.up('ArrowRight'); await sleep(150); }
  await page.screenshot({ path: `shots/tour-${name}.png` });
  const st = await page.evaluate(() => { const g = window.__game; return { col: Math.round(g.player.x / 64), dead: g.dead, got: g.sweets.filter((s) => s.got).length }; });
  console.log(name, JSON.stringify(st));
}
console.log('errors:', errs.length ? errs : 'none');
await browser.close();
