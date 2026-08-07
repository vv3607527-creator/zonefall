// effects.ts — tracers, muzzle flashes, hits, and the zone ring.

import * as THREE from 'three';
import type { GameEvent, ZoneState } from '../../../shared/src/types.ts';
import type { Vec3 } from '../../../shared/src/math.ts';

const TRACER_COUNT = 32;
const TRACER_LIFE = 0.12;

interface Tracer {
  line: THREE.Line;
  life: number;
}

interface Flash {
  sprite: THREE.Sprite;
  life: number;
}

interface RingState {
  circle: THREE.Mesh;
  inner: THREE.Mesh;
}

function radialTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,240,200,1)');
  g.addColorStop(0.4, 'rgba(255,200,80,0.7)');
  g.addColorStop(1, 'rgba(255,160,40,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}

export class Effects {
  private root: THREE.Group;
  private tracers: Tracer[] = [];
  private flashes: Flash[] = [];
  private ring: RingState;
  private tracerNext = 0;
  private flashNext = 0;

  constructor(scene: THREE.Scene) {
    this.root = new THREE.Group();
    this.root.name = 'effects';
    scene.add(this.root);

    const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 1 });
    for (let i = 0; i < TRACER_COUNT; i++) {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const line = new THREE.Line(geo, tracerMat);
      line.visible = false;
      line.frustumCulled = false;
      this.root.add(line);
      this.tracers.push({ line, life: -1 });
    }

    const tex = radialTexture();
    const flashMat = new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 12; i++) {
      const sp = new THREE.Sprite(flashMat.clone());
      sp.visible = false;
      this.root.add(sp);
      this.flashes.push({ sprite: sp, life: -1 });
    }

    // Zone rings: outer (current) + inner (next). Flat, on terrain top.
    const outer = new THREE.Mesh(
      new THREE.RingGeometry(0.98, 1.0, 96),
      new THREE.MeshBasicMaterial({
        color: 0xcf3f7f, transparent: true, opacity: 0.35,
        side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    outer.rotation.x = -Math.PI / 2;
    outer.renderOrder = 3;
    const inner = new THREE.Mesh(
      new THREE.RingGeometry(0.955, 0.995, 96),
      new THREE.MeshBasicMaterial({
        color: 0x7fcf3f, transparent: true, opacity: 0.28,
        side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    inner.rotation.x = -Math.PI / 2;
    inner.renderOrder = 4;
    this.root.add(outer, inner);
    this.ring = { circle: outer, inner };
  }

  setZone(z: ZoneState, groundY: number): void {
    this.ring.circle.position.set(z.center.x, groundY + 0.6, z.center.z);
    this.ring.circle.scale.set(z.radius, z.radius, 1);
    this.ring.inner.position.set(z.center.x, groundY + 0.5, z.center.z);
    this.ring.inner.scale.set(z.nextRadius, z.nextRadius, 1);
  }

  /** Local player fired a shot — spawn tracer + muzzle flash. */
  shot(origin: Vec3, dir: Vec3, range: number): void {
    const t = this.tracers[this.tracerNext];
    this.tracerNext = (this.tracerNext + 1) % TRACER_COUNT;
    const arr = t.line.geometry.attributes.position as THREE.BufferAttribute;
    const a = arr.array as Float32Array;
    a[0] = origin.x; a[1] = origin.y; a[2] = origin.z;
    a[3] = origin.x + dir.x * range; a[4] = origin.y + dir.y * range; a[5] = origin.z + dir.z * range;
    arr.needsUpdate = true;
    t.line.geometry.computeBoundingSphere();
    t.line.visible = true;
    t.life = TRACER_LIFE;

    const f = this.flashes[this.flashNext];
    this.flashNext = (this.flashNext + 1) % this.flashes.length;
    f.sprite.position.set(origin.x + dir.x * 1.4, origin.y + dir.y * 1.4, origin.z + dir.z * 1.4);
    f.sprite.scale.setScalar(1.8 + Math.random() * 0.9);
    f.sprite.visible = true;
    f.life = 0.05;
  }

  /** Server events that need world feedback. */
  handleEvent(e: GameEvent): void {
    // hit events are handled by the HUD; world-side crate/vehicle feedback is
    // implicit from snapshots. (Kept as a hook for future VFX.)
    void e;
  }

  update(now: number): void {
    const dt = 0.016;
    for (const t of this.tracers) {
      if (t.life >= 0) {
        t.life -= dt;
        const m = t.line.material as THREE.LineBasicMaterial;
        m.opacity = Math.max(0, t.life / TRACER_LIFE);
        if (t.life <= 0) t.line.visible = false;
      }
    }
    for (const f of this.flashes) {
      if (f.life >= 0) {
        f.life -= dt;
        f.sprite.material.opacity = Math.max(0, f.life / 0.05);
        if (f.life <= 0) f.sprite.visible = false;
      }
    }
    void now;
  }

  addTo(scene: THREE.Scene): void {
    scene.add(this.root);
  }
}