# ZONEFALL — 「Landfall Protocol」

An original, browser-native battle royale. 100-player engagements on the island of **Isla Aurelia**, rendered in Three.js with a server-authoritative Node.js simulation — plus a complete **Unreal Engine 5.6 port architecture** for a PC team.

> **100% original IP.** Every weapon, region, vehicle, name, color, sound, and line of code is original to this project. No copyrighted assets, maps, characters, or code from any existing title.

---

## What is this?

ZONEFALL is a playable, deployable battle royale built for the browser:

- **8×8 km procedural island** — 12 themed regions (coastal city, industrial district, mountain villages, snow summit, desert plateau, harbor, airport, observatory, research facility, river network, tunnels, hidden bunker).
- **30-player-scale fights with 99 AI bots** per match (100 total), with real-player netcode architected for the human multiplayer upgrade path.
- **Full systems depth**: zone circle with provably-reachable safe centers, ~30 original weapons with a real ballistics table, loot rarity tiers, armor/heal/throwables, 7 drivable vehicles with fuel and damage, parachute insertion, kill feed, spectator mode, minimap, and dynamic-resolution rendering for mobile-class hardware.
- **Browser + mobile playable**: WebGL via Three.js, touch controls with dual joystick, dynamic pixel ratio that self-tunes to hit 30/60/120/240 FPS tiers.

Plus a complete **Unreal Engine 5.6 port architecture** (`docs/UE5-PORT-ARCHITECTURE.md`) mapping every system — terrain, netcode, bots, vehicles, zone logic, live service — to Actors, GameplayFramework, GAS, Neural Networks, Chaos, and the online subsystem, so a PC team can build the AAA version from this same design.

---

## Quick start

Requirements: **Node >= 23.6** (native TypeScript type-stripping; no bundler needed for the server). Works on Termux (aarch64) and desktop.

```bash
npm install                      # deps (esbuild auto-approved via allowScripts)
npm run dev                      # Vite client (5173) + Node server (8787) concurrently
# open http://127.0.0.1:5173
```

Production build and serve:

```bash
npm run build                    # tsc typecheck + vite build → dist/
npm start                        # serves dist/ + WebSocket on :8787 (PORT env to override)
```

Health check: `curl http://127.0.0.1:8787/health`.

---

## The loop

1. **Deploy** — the flight plane crosses Isla Aurelia at 400 m; 100 players dive, free-fall, and pull parachutes.
2. **Loot** — buildings and ground spawn items across 5 rarity tiers: weapons, ammo, armor, heals, throwables, repair kits.
3. **Rotate** — the safe zone shrinks through 6 phases; out-of-zone damage scales. Every next circle is proven reachable, so rotation skill — not luck — decides.
4. **Fight** — server-authoritative ballistics resolve bullets with drop, travel time, armor absorption, limb multipliers, and penetration against designated wall materials.
5. **Drive** — 7 vehicles cover land, water, and everything between; manage fuel, and repair engines/tires mid-combat.
6. **Win** — last operator standing. Then spectate the remaining fights or queue again.

---

## Repository layout

