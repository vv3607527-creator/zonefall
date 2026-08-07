// terrain.ts — heightfield terrain mesh with region-blended vertex colors.

import * as THREE from 'three';
import { REGIONS, regionWeight } from '../../../shared/src/regions.ts';
import { terrainHeight, waterLevelAt } from '../../../shared/src/worldgen.ts';
import { WORLD_SIZE, SEA_LEVEL, WORLD_SEED } from '../../../shared/src/consts.ts';

const N = 192;                       // cells per side (cell ≈ 21.3m)
const CELL = WORLD_SIZE / N;

function heightAt(i: number, j: number): number {
  return terrainHeight(i * CELL, j * CELL, WORLD_SEED);
}

/** Region-blended base color for a world point (RGB 0..1). */
export function biomeColorAt(x: number, z: number): THREE.Color {
  const c = new THREE.Color(0.62, 0.66, 0.55);
  let wsum = 0;
  for (const r of REGIONS) {
    const w = regionWeight(r, x, z);
    if (w <= 0.001) continue;
    c.r += r.tint[0] * w;
    c.g += r.tint[1] * w;
    c.b += r.tint[2] * w;
    wsum += w;
  }
  if (wsum > 0) {
    c.r /= wsum;
    c.g /= wsum;
    c.b /= wsum;
  }
  return c;
}

export class TerrainMesh {
  mesh: THREE.Mesh;

  constructor() {
    const pos = new Float32Array((N + 1) * (N + 1) * 3);
    const col = new Float32Array((N + 1) * (N + 1) * 3);
    const hf: number[][] = [];
    const wf: number[][] = [];

    // Heights + colors.
    for (let j = 0; j <= N; j++) {
      hf[j] = [];
      wf[j] = [];
      for (let i = 0; i <= N; i++) {
        const x = i * CELL;
        const z = j * CELL;
        const h = heightAt(i, j);
        hf[j][i] = h;
        wf[j][i] = waterLevelAt(x, z, WORLD_SEED) > 0 ? 1 : 0;
        pos[(j * (N + 1) + i) * 3] = x;
        pos[(j * (N + 1) + i) * 3 + 1] = h;
        pos[(j * (N + 1) + i) * 3 + 2] = z;
      }
    }

    // Color per vertex: biome tint + height + noise + water sand.
    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) {
        const x = i * CELL;
        const z = j * CELL;
        const h = hf[j][i];
        const base = biomeColorAt(x, z);
        // Height shading: dark in valleys, light on ridges.
        const shade = 0.9 + h / 320;
        // Slope lightening via finite difference.
        const dl = j > 0 && j < N ? Math.abs(hf[j + 1][i] - hf[j - 1][i]) : 0;
        const dr = i > 0 && i < N ? Math.abs(hf[j][i + 1] - hf[j][i - 1]) * 0.5 : 0;
        const slope = Math.min(1, (dl + dr) / 6);
        // Deterministic dapple from position hash.
        const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
        const dapple = 0.96 + 0.08 * (n - Math.floor(n));
        const sand = wf[j][i] > 0 || h < SEA_LEVEL + 1 ? 1 : 0;

        let r = base.r * shade * dapple;
        let g = base.g * shade * dapple;
        let b = base.b * shade * dapple;
        if (sand) {
          // Beach sand wash.
          const t = 0.85;
          r = r * (1 - t) + 0.82 * t;
          g = g * (1 - t) + 0.76 * t;
          b = b * (1 - t) + 0.62 * t;
        } else {
          // Slope rock exposure.
          r = r * (1 - slope * 0.5) + 0.45 * slope * 0.5;
          g = g * (1 - slope * 0.5) + 0.43 * slope * 0.5;
          b = b * (1 - slope * 0.5) + 0.41 * slope * 0.5;
        }
        col[(j * (N + 1) + i) * 3] = r;
        col[(j * (N + 1) + i) * 3 + 1] = g;
        col[(j * (N + 1) + i) * 3 + 2] = b;
      }
    }

    const geo = new THREE.BufferGeometry();
    const idx: number[] = [];
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const a = j * (N + 1) + i;
        const b = a + 1;
        const c = a + N + 1;
        const d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();

    this.mesh = new THREE.Mesh(
      geo,
      new THREE.MeshLambertMaterial({ vertexColors: true }),
    );
    this.mesh.receiveShadow = true;
    this.mesh.name = 'terrain';
  }

  heightAtWorld(x: number, z: number): number {
    return terrainHeight(x, z, WORLD_SEED);
  }
}
