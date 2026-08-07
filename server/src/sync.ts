// sync.ts — per-client snapshot tracking: emits full snapshots periodically and
// minimal delta ops (add/update/delete) between them, matching the client wire format.

import type {
  CrateEntity,
  DeltaSnapshot,
  DeltaOp,
  EntityId,
  FullSnapshot,
  ItemEntity,
  MatchState,
  PlayerEntity,
  VehicleEntity,
  ZoneState,
} from '../../shared/src/types.ts';

/** Dereferenced maps flattened from the World for snapshot building. */
export interface WorldView {
  players: PlayerEntity[];
  items: ItemEntity[];
  vehicles: VehicleEntity[];
  crates: CrateEntity[];
}

const P_KEYS: (keyof PlayerEntity)[] = [
  'pos', 'yaw', 'pitch', 'moveSpeed', 'hp', 'armor', 'state', 'suppression', 'kills',
  'chuteOpen', 'activeSlot', 'slot0', 'slot1', 'equippedWeapon', 'ammo', 'inv', 'lean',
  'vehicleId', 'isDriving',
];

const I_KEYS: (keyof ItemEntity)[] = ['pos', 'count', 'rarity'];
const V_KEYS: (keyof VehicleEntity)[] = [
  'pos', 'yaw', 'speed', 'hp', 'fuel', 'tires', 'engineBroken', 'inWater', 'occupants',
];
const C_KEYS: (keyof CrateEntity)[] = ['pos'];

function eq(a: unknown, b: unknown): boolean {
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return Object.is(a, b);
}

function diff<T extends object>(prev: Partial<T> | undefined, cur: T, keys: (keyof T)[], out: Partial<T>): boolean {
  let changed = false;
  for (const k of keys) {
    const a = prev?.[k];
    const b = cur[k];
    if (a === undefined || !eq(a, b)) {
      (out as Record<string, unknown>)[k as string] = b;
      changed = true;
    }
  }
  return changed;
}

/** Per-client recollection of what the client already has. */
export class SnapshotTracker {
  players = new Map<EntityId, Partial<PlayerEntity>>();
  items = new Map<EntityId, Partial<ItemEntity>>();
  vehicles = new Map<EntityId, Partial<VehicleEntity>>();
  crates = new Map<EntityId, Partial<CrateEntity>>();
  zoneKey = '';
  matchKey = '';
  needFull = true;
  lastFailed = 0;
}

export function buildFull(
  view: WorldView,
  zone: ZoneState,
  match: MatchState,
  tick: number,
  worldTime: number,
): FullSnapshot {
  return {
    type: 'full',
    tick,
    worldTime,
    players: view.players,
    items: view.items,
    vehicles: view.vehicles,
    crates: view.crates,
    zone,
    match,
  };
}

/**
 * Diff current world state against the tracker and produce a delta snapshot.
 * Returns null when nothing changed (the sender can skip sending).
 */
export function buildDelta(
  view: WorldView,
  zone: ZoneState,
  match: MatchState,
  tick: number,
  trk: SnapshotTracker,
): DeltaSnapshot | null {
  const ops: DeltaOp[] = [];

  // ---------------------------------------------------------------- players
  const seenP = new Set<EntityId>();
  for (const p of view.players) {
    seenP.add(p.id);
    const prev = trk.players.get(p.id);
    if (!prev) {
      ops.push(['a', p.id, p]);
      trk.players.set(p.id, { ...p });
      continue;
    }
    const part: Partial<PlayerEntity> = {};
    if (diff(prev, p, P_KEYS, part)) {
      ops.push(['u', p.id, part]);
      trk.players.set(p.id, { ...prev, ...part });
    }
  }
  for (const id of [...trk.players.keys()]) {
    if (!seenP.has(id)) {
      ops.push(['d', id]);
      trk.players.delete(id);
    }
  }

  // ---------------------------------------------------------------- items
  const seenI = new Set<EntityId>();
  for (const i of view.items) {
    seenI.add(i.id);
    const prev = trk.items.get(i.id);
    if (!prev) {
      ops.push(['a', i.id, i]);
      trk.items.set(i.id, { ...i });
      continue;
    }
    const part: Partial<ItemEntity> = {};
    if (diff(prev, i, I_KEYS, part)) {
      ops.push(['u', i.id, part]);
      trk.items.set(i.id, { ...prev, ...part });
    }
  }
  for (const id of [...trk.items.keys()]) {
    if (!seenI.has(id)) {
      ops.push(['d', id]);
      trk.items.delete(id);
    }
  }

  // ---------------------------------------------------------------- vehicles
  const seenV = new Set<EntityId>();
  for (const v of view.vehicles) {
    seenV.add(v.id);
    const prev = trk.vehicles.get(v.id);
    if (!prev) {
      ops.push(['a', v.id, v]);
      trk.vehicles.set(v.id, { ...v });
      continue;
    }
    const part: Partial<VehicleEntity> = {};
    if (diff(prev, v, V_KEYS, part)) {
      ops.push(['u', v.id, part]);
      trk.vehicles.set(v.id, { ...prev, ...part });
    }
  }
  for (const id of [...trk.vehicles.keys()]) {
    if (!seenV.has(id)) {
      ops.push(['d', id]);
      trk.vehicles.delete(id);
    }
  }

  // ---------------------------------------------------------------- crates
  const seenC = new Set<EntityId>();
  for (const c of view.crates) {
    seenC.add(c.id);
    const prev = trk.crates.get(c.id);
    if (!prev) {
      ops.push(['a', c.id, c]);
      trk.crates.set(c.id, { ...c });
      continue;
    }
    const part: Partial<CrateEntity> = {};
    if (diff(prev, c, C_KEYS, part)) {
      ops.push(['u', c.id, part]);
      trk.crates.set(c.id, { ...prev, ...part });
    }
  }
  for (const id of [...trk.crates.keys()]) {
    if (!seenC.has(id)) {
      ops.push(['d', id]);
      trk.crates.delete(id);
    }
  }

  // ---------------------------------------------------------------- zone / match
  const zKey = JSON.stringify({ phase: zone.phase, center: zone.center, radius: zone.radius, nextCenter: zone.nextCenter, nextRadius: zone.nextRadius, shrinkStartTick: zone.shrinkStartTick, shrinkEndTick: zone.shrinkEndTick, dps: zone.dps });
  let zoneMsg: ZoneState | undefined;
  if (zKey !== trk.zoneKey) {
    zoneMsg = { ...zone, center: { ...zone.center }, nextCenter: { ...zone.nextCenter } };
    trk.zoneKey = zKey;
  }

  const mKey = JSON.stringify(match);
  let matchMsg: Partial<MatchState> | undefined;
  if (mKey !== trk.matchKey) {
    matchMsg = match;
    trk.matchKey = mKey;
  }

  if (ops.length === 0 && !zoneMsg && !matchMsg) return null;

  return {
    type: 'delta',
    tick,
    ops,
    zone: zoneMsg,
    match: matchMsg,
  };
}