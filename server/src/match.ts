// match.ts — the match lifecycle (lobby → flight → playing → ended), the
// flight path, and result bookkeeping. World-side simulation lives in sim.ts;
// this class only tracks time-based transitions and aggregate match state.

import { Rng } from '../../shared/src/rng.ts';
import { v3 } from '../../shared/src/math.ts';
import {
  MATCH_INITIAL_SECONDS, MAX_PLAYERS, PLANE_SPEED, PLANE_ALTITUDE, TICK_RATE,
} from '../../shared/src/consts.ts';
import { initialZone } from '../../shared/src/zone.ts';
import type { GameEvent, MatchState, PlayerEntity } from '../../shared/src/types.ts';
import type { World } from './world.ts';

const WORLD_HALF = 2048;
/** Seconds for the plane to cross the island. */
const FLIGHT_SECONDS = (WORLD_HALF * 2 + 400) / PLANE_SPEED;
/**
 * Square of the perpendicular distance from `p` to the infinite line through
 * `a` and `b` (2D, x/z plane).
 */
function perpDistSq(
  px: number, pz: number,
  ax: number, az: number,
  bx: number, bz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const rx = px - ax;
  const rz = pz - az;
  const cross = rx * dz - rz * dx;
  return (cross * cross) / (dx * dx + dz * dz);
}

export class Match {
  state: MatchState;
  private rng: Rng;
  /** Round counter for seed rotation. */
  round = 0;

  constructor(seed: number, startTick: number) {
    this.rng = new Rng(seed ^ 0x9137bd5f);
    this.state = this.makeState(seed, startTick);
  }

  private makeState(seed: number, tick: number): MatchState {
    // Roll the plane line ONCE here so bots (created at match start, before
    // the plane takes off) can compute zone-targeted drops against the real
    // path. The destination is re-rolled until the line passes within ~0.8x
    // of the initial safe circle's radius, so the plane always flies close
    // enough to the zone center that any drop can land inside the circle
    // (reachable-drop guarantee — nobody is zone-killed before they can fight).
    const fromZ = this.rng.range(4000, 4400) - 200;
    const z0 = initialZone(0);
    const FROM_X = -WORLD_HALF - 200;
    const TO_X = WORLD_HALF + 200;
    let toZ = this.rng.range(-1600, 2200) - 200;
    const reachSq = (z0.radius * 0.8) ** 2;
    for (let i = 0; i < 8; i++) {
      if (perpDistSq(z0.center.x, z0.center.z, FROM_X, fromZ, TO_X, toZ) <= reachSq) break;
      toZ = this.rng.range(-1600, 2200) - 200;
    }
    const from = v3(FROM_X, PLANE_ALTITUDE, fromZ);
    const to = v3(TO_X, PLANE_ALTITUDE, toZ);
    return {
      phase: 'lobby',
      phaseEndTick: tick + MATCH_INITIAL_SECONDS * TICK_RATE,
      aliveCount: 0,
      flightPath: { from, to, endTick: 0 },
      winnerName: null,
      results: [],
      seed,
    };
  }

  /** Plan the next flight path (used at round rollover). */
  newRound(seed: number, tick: number): void {
    this.round++;
    this.state = this.makeState(seed, tick);
  }

  /** Spawn a lobby player. Returns the entity, or null if the lobby is full. */
  addPlayer(world: World, id: number, name: string, skin: number): PlayerEntity | null {
    if (world.players.size >= MAX_PLAYERS) return null;
    const padAngle = (id % 24) * (Math.PI * 2 / 24);
    const padR = 14 + (id % 3) * 5;
    const cx = this.state.flightPath.from.x * 0.2;
    const cz = this.state.flightPath.from.z * 0.2;
    const x = cx + Math.cos(padAngle) * padR;
    const z = cz + Math.sin(padAngle) * padR;
    const y = Math.max(world.heightAt(x, z) + 1, 1);
    const p: PlayerEntity = {
      id,
      kind: 'player',
      name,
      state: 'lobby',
      pos: v3(x, y, z),
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
      inv: [0, 3],
      ammo: [24, 24, 16, 8, 0],
      vehicleId: -1,
      isDriving: false,
      chuteOpen: false,
      suppression: 0,
      kills: 0,
      lastHitTick: 0,
      skin,
      ping: 0,
      lean: 0,
      lastFireTick: 0,
    };
    world.players.set(id, p);
    this.state.aliveCount = world.countAlive();
    return p;
  }

