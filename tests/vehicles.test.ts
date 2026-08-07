// vehicles.test.ts — P6 fleet regression coverage: spawn determinism, fuel
// burn, tire/engine damage, repair, boarding/seats, and water behaviour.

import { describe, expect, test } from 'vitest';
import { MAX_VEHICLES } from '../shared/src/consts.ts';
import { Rng } from '../shared/src/rng.ts';
import { v3 } from '../shared/src/math.ts';
import { VEHICLES, VEHICLE_MAX_HP, vehicleById } from '../shared/src/vehicles.ts';
import { waterLevelAt, terrainHeight } from '../shared/src/worldgen.ts';
import { WORLD_SEED } from '../shared/src/consts.ts';
import type { InputSample, PlayerEntity, VehicleEntity } from '../shared/src/types.ts';
import { World } from '../server/src/world.ts';
import {
  damageVehicle,
  driveFromInput,
  exitVehicle,
  repairVehicle,
  spawnVehicles,
  stepVehicles,
  tryEnter,
  type VehicleCtx,
} from '../server/src/vehicle-sim.ts';

const DT = 1 / 30;

function ctx(world: World, tick = 0): VehicleCtx {
  return { dt: DT, tick, world, events: [] };
}

function input(mv: Partial<{ f: number; s: number }> = {}): InputSample {
  return {
    seq: 0,
    mv: { f: 0, s: 0, ...mv },
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
  };
}

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

/** Find a dry land cell (no water) for wheeled vehicle tests. */
function findDry(): { x: number; z: number } {
  for (let x = -800; x < 800; x += 32) {
    for (let z = -800; z < 800; z += 32) {
      if (waterLevelAt(x, z, WORLD_SEED) === 0) return { x, z };
    }
  }
  throw new Error('no dry cell found');
}

/** Find a water cell (ocean/river; waterLevelAt returns ≈0.35 there). */
function findWet(): { x: number; z: number } {
  for (let x = -2048; x < 2048; x += 32) {
    for (let z = -2048; z < 2048; z += 32) {
      if (waterLevelAt(x, z, WORLD_SEED) >= 0.35) return { x, z };
    }
  }
  throw new Error('no wet cell found');
}

describe('spawnVehicles', () => {
  test('places the full deterministic fleet', () => {
    const world = new World();
    const placed = spawnVehicles(world, 1234);
    expect(placed).toBe(MAX_VEHICLES);
    expect(world.vehicles.size).toBe(MAX_VEHICLES);
    for (const v of world.vehicles.values()) {
      expect(vehicleById(v.defId)).toBeDefined();
    }
  });

  test('same seed reproduces the same fleet order', () => {
    const a = new World();
    const b = new World();
    spawnVehicles(a, 777);
    spawnVehicles(b, 777);
    const av = [...a.vehicles.values()].map((v) => v.defId + v.pos.x.toFixed(2));
    const bv = [...b.vehicles.values()].map((v) => v.defId + v.pos.x.toFixed(2));
    expect(av).toEqual(bv);
  });
});

describe('driving and fuel', () => {
  test('throttle accelerates the vehicle and burns fuel', () => {
    const world = new World();
    spawnVehicles(world, 1);
    const dry = findDryVehicle(world);
    const v = dry;
    const def = vehicleById(v.defId)!;
    const fuel0 = v.fuel;
    const c = ctx(world);
    for (let i = 0; i < 180; i++) {
      driveFromInput(v, input({ f: 1 }));
      v.throttle = 1;
      stepVehicles(c);
    }
    expect(v.speed).toBeGreaterThan(5);
    expect(v.fuel).toBeLessThan(fuel0);
    expect(v.speed).toBeLessThanOrEqual(def.maxSpeed + 0.5);
  });

  test('zero throttle bleeds speed back down (drag)', () => {
    const world = new World();
    spawnVehicles(world, 2);
    const v = findSpotVehicle(world);
    driveFromInput(v, input({ f: 1 }));
    v.throttle = 1;
    const c = ctx(world);
    for (let i = 0; i < 240; i++) stepVehicles(c);
    const fast = v.speed;
    driveFromInput(v, input({ f: 0 }));
    v.throttle = 0;
    for (let i = 0; i < 600; i++) stepVehicles(c);
    expect(v.speed).toBeLessThan(fast);
    expect(v.speed).toBeLessThan(2);
  });
});

