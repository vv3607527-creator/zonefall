// zone.test.ts — safe-zone circle math. Core invariant: the next circle must
// always be reachable — every point of it lies inside the current circle.
import { describe, it, expect } from 'vitest';
import {
  ZONE_STAGES, initialZone, nextCircle, advanceZone, planPhase,
  radiusAt, centerAt, outsideDist, inside, zonePhaseOf, WORLD_HALF,
} from '../shared/src/zone.ts';
import { Rng } from '../shared/src/rng.ts';
import { v3dist } from '../shared/src/math.ts';
import { NUM_ZONE_PHASES, TICK_RATE } from '../shared/src/consts.ts';

describe('ZONE_STAGES', () => {
  it('has six stages with monotonically shrinking radii', () => {
    expect(ZONE_STAGES.length).toBe(NUM_ZONE_PHASES);
    for (let i = 1; i < ZONE_STAGES.length; i++) {
      expect(ZONE_STAGES[i].radiusFrac).toBeLessThan(ZONE_STAGES[i - 1].radiusFrac);
    }
    expect(ZONE_STAGES[0].radiusFrac).toBeLessThanOrEqual(1);
  });

  it('damage escalates across phases', () => {
    for (let i = 1; i < ZONE_STAGES.length; i++) {
      expect(ZONE_STAGES[i].dps).toBeGreaterThanOrEqual(ZONE_STAGES[i - 1].dps);
    }
  });
});

describe('initialZone', () => {
  it('starts centered on the island at full stage radius', () => {
    const z = initialZone(0);
    expect(z.radius).toBeCloseTo(WORLD_HALF * ZONE_STAGES[0].radiusFrac, 6);
    expect(z.nextRadius).toBeCloseTo(WORLD_HALF * ZONE_STAGES[1].radiusFrac, 6);
    expect(z.shrinkStartTick).toBeGreaterThan(0);
    expect(z.dps).toBe(ZONE_STAGES[0].dps);
  });
});

describe('nextCircle reachability invariant', () => {
  it('always produces a circle fully contained in the current one', () => {
    const rng = new Rng(20205);
    const center = { x: WORLD_HALF / 2, y: 0, z: WORLD_HALF / 2 + 48 } as const;
    for (let i = 0; i < 400; i++) {
      const radius = 300 + (i % 20) * 60;
      const next = nextCircle(rng, { x: center.x, y: 0, z: center.z }, radius, 0.7);
      const d = v3dist({ x: center.x, y: 0, z: center.z }, next.center);
      // Containment: center offset + next radius <= current radius.
      expect(d + next.radius).toBeLessThanOrEqual(radius + 1e-4);
      expect(next.radius).toBeGreaterThanOrEqual(60);
    }
  });

  it('is deterministic for a fixed rng seed sequence', () => {
    const a = new Rng(99);
    const b = new Rng(99);
    const ra = nextCircle(a, { x: 2048, y: 0, z: 2048 }, 1000, 0.5);
    const rb = nextCircle(b, { x: 2048, y: 0, z: 2048 }, 1000, 0.5);
    expect(ra).toEqual(rb);
  });
});

describe('radiusAt / centerAt interpolation', () => {
  const z = initialZone(100);

  it('holds still before shrink and after shrink', () => {
    expect(radiusAt(z, 0)).toBe(z.radius);
    expect(radiusAt(z, z.shrinkEndTick + 100)).toBe(z.nextRadius);
    expect(centerAt(z, 0)).toEqual(z.center);
    expect(centerAt(z, z.shrinkEndTick + 100)).toEqual(z.nextCenter);
  });

  it('interpolates linearly mid-shrink', () => {
    const mid = Math.floor((z.shrinkStartTick + z.shrinkEndTick) / 2);
    const expectedR = (z.radius + z.nextRadius) / 2;
    expect(radiusAt(z, mid)).toBeCloseTo(expectedR, 2);
    const c = centerAt(z, mid);
    expect(c.x).toBeCloseTo((z.center.x + z.nextCenter.x) / 2, 2);
    expect(c.z).toBeCloseTo((z.center.z + z.nextCenter.z) / 2, 2);
  });
});

describe('outsideDist / inside', () => {
  it('flags points outside the circle', () => {
    const z = initialZone(0);
    expect(inside(z, 0, z.center.x, z.center.z)).toBe(true);
    const far = z.radius + 100;
    expect(outsideDist(z, 0, z.center.x + far, z.center.z)).toBeCloseTo(100, 4);
    expect(inside(z, 0, z.center.x + far, z.center.z)).toBe(false);
    expect(outsideDist(z, 0, z.center.x, z.center.z)).toBe(0);
  });
});

describe('advanceZone', () => {
  it('advances through all phases then ends', () => {
    let plan = initialZone(0);
    let phases = 1;
    for (let i = 0; i < NUM_ZONE_PHASES + 2; i++) {
      const next = advanceZone(plan, plan.shrinkEndTick, i);
      if (!next) break;
      phases++;
      // New plan starts where the old one ended.
      expect(next.center).toEqual(plan.nextCenter);
      expect(next.radius).toBe(plan.nextRadius);
      plan = next;
    }
    // Reached the last phase without infinite loop; further advance returns null.
    expect(phases).toBe(NUM_ZONE_PHASES);
    const final = advanceZone(plan, plan.shrinkEndTick, NUM_ZONE_PHASES - 1);
    expect(final).toBeNull();
  });

  it('walks the full stage progression for rounds that start mid-tick (round 2+)', () => {
    // Regression: a zone created at a large absolute tick (nextRound at ~14k)
    // used to be classified as the final stage and jump straight to the last
    // circle. The phase must instead come from the caller's own counter.
    let plan = initialZone(15000);
    const radii: number[] = [];
    for (let phase = 0; phase < NUM_ZONE_PHASES; phase++) {
      const next = advanceZone(plan, plan.shrinkEndTick, phase);
      if (!next) break;
      plan = next;
      radii.push(plan.nextRadius);
    }
    expect(radii.length).toBe(NUM_ZONE_PHASES - 1);
    // Stage targets shrink monotonically toward the final tiny circle
    // (last target clamps at the 60-unit minimum).
    for (let i = 1; i < radii.length; i++) expect(radii[i]).toBeLessThanOrEqual(radii[i - 1]);
    expect(plan.nextRadius).toBeLessThanOrEqual(120);
    // Fully advanced — no further plan exists.
    expect(advanceZone(plan, plan.shrinkEndTick, NUM_ZONE_PHASES - 1)).toBeNull();
  });

  it('shrink windows use the stage wait + shrink seconds', () => {
    const z = initialZone(0);
    const s = ZONE_STAGES[0];
    expect(z.shrinkStartTick).toBe(s.waitSec * TICK_RATE);
    expect(z.shrinkEndTick - z.shrinkStartTick).toBe(s.shrinkSec * TICK_RATE);
  });
});

describe('zonePhaseOf / planPhase', () => {
  it('reports phase 0 early and caps at the last phase', () => {
    const z = initialZone(0);
    expect(zonePhaseOf(z, 0)).toBe(0);
    expect(zonePhaseOf(z, 1e9)).toBe(NUM_ZONE_PHASES - 1);
    expect(planPhase(z)).toBe(0);
  });
});
