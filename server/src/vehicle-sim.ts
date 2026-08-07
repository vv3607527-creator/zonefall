// vehicle-sim.ts — server-side arcade vehicle simulation: throttle/steer,
// fuel burn, tire/engine damage, water behaviour, boarding. Deterministic and
// light: simple Euler integration per tick over the heightfield.

import { PLAYER_RADIUS, MAX_VEHICLES, WORLD_SIZE } from '../../shared/src/consts.ts';

const WORLD_HALF = WORLD_SIZE / 2;
import { Rng } from '../../shared/src/rng.ts';
import { v3, type Vec3 } from '../../shared/src/math.ts';
import { VEHICLES, vehicleById, type VehicleDef } from '../../shared/src/vehicles.ts';
import { waterLevelAt, terrainHeight } from '../../shared/src/worldgen.ts';
import { WORLD_SEED } from '../../shared/src/consts.ts';
import type { GameEvent, InputSample, PlayerEntity, VehicleEntity } from '../../shared/src/types.ts';
import type { World } from './world.ts';

function makeVehicle(world: World, id: string, x: number, z: number, def: VehicleDef): VehicleEntity {
  const h = def.watercraft ? Math.max(waterLevelAt(x, z, WORLD_SEED), terrainHeight(x, z, WORLD_SEED)) : terrainHeight(x, z, WORLD_SEED);
  return {
    id: world.nextId(),
    kind: 'vehicle',
    pos: v3(x, h + 0.4, z),
    alive: true,
    defId: id,
    throttle: 0,
    steer: 0,
    speed: 0,
    yaw: 0,
    hp: def.hp,
    maxHp: def.hp,
    fuel: def.fuelCap,
    tires: def.wheels,
    engineBroken: false,
    occupants: [],
    inWater: false,
    _spd: 0,
  };
}

/** Scatter the fleet across the island deterministically from the match seed. */
export function spawnVehicles(world: World, seed: number): number {
  const rng = new Rng(seed ^ 0x76e3c0de);
  let placed = 0;
  for (let i = 0; i < MAX_VEHICLES; i++) {
    const defList = VEHICLES;
    const def = defList[i % defList.length];
    // Boats pick river positions; wheeled vehicles pick drivable terrain.
    let x = 0;
    let z = 0;
    for (let tries = 0; tries < 24; tries++) {
      x = rng.range(WORLD_SIZE / 2 - WORLD_HALF * 0.8, WORLD_SIZE / 2 + WORLD_HALF * 0.8);
      z = rng.range(WORLD_SIZE / 2 - WORLD_HALF * 0.8, WORLD_SIZE / 2 + WORLD_HALF * 0.8);
      const water = waterLevelAt(x, z, WORLD_SEED);
      if (def.watercraft) {
        // waterLevelAt returns SEA_LEVEL+0.35 (≈0.35) on any water cell.
        if (water >= 0.35) break;
      } else if (water < 0.3) {
        break;
      }
    }
    const v = makeVehicle(world, def.id, x, z, def);
    world.vehicles.set(v.id, v);
    placed++;
  }
  return placed;
}

export interface VehicleCtx {
  dt: number;
  tick: number;
  world: World;
  events: GameEvent[];
}

