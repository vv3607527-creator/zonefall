// combat.ts — authoritative gunplay: weapon fire, projectile ballistics,
// hit detection, armor/damage application, melee and throwable explosives.
// Human and bot fire both funnel through fireWeapon / stepBullets.

import { Rng } from '../../shared/src/rng.ts';
import { v3, v3dist, dirFromAngles, type Vec3 } from '../../shared/src/math.ts';
import { spawnProjectile, stepProjectile, type Projectile } from '../../shared/src/ballistics.ts';
import { computeShotDamage, explosiveDamage } from '../../shared/src/damage.ts';
import { ammoIndex, weaponById, type WeaponDef } from '../../shared/src/weapons.ts';
import type { GameEvent, PlayerEntity } from '../../shared/src/types.ts';
import { eyeOf } from './player-controller.ts';
import type { World } from './world.ts';

export interface CombatCtx {
  events: GameEvent[];
  tick: number;
  rng: Rng;
}

// Per-player combat state that must NOT travel on the wire.
interface FireState {
  inMag: number;
  reloadUntil: number; // server tick when reload completes (0 = none)
  recoilAcc: number;   // accumulated vertical recoil counter for recovery
  heldFire: boolean;   // previous sample's fire state (semi-auto edge detect)
  reloading: boolean;
}
const fireState = new Map<number, FireState>();

export function getFireState(id: number): FireState {
  let s = fireState.get(id);
  if (!s) {
    s = { inMag: 0, reloadUntil: 0, recoilAcc: 0, heldFire: false, reloading: false };
    fireState.set(id, s);
  }
  return s;
}

export function resetCombat(id: number): void {
  fireState.delete(id);
}

// ---------------------------------------------------------------- fire

/** Try to fire the equipped weapon for this tick. Mutates p + world + events. */
export function fireWeapon(world: World, p: PlayerEntity, fire: boolean, ctx: CombatCtx): void {
  if (p.state !== 'playing' && p.state !== 'parachute') return;
  const w = weaponById(p.equippedWeapon);
  if (!w) return;

  if (w.category === 'melee') {
    if (fire && ctx.tick >= p.lastFireTick + 24) tryMelee(world, p, w, ctx);
    return;
  }

  const st = getFireState(p.id);
  const shotsPerSec = w.rpm / 60;
  const minTicks = Math.max(1, Math.round(30 / shotsPerSec));

  // Edge detection for semi-auto: a rising fire edge is required between shots.
  const rising = fire && !st.heldFire;
  const canFire = ctx.tick >= p.lastFireTick + minTicks && (w.auto ? fire : rising);
  st.heldFire = fire;
  if (!canFire) return;

  if (st.inMag <= 0) {
    startReload(p, st, ctx.tick);
    return;
  }

  fireOne(world, p, w, st, ctx);
}

/** Actually fire: build projectile(s), spend ammo, apply recoil. */
function fireOne(world: World, p: PlayerEntity, w: WeaponDef, st: FireState, ctx: CombatCtx): void {
  const ammo = ammoIndex(w.ammo);
  if (p.ammo[ammo] <= 0 && st.inMag <= 0) return; // no reserve and empty mag
  if (st.inMag <= 0) {
    startReload(p, st, ctx.tick);
    return;
  }

  st.inMag--;
  st.heldFire = true;
  p.lastFireTick = ctx.tick;

  // Recoil: kick pitch up, accumulate drift for horizontal sway.
  p.pitch = Math.min(1.5, p.pitch + w.recoilV);
  st.recoilAcc = Math.min(0.35, st.recoilAcc + w.recoilV);
  const sway = w.recoilH * (ctx.rng.next() * 2 - 1) * st.recoilAcc * 40;
  const yaw = p.yaw + sway;

  // Spread: baseline; ADS tightens it. Recoil accumulation widens it slightly.
  const spreadRad = (w.spread * Math.PI) / 180;

  const muzzle = eyeOf(p);
  const baseDir = dirFromAngles(yaw, p.pitch);
  const pellets = w.pellets > 0 ? w.pellets : 1;
  for (let i = 0; i < pellets; i++) {
    const jit: [number, number] = [ctx.rng.next() * 2 - 1, ctx.rng.next() * 2 - 1];
    const proj = spawnProjectile(
      p.id, muzzle, baseDir,
      { id: w.id, dmg: w.dmg, muzzle: w.muzzle, gravityMul: w.gravityMul, pen: w.pen },
      pellets > 1 ? spreadRad * 2.5 : spreadRad,
      jit,
      pellets > 1 ? 'chest' : limbFor(p),
    );
    world.bullets.set(world.nextId(), proj);
  }
}

/** Reserve ammo consumed when a reload completes. */
export function finishReload(p: PlayerEntity, w: WeaponDef): void {
  const st = getFireState(p.id);
  st.reloading = false;
  st.reloadUntil = 0;
  const ammo = ammoIndex(w.ammo);
  const need = w.mag - st.inMag;
  const take = Math.min(need, p.ammo[ammo]);
  st.inMag += take;
  p.ammo[ammo] -= take;
}

