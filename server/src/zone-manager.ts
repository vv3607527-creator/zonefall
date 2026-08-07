// zone-manager.ts — drives the safe-zone lifecycle: phase progression, tick
// interpolation, and circle damage to players outside.

import { Rng } from '../../shared/src/rng.ts';
import { v3, type Vec3 } from '../../shared/src/math.ts';
import { ZONE_STAGES, advanceZone, centerAt, initialZone, nextCircle, outsideDist, radiusAt, type ZonePlan } from '../../shared/src/zone.ts';
import type { GameEvent, ZoneState } from '../../shared/src/types.ts';
import type { World } from './world.ts';

export class ZoneManager {
  plan: ZonePlan;
  phase = 0;
  private rng: Rng;

  constructor(seed: number, startTick: number) {
    this.plan = initialZone(startTick);
    this.rng = new Rng(seed ^ 0x9e3779b9);
  }

  /** Current interpolated circle state for snapshots. */
  toState(tick: number): ZoneState {
    return {
      phase: this.phase,
      center: centerAt(this.plan, tick),
      radius: radiusAt(this.plan, tick),
      nextCenter: this.plan.nextCenter,
      nextRadius: this.plan.nextRadius,
      shrinkStartTick: this.plan.shrinkStartTick,
      shrinkEndTick: this.plan.shrinkEndTick,
      dps: ZONE_STAGES[this.phase].dps,
    };
  }

  /**
   * Called every tick. Advances phases when their shrink completes and
   * applies circle damage. Returns true when the match should end (zone 0).
   */
  tick(tick: number, world: World, events: GameEvent[]): boolean {
    // Advance phase when the current shrink finished and a next circle exists.
    if (tick >= this.plan.shrinkEndTick) {
      const next = advanceZone(this.plan, tick, this.phase);
      if (next) {
        this.plan = next;
        this.phase++;
        events.push({ t: 'zone', phase: this.phase, radius: next.nextRadius, center: next.nextCenter });
      }
    }

    // Damage players outside the current circle.
    const dps = ZONE_STAGES[this.phase].dps;
    if (dps > 0) {
      const dmg = (dps * 30) / 30; // 1s worth per tick for steady drain
      for (const p of world.players.values()) {
        if (!p.alive || p.state === 'dead' || p.state === 'spectating') continue;
        // Lobby players wait on the pad for takeoff; the circle may not have
        // finished collapsing around them yet, so they must be invulnerable.
        if (p.state === 'lobby') continue;
        if (p.state === 'plane' || p.state === 'skydive' || p.state === 'parachute') continue;
        const out = outsideDist(this.plan, tick, p.pos.x, p.pos.z);
        if (out > 0) {
          p.hp = Math.max(0, p.hp - dmg);
          p.lastHitTick = tick;
          if (p.hp <= 0) {
            p.hp = 0;
            p.alive = false;
            p.state = 'dead';
            events.push({ t: 'kill', killer: p.id, victim: p.id, weaponId: 9000, headshot: false });
          }
        }
      }
    }

    // Match ends when the final circle collapses to ~0.
    const r = radiusAt(this.plan, tick);
    return r <= 12 && this.phase >= ZONE_STAGES.length - 1;
  }

  /** A random point inside the current circle (for bots / loot drops). */
  randomInside(rng: Rng, tick: number): Vec3 {
    const c = centerAt(this.plan, tick);
    const r = Math.max(0, radiusAt(this.plan, tick) * 0.9);
    const ang = rng.range(0, Math.PI * 2);
    const rad = Math.sqrt(rng.next()) * r;
    return v3(c.x + Math.cos(ang) * rad, 0, c.z + Math.sin(ang) * rad);
  }

  /** Deterministic next-circle for flight-phase planning (used by bots). */
  previewNext(): { center: Vec3; radius: number } {
    const phase = this.phase + 1;
    if (phase >= ZONE_STAGES.length) return { center: v3(this.plan.center.x, 0, this.plan.center.z), radius: 60 };
    const rng = new Rng(phase * 7919 + Math.round(this.plan.center.x + this.plan.center.z));
    return nextCircle(rng, this.plan.nextCenter, this.plan.nextRadius, ZONE_STAGES[phase].radiusFrac);
  }
}