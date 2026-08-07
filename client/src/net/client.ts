// client.ts — WebSocket client, snapshot buffering and interpolation.

import type {
  ClientMeta, DeltaSnapshot, EntityId, FullSnapshot, GameEvent, InputSample,
  MatchState, ZoneState,
} from '../../../shared/src/types.ts';
import { lerp, lerpAngle, v3, v3clone, type Vec3 } from '../../../shared/src/math.ts';

export interface PlayerView {
  id: EntityId;
  name: string;
  pos: Vec3;
  yaw: number;
  pitch: number;
  hp: number;
  maxHp: number;
  armor: number;
  stim: number;
  state: string;
  activeSlot: number;
  slot0: number;
  slot1: number;
  inv: number[];
  equippedWeapon: number;
  ammo: number[];
  vehicleId: EntityId;
  isDriving: boolean;
  chuteOpen: boolean;
  suppression: number;
  kills: number;
  skin: number;
  lean: number;
  alive: boolean;
}

export interface ItemView {
  id: EntityId;
  defId: string;
  count: number;
  rarity: number;
  pos: Vec3;
}

export interface VehicleView {
  id: EntityId;
  defId: string;
  pos: Vec3;
  yaw: number;
  speed: number;
  hp: number;
  fuel: number;
  tires: number;
  engineBroken: boolean;
  inWater: boolean;
  occupants: EntityId[];
}

export interface CrateView {
  id: EntityId;
  pos: Vec3;
}

interface Snap {
  tick: number;
  players: Map<EntityId, PlayerView>;
  items: Map<EntityId, ItemView>;
  vehicles: Map<EntityId, VehicleView>;
  crates: Map<EntityId, CrateView>;
  zone: ZoneState | null;
  match: MatchState | null;
}

export interface NetView {
  players: Map<EntityId, PlayerView>;
  items: Map<EntityId, ItemView>;
  vehicles: Map<EntityId, VehicleView>;
  crates: Map<EntityId, CrateView>;
  zone: ZoneState | null;
  match: MatchState | null;
  tick: number;
  estTick: number;
}

function freshSnap(tick: number): Snap {
  return {
    tick,
    players: new Map(),
    items: new Map(),
    vehicles: new Map(),
    crates: new Map(),
    zone: null,
    match: null,
  };
}

function playerToView(p: Record<string, unknown>): PlayerView {
  return {
    id: p.id as number,
    name: p.name as string,
    pos: v3clone(p.pos as Vec3),
    yaw: p.yaw as number,
    pitch: p.pitch as number,
    hp: p.hp as number,
    maxHp: p.maxHp as number,
    armor: p.armor as number,
    stim: p.stim as number,
    state: p.state as string,
    activeSlot: p.activeSlot as number,
    slot0: p.slot0 as number,
    slot1: p.slot1 as number,
    inv: (p.inv as number[]) ?? [],
    equippedWeapon: p.equippedWeapon as number,
    ammo: (p.ammo as number[]) ?? [0, 0, 0, 0],
    vehicleId: p.vehicleId as EntityId,
    isDriving: p.isDriving as boolean,
    chuteOpen: p.chuteOpen as boolean,
    suppression: p.suppression as number,
    kills: p.kills as number,
    skin: p.skin as number,
    lean: (p.lean as number) ?? 0,
    alive: p.alive as boolean,
  };
}

function itemToView(p: Record<string, unknown>): ItemView {
  return {
    id: p.id as number,
    defId: p.defId as string,
    count: p.count as number,
    rarity: p.rarity as number,
    pos: v3clone(p.pos as Vec3),
  };
}

function vehicleToView(p: Record<string, unknown>): VehicleView {
  return {
    id: p.id as number,
    defId: p.defId as string,
    pos: v3clone(p.pos as Vec3),
    yaw: p.yaw as number,
    speed: p.speed as number,
    hp: p.hp as number,
    fuel: p.fuel as number,
    tires: p.tires as number,
    engineBroken: p.engineBroken as boolean,
    inWater: p.inWater as boolean,
    occupants: (p.occupants as EntityId[]) ?? [],
  };
}

export class NetClient {
  onWelcome: (id: EntityId, seed: number, tick: number) => void = () => {};
  onFull: (snap: FullSnapshot) => void = () => {};
  onEvent: (e: GameEvent) => void = () => {};
  onStatus: (s: string) => void = () => {};
  onClosed: () => void = () => {};

