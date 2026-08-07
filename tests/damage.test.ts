// damage.test.ts — limb multipliers, armor absorption, falloff, explosives.
import { describe, it, expect } from 'vitest';
import {
  LIMB_MULT, armorAbsorption, falloff, computeShotDamage, explosiveDamage,
} from '../shared/src/damage.ts';

describe('LIMB_MULT', () => {
  it('head is the biggest multiplier', () => {
    expect(LIMB_MULT.head).toBe(2.0);
    expect(LIMB_MULT.leg).toBeLessThan(LIMB_MULT.chest);
  });
});

describe('armorAbsorption', () => {
  it('passes everything through with no armor', () => {
    expect(armorAbsorption(0, 50)).toEqual({ hpDmg: 50, armorDmg: 0 });
  });

  it('absorbs up to 60% of incoming, capped at armor', () => {
    // 60% of 50 = 30; armor 30 → absorbs all 30.
    expect(armorAbsorption(30, 50)).toEqual({ hpDmg: 20, armorDmg: 30 });
    // More armor than the cap → still only 60%.
    expect(armorAbsorption(100, 50)).toEqual({ hpDmg: 20, armorDmg: 30 });
    // Less armor than the cap → armor fully consumed.
    expect(armorAbsorption(10, 50)).toEqual({ hpDmg: 40, armorDmg: 10 });
  });
});

describe('falloff', () => {
  const weapon = { range: 200 };

  it('full damage within soft range', () => {
    expect(falloff(0, weapon)).toBe(1);
    expect(falloff(120, weapon)).toBe(1);
  });

  it('floors at 25% at max range', () => {
    expect(falloff(200, weapon)).toBe(0.25);
    expect(falloff(500, weapon)).toBe(0.25);
  });

  it('linear between soft and hard range', () => {
    expect(falloff(160, weapon)).toBeCloseTo(1 - 0.75 * (40 / 80), 6);
  });
});

describe('computeShotDamage', () => {
  it('applies limb multiplier and falloff before armor', () => {
    const r = computeShotDamage(40, 50, 'head', { range: 200 }, 0);
    expect(r.hp).toBeCloseTo(80, 6);
    expect(r.headshot).toBe(true);
    expect(r.armor).toBe(0);
  });

  it('armor reduces hp damage and reports armor damage', () => {
    const r = computeShotDamage(40, 50, 'chest', { range: 200 }, 30);
    // Base 40 → no falloff → armor absorbs min(24, 30) = 24 → hp 16, armor 24.
    expect(r.hp).toBeCloseTo(16, 6);
    expect(r.armor).toBeCloseTo(24, 6);
  });

  it('leg shots are weaker', () => {
    const leg = computeShotDamage(40, 50, 'leg', { range: 200 }, 0);
    const chest = computeShotDamage(40, 50, 'chest', { range: 200 }, 0);
    expect(leg.hp).toBeCloseTo(30, 6);
    expect(chest.hp).toBe(40);
  });

  it('headshot flag only on head', () => {
    expect(computeShotDamage(1, 1, 'chest', { range: 100 }, 0).headshot).toBe(false);
    expect(computeShotDamage(1, 1, 'head', { range: 100 }, 0).headshot).toBe(true);
  });
});

describe('explosiveDamage', () => {
  it('deals falloff damage from the epicenter', () => {
    expect(explosiveDamage(100, 0, 10)).toBeCloseTo(100, 6); // full at center
    expect(explosiveDamage(100, 5, 10)).toBeCloseTo(47.5, 6); // half-way: 0.3+0.7*0.25
    expect(explosiveDamage(100, 10, 10)).toBe(0); // at edge → 0.3 * dist/radius → killed by dist >= radius
    expect(explosiveDamage(100, 20, 10)).toBe(0);
  });
});
