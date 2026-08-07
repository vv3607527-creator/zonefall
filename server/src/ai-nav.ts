// ai-nav.ts — waypoint navigation for bots: a coarse passability grid over the
// island plus A* pathfinding. Bots re-route at low cadence; paths are kept
// short (a few hundred meters) so per-tick cost stays trivial.

import { WORLD_SIZE, WORLD_SEED } from '../../shared/src/consts.ts';
import { terrainHeight, waterLevelAt, buildDensityAt } from '../../shared/src/worldgen.ts';
import { clamp } from '../../shared/src/math.ts';

/** Meters per nav cell. 64m => 64x64 nodes over the 4096m island. */
export const NAV_CELL = 64;
export const NAV_COLS = Math.ceil(WORLD_SIZE / NAV_CELL);

const LAND = 0;
const WATER = 1;
const BLOCKED = 2;

export class NavGraph {
  private cells = new Uint8Array(NAV_COLS * NAV_COLS);

  constructor() {
    for (let cz = 0; cz < NAV_COLS; cz++) {
      for (let cx = 0; cx < NAV_COLS; cx++) {
        const wx = this.worldX(cx);
        const wz = this.worldZ(cz);
        const water = waterLevelAt(wx, wz, WORLD_SEED);
        if (water > 0.4) {
          this.cells[cz * NAV_COLS + cx] = WATER;
          continue;
        }
        // Dense building clusters are treated as irregular ground: bots can
        // still path around them by preferring lower-density neighbor cells
        // during A* (see costFor). Mark building-saturated cells blocked.
        this.cells[cz * NAV_COLS + cx] = buildDensityAt(wx, wz) > 0.85 ? BLOCKED : LAND;
      }
    }
  }

  private worldX(cx: number): number {
    return -WORLD_SIZE / 2 + (cx + 0.5) * NAV_CELL;
  }

  private worldZ(cz: number): number {
    return -WORLD_SIZE / 2 + (cz + 0.5) * NAV_CELL;
  }

  private cellIndex(cx: number, cz: number): number {
    return cz * NAV_COLS + cx;
  }

  private inBounds(cx: number, cz: number): boolean {
    return cx >= 0 && cx < NAV_COLS && cz >= 0 && cz < NAV_COLS;
  }

  passable(cx: number, cz: number): boolean {
    return this.inBounds(cx, cz) && this.cells[this.cellIndex(cx, cz)] === LAND;
  }

  /** Snap a world coordinate to the nearest passable cell center. */
  toNodeCenter(x: number, z: number): { x: number; z: number } {
    const cx = clamp(Math.floor((x + WORLD_SIZE / 2) / NAV_CELL), 0, NAV_COLS - 1);
    const cz = clamp(Math.floor((z + WORLD_SIZE / 2) / NAV_CELL), 0, NAV_COLS - 1);
    return { x: this.worldX(cx), z: this.worldZ(cz) };
  }

  private costFor(cx: number, cz: number): number {
    if (!this.passable(cx, cz)) return Infinity;
    // Slight penalty for building-dense cells so paths prefer open ground.
    const wx = this.worldX(cx);
    const wz = this.worldZ(cz);
    const slope = Math.abs(terrainHeight(wx, wz, WORLD_SEED) - terrainHeight(wx + NAV_CELL, wz, WORLD_SEED)) / NAV_CELL;
    return 1 + buildDensityAt(wx, wz) * 1.2 + slope * 2.5;
  }

