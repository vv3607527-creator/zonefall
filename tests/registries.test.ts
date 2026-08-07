// registries.test.ts — data integrity for weapons, items and vehicles.
import { describe, it, expect } from 'vitest';
import { WEAPONS, WEAPON_WEIGHTS, weaponById, weaponByCode, AMMO_LABEL } from '../shared/src/weapons.ts';
import { ITEMS, itemById, ammoItemFor, RARITY_LABEL, RARITY_COLOR } from '../shared/src/items.ts';
import { VEHICLES, vehicleById, VEHICLE_MAX_HP } from '../shared/src/vehicles.ts';
import { REGIONS } from '../shared/src/regions.ts';

describe('weapons registry', () => {
  it('has at least 28 weapons with unique ids and codes', () => {
    expect(WEAPONS.length).toBeGreaterThanOrEqual(28);
    const ids = new Set(WEAPONS.map((w) => w.id));
    const codes = new Set(WEAPONS.map((w) => w.code));
    expect(ids.size).toBe(WEAPONS.length);
    expect(codes.size).toBe(WEAPONS.length);
  });

  it('has sane ballistics on every weapon', () => {
    for (const w of WEAPONS) {
      expect(w.name.length).toBeGreaterThan(0);
      expect(w.rarity).toBeGreaterThanOrEqual(0);
      expect(w.rarity).toBeLessThanOrEqual(3);
      expect(w.dmg).toBeGreaterThan(0);
      if (w.category === 'melee') {
        // Melee has no ballistic properties by design.
        expect(w.spread).toBeGreaterThanOrEqual(0);
        expect(AMMO_LABEL[w.ammo]).toBeDefined();
        continue;
      }
      expect(w.rpm).toBeGreaterThan(0);
      expect(w.mag).toBeGreaterThan(0);
      expect(w.reload).toBeGreaterThan(0);
      expect(w.muzzle).toBeGreaterThan(0);
      expect(w.spread).toBeGreaterThanOrEqual(0);
      expect(w.range).toBeGreaterThan(0);
      expect(AMMO_LABEL[w.ammo]).toBeDefined();
    }
  });

  it('lookup helpers resolve', () => {
    const first = WEAPONS[0];
    expect(weaponById(first.id)).toBe(first);
    expect(weaponByCode(first.code)).toBe(first);
    expect(weaponById(999999)).toBeUndefined();
  });

  it('WEAPON_WEIGHTS covers rarities 0..3 with positive weights', () => {
    expect(Object.keys(WEAPON_WEIGHTS)).toHaveLength(4);
    for (const key of [0, 1, 2, 3]) {
      const w = WEAPON_WEIGHTS[key];
      expect(w).toBeDefined();
      for (const v of w!) expect(v).toBeGreaterThan(0);
    }
  });
});

describe('items registry', () => {
  it('has unique ids including the core healing items', () => {
    const ids = new Set(ITEMS.map((i) => i.id));
    expect(ids.size).toBe(ITEMS.length);
    expect(itemById('bandage')).toBeDefined();
    expect(itemById('medkit')).toBeDefined();
  });

  it('every item has a positive stack and valid rarity', () => {
    for (const i of ITEMS) {
      expect(i.stack).toBeGreaterThan(0);
      expect(i.rarity).toBeGreaterThanOrEqual(0);
      expect(i.rarity).toBeLessThanOrEqual(3);
    }
  });

  it('ammoItemFor maps every ammo type', () => {
    for (const a of ['light', 'medium', 'heavy', 'shells'] as const) {
      expect(itemById(ammoItemFor(a))).toBeDefined();
    }
  });

  it('rarity labels and colors are aligned', () => {
    expect(RARITY_LABEL).toHaveLength(4);
    expect(RARITY_COLOR).toHaveLength(4);
  });
});

describe('vehicles registry', () => {
  it('has at least 6 vehicles with unique ids', () => {
    expect(VEHICLES.length).toBeGreaterThanOrEqual(6);
    const ids = new Set(VEHICLES.map((v) => v.id));
    expect(ids.size).toBe(VEHICLES.length);
  });

  it('every vehicle is driveable on paper', () => {
    for (const v of VEHICLES) {
      expect(v.maxSpeed).toBeGreaterThan(0);
      expect(v.accel).toBeGreaterThan(0);
      expect(v.hp).toBeGreaterThan(0);
      expect(v.fuelCap).toBeGreaterThan(0);
      expect(v.seats).toBeGreaterThanOrEqual(1);
      expect(v.radius).toBeGreaterThan(0);
    }
  });

  it('vehicleById resolves and max hp constant exists', () => {
    expect(vehicleById(VEHICLES[0].id)).toBe(VEHICLES[0]);
    expect(vehicleById('nope')).toBeUndefined();
    expect(VEHICLE_MAX_HP).toBeGreaterThanOrEqual(500);
  });
});

describe('regions registry', () => {
  it('has 12 themed regions with sane density fields', () => {
    expect(REGIONS.length).toBe(12);
    const ids = new Set(REGIONS.map((r) => r.id));
    expect(ids.size).toBe(12);
    for (const r of REGIONS) {
      expect(r.buildDensity).toBeGreaterThanOrEqual(0);
      expect(r.buildDensity).toBeLessThanOrEqual(1);
      expect(r.vegDensity).toBeGreaterThanOrEqual(0);
      expect(r.vegDensity).toBeLessThanOrEqual(1);
      expect(r.loot).toBeGreaterThan(0);
      expect(r.radius).toBeGreaterThan(200);
    }
  });
});
