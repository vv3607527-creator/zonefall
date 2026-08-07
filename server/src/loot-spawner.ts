// loot-spawner.ts — scatters weapons, items, ammo and crates across the island
// deterministically from the match seed. Density follows region tables.

import { Rng } from '../../shared/src/rng.ts';
import { v3 } from '../../shared/src/math.ts';
import { rollLoot, lootRegionAt } from '../../shared/src/loot.ts';
import { ammoItemFor, ITEM_BY_ID } from '../../shared/src/items.ts';
import { WEAPONS, weaponById } from '../../shared/src/weapons.ts';
import { WORLD_SIZE, WORLD_SEED } from '../../shared/src/consts.ts';
import { buildDensityAt, terrainHeight, waterLevelAt } from '../../shared/src/worldgen.ts';
import type { CrateEntity, ItemEntity } from '../../shared/src/types.ts';
import type { World } from './world.ts';

/** Spawn all ground loot + crates. Returns the item count spawned. */
export function spawnLoot(world: World, seed: number): number {
  const rng = new Rng(seed ^ 0x51ab3f2d);
  let count = 0;

  const points = Math.round((WORLD_SIZE * WORLD_SIZE) / 3400); // ~4900 spawn points
  for (let i = 0; i < points; i++) {
    // World coordinates: the island spans 0..WORLD_SIZE (centered at
    // WORLD_SIZE/2), NOT -half..half — origin-centered rolls put every
    // pickup in the ocean off the island's south-west quadrant.
    const x = rng.range(0, WORLD_SIZE);
    const z = rng.range(0, WORLD_SIZE);
    const h = terrainHeight(x, z, WORLD_SEED);
    const wl = waterLevelAt(x, z, WORLD_SEED);
    if (wl > 0.5) continue; // no loot in deep water
    const build = buildDensityAt(x, z);
    // Loot clusters near buildings; sparse in open fields.
    const chance = 0.35 + build * 0.45;
    if (rng.next() > chance) continue;

    const region = lootRegionAt(x, z);
    const entry = rollLoot(rng, region);
    const defId = entry.defId;
    let countV = entry.count;
    // Weapons drop with a partial mag; ammo nearby to bootstrap fights.
    if (entry.weapon) {
      countV = Math.max(1, Math.round(countV * 0.6));
    }
    const id = world.nextId();
    const item: ItemEntity = {
      id,
      kind: 'item',
      pos: v3(x, h + 0.35, z),
      alive: true,
      defId,
      rarity: entry.rarity,
      count: countV,
      fromCrate: false,
    };
    world.items.set(id, item);
    count++;

    // Ammo for the weapon spawns as a secondary pickup 40% of the time.
    if (entry.weapon) {
      const w = weaponById(Number(defId));
      if (w && w.ammo !== 'none') {
        const ammoId = ammoItemFor(w.ammo);
        if (ITEM_BY_ID.has(ammoId)) {
          const a = world.nextId();
          world.items.set(a, {
            id: a,
            kind: 'item',
            pos: v3(x + rng.range(-1.2, 1.2), h + 0.35, z + rng.range(-1.2, 1.2)),
            alive: true,
            defId: ammoId,
            rarity: 0,
            count: w.mag * 2,
            fromCrate: false,
          });
          count++;
        }
      }
    }
  }

  // Supply crates: 26 spread across the map (airdrop-like but landed).
  const crateCount = 26;
  for (let i = 0; i < crateCount; i++) {
    // Same world-coordinate space as the ground loot above.
    const c = WORLD_SIZE * 0.85;
    const x = rng.range(WORLD_SIZE / 2 - c / 2, WORLD_SIZE / 2 + c / 2);
    const z = rng.range(WORLD_SIZE / 2 - c / 2, WORLD_SIZE / 2 + c / 2);
    const h = terrainHeight(x, z, WORLD_SEED);
    const id = world.nextId();
    const loot = [];
    const inner = new Rng(rng.int(0, 2 ** 31));
    for (let j = 0; j < 4; j++) {
      const e = rollLoot(inner, lootRegionAt(x, z));
      loot.push({ defId: e.defId, count: e.count, rarity: e.rarity });
    }
    const crate: CrateEntity = {
      id,
      kind: 'crate',
      pos: v3(x, h + 0.5, z),
      alive: true,
      loot,
    };
    world.crates.set(id, crate);
  }

  return count;
}

/** Drop a loot item at a position (used by crate looting). */
export function dropItem(world: World, pos: { x: number; z: number }, defId: string, count: number, rarity: number): void {
  const h = terrainHeight(pos.x, pos.z, WORLD_SEED);
  const id = world.nextId();
  world.items.set(id, {
    id,
    kind: 'item',
    pos: v3(pos.x, h + 0.35, pos.z),
    alive: true,
    defId,
    rarity,
    count,
    fromCrate: true,
  });
}
