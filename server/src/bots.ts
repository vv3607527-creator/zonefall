// bots.ts — server-side bot brains. 99 bots fill the arena alongside the human.
// Each bot runs a small FSM (plane → drop → loot → rotate → engage → heal →
// drive); decisions happen at a low cadence to keep the tick loop cheap.

import { Rng } from '../../shared/src/rng.ts';
import { v3, v3distXZ, clamp } from '../../shared/src/math.ts';
import { PLANE_SPEED, TICK_RATE, WORLD_SIZE } from '../../shared/src/consts.ts';
import { WEAPONS } from '../../shared/src/weapons.ts';
import { ITEMS } from '../../shared/src/items.ts';
import { NAVGRAPH } from './ai-nav.ts';
import type { InputSample, PlayerEntity, ZoneState } from '../../shared/src/types.ts';
import type { World } from './world.ts';

export type BotTier = 'rookie' | 'veteran' | 'elite';

export interface BotTierDef {
  /** Decision cadence in server ticks. */
  decideEvery: number;
  /** Aim error added on top of distance falloff (radians). */
  aimSpread: number;
  /** Ticks before a bot reacts to a target (delayed aim lock). */
  reaction: number;
  /** Max detection range in meters. */
  detect: number;
  /** Movement speed scale 0..1. */
  move: number;
  /** Fire burst length. */
  burst: number;
}

export const BOT_TIERS: Record<BotTier, BotTierDef> = {
  rookie: { decideEvery: 5, aimSpread: 0.14, reaction: 8, detect: 110, move: 0.72, burst: 3 },
  veteran: { decideEvery: 3, aimSpread: 0.07, reaction: 5, detect: 160, move: 0.88, burst: 5 },
  elite: { decideEvery: 2, aimSpread: 0.03, reaction: 3, detect: 220, move: 1.0, burst: 7 },
};

/** One full plane crossing (from -2048-200 to +2048+200 @ 60 m/s) in ticks. */
const FLIGHT_TICKS = Math.round(((WORLD_SIZE + 400) / PLANE_SPEED) * TICK_RATE);

const BOT_NAMES = [
  'Rusty Vale', 'Nadine Ortiz', 'Cade Mercer', 'Lia Volt', 'Oscar Greaves', 'Mira Delacroix',
  'Silas Reyes', 'Tessa Nord', 'Gus Calloway', 'Wren Fable', 'Kade Sorrel', 'Opal Vane',
  'Ren Book', 'Ivy Harrow', 'Colt Bramble', 'Zane Mercer', 'June Oka', 'Petra Lind',
  'Axel Rune', 'Mona Silva', 'Toren Gale', 'Esme Pike', 'Hale Corso', 'Briar Nero',
  'Omari Frost', 'Sable Quinn', 'Vitro Lane', 'Ida Fenn', 'Reed Harbor', 'Lux Verri',
  'Nim Cable', 'Otto Larch', 'Vera Mint', 'Kwame Ash', 'Rowan Dust', 'Fela Nimbus',
  'Juno Feld', 'Bram Sleet', 'Ilse Bark', 'Mako Tern', 'Grey Alden', 'Peony Reed',
  'Cam Ives', 'Dune Voss', 'Sana Drift', 'Tobin Kite', 'Alma Quarry', 'Rex Slate',
  'Noor Vale', 'Ember Rook', 'Pax Harbor', 'Sylvie Nook', 'Orion Bell', 'Kess Plumb',
  'Marlow Dune', 'Trin Watt', 'Huxley Fern', 'Yara Crate', 'Nolan Spar',
];

export interface BotBrain {
  tier: BotTier;
  nextThinkTick: number;
  state: 'drop' | 'loot' | 'rotate' | 'engage' | 'heal' | 'drive';
  targetId: number;
  path: { x: number; z: number }[] | null;
  pathAt: number;
  lootId: number;
  dropTick: number;
  lastSeeTick: number;
  burstLeft: number;
  /** Persistent personal RNG streams from seeded match RNG. */
  rng: Rng;
}

const brains = new Map<number, BotBrain>();

export function getBrain(id: number): BotBrain | undefined {
  return brains.get(id);
}

export function clearBrains(): void {
  brains.clear();
}

