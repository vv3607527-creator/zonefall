// gun-probe.mjs — verifies the bot loot fix end-to-end: connects as a
// spectator, watches kill events, and reports the weapon histogram.
// PASS requires at least one non-melee, non-zone kill (weaponId 1-28).
//
// Usage: node scripts/gun-probe.mjs [seconds] [wsUrl]

import WebSocket from 'ws';

const SECONDS = Number(process.argv[2] ?? 400);
const URL = process.argv[3] ?? 'ws://127.0.0.1:8787/ws';
const t0 = Date.now();

const guns = new Map();   // weaponId -> kills
const stats = { welcome: false, kills: 0, zoneKills: 0, meleeKills: 0, matchEnd: false, errors: [] };
const ws = new WebSocket(URL, { perMessageDeflate: false });
let done = false;

const finish = (code, reason) => {
  if (done) return;
  done = true;
  try { ws.close(); } catch { /* noop */ }
  const hist = [...guns.entries()].sort((a, b) => b[1] - a[1]).map(([w, n]) => `${w}x${n}`);
  console.log(reason ? 'FAIL:' : 'PASS:', reason ?? '');
  console.log(JSON.stringify({ ...stats, weaponHistogram: hist }, null, 2));
  process.exit(code);
};

ws.on('open', () => {
  ws.send(JSON.stringify({ type: 'hello', meta: { name: 'GunProbe', skin: 0, region: 0 } }));
});

ws.on('message', (raw) => {
  let m;
  try { m = JSON.parse(String(raw)); } catch { return; }
  if (m.type === 'welcome') {
    stats.welcome = true;
    console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] welcome id=${m.id} seed=${m.seed}`);
  } else if (m.type === 'event' && m.e?.t === 'kill') {
    stats.kills++;
    const w = m.e.weaponId;
    if (w === 9000) stats.zoneKills++;
    else if (w === 29 || w === 30) stats.meleeKills++;
    else if (w >= 1 && w <= 28) guns.set(w, (guns.get(w) ?? 0) + 1);
    if (m.e.weaponId >= 1 && m.e.weaponId <= 28) {
      console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] GUN KILL weaponId=${m.e.weaponId} killer=${m.e.killer} victim=${m.e.victim}${m.e.headshot ? ' HEADSHOT' : ''}`);
    }
  } else if (m.type === 'event' && m.e?.t === 'matchEnd') {
    stats.matchEnd = true;
  } else if (m.type === 'error') {
    stats.errors.push(String(m.msg ?? m.message ?? ''));
  }
});

ws.on('error', (err) => stats.errors.push(String(err.message ?? err)));

setTimeout(() => {
  if (!stats.welcome) return finish(1, 'no welcome');
  if (stats.errors.length) return finish(1, `server errors: ${stats.errors.join('; ')}`);
  if (stats.kills === 0) return finish(1, `no kills observed in ${SECONDS}s`);
  const gunKills = [...guns.values()].reduce((a, b) => a + b, 0);
  if (gunKills === 0) return finish(1, `kills happened but ALL were melee/zone (${stats.meleeKills} melee, ${stats.zoneKills} zone) — loot stall persists`);
  return finish(0, `gun kills confirmed: ${gunKills} gun kills among ${stats.kills} total`);
}, SECONDS * 1000);
