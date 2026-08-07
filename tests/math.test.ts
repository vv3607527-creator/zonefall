// math.test.ts — immutable vector math, angles, ray/AABB and segment helpers.
import { describe, it, expect } from 'vitest';
import {
  v3, v3add, v3sub, v3scale, v3len, v3dist, v3distXZ, v3norm,
  dirFromAngles, yawOf, pitchOf, clamp, clampMag, lerp, saturate,
  angleDiff, lerpAngle, nearly, dropAtTime, timeToDistance,
  rayAabb, distToSegmentXZ,
} from '../shared/src/math.ts';

describe('vector helpers', () => {
  it('adds, subtracts and scales immutably', () => {
    const a = v3(1, 2, 3);
    const b = v3(4, 5, 6);
    expect(v3add(a, b)).toEqual({ x: 5, y: 7, z: 9 });
    expect(v3sub(a, b)).toEqual({ x: -3, y: -3, z: -3 });
    expect(v3scale(a, 2)).toEqual({ x: 2, y: 4, z: 6 });
    // Inputs untouched.
    expect(a).toEqual({ x: 1, y: 2, z: 3 });
    expect(b).toEqual({ x: 4, y: 5, z: 6 });
  });

  it('computes length, distance and XZ distance', () => {
    expect(v3len(v3(3, 4, 0))).toBe(5);
    expect(v3dist(v3(0, 0, 0), v3(3, 4, 12))).toBe(13);
    expect(v3distXZ(v3(0, 100, 0), v3(3, -50, 4))).toBe(5);
  });

  it('normalizes to unit length and zeroes the zero vector', () => {
    const n = v3norm(v3(2, 0, 0));
    expect(n).toEqual({ x: 1, y: 0, z: 0 });
    expect(v3norm(v3(0, 0, 0))).toEqual({ x: 0, y: 0, z: 0 });
    expect(v3len(v3norm(v3(1, 2, 3)))).toBeCloseTo(1, 9);
  });

  it('converts angles to direction and back', () => {
    const dir = dirFromAngles(0.7, 0.3);
    expect(nearly(yawOf(dir), 0.7)).toBe(true);
    expect(nearly(pitchOf(dir), 0.3)).toBe(true);
    // 0 yaw points +X.
    expect(dirFromAngles(0, 0)).toEqual({ x: 1, y: 0, z: 0 });
    // PI/2 yaw points +Z (CCW).
    const d90 = dirFromAngles(Math.PI / 2, 0);
    expect(d90.x).toBeCloseTo(0, 6);
    expect(d90.z).toBeCloseTo(1, 6);
  });
});

describe('scalars', () => {
  it('clamps and saturates', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-5, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
    expect(clampMag(10, 4)).toBe(4);
    expect(clampMag(-10, 4)).toBe(-4);
    expect(saturate(-1)).toBe(0);
    expect(saturate(2)).toBe(1);
  });

  it('lerps', () => {
    expect(lerp(10, 20, 0.5)).toBe(15);
    expect(lerp(10, 20, 0)).toBe(10);
    expect(lerp(10, 20, 1)).toBe(20);
  });

  it('computes shortest angular difference', () => {
    expect(angleDiff(0, Math.PI)).toBeCloseTo(Math.PI, 6);
    expect(angleDiff(0, 3 * Math.PI / 2)).toBeCloseTo(-Math.PI / 2, 6);
    expect(angleDiff(Math.PI, Math.PI / 2)).toBeCloseTo(-Math.PI / 2, 6);
    expect(angleDiff(0, 0)).toBe(0);
  });

  it('lerpAngle takes the short way around', () => {
    // From 0 toward 3PI/2 should go negative (short way).
    expect(lerpAngle(0, 3 * Math.PI / 2, 0.5)).toBeCloseTo(-Math.PI / 4, 6);
    expect(lerpAngle(0, Math.PI / 2, 1)).toBeCloseTo(Math.PI / 2, 6);
  });
});

describe('ballistics math', () => {
  it('dropAtTime matches 0.5*g*t^2', () => {
    expect(dropAtTime(9.81, 2)).toBeCloseTo(19.62, 6);
    expect(dropAtTime(9.81, 0)).toBe(0);
  });

  it('timeToDistance is d/v', () => {
    expect(timeToDistance(100, 50)).toBe(2);
  });
});

describe('rayAabb', () => {
  const box = { minx: 0.5, miny: -1, minz: -1, maxx: 1.5, maxy: 1, maxz: 1 };

  it('hits a box in front of the ray', () => {
    const t = rayAabb(0, 0, 0, 1, 0, 0, box.minx, box.miny, box.minz, box.maxx, box.maxy, box.maxz);
    expect(t).toBeCloseTo(0.5, 6);
  });

  it('misses a box behind or beside the ray', () => {
    const t = rayAabb(0, 0, 0, -1, 0, 0, box.minx, box.miny, box.minz, box.maxx, box.maxy, box.maxz);
    expect(t).toBe(-1);
  });

  it('misses when the segment length does not reach', () => {
    const t = rayAabb(0, 0, 0, 1, 0, 0, 2, -1, -1, 3, 1, 1);
    expect(t).toBe(-1);
  });
});

describe('distToSegmentXZ', () => {
  it('returns distance to the segment', () => {
    expect(distToSegmentXZ(0, 0, 1, 0, 1, 1)).toBeCloseTo(1, 6);
    expect(distToSegmentXZ(0.5, 0.5, 0, 0, 1, 0)).toBeCloseTo(0.5, 6);
    // Degenerate segment → distance to the point.
    expect(distToSegmentXZ(3, 4, 0, 0, 0, 0)).toBeCloseTo(5, 6);
  });
});
