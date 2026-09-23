// Kills the raccoon and checks it is visible again after respawning.
import puppeteer from 'puppeteer-core';
import { CHROME } from './browser.mjs';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto('http://localhost:5199/?world=0', { waitUntil: 'networkidle0' });
await sleep(3000);
await page.evaluate(() => window.__game.die());
await sleep(3000);
const s = await page.evaluate(() => { const p = window.__game.player; return { visible: p.visible, alpha: p.alpha, scale: [p.scaleX, p.scaleY], dead: window.__game.dead }; });
console.log(JSON.stringify(s));
await page.screenshot({ path: 'shots/after-death.png' });
await browser.close();