  ownId: EntityId = -1;
  rtt = 40;
  state: 'connecting' | 'connected' | 'closed' = 'connecting';

  private ws: WebSocket | null = null;
  private seq = 0;
  private queue: InputSample[] = [];
  private history: Snap[] = [];
  private head: Snap;
  private lastMsgAt = 0;
  private estTickBase = 0;
  private estTickAt = 0;

  constructor() {
    this.head = freshSnap(0);
  }

  connect(meta: ClientMeta): void {
    const urls = [`ws://${location.host}/ws`, 'ws://127.0.0.1:8787/ws'];
    this.tryUrl(urls, 0, meta);
  }

  private tryUrl(urls: string[], i: number, meta: ClientMeta): void {
    if (i >= urls.length) {
      this.state = 'closed';
      this.onStatus('connection failed');
      this.onClosed();
      return;
    }
    this.onStatus(`connecting…`);
    const ws = new WebSocket(urls[i]);
    this.ws = ws;
    ws.onopen = () => {
      this.state = 'connected';
      this.onStatus('connected');
      ws.send(JSON.stringify({ type: 'hello', meta }));
    };
    ws.onmessage = (ev) => this.handleMessage(String(ev.data));
    ws.onclose = () => {
      if (this.state === 'connected') {
        this.state = 'closed';
        this.onClosed();
      } else {
        this.tryUrl(urls, i + 1, meta);
      }
    };
    ws.onerror = () => ws.close();
  }

  private handleMessage(raw: string): void {
    let m: unknown;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    const msg = m as
      | { type: 'welcome'; id?: number; seed?: number; tick?: number }
      | { type: 'full'; snap?: FullSnapshot }
      | { type: 'delta'; snap?: DeltaSnapshot }
      | { type: 'event'; e?: GameEvent }
      | { type: 'pong'; t?: number };
    switch (msg.type) {
      case 'welcome':
        this.ownId = msg.id ?? -1;
        this.estTickBase = msg.tick ?? 0;
        this.estTickAt = performance.now();
        this.onWelcome(this.ownId, msg.seed ?? 0, this.estTickBase);
        break;
      case 'full':
        if (msg.snap) {
          this.ingestFull(msg.snap);
          this.estTickBase = msg.snap.tick;
          this.estTickAt = performance.now();
          this.onFull(msg.snap);
        }
        break;
      case 'delta':
        if (msg.snap) this.ingestDelta(msg.snap);
        break;
      case 'event':
        if (msg.e) this.onEvent(msg.e);
        break;
      case 'pong':
        if (msg.t) this.rtt = Math.max(8, Math.min(500, (performance.now() - msg.t) * 2));
        break;
    }
  }

  private ingestFull(s: FullSnapshot): void {
    const snap = freshSnap(s.tick);
    for (const p of s.players) snap.players.set(p.id, playerToView(p as unknown as Record<string, unknown>));
    for (const i of s.items) snap.items.set(i.id, itemToView(i as unknown as Record<string, unknown>));
    for (const v of s.vehicles) snap.vehicles.set(v.id, vehicleToView(v as unknown as Record<string, unknown>));
    for (const c of s.crates) snap.crates.set(c.id, { id: c.id, pos: v3clone(c.pos) });
    snap.zone = s.zone ? { ...s.zone, center: v3clone(s.zone.center), nextCenter: v3clone(s.zone.nextCenter) } : null;
    snap.match = s.match ? JSON.parse(JSON.stringify(s.match)) : null;
    this.history = [snap];
    this.head = snap;
    this.trimHistory();
  }

