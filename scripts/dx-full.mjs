// dx-full.mjs — run a full headless match and sample per-second state to answer
// "do bots land, loot guns, and fight?" Writes a table to stdout (redirect to file).
import { Sim } from '../server/src/sim.ts';

const BOT_COUNT = Number(process.argv[2] ?? 20);
const MAX_SIM_SEC = Number(process.argv[3] ?? 300);
const seed = Number(process.argv[4] ?? 20205);

const s = new Sim({ seed, botCount: BOT_COUNT, net: false });
s['fillWorld']();

const GUN_MIN = 1, GUN_MAX = 28; // melee 29-30, zone 9000
const kills = { gun: 0, melee: 0, zone: 0 };
const reports = [];
const TICKS = MAX_SIM_SEC * 30;

let lastSample = 0;
for (let t = 0; t < TICKS; t++) {
  s.step();
  if (t % 30 === 0) {
    // drain kill events accumulated since the previous sample
    for (const e of s.replay.since(lastSample)) {
      if (e.t === 'kill') {
        if (e.weaponId >= GUN_MIN && e.weaponId <= GUN_MAX) kills.gun++;
        else if (e.weaponId === 9000) kills.zone++;
        else kills.melee++;
      }
    }
    lastSample = t;
    const sec = t / 30;
    let playing = 0, plane = 0, airborne = 0, guns = 0, firing = 0, alive = 0;
    for (const p of s.world.players.values()) {
      if (!p.alive) continue;
      alive++;
      if (p.state === 'playing') playing++;
      else if (p.state === 'plane') plane++;
      else if (p.state === 'skydive' || p.state === 'parachute') airborne++;
      if (p.equippedWeapon >= GUN_MIN && p.equippedWeapon <= GUN_MAX) guns++;
      if (p.lastFireTick && p.lastFireTick > t - 3) firing++;
    }
    reports.push(`t=${sec}s phase=${s.match.state.phase} alive=${alive} plane=${plane} air=${airborne} playing=${playing} guns=${guns} firing=${firing} kills={g:${kills.gun},m:${kills.melee},z:${kills.zone}}`);
  }
}
console.log(reports.join('\n'));
console.log(`FINAL kills: gun=${kills.gun} melee=${kills.melee} zone=${kills.zone} phase=${s.match.state.phase}`);
console.log(`step-avg over run = ${(performance.now() / TICKS).toFixed(2)}ms`);