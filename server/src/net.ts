// net.ts — WebSocket hub: connection lifecycle, message validation, dispatch.

import type { Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { WORLD_SEED } from '../../shared/src/consts.ts';
import type { ClientMeta, GameEvent, InputSample, ServerMsg } from '../../shared/src/types.ts';
import { validateInput, validateName } from './validation.ts';
import { SnapshotTracker } from './sync.ts';

export interface NetHubOptions {
  /** Attach to an existing HTTP server (shares its port). Overrides port/host. */
  server?: Server;
  /** Standalone bind port; ignored when `server` is given. */
  port?: number;
  host?: string;
  path?: string;
}

export interface NetClientCtx {
  ws: WebSocket;
  id: number;
  meta: ClientMeta;
  tracker: SnapshotTracker;
  /** Inputs buffered between ticks (max input rate is enforced per tick). */
  buffered: InputSample[];
  /** Monotonic accepted input seq per client — server-authoritative ordering. */
  lastSeq: number;
  disconnected: boolean;
}

const MAX_BUFFERED = 64;

export class NetHub {
  clients = new Map<number, NetClientCtx>();
  /** Latest sim tick, refreshed each step; used for welcome base-tick sync. */
  currentTick = 0;
  private byWs = new Map<WebSocket, NetClientCtx>();
  private wss: WebSocketServer;

  /** Client lifecycle callbacks (wired by the sim / index). */
  onHello?: (meta: ClientMeta) => number;
  onInput?: (id: number, samples: InputSample[]) => void;
  onStart?: (id: number) => void;
  onPingAt?: (id: number, x: number, z: number, kind: number) => void;
  onChat?: (id: number, text: string) => void;
  onDisconnect?: (id: number) => void;

  constructor(opts: NetHubOptions) {
    if (opts.server) {
      // Share the HTTP server's port so static files and /ws live on one origin.
      this.wss = new WebSocketServer({ server: opts.server, path: opts.path ?? '/ws' });
    } else {
      this.wss = new WebSocketServer({ port: opts.port ?? 0, host: opts.host, path: opts.path ?? '/ws' });
    }
    this.wss.on('connection', (ws) => this.onConnection(ws));
  }

  private onConnection(ws: WebSocket): void {
    ws.on('message', (data) => this.handle(ws, data.toString()));
    ws.on('close', () => this.drop(ws));
    ws.on('error', () => {
      /* socket teardown handled by close */
    });
  }

  private drop(ws: WebSocket): void {
    const ctx = this.byWs.get(ws);
    if (!ctx || ctx.disconnected) return;
    ctx.disconnected = true;
    this.byWs.delete(ws);
    this.clients.delete(ctx.id);
    this.onDisconnect?.(ctx.id);
  }

  private handle(ws: WebSocket, raw: string): void {
    let msg: unknown;
    try {
      msg = JSON.parse(raw);
    } catch {
      return; // malformed JSON — drop
    }
    const m = msg as Record<string, unknown> | null;
    if (!m || typeof m !== 'object' || typeof m.type !== 'string') return;

    const type = m.type;
    if (type === 'hello') {
      if (this.byWs.has(ws)) return; // already greeted
      const metaRaw = (m.meta ?? {}) as { name?: unknown; skin?: unknown; region?: unknown };
      const name = validateName(typeof metaRaw.name === 'string' ? metaRaw.name : '');
      const skin = Number(metaRaw.skin) || 0;
      const id = this.onHello?.({ name, skin, region: 'aurelia' }) ?? -1;
      if (id < 0) return;
      const ctx: NetClientCtx = {
        ws,
        id,
        meta: { name, skin, region: 'aurelia' },
        tracker: new SnapshotTracker(),
        buffered: [],
        lastSeq: -1,
        disconnected: false,
      };
      this.byWs.set(ws, ctx);
      this.clients.set(id, ctx);
      this.send(id, { type: 'welcome', id, seed: WORLD_SEED, tick: this.currentTick });
      return;
    }

    const ctx = this.byWs.get(ws);
    if (!ctx) return;

    switch (type) {
      case 'input': {
        const rawSamples = m.samples;
        if (!Array.isArray(rawSamples) || rawSamples.length === 0) return;
        const samples: InputSample[] = [];
        for (const raw of rawSamples) {
          const s = validateInput(raw);
          if (s) samples.push(s);
        }
        ctx.buffered.push(...samples);
        if (ctx.buffered.length > MAX_BUFFERED) ctx.buffered.splice(0, ctx.buffered.length - MAX_BUFFERED);
        this.onInput?.(ctx.id, samples);
        break;
      }
      case 'start':
        this.onStart?.(ctx.id);
        break;
      case 'pingAt': {
        const x = typeof m.x === 'number' ? m.x : 0;
        const z = typeof m.z === 'number' ? m.z : 0;
        const kind = typeof m.kind === 'number' ? m.kind : 0;
        this.onPingAt?.(ctx.id, x, z, kind);
        break;
      }
      case 'chat': {
        const text = typeof m.text === 'string' ? m.text.slice(0, 140) : '';
        if (text) this.onChat?.(ctx.id, text);
        break;
      }
      default:
        break;
    }
  }

  send(id: number, msg: ServerMsg): void {
    const ctx = this.clients.get(id);
    if (!ctx || ctx.disconnected) return;
    if (ctx.ws.readyState === 1) {
      ctx.ws.send(JSON.stringify(msg));
    }
  }

  broadcast(msg: ServerMsg, exceptId = -1): void {
    for (const id of this.clients.keys()) {
      if (id !== exceptId) this.send(id, msg);
    }
  }

  broadcastEvent(e: GameEvent): void {
    this.broadcast({ type: 'event', e });
  }

  close(): void {
    this.wss.close();
  }
}