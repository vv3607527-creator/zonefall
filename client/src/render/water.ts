// water.ts — animated ocean + river plane with fresnel-ish shading.

import * as THREE from 'three';
import { SEA_LEVEL, WORLD_SIZE } from '../../../shared/src/consts.ts';

const VERT = `
uniform float uTime;
varying vec2 vUv;
varying float vWave;
void main() {
  vUv = uv;
  vec3 p = position;
  float w = 0.0;
  w += sin(p.x * 0.02 + uTime * 1.1) * 0.35;
  w += sin(p.z * 0.017 - uTime * 0.9) * 0.3;
  w += sin((p.x + p.z) * 0.011 + uTime * 0.7) * 0.22;
  p.y += w;
  vWave = w;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const FRAG = `
varying vec2 vUv;
varying float vWave;
uniform vec3 deep;
uniform vec3 shallow;
uniform vec3 foam;
void main() {
  vec3 c = mix(deep, shallow, smoothstep(-0.85, 0.85, vWave * 2.0));
  float sheen = 0.18 + 0.14 * sin(vUv.x * 220.0 + vUv.y * 180.0);
  c += foam * sheen;
  float a = 0.82;
  gl_FragColor = vec4(c, a);
}`;

export class Water {
  constructor(scene: THREE.Scene) {
    const size = WORLD_SIZE * 1.05;
    const geo = new THREE.PlaneGeometry(size, size, 96, 96);
    geo.rotateX(-Math.PI / 2);
    geo.translate(WORLD_SIZE / 2, SEA_LEVEL + 0.8, WORLD_SIZE / 2);

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        deep: { value: new THREE.Color(0x1f4f7a) },
        shallow: { value: new THREE.Color(0x3f86a8) },
        foam: { value: new THREE.Color(0xbfe3ee) },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
    });
    this.mat = mat;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 2;
    scene.add(mesh);
  }

  mat: THREE.ShaderMaterial;

  update(time: number): void {
    this.mat.uniforms.uTime.value = time;
  }
}