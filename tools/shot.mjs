// Usage: node tools/shot.mjs <url> <out.png> [waitMs] [w] [h]
import puppeteer from 'puppeteer-core';
const [url, out, wait = '2500', w = '1280', h = '720'] = process.argv.slice(2);
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
await page.setViewport({ width: +w, height: +h });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, +wait));
await page.screenshot({ path: out });
if (logs.length) console.log(logs.join('\n'));
await browser.close();
