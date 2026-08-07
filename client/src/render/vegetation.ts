// vegetation.ts — deterministic instanced trees and bushes per biome.

import * as THREE from 'three';
import { Rng } from '../../../shared/src/rng.ts';
import { REGIONS } from '../../../shared/src/regions.ts';
import { terrainHeight, vegDensityAt, waterLevelAt } from '../../../shared/src/worldgen.ts';
import { WORLD_SIZE, WORLD_SEED } from '../../../shared/src/consts.ts';

const CELL = 26;

const M = new THREE.Matrix4();
const P = new THREE.Vector3();
const S = new THREE.Vector3();
const COL = new THREE.Color();

interface VegSet {
  trunks: THREE.InstancedMesh;
  canopies: THREE.InstancedMesh;
  cursor: number;
  cap: number;
}

export class Vegetation {
  sets: VegSet[] = [];
  ground: THREE.Group;

  constructor() {
    this.ground = new THREE.Group();

    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 1, 6);
    const pineGeo = new THREE.ConeGeometry(1, 1, 7);
    const bushGeo = new THREE.IcosahedronGeometry(0.6, 0);

    for (const r of REGIONS) {
      if (r.vegDensity <= 0.05) continue;
      const rng = new Rng(Rng.hashStr(r.id + '::veg'));
      const ncol = r.biome === 'snow' ? 0x2e3b3a : r.biome === 'desert' ? 0x7a6a3c : 0x3e5a34;
      const pine = r.biome === 'mountain' || r.biome === 'snow';
      const cap = Math.floor(Math.PI * r.radius * r.radius / 130);
      const trunks = new THREE.InstancedMesh(
        trunkGeo,
        new THREE.MeshLambertMaterial({ color: 0x5a4330 }),
        cap,
      );
      const canopies = new THREE.InstancedMesh(
        pine ? pineGeo : bushGeo,
        new THREE.MeshLambertMaterial({ color: new THREE.Color(ncol) }),
        cap,
      );
      trunks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      const set: VegSet = { trunks, canopies, cursor: 0, cap };

      for (let i = 0; i < cap; i++) {
        const ang = rng.next() * Math.PI * 2;
        const rad = r.radius * (0.1 + 0.9 * Math.sqrt(rng.next()));
        const x = r.cx + Math.cos(ang) * rad;
        const z = r.cz + Math.sin(ang) * rad;
        const h = terrainHeight(x, z, WORLD_SEED);
        if (h < 0.5) continue;
        if (waterLevelAt(x, z, WORLD_SEED) > 0) continue;
        const vd = vegDensityAt(x, z, WORLD_SEED);
        if (vd < 0.25) continue;
        if (rng.next() > vd) continue;

        const scale = 0.75 + rng.next() * 0.8;
        const th = pine ? 2.2 + rng.next() * 2.6 : 1.1 + rng.next() * 1.2;
        // Trunk.
        P.set(x, h + th / 2, z);
        M.compose(P, new THREE.Quaternion(), new THREE.Vector3(scale, th, scale));
        trunks.setMatrixAt(i, M);
        // Canopy.
        const cy = h + th + (pine ? 1.2 + rng.next() : 0.5);
        P.set(x, cy, z);
        M.compose(P, new THREE.Quaternion(), new THREE.Vector3(scale * 1.6, scale * (pine ? 2.4 : 1.2), scale * 1.6));
        canopies.setMatrixAt(i, M);

        if (!pine) {
          COL.setHSL(0.27 + rng.next() * 0.06, 0.45 + rng.next() * 0.2, 0.32 + rng.next() * 0.14);
          canopies.setColorAt(i, COL);
        }
        set.cursor++;
      }
      trunks.count = set.cursor;
      canopies.count = set.cursor;
      this.ground.add(trunks, canopies);
      this.sets.push(set);
    }
  }

  addTo(scene: THREE.Scene): void {
    scene.add(this.ground);
  }
}