// regions.ts — the 12 original themed regions of Isla Aurelia, placed on the
// 4096x4096 map. `center` is (x, z). Colors are the base palette for each biome.

import type { Vec3 } from './math.ts';

export type Biome =
  | 'coastal-city'
  | 'industrial'
  | 'mountain'
  | 'forest'
  | 'desert'
  | 'snow'
  | 'airport'
  | 'harbor'
  | 'observatory'
  | 'research'
  | 'river'
  | 'plains';

export interface RegionDef {
  /** Internal id. */
  id: string;
  /** Display name. */
  name: string;
  biome: Biome;
  /** Map-space center (x, z) — x is +X, z is +Z. */
  cx: number;
  cz: number;
  radius: number;
  /** Vertical tint color for the terrain base. */
  tint: [number, number, number];
  /** Building style / density 0..1. */
  buildDensity: number;
  /** Vegetation density 0..1. */
  vegDensity: number;
  /** Loot multiplier (rarer regions are sparser). */
  loot: number;
  /** Mountain influence 0..1 (raises + roughens terrain). */
  mountain: number;
  /** Water coverage 0..1 (used by water plane carving). */
  water: number;
  /** Flatness — flattens terrain toward a plateau; useful for cities. */
  flatness: number;
}

export const SEA_LEVEL_ABS = 0;

/** Midpoint of the whole island center — used by lots of systems. */
export const ISLAND_CENTER_X = 2048;
export const ISLAND_CENTER_Z = 2096;

// The island is roughly elliptical; region coordinates chosen on a hand-tuned
// layout that reads like a believable archipelago.
export const REGIONS: readonly RegionDef[] = [
  {
    id: 'aurelia-springs',
    name: 'Aurelia Springs',
    biome: 'coastal-city',
    cx: 2450, cz: 2380, radius: 620,
    tint: [0.72, 0.74, 0.7], buildDensity: 0.85, vegDensity: 0.25,
    loot: 0.75, mountain: 0, flatness: 0.96, water: 0.08,
  },
  {
    id: 'ironworks',
    name: 'Ironworks District',
    biome: 'industrial',
    cx: 1600, cz: 2680, radius: 480,
    tint: [0.55, 0.56, 0.58], buildDensity: 0.6, vegDensity: 0.15,
    loot: 0.8, mountain: 0.05, flatness: 0.9, water: 0.02,
  },
  {
    id: 'silverpine',
    name: 'Silverpine Ridge',
    biome: 'mountain',
    cx: 1380, cz: 1500, radius: 520,
    tint: [0.62, 0.66, 0.64], buildDensity: 0.35, vegDensity: 0.5,
    loot: 0.55, mountain: 0.85, flatness: 0, water: 0,
  },
  {
    id: 'verdant-hollow',
    name: 'Verdant Hollow',
    biome: 'forest',
    cx: 2250, cz: 1320, radius: 480,
    tint: [0.5, 0.62, 0.44], buildDensity: 0.12, vegDensity: 0.95,
    loot: 0.5, mountain: 0.1, flatness: 0.15, water: 0.05,
  },
  {
    id: 'sunfang',
    name: 'Sunfang Plateau',
    biome: 'desert',
    cx: 480, cz: 2050, radius: 520,
    tint: [0.86, 0.78, 0.6], buildDensity: 0.2, vegDensity: 0.02,
    loot: 0.6, mountain: 0.15, flatness: 0.55, water: 0,
  },
  {
    id: 'frostline',
    name: 'Frostline Summit',
    biome: 'snow',
    cx: 3480, cz: 1280, radius: 500,
    tint: [0.9, 0.92, 0.95], buildDensity: 0.25, vegDensity: 0.3,
    loot: 0.6, mountain: 0.9, flatness: 0, water: 0.04,
  },
  {
    id: 'aurelia-intl',
    name: 'Aurelia International',
    biome: 'airport',
    cx: 1000, cz: 860, radius: 620,
    tint: [0.66, 0.66, 0.64], buildDensity: 0.55, vegDensity: 0.05,
    loot: 0.8, mountain: 0, flatness: 1, water: 0,
  },
  {
    id: 'gullhaven',
    name: 'Gullhaven Port',
    biome: 'harbor',
    cx: 3120, cz: 2930, radius: 430,
    tint: [0.6, 0.63, 0.65], buildDensity: 0.5, vegDensity: 0.1,
    loot: 0.7, mountain: 0, flatness: 0.85, water: 0.3,
  },
  {
    id: 'celeste',
    name: 'Celeste Observatory',
    biome: 'observatory',
    cx: 2960, cz: 560, radius: 300,
    tint: [0.68, 0.7, 0.72], buildDensity: 0.45, vegDensity: 0.3,
    loot: 0.7, mountain: 0.55, flatness: 0, water: 0,
  },
  {
    id: 'meridian',
    name: 'Meridian Research',
    biome: 'research',
    cx: 830, cz: 3200, radius: 320,
    tint: [0.58, 0.62, 0.66], buildDensity: 0.5, vegDensity: 0.3,
    loot: 0.9, mountain: 0.05, flatness: 0.3, water: 0.1,
  },
  {
    id: 'ember-river',
    name: 'Ember River',
    biome: 'river',
    cx: 1900, cz: 2150, radius: 300,
    tint: [0.45, 0.52, 0.6], buildDensity: 0.02, vegDensity: 0.4,
    loot: 0.45, mountain: 0, flatness: 0, water: 1,
  },
  {
    id: 'hollow-plains',
    name: 'Hollow Plains',
    biome: 'plains',
    cx: 2850, cz: 1900, radius: 600,
    tint: [0.68, 0.72, 0.58], buildDensity: 0.05, vegDensity: 0.6,
    loot: 0.55, mountain: 0, flatness: 0.4, water: 0.05,
  },
];

const REGION_BY_ID = new Map(REGIONS.map((r) => [r.id, r] as const));

export function regionById(id: string): RegionDef | undefined {
  return REGION_BY_ID.get(id);
}

/** Distance from point to nearest region center (used for paint blending). */
export function nearestRegion(dx: number, dz: number): { region: RegionDef; dist: number } {
  let best = REGIONS[0];
  let bestD = Infinity;
  for (const r of REGIONS) {
    const d = Math.hypot(dx - r.cx, dz - r.cz);
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return { region: best, dist: bestD };
}

/** Weight of region at a point (gaussian falloff). 1.0 at center. */
export function regionWeight(r: RegionDef, dx: number, dz: number): number {
  const d = Math.hypot(dx - r.cx, dz - r.cz);
  const s = r.radius * 0.6;
  return Math.exp(-(d * d) / (2 * s * s));
}