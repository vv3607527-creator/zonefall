// grid.test.ts — spatial hash grid broadphase.
import { describe, it, expect } from 'vitest';
import { SpatialGrid } from '../shared/src/grid.ts';

interface Item { x: number; z: number; id: number }

describe('SpatialGrid', () => {
  it('inserts and queries within the AABB', () => {
    const g = new SpatialGrid<Item>(32);
    const a = { x: 10, z: 10, id: 1 };
    g.insert(a.x, a.z, a);
    expect(g.query(0, 0, 20, 20)).toContain(a);
    expect(g.query(100, 100, 120, 120)).not.toContain(a);
  });

  it('queries across cell boundaries', () => {
    const g = new SpatialGrid<Item>(32);
    const items = [
      { x: 31, z: 31, id: 1 },
      { x: 33, z: 33, id: 2 },
      { x: 64, z: 0, id: 3 },
    ];
    for (const it of items) g.insert(it.x, it.z, it);
    const found = g.query(30, 30, 40, 40);
    expect(found).toContain(items[0]);
    expect(found).toContain(items[1]);
    expect(found).not.toContain(items[2]);
  });

  it('queryCircle filters by distance when a distFn is given', () => {
    const g = new SpatialGrid<Item>(32);
    const near = { x: 10, z: 10, id: 1 };
    const far = { x: 30, z: 30, id: 2 };
    g.insert(near.x, near.z, near);
    g.insert(far.x, far.z, far);
    const found = g.queryCircle(0, 0, 20, (it) => Math.hypot(it.x, it.z));
    expect(found).toContain(near);
    expect(found).not.toContain(far);
  });

  it('returns all candidates without a distFn (broadphase only)', () => {
    const g = new SpatialGrid<Item>(32);
    const a = { x: 5, z: 5, id: 1 };
    g.insert(a.x, a.z, a);
    const found = g.queryCircle(0, 0, 50);
    expect(found).toContain(a);
  });

  it('clear empties the grid', () => {
    const g = new SpatialGrid<Item>(32);
    g.insert(5, 5, { x: 5, z: 5, id: 1 });
    expect(g.size).toBeGreaterThan(0);
    g.clear();
    expect(g.size).toBe(0);
    expect(g.query(0, 0, 10, 10)).toHaveLength(0);
  });
});
