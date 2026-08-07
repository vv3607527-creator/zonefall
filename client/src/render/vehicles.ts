// vehicles.ts — instanced wheeled vehicle meshes + boats.

import * as THREE from 'three';
import { VEHICLES } from '../../../shared/src/vehicles.ts';
import type { VehicleView } from '../net/client.ts';

interface VehicleSet {
  defId: string;
  group: THREE.Group;
  wheels: THREE.Mesh[];
  speed: number;
}

const WHEEL_GEO = new THREE.CylinderGeometry(0.42, 0.42, 0.34, 10);
WHEEL_GEO.rotateZ(Math.PI / 2);
const WHEEL_MAT = new THREE.MeshLambertMaterial({ color: 0x181a1e });

export class VehicleManager {
  private map = new Map<number, VehicleSet>();
  private root: THREE.Group;

  constructor(scene: THREE.Scene) {
    this.root = new THREE.Group();
    this.root.name = 'vehicles';
    scene.add(this.root);
  }

  sync(vehicles: Map<number, VehicleView>, now: number): void {
    const seen = new Set<number>();
    for (const [, v] of vehicles) {
      seen.add(v.id);
      const set = this.ensure(v);
      set.group.visible = true;
      set.group.position.set(v.pos.x, v.pos.y, v.pos.z);
      set.group.rotation.y = -v.yaw; // game yaw 0=+X → three yaw
      const dt = 1 / 30;
      set.speed = v.speed;
      // Spin wheels by speed.
      const spin = (v.speed * dt) / 0.42;
      for (const w of set.wheels) {
        w.rotation.x -= spin;
      }
      // Bob on water.
      if (v.inWater) {
        set.group.position.y += Math.sin(now * 0.004 + v.id) * 0.12;
      }
    }
    for (const [id, s] of this.map) {
      if (!seen.has(id)) s.group.visible = false;
    }
  }

  private ensure(v: VehicleView): VehicleSet {
    let set = this.map.get(v.id);
    if (set) return set;

    const def = VEHICLES.find((d) => d.id === v.defId) ?? VEHICLES[0];
    const group = new THREE.Group();

    const bodyMat = new THREE.MeshLambertMaterial({ color: def.color ? new THREE.Color(def.color[0], def.color[1], def.color[2]) : 0x445566 });
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x23262c });

    const isBoat = def.watercraft;
    const W = 2.1, H = 1.1, L = 4.6;
    const body = new THREE.Mesh(
      isBoat ? new THREE.BoxGeometry(L, 1.0, W) : new THREE.BoxGeometry(L, H, W),
      bodyMat,
    );
    body.position.y = isBoat ? 0.45 : 0.55;
    body.castShadow = true;
    group.add(body);

    // Cabin / pickup bed.
    if (!isBoat) {
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(L * 0.42, 0.9, W * 0.9), darkMat);
      cabin.position.set(-L * 0.22, 1.0, 0);
      group.add(cabin);
    } else {
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(L * 0.5, 0.5, W * 0.8), darkMat);
      cabin.position.set(-L * 0.18, 1.0, 0);
      group.add(cabin);
    }

    // Wheels.
    const wheels: THREE.Mesh[] = [];
    if (!isBoat) {
      const axles: [number, number, number][] = [
        [-1.5, 0.42, 1.05], [1.5, 0.42, 1.05],
        [-1.5, 0.42, -1.05], [1.5, 0.42, -1.05],
      ];
      for (const [x, y, z] of axles) {
        const w = new THREE.Mesh(WHEEL_GEO, WHEEL_MAT);
        w.position.set(x, y, z);
        group.add(w);
        wheels.push(w);
      }
    }

    set = { defId: v.defId, group, wheels, speed: 0 };
    this.map.set(v.id, set);
    this.root.add(group);
    return set;
  }
}