// sim.ts — authoritative simulation loop. Runs the fixed 30Hz tick: drains
// client inputs, steps bots, advances combat/vehicles/zone/match, then syncs
// per-client snapshots. Headless-friendly: with net:false it drives a pure
// deterministic sim for tests and replays.

import type { Server } from 'node:http';
import { Rng } from '../../shared/src/rng.ts';
import { v3 } from '../../shared/src/math.ts';
import { FULL_SNAPSHOT_EVERY, MATCH_INITIAL_SECONDS, MAX_PLAYERS, TICK_MS, TICK_RATE, WORLD_SEED } from '../../shared/src/consts.ts';
import { initialZone } from '../../shared/src/zone.ts';
import type { ClientMeta, GameEvent, InputSample, PlayerEntity, ZoneState } from '../../shared/src/types.ts';
import { World } from './world.ts';
import { ZoneManager } from './zone-manager.ts';
import { Match } from './match.ts';
import { NetHub } from './net.ts';
import { buildFull, buildDelta, SnapshotTracker, type WorldView } from './sync.ts';
import { spawnLoot } from './loot-spawner.ts';
import { spawnVehicles, stepVehicles, driveFromInput, exitVehicle } from './vehicle-sim.ts';
import { createBots, updateBot, getBrain, clearBrains } from './bots.ts';
import { stepPlayer, resetFall } from './player-controller.ts';
import { fireWeapon, stepBullets, tickReload, tickThrowables, resetCombat, type CombatCtx } from './combat.ts';
import { interact, tickHeal, healTimers, type InteractCtx } from './interact.ts';
import { ReplayLog } from './replay.ts';

const SYNC_RADIUS = 460;

export interface SimOptions {
  seed?: number;
  botCount?: number;
  syncRadius?: number;
  port?: number;
  host?: string;
  path?: string;
  /** When false the sim runs headless (no WebSocket listener). */
  net?: boolean;
  /** HTTP server to attach the WebSocket listener to (shares its port). */
  httpServer?: Server;
}

/** WorldView + match/zone meta bundled for snapshot serialization. */
export type SyncBundle = WorldView & { zone: ZoneState };

export class Sim {
  world: World;
  zone: ZoneManager;
  match: Match;
  net: NetHub;
  replay = new ReplayLog();
  tick = 0;
  running = false;

  private seed: number;
  private botFill: number;
  private rng: Rng;
  private syncRadius: number;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(options: SimOptions = {}) {
    this.seed = options.seed ?? WORLD_SEED;
    this.rng = new Rng(this.seed);
    this.botFill = options.botCount ?? MAX_PLAYERS;
    this.syncRadius = options.syncRadius ?? SYNC_CULL_RADIUS;
    this.world = new World();
    this.zone = new ZoneManager(this.seed, 0);
    this.match = new Match(this.seed, 0);

    const host = options.host ?? '127.0.0.1';
    const path = options.path ?? '/ws';
    // With an httpServer we share its port; otherwise bind our own (headless
    // mode uses an ephemeral port). Port is fixed at construction.
    this.net = options.httpServer
      ? new NetHub({ server: options.httpServer, path })
      : new NetHub({ port: options.net === false ? 0 : (options.port ?? DEFAULT_PORT), host, path });
    this.wireNet();
  }

  private wireNet(): void {
    this.net.onHello = (meta: ClientMeta): number => {
      const id = this.world.nextId();
      const p = this.match.addPlayer(this.world, id, meta.name, meta.skin);
      if (!p) return -1;
      resetFall(id);
      resetCombat(id);
      return id;
    };
    this.net.onInput = (): void => {
      /* inputs are drained per tick from the client buffers */
    };
    this.net.onStart = (): void => {
      /* auto-start after the lobby countdown */
    };
    this.net.onPingAt = (id: number, x: number, z: number, kind: number): void => {
      const p = this.world.players.get(id);
      if (!p || p.state === 'dead') return;
      this.net.broadcastEvent({ t: 'ping', id, pos: v3(x, 0, z), kind });
    };
    this.net.onChat = (id: number, text: string): void => {
      this.net.broadcastEvent({ t: 'msg', id, text });
    };
    this.net.onDisconnect = (id: number): void => {
      const p = this.world.players.get(id);
      if (p) {
        if (p.vehicleId !== -1) exitVehicle(this.world, p);
        this.match.removePlayer(this.world, id);
      }
      healTimers.delete(id);
      resetFall(id);
      resetCombat(id);
    };
  }

