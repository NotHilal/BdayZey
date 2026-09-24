// `npm run dev`: starts the duo relay (unless one is already running) and Vite together.
// Extra arguments go to Vite, e.g. `npm run dev -- --host` to play from a phone on your Wi-Fi.
import { spawn } from 'node:child_process';

const up = await fetch('http://localhost:8787/').then(() => true, () => false);
const relay = up ? null : spawn(process.execPath, ['server/relay.mjs'], { stdio: 'inherit' });
if (up) console.log('duo relay already running on :8787');

const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', ...process.argv.slice(2)], { stdio: 'inherit' });
const stop = () => { relay?.kill(); vite.kill(); };
vite.on('exit', (code) => { relay?.kill(); process.exit(code ?? 0); });
relay?.on('exit', (code) => { if (code) console.error(`duo relay stopped (exit ${code})`); });
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
