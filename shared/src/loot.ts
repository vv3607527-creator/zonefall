// loot.ts — procedural loot tables: what spawns where, with rarity weighting.
// Deterministic from a seed. Regions modulate loot quality.

import { Rng } from './rng.ts';
import { WEAPONS, WEAPON_WEIGHTS } from './weapons.ts';
import { ITEMS } from './items.ts';
import { REGIONS, regionWeight, type RegionDef } from './regions.ts';

export interface LootEntry {
  defId: string;
  count: number;
  rarity: number;
  weapon?: boolean;
}

/** Weighted pick of a weapon for a loot roll. */
export function rollWeapon(rng: Rng, region: RegionDef | null): LootEntry {
  const weights = WEAPON_WEIGHTS[rng.int(0, 3)];
  const pool = WEAPONS.filter((w) => w.category !== 'melee');
  let total = 0;
  for (const w of pool) total += weights[w.rarity];
  let roll = rng.next() * total;
  for (const w of pool) {
    roll -= weights[w.rarity];
    if (roll <= 0) return { defId: String(w.id), count: w.mag, rarity: w.rarity, weapon: true };
  }
  const last = pool[pool.length - 1];
  return { defId: String(last.id), count: last.mag, rarity: last.rarity, weapon: true };
}

/** Weighted pick of an item (heal/armor/throwable/ammo). */
export function rollItem(rng: Rng, region: RegionDef | null): LootEntry {
  const items = ITEMS.filter((i) => i.kind !== 'armor' || i.rarity <= 2);
  const w = new Map<number, number>([
    [0, 10], [1, 6], [2, 3], [3, 1],
  ]);
  let total = 0;
  for (const i of items) total += (w.get(i.rarity) ?? 1) * (region ? region.loot : 1);
  let roll = rng.next() * total;
  for (const i of items) {
    roll -= (w.get(i.rarity) ?? 1) * (region ? region.loot : 1);
    if (roll <= 0) return { defId: i.id, count: i.stack, rarity: i.rarity };
  }
  const last = items[items.length - 1];
  return { defId: last.id, count: last.stack, rarity: last.rarity };
}

/** 70% weapons / 30% items per spawn point. */
export function rollLoot(rng: Rng, region: RegionDef | null): LootEntry {
  return rng.chance(0.7) ? rollWeapon(rng, region) : rollItem(rng, region);
}

/** Region governing a map point (for loot quality + style). */
export function lootRegionAt(x: number, z: number): RegionDef | null {
  let best: RegionDef | null = null;
  let bestW = 0;
  for (const r of REGIONS) {
    const w = regionWeight(r, x, z);
    if (w > bestW) {
      bestW = w;
      best = r;
    }
  }
  return bestW > 0.2 ? best : null;
}