```
zonefall/
├── package.json            # scripts (dev/build/test/verify), allowScripts
├── tsconfig.json           # strict TS, .ts-extension imports, verbatim modules
├── shared/src/             # pure TS contracts — SAME code on server and client
│   ├── consts.ts            # ticks, world size, player/plane/zone constants
│   ├── types.ts             # entities, snapshots, messages, events
│   ├── weapons.ts           # 30-weapon registry + ballistics table
│   ├── items.ts             # heals, armor, throwables, ammo
│   ├── vehicles.ts          # 7 vehicle definitions
│   ├── loot.ts              # rarity tiers and loot tables
│   ├── damage.ts            # armor/limb damage formulas
│   ├── ballistics.ts        # projectile simulation helpers
│   ├── zone.ts              # circle shrink math
│   ├── regions.ts           # 12-region island layout
│   ├── worldgen.ts          # heightfield, water, vegetation density
│   ├── noise.ts             # seeded value-noise / fbm
│   ├── rng.ts               # seeded mulberry32 PRNG (determinism)
│   ├── math.ts              # vector/angle/interp helpers
│   └── grid.ts              # spatial hash grid
├── server/src/             # authoritative 30 Hz simulation (runs as .ts directly)
│   ├── index.ts             # HTTP static + WebSocket bootstrap
│   ├── match.ts             # lobby → plane → drop → play → end
│   ├── world.ts             # entity store, spawns, physics
│   ├── sim.ts               # fixed-tick loop
│   ├── player-controller.ts # validated human input → movement
│   ├── bot.ts               # bot FSM + difficulty tiers + A*
│   ├── ai-nav.ts            # waypoint graph + pathfinding
│   ├── zone-manager.ts      # staged shrink, safe spot, zone damage
│   ├── loot-spawner.ts      # procedural per-region placement
│   ├── vehicle-sim.ts       # arcade-3D physics, fuel, damage, repair
│   ├── combat.ts            # ballistic resolve, penetration, suppression
│   ├── sync.ts              # dirty-bitmask deltas + quantization
│   ├── net.ts               # WS protocol, input buffers, rate limiting
│   ├── validation.ts        # server-side input validation (no client trust)
│   └── replay.ts            # event log for spectate/rebroadcast
├── client/                 # Vite + Three.js
│   └── src/
│       ├── main.ts          # bootstrap + dynamic-resolution loop
│       ├── net/             # WS client, state apply, interpolation
│       ├── predict.ts       # own-player prediction + reconciliation
│       ├── input/           # keyboard/mouse + touch dual-joystick
│       ├── player/          # 3rd-person camera, ADS, smoothing
│       ├── render/          # terrain, buildings, vegetation (instanced+LOD),
│       │                    # vehicles, characters, water, sky, effects, minimap
│       ├── ui/              # HUD, inventory, killfeed, pings, settings, a11y
│       └── audio.ts         # procedural WebAudio SFX
├── docs/
│   ├── GDD.md                     # game design document
│   ├── TECHNICAL-DESIGN.md        # engine architecture + DB schema
│   ├── NETCODE.md                 # authoritative model, prediction, lag comp
│   ├── UE5-PORT-ARCHITECTURE.md   # the UE5.6 port deliverable
│   ├── LIVE-SERVICE.md            # seasons, cosmetics-only BP, leaderboards
│   └── DEPLOYMENT.md              # hosting, packaging, perf targets
├── tests/                  # vitest unit tests (shared + server)
└── scripts/
    └── screenshot.sh       # headless chromium visual verification
```

## Architecture at a glance

- **Server-authoritative**: all simulation runs on the server at a fixed 30 Hz tick. Clients send seq-tagged input buffers; the server validates, simulates, and broadcasts **dirty-bitmask entity deltas** (quantized positions), with a **full snapshot every 20 ticks** as a reliability baseline. Sync is **distance-culled per client** so 100-player payloads stay small.
- **Prediction + interpolation**: clients predict their own movement and reconcile against server snaps; remote entities interpolate across a 100 ms buffer.
- **Deterministic world**: a fixed terrain seed (20205) plus per-match seeded PRNG mean the world, zone plan, and bot behavior are reproducible — human input is the only entropy.
- **Bots at scale**: 99 bots run a state machine (DROP → LOOT → ROTATE → ENGAGE → HEAL → DRIVE) with difficulty tiers and A* navigation over the heightfield grid; bots think at ~15 Hz to bound CPU.
- **One source of truth**: `shared/` is imported by both the server and client, so weapon stats, zone math, and entity contracts can never drift apart.

## Verified & tested

- `npm run typecheck` — strict TypeScript across shared/server/client.
- `npm test` — vitest unit tests on shared math, ballistics, zone, damage, loot, sync quantization, bot FSM.
- `npm run build` — tsc + Vite production bundle.
- `bash scripts/screenshot.sh` — headless Chromium captures to prove visual state.

## Roadmap (see `docs/LIVE-SERVICE.md` for the full live-service plan)

| Milestone | Content |
|---|---|
| Ship (this build) | Solo, 100-player bots, full systems, procedural world |
| v0.2 | Real human multiplayer (netcode per `docs/NETCODE.md`), Duos, TDM practice |
| v0.3 | Account auth + cloud save, leaderboards, achievements |
| v1.0 | Season 1, battle pass, friends/clans, ranked, mobile store packaging |

---

*ZONEFALL is an original work. No affiliation with any existing game or franchise.*