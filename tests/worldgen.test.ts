// worldgen.test.ts — deterministic terrain, water, spawn sampling, densities.
import { describe, it, expect } from 'vitest';
import {
  terrainHeight, waterLevelAt, sampleIslandPoint, vegDensityAt, buildDensityAt,
} from '../shared/src/worldgen.ts';
import { SEA_LEVEL, WORLD_SIZE, WORLD_SEED } from '../shared/src/consts.ts';
import { Rng } from '../shared/src/rng.ts';

const SEED = WORLD_SEED;

describe('terrainHeight', () => {
  it('is deterministic given the seed', () => {
    expect(terrainHeight(1234, 2345, SEED)).toBe(terrainHeight(1234, 2345, SEED));
  });

  it('changes with position and seed', () => {
    // Deep inside the island where terrain actually varies.
    const a = terrainHeight(1900, 2000, SEED);
    const b = terrainHeight(2200, 2000, SEED);
    const c = terrainHeight(1900, 2000, SEED + 1);
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  it('is above sea level near the island center', () => {
    const h = terrainHeight(WORLD_SIZE / 2, WORLD_SIZE / 2 + 48, SEED);
    expect(h).toBeGreaterThan(SEA_LEVEL);
  });

  it('sinks below sea level far outside the island', () => {
    const h = terrainHeight(-3000, -3000, SEED);
    expect(h).toBeLessThan(SEA_LEVEL);
  });
});

describe('waterLevelAt', () => {
  it('returns either none or the river level', () => {
    for (const [x, z] of [[2048, 2048], [500, 500], [3000, 1000], [1000, 3000]] as const) {
      const w = waterLevelAt(x, z, SEED);
      expect(w === 0 || w === SEA_LEVEL + 0.35).toBe(true);
    }
  });
});

describe('sampleIslandPoint', () => {
  it('returns points on dry land inside the island', () => {
    const rng = new Rng(5);
    for (let i = 0; i < 20; i++) {
      const p = sampleIslandPoint(SEED, rng, 150);
      expect(p.y).toBeGreaterThan(SEA_LEVEL + 0.5);
      expect(Math.abs(p.x)).toBeLessThanOrEqual(WORLD_SIZE / 2);
      expect(Math.abs(p.z)).toBeLessThanOrEqual(WORLD_SIZE / 2);
    }
  });
});

describe('vegDensityAt / buildDensityAt', () => {
  it('stay within [0, 1] across the map', () => {
    const rng = new Rng(6);
    for (let i = 0; i < 40; i++) {
      const x = rng.range(0, WORLD_SIZE);
      const z = rng.range(0, WORLD_SIZE);
      const v = vegDensityAt(x, z, SEED);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      const b = buildDensityAt(x, z);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(1);
    }
  });

  it('is dense in a city region', () => {
    const d = buildDensityAt(2450, 2380); // Aurelia Springs center
    expect(d).toBeGreaterThan(0.5);
  });
});
