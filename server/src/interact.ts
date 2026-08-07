// interact.ts — all player↔world interactions: weapon/item pickups, crate
// opening, vehicle boarding, healing/armor use, throwables. Humans and bots
// funnel through the same code so the two populations behave identically.

import { ITEMS } from '../../shared/src/items.ts';
import { ammoIndex, WEAPONS, weaponById } from '../../shared/src/weapons.ts';
import type { Rng } from '../../shared/src/rng.ts';
import { throwItem } from './combat.ts';
import { tryEnter, exitVehicle } from './vehicle-sim.ts';
import type { CrateEntity, GameEvent, InputSample, ItemEntity, PlayerEntity } from '../../shared/src/types.ts';
import type { World } from './world.ts';

/** Immutable index of ITEMS by defId (built once at module load). */
const ITEM_INDEX = new Map<string, number>(ITEMS.map((d, i) => [d.id, i]));

export interface HealTimer {
  defId: string;
  until: number; // server tick when the use completes
}
export const healTimers = new Map<number, HealTimer>();

/** Add an item (cap at stack). Mutates p.inv in place — wire-visible state. */
export function addItem(p: PlayerEntity, defId: string, count: number): void {
  const idx = ITEM_INDEX.get(defId);
  if (idx === undefined) return;
  const def = ITEMS[idx];
  for (let i = 0; i < p.inv.length; i += 2) {
    if (p.inv[i] === idx) {
      p.inv[i + 1] = Math.min(def.stack, p.inv[i + 1] + count);
      return;
    }
  }
  p.inv.push(idx, Math.min(def.stack, count));
}

/** Remove up to `count` of an item. Returns true if fully satisfied. */
export function removeItem(p: PlayerEntity, defId: string, count: number): boolean {
  const idx = ITEM_INDEX.get(defId);
  if (idx === undefined) return false;
  for (let i = 0; i < p.inv.length; i += 2) {
    if (p.inv[i] === idx) {
      const take = Math.min(p.inv[i + 1], count);
      p.inv[i + 1] -= take;
      if (p.inv[i + 1] <= 0) p.inv.splice(i, 2);
      return take >= count;
    }
  }
  return false;
}

export function hasInv(p: PlayerEntity, defId: string): boolean {
  const idx = ITEM_INDEX.get(defId);
  if (idx === undefined) return false;
  for (let i = 0; i < p.inv.length; i += 2) if (p.inv[i] === idx) return true;
  return false;
}

function firstHealOrArmor(p: PlayerEntity): string | null {
  for (let i = 0; i < p.inv.length; i += 2) {
    const def = ITEMS[p.inv[i]];
    if (def && (def.kind === 'heal' || def.kind === 'armor')) return def.id;
  }
  return null;
}

function firstThrowable(p: PlayerEntity): 'frag' | 'smoke' | 'flash' | null {
  for (let i = 0; i < p.inv.length; i += 2) {
    const def = ITEMS[p.inv[i]];
    if (def && def.kind === 'throwable') return def.id as 'frag' | 'smoke' | 'flash';
  }
  return null;
}

