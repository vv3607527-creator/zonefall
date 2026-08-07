// world.ts — entity storage + spatial grid for the authoritative simulation.

import { WORLD_SEED } from '../../shared/src/consts.ts';
import { SpatialGrid } from '../../shared/src/grid.ts';
import { terrainHeight, waterLevelAt } from '../../shared/src/worldgen.ts';
import type { CrateEntity, EntityId, ItemEntity, PlayerEntity, VehicleEntity } from '../../shared/src/types.ts';
import type { Projectile } from '../../shared/src/ballistics.ts';

export class World {
  players = new Map<EntityId, PlayerEntity>();
  items = new Map<EntityId, ItemEntity>();
  vehicles = new Map<EntityId, VehicleEntity>();
  crates = new Map<EntityId, CrateEntity>();
  /** Projectiles keyed by their own entity ids. */
  bullets = new Map<EntityId, Projectile>();

  gridPlayers = new SpatialGrid<PlayerEntity>(48);
  gridItems = new SpatialGrid<ItemEntity>(32);
  gridVehicles = new SpatialGrid<VehicleEntity>(48);

  private next: EntityId = 1;

  nextId(): EntityId {
    return this.next++;
  }

  heightAt(x: number, z: number): number {
    return terrainHeight(x, z, WORLD_SEED);
  }

  waterAt(x: number, z: number): number {
    return waterLevelAt(x, z, WORLD_SEED);
  }

  rebuildGrids(): void {
    this.gridPlayers.clear();
    for (const p of this.players.values()) this.gridPlayers.insert(p.pos.x, p.pos.z, p);
    this.gridItems.clear();
    for (const i of this.items.values()) this.gridItems.insert(i.pos.x, i.pos.z, i);
    this.gridVehicles.clear();
    for (const v of this.vehicles.values()) this.gridVehicles.insert(v.pos.x, v.pos.z, v);
  }

  alivePlayers(): PlayerEntity[] {
    const out: PlayerEntity[] = [];
    for (const p of this.players.values()) if (p.alive) out.push(p);
    return out;
  }

  countAlive(): number {
    let n = 0;
    for (const p of this.players.values()) if (p.alive) n++;
    return n;
  }

  allPlayers(): PlayerEntity[] {
    return [...this.players.values()];
  }

  /** Wipe all entities for a fresh round. Entity ids stay monotonic. */
  reset(): void {
    this.players.clear();
    this.items.clear();
    this.vehicles.clear();
    this.crates.clear();
    this.bullets.clear();
    this.gridPlayers.clear();
    this.gridItems.clear();
    this.gridVehicles.clear();
  }
}