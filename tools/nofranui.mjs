// Walks into the goal with zero franui: the world must still clear.
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto('http://localhost:5199/?world=1', { waitUntil: 'networkidle0' });
await sleep(3000);
await page.evaluate(() => { const g = window.__game; const z = g.goal.zone; g.player.body.reset(z.x + z.w / 2, z.y + z.h - 30); });
await sleep(4000);
console.log('clear shown:', await page.evaluate(() => !document.getElementById('clearOverlay').hidden));
await page.screenshot({ path: 'shots/clear-0-franui.png' });
await browser.close();
