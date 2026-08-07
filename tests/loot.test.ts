// loot.test.ts — procedural loot tables.
import { describe, it, expect } from 'vitest';
import { rollWeapon, rollItem, rollLoot, lootRegionAt } from '../shared/src/loot.ts';
import { Rng } from '../shared/src/rng.ts';
import { weaponById } from '../shared/src/weapons.ts';
import { itemById } from '../shared/src/items.ts';
import { REGIONS } from '../shared/src/regions.ts';

describe('rollWeapon', () => {
  it('returns a valid weapon entry with magazine ammo', () => {
    const rng = new Rng(1);
    for (let i = 0; i < 100; i++) {
      const e = rollWeapon(rng, null);
      expect(e.weapon).toBe(true);
      const w = weaponById(Number(e.defId));
      expect(w).toBeDefined();
      expect(e.count).toBe(w!.mag);
      expect(e.rarity).toBe(w!.rarity);
      expect(e.rarity).toBeGreaterThanOrEqual(0);
      expect(e.rarity).toBeLessThanOrEqual(3);
    }
  });

  it('never rolls melee weapons', () => {
    const rng = new Rng(2);
    for (let i = 0; i < 200; i++) {
      const e = rollWeapon(rng, null);
      expect(weaponById(Number(e.defId))!.category).not.toBe('melee');
    }
  });
});

describe('rollItem', () => {
  it('returns a valid item entry', () => {
    const rng = new Rng(3);
    for (let i = 0; i < 100; i++) {
      const e = rollItem(rng, null);
      const item = itemById(e.defId);
      expect(item).toBeDefined();
      expect(e.count).toBe(item!.stack);
    }
  });
});

describe('rollLoot', () => {
  it('produces both weapons and items over many rolls', () => {
    const rng = new Rng(4);
    let weapons = 0;
    let items = 0;
    for (let i = 0; i < 500; i++) {
      const e = rollLoot(rng, null);
      if (e.weapon) weapons++;
      else items++;
    }
    expect(weapons).toBeGreaterThan(100);
    expect(items).toBeGreaterThan(50);
  });
});

describe('lootRegionAt', () => {
  it('resolves the region nearest a known center', () => {
    const springs = REGIONS.find((r) => r.id === 'aurelia-springs')!;
    const r = lootRegionAt(springs.cx, springs.cz);
    expect(r).toBeDefined();
    expect(r!.id).toBe('aurelia-springs');
  });

  it('returns null or a region for remote corners', () => {
    const r = lootRegionAt(-1900, -1900);
    expect(r === null || r.id.length > 0).toBe(true);
  });
});
