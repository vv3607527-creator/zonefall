// vehicles.ts — the original ZONEFALL fleet: 7 drivable vehicles.
// Names fictional; stats tuned for arcade-realistic feel.

export type VehicleClass = 'car' | 'truck' | 'bike' | 'boat';

export interface VehicleDef {
  id: string;
  name: string;
  cls: VehicleClass;
  /** Top speed m/s. */
  maxSpeed: number;
  /** Acceleration m/s^2. */
  accel: number;
  /** Turn rate rad/s at speed. */
  turn: number;
  /** Fuel capacity liters. */
  fuelCap: number;
  /** Fuel burn liters per meter driven. */
  fuelPerM: number;
  hp: number;
  /** Seat count (driver + passengers). */
  seats: number;
  radius: number;
  /** Base color tint for procedural mesh. */
  color: [number, number, number];
  /** 4 wheels? (bikes have 2, boats 0). */
  wheels: number;
  /** Floats on water (boats). */
  watercraft: boolean;
  /** Tire damage reduces speed cap by this fraction per destroyed tire. */
  tirePenalty: number;
  blurb: string;
}

export const VEHICLES: VehicleDef[] = [
  { id: 'sedan', name: 'Aurelian Sedan', cls: 'car', maxSpeed: 34, accel: 6, turn: 1.1, fuelCap: 50, fuelPerM: 0.03, hp: 400, seats: 4, radius: 2.1, color: [0.75, 0.25, 0.2], wheels: 4, watercraft: false, tirePenalty: 0.22, blurb: 'Reliable four-door. Sips fuel, shrugs off dings.' },
  { id: 'pickup', name: 'Northwind Pickup', cls: 'truck', maxSpeed: 30, accel: 5, turn: 1.0, fuelCap: 60, fuelPerM: 0.04, hp: 500, seats: 3, radius: 2.3, color: [0.3, 0.55, 0.3], wheels: 4, watercraft: false, tirePenalty: 0.2, blurb: 'Farm-work chassis. Hauls two and a spare.' },
  { id: 'suv', name: 'Corbelli SUV', cls: 'car', maxSpeed: 31, accel: 5.5, turn: 1.05, fuelCap: 55, fuelPerM: 0.04, hp: 460, seats: 4, radius: 2.2, color: [0.3, 0.32, 0.6], wheels: 4, watercraft: false, tirePenalty: 0.21, blurb: 'Boring to drive, boring to hit. On purpose.' },
  { id: 'moto', name: 'Valdar Rascal', cls: 'bike', maxSpeed: 44, accel: 8, turn: 1.6, fuelCap: 14, fuelPerM: 0.02, hp: 150, seats: 2, radius: 0.8, color: [0.9, 0.6, 0.15], wheels: 2, watercraft: false, tirePenalty: 0.3, blurb: 'Two wheels of bad decisions.' },
  { id: 'buggy', name: 'Gullhaven Dune Buggy', cls: 'car', maxSpeed: 40, accel: 7.5, turn: 1.5, fuelCap: 25, fuelPerM: 0.035, hp: 220, seats: 2, radius: 1.6, color: [0.85, 0.8, 0.35], wheels: 4, watercraft: false, tirePenalty: 0.25, blurb: 'Beach racer. Keep it on sand.' },
  { id: 'boat', name: 'Ember Runabout', cls: 'boat', maxSpeed: 26, accel: 4.5, turn: 0.9, fuelCap: 40, fuelPerM: 0.05, hp: 300, seats: 4, radius: 2.6, color: [0.4, 0.6, 0.75], wheels: 0, watercraft: true, tirePenalty: 0, blurb: 'The river is a highway.' },
  { id: 'utruck', name: 'Tessell Utility Truck', cls: 'truck', maxSpeed: 27, accel: 4.5, turn: 0.9, fuelCap: 70, fuelPerM: 0.05, hp: 600, seats: 2, radius: 2.6, color: [0.55, 0.5, 0.45], wheels: 4, watercraft: false, tirePenalty: 0.18, blurb: 'Gravel-chewing workhorse with a flatbed.' },
];

export const VEHICLE_BY_ID = new Map(VEHICLES.map((v) => [v.id, v] as const));

export function vehicleById(id: string): VehicleDef | undefined {
  return VEHICLE_BY_ID.get(id);
}

export const VEHICLE_MAX_HP = 600;