describe('damage and repair', () => {
  test('damageVehicle degrades hull, engine and tires', () => {
    const world = new World();
    const v = makeFleetVehicle(world, 3);
    const def = vehicleById(v.defId)!;
    damageVehicle(v, def.hp * 0.9); // 90% hull gone -> engine broken, tires blown
    expect(v.hp).toBeGreaterThan(0);
    expect(v.engineBroken).toBe(true);
    expect(v.tires).toBeLessThan(def.wheels);
  });

  test('a big hit (>40) instantly breaks the engine', () => {
    const world = new World();
    const v = makeFleetVehicle(world, 4);
    damageVehicle(v, 50);
    expect(v.engineBroken).toBe(true);
  });

  test('repairVehicle restores hull, fuel, tires and engine', () => {
    const world = new World();
    const v = makeFleetVehicle(world, 5);
    const def = vehicleById(v.defId)!;
    damageVehicle(v, def.hp * 0.9);
    v.fuel = 1;
    repairVehicle(v);
    expect(v.hp).toBe(def.hp);
    expect(v.fuel).toBe(def.fuelCap);
    expect(v.tires).toBe(def.wheels);
    expect(v.engineBroken).toBe(false);
  });

  test('a broken engine cannot build speed', () => {
    const world = new World();
    spawnVehicles(world, 6);
    const v = findSpotVehicle(world);
    v.throttle = 1;
    v.engineBroken = true;
    const c = ctx(world);
    for (let i = 0; i < 90; i++) stepVehicles(c);
    expect(v.speed).toBeLessThan(2);
  });
});

describe('boarding and exit', () => {
  test('tryEnter makes the first occupant the driver, limited by seats', () => {
    const world = new World();
    spawnVehicles(world, 7);
    const v = [...world.vehicles.values()][0];
    const def = vehicleById(v.defId)!;
    const players = [...Array(def.seats + 1)].map(() => makePlayer(world, v.pos.x, v.pos.z));
    for (const p of players) {
      tryEnter(world, p, v, []);
    }
    expect(v.occupants.length).toBe(def.seats); // +1 blocked by seat limit
    expect(players[0].isDriving).toBe(true);
    expect(players[1].isDriving).toBe(false);
    expect(players[def.seats].vehicleId).toBe(-1); // held out
  });

  test('exitVehicle clears membership and promotes the next driver', () => {
    const world = new World();
    spawnVehicles(world, 8);
    const v = [...world.vehicles.values()][0];
    const def = vehicleById(v.defId)!;
    const captain = makePlayer(world, v.pos.x, v.pos.z);
    const mate = makePlayer(world, v.pos.x, v.pos.z);
    tryEnter(world, captain, v, []);
    tryEnter(world, mate, v, []);
    expect(mate.isDriving).toBe(false);
    exitVehicle(world, captain);
    expect(captain.vehicleId).toBe(-1);
    expect(mate.vehicleId).toBe(v.id);
    expect(mate.isDriving).toBe(true);
    expect(v.occupants).toEqual([mate.id]);
  });
});

describe('water behaviour', () => {
  test('a wheeled vehicle in deep water is throttled to a crawl', () => {
    const world = new World();
    spawnVehicles(world, 9);
    const v = [...world.vehicles.values()].find((x) => !vehicleById(x.defId)!.watercraft)!;
    const wet = findWet();
    v.pos.x = wet.x;
    v.pos.z = wet.z;
    v.throttle = 1;
    const c = ctx(world);
    for (let i = 0; i < 120; i++) stepVehicles(c);
    expect(v.inWater).toBe(true);
    expect(v.speed).toBeLessThanOrEqual(2.1);
  });

  test('a boat floats above the water surface and still drives', () => {
    const world = new World();
    spawnVehicles(world, 10);
    const boat = [...world.vehicles.values()].find((v2) => vehicleById(v2.defId)!.watercraft)!;
    const wet = findWet();
    boat.pos.x = wet.x;
    boat.pos.z = wet.z;
    boat.throttle = 1;
    const c = ctx(world);
    for (let i = 0; i < 180; i++) stepVehicles(c);
    expect(boat.inWater).toBe(true);
    const water = waterLevelAt(boat.pos.x, boat.pos.z, WORLD_SEED);
    expect(boat.pos.y).toBeGreaterThanOrEqual(water - 0.1);
    expect(boat.speed).toBeGreaterThan(2);
  });
});

// Helpers shared across tests ---------------------------------------------

/** Spawn the deterministic fleet, then move its first wheeled vehicle to a
 *  dry cell so driving tests are not sunk by water drag. */
function moveFirstToDry(world: World): VehicleEntity {
  const v = [...world.vehicles.values()][0];
  const dry = findDry();
  v.pos.x = dry.x;
  v.pos.z = dry.z;
  return v;
}

/** Teleport a wheeled vehicle to a dry, driveable cell. */
function findSpotVehicle(world: World): VehicleEntity {
  return moveFirstToDry(world);
}

function findDryVehicle(world: World): VehicleEntity {
  return moveFirstToDry(world);
}

function makeFleetVehicle(world: World, seed: number): VehicleEntity {
  spawnVehicles(world, seed);
  return moveFirstToDry(world);
}