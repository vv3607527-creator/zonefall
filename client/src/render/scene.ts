// scene.ts — owns the THREE scene graph, camera, and all render subsystems.

import * as THREE from 'three';
import { terrainHeight } from '../../../shared/src/worldgen.ts';
import { WORLD_SIZE, WORLD_SEED } from '../../../shared/src/consts.ts';
import type { NetView } from '../net/client.ts';
import type { Vec3 } from '../../../shared/src/math.ts';
import { TerrainMesh } from './terrain.ts';
import { Sky } from './sky.ts';
import { Water } from './water.ts';
import { Buildings } from './buildings.ts';
import { Vegetation } from './vegetation.ts';
import { CharacterManager } from './characters.ts';
import { VehicleManager } from './vehicles.ts';
import { ItemManager } from './items.ts';
import { Effects } from './effects.ts';

interface CrateMesh {
  group: THREE.Group;
}

export class WorldScene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  terrain: TerrainMesh;
  sky: Sky;
  water: Water;
  buildings: Buildings;
  vegetation: Vegetation;
  characters: CharacterManager;
  vehicles: VehicleManager;
  items: ItemManager;
  effects: Effects;
  private crates = new Map<number, CrateMesh>();
  private crateRoot: THREE.Group;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 6000);

    this.terrain = new TerrainMesh();
    this.scene.add(this.terrain.mesh);
    this.sky = new Sky(this.scene);
    this.water = new Water(this.scene);
    this.buildings = new Buildings();
    this.buildings.addTo(this.scene);
    this.vegetation = new Vegetation();
    this.vegetation.addTo(this.scene);
    this.characters = new CharacterManager(this.scene);
    this.vehicles = new VehicleManager(this.scene);
    this.items = new ItemManager(this.scene);
    this.effects = new Effects(this.scene);
    this.crateRoot = new THREE.Group();
    this.scene.add(this.crateRoot);

    window.addEventListener('resize', () => this.resize());
  }

  heightAt(x: number, z: number): number {
    return terrainHeight(x, z, WORLD_SEED);
  }

  resize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  syncCrates(net: NetView): void {
    const seen = new Set<number>();
    for (const [, c] of net.crates) {
      seen.add(c.id);
      let m = this.crates.get(c.id);
      if (!m) {
        const group = new THREE.Group();
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(1.4, 1.2, 1.4),
          new THREE.MeshLambertMaterial({ color: 0x3a4a3f }),
        );
        box.position.y = 0.6;
        box.castShadow = true;
        const strap = new THREE.Mesh(
          new THREE.BoxGeometry(1.42, 0.18, 1.42),
          new THREE.MeshLambertMaterial({ color: 0xd8c24a }),
        );
        strap.position.y = 1.0;
        const light = new THREE.PointLight(0xffe08a, 6, 45);
        light.position.y = 2.6;
        group.add(box, strap, light);
        m = { group };
        this.crates.set(c.id, m);
        this.crateRoot.add(group);
      }
      m.group.visible = true;
      m.group.position.set(c.pos.x, c.pos.y, c.pos.z);
    }
    for (const [id, m] of this.crates) {
      if (!seen.has(id)) m.group.visible = false;
    }
  }

  /** Full per-frame sync from interpolated net state. */
  update(net: NetView, now: number, dt: number): void {
    this.characters.sync(net.players, now);
    this.vehicles.sync(net.vehicles, now);
    this.items.sync(net.items, now);
    this.syncCrates(net);
    this.water.update(now * 0.001);
    this.effects.update(now);

    if (net.zone) {
      const z = net.zone;
      const gy = terrainHeight(z.center.x, z.center.z, WORLD_SEED);
      this.effects.setZone(z, gy);
    }
    void dt;
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  /** Convert a game-world point to a THREE Vector3. */
  static toThree(v: Vec3): THREE.Vector3 {
    return new THREE.Vector3(v.x, v.y, v.z);
  }
}

export { WORLD_SIZE };