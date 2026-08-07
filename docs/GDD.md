# ZONEFALL — Game Design Document

**Working title:** ZONEFALL
**Codename:** Landfall Protocol
**Platforms:** Web (PC/mobile browsers, WebGL), with a documented Unreal Engine 5.6 port path (see `UE5-PORT-ARCHITECTURE.md`)
**Genre:** Online battle royale (PvP, 100-player matches)
**Player count:** 100 (99 AI bots + 1 human in this build; human netcode architected for live multiplayer)
**Rating target:** T (tactical violence, no gore emphasis)

---

## 1. Vision

> *Isla Aurelia is the last sovereign land in a drowned world. Every season, a hundred daredevils are dropped over its coasts; one walks away with the Landfall Contract. You are that hundredth.* 

ZONEFALL is an original battle-royale experience focused on **decision density**: every circle, every shot, every gas-guzzling car matters. Built 100% from original IP — no copyrighted characters, maps, sounds, or assets.

### Pillars
1. **Tactical depth** — bullet drop, travel time, penetration, lean, suppression; positioning beats reflexes.
2. **Legible world** — 12 hand-tuned regions with distinct silhouettes, lighting and loot personality.
3. **Snappy loop** — drop → loot → rotate → fight, under 18 minutes per match, even with 100 agents.
4. **Honest performance** — 60fps phone target, dynamic resolution, no texture-loading hitches (procedural world).

## 2. Core Loop

```
Landing (plane → skydive → parachute)
  → Loot (procedural spawns, rarity, weapon + item synergy)
  → Rotate (safe zone shrinks; vehicles + foot)
  → Fight (ballistic combat, armor, throwables, suppression)
  → Win (last alive) or spectate/redeploy
```

Match length target: 14–18 min. Early game (loot): 0–4 min. Mid (rotation + skirmishes): 4–11. Late (final circles): 11–16. End: 16–18.

## 3. World — Isla Aurelia

8×8 km island, elliptical coastline, procedural but deterministic (fixed terrain seed). 12 regions:

| Region | Biome | Character | Loot |
|---|---|---|---|
| Aurelia Springs | Coastal city | Dense urban, tall towers, rooftop fights | High density, mid rarity |
| Ironworks District | Industrial | Warehouses, cranes, smokestacks | High density, mid |
| Silverpine Ridge | Mountain | Verticality, ridges, snipers | Low density, high rarity |
| Verdant Hollow | Forest | Ambush cover, hunting | Low, mixed |
| Sunfang Plateau | Desert | Open sightlines, dune buggy terrain | Mid |
| Frostline Summit | Snow | Ridge combat, whiteout tint | Mid |
| Aurelia International | Airport | Runways, hangars, open flanks | High, mid |
| Gullhaven Port | Harbor | Cranes, containers, boats | High |
| Celeste Observatory | Mountain peak | Dome, long-range perch | Mid-high |
| Meridian Research | Facility | Labs, bunker entrance | High, high rarity |
| Ember River | River system | Boats, bridges, ambush lanes | Low |
| Hollow Plains | Plains | Rotations, vehicle play | Low-mid |

Hidden: **underground tunnel network** under Meridian → Ironworks; **3 hidden bunkers** (supply caches + legendary loot) at deterministic-but-secret spots.

## 4. Gameplay Systems

### 4.1 Insertion
Aircraft flies the island's long axis (path chosen per match). Players drop any time (skydive: fast fall + steering; parachute: auto-deploy near ground or manual). Skydive max fall ~60 m/s; parachute ~4.5 m/s.

### 4.2 Safe Zone
6 phases. Each next circle is **provably reachable**: its center is sampled inside the current circle contracted by the next radius, so no player can be eliminated purely by zone geometry. Outside-zone damage: 1/2/4/8/12/18 dps per phase. Circle shrink: linear, 35–75 s per phase.

### 4.3 Loot & Rarity
~1200 ground spawns + crate drops + supply drops (every 120 s, high rarity). Rarity: Common → Uncommon → Rare → Legendary. Region loot multipliers modulate quality. Weapons roll 70%, items 30%.

### 4.4 Inventory
- 2 weapon slots + active slot
- 4 ammo pools (light/medium/heavy/shells)
- Items: bandage (10hp/3s), medkit (50/6s), syringe (100/9s), stim (35 + 30s speed buff)
- Armor: Plate Vests Mk I–III + Aegis (25/50/75/100 absorb, 60% absorption ratio)
- Throwables: frag (90 dmg @ 7m), smoke (12m), flash (14m)

### 4.5 Combat
Ballistic model: muzzle velocity 300–1050 m/s, gravity multiplier per weapon, bullet travel time, damage falloff (full to 60% of range → 25% at max). Limb multipliers: head ×2.0, chest ×1.0, abdomen ×1.1, arm ×0.85, leg ×0.75. Suppression: near misses fill suppression meter; suppressed aim spreads widen. Lean (Q/E), ADS zoom, recoil patterns (vertical + horizontal), weapon sway while moving.

### 4.6 Vehicles
7 original vehicles (Sedan, Pickup, SUV, Rascal moto, Dune Buggy, Ember Runabout boat, Utility Truck). Fuel consumption, 4-wheel (or 2) tire damage (per-tire speed penalty), engine damage <20% hp, repair kit (250hp + fuel), explosion on 0 hp, boat flotation, non-watercraft sink.

### 4.7 Bots (the 99)
Tiered FSM: drop → loot → rotate → engage → heal → drive. Tiers (rook/veteran/elite) scale vision (160/220/280 m), aim error (0.12/0.07/0.03 rad), reaction (0.8/0.45/0.2 s). Bots are honest: no wallhacks, no teleports; they path with A* on the terrain waypoint graph, respect zone, drive when far, heal when hurt, and engage only with line-of-sight.

## 5. UI/UX
- HUD: health/armor/stim bars, weapon slots + ammo, compass strip, minimap (region labels, zone, pings), kill feed, match stats, hit markers, damage vignette + direction, zone warnings, suppression bar
- Menu: name, 6 skins, deploy; settings (sensitivity, FOV, volume, colorblind modes, high-contrast, UI scale); pause; end-of-match results
- Accessibility: colorblind filters (protan/deutan/tritan), high-contrast, scalable UI, customizable controls

## 6. Modes
Solo (this build), Duo/Squad (architected — team assignment fields exist in state), custom rooms + training (roadmap). Ranked ladder + clans + reconnect (roadmap, see LIVE-SERVICE.md).

## 7. Live Service
Seasons, cosmetics-only battle pass, daily/weekly missions, leaderboards, achievements, live events. Monetization: **cosmetics only** — zero pay-to-win. See `LIVE-SERVICE.md`.

## 8. Original IP Statement
All names (ZONEFALL, Isla Aurelia, Valdar/Northwind/Corbelli/Tessell/Aurelian MW weapon brands, vehicle names), lore, geometry, palettes, UI, audio (procedural WebAudio), and code are original to this project. No assets, names, or mechanics are copied from existing titles (PUBG, Free Fire, Warzone, Fortnite, Apex).

## 9. Technical Snapshot
- Client: Three.js WebGL (0.185), Vite 8, TypeScript; procedural world (no textures), instancing, LOD, dynamic resolution
- Server: Node 26 (native TS), authoritative 30 Hz fixed tick, spatial hash, seeded determinism, delta+full snapshots, distance-culled sync, input validation
- 100 entities/tick budget: bots think at 15 Hz, sim at 30 Hz, <2 KB/player/tick
- Target: 60 fps Android, 120 fps iOS (cap 120), 240 fps PC (cap 240) — see `TECHNICAL-DESIGN.md`