function nearestItem(world: World, p: PlayerEntity, radius: number): ItemEntity | null {
  const near = world.gridItems.queryCircle(p.pos.x, p.pos.z, radius);
  let best: ItemEntity | null = null;
  let bestD = radius * radius;
  for (const i of near) {
    if (!i.alive) continue;
    const dx = i.pos.x - p.pos.x;
    const dz = i.pos.z - p.pos.z;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Equip a weapon into an open slot (or replace the active one). */
function equipWeapon(p: PlayerEntity, weaponId: number, world: World, events: GameEvent[]): void {
  if (p.slot0 === -1) {
    p.slot0 = weaponId;
    p.activeSlot = 0;
  } else if (p.slot1 === -1) {
    p.slot1 = weaponId;
    p.activeSlot = 1;
  } else {
    // Both slots full: swap the active gun for the new one.
    if (p.activeSlot === 0) p.slot0 = weaponId;
    else p.slot1 = weaponId;
  }
  p.equippedWeapon = weaponId;
  // Fresh pickups come with a partial mag in reserve.
  const w = weaponById(weaponId);
  if (w) p.ammo[ammoIndex(w.ammo)] += Math.round(w.mag * 0.5);
}

function pickupItem(p: PlayerEntity, world: World, item: ItemEntity, events: GameEvent[]): void {
  const def = WEAPONS.find((w) => w.id === Number(item.defId));
  if (def) {
    equipWeapon(p, def.id, world, events);
  } else {
    const idx = ITEM_INDEX.get(item.defId);
    if (idx !== undefined) {
      const itemDef = ITEMS[idx];
      if (itemDef.kind === 'ammo' && itemDef.ammo) {
        p.ammo[ammoIndex(itemDef.ammo)] += item.count;
      } else {
        addItem(p, item.defId, item.count);
      }
    }
  }
  world.items.delete(item.id);
}

function openCrate(world: World, p: PlayerEntity, crateId: number, events: GameEvent[]): void {
  const c = world.crates.get(crateId);
  if (!c) return;
  for (const loot of c.loot) {
    const id = world.nextId();
    const item: ItemEntity = {
      id,
      kind: 'item',
      pos: { x: c.pos.x + (Math.random() - 0.5) * 2, y: c.pos.y, z: c.pos.z + (Math.random() - 0.5) * 2 },
      alive: true,
      defId: loot.defId,
      rarity: loot.rarity,
      count: loot.count,
      fromCrate: true,
    };
    world.items.set(id, item);
    world.gridItems.insert(item.pos.x, item.pos.z, item);
  }
  world.crates.delete(crateId);
  events.push({ t: 'crate', id: crateId });
}

function startHeal(p: PlayerEntity, tick: number): boolean {
  if (healTimers.has(p.id)) return true;
  const defId = firstHealOrArmor(p);
  if (!defId) return false;
  const idx = ITEM_INDEX.get(defId);
  if (idx === undefined) return false;
  const def = ITEMS[idx];
  if (p.hp >= p.maxHp && def.kind === 'heal') return false;
  healTimers.set(p.id, { defId, until: tick + Math.round(def.useTime * 30) });
  return true;
}

export interface InteractCtx {
  events: GameEvent[];
  tick: number;
  rng: Rng;
}

/**
 * One tick of interaction processing for a player. Runs AFTER movement.
 * Pickup, crate-open, vehicle board/eject, heal-start and throw are all
 * edge-triggered by input fields; the sim serializes them per frame.
 */
export function interact(p: PlayerEntity, input: InputSample, world: World, ctx: InteractCtx): void {
  // Weapon slot switch.
  if (input.switchSlot !== -1 && input.switchSlot !== p.activeSlot && p.state === 'playing') {
    const slot = input.switchSlot === 0 ? p.slot0 : p.slot1;
    if (slot !== -1) {
      p.activeSlot = input.switchSlot;
      p.equippedWeapon = slot;
    }
  }

  // Throwable.
  if (input.throw && p.state === 'playing') {
    const kind = firstThrowable(p);
    if (kind) {
      removeItem(p, kind, 1);
      throwItem(world, p, kind, ctx);
    }
  }

  if (!input.use || p.state === 'dead') return;

  // Pickups (items → crates → vehicles → heal) in priority order.
  const item = nearestItem(world, p, 1.9);
  if (item) {
    pickupItem(p, world, item, ctx.events);
    return;
  }

  let nearCrate: CrateEntity | null = null;
  for (const c of world.crates.values()) {
    const dx = c.pos.x - p.pos.x;
    const dz = c.pos.z - p.pos.z;
    if (dx * dx + dz * dz < 9) {
      nearCrate = c;
      break;
    }
  }
  if (nearCrate) {
    openCrate(world, p, nearCrate.id, ctx.events);
    return;
  }

  const nearVeh = world.gridVehicles.queryCircle(p.pos.x, p.pos.z, 3.2)[0];
  if (nearVeh) {
    if (p.vehicleId === nearVeh.id) {
      exitVehicle(world, p);
    } else {
      tryEnter(world, p, nearVeh, ctx.events);
    }
    return;
  }

  if (p.state === 'playing') startHeal(p, ctx.tick);
}

/** Advance any in-progress heal/armor actions. Call every tick. */
export function tickHeal(world: World, tick: number): void {
  for (const [id, timer] of [...healTimers]) {
    if (tick < timer.until) continue;
    healTimers.delete(id);
    const p = world.players.get(id);
    if (!p || !p.alive) continue;
    const idx = ITEM_INDEX.get(timer.defId);
    if (idx === undefined) continue;
    const def = ITEMS[idx];
    if (def.kind === 'heal') {
      p.hp = Math.min(p.maxHp, p.hp + def.value);
      if (def.id === 'stim') p.stim = Math.max(p.stim, 35);
    } else if (def.kind === 'armor') {
      p.armor = Math.min(100, p.armor + def.value);
    }
    removeItem(p, timer.defId, 1);
  }
}