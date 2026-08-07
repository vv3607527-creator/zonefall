// replay.ts — append-only event log for spectator mode and post-match replays.
// Events are recorded every tick with their tick stamp; the log can be drained
// into a JSON document for a headless verification harness.

import type { GameEvent } from '../../shared/src/types.ts';

interface LoggedEvent {
  tick: number;
  e: GameEvent;
}

/** Cap on retained events — a 100-player match rarely exceeds a few thousand. */
const MAX_EVENTS = 20000;

export class ReplayLog {
  private log: LoggedEvent[] = [];
  private dropped = 0;

  push(tick: number, e: GameEvent): void {
    if (this.log.length >= MAX_EVENTS) {
      this.log.shift();
      this.dropped++;
    }
    this.log.push({ tick, e });
  }

  /** All events at or after `tick` (for late-joining spectators). */
  since(tick: number): GameEvent[] {
    const out: GameEvent[] = [];
    for (const entry of this.log) {
      if (entry.tick >= tick) out.push(entry.e);
    }
    return out;
  }

  /** Total count over the match (used by the verification harness). */
  get length(): number {
    return this.log.length;
  }

  /** Structured snapshot for replays / reports. */
  toJSON(): string {
    return JSON.stringify({
      dropped: this.dropped,
      events: this.log,
    });
  }
}