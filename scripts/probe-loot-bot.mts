// Micro-probe: place a bot next to a real weapon item on the island and step
// the sim — does the bot's 'loot' state find it, walk to it, and equip it?
import { Sim } from '../server/src/sim.ts';
import { getBrain, initBrain } from '../server/src/bots.ts';
import { v3 } from '../shared/src/math.ts';
import type { ItemEntity, PlayerEntity } from '../shared/src/types.ts';

const s = new Sim({ seed: 20205, botCount: 0, net: false });
s['fillWorld']();

// Grab the first gun item on the island and drop a bot 8m away from it.
const world = s.world;
let item: ItemEntity | null = null;
for (const it of world.items.values()) {
  const id = Number(it.defId);
  if (id >= 1 && id <= 28) { item = it; break; }
}
if (!item) { console.log('FAIL: no weapon items on island'); process.exit(1); }

const id = world.nextId();
const botX = item.pos.x + 8;
const botZ = item.pos.z;
const p: PlayerEntity = {
  id, kind: 'bot', name: 'ProbeBot', state: 'playing',
  pos: v3(botX, item.pos.y, botZ), alive: true,
  yaw: Math.atan2(item.pos.z - botZ, item.pos.x - botX), pitch: 0,
  moveSpeed: 0, hp: 100, maxHp: 100, armor: 0, stim: 0,
  slot0: -1, slot1: -1, activeSlot: 0, equippedWeapon: -1,
  ammo: [0, 0, 0, 0, 0, 0], inv: [-1, -1, -1, -1], invCount: [0, 0, 0, 0],
  lastFireTick: 0, stateT: 0,
};
world.players.set(id, p);
initBrain(id, 'veteran', s.tick + 9999, 20205);
// Give it a direct route: point its path at the item so it walks to it.
const b = getBrain(id);
if (!b) { console.log('FAIL: brain not registered'); process.exit(1); }
b.path = [{ x: item.pos.x, z: item.pos.z }];

console.log(`item def=${item.defId} at (${item.pos.x.toFixed(0)}, ${item.pos.z.toFixed(0)}) bot at (${botX.toFixed(0)}, ${botZ.toFixed(0)}) gridNear=${world.gridItems.queryCircle(item.pos.x, item.pos.z, 50).length}`);

// Step until the bot equips the gun or 900 ticks (30s) pass.
for (let t = 0; t < 900; t++) {
  s.step();
  if (p.equippedWeapon >= 1 && p.equippedWeapon <= 28) {
    console.log(`PASS: bot equipped weapon ${p.equippedWeapon} at tick ${t} (state=${p.state})`);
    process.exit(0);
  }
}
console.log(`FAIL: bot never equipped a gun. state=${p.state} equipped=${p.equippedWeapon} hp=${p.hp} pos=(${p.pos.x.toFixed(0)},${p.pos.z.toFixed(0)}) itemStillThere=${world.items.has(item.id)}`);
process.exit(1);
