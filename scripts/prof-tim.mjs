// prof-step.mjs — times each phase of a single sim step to find the hot loop.
// Fast-forwards to each phase (lobby/flight/playing) and samples step cost,
// plus how many bot path(A*) calls happen per tick.
import { Sim } from '../server/src/sim.ts';

const s = new Sim({ seed: 20205, botCount: 20, net: false });
s['fillWorld']();

// instrument AI path calls (naive counter on the ai-nav module is hard; count via
// players with active bot path each step instead).
let lastPhase = '';

function resample(label) {
  let pathing = 0, firing = 0, looting = 0, moving = 0, guns = 0, alive = 0;
  for (const p of s.players.values()) {
    const b = s['brains']?.get(p.id);
    if (!b || !p.alive) continue;
    alive++;
    if (b.state === 'loot') looting++;
    if (b.state === 'rotate' || b.state === 'engage') moving++;
    if (b.path && b.path.length > 0) pathing++;
    if (p.gun && p.gun !== 'fists') guns++;
    if (p.fireT && p.fireT > 0) firing++;
  }
  console.log(
    `phase=${phase} alive=${alive} loot=${looting} move=${moving} pathing=${pathing} guns=${guns} firing=${firing}`
  );
}

const N = 60;
let t0, total;
const interests = ['flight', 'playing'];
for (let i = 0; i < 40000 && cost === undefined; i++) {
  const ph = s.match.state.phase;
  if (ph !== 'lobby') {
    // warm a few steps in the new phase
    for (let w = 0; w < 20; w++) s.step();
    t0 = performance.now();
    for (let k = 0; k < N; k++) s.step();
    const dt = (performance.now() - t0) / N;
    resample(ph);
    console.log(`  step@${ph} = ${dt.toFixed(2)}ms (${(1000 / dt).toFixed(1)} Hz)`);
    if (interests.includes(ph)) {
      cost = dt;
    }
  }
  s.step();
  prev = ph;
}
console.log(`done (phase=${s.match.state.phase})`);