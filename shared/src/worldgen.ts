// worldgen.ts — deterministic terrain height + biome paint + spawn sampling.
// Used by the server (physics, nav) and the client (terrain mesh, props).

import { fbm, ridge } from './noise.ts';
import { REGIONS, regionWeight, type RegionDef } from './regions.ts';
import { SEA_LEVEL, WORLD_SIZE } from './consts.ts';
import type { Vec3 } from './math.ts';

export const HEIGHT_SCALE = 190;   // max hill height above sea level
export const MTN_SCALE = 240;      // mountain lift

/**
 * Terrain height at world (x, z). Deterministic given seed.
 * Blends: island falloff + rolling hills + mountain ridges + region flattening.
 */
export function terrainHeight(x: number, z: number, seed: number): number {
  // Island falloff: elliptical mask with soft coast.
  const nx = (x - WORLD_SIZE / 2) / (WORLD_SIZE / 2);
  const nz = (z - WORLD_SIZE / 2 + 48) / (WORLD_SIZE / 2 * 1.02);
  const d = Math.hypot(nx, nz);
  const island = 1 - Math.pow(Math.min(1, d), 2.6);
  if (island <= 0) return SEA_LEVEL - 12;

  // Rolling base hills.
  const base = fbm(x / 520, z / 520, seed, 4) * HEIGHT_SCALE;

  // Mountain ridges (silverpine + frostline + celeste peaks).
  let mtn = 0;
  for (const r of REGIONS) {
    if (r.mountain <= 0) continue;
    const w = regionWeight(r, x, z);
    const rv = ridge((x + r.cx) / 260, (z + r.cz) / 260, seed + 31, 3);
    mtn += w * rv * MTN_SCALE * r.mountain;
  }

  // Flatten city/airport plateaus.
  let flat = 0;
  for (const r of REGIONS) {
    if (r.flatness <= 0) continue;
    const w = regionWeight(r, x, z);
    flat = Math.max(flat, w * r.flatness);
  }
  const h = base + mtn * (1 - flat * 0.85);
  return SEA_LEVEL + h * island;
}

/** Water height for rivers/lakes/ocean. Returns water level (0 = none). */
export function waterLevelAt(x: number, z: number, seed: number): number {
  // Ember river band through the middle of the island.
  let w = 0;
  for (const r of REGIONS) {
    if (r.water <= 0) continue;
    const rw = regionWeight(r, x, z);
    w = Math.max(w, rw * r.water);
  }
  if (w > 0.25) return SEA_LEVEL + 0.35;
  // Open ocean: any point whose terrain is below sea level is water, so bots
  // can parachute onto it and swim — matches the client's full-map sea plane.
  return terrainHeight(x, z, seed) < SEA_LEVEL ? SEA_LEVEL + 0.35 : 0;
}

/** Sample points (x, z) inside the island for spawns/loot. */
export function sampleIslandPoint(
  seed: number,
  rng: { next(): number },
  margin = 150,
): Vec3 {
  const half = WORLD_SIZE / 2 - margin;
  for (let i = 0; i < 24; i++) {
    const x = -half + rng.next() * half * 2;
    const z = -half + rng.next() * half * 2;
    const h = terrainHeight(x, z, seed);
    if (h > SEA_LEVEL + 0.5) {
      const wl = waterLevelAt(x, z, seed);
      if (wl > 0) continue; // no spawns in rivers
      return { x, y: h, z };
    }
  }
  return { x: 0, y: terrainHeight(0, 0, seed), z: 0 };
}

/** Vegetation density at a point (0..1). */
export function vegDensityAt(x: number, z: number, seed: number): number {
  let v = 0;
  for (const r of REGIONS) {
    v += regionWeight(r, x, z) * r.vegDensity;
  }
  const n = fbm(x / 160, z / 160, seed + 77, 2);
  return Math.min(1, v * (0.4 + n * 0.8));
}

/** Building density at a point (0..1). */
export function buildDensityAt(x: number, z: number): number {
  let v = 0;
  for (const r of REGIONS) {
    v += regionWeight(r, x, z) * r.buildDensity;
  }
  return Math.min(1, v);
}