  /** Begin the fixed-tick loop. Idempotent. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.fillWorld();
    this.timer = setInterval(() => this.step(), TICK_MS);
    this.timer.unref?.();
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Spawn loot + vehicles for the current seed and refill the bot roster. */
  private fillWorld(): void {
    spawnLoot(this.world, this.seed);
    spawnVehicles(this.world, this.seed);
    const flightStart = this.tick + MATCH_INITIAL_SECONDS * TICK_RATE;
    const fp = this.match.state.flightPath;
    const padCenter = { x: fp.from.x * 0.2, z: fp.from.z * 0.2 };
    const zone0 = initialZone(0);
    clearBrains();
    createBots(this.world, this.botFill, this.seed, flightStart, padCenter, fp, zone0.center);
  }

  /** Advance exactly one tick. Deterministic apart from client inputs. */
  step(): void {
    this.tick++;
    this.net.currentTick = this.tick;
    const dt = TICK_MS / 1000;
    const events: GameEvent[] = [];
    const planePos = this.match.planePosAt(this.tick);

    const combatCtx: CombatCtx = { events, tick: this.tick, rng: this.rng };
    const interactCtx: InteractCtx = { events, tick: this.tick, rng: this.rng };
    const moveCtx = { dt, tick: this.tick, world: this.world, planePos: planePos ?? undefined };

    // ------------------------------------------------ humans (client inputs)
    for (const id of [...this.net.clients.keys()]) {
      const p = this.world.players.get(id);
      if (!p) continue;
      const sample = this.drainInput(id);
      if (!sample) continue;
      this.applyPlayer(p, sample, moveCtx, combatCtx, interactCtx);
    }

    // ------------------------------------------------ bots (brain-driven)
    for (const p of this.world.allPlayers()) {
      if (p.kind !== 'bot' || !p.alive) continue;
      const brain = getBrain(p.id);
      if (!brain) continue;
      const zone = this.zone.toState(this.tick);
      const sample = updateBot(brain, p, { world: this.world, zone, tick: this.tick, dt, planePos: planePos ?? undefined });
      this.applyPlayer(p, sample, moveCtx, combatCtx, interactCtx);
    }

    // ------------------------------------------------ world subsystems
    stepBullets(this.world, combatCtx);
    tickThrowables(this.world, combatCtx);
    stepVehicles({ dt, tick: this.tick, world: this.world, events });
    this.zone.tick(this.tick, this.world, events);
    this.match.tick(this.world, this.tick, events);
    tickHeal(this.world, this.tick);
    this.world.rebuildGrids();

    // ------------------------------------------------ broadcast
    this.broadcast();

    for (const e of events) this.net.broadcastEvent(e);
    for (const e of events) this.replay.push(this.tick, e);

    // ------------------------------------------------ round rollover
    if (this.match.state.phase === 'ended' && this.tick >= this.match.state.phaseEndTick) {
      this.nextRound();
    }
  }

  /** One player's movement + actions for a tick (human and bot share this). */
  private applyPlayer(
    p: PlayerEntity,
    s: InputSample,
    moveCtx: { dt: number; tick: number; world: World; planePos?: { x: number; z: number } },
    combatCtx: CombatCtx,
    interactCtx: InteractCtx,
  ): void {
    if (p.isDriving) {
      const v = this.world.vehicles.get(p.vehicleId);
      if (v) driveFromInput(v, s);
    } else {
      stepPlayer(p, s, moveCtx);
    }
    if (s.fire && !p.isDriving) fireWeapon(this.world, p, true, combatCtx);
    interact(p, s, this.world, interactCtx);
    tickReload(p, combatCtx);
  }