  private ingestDelta(d: DeltaSnapshot): void {
    // Apply ops onto the head snapshot (closest to now).
    const h = this.head;
    for (const op of d.ops) {
      if (op[0] === 'a') {
        const ent = op[2] as unknown as Record<string, unknown>;
        if (ent.kind === 'player' || ent.kind === 'bot') h.players.set(ent.id as number, playerToView(ent));
        else if (ent.kind === 'item') h.items.set(ent.id as number, itemToView(ent));
        else if (ent.kind === 'vehicle') h.vehicles.set(ent.id as number, vehicleToView(ent));
        else if (ent.kind === 'crate') h.crates.set(ent.id as number, { id: ent.id as number, pos: v3clone(ent.pos as Vec3) });
      } else if (op[0] === 'u') {
        const id = op[1];
        const part = op[2] as Record<string, unknown>;
        const ent = h.players.get(id) ?? h.items.get(id) ?? h.vehicles.get(id) ?? h.crates.get(id);
        if (!ent) break;
        if ('pos' in ent && part.pos) ent.pos = v3clone(part.pos as Vec3);
        if ('yaw' in ent && part.yaw !== undefined) (ent as PlayerView | VehicleView).yaw = part.yaw as number;
        if ('pitch' in ent && part.pitch !== undefined) (ent as PlayerView).pitch = part.pitch as number;
        if ('hp' in ent && part.hp !== undefined) (ent as PlayerView | VehicleView).hp = part.hp as number;
        if ('armor' in ent && part.armor !== undefined) (ent as PlayerView).armor = part.armor as number;
        if ('state' in ent && part.state !== undefined) (ent as PlayerView).state = part.state as string;
        if ('suppression' in ent && part.suppression !== undefined) (ent as PlayerView).suppression = part.suppression as number;
        if ('kills' in ent && part.kills !== undefined) (ent as PlayerView).kills = part.kills as number;
        if ('chuteOpen' in ent && part.chuteOpen !== undefined) (ent as PlayerView).chuteOpen = part.chuteOpen as boolean;
        if ('activeSlot' in ent && part.activeSlot !== undefined) (ent as PlayerView).activeSlot = part.activeSlot as number;
        if ('slot0' in ent && part.slot0 !== undefined) (ent as PlayerView).slot0 = part.slot0 as number;
        if ('slot1' in ent && part.slot1 !== undefined) (ent as PlayerView).slot1 = part.slot1 as number;
        if ('equippedWeapon' in ent && part.equippedWeapon !== undefined) (ent as PlayerView).equippedWeapon = part.equippedWeapon as number;
        if ('ammo' in ent && part.ammo) (ent as PlayerView).ammo = part.ammo as number[];
        if ('inv' in ent && part.inv) (ent as PlayerView).inv = part.inv as number[];
        if ('lean' in ent && part.lean !== undefined) (ent as PlayerView).lean = part.lean as number;
        if ('vehicleId' in ent && part.vehicleId !== undefined) (ent as PlayerView).vehicleId = part.vehicleId as EntityId;
        if ('isDriving' in ent && part.isDriving !== undefined) (ent as PlayerView).isDriving = part.isDriving as boolean;
        if ('speed' in ent && part.speed !== undefined) (ent as VehicleView).speed = part.speed as number;
        if ('fuel' in ent && part.fuel !== undefined) (ent as VehicleView).fuel = part.fuel as number;
        if ('tires' in ent && part.tires !== undefined) (ent as VehicleView).tires = part.tires as number;
        if ('engineBroken' in ent && part.engineBroken !== undefined) (ent as VehicleView).engineBroken = part.engineBroken as boolean;
        if ('inWater' in ent && part.inWater !== undefined) (ent as VehicleView).inWater = part.inWater as boolean;
        if ('occupants' in ent && part.occupants) (ent as VehicleView).occupants = part.occupants as EntityId[];
        if ('count' in ent && part.count !== undefined) (ent as ItemView).count = part.count as number;
        if ('rarity' in ent && part.rarity !== undefined) (ent as ItemView).rarity = part.rarity as number;
        if ('defId' in ent && part.defId !== undefined) (ent as ItemView).defId = part.defId as string;
      } else if (op[0] === 'd') {
        h.players.delete(op[1]);
        h.items.delete(op[1]);
        h.vehicles.delete(op[1]);
        h.crates.delete(op[1]);
      }
    }
    if (d.zone) h.zone = { ...d.zone, center: v3clone(d.zone.center), nextCenter: v3clone(d.zone.nextCenter) };
    if (d.match) h.match = h.match ? { ...h.match, ...d.match } : d.match as MatchState;
    h.tick = d.tick;
    // Keep a short history for interpolation: push new snap if tick advanced far.
    const last = this.history[this.history.length - 1];
    if (last !== h) this.history.push(freshSnap(h.tick));
    this.history[this.history.length - 1] = h;
    if (this.history.length > 2) this.history.shift();
    this.trimHistory();
  }

  private trimHistory(): void {
    while (this.history.length > 2) this.history.shift();
  }

