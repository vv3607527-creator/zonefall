// dx-land.mjs — watch drop+landing for one seed: per-second sample of bot0
// pos.y vs terrain under it, plus zone center and water depth.
import { Sim } from '../server/src/sim.ts';
import { WORLD_SEED } from '../shared/src/consts.ts';
import { terrainHeight, waterLevelAt } from '../shared/src/worldgen.ts';

const BOT_COUNT = Number(process.argv[2] ?? 20);
const seed = Number(process.argv[3] ?? 20205);
const s = new Sim({ seed, botCount: BOT_COUNT, net: false });
s['fillWorld']();

const rows = [];
for (let t = 0; t < 300 * 30; t++) {
  s.step();
  if (t % 60 === 0) {
    const sec = t / 30;
    // sample first living bot
    let b = null;
    for (const p of s.world.players.values()) { if (p.alive) { b = p; break; } }
    if (!b) continue;
    const g = terrainHeight(b.pos.x, b.pos.z, WORLD_SEED);
    const w = waterLevelAt(b.pos.x, b.pos.z, WORLD_SEED);
    const z = s.zone.toState(t);
    rows.push(`t=${sec}s [${b.id}] state=${b.state} y=${b.pos.y.toFixed(1)} ground=${g.toFixed(1)} water=${w.toFixed(1)} zone=${z.center.x.toFixed(0)},${z.center.z.toFixed(0)} phase=${s.match.state.phase}`);
  }
}
console.log(rows.join('\n'));