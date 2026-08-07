// interact.test.ts — P5 loot/inventory/heal/armor/throwables regression tests.
//
// Covers the human+bot interaction pipeline in server/src/interact.ts:
// item stacking/caps, ammo pickup, weapon equip + slot swap, heal/armor
// timers consuming inventory, slot switching, and throwable consumption.

import { describe, expect, test } from 'vitest';
import { v3 } from '../shared/src/math.ts';
import { Rng } from '../shared/src/rng.ts';
import { ITEMS } from '../shared/src/items.ts';
import type { GameEvent, InputSample, ItemEntity, PlayerEntity } from '../shared/src/types.ts';
import { World } from '../server/src/world.ts';
import { addItem, hasInv, interact, removeItem, tickHeal } from '../server/src/interact.ts';

const ITEM_INDEX = new Map<string, number>(ITEMS.map((d, i) => [d.id, i]));
const idx = (id: string): number => ITEM_INDEX.get(id)!;

/** Full PlayerEntity literal (mirrors tests/combat.test.ts). */
function makePlayer(world: World, x: number, z: number): PlayerEntity {
  const id = world.nextId();
  const p: PlayerEntity = {
    id,
    kind: 'bot',
    name: 'TestBot',
    state: 'playing',
    pos: v3(x, 1, z),
    alive: true,
    yaw: 0,
    pitch: 0,
    moveSpeed: 0,
    hp: 100,
    maxHp: 100,
    armor: 0,
    stim: 0,
    slot0: -1,
    slot1: -1,
    activeSlot: 0,
    equippedWeapon: -1,
    inv: [],
    ammo: [0, 0, 0, 0, 0],
    vehicleId: -1,
    isDriving: false,
    chuteOpen: false,
    suppression: 0,
    kills: 0,
    lastHitTick: 0,
    skin: 0,
    ping: 40,
    lean: 0,
    lastFireTick: 0,
  };
  world.players.set(id, p);
  return p;
}

function makeItem(world: World, defId: string, x: number, z: number, count = 1): ItemEntity {
  const id = world.nextId();
  const item: ItemEntity = {
    id,
    kind: 'item',
    pos: v3(x, 1, z),
    alive: true,
    defId,
    rarity: 0,
    count,
    fromCrate: false,
  };
  world.items.set(id, item);
  return item;
}

function input(partial: Partial<InputSample>): InputSample {
  return {
    seq: 0,
    mv: { f: 0, s: 0 },
    dyaw: 0,
    dpitch: 0,
    fire: false,
    ads: false,
    sprint: false,
    crouch: false,
    jump: false,
    lean: 0,
    switchSlot: -1,
    use: false,
    throw: false,
    ...partial,
  };
}

const emptyCtx = (): { events: GameEvent[]; tick: number; rng: Rng } => ({
  events: [],
  tick: 0,
  rng: new Rng(1),
});

describe('inventory add/remove', () => {
  test('addItem stacks within a slot up to the stack cap', () => {
    const world = new World();
    const p = makePlayer(world, 0, 0);
    addItem(p, 'bandage', 4);
    addItem(p, 'bandage', 4);
    expect(p.inv).toEqual([idx('bandage'), 8]);
  });

  test('addItem caps at the stack max (bandage = 10)', () => {
    const world = new World();
    const p = makePlayer(world, 0, 0);
    addItem(p, 'bandage', 7);
    addItem(p, 'bandage', 7);
    expect(p.inv[1]).toBe(10);
  });

  test('removeItem consumes partial count and keeps the rest', () => {
    const world = new World();
    const p = makePlayer(world, 0, 0);
    addItem(p, 'bandage', 5);
    expect(removeItem(p, 'bandage', 2)).toBe(true);
    expect(p.inv).toEqual([idx('bandage'), 3]);
  });

  test('removeItem removes the slot entirely at zero', () => {
    const world = new World();
    const p = makePlayer(world, 0, 0);
    addItem(p, 'bandage', 2);
    removeItem(p, 'bandage', 2);
    expect(p.inv).toEqual([]);
    expect(hasInv(p, 'bandage')).toBe(false);
  });
});

