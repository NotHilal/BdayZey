// Checks the level mechanics behave: plates open doors, wind lifts, secrets
// reveal, stomping works, and every set-piece does its job.
// Needs the dev server on :5199. Usage: node tools/mechanics.mjs
import puppeteer from 'puppeteer-core';
import { CHROME } from './browser.mjs';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errs.push(m.text()); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  ' + info : ''}`); if (!ok) fails++; };
const load = async (world) => { await page.goto(`http://localhost:5199/?world=${world}`, { waitUntil: 'networkidle0' }); await sleep(1500); await wait(500); };
// teleport the player so its feet stand at (column c, standing row r)
const put = (c, r) => page.evaluate((c, r) => { const g = window.__game; g.player.body.reset(c * 64 + 32, 16 + (r + 1) * 64 - 42); g.player.body.setVelocity(0, 0); }, c, r);
const deaths = () => page.evaluate(() => +document.getElementById('hudDeaths').textContent.replace(/\D/g, ''));
const G = (fn, ...a) => page.evaluate(fn, ...a);
// headless Chrome runs the game slower than real time, so wait in game time
const wait = async (ms) => { const t0 = await G(() => window.__game.mech.t); while ((await G(() => window.__game.mech.t)) - t0 < ms) await sleep(100); };

// --- Genshin: plate opens the shrine gate, the gate closes again, wind lifts
await load(1);
await put(50, 7); await wait(400);
check('genshin plate opens gate', await G(() => window.__game.mech.doors.gate.open));
await put(46, 5); await wait(4200);
check('genshin gate closes after its timer', !(await G(() => window.__game.mech.doors.gate.open)));
await put(87, 6); await wait(1400);
const wy = await G(() => window.__game.player.body.bottom);
check('genshin wind current lifts the player', wy < 200, `feet y=${Math.round(wy)}`);
await put(96, 7); await wait(300);
check('genshin waypoint unlocks at the trigger', await G(() => window.__game.goalOpen));
// slime stomp: drop onto the first slime from above
let d0 = await deaths();
await G(() => { const g = window.__game; const e = g.mech.enemies[0]; const hb = e.hitbox(); g.player.body.reset(hb.x + hb.w / 2, hb.y - 60); g.player.body.setVelocity(0, 400); });
await wait(500);
check('genshin slime can be stomped', (await deaths()) === d0 && !(await G(() => window.__game.mech.enemies[0].hitbox())));

// --- Minecraft: secret tunnel reveals, creeper explodes on you, portal lights
await load(0);
await put(35, 6); await wait(300);
check('minecraft secret tunnel reveals', await G(() => window.__game.mech.secrets[0].found));
check('minecraft portal is dark at first', !(await G(() => window.__game.goalOpen)));
d0 = await deaths();
await put(66, 6); await wait(2200);
check('minecraft creeper explodes on a player standing next to it', (await deaths()) > d0);
await wait(1200); // let the respawn finish
await put(89, 7); await wait(300);
check('minecraft portal lights at the trigger', await G(() => window.__game.goalOpen));

// --- LoL: turret shoots you in range; walking past it drops the shield
await load(2);
d0 = await deaths();
await put(94, 7); await wait(3500);
check('lol turret shots kill a player in range', (await deaths()) > d0);
await put(100, 7); await wait(400);
check('lol nexus opens after passing the turret', await G(() => window.__game.goalOpen));

// --- Valorant: spike detonates if you wait
await load(3);
d0 = await deaths();
await put(87, 5); await wait(300);
await put(92, 7);
const shown = await G(() => !document.getElementById('countdown').hidden);
check('valorant spike countdown shows', shown);
await wait(13500);
check('valorant spike detonates when time runs out', (await deaths()) > d0);
check('valorant countdown hides after death', await G(() => document.getElementById('countdown').hidden));

// --- RDR2: posse catches you if you stand still
await load(4);
d0 = await deaths();
await put(88, 7); await wait(4500);
check('rdr2 posse catches a player who stands still', (await deaths()) > d0);

console.log('errors:', errs.length ? errs : 'none');
console.log(fails ? `${fails} FAILED` : 'all passed');
await browser.close();
process.exit(fails || errs.length ? 1 : 0);
