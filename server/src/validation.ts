// validation.ts — server-side input validation + per-connection rate limiting.
// The server never trusts the client: everything is clamped or dropped.

import type { InputSample } from '../../shared/src/types.ts';

const CLAMP = (v: unknown, lo: number, hi: number, dflt: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : dflt;
  return Math.min(hi, Math.max(lo, n));
};

/**
 * Validate a raw client input message body. Returns a clean InputSample or null.
 */
export function validateInput(raw: unknown): InputSample | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const mv = r.mv as Record<string, unknown> | undefined;
  const seq = CLAMP_INT(r.seq, 0, 2 ** 31 - 1, 0);
  return {
    seq,
    mv: { f: CLAMP(mv?.f ?? r.f, -1, 1, 0), s: CLAMP(mv?.s ?? r.s, -1, 1, 0) },
    dyaw: CLAMP(r.dyaw, -0.5, 0.5, 0),
    dpitch: CLAMP(r.dpitch, -0.5, 0.5, 0),
    fire: r.fire === true,
    ads: r.ads === true,
    sprint: r.sprint === true,
    crouch: r.crouch === true,
    jump: r.jump === true,
    lean: CLAMP(r.lean, -1, 1, 0),
    switchSlot: CLAMP_INT(r.switchSlot, -1, 2, -1),
    use: r.use === true,
    throw: r.throw === true,
  };
}

function CLAMP_INT(v: unknown, lo: number, hi: number, dflt: number): number {
  return Math.round(CLAMP(v, lo, hi, dflt));
}

export function validateName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (s.length < 1) return 'Survivor';
  if (s.length > 16) return s.slice(0, 16);
  // Strip control chars to keep chat/names clean.
  return s.replace(/[\u0000-\u001f]/g, '');
}

/**
 * Per-connection token bucket rate limiter.
 */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; last: number }>();
  private rate: number;
  private perSec: number;

  constructor(rate: number, perSec: number) {
    this.rate = rate;
    this.perSec = perSec;
  }

  allow(key: string, now = performance.now()): boolean {
    const b = this.buckets.get(key) ?? { tokens: this.rate, last: now };
    b.tokens = Math.min(this.rate, b.tokens + ((now - b.last) / 1000) * this.perSec);
    b.last = now;
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    this.buckets.set(key, b);
    return true;
  }
}

/** Enforce input sanity: fire cadence is re-gated by weapon rpm in combat.ts. */
export function validateAim(pitch: number): number {
  return Math.min(1.5, Math.max(-1.5, pitch));
}