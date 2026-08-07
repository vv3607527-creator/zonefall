// damage.ts — damage, armor and limb-multiplier formulas. Pure functions.

export const LIMB_MULT: Record<string, number> = {
  head: 2.0,
  chest: 1.0,
  abdomen: 1.1,
  arm: 0.85,
  leg: 0.75,
};

/** Armor absorbs flat damage per point of armor, with diminishing efficiency. */
export function armorAbsorption(armor: number, incoming: number): { hpDmg: number; armorDmg: number } {
  if (armor <= 0) return { hpDmg: incoming, armorDmg: 0 };
  // Armor eats up to 60% of the blow, capped at remaining armor.
  const absorbed = Math.min(incoming * 0.6, armor);
  const hpDmg = incoming - absorbed;
  return { hpDmg, armorDmg: absorbed };
}

/** Damage falloff with distance for a weapon. Returns multiplier 0..1. */
export function falloff(d: number, weapon: { range: number }): number {
  // Full damage to 60% of effective range, then linear to 25% at max range.
  const soft = weapon.range * 0.6;
  const hard = weapon.range;
  if (d <= soft) return 1;
  if (d >= hard) return 0.25;
  return 1 - 0.75 * ((d - soft) / (hard - soft));
}

export interface DamageEvent {
  victim: number;
  attacker: number;
  amount: number; // final hp damage after armor
  limb: string;
  weaponId: number;
  headshot: boolean;
  kill: boolean;
}

/**
 * Compute final damage for a shot.
 * returns hp damage applied (armor reduces it).
 */
export function computeShotDamage(
  base: number,
  dist: number,
  limb: string,
  weapon: { range: number },
  armor: number,
): { hp: number; armor: number; headshot: boolean } {
  const mult = LIMB_MULT[limb] ?? 1;
  const withFalloff = base * falloff(dist, weapon) * mult;
  const { hpDmg, armorDmg } = armorAbsorption(armor, withFalloff);
  return { hp: hpDmg, armor: armorDmg, headshot: limb === 'head' };
}

/** Explosive damage with radius falloff. */
export function explosiveDamage(base: number, dist: number, radius: number): number {
  if (dist >= radius) return 0;
  const t = 1 - dist / radius;
  return base * (0.3 + 0.7 * t * t);
}