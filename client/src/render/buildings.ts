// buildings.ts — deterministic instanced buildings + airport runway.

import * as THREE from 'three';
import { Rng } from '../../../shared/src/rng.ts';
import { REGIONS } from '../../../shared/src/regions.ts';
import { terrainHeight, waterLevelAt } from '../../../shared/src/worldgen.ts';
import { WORLD_SIZE, WORLD_SEED } from '../../../shared/src/consts.ts';

interface BuildingDef {
  walls: THREE.InstancedMesh;
  roofs: THREE.InstancedMesh;
  count: number;
  cursor: number;
}

const M = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const S = new THREE.Vector3();
const P = new THREE.Vector3();
const COL = new THREE.Color();

const WALL_MATS: Record<string, THREE.MeshLambertMaterial> = {};
const ROOF_MATS: Record<string, THREE.MeshLambertMaterial> = {};

function matFor(kind: 'wall' | 'roof', r: number, g: number, b: number): THREE.MeshLambertMaterial {
  const key = `${kind}-${r}-${g}-${b}`;
  const map = kind === 'wall' ? WALL_MATS : ROOF_MATS;
  let m = map[key];
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: new THREE.Color(r, g, b) });
    map[key] = m;
  }
  return m;
}

export class Buildings {
  defs: BuildingDef[] = [];
  ground: THREE.Group;

  constructor() {
    this.ground = new THREE.Group();

    for (const r of REGIONS) {
      if (r.buildDensity <= 0.05) continue;
      const rng = new Rng(Rng.hashStr(r.id + '::bld'));
      const tall = r.biome === 'coastal-city' || r.biome === 'research';
      const area = Math.PI * r.radius * r.radius;
      const count = Math.min(180, Math.floor(area / 9000 * r.buildDensity));
      const walls = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 1, 1),
        matFor('wall', r.tint[0] * 0.55, r.tint[1] * 0.55, r.tint[2] * 0.58),
        count,
      );
      const roofs = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 1, 1),
        matFor('roof', r.tint[0] * 0.34, r.tint[1] * 0.34, r.tint[2] * 0.38),
        count,
      );
      walls.name = `bld-${r.id}`;
      const def: BuildingDef = { walls, roofs, count, cursor: 0 };

      for (let i = 0; i < count; i++) {
        const ang = rng.next() * Math.PI * 2;
        const rad = r.radius * (0.15 + 0.8 * Math.sqrt(rng.next()));
        const x = r.cx + Math.cos(ang) * rad;
        const z = r.cz + Math.sin(ang) * rad;
        const h = terrainHeight(x, z, WORLD_SEED);
        if (h < 0.4) continue;                // into the sea
        if (waterLevelAt(x, z, WORLD_SEED) > 0) continue;
        const mtn = r.mountain > 0.4 ? 0 : 1;
        if (mtn === 0) continue;

        const w = 7 + rng.next() * (tall ? 14 : 10);
        const d = 7 + rng.next() * (tall ? 14 : 10);
        const hh = tall ? 14 + rng.next() * 34 : 8 + rng.next() * 14;
        const rot = rng.next() * Math.PI;
        // Skip anything that pokes through terrain badly.
        const h2 = terrainHeight(x + w, z + d, WORLD_SEED);
        if (Math.abs(h2 - h) > 5) continue;

        Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
        S.set(w, hh, d);
        P.set(x, h + hh / 2, z);
        M.compose(P, Q, S);
        walls.setMatrixAt(i, M);

        S.set(w * 1.04, 0.8, d * 1.04);
        P.set(x, h + hh + 0.4, z);
        M.compose(P, Q, S);
        roofs.setMatrixAt(i, M);

        def.cursor++;
      }
      walls.count = def.cursor;
      roofs.count = def.cursor;
      this.ground.add(walls, roofs);

      // Airport runway: long concrete strip.
      if (r.biome === 'airport') {
        this.buildRunway(r.cx, r.cz, r.radius);
      }
    }
  }

  private buildRunway(cx: number, cz: number, radius: number): void {
    const L = radius * 2.6;
    const W = 26;
    const runway = new THREE.Mesh(
      new THREE.BoxGeometry(W, 1.1, L),
      new THREE.MeshLambertMaterial({ color: 0x6d6d6f }),
    );
    const h = terrainHeight(cx, cz, WORLD_SEED);
    runway.position.set(cx, h + 0.5, cz);
    runway.rotation.y = Math.PI / 2;
    this.ground.add(runway);

    // Dashed centerline via a few white instanced slabs.
    const dashes = 24;
    const inst = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.5, 1.2, 2.4),
      new THREE.MeshLambertMaterial({ color: 0xf0f0ea }),
      dashes,
    );
    const step = (L - 6) / (dashes - 1);
    for (let i = 0; i < dashes; i++) {
      P.set(cx, h + 1.2, cz - L / 2 + 3 + i * step);
      M.compose(P, new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
      inst.setMatrixAt(i, M);
    }
    this.ground.add(inst);
  }

  /** Merge everything into the scene. */
  addTo(scene: THREE.Scene): void {
    scene.add(this.ground);
  }

  /** Return the walls/roofs for optional material tweaks. */
  setCastShadow(v: boolean): void {
    for (const d of this.defs) {
      d.walls.castShadow = v;
      d.roofs.castShadow = v;
    }
  }
}