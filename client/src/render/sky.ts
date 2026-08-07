// sky.ts — gradient sky dome, sun, ambient lighting and fog.

import * as THREE from 'three';
import { WORLD_SIZE } from '../../../shared/src/consts.ts';

export const SKY_TOP = new THREE.Color(0x3c6fa8);
export const SKY_HORIZON = new THREE.Color(0xd8c9a8);
export const FOG_COLOR = new THREE.Color(0xaabfce);
export const SUN_COLOR = new THREE.Color(0xffe8b0);
export const AMBIENT_SKY = new THREE.Color(0x9fb8d8);
export const AMBIENT_GROUND = new THREE.Color(0x8a7a5c);

const VERT = `
varying vec3 vWorld;
void main() {
  vWorld = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = `
varying vec3 vWorld;
uniform vec3 top;
uniform vec3 horizon;
uniform vec3 low;
void main() {
  float h = normalize(vWorld).y;
  vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.6)) : mix(horizon, low, pow(-h, 0.8));
  gl_FragColor = vec4(c, 1.0);
}`;

export class Sky {
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;

  constructor(scene: THREE.Scene) {
    scene.background = new THREE.Color(0x000000);

    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(4500, 32, 18),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          top: { value: SKY_TOP },
          horizon: { value: SKY_HORIZON },
          low: { value: new THREE.Color(0x4a6f8a) },
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
      }),
    );
    dome.renderOrder = -10;
    scene.add(dome);

    this.sun = new THREE.DirectionalLight(SUN_COLOR, 1.6);
    this.sun.position.set(WORLD_SIZE * 0.6, WORLD_SIZE * 0.55, -WORLD_SIZE * 0.3);
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.hemi = new THREE.HemisphereLight(AMBIENT_SKY, AMBIENT_GROUND, 0.75);
    scene.add(this.hemi);

    scene.fog = new THREE.Fog(FOG_COLOR, 700, 3400);
  }
}