/** Advance all vehicles one tick. Mutates the shared vehicle entities. */
export function stepVehicles(ctx: VehicleCtx): void {
  const { world, dt, events } = ctx;
  for (const v of world.vehicles.values()) {
    if (!v.alive) continue;
    const def = vehicleById(v.defId);
    if (!def || v.engineBroken) {
      // Dead / broken hull: bleed off speed, still roll to a stop.
      v.speed *= 0.98;
    }

    const water = waterLevelAt(v.pos.x, v.pos.z, WORLD_SEED);
    // Water is binary: 0 on dry land, SEA_LEVEL+0.35 ≈ 0.35 on water.
    v.inWater = water >= 0.35;

    if (def && !v.engineBroken) {
      // Drag toward the target speed (throttle * top); the exponential
      // approach never overshoots, so speed stays at or below top even with
      // full throttle. A separate hard acceleration term double-counted and
      // converged ~11 m/s past top speed.
      const tireFactor = def.wheels === 0 ? 1 : Math.max(0.15, 1 - (def.wheels - v.tires) * def.tirePenalty);
      const top = def.maxSpeed * tireFactor;
      v.speed += (v.throttle * top - v.speed) * Math.min(1, (def.accel / def.maxSpeed) * dt * 3);
      if (v.inWater && !def.watercraft) v.speed = Math.min(v.speed, 2);

      // Steering scales with speed so cars feel planted at speed, twitchy at rest.
      const turnSpeed = Math.min(1, Math.abs(v.speed) / Math.max(4, def.maxSpeed * 0.35));
      v.yaw += def.turn * v.steer * turnSpeed * dt * Math.sign(v.speed || 1);

      // Fuel burn proportional to work done.
      v.fuel = Math.max(0, v.fuel - def.fuelPerM * Math.abs(v.speed) * dt);
      if (v.fuel <= 0) {
        v.speed = Math.max(0, v.speed - 4 * dt);
        if (v.speed === 0) v.engineBroken = true;
      }
    } else if (!def) {
      // Unknown def: nudge hull back to terrain and stop.
      v.speed *= 0.9;
    }

    // Integrate position.
    const dx = Math.cos(v.yaw) * v.speed * dt;
    const dz = Math.sin(v.yaw) * v.speed * dt;
    v.pos.x += dx;
    v.pos.z += dz;
    v.pos.x = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, v.pos.x));
    v.pos.z = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, v.pos.z));

    // Ground/water height.
    const ground = terrainHeight(v.pos.x, v.pos.z, WORLD_SEED);
    const surface = Math.max(ground, v.inWater ? water : ground);
    v.pos.y = Math.max(v.pos.y, surface + 0.25);

    // Terrain crash: huge vertical jump means a "roll over" — damage hull.
    if (Math.abs(v.pos.y - surface) > 4) {
      v.hp = Math.max(0, v.hp - 15 * dt);
      v.pos.y = surface + 0.25;
      v.speed *= 0.5;
    }
    if (v.hp <= 0) {
      v.alive = false;
      for (const occ of [...v.occupants]) {
        const p = world.players.get(occ);
        if (p) {
          p.vehicleId = -1;
          p.isDriving = false;
          p.state = 'playing';
        }
      }
      events.push({ t: 'vehicle', id: v.id, defId: v.defId, owner: -1 });
    }
  }
  world.rebuildGrids();
}

/** Map a player's input onto a vehicle (throttle/steer/handbrake). */
export function driveFromInput(v: VehicleEntity, input: InputSample): void {
  v.throttle = input.mv.f;
  v.steer = input.mv.s;
}

/** Player enters the nearest seat-free vehicle (or the driver slot). */
export function tryEnter(world: World, p: PlayerEntity, nearest: VehicleEntity | undefined, events: GameEvent[]): boolean {
  if (!nearest) return false;
  if (nearest.occupants.length >= (vehicleById(nearest.defId)?.seats ?? 4)) return false;
  if (p.state === 'dead' || p.state === 'spectating') return false;
  // Board only the passenger seat; a driver-less vehicle gets the player as driver.
  const previouslyDriving = p.vehicleId !== -1;
  if (previouslyDriving) exitVehicle(world, p);
  nearest.occupants.push(p.id);
  p.vehicleId = nearest.id;
  p.isDriving = nearest.occupants.length === 1;
  p.state = 'playing';
  p.pos.x = nearest.pos.x;
  p.pos.z = nearest.pos.z;
  if (!previouslyDriving) events.push({ t: 'vehicle', id: nearest.id, defId: nearest.defId, owner: p.id });
  return true;
}

/** Eject a player from whichever vehicle they occupy. */
export function exitVehicle(world: World, p: PlayerEntity): void {
  if (p.vehicleId === -1) return;
  const v = world.vehicles.get(p.vehicleId);
  if (v) {
    v.occupants = v.occupants.filter((o) => o !== p.id);
    if (v.occupants.length === 1) {
      const driver = world.players.get(v.occupants[0]);
      if (driver) driver.isDriving = true;
    }
    p.pos.x = v.pos.x + Math.cos(v.yaw) * 2.2;
    p.pos.z = v.pos.z + Math.sin(v.yaw) * 1.6;
  }
  p.vehicleId = -1;
  p.isDriving = false;
}

/** Repair kit: restores hull to max and fuel to full. */
export function repairVehicle(v: VehicleEntity): void {
  const def = vehicleById(v.defId);
  if (!def) return;
  v.hp = def.hp;
  v.fuel = def.fuelCap;
  v.tires = def.wheels;
  v.engineBroken = false;
}

/** Damage a vehicle (bullets, grenades). Tires/engine degrade at thresholds. */
export function damageVehicle(v: VehicleEntity, amount: number): void {
  const def = vehicleById(v.defId);
  if (!def) return;
  v.hp = Math.max(0, v.hp - amount);
  const frac = v.hp / def.hp;
  if (frac < 0.2 || amount > 40) {
    v.engineBroken = true;
  }
  // Lose tires with damage.
  const tiresLost = Math.floor((1 - frac) * def.wheels);
  v.tires = Math.max(0, def.wheels - tiresLost);
  v._spd = v.speed;
}