  /** Consume the newest validated input sample for a human client. */
  private drainInput(id: number): InputSample | null {
    const ctx = this.net.clients.get(id);
    if (!ctx || ctx.buffered.length === 0) return null;
    let best: InputSample | null = null;
    for (const s of ctx.buffered) {
      if (s.seq >= ctx.lastSeq) {
        ctx.lastSeq = s.seq;
        best = s;
      }
    }
    ctx.buffered.length = 0;
    return best;
  }

  private broadcast(): void {
    const players = this.world.allPlayers();
    const items = [...this.world.items.values()];
    const vehicles = [...this.world.vehicles.values()];
    const crates = [...this.world.crates.values()];
    const zone = this.zone.toState(this.tick);
    const match = this.match.toState();
    const isFull = this.tick % FULL_SNAPSHOT_EVERY === 0;

    for (const id of [...this.net.clients.keys()]) {
      const ctx = this.net.clients.get(id);
      if (!ctx) continue;
      const p = this.world.players.get(id);
      const view: WorldView = p
        ? this.cull(players, items, vehicles, crates, p)
        : { players: [], items: [], vehicles: [], crates: [] };
      if (isFull) {
        this.net.send(id, { type: 'full', snap: buildFull(view, zone, match, this.tick, this.tick / TICK_RATE) });
      } else {
        const delta = buildDelta(view, zone, match, this.tick, ctx.tracker);
        if (delta) this.net.send(id, { type: 'delta', snap: delta });
      }
    }
  }

  private cull(
    players: PlayerEntity[],
    items: import('../../shared/src/types.ts').ItemEntity[],
    vehicles: import('../../shared/src/types.ts').VehicleEntity[],
    crates: import('../../shared/src/types.ts').CrateEntity[],
    p: PlayerEntity,
  ): WorldView {
    const r2 = this.syncRadius * this.syncRadius;
    const pSel: PlayerEntity[] = [];
    for (const o of players) {
      const dx = o.pos.x - p.pos.x;
      const dz = o.pos.z - p.pos.z;
      if (o.id === p.id || dx * dx + dz * dz <= r2) pSel.push(o);
    }
    const iSel: import('../../shared/src/types.ts').ItemEntity[] = [];
    for (const o of items) {
      const dx = o.pos.x - p.pos.x;
      const dz = o.pos.z - p.pos.z;
      if (dx * dx + dz * dz <= r2) iSel.push(o);
    }
    const vSel: import('../../shared/src/types.ts').VehicleEntity[] = [];
    for (const o of vehicles) {
      const dx = o.pos.x - p.pos.x;
      const dz = o.pos.z - p.pos.z;
      if (dx * dx + dz * dz <= r2) vSel.push(o);
    }
    const cSel: import('../../shared/src/types.ts').CrateEntity[] = [];
    for (const o of crates) {
      const dx = o.pos.x - p.pos.x;
      const dz = o.pos.z - p.pos.z;
      if (dx * dx + dz * dz <= r2) cSel.push(o);
    }
    return { players: pSel, items: iSel, vehicles: vSel, crates: cSel };
  }

  /** Start a fresh match; world keeps id monotonicity, clients keep their ids. */
  private nextRound(): void {
    this.seed += 1013;
    this.world.reset();
    this.zone = new ZoneManager(this.seed, this.tick);
    this.match.newRound(this.seed, this.tick);
    this.replay = new ReplayLog();
    healTimers.clear();
    for (const ctx of this.net.clients.values()) ctx.tracker = new SnapshotTracker();
    this.fillWorld();
  }

  get alive(): number {
    return this.world.countAlive();
  }
}

const DEFAULT_PORT = 8787;
const SYNC_CULL_RADIUS = 460;