// All duo networking goes through this module so the transport can be swapped.
//   createRoom() -> code   joinRoom(code)   send(type, payload)   on(type, cb) -> off()   leave()
// Transport: Supabase Realtime "broadcast" channels when VITE_SUPABASE_URL and
// VITE_SUPABASE_ANON_KEY are set (works across devices and networks). Without
// them it falls back to BroadcastChannel, which only connects tabs of the same
// browser: handy for local testing, useless for playing on two devices.

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const handlers = new Map(); // type -> Set(cb)
const id = Math.random().toString(36).slice(2, 10); // this client, to drop our own echoes
let transport = null;
let room = null;

function dispatch(msg) {
  if (!msg || msg.from === id) return;
  handlers.get(msg.t)?.forEach((cb) => cb(msg.d ?? {}, msg));
  handlers.get('*')?.forEach((cb) => cb(msg.d ?? {}, msg));
}

async function supabaseTransport(code) {
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(SUPA_URL, SUPA_KEY, { realtime: { params: { eventsPerSecond: 40 } } });
  const ch = client.channel(`zsq-${code}`, { config: { broadcast: { self: false, ack: false } } });
  ch.on('broadcast', { event: 'm' }, ({ payload }) => dispatch(payload));
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Could not reach the realtime server')), 10000);
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') { clearTimeout(t); resolve(); }
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { clearTimeout(t); reject(new Error('Realtime channel error: ' + status)); }
    });
  });
  return {
    send: (msg) => ch.send({ type: 'broadcast', event: 'm', payload: msg }),
    close: () => { client.removeChannel(ch); },
  };
}

function localTransport(code) {
  const bc = new BroadcastChannel(`zsq-${code}`);
  bc.onmessage = (e) => dispatch(e.data);
  return { send: (msg) => bc.postMessage(msg), close: () => bc.close() };
}

async function open(code) {
  net.leave();
  room = code;
  transport = SUPA_URL && SUPA_KEY ? await supabaseTransport(code) : localTransport(code);
}

// four letters, no look-alikes (I/O/0/1)
function randomCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  return Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join('');
}

export const net = {
  id,
  get online() { return !!(SUPA_URL && SUPA_KEY); },
  get room() { return room; },
  async createRoom() { const code = randomCode(); await open(code); return code; },
  async joinRoom(code) { await open(code.trim().toUpperCase()); return room; },
  send(type, payload = {}) { transport?.send({ t: type, d: payload, from: id }); },
  on(type, cb) {
    if (!handlers.has(type)) handlers.set(type, new Set());
    handlers.get(type).add(cb);
    return () => handlers.get(type)?.delete(cb);
  },
  leave() {
    if (!transport) return;
    try { transport.send({ t: 'bye', d: {}, from: id }); } catch {}
    transport.close();
    transport = null; room = null;
  },
};
