// items.ts — pooled ground loot meshes, rarity-tinted.

import * as THREE from 'three';
import type { ItemView } from '../net/client.ts';

const RARITY_COLOR = [0x9aa0a8, 0x3f8f4f, 0x3f6fcf, 0xc97f2f];
const RARITY_GLOW = [0x555b63, 0x55b56a, 0x5d8ff0, 0xffb84f];

interface ItemMesh {
  mesh: THREE.Mesh;
  view: ItemView | null;
  phase: number;
}

export class ItemManager {
  private pool: ItemMesh[] = [];
  private root: THREE.Group;
  private geo: THREE.BoxGeometry;
  private mat: THREE.MeshLambertMaterial;
  private glowMat: THREE.MeshBasicMaterial;

  constructor(scene: THREE.Scene) {
    this.root = new THREE.Group();
    this.root.name = 'items';
    scene.add(this.root);
    this.geo = new THREE.BoxGeometry(0.9, 0.55, 0.9);
    this.mat = new THREE.MeshLambertMaterial();
    this.glowMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5 });
  }

  sync(items: Map<number, ItemView>, now: number): void {
    let i = 0;
    for (const [, v] of items) {
      const m = this.acquire(i);
      const mesh = m.mesh;
      mesh.position.set(v.pos.x, v.pos.y + Math.abs(Math.sin(now * 0.003 + v.id * 1.7)) * 0.18, v.pos.z);
      mesh.rotation.y = now * 0.0009 + v.id;
      const c = RARITY_COLOR[v.rarity % RARITY_COLOR.length];
      const cm = this.mat.color;
      cm.setHex(c);
      mesh.visible = true;
      m.view = v;
      i++;
    }
    for (let j = i; j < this.pool.length; j++) {
      this.pool[j].mesh.visible = false;
      this.pool[j].view = null;
    }
  }

  private acquire(i: number): ItemMesh {
    if (i < this.pool.length) return this.pool[i];
    const mesh = new THREE.Mesh(this.geo, this.mat);
    mesh.castShadow = true;
    const m: ItemMesh = { mesh, view: null, phase: 0 };
    this.pool.push(m);
    this.root.add(mesh);
    return m;
  }
}