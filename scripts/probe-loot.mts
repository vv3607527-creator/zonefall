// Diagnostic: where do loot items actually land, and does the spatial grid
// contain them? Distinguishes "loot off-island" (spawner bug) from "bot
// cannot see items" (grid/pickup bug).
import { World } from '../server/src/world.ts';
import { spawnLoot } from '../server/src/loot-spawner.ts';
import { ISLAND_CENTER_X, ISLAND_CENTER_Z } from '../shared/src/regions.ts';
import { initialZone } from '../shared/src/zone.ts';

for (const seed of [20205, 7, 9999]) {
  const world = new World();
  const placed = spawnLoot(world, seed);
  let onIsland = 0;
  let inZone = 0;
  let weapons = 0;
  let underwater = 0;
  for (const it of world.items.values()) {
    const { x, z } = it.pos;
    if (x >= 0 && x <= 4096 && z >= 0 && z <= 4096) onIsland++;
    const d = Math.hypot(x - ISLAND_CENTER_X, z - ISLAND_CENTER_Z);
    if (d <= 1200) inZone++;
    if (Number(it.defId) === Number(it.defId) && Number(it.defId) >= 1 && Number(it.defId) <= 28) weapons++;
    if (it.pos.y < 0.3) underwater++;
  }
  const z0 = initialZone(0);
  const gridCount = world.gridItems.queryCircle(2048, 2096, 5000).length;
  console.log(
    `seed=${seed} placed=${placed} worldItems=${world.items.size} onIsland=${onIsland} ` +
    `within1200mOfCenter=${inZone} weapons=${weapons} underwater=${underwater} gridItemsIn5kmCircle=${gridCount}`,
  );
}