function startReload(p: PlayerEntity, st: FireState, tick: number): void {
  if (st.reloading) return;
  const w = weaponById(p.equippedWeapon);
  if (!w) return;
  const ammo = ammoIndex(w.ammo);
  if (p.ammo[ammo] <= 0 && st.inMag <= 0) return;
  st.reloading = true;
  st.reloadUntil = tick + Math.round(w.reload * 30);
}

export function tickReload(p: PlayerEntity, ctx: CombatCtx): void {
  const st = getFireState(p.id);
  if (!st.reloading || st.reloadUntil <= 0) return;
  if (ctx.tick >= st.reloadUntil) {
    const w = weaponById(p.equippedWeapon);
    if (w) finishReload(p, w);
  }
}

// ---------------------------------------------------------------- bullets

/** Sample spacing (m) when marching a bullet segment for hit tests. */
const HIT_SUBSTEP = 0.75;

/** Advance all projectiles one tick; resolve hits. Mutates world + events. */
export function stepBullets(world: World, ctx: CombatCtx): void {
  const dt = 1 / 30;
  const ids = [...world.bullets.keys()];
  for (const id of ids) {
    const b = world.bullets.get(id);
    if (!b) continue;
    const nb = stepProjectile(b, dt);
    if (nb.traveled > 1500) { // max range cull
      world.bullets.delete(id);
      continue;
    }
    world.bullets.set(id, nb);

    // Terrain / water impact.
    const h = world.heightAt(nb.pos.x, nb.pos.z);
    const wl = world.waterAt(nb.pos.x, nb.pos.z);
    const waterY = 0.75;
    if (nb.pos.y <= h || (wl > 0 && nb.pos.y <= waterY)) {
      if (nb.pen > 0 && nb.pos.y > h) {
        // Thin cover: burn penetration and continue.
        world.bullets.set(id, { ...nb, pen: nb.pen - 1 });
      } else {
        world.bullets.delete(id);
      }
      continue;
    }

    // Player/vehicle hit: march the segment so a fast bullet cannot tunnel
    // straight past a body between ticks. Terrain check stays once per tick.
    const segLen = v3dist(nb.pos, b.pos);
    const steps = Math.max(1, Math.ceil(segLen / HIT_SUBSTEP));
    const wep = weaponById(nb.weaponId);
    const range = wep ? wep.range : 300;
    let struck = false;
    for (let q = 1; q <= steps && !struck; q++) {
      const t = q / steps;
      const sample = {
        x: b.pos.x + (nb.pos.x - b.pos.x) * t,
        y: b.pos.y + (nb.pos.y - b.pos.y) * t,
        z: b.pos.z + (nb.pos.z - b.pos.z) * t,
      };
      const pHit = nearestPlayerAt(world, sample, 1.0);
      if (pHit && pHit.id !== nb.shooter && pHit.alive && pHit.state !== 'dead') {
        const limb = limbAt(pHit, sample.y);
        const dist = v3dist(sample, pHit.pos);
        const res = computeShotDamage(nb.dmg, dist, limb, { range }, pHit.armor);
        damagePlayer(world, pHit, nb.shooter, res.hp, res.armor, limb, res.headshot, nb.weaponId, ctx);
        struck = true;
      } else {
        const vHit = nearestVehicleAt(world, sample, 2.2);
        if (vHit) {
          vHit.hp = Math.max(0, vHit.hp - nb.dmg);
          struck = true;
        }
      }
    }
    if (struck) world.bullets.delete(id);
  }
}

function limbAt(p: PlayerEntity, y: number): string {
  const rel = y - p.pos.y;
  if (rel >= 1.5) return 'head';
  if (rel >= 1.05) return 'chest';
  if (rel >= 0.72) return 'abdomen';
  return 'leg';
}

function limbFor(p: PlayerEntity): string {
  const r = Math.random();
  if (p.state === 'parachute') return 'chest';
  return r < 0.5 ? 'chest' : r < 0.8 ? 'abdomen' : 'arm';
}

function nearestPlayerAt(world: World, pos: Vec3, radius: number): PlayerEntity | null {
  let best: PlayerEntity | null = null;
  let bestD = radius;
  for (const other of world.gridPlayers.queryCircle(pos.x, pos.z, radius * 3)) {
    if (!other.alive) continue;
    const d = Math.hypot(other.pos.x - pos.x, other.pos.z - pos.z);
    const yOk = Math.abs(pos.y - (other.pos.y + 0.9)) < 1.6;
    if (d < bestD && yOk) {
      bestD = d;
      best = other;
    }
  }
  return best;
}

function nearestVehicleAt(world: World, pos: Vec3, radius: number) {
  let best: { hp: number } | null = null;
  let bestD = radius;
  for (const v of world.gridVehicles.queryCircle(pos.x, pos.z, radius * 3)) {
    const d = Math.hypot(v.pos.x - pos.x, v.pos.z - pos.z);
    if (d < bestD) {
      bestD = d;
      best = v;
    }
  }
  return best;
}

// ---------------------------------------------------------------- damage

