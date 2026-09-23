// Automated run: teleports the raccoon to each franui and the goal in every
// world, clicks through the clear screens, and screenshots the finale.
import puppeteer from 'puppeteer-core';
import { CHROME } from './browser.mjs';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errs.push(m.text()); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle0' });
await sleep(2500);
await page.screenshot({ path: 'shots/flow-title.png' });
await page.click('#startBtn');
for (let w = 0; w < 5; w++) {
  await sleep(2200);
  // real input: run right for a bit, jump once
  await page.keyboard.down('ArrowRight'); await sleep(500);
  await page.keyboard.press('Space'); await sleep(500);
  await page.keyboard.up('ArrowRight');
  const info = await page.evaluate(() => { const g = window.__game; return { world: g.world.key, x: Math.round(g.player.x), dead: g.dead }; });
  console.log('world', w, JSON.stringify(info));
  for (let i = 0; i < 3; i++) {
    // franui can ride a moving carrier, so aim at where it is right now
    await page.evaluate((i) => { const g = window.__game; const s = g.sweets[i]; g.player.body.reset(s.img.x, s.img.y - 10); }, i);
    await sleep(350);
  }
  await page.screenshot({ path: `shots/flow-w${w}-sweets.png` });
  const got = await page.evaluate(() => { const g = window.__game; return JSON.stringify({ key: g.world.key, got: g.sweets.filter((s) => s.got).length, dead: g.dead, done: g.done, screen: window.__ui.screen }); });
  console.log('  sweets collected', got);
  await page.evaluate(() => { const g = window.__game; const z = g.goal.zone; g.player.body.reset(z.x + z.w / 2, z.y + z.h - 30); });
  await sleep(800);
  await page.screenshot({ path: `shots/flow-w${w}-goal.png` });
  await sleep(1800);
  const clearVisible = await page.evaluate(() => !document.getElementById('clearOverlay').hidden);
  console.log('  clear overlay', clearVisible);
  await page.screenshot({ path: `shots/flow-w${w}-clear.png` });
  await sleep(800);
  await page.evaluate(() => document.getElementById('nextBtn').click());
}
await sleep(2500);
await page.screenshot({ path: 'shots/flow-finale.png' });
console.log('finale visible', await page.evaluate(() => !document.getElementById('finaleOverlay').hidden));
console.log('errors:', errs.length ? errs : 'none');
await browser.close();
