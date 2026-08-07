// weapons.ts — the ZONEFALL armory: 30 original weapons with full ballistics
// tables. All names are fictional (Valdar, Northwind, Corbelli, Tessell,
// Aurelian MW brands). Rarity tiers: 0 common .. 3 legendary.

export type WeaponCategory =
  | 'pistol' | 'smg' | 'pdw' | 'ar' | 'dmr' | 'sniper' | 'shotgun' | 'melee';

export type AmmoType = 'light' | 'medium' | 'heavy' | 'shells' | 'none';

export interface WeaponDef {
  id: number;
  code: string;          // short wire id, e.g. "V7R"
  name: string;
  category: WeaponCategory;
  ammo: AmmoType;
  rarity: number;        // 0..3
  /** Base damage per projectile at point-blank. */
  dmg: number;
  /** Rounds per minute (0 for melee). */
  rpm: number;
  mag: number;
  /** Seconds to reload from empty. */
  reload: number;
  /** Vertical recoil per shot, radians. */
  recoilV: number;
  /** Horizontal recoil spread per shot, radians (+-). */
  recoilH: number;
  /** Baseline spread (degrees). */
  spread: number;
  /** Muzzle velocity m/s. */
  muzzle: number;
  /** Gravity multiplier applied to projectile (1 = real g). */
  gravityMul: number;
  /** Material penetration factor (0 = none, 1 = thin walls). */
  pen: number;
  /** Automatic fire? */
  auto: boolean;
  /** Shotgun pellet count. */
  pellets: number;
  /** Base melee reach/damage falloff distance. */
  range: number;
  /** ADS spread multiplier. */
  adsMult: number;
  /** Description line for the armory screen. */
  blurb: string;
}

export const AMMO_LABEL: Record<AmmoType, string> = {
  light: 'Light',
  medium: 'Medium',
  heavy: 'Heavy',
  shells: 'Shells',
  none: '—',
};

/** Canonical ammo-slot index (matches the player `ammo` array on the wire). */
export const AMMO_INDEX: Record<AmmoType, number> = { light: 0, medium: 1, heavy: 2, shells: 3, none: 4 };

export function ammoIndex(ammo: AmmoType): number {
  return AMMO_INDEX[ammo] ?? AMMO_INDEX.none;
}

// ------------------------------------------------------------------ table

const W = (
  id: number, code: string, name: string, category: WeaponCategory,
  ammo: AmmoType, rarity: number, dmg: number, rpm: number, mag: number,
  reload: number, recoilV: number, recoilH: number, spread: number,
  muzzle: number, gravityMul: number, pen: number, auto: boolean,
  pellets = 1, range = 400, adsMult = 0.35, blurb = '',
): WeaponDef => ({
  id, code, name, category, ammo, rarity, dmg, rpm, mag, reload,
  recoilV, recoilH, spread, muzzle, gravityMul, pen, auto, pellets,
  range, adsMult, blurb,
});

