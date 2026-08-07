// predict.ts — own-player client-side prediction + reconciliation.

import type { InputSample } from '../../shared/src/types.ts';
import {
  clamp, dirFromAngles, v3, v3add, v3dist, type Vec3,
} from '../../shared/src/math.ts';
import { GRAVITY, JUMP_VELOCITY, PLAYER_CROUCH, PLAYER_SPRINT, PLAYER_WALK } from '../../shared/src/consts.ts';
import type { PlayerView } from './net/client.ts';

export interface PredictedState {
  pos: Vec3;
  yaw: number;
  pitch: number;
  vy: number;
  airborne: boolean;
  crouching: boolean;
  sprinting: boolean;
  hp: number;
  armor: number;
  state: string;
  chuteOpen: boolean;
  activeSlot: number;
}

export interface HeightFn {
  (x: number, z: number): number;
}

export class Predictor {
  local: PredictedState;
  ownId: number;
  private pending: { seq: number; sample: InputSample }[] = [];
  private lastAcked = -1;
  heightAt: HeightFn;

  constructor(ownId: number, heightAt: HeightFn) {
    this.ownId = ownId;
    this.heightAt = heightAt;
    this.local = {
      pos: v3(0, 0, 0), yaw: 0, pitch: 0, vy: 0,
      airborne: false, crouching: false, sprinting: false,
      hp: 100, armor: 0, state: 'lobby', chuteOpen: false, activeSlot: 0,
    };
  }

  /** Apply authoritative state for own player (from snapshots). */
  reconcile(auth: PlayerView, ackedSeq: number | null): void {
    const lastAck = ackedSeq ?? -1;
    const snap = this.local;
    // Snap HP/armor/state always; positions only when prediction is far off.
    snap.hp = auth.hp;
    snap.armor = auth.armor;
    snap.state = auth.state;
    snap.chuteOpen = auth.chuteOpen;
    if (auth.state !== 'playing') {
      // Server authoritative during flight/dive/parachute.
      snap.pos = v3add(auth.pos, v3(0, 0, 0));
      snap.yaw = auth.yaw;
      snap.pitch = auth.pitch;
      snap.vy = 0;
      snap.airborne = false;
      this.pending = [];
      return;
    }
    const drift = v3dist(auth.pos, snap.pos);
    const yawDrift = Math.abs(auth.yaw - snap.yaw);
    if (drift > 2.5 || yawDrift > 0.3) {
      snap.pos = v3add(auth.pos, v3(0, 0, 0));
      snap.yaw = auth.yaw;
      snap.pitch = auth.pitch;
      snap.vy = 0;
      snap.airborne = false;
      // Replay inputs after the acked one.
      this.pending = this.pending.filter((p) => p.seq > lastAck);
      for (const p of this.pending) this.applySample(p.sample);
    } else {
      this.pending = this.pending.filter((p) => p.seq > lastAck);
      for (const p of this.pending) this.applySample(p.sample);
    }
    this.lastAcked = Math.max(this.lastAcked, lastAck);
  }

  /** Register a sent input sample for prediction. */
  addInput(seq: number, sample: InputSample): void {
    this.pending.push({ seq, sample });
    if (this.pending.length > 16) this.pending.shift();
    this.applySample(sample);
  }

  private applySample(s: InputSample): void {
    const p = this.local;
    if (p.state !== 'playing') return;
    p.yaw += s.dyaw;
    p.pitch = clamp(p.pitch + s.dpitch, -1.45, 1.45);
    p.crouching = s.crouch;
    p.sprinting = s.sprint && !s.crouch && s.mv.f > 0.5;
    const speed = p.crouching ? PLAYER_CROUCH : p.sprinting ? PLAYER_SPRINT : PLAYER_WALK;
    if (s.mv.f !== 0 || s.mv.s !== 0) {
      const dir = dirFromAngles(p.yaw, 0);
      // Camera-relative: forward/back along yaw, strafe perpendicular.
      const sx = Math.cos(p.yaw + Math.PI / 2);
      const sz = Math.sin(p.yaw + Math.PI / 2);
      let vx = dir.x * s.mv.f + sx * s.mv.s;
      let vz = dir.z * s.mv.f + sz * s.mv.s;
      const l = Math.hypot(vx, vz) || 1;
      vx /= l;
      vz /= l;
      p.pos.x += vx * speed * 0.0333;
      p.pos.z += vz * speed * 0.0333;
    }
    // Terrain height snapping + jumping.
    const ground = this.heightAt(p.pos.x, p.pos.z);
    if (p.airborne) {
      p.vy -= GRAVITY * 0.0333;
      p.pos.y += p.vy * 0.0333;
      if (p.pos.y <= ground) {
        p.pos.y = ground;
        p.vy = 0;
        p.airborne = false;
      }
    } else {
      if (s.jump && this.canJump()) {
        p.vy = JUMP_VELOCITY;
        p.airborne = true;
        p.pos.y = ground + 0.02;
      } else {
        p.pos.y = ground;
      }
    }
  }

  private canJump(): boolean {
    return true; // server decides; prediction-only
  }

  /** Predicted position used by the camera. */
  predictedPos(): Vec3 {
    return this.local.pos;
  }
}