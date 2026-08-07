# ZONEFALL — NETCODE Design (authoritative model, prediction, lag compensation)

This document specifies the real-player netcode architecture. The current build runs humans through the identical pipeline (input → server → state), with bots filling the match; this spec covers full 100-human multiplayer and the lag-compensation layer.

## 1. Model

**Server-authoritative, fixed tick 30 Hz.** The server owns all simulation (movement, ballistics, loot, zone, vehicles). Clients are thin renderers + input senders. The server never trusts client state.

```
Client: input device → InputSample buffer → WS batch (every 50 ms, seq-tagged)
Server: queue → validate → apply in tick order → simulate → delta/full snapshot → WS
Client: snapshot store (100 ms interpolation buffer) → render; own player predicted locally
```

## 2. Input pipeline

- `InputSample`: `{ seq, mv{f,s}, dyaw, dpitch, fire, ads, sprint, crouch, jump, lean, switchSlot, use, throw }`.
- **Seq discipline:** monotonic per connection; server drops seq ≤ last applied (dupes/reorders), rejects gaps > 8 samples, clamps all values (see `validation.ts`).
- **Rate limits:** ≤ 60 input messages / 5 s; fire gated by weapon RPM server-side (`lastFireTick`).
- **Buffering:** server holds up to 8 samples; applies up to 2 per tick (matches 60 Hz client send vs 30 Hz sim).

## 3. Server → client sync

- **Full snapshot every 20 ticks (~667 ms)** — correctness baseline + join/reconnect recovery.
- **Dirty deltas** between baselines: `['u'|'a'|'d', id, partial]`; partials carry quantized fields only for changed entities (`world.touch(id)` marks).
- **Quantization:** position 16-bit/axis over ±2048 m (~6 cm), angles 16-bit/2π (~0.006°), hp/armor u8, ammo u16, state u8.
- **Distance culling:** per-client relevance set — players/vehicles < 1500 m, items < 600 m, own player + zone + match always. Bound ~2 KB/tick.
- **Bandwidth model (100 players):** 30 Hz × ~1.5 KB avg ≈ 45 KB/s per client at 100 alive; drops sublinearly as players die. Compression headroom: binary framing (planned; JSON now for debug).

## 4. Client prediction & reconciliation

- **Predict own player:** run identical movement integration on `InputSample` immediately (`predict.ts`); render own player from prediction.
- **Interpolate others:** keep 3–4 snapshot positions per entity; render at `now - 100 ms` (lag hides jitter).
- **Reconcile:** on delta for own player, compare predicted vs server pos; if deviation > 1.5 m, blend to server pos over 150 ms and **refire unacknowledged inputs** (client keeps last ~30 samples; server acks via snapshot tick). 
- **Fire feel:** muzzle flash + tracer spawn instantly on input; server confirms with `hit`/`kill` events for hit markers. No client-side damage application.

## 5. Lag compensation (server-side)

- **Server rewinds:** for each incoming `fire` sample, server stores last ~500 ms of player positions (`RingBuffer<WorldSnapshotTick>` per tick, cheap: 100 players × 6 floats).
- **Bullet resolution:** bullet path tested against the **rewound positions of each player** (positions at `fireTick - (packetLatency/2)` — midpoint rewind), then current positions for walls/terrain.
- **Headshot/limb:** uses hit height against rewound pose (yaw-independent; crouch state captured in rewind).
- **Overshoot guard:** max rewind 250 ms; latency beyond that gets no compensation (and the player's shots realistically miss live targets).
- **Bullet ownership:** shooter's ping measured every 5 s (`pong`); rewind window per-shooter.

## 6. Vehicles

- Vehicle state replicated as one entity (pos, yaw, speed, hp, fuel, tires, occupants).
- Occupant fire: input routed to driver seat view; projectile origin = vehicle position + seat offset, velocity = bullet vel + vehicle vel (client-side lead indicator matches via shared `leadAngle`).

## 7. Bots

- Bots are server-side entities with the same state shape; their `InputSample`s are synthesized at 15 Hz. They share the interpolation pipeline client-side — zero client changes needed for 100-player matches.

## 8. Reconnect & spectator

- Server keeps dead/alive state; reconnect within 60 s rejoins via full snapshot (spec: account token restores player; current build: new join as fresh player).
- Spectator: server streams the winner chase camera data as part of deltas (spectated player id in `match` state); client renders from spectated player's camera. Replay = event log (`replay.ts`) replayed client-side.

## 9. Security properties

- No client-authoritative operations; validation clamps; rate limits; origin checks; bounded messages. Lag compensation bounded to 250 ms prevents position-abuse exploits. Anti-cheat roadmap (EOS) adds signed packets + server anomaly detection (fire-rate, speed, aimbot detection heuristics).
