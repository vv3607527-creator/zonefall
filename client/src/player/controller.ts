// controller.ts — third-person camera: shoulder follow, ADS transition,
// lean roll, footstep bob, FOV handling. Pure camera logic, no game state.

import * as THREE from 'three';
import { clamp, lerp, saturate } from '../../../shared/src/math.ts';

export const BASE_FOV = 75;
export const ADS_FOV = 55;
export const HIP_DIST = 3.1;
export const ADS_DIST = 1.35;
export const EYE_STAND = 1.55;
export const EYE_CROUCH = 1.05;

const LOOK_LAMBDA = 14;      // yaw/pitch smoothing (higher = snappier)
const ADS_LAMBDA = 9;        // ADS amount smoothing
const BOB_FREQ = 9.5;        // steps per second at walk speed
const BOB_AMP = 0.05;        // meters of vertical bob

export interface CameraInput {
  pos: THREE.Vector3;        // feet position of the followed entity
  yaw: number;               // game yaw (radians, 0 = +X)
  pitch: number;             // game pitch (radians, + = up)
  lean: number;              // -1..1
  moving: boolean;
  wantAds: boolean;
  crouching: boolean;
  isDriving: boolean;
  dt: number;
}

export class PlayerController {
  camera: THREE.PerspectiveCamera;
  adsAmount = 0;
  bobPhase = 0;

  private smoothYaw: number;
  private smoothPitch: number;
  private lastFeet = new THREE.Vector3();
  private tmp = new THREE.Vector3();

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.camera.fov = BASE_FOV;
    this.camera.near = 0.1;
    this.camera.far = 6000;
    this.camera.updateProjectionMatrix();
    this.smoothYaw = 0;
    this.smoothPitch = 0;
  }

  /** Set camera pose instantly (used at match start / plane jump). */
  snapTo(inp: CameraInput): void {
    this.smoothYaw = inp.yaw;
    this.smoothPitch = inp.pitch;
    this.adsAmount = inp.wantAds ? 1 : 0;
    this.lastFeet.copy(inp.pos);
    this.update(inp);
  }

  update(inp: CameraInput): void {
    const dt = Math.max(0.001, inp.dt);
    // ADS amount: driving disables ADS.
    const wantAds = inp.wantAds && !inp.isDriving;
    this.adsAmount = damp(this.adsAmount, wantAds ? 1 : 0, ADS_LAMBDA, dt);

    // FOV with a subtle punch while ADS transitions.
    this.camera.fov = lerp(BASE_FOV, ADS_FOV, this.adsAmount);
    this.camera.updateProjectionMatrix();

    // Smooth look.
    this.smoothYaw = dampAngle(this.smoothYaw, inp.yaw, LOOK_LAMBDA, dt);
    this.smoothPitch = damp(this.smoothPitch, inp.pitch, LOOK_LAMBDA, dt);

    const pitch = this.smoothPitch;
    const yaw = this.smoothYaw;
    const eyeH = inp.crouching ? EYE_CROUCH : EYE_STAND;

    // Footstep bob.
    const horizSpeed = Math.hypot(inp.pos.x - this.lastFeet.x, inp.pos.z - this.lastFeet.z) / dt;
    this.lastFeet.copy(inp.pos);
    if (horizSpeed > 0.5 && !inp.isDriving) {
      this.bobPhase += dt * BOB_FREQ * clamp(horizSpeed / 5.4, 0.5, 1.6);
    }
    const bobY = Math.abs(Math.sin(this.bobPhase)) * BOB_AMP * (1 - 0.7 * this.adsAmount);
    const bobX = Math.cos(this.bobPhase * 0.5) * BOB_AMP * 0.5;

    // Shoulder offset: over the right shoulder, pulled in by ADS.
    const dist = lerp(HIP_DIST, ADS_DIST, this.adsAmount);
    const horiz = Math.cos(pitch) * dist;
    const up = Math.sin(pitch) * dist;
    // Behind the player relative to facing (game yaw: 0 = +X).
    const bx = -Math.cos(yaw) * horiz;
    const bz = -Math.sin(yaw) * horiz;
    // Slight right-shoulder shift, rotated with yaw.
    const sx = -Math.sin(yaw) * 0.55 * (1 - this.adsAmount);
    const sz = Math.cos(yaw) * 0.55 * (1 - this.adsAmount);

    const camX = inp.pos.x + bx + sx + bobX;
    const camY = inp.pos.y + eyeH + up + bobY;
    const camZ = inp.pos.z + bz + sz;

    this.camera.position.set(camX, camY, camZ);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = yaw + Math.PI / 2; // game yaw → three.js camera yaw
    this.camera.rotation.x = pitch;
    // Lean rolls the view slightly.
    this.camera.rotation.z = -inp.lean * 0.12 * (1 - this.adsAmount);

    // Minor head-bob yaw sway.
    this.camera.rotation.y += Math.sin(this.bobPhase * 0.5) * 0.006 * (1 - this.adsAmount);
  }

  /** World-space aim ray (origin + direction), for hit testing UI/crosshair. */
  aimRay(): { origin: THREE.Vector3; dir: THREE.Vector3 } {
    const origin = this.camera.position.clone();
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    return { origin, dir };
  }

  /** Distance between camera and feet target (for camera collision, unused for now). */
  feetDistance(pos: THREE.Vector3): number {
    this.tmp.copy(pos).sub(this.camera.position);
    return this.tmp.length();
  }
}

function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  let d = target - current;
  d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return current + d * (1 - Math.exp(-lambda * dt));
}

export function screenToWorldDepth(origin: THREE.Vector3, dir: THREE.Vector3, depth: number): THREE.Vector3 {
  return origin.clone().addScaledVector(dir, depth);
}

export function projectWorldToScreen(
  camera: THREE.PerspectiveCamera,
  world: THREE.Vector3,
  out: THREE.Vector3,
): boolean {
  out.copy(world).project(camera);
  const behind = out.z > 1;
  if (behind) {
    out.x *= -1;
    out.y *= -1;
  }
  out.x = (out.x * 0.5 + 0.5) * window.innerWidth;
  out.y = (-out.y * 0.5 + 0.5) * window.innerHeight;
  return !behind;
}

export function sat(v: number): number {
  return saturate(v);
}