/** Assign tier + brain state for a freshly created bot. */
export function initBrain(id: number, tier: BotTier, dropTick: number, seed: number): BotBrain {
  const b: BotBrain = {
    tier,
    nextThinkTick: 0,
    state: 'drop',
    targetId: -1,
    path: null,
    pathAt: 0,
    lootId: -1,
    dropTick,
    lastSeeTick: -999,
    burstLeft: 0,
    rng: new Rng(seed ^ (id * 0x9e3779b1)),
  };
  brains.set(id, b);
  return b;
}

/**
 * Fraction along the flight path (from→to) nearest to a target point,
 * clamped to [0, 1] so it always names a point on the segment.
 */
function dropFractionAlong(
  path: { from: { x: number; z: number }; to: { x: number; z: number } },
  target: { x: number; z: number },
): number {
  const dx = path.to.x - path.from.x;
  const dz = path.to.z - path.from.z;
  const denom = dx * dx + dz * dz;
  if (denom <= 0) return 0.5;
  const t = ((target.x - path.from.x) * dx + (target.z - path.from.z) * dz) / denom;
  return clamp(t, 0, 1);
}

/** Create bots to fill the arena up to `count`. Returns the brains created. */
export function createBots(
  world: World,
  fillTo: number,
  seed: number,
  flightStartTick: number,
  padCenter: { x: number; z: number },
  flightPath: { from: { x: number; z: number }; to: { x: number; z: number } },
  zoneCenter: { x: number; z: number },
): BotBrain[] {
  const rng = new Rng(seed ^ 0x2b4c3f6d);
  const melee = WEAPONS.find((w) => w.category === 'melee');
  const made: BotBrain[] = [];
  // Drop targeting: jump near the spot on the plane line closest to the
  // initial safe-zone center (with a little spread), so every bot lands
  // inside the first circle and survives to loot and fight instead of being
  // zone-killed at the map edge. match.ts rolls the path to guarantee the
  // line passes within reach of the circle, so the projection always lands.
  const dropFracBase = dropFractionAlong(flightPath, zoneCenter);
  while (world.players.size < fillTo) {
    const id = world.nextId();
    // Same pad layout humans get from match.addPlayer.
    const padAngle = (id % 24) * (Math.PI * 2 / 24);
    const padR = 14 + (id % 3) * 5;
    const padX = padCenter.x + Math.cos(padAngle) * padR;
    const padZ = padCenter.z + Math.sin(padAngle) * padR;
    const y = Math.max(world.heightAt(padX, padZ) + 1, 1);
    const tierRoll = rng.next();
    const tier: BotTier = tierRoll < 0.45 ? 'rookie' : tierRoll < 0.8 ? 'veteran' : 'elite';
    // Jump near the zone-center projection; ±0.05 spreads the 99 drops along
    // ~225-375 m of the line so they cluster inside the initial circle.
    const dropFrac = clamp(dropFracBase + rng.range(-0.05, 0.05), 0.05, 0.95);
    const dropAt = flightStartTick + Math.round(FLIGHT_TICKS * dropFrac);
    const nameIdx = Math.floor(Rng.hashStr('bot-' + id) * BOT_NAMES.length) % BOT_NAMES.length;
    const p: PlayerEntity = {
      id,
      kind: 'bot',
      name: BOT_NAMES[nameIdx] + '#' + id,
      state: 'lobby',
      pos: v3(padX, y, padZ),
      alive: true,
      yaw: rng.range(0, Math.PI * 2),
      pitch: 0,
      moveSpeed: 0,
      hp: 100,
      maxHp: 100,
      armor: 0,
      stim: 0,
      slot0: melee ? melee.id : -1,
      slot1: -1,
      activeSlot: 0,
      equippedWeapon: melee ? melee.id : -1,
      inv: [0, 2], // 2 bandages so bots can self-heal out of the box
      ammo: melee ? [36, 36, 24, 12, 0] : [0, 0, 0, 0, 0],
      vehicleId: -1,
      isDriving: false,
      chuteOpen: false,
      suppression: 0,
      kills: 0,
      lastHitTick: 0,
      skin: rng.int(0, 7),
      ping: rng.int(30, 120),
      lean: 0,
      lastFireTick: 0,
    };
    world.players.set(id, p);
    made.push(initBrain(id, tier, dropAt, seed));
  }
  return made;
}

// ---------------------------------------------------------------- targeting

