// input.ts — cross-platform input: keyboard + mouse (pointer lock) + touch.
// Produces batched InputSample[] compatible with the server protocol.

import type { InputSample } from '../../../shared/src/types.ts';
import { clamp, clampMag } from '../../../shared/src/math.ts';

export interface InputOptions {
  sensitivity: number; // rad per pixel
  onLockChange?: (locked: boolean) => void;
  onPing?: (x: number, z: number) => void;
}

const TICK_S = 1000 / 30;

export class InputManager {
  private keys = new Set<string>();
  private mouseDX = 0;
  private mouseDY = 0;
  private lockActive = false;
  private shouldFire = false;
  private fireHeld = false;
  private adsHeld = false;
  private pingQueued = false;
  private pingFn?: (x: number, z: number) => void;
  private el: HTMLElement;
  opts: InputOptions;
  touchMode = false;

  // touch hardware state
  private joy = { mx: 0, my: 0, active: false };
  private look = { mx: 0, my: 0, active: false };
  private tFire = false;
  private tAds = false;
  private tJump = false;
  private tCrouch = false;
  private tUse = false;
  private tThrowOnce = false;

  constructor(el: HTMLElement, opts: InputOptions) {
    this.el = el;
    this.opts = opts;
    this.touchMode = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.pingFn = opts.onPing;
  }

  attach(): void {
    const el = this.el;
    el.addEventListener('keydown', (e) => this.onKey(e, true));
    el.addEventListener('keyup', (e) => this.onKey(e, false));
    el.addEventListener('mousemove', (e) => this.onMouse(e));
    el.addEventListener('mousedown', (e) => this.onMouseBtn(e, true));
    el.addEventListener('mouseup', (e) => this.onMouseBtn(e, false));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.lockActive = document.pointerLockElement === el;
      this.opts.onLockChange?.(this.lockActive);
    });
    if (this.touchMode) this.attachTouch(el);
  }

  requestLock(): void {
    (this.el as HTMLElement & { requestPointerLock?: () => void }).requestPointerLock?.();
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    const k = e.code;
    if (down) {
      if (['Space', 'KeyF', 'KeyR', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft'].includes(k)) e.preventDefault();
      if (k === 'Escape') { e.preventDefault(); document.exitPointerLock?.(); }
      if (k === 'KeyQ') { this.keys.add('leanL'); return; }
      if (k === 'KeyE') { this.keys.add('leanR'); return; }
      if (k === 'AltLeft' && this.lockActive) { this.pingQueued = true; return; }
      if (k === 'Digit1') { this.lastSwitch = 0; return; }
      if (k === 'Digit2') { this.lastSwitch = 1; return; }
    } else {
      if (k === 'KeyQ') { this.keys.delete('leanL'); return; }
      if (k === 'KeyE') { this.keys.delete('leanR'); return; }
      if (k === 'AltLeft') { this.pingQueued = false; }
    }
    if (down) this.keys.add(k);
    else this.keys.delete(k);
  }

  private lastSwitch = -1;
  takeSwitch(): number {
    const s = this.lastSwitch;
    this.lastSwitch = -1;
    return s;
  }

  private onMouse(e: MouseEvent): void {
    if (!this.lockActive) return;
    this.mouseDX += e.movementX;
    this.mouseDY += e.movementY;
  }

  private onMouseBtn(e: MouseEvent, down: boolean): void {
    // Left-click while unlocked is the "take control" signal — pollLockClick
    // re-requests pointer lock (a user gesture) so Escape doesn't strand the player.
    if (e.button === 0) {
      this.shouldFire = down;
      if (down) this.down = true;
    }
    if (e.button === 2) this.adsHeld = down;
  }

  private down = false;

  private attachTouch(el: HTMLElement): void {
    const fireBtn = document.createElement('div');
    fireBtn.id = 'zf-joy-fire';
    const adsBtn = document.createElement('div');
    adsBtn.id = 'zf-joy-ads';
    document.body.appendChild(fireBtn);
    document.body.appendChild(adsBtn);
    fireBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); this.tFire = true; });
    fireBtn.addEventListener('pointerup', () => { this.tFire = false; });
    adsBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); this.tAds = true; });
    adsBtn.addEventListener('pointerup', () => { this.tAds = false; });

    el.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('#zf-ui')) return;
      if (e.clientX < innerWidth / 2 && !this.joy.active) {
        this.joy = { mx: e.clientX, my: e.clientY, active: true };
      } else if (!this.look.active) {
        this.look = { mx: e.clientX, my: e.clientY, active: true };
      }
    });
    el.addEventListener('pointermove', (e) => {
      if (this.joy.active) {
        this.joy.mx = e.clientX;
        this.joy.my = e.clientY;
      } else if (this.look.active) {
        const dx = e.movementX;
        const dy = e.movementY;
        this.mouseDX += dx;
        this.mouseDY += dy;
      }
    });
    el.addEventListener('pointerup', () => {
      this.joy.active = false;
      this.look.active = false;
    });
    el.addEventListener('pointercancel', () => {
      this.joy.active = false;
      this.look.active = false;
    });
  }

  /**
   * Produce up to 8 input samples covering the time since the last call.
   * Call once per network flush (every tick).
   */
  consumeTick(): Omit<InputSample, 'seq'>[] {
    const fire = this.touchMode ? this.tFire : this.shouldFire;
    const ads = this.touchMode ? this.tAds : this.adsHeld;
    const samples: Omit<InputSample, 'seq'>[] = [];

    const k = this.keys;
    let f = 0;
    let s = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) f += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) f -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) s -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) s += 1;
    if (this.touchMode && this.joy.active && !this.down) {
      // virtual joystick dead zone
      const dx = this.joy.mx - 48;
      const dy = this.joy.my - 48;
      const d = Math.hypot(dx, dy);
      if (d > 10) {
        f = clampMag(-dy / 40, 1);
        s = clampMag(dx / 40, 1);
      }
    }

    const jump = k.has('Space') || (this.touchMode && this.tJump);
    const lean = k.has('leanL') ? -1 : k.has('leanR') ? 1 : 0;
    const sprint = k.has('ShiftLeft') && f > 0;
    const crouch = k.has('KeyC') || (this.touchMode && this.tCrouch);

    const dyaw = clampMag(this.mouseDX * this.opts.sensitivity, 0.5);
    const dpitch = clampMag(this.mouseDY * this.opts.sensitivity, 0.5);
    this.mouseDX = 0;
    this.mouseDY = 0;

    const sw = this.takeSwitch();
    for (let i = 0; i < 8; i++) {
      samples.push({
        mv: { f, s },
        dyaw, dpitch,
        fire,
        ads,
        sprint: !ads && sprint,
        crouch,
        jump: i === 0 && jump,
        lean,
        switchSlot: i === 0 ? sw : -1,
        use: i === 0 && (k.has('KeyF') || (this.touchMode && this.tUse)),
        throw: i === 0 && (k.has('KeyG') || this.tThrowOnce),
      });
    }
    this.tThrowOnce = false;
    return samples;
  }

  hasPing(): boolean {
    const p = this.pingQueued;
    if (p) this.pingQueued = false;
    return p;
  }

  pollLockClick(): boolean {
    return this.down;
  }
}