describe('pickup via interact', () => {
  test('weapon pickup equips it and grants half a mag of reserve ammo', () => {
    const world = new World();
    const p = makePlayer(world, 0, 0);
    makeItem(world, '1', 1, 0); // weapon id 1, mag = e.g. 30
    world.rebuildGrids();
    interact(p, input({ use: true }), world, emptyCtx());
    expect(p.equippedWeapon).toBe(1);
    expect(p.slot0).toBe(1);
    const w = p.ammo.reduce((a, b) => a + b, 0);
    expect(w).toBeGreaterThan(0);
    expect(world.items.size).toBe(0);
  });

  test('equipping a second weapon fills slot1 and switching slots swaps equippedWeapon', () => {
    const world = new World();
    const p = makePlayer(world, 0, 0);
    makeItem(world, '1', 1, 0);
    makeItem(world, '2', 1.5, 0); // within 1.9m pickup radius
    world.rebuildGrids();
    interact(p, input({ use: true }), world, emptyCtx());
    world.rebuildGrids(); // sim rebuilds the spatial grid every tick after deletes
    interact(p, input({ use: true }), world, emptyCtx());
    expect(p.slot0).toBe(1);
    expect(p.slot1).toBe(2);
    expect(p.activeSlot).toBe(1);
    // Switch back to slot 0.
    interact(p, input({ switchSlot: 0 }), world, emptyCtx());
    expect(p.activeSlot).toBe(0);
    expect(p.equippedWeapon).toBe(1);
  });

  test('ammo pickup adds to the matching ammo pool', () => {
    const world = new World();
    const p = makePlayer(world, 0, 0);
    const ammoDef = ITEMS.find((i) => i.kind === 'ammo' && i.ammo === 'light')!;
    makeItem(world, ammoDef.id, 1, 0, 30);
    world.rebuildGrids();
    interact(p, input({ use: true }), world, emptyCtx());
    expect(p.ammo.reduce((a, b) => a + b, 0)).toBe(30);
  });
});

describe('heal and armor timers', () => {
  test('heal timer restores HP, respects max, and consumes the item', () => {
    const world = new World();
    const p = makePlayer(world, 0, 0);
    p.hp = 30;
    addItem(p, 'medkit', 1);
    // F pressed with no pickup nearby starts the 6s (180 tick) heal.
    interact(p, input({ use: true }), world, emptyCtx());
    tickHeal(world, 179); // not done yet
    expect(p.hp).toBe(30);
    tickHeal(world, 180); // completes
    expect(p.hp).toBe(80); // 30 + 50, capped at maxHp 100
    expect(hasInv(p, 'medkit')).toBe(false); // item fully consumed
  });

  test('armor vest grants armor capped at 100 and is consumed', () => {
    const world = new World();
    const p = makePlayer(world, 0, 0);
    p.armor = 60;
    addItem(p, 'vest1', 1);
    interact(p, input({ use: true }), world, emptyCtx());
    tickHeal(world, 121); // useTime 4s = 120 ticks
    expect(p.armor).toBe(85);
    expect(hasInv(p, 'vest1')).toBe(false);
  });

  test('full HP blocks starting a heal', () => {
    const world = new World();
    const p = makePlayer(world, 0, 0);
    addItem(p, 'bandage', 3);
    interact(p, input({ use: true }), world, emptyCtx());
    tickHeal(world, 100);
    expect(p.hp).toBe(100);
    expect(hasInv(p, 'bandage')).toBe(true); // nothing consumed
  });
});

describe('throwables', () => {
  test('throwing a frag consumes one and spawns a projectile', () => {
    const world = new World();
    const p = makePlayer(world, 0, 0);
    addItem(p, 'frag', 2);
    interact(p, input({ throw: true }), world, emptyCtx());
    expect(hasInv(p, 'frag')).toBe(true);
    expect(p.inv[p.inv.indexOf(idx('frag')) + 1]).toBe(1);
    expect(world.bullets.size).toBe(1);
  });

  test('throwing with no throwable in inventory does nothing', () => {
    const world = new World();
    const p = makePlayer(world, 0, 0);
    addItem(p, 'bandage', 2);
    interact(p, input({ throw: true }), world, emptyCtx());
    expect(world.bullets.size).toBe(0);
    expect(hasInv(p, 'bandage')).toBe(true);
  });
});
