// minimap.ts — top-right canvas minimap: terrain tint, zone rings, entities.

import * as THREE from 'three';
import { terrainHeight } from '../../../shared/src/worldgen.ts';
import { WORLD_SIZE, WORLD_SEED } from '../../../shared/src/consts.ts';
import { Rng } from '../../../shared/src/rng.ts';
import { REGIONS } from '../../../shared/src/regions.ts';
import type { NetView } from '../net/client.ts';
import { biomeColorAt } from '../render/terrain.ts';

const SIZE = 216;
const SCALE = SIZE / WORLD_SIZE;

export class Minimap {
  canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement;

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = SIZE;
    this.canvas.height = SIZE;
    this.canvas.style.cssText = `position:absolute;top:14px;right:16px;width:${SIZE}px;height:${SIZE}px;border-radius:10px;border:1px solid rgba(255,255,255,0.18);box-shadow:0 2px 10px rgba(0,0,0,0.4);`;
    this.ctx = this.canvas.getContext('2d')!;
    parent.appendChild(this.canvas);
    this.bg = document.createElement('canvas');
    this.bg.width = SIZE;
    this.bg.height = SIZE;
    this.renderBase();
  }

  private renderBase(): void {
    const bctx = this.bg.getContext('2d')!;
    const steps = 64;
    const cell = WORLD_SIZE / steps;
    const img = bctx.createImageData(steps, steps);
    const rng = new Rng(20205);
    for (let j = 0; j < steps; j++) {
      for (let i = 0; i < steps; i++) {
        const x = i * cell + cell / 2;
        const z = j * cell + cell / 2;
        const h = terrainHeight(x, z, WORLD_SEED);
        const c = biomeColorAt(x, z);
        const shade = 0.55 + h / 500;
        let r = c.r * shade;
        let g = c.g * shade;
        let b = c.b * shade;
        if (h < 0.6) {
          r = r * 0.4 + 0.16;
          g = g * 0.4 + 0.32;
          b = b * 0.4 + 0.45;
        }
        const k = (j * steps + i) * 4;
        img.data[k] = r * 255;
        img.data[k + 1] = g * 255;
        img.data[k + 2] = b * 255;
        img.data[k + 3] = 255;
      }
    }
    bctx.putImageData(img, 0, 0);
    // Region labels.
    bctx.font = '9px sans-serif';
    bctx.fillStyle = 'rgba(255,255,255,0.55)';
    bctx.textAlign = 'center';
    for (const r of REGIONS) {
      bctx.fillText(shortName(r.name), r.cx * SCALE, r.cz * SCALE);
    }
  }

  draw(net: NetView, ownId: number, me: { pos: { x: number; z: number }; yaw: number }): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.drawImage(this.bg, 0, 0);

    ctx.save();
    ctx.beginPath();
    ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2);
    ctx.clip();

    const m = 0;
    const px = (x: number) => (x - m) * SCALE;
    const pz = (z: number) => (z - m) * SCALE;

    // Zone rings.
    if (net.zone) {
      const z = net.zone;
      ctx.strokeStyle = 'rgba(240,80,140,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px(z.center.x), pz(z.center.z), z.radius * SCALE, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(120,220,90,0.8)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(px(z.nextCenter.x), pz(z.nextCenter.z), z.nextRadius * SCALE, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Items.
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (const [, it] of net.items) {
      ctx.fillRect(px(it.pos.x) - 1, pz(it.pos.z) - 1, 2, 2);
    }

    // Vehicles.
    ctx.fillStyle = '#ffd24a';
    for (const [, v] of net.vehicles) {
      ctx.beginPath();
      ctx.arc(px(v.pos.x), pz(v.pos.z), 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Players.
    for (const [, p] of net.players) {
      if (!p.alive) continue;
      const isOwn = p.id === ownId;
      ctx.fillStyle = isOwn ? '#4ad6ff' : '#ff5a4a';
      ctx.beginPath();
      ctx.arc(px(p.pos.x), pz(p.pos.z), isOwn ? 4 : 2.5, 0, Math.PI * 2);
      ctx.fill();
      if (isOwn) {
        ctx.strokeStyle = '#4ad6ff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const ax = px(p.pos.x) + Math.cos(p.yaw) * 7;
        const az = pz(p.pos.z) + Math.sin(p.yaw) * 7;
        ctx.moveTo(px(p.pos.x), pz(p.pos.z));
        ctx.lineTo(ax, az);
        ctx.stroke();
      }
    }
    ctx.restore();

    // Ring border.
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 0.5, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function shortName(name: string): string {
  return name.replace(/^(Aurelia|Ironworks|Grand|Silver|Riverside|Celeste|Ember|Neutral|Harbor|Old|North|South|Cape|Dunes|Frost)/, '').trim() || name;
}

export { WORLD_SIZE };