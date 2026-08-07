// items.ts — consumables, armor and throwables. Original names.

export type ItemKind = 'heal' | 'armor' | 'throwable' | 'ammo' | 'misc';

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  rarity: number; // 0..3
  /** Heal amount (hp) for heals; armor points for armor; nothing for others. */
  value: number;
  /** Seconds to use. */
  useTime: number;
  /** Max stack per slot. */
  stack: number;
  /** AMMO type for ammo items; else null. */
  ammo?: 'light' | 'medium' | 'heavy' | 'shells';
  /** Explosive damage for throwables. */
  damage?: number;
  /** Explosive radius for throwables. */
  radius?: number;
  blurb: string;
}

export const ITEMS: ItemDef[] = [
  { id: 'bandage', name: 'Field Bandage', kind: 'heal', rarity: 0, value: 10, useTime: 3, stack: 10, blurb: 'Slow, reliable top-up.' },
  { id: 'medkit', name: 'Combat Medkit', kind: 'heal', rarity: 1, value: 50, useTime: 6, stack: 5, blurb: 'Brings you back from the edge.' },
  { id: 'syringe', name: 'Aurelian Syringe', kind: 'heal', rarity: 2, value: 100, useTime: 9, stack: 3, blurb: 'Full restoration. Expensive. Worth it.' },
  { id: 'stim', name: 'Harbor Stim', kind: 'heal', rarity: 1, value: 35, useTime: 4, stack: 5, blurb: 'Boosts movement speed for 30s.' },
  { id: 'vest1', name: 'Plate Vest Mk.I', kind: 'armor', rarity: 0, value: 25, useTime: 4, stack: 1, blurb: 'Absorbs 25 damage before shattering.' },
  { id: 'vest2', name: 'Plate Vest Mk.II', kind: 'armor', rarity: 1, value: 50, useTime: 4, stack: 1, blurb: 'Absorbs 50 damage.' },
  { id: 'vest3', name: 'Plate Vest Mk.III', kind: 'armor', rarity: 2, value: 75, useTime: 4, stack: 1, blurb: 'Absorbs 75 damage. Certified.' },
  { id: 'vest4', name: 'Aegis Vest', kind: 'armor', rarity: 3, value: 100, useTime: 4, stack: 1, blurb: 'Legendary. 100 points of forgiveness.' },
  { id: 'frag', name: 'Frag Grenade', kind: 'throwable', rarity: 1, value: 0, useTime: 0.8, stack: 3, damage: 90, radius: 7, blurb: 'Pull, cook, drop.' },
  { id: 'smoke', name: 'Smoke Grenade', kind: 'throwable', rarity: 0, value: 0, useTime: 0.8, stack: 3, damage: 0, radius: 12, blurb: 'Cover of the moment.' },
  { id: 'flash', name: 'Flash Grenade', kind: 'throwable', rarity: 1, value: 0, useTime: 0.8, stack: 3, damage: 0, radius: 14, blurb: 'Bright ideas. For your enemies.' },
  { id: 'ammo_light', name: 'Light Ammo Box', kind: 'ammo', rarity: 0, value: 0, useTime: 0, stack: 90, ammo: 'light', blurb: '9mm & 5.56 compatibles.' },
  { id: 'ammo_medium', name: 'Medium Ammo Box', kind: 'ammo', rarity: 1, value: 0, useTime: 0, stack: 60, ammo: 'medium', blurb: '7.62 compatibles.' },
  { id: 'ammo_heavy', name: 'Heavy Ammo Box', kind: 'ammo', rarity: 2, value: 0, useTime: 0, stack: 40, ammo: 'heavy', blurb: 'Big-bore rounds.' },
  { id: 'ammo_shells', name: 'Shell Pack', kind: 'ammo', rarity: 0, value: 0, useTime: 0, stack: 24, ammo: 'shells', blurb: 'Twelve-gauge rain.' },
  { id: 'repairkit', name: 'Field Repair Kit', kind: 'misc', rarity: 1, value: 250, useTime: 5, stack: 2, blurb: 'Restores vehicle fuel and hull.' },
];

export const ITEM_BY_ID = new Map(ITEMS.map((i) => [i.id, i] as const));

export function itemById(id: string): ItemDef | undefined {
  return ITEM_BY_ID.get(id);
}

/** Maps a weapon's ammo type to the matching ammo item id. */
export function ammoItemFor(ammo: 'light' | 'medium' | 'heavy' | 'shells'): string {
  return `ammo_${ammo}`;
}

export const RARITY_LABEL = ['Common', 'Uncommon', 'Rare', 'Legendary'];
export const RARITY_COLOR = ['#b8bcc2', '#4fae4f', '#4f8fff', '#c88fff'];