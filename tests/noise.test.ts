// noise.test.ts — deterministic value noise, fBm and ridge.
import { describe, it, expect } from 'vitest';
import { hash2, valueNoise, fbm, ridge } from '../shared/src/noise.ts';

describe('hash2', () => {
  it('is deterministic and in [0, 1)', () => {
    expect(hash2(3, 4, 100)).toBe(hash2(3, 4, 100));
    const v = hash2(3, 4, 100);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  });

  it('changes with seed and coordinates', () => {
    expect(hash2(3, 4, 100)).not.toBe(hash2(4, 4, 100));
    expect(hash2(3, 4, 100)).not.toBe(hash2(3, 4, 101));
  });
});

describe('valueNoise', () => {
  it('outputs within [0, 1]', () => {
    for (let i = 0; i < 50; i++) {
      const v = valueNoise(i * 0.37, i * 0.91, 5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('is continuous (small input delta → small output delta)', () => {
    const a = valueNoise(10.5, 10.5, 5);
    const b = valueNoise(10.5001, 10.5, 5);
    expect(Math.abs(a - b)).toBeLessThan(0.001);
  });

  it('is deterministic', () => {
    expect(valueNoise(1.234, 5.678, 9)).toBe(valueNoise(1.234, 5.678, 9));
  });
});

describe('fbm', () => {
  it('outputs within [0, 1]', () => {
    for (let i = 0; i < 50; i++) {
      const v = fbm(i * 0.53, i * 0.29, 42);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic', () => {
    expect(fbm(3, 4, 42)).toBe(fbm(3, 4, 42));
    expect(fbm(3, 4, 42, 2, 2.5, 0.6)).toBe(fbm(3, 4, 42, 2, 2.5, 0.6));
  });
});

describe('ridge', () => {
  it('outputs within [0, 1] with sharp crests', () => {
    for (let i = 0; i < 50; i++) {
      const v = ridge(i * 0.61, i * 0.13, 77);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic', () => {
    expect(ridge(2, 3, 77)).toBe(ridge(2, 3, 77));
  });
});