function findTarget(b: BotBrain, p: PlayerEntity, world: World): PlayerEntity | null {
  const tier = BOT_TIERS[b.tier];
  let best: PlayerEntity | null = null;
  let bestD = tier.detect * tier.detect;
  for (const o of world.alivePlayers()) {
    if (o.id === p.id || o.state !== 'playing') continue;
    const d = v3distXZ(p.pos, o.pos);
    if (d > tier.detect) continue;
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best;
}

function nearestLoot(world: World, p: PlayerEntity, radius: number): number {
  const near = world.gridItems.queryCircle(p.pos.x, p.pos.z, radius);
  let bestId = -1;
  let bestD = radius * radius;
  for (const i of near) {
    if (!i.alive) continue;
    const d = v3distXZ(p.pos, i.pos);
    if (d < bestD) {
      bestD = d;
      bestId = i.id;
    }
  }
  return bestId;
}

function hasHeal(p: PlayerEntity): boolean {
  for (let i = 0; i < p.inv.length; i += 2) {
    const def = ITEMS[p.inv[i]];
    if (def && def.kind === 'heal') return true;
  }
  return false;
}

function nearestVehicle(world: World, p: PlayerEntity): number {
  const near = world.gridVehicles.queryCircle(p.pos.x, p.pos.z, 26);
  let bestId = -1;
  let bestD = 26 * 26;
  for (const v of near) {
    if (!v.alive) continue;
    const d = v3distXZ(p.pos, v.pos);
    if (d < bestD) {
      bestD = d;
      bestId = v.id;
    }
  }
  return bestId;
}

/** Decide a bot's goal for this cadence and stash it on the brain. */
function decide(b: BotBrain, p: PlayerEntity, world: World, zone: ZoneState, tick: number): void {
  if (p.state !== 'playing') {
    b.state = 'drop';
    return;
  }

  // Emergency heal trumps everything.
  if (p.hp < 42 && hasHeal(p)) {
    b.state = 'heal';
    b.targetId = -1;
    b.path = null;
    return;
  }

  const target = findTarget(b, p, world);
  // Unarmed bots prioritise grabbing a gun over fighting: land → loot →
  // fight, like a real drop. A recently-landed bot on the hot drop that
  // walks into melee before arming is realistic, but constant 'engage' with
  // no weapons produced melee-only matches.
  const gunArmed = p.equippedWeapon >= 1 && p.equippedWeapon <= 28;
  const nearestThreat = target;

  if (!gunArmed && nearestThreat !== null && p.hp > 30) {
    const threatD = v3distXZ(p.pos, nearestThreat.pos);
    const lootId2 = nearestLoot(world, p, 45);
    if (lootId2 !== -1 && threatD > 15) {
      b.state = 'loot';
      b.lootId = lootId2;
      b.targetId = -1;
    } else {
      b.state = 'engage';
      b.targetId = nearestThreat.id;
      b.lastSeeTick = tick;
    }
  } else if (target && p.hp > 30) {
    b.state = 'engage';
    b.targetId = target.id;
    b.lastSeeTick = tick;
  } else {
    b.lootId = nearestLoot(world, p, gunArmed ? 22 : 45);
    b.state = b.lootId !== -1 ? 'loot' : 'rotate';
    if (b.lootId === -1 && b.state === 'rotate') {
      // Long-distance option: take a vehicle if the zone is far away.
      if (b.rng.chance(0.06)) {
        const vid = nearestVehicle(world, p);
        if (vid !== -1) {
          b.state = 'drive';
          b.lootId = vid;
        }
      }
    }
  }

  // Re-path occasionally.
  if (tick - b.pathAt > 40 || (b.path === null && b.state !== 'engage')) {
    b.pathAt = tick;
    if (b.state === 'rotate') {
      b.path = NAVGRAPH.path(p.pos.x, p.pos.z, zone.center.x, zone.center.z);
    } else if (b.state === 'loot') {
      const it = world.items.get(b.lootId);
      b.path = it ? NAVGRAPH.path(p.pos.x, p.pos.z, it.pos.x, it.pos.z) : null;
      if (!b.path) b.lootId = -1;
    } else if (b.state === 'drive') {
      const v = world.vehicles.get(b.lootId);
      b.path = v ? NAVGRAPH.path(p.pos.x, p.pos.z, v.pos.x, v.pos.z) : null;
    }
  }
}

// ---------------------------------------------------------------- tick

export interface BotCtx {
  world: World;
  zone: ZoneState;
  tick: number;
  dt: number;
  planePos?: { x: number; z: number };
}

/**
 * Produce this tick's InputSample for a bot. Mutates the brain (FSM state,
 * burst counters). Cheap: aiming math is O(1), path following is a lookup.
 */
export function updateBot(b: BotBrain, p: PlayerEntity, ctx: BotCtx): InputSample {
  const tier = BOT_TIERS[b.tier];
  const out: InputSample = {
    seq: ctx.tick,
    mv: { f: 0, s: 0 },
    dyaw: 0,
    dpitch: 0,
    fire: false,
    ads: false,
    sprint: true,
    crouch: false,
    jump: false,
    lean: 0,
    switchSlot: -1,
    use: false,
    throw: false,
  };

  // Plane: jump out at the scheduled drop tick.
  if (p.state === 'plane') {
    out.jump = ctx.tick >= b.dropTick;
    return out;
  }
  if (p.state === 'skydive' || p.state === 'parachute') {
    // Steer toward the zone so bots land somewhere relevant.
    const dz = ctx.zone.center.z - p.pos.z;
    const dx = ctx.zone.center.x - p.pos.x;
    const yawTo = Math.atan2(dz, dx);
    let dyaw = yawTo - p.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    out.dyaw = Math.max(-0.5, Math.min(0.5, dyaw));
    out.mv.f = 0.9;
    return out;
  }

  // Not in the arena yet (lobby) — stand still; the plane phase will carry
  // bots to their scheduled drop. Acting here only walks them off the pad.
  if (p.state !== 'playing') {
    b.state = 'drop';
    return out;
  }

  decide(b, p, ctx.world, ctx.zone, ctx.tick);
  switch (b.state) {
    case 'heal': {
      // Hold still and use a heal item; sim's action handler applies it.
      out.use = ctx.tick % 6 < 2;
      const target = findTarget(b, p, ctx.world);
      if (target) aimAt(out, p, target, b, ctx);
      return out;
    }
    case 'engage': {
      const target = ctx.world.players.get(b.targetId);
      if (target && target.alive && target.state === 'playing') {
        aimAt(out, p, target, b, ctx);
        const d = v3distXZ(p.pos, target.pos);
        const inRange = d < 240;
        if (inRange && b.burstLeft > 0) {
          out.fire = true;
          b.burstLeft--;
        } else if (inRange && ctx.tick % tier.decideEvery === 0 && b.rng.chance(0.4)) {
          b.burstLeft = tier.burst;
        }
        // Stafe perpendicular to the target line for cover jukes.
        const to = { x: target.pos.x - p.pos.x, z: target.pos.z - p.pos.z };
        const len = Math.hypot(to.x, to.z) || 1;
        out.mv.s = ctx.tick % 40 < 20 ? 0.9 : -0.9;
        out.mv.f = 0.35;
      } else {
        b.targetId = -1;
        b.state = 'rotate';
      }
      return out;
    }
    case 'loot': {
      const item = ctx.world.items.get(b.lootId);
      if (!item) {
        b.lootId = -1;
        b.state = 'rotate';
        return out;
      }
      followPath(out, p, b, ctx);
      // Pathless (or final waypoint consumed): close the gap straight at the
      // item instead of wandering toward the zone.
      if (!b.path || b.path.length === 0) {
        walkToward(out, p, b, ctx, item.pos.x, item.pos.z);
      }
      const d = v3distXZ(p.pos, item.pos);
      if (d < 2.0) out.use = true;
      if (d < 12) {
        const target = findTarget(b, p, ctx.world);
        if (target) aimAt(out, p, target, b, ctx);
      }
      return out;
    }
    case 'drive': {
      const v = ctx.world.vehicles.get(b.lootId);
      if (!v || !v.alive) {
        b.state = 'rotate';
        return out;
      }
      const d = v3distXZ(p.pos, v.pos);
      if (d > 3.2) {
        if (p.vehicleId === v.id) {
          // Already aboard but the vehicle drifted: fine, keep driving.
          driveTowardZone(out, p, v, ctx);
          return out;
        }
        followPath(out, p, b, ctx);
        if (!b.path || b.path.length === 0) {
          walkToward(out, p, b, ctx, v.pos.x, v.pos.z);
        }
        return out;
      }
      // Board once, then drive.
      if (p.vehicleId !== v.id) {
        out.use = true;
      } else {
        out.mv.f = 0.85;
        driveTowardZone(out, p, v, ctx);
      }
      return out;
    }
    default: {
      // rotate: path to zone center.
      followPath(out, p, b, ctx);
      const target = findTarget(b, p, ctx.world);
      if (target && v3distXZ(p.pos, target.pos) < 40) aimAt(out, p, target, b, ctx);
      return out;
    }
  }
}

// ---------------------------------------------------------------- helpers

/** Steer the vehicle toward the zone using its yaw (not the player's). */
function driveTowardZone(out: InputSample, p: PlayerEntity, v: { yaw: number }, ctx: BotCtx): void {
  const dz = ctx.zone.center.z - p.pos.z;
  const dx = ctx.zone.center.x - p.pos.x;
  let d = Math.atan2(dz, dx) - v.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  out.mv.f = 0.85;
  out.mv.s = Math.max(-1, Math.min(1, d * 2.4));
}

/** Follow the brain's path; advances the waypoint pointer when reached. */
function followPath(out: InputSample, p: PlayerEntity, b: BotBrain, ctx: BotCtx): void {
  let path = b.path;
  if (!path || path.length === 0) {
    // No path: idle-wander toward zone.
    const dz = ctx.zone.center.z - p.pos.z;
    const dx = ctx.zone.center.x - p.pos.x;
    const yawTo = Math.atan2(dz, dx);
    out.dyaw = Math.max(-0.5, Math.min(0.5, yawTo - p.yaw));
    out.mv.f = BOT_TIERS[b.tier].move;
    return;
  }
  const wp = path[0];
  const dx = wp.x - p.pos.x;
  const dz = wp.z - p.pos.z;
  const d = Math.hypot(dx, dz);
  // Consume intermediate waypoints loosely (d < 6) for smooth corners — but
  // never consume the FINAL waypoint: it is the destination itself. Walking
  // it directly closes the last ~6m gap; dropping it here made the bot fall
  // back to zone-wander ~6m short of loot (never within the 2m pickup
  // radius) and stall short of vehicles — hence melee-only bots.
  if (d < 6 && path.length > 1) {
    path.shift();
    return followPath(out, p, b, ctx);
  }
  const yawTo = Math.atan2(dz, dx);
  let dyaw = yawTo - p.yaw;
  while (dyaw > Math.PI) dyaw -= Math.PI * 2;
  while (dyaw < -Math.PI) dyaw += Math.PI * 2;
  out.dyaw = Math.max(-0.4, Math.min(0.4, dyaw));
  out.mv.f = BOT_TIERS[b.tier].move;
}

/** Walk directly at a world point when no nav path exists or it ran out. */
function walkToward(
  out: InputSample,
  p: PlayerEntity,
  b: BotBrain,
  ctx: BotCtx,
  x: number,
  z: number,
): void {
  const yawTo = Math.atan2(z - p.pos.z, x - p.pos.x);
  let dyaw = yawTo - p.yaw;
  while (dyaw > Math.PI) dyaw -= Math.PI * 2;
  while (dyaw < -Math.PI) dyaw += Math.PI * 2;
  out.dyaw = Math.max(-0.4, Math.min(0.4, dyaw));
  out.mv.f = BOT_TIERS[b.tier].move;
}

/** Rotate toward a target with tier-based inaccuracy + burst control. */
function aimAt(out: InputSample, p: PlayerEntity, target: PlayerEntity, b: BotBrain, ctx: BotCtx): void {
  const tier = BOT_TIERS[b.tier];
  // Reaction: only track a target we've recently seen.
  if (ctx.tick - b.lastSeeTick > tier.reaction) return;
  const tx = target.pos.x;
  const tz = target.pos.z;
  const ty = target.pos.y + 1.2;
  const dx = tx - p.pos.x;
  const dz = tz - p.pos.z;
  const dy = ty - p.pos.y;
  const flat = Math.hypot(dx, dz) || 1;
  // Inaccuracy grows with distance and tier.
  const spread = tier.aimSpread * (1 + flat / 120);
  const jx = b.rng.range(-spread, spread);
  const jz = b.rng.range(-spread, spread);
  const yawTo = Math.atan2(dz + jz, dx + jx);
  const pitchTo = Math.atan2(dy, flat);
  let dyaw = yawTo - p.yaw;
  while (dyaw > Math.PI) dyaw -= Math.PI * 2;
  while (dyaw < -Math.PI) dyaw += Math.PI * 2;
  out.dyaw = Math.max(-0.6, Math.min(0.6, dyaw));
  out.dpitch = Math.max(-0.6, Math.min(0.6, pitchTo - p.pitch));
  out.ads = flat > 60;
}