/** Apply damage to a player; emits hit/kill events. Mutates victim. */
export function damagePlayer(
  world: World,
  victim: PlayerEntity,
  attackerId: number,
  hp: number,
  armorDmg: number,
  limb: string,
  headshot: boolean,
  weaponId: number,
  ctx: CombatCtx,
): void {
  if (!victim.alive) return;
  const maxArmor = 100;
  victim.armor = Math.max(0, Math.min(maxArmor, victim.armor - armorDmg));
  victim.hp = Math.max(0, victim.hp - hp);
  victim.lastHitTick = ctx.tick;
  victim.suppression = Math.min(1, victim.suppression + 0.25);

  ctx.events.push({ t: 'hit', victim: victim.id, attacker: attackerId, dmg: hp, limb });

  if (victim.hp <= 0) {
    victim.hp = 0;
    victim.alive = false;
    victim.state = 'dead';
    const killer = world.players.get(attackerId);
    if (killer && killer !== victim) killer.kills++;
    ctx.events.push({ t: 'kill', killer: attackerId, victim: victim.id, weaponId, headshot });
    // Eject vehicle occupant.
    const veh = victim.vehicleId >= 0 ? world.vehicles.get(victim.vehicleId) : undefined;
    if (veh) {
      veh.occupants = veh.occupants.filter((o) => o !== victim.id);
      victim.vehicleId = -1;
      victim.isDriving = false;
    }
  }
}

// ---------------------------------------------------------------- melee

function tryMelee(world: World, p: PlayerEntity, w: WeaponDef, ctx: CombatCtx): void {
  p.lastFireTick = ctx.tick;
  const reach = w.range > 0 ? w.range : 3;
  for (const other of world.gridPlayers.queryCircle(p.pos.x, p.pos.z, reach * 2)) {
    if (other === p || !other.alive || other.state === 'dead') continue;
    const d = v3dist(p.pos, other.pos);
    if (d <= reach) {
      const res = computeShotDamage(w.dmg, d, 'chest', w, other.armor);
      damagePlayer(world, other, p.id, res.hp, res.armor, 'chest', false, w.id, ctx);
      return; // one melee target per swing
    }
  }
}

// ---------------------------------------------------------------- throwables

export interface ThrowableState {
  id: number;
  kind: 'frag' | 'smoke' | 'flash';
  fuseTicks: number;
  pos: Vec3;
  shooter: number;
}

export function throwItem(world: World, p: PlayerEntity, kind: 'frag' | 'smoke' | 'flash', ctx: CombatCtx): void {
  const muzzle = eyeOf(p);
  const dir = dirFromAngles(p.yaw, Math.min(-0.2, p.pitch));
  const vel = { x: dir.x * 18, y: dir.y * 18, z: dir.z * 18 };
  // Grenades fly as throwables: reuse Projectile with pen=0, camo id per kind.
  const gid = kind === 'frag' ? 9001 : kind === 'smoke' ? 9002 : 9003;
  const ticks = kind === 'frag' ? 75 : kind === 'smoke' ? 20 : 12;
  const proj: Projectile = {
    pos: v3(muzzle.x, muzzle.y, muzzle.z),
    vel,
    g: 9.81,
    pen: 0,
    dmg: determineDmg(kind),
    weaponId: gid,
    shooter: p.id,
    limb: kind,
    traveled: 0,
  };
  const id = world.nextId();
  world.bullets.set(id, proj);
  // Track fuse expiry server-side.
  throwables.set(id, { id, kind, fuseTicks: ticks, pos: proj.pos, shooter: p.id });
}

const throwables = new Map<number, ThrowableState>();

function determineDmg(kind: string): number {
  return kind === 'frag' ? 95 : 0;
}

/** Ticks down throwable fuses; detonates frags with AoE damage. */
export function tickThrowables(world: World, ctx: CombatCtx): void {
  const dt = 1 / 30;
  for (const [id, t] of [...throwables]) {
    const b = world.bullets.get(id);
    if (!b) {
      throwables.delete(id);
      continue;
    }
    t.fuseTicks--;
    t.pos = b.pos;
    if (t.fuseTicks <= 0) {
      detonate(world, t, ctx);
      world.bullets.delete(id);
      throwables.delete(id);
    }
  }
}

function detonate(world: World, t: ThrowableState, ctx: CombatCtx): void {
  const radius = t.kind === 'frag' ? 9 : 14;
  const bot = t.kind === 'frag' ? 2 : 0;
  // AoE damage (frag only).
  if (t.kind === 'frag') {
    for (const p of world.gridPlayers.queryCircle(t.pos.x, t.pos.z, radius)) {
      if (!p.alive || p.state === 'dead') continue;
      const d = Math.hypot(p.pos.x - t.pos.x, p.pos.z - t.pos.z);
      const dmg = explosiveDamage(95, d, radius);
      if (dmg <= 0) continue;
      damagePlayer(world, p, t.shooter, dmg, 0, 'chest', false, 9001, ctx);
    }
  }
  // Visual event: kind 3 = explosion, 4 = smoke, 5 = flash.
  const kind = t.kind === 'frag' ? 3 : t.kind === 'smoke' ? 4 : 5;
  ctx.events.push({ t: 'ping', id: t.id, pos: t.pos, kind });
  void bot;
}