// player-controller.ts — authoritative player movement. Mirrored by the client
// for prediction. Human and bot players both run through this same function.

import {
  GRAVITY, JUMP_VELOCITY, PLANE_ALTITUDE, PLAYER_CROUCH, PLAYER_EYE, PLAYER_SPRINT, PLAYER_WALK,
  PLANE_SPEED, PARACHUTE_FALL_SPEED, PARACHUTE_GLIDE,
} from '../../shared/src/consts.ts';
import { v3 } from '../../shared/src/math.ts';
import type { InputSample, PlayerEntity } from '../../shared/src/types.ts';
import type { World } from './world.ts';

const SKYDIVE_MAX_VY = -55;
const SKYDIVE_CONTROL = 22;
const WATER_LEVEL_Y = 0.35;

export interface MoveCtx {
  dt: number;
  tick: number;
  world: World;
  /** Current plane position while the match is in the flight phase. */
  planePos?: { x: number; z: number };
}

/** Vertical velocity (server-side scalar, negative = down). */
interface FallState {
  vy: number;
}

// Keep a tiny per-player non-replicated fall velocity on the server.
const fallVel = new Map<number, FallState>();

export function resetFall(id: number): void {
  fallVel.delete(id);
}

function getFall(id: number): FallState {
  let f = fallVel.get(id);
  if (!f) {
    f = { vy: 0 };
    fallVel.set(id, f);
  }
  return f;
}

/**
 * Advance one tick of player state. Handles plane ride, skydive, parachute and
 * ground movement. Mutates `p` — this is the server's hot loop; the immutable
 * rule applies to data crossing the wire, not here.
 */
export function stepPlayer(p: PlayerEntity, input: InputSample, ctx: MoveCtx): void {
  const dt = ctx.dt;
  p.yaw = (p.yaw + input.dyaw) % (Math.PI * 2);
  p.pitch = Math.min(1.5, Math.max(-1.5, p.pitch + input.dpitch));
  p.lean = input.lean;

  switch (p.state) {
    case 'plane': {
      // Players ride the plane; movement input does nothing except jump → drop.
      if (input.jump && ctx.planePos) {
        dropFromPlane(p, ctx.planePos);
      } else if (ctx.planePos) {
        ridePlane(p, ctx.planePos, dt);
      }
      break;
    }
    case 'skydive': {
      const f = getFall(p.id);
      // Horizontal control while diving.
      const dir = diveDir(p, input);
      const hSpeed = SKYDIVE_CONTROL;
      p.pos.x += dir.x * hSpeed * dt;
      p.pos.z += dir.z * hSpeed * dt;
      f.vy = Math.max(f.vy - 29.4 * dt, SKYDIVE_MAX_VY);
      p.pos.y = Math.max(SEA_LEVEL_Y(), p.pos.y + f.vy * dt);
      if (input.jump || p.pos.y <= 60) p.state = 'parachute';
      break;
    }
    case 'parachute': {
      const f = getFall(p.id);
      const dir = diveDir(p, input);
      f.vy = PARACHUTE_FALL_SPEED;
      p.pos.x += dir.x * PARACHUTE_GLIDE * dt;
      p.pos.z += dir.z * PARACHUTE_GLIDE * dt;
      const ground = ctx.world.heightAt(p.pos.x, p.pos.z);
      const surface = Math.max(ground, ctx.world.waterAt(p.pos.x, p.pos.z));
      p.pos.y = Math.max(surface, p.pos.y - f.vy * dt);
      if (p.pos.y <= surface + 0.1) {
        p.pos.y = surface;
        p.state = 'playing';
        p.chuteOpen = false;
        resetFall(p.id);
      }
      break;
    }
    default: {
      // Ground / water movement.
      groundMove(p, input, ctx);
    }
  }
}

function diveDir(p: PlayerEntity, input: InputSample): { x: number; z: number } {
  // Direction based on current yaw: forward = look direction.
  const f = input.mv.f;
  const s = input.mv.s;
  const cy = Math.cos(p.yaw);
  const sy = Math.sin(p.yaw);
  return { x: cy * f - sy * s, z: sy * f + cy * s };
}

function SEA_LEVEL_Y(): number {
  return WATER_LEVEL_Y + 0.4;
}

function groundMove(p: PlayerEntity, input: InputSample, ctx: MoveCtx): void {
  const dt = ctx.dt;
  const f = getFall(p.id);
  const water = ctx.world.waterAt(p.pos.x, p.pos.z);

  // Speed selection.
  let speed = PLAYER_WALK;
  if (input.sprint && p.stim > 0) speed = PLAYER_SPRINT * 1.25;
  else if (input.sprint) speed = PLAYER_SPRINT;
  if (input.crouch) speed = PLAYER_CROUCH;
  if (p.stim > 0) speed *= 1.25;
  if (water > 0) speed *= 0.4;

  const cy = Math.cos(p.yaw);
  const sy = Math.sin(p.yaw);
  const mx = cy * input.mv.f - sy * input.mv.s;
  const mz = sy * input.mv.f + cy * input.mv.s;
  const mlen = Math.hypot(mx, mz);
  const inv = mlen > 1 ? 1 / mlen : 1;
  p.pos.x += mx * speed * inv * dt;
  p.pos.z += mz * speed * inv * dt;

  // Jump.
  if (input.jump && f.vy === 0 && water <= 0) {
    f.vy = JUMP_VELOCITY;
  }

  // Gravity + ground clamp.
  f.vy -= GRAVITY * dt;
  const ground = ctx.world.heightAt(p.pos.x, p.pos.z);

  if (water > 0) {
    // Buoyancy: float at surface.
    const target = WATER_LEVEL_Y + 0.3;
    if (p.pos.y < target) f.vy += 18 * dt;
    if (p.pos.y > target && f.vy > 0) f.vy = 0;
    p.pos.y += f.vy * dt;
    if (p.pos.y < ground) p.pos.y = ground;
  } else if (p.pos.y + f.vy * dt <= ground) {
    p.pos.y = ground;
    f.vy = 0;
  } else {
    p.pos.y += f.vy * dt;
  }

  // Fall damage: only on large falls (vy is reset on landing, so track impact).
  if (f.vy === 0 && p.pos.y - ground > 6 && ctx.tick % 30 === 0) {
    // Handled elsewhere via lastImpact; simplified: no fall damage in v1.
  }

  // Suppression decay.
  if (p.suppression > 0) p.suppression = Math.max(0, p.suppression - 0.02);
}

/** Move a player WITH the plane (used while state == 'plane'). */
export function ridePlane(p: PlayerEntity, planePos: { x: number; z: number }, dt: number): void {
  p.pos.x = planePos.x;
  p.pos.z = planePos.z;
  p.pos.y = PLANE_ALTITUDE;
  void dt;
}

/** Drop from plane → skydive. */
export function dropFromPlane(p: PlayerEntity, planePos: { x: number; z: number }): void {
  p.pos = v3(planePos.x, PLANE_ALTITUDE, planePos.z);
  p.state = 'skydive';
  p.chuteOpen = false;
  resetFall(p.id);
}

/** Eye position (for muzzle origin). */
export function eyeOf(p: PlayerEntity): { x: number; y: number; z: number } {
  return { x: p.pos.x, y: p.pos.y + PLAYER_EYE, z: p.pos.z };
}

/** Sprint check for running animation. */
export function isMoving(p: PlayerEntity): boolean {
  return Math.hypot(p.pos.x, p.pos.z) > 0.01;
}