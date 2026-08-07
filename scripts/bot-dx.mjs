// bot-dx.mjs — headless bot behavior diagnostic. Boots the real Sim
// (no network) and samples bot states, gun loot, movement, and combat over
// a configurable window. Writes findings to dx-report.txt.
//
// Usage: node scripts/bot-dx.mjs [simSeconds] [botCount] [seed]

import { writeFileSync } from 'node:fs';
import { Sim } from '../server/src/sim.ts';
import { WEAPONS } from '../shared/src/weapons.ts';

const SIM_SECONDS = Number(process.argv[2] ?? 150);
const BOT_COUNT = Number(process.argv[3] ?? 99);
const SEED = Number(process.argv[4] ?? 20205);

const s = new Sim({ seed: SEED, botCount: BOT_COUNT, net: false });
s['fillWorld']();

const TICKS = SIM_SECONDS * 30;
const SAMPLE = 30 * 30; // report every 30 sim-seconds
const out = [];
const tstart = performance.now();
let lastLoot = -1;
let lastMoving = -1;
let combatTicks = 0;

for (let t = 1; t <= TICKS; t++) {
  s.step();
  if (t % SAMPLE !== 0) continue;
  const secs = t / 30;
  const bots = [...s.world.players.values()].filter((p) => p.kind === 'bot');
  const byState = {};
  for (const p of bots) byState[p.state] = (byState[p.state] ?? 0) + 1;
  const playing = bots.filter((p) => p.state === 'playing');
  const looted = playing.filter((p) => {
    const w = WEAPONS.find((x) => x.id === p.equippedWeapon);
    return w && w.category !== 'melee';
  }).length;
  const moving = playing.filter((p) => p.moveSpeed > 1).length;
  const firing = playing.filter((p) => p.lastFireTick > t - 30).length;
  if (firing > 0) combatTicks++;
  const line = `t=${secs}s phase=${s.match.state.phase} alive=${s.world.countAlive()} states=${JSON.stringify(byState)} guns=${looted} moving=${moving} firing=${firing}`;
  if (looted !== lastLoot || moving !== lastMoving || t <= SAMPLE * 2) {
    out.push(line);
    lastLoot = looted;
    lastMoving = moving;
  }
}
const wall = ((performance.now() - tstart) / 1000).toFixed(1);
out.push(`\nwall=${wall}s for ${SIM_SECONDS}s sim; ticks-with-bot-fire=${combatTicks}`);
writeFileSync('/data/data/com.termux/files/home/zonefall/scripts/dx-report.txt', out.join('\n') + '\n');
console.log(out.join('\n'));