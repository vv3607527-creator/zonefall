// rng.test.ts — deterministic seeded PRNG behavior.
import { describe, it, expect } from 'vitest';
import { Rng } from '../shared/src/rng.ts';

describe('Rng', () => {
  it('is deterministic for the same seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const seqA = Array.from({ length: 100 }, () => a.next());
    const seqB = Array.from({ length: 100 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different streams for different seeds', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    expect(a.next()).not.toBe(b.next());
  });

  it('next() stays in [0, 1)', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('range(a, b) stays in [a, b)', () => {
    const rng = new Rng(9);
    for (let i = 0; i < 1000; i++) {
      const v = rng.range(-5, 12);
      expect(v).toBeGreaterThanOrEqual(-5);
      expect(v).toBeLessThan(12);
    }
  });

  it('int(a, b) is an integer within [a, b] inclusive', () => {
    const rng = new Rng(11);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(2, 8);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(8);
      seen.add(v);
    }
    // All values in range reachable over many draws.
    expect(seen.size).toBe(7);
  });

  it('pick returns a member of the array', () => {
    const rng = new Rng(13);
    const arr = ['a', 'b', 'c', 'd'];
    for (let i = 0; i < 200; i++) {
      expect(arr).toContain(rng.pick(arr));
    }
  });

  it('chance respects probability endpoints', () => {
    const rng = new Rng(17);
    expect(rng.chance(1)).toBe(true);
    expect(rng.chance(0)).toBe(false);
  });

  it('hash01 is deterministic and in [0, 1)', () => {
    expect(Rng.hash01(5)).toBe(Rng.hash01(5));
    expect(Rng.hash01(5)).not.toBe(Rng.hash01(6));
    for (let i = -10; i < 10; i++) {
      const v = Rng.hash01(i);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