  removePlayer(world: World, id: number): void {
    world.players.delete(id);
    this.state.aliveCount = world.countAlive();
  }

  toState(): MatchState {
    return this.state;
  }

  /** Plane position at a given tick (only valid during the flight phase). */
  planePosAt(tick: number): { x: number; z: number } | null {
    const fp = this.state.flightPath;
    if (this.state.phase !== 'flight' || tick >= fp.endTick) return null;
    const t = Math.max(0, Math.min(1, (tick - fp.endTick + FLIGHT_SECONDS * TICK_RATE) / (FLIGHT_SECONDS * TICK_RATE)));
    return {
      x: fp.from.x + (fp.to.x - fp.from.x) * t,
      z: fp.from.z + (fp.to.z - fp.from.z) * t,
    };
  }

  /** Advance time-based transitions. Call each tick after zone/world work. */
  tick(world: World, tick: number, events: GameEvent[]): void {
    const st = this.state;
    const alive = world.countAlive();

    switch (st.phase) {
      case 'lobby':
        if (tick >= st.phaseEndTick && alive > 0) {
          // Everyone boards the pre-rolled plane line.
          st.phase = 'flight';
          st.flightPath.endTick = tick + Math.round(FLIGHT_SECONDS * TICK_RATE);
          st.phaseEndTick = st.flightPath.endTick;
          st.aliveCount = alive;
          events.push({ t: 'plane', path: { from: st.flightPath.from, to: st.flightPath.to } });
          events.push({ t: 'start', seed: st.seed });
          for (const p of world.players.values()) {
            p.state = 'plane';
            p.pos.x = st.flightPath.from.x;
            p.pos.z = st.flightPath.from.z + 1;
            p.pos.y = PLANE_ALTITUDE;
          }
        }
        break;

      case 'flight':
        if (tick >= st.flightPath.endTick) {
          // Force-drop anyone still aboard.
          st.phase = 'playing';
          st.phaseEndTick = tick + 60 * TICK_RATE;
          for (const p of world.players.values()) {
            if (p.state === 'plane') {
              p.state = 'skydive';
              events.push({ t: 'drop', id: p.id });
            }
          }
        }
        break;

      case 'playing':
        st.aliveCount = alive;
        if (alive <= 1) {
          st.phase = 'ended';
          st.winnerName = null;
          for (const p of world.players.values()) {
            if (p.alive && p.state !== 'dead') {
              st.winnerName = p.name;
              break;
            }
          }
          if (!st.winnerName) st.winnerName = 'No Survivor';
          st.phaseEndTick = tick + 20 * TICK_RATE;
          st.results = this.results(world);
          events.push({ t: 'matchEnd', winner: st.winnerName });
        } else {
          st.phaseEndTick = tick + 60 * TICK_RATE;
        }
        break;

      case 'ended':
        // Auto-restart handled by sim (newRound) after the spectator window.
        break;
    }
  }

  /** Rank every player by kills (tie-break: survive longer = later death tick). */
  results(world: World): { name: string; kills: number; place: number }[] {
    const out: { name: string; kills: number; alive: boolean }[] = [];
    for (const p of world.players.values()) {
      out.push({ name: p.name, kills: p.kills, alive: p.alive });
    }
    out.sort((a, b) => Number(b.alive) - Number(a.alive) || b.kills - a.kills);
    return out.map((r, i) => ({ name: r.name, kills: r.kills, place: i + 1 }));
  }
}