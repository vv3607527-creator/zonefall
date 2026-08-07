// ballistics.ts — projectile simulation shared by server (authoritative) and
// client (tracer prediction + aim help). Pure math.

import { v3, v3add, v3scale, v3sub, v3clone, type Vec3 } from './math.ts';

export interface Projectile {
  pos: Vec3;
  vel: Vec3;
  /** Gravity m/s^2 applied this projectile. */
  g: number;
  /** Remaining penetration budget. */
  pen: number;
  /** Damage carried (per pellet). */
  dmg: number;
  weaponId: number;
  shooter: number;
  limb: string;
  traveled: number;
}

/** Spawn a projectile from a weapon def at muzzle position + direction. */
export function spawnProjectile(
  shooter: number,
  muzzle: Vec3,
  dir: Vec3,
  weapon: { dmg: number; muzzle: number; gravityMul: number; pen: number; id: number },
  spreadRad: number,
  jitter: [number, number],
  limb = 'chest',
): Projectile {
  // Apply random spread by rotating the direction slightly (small-angle approx).
  const s = Math.tan(spreadRad);
  const dx = dir.x + jitter[0] * s;
  const dy = dir.y + jitter[1] * s;
  const dz = dir.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  const nd = { x: dx / len, y: dy / len, z: dz / len };
  return {
    pos: v3clone(muzzle),
    vel: v3scale(nd, weapon.muzzle),
    g: 9.81 * weapon.gravityMul,
    pen: weapon.pen,
    dmg: weapon.dmg,
    weaponId: weapon.id as number,
    shooter,
    limb,
    traveled: 0,
  };
}

/** Integrate one simulation step; returns new projectile (immutable). */
export function stepProjectile(p: Projectile, dt: number): Projectile {
  const vel = v3(p.vel.x, p.vel.y - p.g * dt, p.vel.z);
  const pos = v3add(p.pos, v3scale(vel, dt));
  return { ...p, pos, vel, traveled: p.traveled + Math.hypot(vel.x, vel.y, vel.z) * dt };
}

/**
 * Time of flight (seconds) for a projectile to reach a target at horizontal
 * distance `d` given muzzle velocity (assumes flat-ish trajectory).
 */
export function flightTime(d: number, muzzle: number): number {
  return d / muzzle;
}

/**
 * Vertical drop (meters) of a projectile over horizontal distance d.
 * Uses the projectile's gravity multiplier.
 */
export function dropAtDistance(d: number, muzzle: number, gravityMul: number): number {
  const t = flightTime(d, muzzle);
  return 0.5 * 9.81 * gravityMul * t * t;
}

/** Zero-in / aim height offset so a shot at distance d lands on the target. */
export function aimCorrection(d: number, muzzle: number, gravityMul: number, targetY: number): number {
  // Solve quadratic: 0.5*g*t^2 = v_y*t + (targetY - muzzleY)  =>  v_y = (dy - 0.5*g*t^2)/t
  const t = flightTime(d, muzzle);
  const dy = targetY;
  const vy = (dy - 0.5 * 9.81 * gravityMul * t * t) / t;
  return Math.atan2(vy, muzzle);
}

/**
 * Compute whether a point is within a moving-target lead: time to reach target's
 * future position. Returns aim yaw offset to lead a target moving at speed v.
 */
export function leadAngle(speed: number, muzzle: number): number {
  return Math.atan2(speed, muzzle);
}