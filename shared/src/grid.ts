// grid.ts — uniform spatial hash grid for broadphase queries (server + client).

export class SpatialGrid<T> {
  private cell: number;
  private buckets = new Map<number, T[]>();

  constructor(cellSize = 32) {
    this.cell = cellSize;
  }

  clear(): void {
    this.buckets.clear();
  }

  private key(cx: number, cz: number): number {
    return (cx + 128) * 4096 + (cz + 128);
  }

  insert(x: number, z: number, item: T): void {
    const k = this.key(Math.floor(x / this.cell), Math.floor(z / this.cell));
    let b = this.buckets.get(k);
    if (!b) {
      b = [];
      this.buckets.set(k, b);
    }
    b.push(item);
  }

  /** All items in cells overlapping the AABB. */
  query(minX: number, minZ: number, maxX: number, maxZ: number): T[] {
    const out: T[] = [];
    const c0x = Math.floor(minX / this.cell);
    const c0z = Math.floor(minZ / this.cell);
    const c1x = Math.floor(maxX / this.cell);
    const c1z = Math.floor(maxZ / this.cell);
    for (let cx = c0x; cx <= c1x; cx++) {
      for (let cz = c0z; cz <= c1z; cz++) {
        const b = this.buckets.get(this.key(cx, cz));
        if (b) out.push(...b);
      }
    }
    return out;
  }

  /** All items within radius r of (x, z) — distance verified. */
  queryCircle(x: number, z: number, r: number, distFn?: (item: T, x: number, z: number) => number): T[] {
    const cand = this.query(x - r, z - r, x + r, z + r);
    if (!distFn) return cand;
    return cand.filter((it) => distFn(it, x, z) <= r);
  }

  get size(): number {
    return this.buckets.size;
  }
}