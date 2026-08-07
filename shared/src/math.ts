// math.ts — minimal immutable vector + angle math shared by server and client.
// All functions return new values; never mutate inputs.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Vec2 {
  x: number;
  z: number;
}

export const VEC3_ZERO: Vec3 = { x: 0, y: 0, z: 0 };

export function v3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function v3clone(v: Vec3): Vec3 {
  return { x: v.x, y: v.y, z: v.z };
}

export function v3add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function v3sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function v3scale(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

export function v3mul(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x * b.x, y: a.y * b.y, z: a.z * b.z };
}

export function v3len(a: Vec3): number {
  return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
}

export function v3dist(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function v3distXZ(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

export function v3norm(a: Vec3): Vec3 {
  const l = v3len(a);
  if (l < 1e-9) return v3(0, 0, 0);
  return v3scale(a, 1 / l);
}

/** Direction from yaw (radians, 0 = +X axis, CCW) + pitch (radians, 0 = flat). */
export function dirFromAngles(yaw: number, pitch: number): Vec3 {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  return { x: cy * cp, y: sp, z: sy * cp };
}

/** Yaw angle of a vector (radians), 0 = +X axis, matches dirFromAngles. */
export function yawOf(dir: Vec3): number {
  return Math.atan2(dir.z, dir.x);
}

export function pitchOf(dir: Vec3): number {
  return Math.atan2(dir.y, Math.hypot(dir.x, dir.z));
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function clampMag(v: number, max: number): number {
  return clamp(v, -max, max);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function saturate(t: number): number {
  return clamp(t, 0, 1);
}

/** Shortest signed angular difference from a to b (radians), result in [-PI, PI]. */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function lerpAngle(a: number, b: number, t: number): number {
  return a + angleDiff(a, b) * saturate(t);
}

export function nearly(a: number, b: number, eps = 1e-4): boolean {
  return Math.abs(a - b) < eps;
}

/**
 * Ballistic drop: vertical offset of a projectile after time t under gravity.
 */
export function dropAtTime(gravity: number, t: number): number {
  return 0.5 * gravity * t * t;
}

/** Time for a projectile traveling at speed v to cover horizontal distance d (ignoring drag). */
export function timeToDistance(d: number, vel: number): number {
  return d / vel;
}

/**
 * Ray/segment — axis-aligned segment intersection adapted for entity AABB checks.
 * Returns parametric t in [0,1] or -1.
 * Segment from `from` by `dir` (unit) of length `len`.
 */
export function rayAabb(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  minx: number, miny: number, minz: number,
  maxx: number, maxy: number, maxz: number,
): number {
  let tmin = 0;
  let tmax = 1;
  const seg = (o: number, d: number, mn: number, mx: number) => {
    if (Math.abs(d) < 1e-9) {
      if (o < mn || o > mx) return false;
      return true;
    }
    let t1 = (mn - o) / d;
    let t2 = (mx - o) / d;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    return tmin <= tmax;
  };
  if (!seg(ox, dx, minx, maxx)) return -1;
  if (!seg(oy, dy, miny, maxy)) return -1;
  if (!seg(oz, dz, minz, maxz)) return -1;
  return tmin;
}

export function distToSegmentXZ(
  px: number, pz: number,
  ax: number, az: number,
  bx: number, bz: number,
): number {
  const abx = bx - ax;
  const abz = bz - az;
  const len2 = abx * abx + abz * abz;
  if (len2 < 1e-9) return Math.hypot(px - ax, pz - az);
  let t = ((px - ax) * abx + (pz - az) * abz) / len2;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t));
}