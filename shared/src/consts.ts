// consts.ts — global tuning constants shared by server and client.

export const TICK_RATE = 30;
export const TICK_MS = 1000 / TICK_RATE;

/** World is a square island region; 4096x4096 units (meters). */
export const WORLD_SIZE = 4096;
export const SEA_LEVEL = 0;
export const OCEAN_DEPTH = -24;

// Terrain heightfield grid resolution (cells across WORLD_SIZE).
export const TERRAIN_CELLS = 128;
export const TERRAIN_CELL = WORLD_SIZE / TERRAIN_CELLS;

// Player
export const PLAYER_RADIUS = 0.5;
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_EYE = 1.6;
export const PLAYER_WALK = 5.4;
export const PLAYER_SPRINT = 7.6;
export const PLAYER_CROUCH = 2.6;
export const JUMP_VELOCITY = 6.2;
export const GRAVITY = 9.81;

// Parachute / insertion
export const PLANE_SPEED = 60;
export const PLANE_ALTITUDE = 400;
export const PARACHUTE_FALL_SPEED = 4.5;
export const PARACHUTE_GLIDE = 10;

// Match
export const MAX_PLAYERS = 100;
export const MATCH_INITIAL_SECONDS = 60; // lobby countdown
export const SPECTATOR_ENABLED = true;

// Zone phases (see zone.ts for math)
export const NUM_ZONE_PHASES = 6;

// Sync
export const FULL_SNAPSHOT_EVERY = 20; // ticks
export const MAX_INPUT_SAMPLES = 8;

// Entities
export const MAX_ENTITIES = 4096;
export const MAX_BULLETS = 1024;

// Match
export const WORLD_SEED = 20205; // fixed terrain seed — client renders the same world as server physics

// Loot
export const LOOT_DENSITY = 0.0008; // spawns per world unit^2
export const MAX_LOOT_RARITY = 3; // 0=common .. 3=legendary

// Vehicles
export const MAX_VEHICLES = 24;