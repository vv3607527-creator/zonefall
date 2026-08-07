# ZONEFALL — Live Service Design

> Monetization: **cosmetics only.** Zero pay-to-win. All gameplay content is earnable through play.

## 1. Seasons

- **Season length:** 8 weeks (2026-08-05 Season 1 "First Light").
- Each season: new cosmetic set (skins, weapon finishes, parachute trails, kill effects), one limited-time mode.
- Season pass: 50 tiers — free track (10 cosmetic rewards + mission boosts) and premium track (30 cosmetics). Premium purchasable with in-game earned currency grinds for some cosmetics (earn "Aurelian Marks" via wins/challenges).

## 2. Currency

| Currency | Earn | Spend |
|---|---|---|
| Marks | Matches, placement, missions | Cosmetic unlocks (non-premium), emotes |
| Landfall Credits | Premium purchase (cash) | Premium pass, premium cosmetics |

No currency buys power. Armory economy table is fixed and identical for all players.

## 3. Missions (daily / weekly)

- Daily: 3 missions — e.g. "Loot 15 items in Ironworks", "Place top 10", "3 kills", "Drive 2 km".
- Weekly: 5 — "Win a match", "10 headshots", "20 kills", "Survive 10 circles", "2000 damage".
- Rewards: XP, Marks, cosmetics. Skippable via weekly reroll token.

## 4. Leaderboards

- Seasonal ladder: rating from placement + kills + damage (Elo-ish: kills shift rating by ±rating delta scaled by your rating vs killer's).
- Weekly "Aurelian Warlords" top-100 featured.
- Persistent all-time: wins / kills / damage / top-10 rate.

## 5. Achievements

Persistent, one-time unlocks: "First Blood", "Island Legend" (10 wins), "Pacifist" (win 0 kills), "Road Rage" (10 vehicle kills), "Sharpshooter" (500m+ kill), "Bunker Rat" (visit all 3 bunkers), etc. Each grants Marks + a cosmetic.

## 6. Live events

- Supply Drop Frenzy (legendary spawns every 60 s), Night Ops (night circle + NVG cosmetics), Weapon of the Week, Community challenges (server-wide kill totals).

## 7. Analytics

`analytics_events` table: match start/end, DNFs, heatmaps (death positions), weapon usage balance, region popularity, retention cohorts, funnels (D1/D7/D30). Balance reviews driven by weapon win-rate data.

## 8. Backend contracts (roadmap, matches TECHNICAL-DESIGN.md schema)

- Auth: anonymous → account (JWT).
- Matchmaking: region-weighted lobby pool; fill with bots to guarantee 100-player lobbies.
- Cloud save: profile, cosmetics, settings (client + server).
- Friends/clans: account graph + clan leaderboards.
- Reconnect: session tokens with 60 s grace.

## 9. Roadmap

| Milestone | Content |
|---|---|
| Ship (this build) | Solo, 100-player bots, full systems, procedural world |
| v0.2 | Real human multiplayer (netcode per NETCODE.md), Duos, TDM practice |
| v0.3 | Account auth + cloud save, leaderboards, achievements |
| v1.0 | Season 1, battle pass, friends/clans, ranked, mobile store packaging |

## 10. Compliance

Cosmetics only; no loot-box gambling mechanics (direct purchase); regional age gates; GDPR/CCPA data rights (analytics anonymized); no ads in gameplay.