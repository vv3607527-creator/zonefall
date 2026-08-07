// types.ts — canonical wire + world types. Anything crossing the network or
// shared between server and client lives here (or in weapons/items/vehicles).

import type { Vec3 } from './math.ts';

/** Monotonic entity id assigned by the server. */
export type EntityId = number;

export type EntityKind = 'player' | 'bot' | 'bullet' | 'item' | 'vehicle' | 'crate';

export interface Entity {
  id: EntityId;
  kind: EntityKind;
  pos: Vec3;
  alive: boolean;
}

// ---------------------------------------------------------------- players

export type PlayerState = 'lobby' | 'plane' | 'skydive' | 'parachute' | 'playing' | 'dead' | 'spectating';

export interface PlayerEntity extends Entity {
  kind: 'player' | 'bot';
  name: string;
  /** Current FSM-ish phase for the player (drives drop/parachute/play). */
  state: PlayerState;
  /** Aim direction: yaw (x) and pitch (y) radians. */
  yaw: number;
  pitch: number;
  /** Movement intent magnitude 0..1 (server-side). */
  moveSpeed: number;
  hp: number;
  maxHp: number;
  armor: number;
  /** 0-100 energy drink value (ZONEFALL: "stim"). */
  stim: number;
  /** Weapon slots 0..1. -1 = empty. */
  slot0: number;
  slot1: number;
  activeSlot: number;
  /** Inventory: [itemId, count][] encoded as flat number array for wire. */
  inv: number[];
  equippedWeapon: number; // index into WEAPONS
  ammo: number[]; // ammo types -> count
  vehicleId: EntityId | -1;
  isDriving: boolean;
  /** Parachute open? */
  chuteOpen: boolean;
  /** Suppression 0..1 decays. */
  suppression: number;
  kills: number;
  /** Server tick of last damage taken (hit reactions). */
  lastHitTick: number;
  /** Client-side cosmetic id. */
  skin: number;
  ping: number;
  /** Lean offset -1..1 (cosmetic + 5% hitbox shift). */
  lean: number;
  /** Server tick of last fired shot (fire-rate gating). */
  lastFireTick: number;
}

// ---------------------------------------------------------------- items

export interface ItemEntity extends Entity {
  kind: 'item';
  /** WeaponDef id or ItemDef id. */
  defId: string;
  rarity: number;
  /** Weapon? ammo count preloaded, item? count. */
  count: number;
  /** Spawned by crate? */
  fromCrate: boolean;
}

export interface CrateEntity extends Entity {
  kind: 'crate';
  loot: { defId: string; count: number; rarity: number }[];
}

// ---------------------------------------------------------------- vehicles

export interface VehicleEntity extends Entity {
  kind: 'vehicle';
  defId: string;
  /** 0..1 forward throttle, -1..1 steer. */
  throttle: number;
  steer: number;
  speed: number; // current forward speed m/s
  yaw: number;
  hp: number;
  maxHp: number;
  fuel: number;
  tires: number; // 0..4 intact tires
  engineBroken: boolean;
  /** Occupant entity ids. */
  occupants: EntityId[];
  inWater: boolean;
  /** Smooth position delta for client interpolation (client-only). */
  _spd: number;
}

// ---------------------------------------------------------------- zone

export interface ZoneState {
  phase: number;
  center: Vec3; // x,z in map space (y unused)
  radius: number;
  nextCenter: Vec3;
  nextRadius: number;
  /** Server tick when the shrink completes. */
  shrinkEndTick: number;
  /** Server tick when shrink begins. */
  shrinkStartTick: number;
  /** Damage per second outside current circle at this phase. */
  dps: number;
}

// ---------------------------------------------------------------- sync

export interface FullSnapshot {
  type: 'full';
  tick: number;
  worldTime: number;
  players: PlayerEntity[];
  items: ItemEntity[];
  vehicles: VehicleEntity[];
  crates: CrateEntity[];
  zone: ZoneState;
  match: MatchState;
}

export interface MatchState {
  phase: 'lobby' | 'flight' | 'playing' | 'ended';
  phaseEndTick: number;
  aliveCount: number;
  flightPath: { from: Vec3; to: Vec3; endTick: number };
  winnerName: string | null;
  results: { name: string; kills: number; place: number }[];
  seed: number;
}

export type DeltaOp =
  | ['u', EntityId, Partial<PlayerEntity> | Partial<ItemEntity> | Partial<VehicleEntity> | Partial<CrateEntity>]
  | ['a', EntityId, PlayerEntity | ItemEntity | VehicleEntity | CrateEntity]
  | ['d', EntityId];

export interface DeltaSnapshot {
  type: 'delta';
  tick: number;
  ops: DeltaOp[];
  zone?: ZoneState;
  match?: Partial<MatchState>;
}

// ---------------------------------------------------------------- events

export type GameEvent =
  | { t: 'hit'; victim: EntityId; attacker: EntityId; dmg: number; limb: string }
  | { t: 'kill'; killer: EntityId; victim: EntityId; weaponId: number; headshot: boolean }
  | { t: 'zone'; phase: number; radius: number; center: Vec3 }
  | { t: 'plane'; path: { from: Vec3; to: Vec3 } }
  | { t: 'drop'; id: EntityId }
  | { t: 'ping'; id: EntityId; pos: Vec3; kind: number }
  | { t: 'matchEnd'; winner: string }
  | { t: 'crate'; id: EntityId }
  | { t: 'vehicle'; id: EntityId; defId: string; owner: EntityId }
  | { t: 'start'; seed: number }
  | { t: 'msg'; id: EntityId; text: string };

// ---------------------------------------------------------------- input

export interface InputSample {
  seq: number;
  /** Movement intent in local (camera-relative) space: forward/strafe [-1,1]. */
  mv: { f: number; s: number };
  /** Aim delta (look), radians. */
  dyaw: number;
  dpitch: number;
  fire: boolean;
  ads: boolean;
  sprint: boolean;
  crouch: boolean;
  jump: boolean;
  lean: number; // -1 left, 0 center, 1 right
  /** Weapon slot switch request, -1 none. */
  switchSlot: number;
  /** Interaction: pickup / use / enter vehicle. */
  use: boolean;
  /** Throwable slot use. */
  throw: boolean;
}

export interface ClientMeta {
  name: string;
  skin: number;
  region: string; // preferred server region (single region build: "aurelia")
}

// ---------------------------------------------------------------- protocol

export type ClientMsg =
  | { type: 'hello'; meta: ClientMeta }
  | { type: 'input'; samples: InputSample[] }
  | { type: 'start' }
  | { type: 'pingAt'; x: number; z: number; kind: number }
  | { type: 'chat'; text: string };

export type ServerMsg =
  | { type: 'welcome'; id: EntityId; seed: number; tick: number }
  | { type: 'full'; snap: FullSnapshot }
  | { type: 'delta'; snap: DeltaSnapshot }
  | { type: 'event'; e: GameEvent }
  | { type: 'pong'; t: number }
  | { type: 'error'; msg: string };