  /**
   * A* over the 8-connected grid. Returns a list of world-space waypoints
   * (cell centers, current cell first, goal last) or null when unreachable.
   */
  path(fromX: number, fromZ: number, toX: number, toZ: number): { x: number; z: number }[] | null {
    const scx = clamp(Math.floor((fromX + WORLD_SIZE / 2) / NAV_CELL), 0, NAV_COLS - 1);
    const scz = clamp(Math.floor((fromZ + WORLD_SIZE / 2) / NAV_CELL), 0, NAV_COLS - 1);
    const gcx = clamp(Math.floor((toX + WORLD_SIZE / 2) / NAV_CELL), 0, NAV_COLS - 1);
    const gcz = clamp(Math.floor((toZ + WORLD_SIZE / 2) / NAV_CELL), 0, NAV_COLS - 1);
    if (scx === gcx && scz === gcz) return [{ x: toX, z: toZ }];

    const open: number[] = [this.cellIndex(scx, scz)];
    const gScore = new Float32Array(NAV_COLS * NAV_COLS).fill(Infinity);
    const fScore = new Float32Array(NAV_COLS * NAV_COLS).fill(Infinity);
    const came = new Int32Array(NAV_COLS * NAV_COLS).fill(-1);
    const closed = new Uint8Array(NAV_COLS * NAV_COLS);
    const goal = this.cellIndex(gcx, gcz);
    gScore[open[0]] = 0;
    fScore[open[0]] = this.heuristic(scx, scz, gcx, gcz);

    while (open.length > 0) {
      // Pop lowest fScore (linear scan; graph is small).
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (fScore[open[i]] < fScore[open[bi]]) bi = i;
      const cur = open.splice(bi, 1)[0];
      if (cur === goal) break;
      if (closed[cur]) continue;
      closed[cur] = 1;

      const ccx = cur % NAV_COLS;
      const ccz = Math.floor(cur / NAV_COLS);
      for (let dcz = -1; dcz <= 1; dcz++) {
        for (let dcx = -1; dcx <= 1; dcx++) {
          if (dcx === 0 && dcz === 0) continue;
          const ncx = ccx + dcx;
          const ncz = ccz + dcz;
          if (!this.inBounds(ncx, ncz)) continue;
          // Diagonal: block if both orthogonal neighbors are impassable (no wall-corner cuts).
          if (dcx !== 0 && dcz !== 0) {
            if (!this.passable(ccx + dcx, ccz) && !this.passable(ccx, ccz + dcz)) continue;
          }
          const n = this.cellIndex(ncx, ncz);
          if (closed[n]) continue;
          const cost = this.costFor(ncx, ncz);
          if (!isFinite(cost)) continue;
          const diag = dcx !== 0 && dcz !== 0;
          const tentative = gScore[cur] + (diag ? NAV_CELL * 1.4142 : NAV_CELL) * cost;
          if (tentative < gScore[n]) {
            gScore[n] = tentative;
            fScore[n] = tentative + this.heuristic(ncx, ncz, gcx, gcz);
            came[n] = cur;
            open.push(n);
          }
        }
      }
    }

    if (came[goal] === -1) return null;
    // Reconstruct path (goal → start), then reverse.
    const cells: number[] = [];
    for (let c = goal; c !== -1; c = came[c]) cells.push(c);
    cells.reverse();
    // Skip cell centers that are within reach; return the tail waypoints.
    if (cells.length <= 1) return [{ x: toX, z: toZ }];
    const pts: { x: number; z: number }[] = [];
    for (let i = 1; i < cells.length; i++) {
      const cx = cells[i] % NAV_COLS;
      const cz = Math.floor(cells[i] / NAV_COLS);
      pts.push({ x: this.worldX(cx), z: this.worldZ(cz) });
    }
    // Last waypoint = exact destination.
    pts[pts.length - 1] = { x: toX, z: toZ };
    return pts;
  }

  private heuristic(ax: number, az: number, bx: number, bz: number): number {
    const dx = Math.abs(ax - bx);
    const dz = Math.abs(az - bz);
    return (dx + dz) + (Math.sqrt(2) - 2) * Math.min(dx, dz);
  }
}

/** Shared instance — the terrain is immutable for a fixed seed. */
export const NAVGRAPH = new NavGraph();

/** Basic follow: pick the first waypoint at least `reach` meters ahead. */
export function nextWaypoint(
  path: { x: number; z: number }[] | null,
  pos: { x: number; z: number },
  reach = 8,
): { x: number; z: number } | null {
  if (!path || path.length === 0) return null;
  for (const p of path) {
    if (Math.hypot(p.x - pos.x, p.z - pos.z) > reach) return p;
  }
  return path[path.length - 1];
}