export const WEAPONS: WeaponDef[] = [
  // ------------------------------------------------ pistols
  W(1, 'P9W', 'Valdar P-9 "Whippet"', 'pistol', 'light', 0, 22, 420, 12, 1.3, 0.024, 0.02, 0.7, 380, 1.0, 0.12, false, 1, 180, 0.4, 'Compact sidearm. Reliable, quiet, everywhere.'),
  W(2, 'PST', 'Corbelli "Stiletto"', 'pistol', 'light', 1, 26, 340, 8, 1.6, 0.03, 0.022, 0.8, 330, 1.0, 0.15, false, 1, 200, 0.4, 'Old-hand carry piece with a sharp report.'),
  W(3, 'P45', 'Northwind "Concord" .45', 'pistol', 'medium', 1, 34, 320, 10, 1.7, 0.034, 0.024, 0.9, 300, 1.0, 0.2, false, 1, 220, 0.4, 'Heavy-hitting service pistol.'),
  W(4, 'PRV', 'Tessell "Reaver" Revolver', 'pistol', 'heavy', 2, 58, 140, 6, 2.4, 0.05, 0.03, 1.1, 430, 1.2, 0.3, false, 1, 250, 0.45, 'Six shots of authority.'),
  // ------------------------------------------------ PDW / SMG
  W(5, 'M9M', 'Northwind "Mamba-9"', 'smg', 'light', 0, 14, 900, 24, 2.0, 0.03, 0.035, 1.6, 350, 1.0, 0.12, true, 1, 220, 0.45, 'Spray-and-pray favorite of the coast.'),
  W(6, 'VX9', 'Valdar "Vex-9"', 'smg', 'light', 1, 16, 780, 30, 2.2, 0.028, 0.03, 1.4, 380, 1.0, 0.14, true, 1, 230, 0.45, 'Smooth cyclic rate, decent mag.'),
  W(7, 'RTL', 'Corbelli "Rattler" PDW', 'pdw', 'light', 1, 13, 1000, 20, 2.0, 0.035, 0.045, 1.9, 400, 1.0, 0.12, true, 1, 200, 0.5, 'A hundred rounds of bees a minute.'),
  W(8, 'HSH', 'Tessell "Hush"', 'smg', 'light', 2, 15, 650, 18, 2.1, 0.026, 0.028, 1.2, 320, 1.0, 0.12, true, 1, 210, 0.45, 'Integrally suppressed. You only hear the hits.'),
  W(9, 'BLZ', 'Aurelian MW "Blitz"', 'smg', 'light', 2, 18, 720, 35, 2.3, 0.03, 0.03, 1.3, 400, 1.0, 0.15, true, 1, 230, 0.45, 'Army-issue close-work tool.'),
  W(10, 'OTT', 'Northwind "Otter"', 'pdw', 'light', 0, 11, 1100, 16, 1.9, 0.04, 0.05, 2.1, 360, 1.0, 0.1, true, 1, 190, 0.5, 'Tiny, rude, and everywhere.'),
  // ------------------------------------------------ assault rifles
  W(11, 'V7R', 'Valdar V-7 "Raptor"', 'ar', 'medium', 0, 24, 680, 30, 2.4, 0.032, 0.03, 1.0, 720, 1.0, 0.35, true, 1, 320, 0.35, 'The island standard. Balanced to a fault.'),
  W(12, 'LNG', 'Northwind "Longreach"', 'ar', 'heavy', 2, 34, 560, 20, 2.8, 0.042, 0.032, 1.1, 760, 1.0, 0.45, true, 1, 380, 0.35, 'Battle rifle chambered in 7.62. Reaches out.'),
  W(13, 'CRS', 'Corbelli "Crusader"', 'ar', 'medium', 1, 25, 640, 30, 2.5, 0.034, 0.032, 1.1, 700, 1.0, 0.4, true, 1, 330, 0.35, 'Square-shouldered workhorse.'),
  W(14, 'HRM', 'Tessell "Harmony"', 'ar', 'medium', 2, 23, 760, 25, 2.3, 0.028, 0.028, 0.9, 740, 1.0, 0.35, true, 1, 330, 0.35, 'Engineering-fair precision with low kick.'),
  W(15, 'PRG', 'Valdar "Peregrine"', 'ar', 'light', 1, 21, 820, 32, 2.4, 0.03, 0.03, 1.0, 760, 1.0, 0.3, true, 1, 310, 0.35, 'Carbine-length racer.'),
  W(16, 'RVR', 'Aurelian MW "Reaver"', 'ar', 'medium', 3, 28, 620, 34, 2.6, 0.036, 0.03, 0.95, 780, 1.0, 0.4, true, 1, 350, 0.35, 'Bullpup flagship. Rare and feared.'),
  // ------------------------------------------------ DMR
  W(17, 'ADX', 'Northwind "Addax"', 'dmr', 'medium', 1, 40, 260, 10, 2.6, 0.05, 0.028, 1.0, 800, 1.1, 0.5, false, 1, 480, 0.3, 'Slow, honest, and surgical.'),
  W(18, 'WND', 'Tessell "Windfall"', 'dmr', 'medium', 2, 44, 240, 15, 2.8, 0.052, 0.03, 0.9, 840, 1.1, 0.55, false, 1, 500, 0.3, 'Magnificent glass-worthy precision.'),
  W(19, 'SRC', 'Valdar "Sirocco"', 'dmr', 'heavy', 2, 52, 200, 12, 3.0, 0.058, 0.032, 1.0, 830, 1.15, 0.6, false, 1, 520, 0.3, 'Hot wind downrange.'),
  W(20, 'JVL', 'Corbelli "Javelin"', 'dmr', 'heavy', 3, 58, 210, 10, 3.2, 0.06, 0.03, 0.85, 900, 1.2, 0.65, false, 1, 560, 0.3, 'The bolt-action sniper\'s faster cousin.'),
  // ------------------------------------------------ snipers
  W(21, 'LNC', 'Valdar "Lance"', 'sniper', 'heavy', 2, 85, 45, 5, 3.6, 0.09, 0.03, 0.6, 950, 1.5, 0.8, false, 1, 900, 0.25, 'One shot. One breath.'),
  W(22, 'CMT', 'Northwind "Comet"', 'sniper', 'heavy', 3, 95, 40, 6, 3.8, 0.095, 0.03, 0.5, 1000, 1.6, 0.9, false, 1, 950, 0.25, 'Legendary range in a long frame.'),
  W(23, 'DNK', 'Aurelian MW "Deathknell"', 'sniper', 'heavy', 3, 110, 30, 4, 4.2, 0.1, 0.032, 0.45, 1050, 1.7, 0.95, false, 1, 1000, 0.25, 'Omen for anyone in its bore line.'),
  W(24, 'PLS', 'Tessell "Polaris"', 'sniper', 'heavy', 2, 88, 42, 5, 3.6, 0.088, 0.03, 0.55, 970, 1.55, 0.85, false, 1, 920, 0.25, 'Northern-star accuracy.'),
  // ------------------------------------------------ shotguns
  W(25, 'MST', 'Corbelli "Mastiff"', 'shotgun', 'shells', 1, 16, 80, 6, 2.8, 0.1, 0.06, 4.0, 380, 1.0, 0.25, false, 8, 90, 0.6, 'Pump-fed authority at short range.'),
  W(26, 'BLW', 'Valdar "Bulwark"', 'shotgun', 'shells', 2, 15, 220, 8, 3.2, 0.09, 0.06, 3.6, 400, 1.0, 0.3, true, 9, 95, 0.6, 'Eight rounds of no-entry.'),
  W(27, 'LNG2', 'Tessell "Longarm"', 'shotgun', 'shells', 0, 22, 50, 2, 2.6, 0.11, 0.07, 4.5, 420, 1.0, 0.2, false, 10, 80, 0.65, 'Two barrels of tradition.'),
  W(28, 'SCR', 'Northwind "Scourge"', 'shotgun', 'shells', 3, 17, 300, 10, 3.4, 0.085, 0.055, 3.2, 420, 1.0, 0.35, true, 8, 100, 0.6, 'Semi-auto flood of shot.'),
  // ------------------------------------------------ melee
  W(29, 'SKN', 'Valdar "Skinner" Knife', 'melee', 'none', 0, 40, 60, 0, 0.4, 0, 0, 0, 0, 0, 0.1, false, 1, 2.2, 1, 'Quick and quiet.'),
  W(30, 'MCK', 'Corbelli "Mackerel" Machete', 'melee', 'none', 1, 55, 50, 0, 0.5, 0, 0, 0, 0, 0, 0.15, false, 1, 2.6, 1, 'Harbor tool. Redefined.'),
];

const BY_CODE = new Map(WEAPONS.map((w) => [w.code, w] as const));

export function weaponByCode(code: string): WeaponDef | undefined {
  return BY_CODE.get(code);
}

export function weaponById(id: number): WeaponDef | undefined {
  return WEAPONS.find((w) => w.id === id);
}

/** Per-rarity roll weight tables for ground loot. */
export const WEAPON_WEIGHTS: Record<number, number[]> = {
  0: [10, 6, 3, 1],
  1: [6, 8, 5, 2],
  2: [3, 6, 8, 4],
  3: [1, 3, 6, 9],
};

export const CATEGORY_LABEL: Record<WeaponCategory, string> = {
  pistol: 'Pistol', smg: 'SMG', pdw: 'PDW', ar: 'Assault Rifle',
  dmr: 'DMR', sniper: 'Sniper', shotgun: 'Shotgun', melee: 'Melee',
};