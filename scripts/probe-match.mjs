// probe-match.mjs — headless verification harness: connects to the running
// server as a spectator client, watches a full match lifecycle, and reports
// what it observed. Used by scripts/verify.sh and CI.
//
// Usage: node scripts/probe-match.mjs [seconds] [wsUrl]
// Exit code 0 on PASS, 1 on FAIL.

import WebSocket from 'ws';

const SECONDS = Number(process.argv[2] ?? 70);
const URL = process.argv[3] ?? 'ws://127.0.0.1:8787/ws';

const stats = {
  welcome: false,
  myId: -1,
  fullSnaps: 0,
  deltaSnaps: 0,
  events: 0,
  maxPlayers: 0,
  maxItems: 0,
  maxVehicles: 0,
  phases: new Set(),
  sawPlane: false,
  sawDrop: false,
  sawKill: false,
  sawMatchEnd: false,
  zonePhases: new Set(),
  errors: [],
};

const ws = new WebSocket(URL, { perMessageDeflate: false });
let done = false;

const finish = (code, reason) => {
  if (done) return;
  done = true;
  try { ws.close(); } catch { /* noop */ }
  if (reason) console.log('FAIL:', reason);
  else console.log('PASS');
  console.log(JSON.stringify({
    ...stats,
    phases: [...stats.phases],
    zonePhases: [...stats.zonePhases],
  }, null, 2));
  process.exit(code);
};

ws.on('open', () => {
  ws.send(JSON.stringify({ type: 'hello', meta: { name: 'Probe', skin: 0, region: 0 } }));
});

ws.on('message', (raw) => {
  let m;
  try { m = JSON.parse(String(raw)); } catch { return; }

  if (m.type === 'welcome') {
    stats.welcome = true;
    stats.myId = m.id;
  } else if (m.type === 'full') {
    stats.fullSnaps++;
    stats.maxPlayers = Math.max(stats.maxPlayers, m.snap.players.length);
    stats.maxItems = Math.max(stats.maxItems, m.snap.items.length);
    stats.maxVehicles = Math.max(stats.maxVehicles, m.snap.vehicles.length);
    stats.phases.add(m.snap.match?.phase);
    if (m.snap.zone) stats.zonePhases.add(m.snap.zone.phase);
  } else if (m.type === 'delta') {
    stats.deltaSnaps++;
    for (const op of m.snap.ops) {
      if (op[0] === 'u' && op[2] && 'state' in op[2] && op[2].state === 'plane') stats.phases.add('plane');
    }
  } else if (m.type === 'event') {
    stats.events++;
    if (m.e.t === 'plane') stats.sawPlane = true;
    if (m.e.t === 'drop') stats.sawDrop = true;
    if (m.e.t === 'kill') stats.sawKill = true;
    if (m.e.t === 'matchEnd') stats.sawMatchEnd = true;
  } else if (m.type === 'error') {
    stats.errors.push(String(m.msg ?? m.message ?? ''));
  }
});

ws.on('error', (err) => {
  stats.errors.push(String(err.message ?? err));
});

setTimeout(() => {
  if (!stats.welcome) {
    finish(1, 'no welcome message received');
    return;
  }
  if (stats.maxPlayers < 10) {
    finish(1, `expected a full lobby of bots, saw ${stats.maxPlayers} players`);
    return;
  }
  if (stats.fullSnaps < 3) {
    finish(1, `expected repeated full snapshots, saw ${stats.fullSnaps}`);
    return;
  }
  if (stats.errors.length > 0) {
    finish(1, `server sent errors: ${stats.errors.join('; ')}`);
    return;
  }
  finish(0);
}, SECONDS * 1000);
