// bots.test.ts — bot brain FSM regression tests.
//
// Regression target: bots stalled ~6m short of loot items and vehicles. The
// A* waypoint follow loop consumed the FINAL waypoint (the item itself) at
// d < 6 and then fell back to zone-wander — never closing to the 2m `use`
// pickup radius. Bots therefore never looted guns and fought melee-only for
// the whole match.
//
// The exhausted-path case is simulated with an EMPTY path array (`b.path =
// []`), NOT `null`: decide() treats `b.path === null` as "no path yet" and
// rebuilds a fresh waypoint set every tick, which masks the post-consume
// state. `[]` means "a path existed and ran out" — the exact scenario that
// triggered the stall in live matches.

import { describe, expect, test, vi } from 'vitest';
import { v3 } from '../shared/src/math.ts';
import { World } from '../server/src/world.ts';
import { initBrain, updateBot } from '../server/src/bots.ts';
import type { BotBrain } from '../server/src/bots.ts';
import type { ItemEntity, PlayerEntity, VehicleEntity, ZoneState } from '../shared/src/types.ts';
import type { BotCtx } from '../server/src/bots.ts';

function makeZone(cx: number, cz: number): ZoneState {
  return {
    phase: 1,
    center: v3(cx, 0, cz),
    radius: 1200,
    nextCenter: v3(cx, 0, cz),
    nextRadius: 900,
    shrinkStartTick: 1000,
    shrinkEndTick: 4000,
    dps: 1,
  };
}

/** Bot + brain pair at (x,z), yaw=0 (facing +x), given loot/drive paths. */
function setupBot(world: World, x: number, z: number): { p: PlayerEntity; b: BotBrain } {
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
  const b = initBrain(id, 'rookie', 0, 1234);
  b.state = 'loot';
  b.path = [];
  b.pathAt = 0;
  return { p, b };
}

function itemAt(world: World, x: number, z: number, defId = 'medkit'): ItemEntity {
  const id = world.nextId();
  const it: ItemEntity = {
    id,
    kind: 'item',
    pos: v3(x, 1, z),
    alive: true,
    defId,
    rarity: 1,
    count: 2,
    fromCrate: false,
  };
  world.items.set(id, it);
  world.gridItems.insert(x, z, it);
  return it;
}

function vehicleAt(world: World, x: number, z: number): number {
  const id = world.nextId();
  const v: VehicleEntity = {
    id,
    kind: 'vehicle',
    pos: v3(x, 1, z),
    alive: true,
    defId: 'sedan',
    throttle: 0,
    steer: 0,
    speed: 0,
    yaw: 0,
    hp: 100,
    maxHp: 100,
    fuel: 100,
    tires: 4,
    engineBroken: false,
    occupants: [],
    inWater: false,
    _spd: 0,
  };
  world.vehicles.set(id, v);
  world.gridVehicles.insert(x, z, v);
  return id;
}

function ctxFor(world: World, zone: ZoneState, tick: number): BotCtx {
  return { world, zone, tick, dt: 1 / 30 };
}

// ---------------------------------------------------------------- helpers

/**
 * decide() only enters 'drive' via a 6% rng roll; pin it to true so the test
 * isoltes the drive FSM instead of the roll.
 */
function pinDrive(rng: BotBrain['rng']): void {
  vi.spyOn(rng, 'chance').mockReturnValue(true);
}

describe('bot loot approach', () => {
  test('walks at the loot item when the nav path is exhausted', () => {
    // Arrange: loot ahead at +x (3.5m), zone away in the -z/+x quadrant. The
    // zone direction is ~ -1.56 rad; the loot direction is ~ 0.
    const world = new World();
    const zone = makeZone(-500, -500);
    const { p, b } = setupBot(world, 6.5, 0);
    const item = itemAt(world, 10, 0);
    b.lootId = item.id;
    b.path = [];
    b.pathAt = 1000;

    // Act
    const out = updateBot(b, p, ctxFor(world, zone, 1000));

    // Assert: 3.2m < 6m means the old followPath consumed the only waypoint,
    // nulled the path, and blended zone-wander (dyaw ≈ -0.4). Now the bot
    // must keep walking at the item (dyaw near 0) with forward motion.
    expect(out.mv.f).toBeGreaterThan(0);
    expect(out.dyaw).toBeGreaterThan(-0.1);
  });

  test('presses use when inside the pickup radius', () => {
    // Arrange
    const world = new World();
    const zone = makeZone(-500, -500);
    const { p, b } = setupBot(world, 1.5, 0);
    const item = itemAt(world, 0, 0);
    b.lootId = item.id;
    b.path = [];
    b.pathAt = 1000;

    // Act
    const out = updateBot(b, p, ctxFor(world, zone, 1000));

    // Assert
    expect(out.use).toBe(true);
  });

  test('does not wander at the zone while a loot item is near', () => {
    // Arrange: item DIRECTLY behind the bot (-x, 2.3m). Correct behavior:
    // turn ~±π toward it (so |dyaw| = 0.4, the turn clamp). Zone to the
    // north-east would pull the yaw to ∠(+x,+z) ~ +0.78 rad instead.
    const world = new World();
    const zone = makeZone(500, 500);
    const { p, b } = setupBot(world, 2.3, 0);
    const item = itemAt(world, 0, 0);
    b.lootId = item.id;
    b.path = [];
    b.pathAt = 1000;

    // Act
    const out = updateBot(b, p, ctxFor(world, zone, 1000));

    // Assert: full-rate turn clamp (|dyaw| = 0.4) means the brain put the
    // item before the zone; a zone-wander body would read ~0.4 BUT also
    // PAST 0.4 with mv.f=0 since the followPath null-path branch wins.
    expect(Math.abs(out.dyaw)).toBeCloseTo(0.4);
    expect(out.mv.f).toBeGreaterThan(0);
  });
});

describe('bot vehicle approach', () => {
  test('walks straight at a nearby vehicle when the nav path is exhausted', () => {
    // Arrange: rook at 10m, vehicle at origin, bot yaw=0. Path [] → stall.
    const world = new World();
    const zone = makeZone(-500, -500);
    const { p, b } = setupBot(world, 10, 0);
    const vid = vehicleAt(world, 0, 0);
    pinDrive(b.rng);
    b.state = 'drive';
    b.lootId = vid;
    b.path = [];
    b.pathAt = 1000;
    // decide() re-runs every tick; re-declaration is fine since pinDrive
    // stays true, but lootId gets overwritten to vid via nearestVehicle.

    // Act
    const out = updateBot(b, p, ctxFor(world, zone, 1000));

    // Assert: turn to +x..? vehicle is at -x => atan2(0,-10)=+π clamped +0.4;
    // old bug blended toward (-500,-500) zone (atan2 ≈ -0.4). Distinguishes.
    expect(out.mv.f).toBeGreaterThan(0);
    expect(out.dyaw).toBeGreaterThan(0);
  });

  test('boards the vehicle when within boarding range', () => {
    // Arrange
    const world = new World();
    const zone = makeZone(-500, -500);
    const { p, b } = setupBot(world, 2, 0);
    const vid = vehicleAt(world, 0, 0);
    pinDrive(b.rng);
    b.state = 'drive';
    b.lootId = vid;
    b.path = [];
    b.pathAt = 1000;

    // Act
    const out = updateBot(b, p, ctxFor(world, zone, 1000));

    // Assert
    expect(out.use).toBe(true);
  });
});