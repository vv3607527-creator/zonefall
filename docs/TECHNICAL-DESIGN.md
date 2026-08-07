# ZONEFALL — Technical Design

## 1. Runtime topology

```
┌─────────────┐   WebSocket (JSON, deltas)   ┌────────────────────────────┐
│ Browser     │ ───────────────────────────▶ │ Node 26 authoritative      │
│ Three.js    │ ◀─────────────────────────── │ server (30 Hz fixed tick)  │
│ client      │   full snaps / deltas/events │ world + bots + zone + net  │
└─────────────┘                              └────────────────────────────┘
        ▲                                                │
        └── static assets (dist/) served by the same     ▼
            Node process at :8787                 Replay log (JSONL, optional)
```

- One process serves both the built client and the WS endpoint; Vite dev proxies `/ws` in development.
- Server: Node 26 native TypeScript type-stripping — no build step for the server. Client: Vite build to `dist/`.

## 2. Simulation model

- **Fixed tick 30 Hz**, `TICK_MS = 1000/30`. One `sim` loop with drift-corrected `setTimeout`.
- **Determinism:** worldgen (terrain, buildings, vegetation) uses fixed `WORLD_SEED`; match randomness (loot, zone stages, bots, supply drops) uses a per-match seed (`Rng` mulberry32) broadcast in `welcome`. Human inputs are the only non-determinism.
- **Entity store:** `Map<EntityId, T>` per kind + `SpatialGrid` broadphase rebuilt each tick (grid cell 32 m).
- **Per-tick budget:** bots think at 15 Hz (every 2nd tick); bullets integrate in one pass; zone damage applied in one sweep. O(n) with n ≤ ~1500 active objects.

## 3. Networking protocol

- Messages: JSON over WS. Types in `shared/src/types.ts` (`ClientMsg`/`ServerMsg`).
- **Input:** clients batch `InputSample` (seq, move, aim delta, fire, ads, sprint, crouch, jump, lean, switchSlot, use, throw) every 50 ms; server validates + applies in tick order; seq tracking drops stale/duplicate/reordered input.
- **Sync:** full snapshot every 20 ticks (~667 ms) as a correctness baseline; otherwise **dirty-bitmask deltas**: `['u'|'a'|'d', id, partial]`. Positions/angles quantized: fixed-point 16-bit per axis over the 4096 m world (±6 cm), yaw/pitch 16-bit over 2π (0.006°).
- **Distance culling:** per client, only entities within 1500 m (players/vehicles) or 600 m (items) plus own player, zone, match state. Bound: < ~2 KB/tick typical.
- **Prediction/interpolation:** client predicts own movement (same formulas as server), interpolates remote entities 100 ms back; reconciliation snaps when server pos deviates > 1.5 m. See `NETCODE.md`.

## 4. Server module map

| File | Role |
|---|---|
| `index.ts` | bootstrap: static dist + WS + health |
| `net.ts` | WS layer, hello/input/ping/chat/start, rate limits |
| `world.ts` | entity stores, terrain height queries, spawn helpers, kill callbacks |
| `sim.ts` | tick loop + phase orchestration |
| `player-controller.ts` | movement integration (walk/sprint/crouch/jump/skydive/parachute/wade) |
| `combat.ts` | projectile steps, hits, penetration budget, suppression, melee, explosions |
| `vehicle-sim.ts` | arcade vehicle physics, fuel/tires/engine, enter/exit, boats |
| `zone-manager.ts` | 6-stage reachable-circle zone, out-of-zone damage |
| `loot-spawner.ts` | procedural loot + vehicles + supply crates |
| `ai-nav.ts` | waypoint graph (40 m grid, 8-neighbor, slope-checked edges) + A* |
| `bot.ts` | tiered FSM (drop/loot/rotate/engage/heal/drive) |
| `match.ts` | lobby/flight/playing/ended lifecycle, plane path, win condition |
| `sync.ts` | quantization, full/delta snapshot builders, per-client broadcast |
| `validation.ts` | input/ping/chat validation (no client trust) |
| `replay.ts` | event log (kills, zone, drops) → JSONL |

## 5. Client module map

| File | Role |
|---|---|
| `main.ts` | orchestration, entity sync, prediction, spectate, day cycle |
| `net/client.ts` | WS client, snapshot store, interpolation |
| `predict.ts` | own-player prediction + reconcile |
| `input/input.ts`, `input/touch.ts` | keyboard/mouse + touch dual-stick |
| `player/controller.ts` | third-person chase cam, ADS, lean, spectate cams |
| `render/*` | terrain, buildings, vegetation, vehicles, characters, water, sky, effects, minimap |
| `ui/*` | HUD, menu, inventory, settings (DOM) |
| `audio.ts` | procedural WebAudio |

## 6. Performance model

- **Rendering:** procedural world (zero texture memory); InstancedMesh for vegetation/buildings (<600 instances of instanced meshes); characters LOD: full mesh < 400 m, billboard dot beyond; distance culling 900 m camera-side; dynamic resolution (pixel ratio 0.6–1.75, adapts on 40 ms frames); MSAA off on mobile.
- **Simulation:** 100 players → bots think at 15 Hz, 30 Hz integration; spatial grid bounds queries; delta sync bounds bandwidth.
- **Targets:** Android 60 fps (mid), iOS 120 fps (supported), PC 240 fps (frame-cap 240, dynamic res overhead minimal).
- **Verification on-device:** headless Chromium screenshots + FPS probe (see `DEPLOYMENT.md`).

## 7. Backend (roadmap, documented for the UE port)

- **Auth:** anonymous session token → optional account (username/password, OAuth) → JWT (HS256, server-side secret).
- **Matchmaking:** room-based: server picks region → `MAX_PLAYERS - humans` bots fill; real multiplayer: lobby pool + zone-weighted matchmaking (documented; not in this build).
- **Persistence (SQLite → Postgres in prod):**

```sql
players(id PK, name UNIQUE, skin, created_at, last_seen)
matches(id PK, seed, started_at, ended_at, winner_id, region)
match_results(id PK, match_id FK, player_id FK, place, kills, damage_dealt, time_alive)
stats(player_id PK, matches, wins, kills, top10s, total_damage, best_place)
season_ladder(season INT, player_id, rating INT, wins, kills)
battle_pass(player_id, season, tier, xp)
missions(player_id, kind, target, progress, claimed)
achievements(id PK, name, description, icon)
player_achievements(player_id, achievement_id, unlocked_at)
analytics_events(id PK, player_id, kind, payload JSON, ts)
```

- **Live service:** seasons (8 weeks), battle pass cosmetics-only, daily/weekly missions, leaderboards (EOS Stats or ladder table), achievements, live events (supply-drops frenzy, night matches). Monetization: cosmetics only. See `LIVE-SERVICE.md`.

## 8. Security

- Server-authoritative: all damage/loot/zone/vehicle state computed server-side; client state ignored.
- Input validation: clamp magnitudes, per-weapon fire-rate gate, seq bounds, rate limits (max 60 input msgs/5 s, 10 pings/5 s, chat ≤ 120 chars, strip control chars).
- WS: origin check (same-host), payload size cap (64 KB), per-message CPU bound.
- Static serving: path sanitization against traversal.
- No secrets in client; optional token auth for persistent accounts.

## 9. Testing

- Vitest unit tests: zone math, ballistics, damage formulas, loot rolls, world quantizers/deltas, bot FSM transitions, vehicle physics (see `tests/server/*`).
- Headless screenshot verification per visual milestone (`scripts/screenshot.sh`).
- Manual acceptance: full 100-player match to win, spectate, settings, touch.
