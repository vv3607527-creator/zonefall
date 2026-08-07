// Probe: verify the pre-rolled flight path keeps every bot drop inside the
// initial safe circle. Uses the REAL Match state so it validates the actual
// path each seed rolls (including the reachability re-roll in makeState).
import { Match } from '../server/src/match.ts';
import { initialZone } from '../shared/src/zone.ts';
import { lerp } from '../shared/src/math.ts';

const z0 = initialZone(0);

function planeAt(fp: { from: { x: number; z: number }; to: { x: number; z: number } }, frac: number) {
  return {
    x: lerp(fp.from.x, fp.to.x, frac),
    z: lerp(fp.from.z, fp.to.z, frac),
  };
}

function distXZ(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

let allInside = true;
for (const seed of [20205, 7, 9999, 12345, 1, 2, 3]) {
  const m = new Match(seed, 0);
  const fp = m.state.flightPath;
  const from = fp.from;
  const to = fp.to;
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const denom = dx * dx + dz * dz;
  const base = Math.min(1, Math.max(0, ((z0.center.x - from.x) * dx + (z0.center.z - from.z) * dz) / denom));
  const lo = Math.max(0.05, base - 0.05);
  const hi = Math.min(0.95, base + 0.05);
  let worst = 0;
  for (let f = lo; f <= hi + 1e-9; f += 0.01) {
    const p = planeAt(fp, f);
    worst = Math.max(worst, distXZ(p.x, p.z, z0.center.x, z0.center.z));
  }
  const inside = worst <= z0.radius;
  allInside = allInside && inside;
  console.log(
    `seed=${seed} path from=(${from.x.toFixed(0)},${from.z.toFixed(0)}) to=(${to.x.toFixed(0)},${to.z.toFixed(0)}) ` +
    `dropFracBase=${base.toFixed(3)} jitter=[${lo.toFixed(3)},${hi.toFixed(3)}] worstDropDist=${worst.toFixed(0)} ` +
    `zoneR=${z0.radius.toFixed(0)} ${inside ? 'INSIDE ✓' : 'OUTSIDE ✗'}`,
  );
}
console.log(allInside ? 'ALL SEEDS: every bot drop lands inside the initial circle' : 'FAIL: some drops land outside the circle');
