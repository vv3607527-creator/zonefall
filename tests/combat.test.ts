// combat.test.ts — authoritative ballistics regression tests.
//
// Regression target: the no-gunfight bug. stepBullets() tested ONE point (the
// bullet's end-of-tick position) against players, but a 900 u/s bullet moves
// ~30 m per 30 Hz tick and jumped straight over a ~1 m player body. Every
// fired bullet missed; all kills were melee (`FINAL kills: gun=0`).
//
// This test fires a fast flat bullet at a stationary player 20 m downrange.
// The pre-fix code checks only z=30 (10 m past the target) → no hit → hp stays
// 100 → FAIL (RED). The sub-step march fix samples the segment and connects.

import { describe, expect, test } from 'vitest';
import { v3 } from '../shared/src/math.ts';
import { Rng } from '../shared/src/rng.ts';
import { spawnProjectile } from '../shared/src/ballistics.ts';
import { World } from '../server/src/world.ts';
import { stepBullets } from '../server/src/combat.ts';
import type { GameEvent, PlayerEntity } from '../shared/src/types.ts';

/** Full PlayerEntity literal (mirrors tests/bots.test.ts). */
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

/**
 * The deterministic seeded world is open ocean (height≈-12, water≈0.3) except
 * a central plateau (height 6+, dry). Open ocean is the only "flat lane": a
 * bullet at y≈1.9 over the ocean passes the once-per-tick terrain/water check
 * (1.9 > water surface 0.75 and 1.9 > ocean floor -12), so the only thing
 * under test is "did the bullet hit the player". Scan for an open-ocean x.
 */
function findOpenOceanX(world: World): number {
  for (let x = 8; x < 4096; x += 8) {
    if (world.waterAt(x, 10) > 0 && world.heightAt(x, 10) < 0) return x;
  }
  throw new Error('no open-ocean lane found in deterministic world');
}

describe('ballistic hit detection', () => {
  test('fast bullet hits a player mid-flight (no tunneling)', () => {
    const world = new World();
    const x = findOpenOceanX(world);

    const shooter = makePlayer(world, x, 0);
    const victim = makePlayer(world, x, 20);
    world.rebuildGrids();

    // Flat 900 u/s shot at z=+1, no gravity, single pellet, zero spread.
    const proj = spawnProjectile(
      shooter.id,
      v3(x, 1.9, 0),
      { x: 0, y: 0, z: 1 },
      { id: 1, dmg: 40, muzzle: 900, gravityMul: 0, pen: 0 },
      0,
      [0, 0],
      'chest',
    );
    world.bullets.set(world.nextId(), proj);

    const events: GameEvent[] = [];
    stepBullets(world, { events, tick: 0, rng: new Rng(1234) });

    // Pre-fix: endpoint-only check lands 10 m past the victim → no damage.
    expect(victim.hp).toBeLessThan(100);
    const hit = events.find((e) => e.t === 'hit' && e.victim === victim.id);
    expect(hit).toBeDefined();
  });
});