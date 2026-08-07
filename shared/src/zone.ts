// zone.ts — safe zone circle math. Provably-reachable shrink: each next circle
// center is sampled from the current circle contracted so every point of the
// next circle lies inside (or on) the current one — nobody can be unfairly
// eliminated by a jump they cannot outrun.

import { Rng } from './rng.ts';
import { v3, v3clone, type Vec3 } from './math.ts';
import { NUM_ZONE_PHASES, TICK_RATE } from './consts.ts';

export interface ZonePlan {
  center: Vec3;
  radius: number;
  nextCenter: Vec3;
  nextRadius: number;
  shrinkStartTick: number;
  shrinkEndTick: number;
  dps: number;
}

export interface ZoneStage {
  radiusFrac: number;  // radius as fraction of world half-size
  shrinkSec: number;   // seconds the shrink takes
  waitSec: number;     // seconds before shrink starts
  dps: number;         // damage per second outside the CURRENT circle
}

export const ZONE_STAGES: ZoneStage[] = [
  { radiusFrac: 0.92, shrinkSec: 75, waitSec: 20, dps: 1 },
  { radiusFrac: 0.7,  shrinkSec: 70, waitSec: 25, dps: 2 },
  { radiusFrac: 0.5,  shrinkSec: 60, waitSec: 25, dps: 4 },
  { radiusFrac: 0.33, shrinkSec: 50, waitSec: 30, dps: 8 },
  { radiusFrac: 0.2,  shrinkSec: 40, waitSec: 30, dps: 12 },
  { radiusFrac: 0.08, shrinkSec: 35, waitSec: 30, dps: 18 },
];

export const WORLD_HALF = 2048;

/** Tick at which each stage's active period begins (cumulative durations). */
const STAGE_START_TICKS: number[] = (() => {
  const acc: number[] = [];
  let t = 0;
  for (let i = 0; i < NUM_ZONE_PHASES; i++) {
    acc.push(t);
    t += (ZONE_STAGES[i].waitSec + ZONE_STAGES[i].shrinkSec) * TICK_RATE;
  }
  return acc;
})();

/** Initial circle centered on the island. */
export function initialZone(tick: number): ZonePlan {
  const s = ZONE_STAGES[0];
  return {
    center: v3(2048, 0, 2096),
    radius: WORLD_HALF * s.radiusFrac,
    nextCenter: v3(2048, 0, 2096),
    nextRadius: WORLD_HALF * ZONE_STAGES[1].radiusFrac,
    shrinkStartTick: tick + s.waitSec * 30,
    shrinkEndTick: tick + (s.waitSec + s.shrinkSec) * 30,
    dps: s.dps,
  };
}

/**
 * Choose the next circle: center uniformly inside the current circle contracted
 * by (nextRadius) so the new circle is fully contained. Weighted toward the
 * current center to keep fights progressing inward.
 */
export function nextCircle(
  rng: Rng,
  center: Vec3,
  radius: number,
  nextFrac: number,
): { center: Vec3; radius: number } {
  const nextR = Math.max(60, radius * nextFrac);
  const maxOff = Math.max(0, radius - nextR);
  // Bias inward: sample offset uniformly in [0, maxOff * 0.85] with inward pull.
  const t = rng.next();
  const off = Math.sqrt(t) * maxOff * 0.85; // sqrt bias → denser near center
  const ang = rng.range(0, Math.PI * 2);
  const nx = center.x + Math.cos(ang) * off;
  const nz = center.z + Math.sin(ang) * off;
  // Clamp center so circle stays on the island.
  const cx = Math.min(WORLD_HALF - nextR, Math.max(-WORLD_HALF + nextR, nx));
  const cz = Math.min(WORLD_HALF - nextR, Math.max(-WORLD_HALF + nextR, nz));
  return { center: v3(cx, 0, cz), radius: nextR };
}

/**
 * Advance the zone plan to the next phase. Returns the new plan or null when
 * the final phase has been reached. `phase` is the caller's own phase counter
 * (0-based) — never derived from absolute ticks, so rounds that restart mid-
 * tick (round 2+) get a full fresh stage progression.
 */
export function advanceZone(plan: ZonePlan, tick: number, phase: number): ZonePlan | null {
  const nextPhase = phase + 1;
  if (nextPhase >= NUM_ZONE_PHASES) return null;
  const s = ZONE_STAGES[nextPhase];
  const { center, radius } = nextCircleFrom(plan, nextPhase);
  return {
    center: v3clone(plan.nextCenter),
    radius: plan.nextRadius,
    nextCenter: center,
    nextRadius: radius,
    shrinkStartTick: tick + s.waitSec * 30,
    shrinkEndTick: tick + (s.waitSec + s.shrinkSec) * 30,
    dps: s.dps,
  };
}

function nextCircleFrom(plan: ZonePlan, phase: number): { center: Vec3; radius: number } {
  // Deterministic: sample from plan fields seeded by phase so replay matches.
  const rng = new Rng((phase + 1) * 7919 + Math.round(plan.center.x + plan.center.z));
  return nextCircle(rng, plan.nextCenter, plan.nextRadius, ZONE_STAGES[phase].radiusFrac);
}

/** Current phase index 0..NUM_ZONE_PHASES-1 based on the plan's start tick. */
export function planPhase(plan: ZonePlan): number {
  const tick = plan.shrinkStartTick;
  for (let i = 0; i < NUM_ZONE_PHASES; i++) {
    const end = i + 1 < NUM_ZONE_PHASES ? STAGE_START_TICKS[i + 1] : Infinity;
    if (tick >= STAGE_START_TICKS[i] && tick < end) return i;
  }
  return NUM_ZONE_PHASES - 1;
}

/** Interpolated radius at tick (shrinking is linear). */
export function radiusAt(plan: ZonePlan, tick: number): number {
  if (tick <= plan.shrinkStartTick) return plan.radius;
  if (tick >= plan.shrinkEndTick) return plan.nextRadius;
  const t = (tick - plan.shrinkStartTick) / (plan.shrinkEndTick - plan.shrinkStartTick);
  return plan.radius + (plan.nextRadius - plan.radius) * t;
}

/** Interpolated center at tick (moves linearly toward nextCenter). */
export function centerAt(plan: ZonePlan, tick: number): Vec3 {
  if (tick <= plan.shrinkStartTick) return plan.center;
  if (tick >= plan.shrinkEndTick) return plan.nextCenter;
  const t = (tick - plan.shrinkStartTick) / (plan.shrinkEndTick - plan.shrinkStartTick);
  return v3(
    plan.center.x + (plan.nextCenter.x - plan.center.x) * t,
    0,
    plan.center.z + (plan.nextCenter.z - plan.center.z) * t,
  );
}

/** Distance outside the circle a point is (0 = inside or on). */
export function outsideDist(plan: ZonePlan, tick: number, x: number, z: number): number {
  const c = centerAt(plan, tick);
  const r = radiusAt(plan, tick);
  const d = Math.hypot(x - c.x, z - c.z);
  return Math.max(0, d - r);
}

/** Point inside circle? */
export function inside(plan: ZonePlan, tick: number, x: number, z: number): boolean {
  return outsideDist(plan, tick, x, z) <= 0;
}

export function zonePhaseOf(plan: ZonePlan, tick: number): number {
  for (let i = 0; i < ZONE_STAGES.length; i++) {
    if (tick < plan.shrinkStartTick + (i + 1) * 120 * 30) return i;
  }
  return NUM_ZONE_PHASES - 1;
}