  estServerTick(): number {
    return this.estTickBase + Math.round((performance.now() - this.estTickAt) / (1000 / 30));
  }

  /** Interpolated view at render time. */
  getView(): NetView {
    const target = this.estServerTick() - 2;
    const snaps = this.history;
    if (snaps.length === 0) {
      // No snapshot yet (connecting / no server): an empty view keeps the
      // render loop alive instead of throwing on '.players' dereferences.
      return {
        players: new Map(), items: new Map(), vehicles: new Map(), crates: new Map(),
        zone: null, match: null, tick: 0, estTick: target,
      };
    }
    if (snaps.length < 2) {
      const h = snaps[0];
      return {
        players: h.players, items: h.items, vehicles: h.vehicles, crates: h.crates,
        zone: h.zone, match: h.match, tick: h.tick, estTick: target,
      };
    }
    const a = snaps[0];
    const b = snaps[1];
    const span = Math.max(1, b.tick - a.tick);
    let f = (target - a.tick) / span;
    f = Math.max(0, Math.min(1, f));
    const players = new Map<EntityId, PlayerView>();
    for (const [id, pb] of b.players) {
      const pa = a.players.get(id);
      if (!pa) { players.set(id, pb); continue; }
      players.set(id, {
        ...pb,
        pos: v3(
          lerp(pa.pos.x, pb.pos.x, f),
          lerp(pa.pos.y, pb.pos.y, f),
          lerp(pa.pos.z, pb.pos.z, f),
        ),
        yaw: lerpAngle(pa.yaw, pb.yaw, f),
        pitch: lerp(pa.pitch, pb.pitch, f),
        hp: lerp(pa.hp, pb.hp, f),
        armor: lerp(pa.armor, pb.armor, f),
      });
    }
    const items = new Map<EntityId, ItemView>();
    for (const [id, pb] of b.items) {
      const pa = a.items.get(id);
      if (!pa) { items.set(id, pb); continue; }
      items.set(id, { ...pb, pos: v3(lerp(pa.pos.x, pb.pos.x, f), lerp(pa.pos.y, pb.pos.y, f), lerp(pa.pos.z, pb.pos.z, f)) });
    }
    const vehicles = new Map<EntityId, VehicleView>();
    for (const [id, pb] of b.vehicles) {
      const pa = a.vehicles.get(id);
      if (!pa) { vehicles.set(id, pb); continue; }
      vehicles.set(id, {
        ...pb,
        pos: v3(lerp(pa.pos.x, pb.pos.x, f), lerp(pa.pos.y, pb.pos.y, f), lerp(pa.pos.z, pb.pos.z, f)),
        yaw: lerpAngle(pa.yaw, pb.yaw, f),
      });
    }
    const crates = new Map<EntityId, CrateView>();
    for (const [id, pb] of b.crates) {
      const pa = a.crates.get(id);
      if (!pa) { crates.set(id, pb); continue; }
      crates.set(id, { ...pb, pos: v3(lerp(pa.pos.x, pb.pos.x, f), lerp(pa.pos.y, pb.pos.y, f), lerp(pa.pos.z, pb.pos.z, f)) });
    }
    return {
      players, items, vehicles, crates,
      zone: b.zone ?? a.zone, match: b.match ?? a.match,
      tick: b.tick, estTick: target,
    };
  }

  /** Stamp seq on raw samples and enqueue for the next flush. */
  pushSamples(samples: Omit<InputSample, 'seq'>[]): void {
    for (const s of samples) {
      this.queue.push({ ...s, seq: this.seq++ });
    }
    if (this.queue.length > 24) this.queue = this.queue.slice(-24);
  }

  /** Flush queued inputs to the server (call every tick). */
  flushInputs(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.queue.length === 0) return;
    this.ws.send(JSON.stringify({ type: 'input', samples: this.queue }));
    this.queue = [];
  }

  sendStart(): void {
    this.ws?.send(JSON.stringify({ type: 'start' }));
  }

  sendPingAt(x: number, z: number, kind: number): void {
    this.ws?.send(JSON.stringify({ type: 'pingAt', x, z, kind }));
  }

  sendChat(text: string): void {
    this.ws?.send(JSON.stringify({ type: 'chat', text: text.slice(0, 120) }));
  }

  close(): void {
    this.ws?.close();
  }
}