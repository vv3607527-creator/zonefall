// characters.ts — per-entity humanoid meshes (rendered for all players).

import * as THREE from 'three';
import type { PlayerView } from '../net/client.ts';
import type { Vec3 } from '../../../shared/src/math.ts';

const SKINS = [
  0x9a7a56, 0xc68a5c, 0x8c5a3a, 0xd9b08c,
  0x6e5438, 0xb98a62, 0x5a4130, 0xf0c8a0,
];
const OUTFITS = [
  0x4a5d4a, 0x5a4a5d, 0x5d524a, 0x3d4a5d,
  0x5d3d3d, 0x3d5d52, 0x54545d, 0x6a5a3a,
];

interface MeshSet {
  group: THREE.Group;
  body: THREE.Group;
  head: THREE.Mesh;
  chute: THREE.Group | null;
  lastPos: Vec3 | null;
}

const DIR = new THREE.Vector3();
const EULER = new THREE.Euler();

export class CharacterManager {
  private map = new Map<number, MeshSet>();
  private groupRoot: THREE.Group;

  constructor(scene: THREE.Scene) {
    this.groupRoot = new THREE.Group();
    this.groupRoot.name = 'characters';
    scene.add(this.groupRoot);
  }

  /** Refresh all visible players; removes stale. */
  sync(players: Map<number, PlayerView>, now: number): void {
    const alive = new Set<number>();
    for (const [, v] of players) {
      if (!v.alive) continue;
      alive.add(v.id);
      const set = this.ensure(v);
      this.pose(set, v, now);
    }
    for (const [id, s] of this.map) {
      if (!alive.has(id)) {
        s.group.visible = false;
      }
    }
  }

  private ensure(v: PlayerView): MeshSet {
    let set = this.map.get(v.id);
    if (set) {
      set.group.visible = true;
      return set;
    }
    const group = new THREE.Group();

    const bodyMat = new THREE.MeshLambertMaterial({ color: OUTFITS[v.skin % OUTFITS.length] });
    const headMat = new THREE.MeshLambertMaterial({ color: SKINS[v.skin % SKINS.length] });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.7, 4, 10), bodyMat);
    torso.position.y = 1.05;
    torso.castShadow = true;
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.7, 0.36), bodyMat);
    legs.position.y = 0.35;
    legs.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), headMat);
    head.position.y = 1.78;
    head.castShadow = true;
    const gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.14, 0.14),
      new THREE.MeshLambertMaterial({ color: 0x22242a }),
    );
    gun.position.set(0.42, 1.28, 0);
    const armRest = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.6, 0.14), bodyMat);
    armRest.position.set(0.42, 0.72, 0);

    group.add(torso, legs, head, gun, armRest);

    const chute = new THREE.Group();
    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(1.7, 12, 8),
      new THREE.MeshLambertMaterial({ color: 0xd8c24a, transparent: true, opacity: 0.95 }),
    );
    canopy.scale.y = 0.45;
    canopy.position.y = 1.6;
    const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff });
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 1.4, 0),
      new THREE.Vector3(0, 3.2, 0),
    ]);
    const line = new THREE.Line(lineGeo, lineMat);
    chute.add(canopy, line);
    chute.visible = false;
    group.add(chute);

    set = { group, body: group, head, chute, lastPos: null };
    this.map.set(v.id, set);
    this.groupRoot.add(group);
    return set;
  }

  private pose(set: MeshSet, v: PlayerView, now: number): void {
    const g = set.group;
    const driving = v.isDriving;
    g.visible = !driving;

    if (driving) return;

    g.position.set(v.pos.x, v.pos.y, v.pos.z);

    // Facing: game yaw 0 = +X → three yaw = yaw - PI/2 (identity faces +X? group default faces +Z?).
    // Use (yaw - PI/2).toEuler: THREE object default forward +Z, so yaw_three = -yaw + PI/2... corrected below.
    DIR.set(Math.cos(v.yaw), 0, Math.sin(v.yaw));
    EULER.set(0, Math.atan2(DIR.x, DIR.z), 0);
    g.rotation.set(EULER.x, EULER.y, EULER.z);

    // Pitch: arms/gun tilt (cheap full-body lean).
    g.rotation.x = 0;

    // Parachute.
    if (v.chuteOpen) {
      set.chute!.visible = true;
      set.chute!.rotation.set(0, 0, 0);
    } else {
      set.chute!.visible = false;
    }

    // Idle animation: subtle bob + arm sway.
    const moving = set.lastPos
      ? Math.hypot(v.pos.x - set.lastPos.x, v.pos.z - set.lastPos.z) > 0.03
      : false;
    set.lastPos = { x: v.pos.x, y: v.pos.y, z: v.pos.z };
    const t = now * 0.001;
    const bob = moving ? Math.sin(t * 6) * 0.04 : Math.sin(t * 2.2) * 0.012;
    g.position.y = v.pos.y + bob;
    // Head looks along yaw+pitch.
    set.head.rotation.set(v.pitch, 0, 0);
  }

  remove(id: number): void {
    const s = this.map.get(id);
    if (s) {
      this.groupRoot.remove(s.group);
      this.map.delete(id);
    }
  }
}