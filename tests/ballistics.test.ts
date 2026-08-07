// ballistics.test.ts — projectile spawn/step and aim helpers.
import { describe, it, expect } from 'vitest';
import {
  spawnProjectile, stepProjectile, flightTime, dropAtDistance, aimCorrection, leadAngle,
} from '../shared/src/ballistics.ts';
import { v3, v3len, v3dist, dropAtTime } from '../shared/src/math.ts';

const WEAPON = { id: 12, dmg: 40, muzzle: 900, gravityMul: 1, pen: 3 };

describe('spawnProjectile', () => {
  it('fires along the direction at muzzle velocity', () => {
    const p = spawnProjectile(1, v3(0, 1.6, 0), v3(1, 0, 0), WEAPON, 0, [0, 0]);
    expect(p.vel.x).toBeCloseTo(900, 6);
    expect(p.vel.y).toBe(0);
    expect(p.pos).toEqual({ x: 0, y: 1.6, z: 0 });
    expect(p.g).toBeCloseTo(9.81, 6);
    expect(p.dmg).toBe(40);
    expect(p.pen).toBe(3);
    expect(p.shooter).toBe(1);
    expect(p.weaponId).toBe(12);
    expect(p.traveled).toBe(0);
  });

  it('adds jitter scaled by spread', () => {
    const p = spawnProjectile(1, v3(0, 0, 0), v3(1, 0, 0), WEAPON, 0.1, [0.5, 0.5]);
    expect(v3len(p.vel)).toBeCloseTo(900, 3);
    expect(p.vel.y).toBeGreaterThan(0);
  });

  it('zero jitter + zero spread yields exact direction', () => {
    const p = spawnProjectile(1, v3(0, 0, 0), v3(0, 0, 1), WEAPON, 0, [0, 0]);
    expect(p.vel.x).toBe(0);
    expect(p.vel.z).toBeCloseTo(900, 6);
  });
});

describe('stepProjectile', () => {
  it('integrates gravity and motion', () => {
    const p = spawnProjectile(1, v3(0, 0, 0), v3(1, 0, 0), WEAPON, 0, [0, 0]);
    const dt = 1 / 30;
    const q = stepProjectile(p, dt);
    // Velocity loses g*dt in y.
    expect(q.vel.y).toBeCloseTo(-9.81 * dt, 6);
    // Position moved by new velocity (semi-implicit Euler).
    expect(q.pos.x).toBeCloseTo(900 * dt, 3);
    expect(q.pos.y).toBeCloseTo(-9.81 * dt * dt, 6);
    expect(q.traveled).toBeCloseTo(v3len(q.vel) * dt, 3);
  });

  it('is immutable — input projectile untouched', () => {
    const p = spawnProjectile(1, v3(0, 0, 0), v3(1, 0, 0), WEAPON, 0, [0, 0]);
    const before = JSON.stringify(p);
    stepProjectile(p, 1 / 30);
    expect(JSON.stringify(p)).toBe(before);
  });
});

describe('flightTime / dropAtDistance', () => {
  it('flight time is d / muzzle', () => {
    expect(flightTime(450, 900)).toBe(0.5);
  });

  it('drop matches 0.5*g*t^2 with the gravity multiplier', () => {
    const d = 200;
    const muzzle = 800;
    const t = flightTime(d, muzzle);
    expect(dropAtDistance(d, muzzle, 1)).toBeCloseTo(dropAtTime(9.81, t), 6);
    expect(dropAtDistance(d, muzzle, 0.5)).toBeCloseTo(dropAtTime(9.81 * 0.5, t), 6);
  });
});

describe('aimCorrection', () => {
  it('returns a finite pitch angle', () => {
    const a = aimCorrection(300, 900, 1, 0);
    expect(Number.isFinite(a)).toBe(true);
    // Target below the barrel → aim slightly up... actually gravity drop means
    // shooting flat would land low; the correction is small for fast bullets.
    expect(Math.abs(a)).toBeLessThan(Math.PI / 2);
  });
});

describe('leadAngle', () => {
  it('grows with target speed', () => {
    const a = leadAngle(10, 900);
    const b = leadAngle(30, 900);
    expect(b).toBeGreaterThan(a);
    expect(leadAngle(0, 900)).toBe(0);
  });
});
