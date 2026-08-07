// main.ts — ZONEFALL client bootstrap: wires net, world render, input, prediction, HUD.
import { WorldScene } from './render/scene.ts';
import { InputManager } from './input/input.ts';
import { PlayerController } from './player/controller.ts';
import { Hud } from './ui/hud.ts';
import { SettingsPanel } from './ui/settings.ts';
import { Minimap } from './ui/minimap.ts';
import { Predictor } from './predict.ts';
import { NetClient } from './net/client.ts';
import { AudioFX } from './audio.ts';
import type { ClientMeta, GameEvent, InputSample } from '../../shared/src/types.ts';
import { TICK_MS } from '../../shared/src/consts.ts';
import { Vector3 } from 'three';

const app = document.getElementById('app');
if (!app) throw new Error('ZONEFALL: #app element missing');

// ---------------------------------------------------------------- DOM
const canvas = document.createElement('canvas');
canvas.id = 'game';
app.appendChild(canvas);
const uiRoot = document.createElement('div');
uiRoot.id = 'ui';
app.appendChild(uiRoot);
const minimapRoot = document.createElement('div');
minimapRoot.id = 'minimap';
uiRoot.appendChild(minimapRoot);

// ---------------------------------------------------------------- systems
const scene = new WorldScene(canvas);
const hud = new Hud({ onChat: (t) => net.sendChat(t) });
const minimap = new Minimap(minimapRoot);
const controller = new PlayerController(scene.camera);
const net = new NetClient();
const audio = new AudioFX();
const settings = new SettingsPanel({
  onSensitivity: (v) => {
    input.opts.sensitivity = v;
  },
  onVolume: (v) => audio.setVolume(v),
  onColorblind: (v) => hud.setColorblind(v),
  onResume: () => {
    audio.unlock();
    input.requestLock();
  },
});
document.body.appendChild(settings.el);
const input = new InputManager(canvas, {
  sensitivity: 0.0022,
  onLockChange: (locked) => {
    if (locked) {
      audio.unlock();
      hud.message('', '#ffffff', 0);
    } else if (!settings.isOpen) {
      // ESC dropped the lock — open the pause/settings overlay.
      settings.toggle();
    }
  },
  onPing: (x, z) => net.sendPingAt(x, z, 1),
});

let predictor: Predictor | null = null;
let localSeq = 0;
let sentStart = false;
let startedAt = performance.now();
let lastFrame = performance.now();
let stepClock = 0;

// ---------------------------------------------------------------- identity
const name =
  localStorage.getItem('zonefall_name') ??
  `Spectre-${Math.floor(1000 + Math.random() * 9000)}`;
localStorage.setItem('zonefall_name', name);
const meta: ClientMeta = { name, skin: Math.floor(Math.random() * 6), region: 'aurelia' };

// ---------------------------------------------------------------- net callbacks
net.onWelcome = (id, seed, tick) => {
  predictor = new Predictor(id, (x, z) => scene.heightAt(x, z));
  hud.message(`Isla Aurelia — Landfall Protocol. 100 players. 1 survivor.`, '#8fe3ff', 6000);
};

net.onFull = (snap) => {
  if (!sentStart) {
    sentStart = true;
    net.sendStart();
  }
  if (snap.match) {
    if (snap.match.phase === 'lobby') hud.message(`Match starting… ${Math.max(1, Math.ceil((snap.match.phaseEndTick - snap.tick) / 30))}s`, '#dfe6ee', 4000);
  }
};

net.onStatus = (s) => {
  hud.message(s, '#ffb84f', 4000);
};

net.onEvent = (e: GameEvent) => {
  if (!predictor) return;
  switch (e.t) {
    case 'hit': {
      if (e.victim === net.ownId) {
        hud.damage();
        audio.hit();
      }
      if (e.attacker === net.ownId) {
        hud.hitmarker(e.limb === 'head');
        if (e.limb === 'head') audio.headshot();
        else audio.hit();
      }
      break;
    }
    case 'kill': {
      const me = net.getView().players.get(net.ownId);
      const killer = net.getView().players.get(e.killer);
      const victim = net.getView().players.get(e.victim);
      hud.killFeed(killer?.name ?? '?', victim?.name ?? '?', e.weaponId, e.headshot);
      if (e.victim === net.ownId) {
        hud.message('Eliminated. You are a spectator.', '#ff7a7a', 5000);
        audio.death();
      }
      if (e.killer === net.ownId) audio.kill();
      if (me && !me.alive && e.killer === net.ownId) {
        hud.message(`You eliminated ${victim?.name ?? '?'}`, '#5ab56a', 3000);
      }
      break;
    }
    case 'zone':
      audio.zone();
      scene.effects.setZone(
        {
          phase: e.phase,
          center: e.center,
          radius: e.radius,
          nextCenter: e.center,
          nextRadius: e.radius,
          shrinkStartTick: 0,
          shrinkEndTick: 0,
          dps: 0,
        },
        0,
      );
      hud.message(`Zone ${e.phase + 1} — the Aurelia current is closing in.`, '#ffb84f', 4500);
      break;
    case 'plane':
      hud.banner('LANDING PROTOCOL', 'Skydrop sequence engaged');
      break;
    case 'start':
      hud.banner('ZONEFALL', '100 players deployed');
      break;
    case 'matchEnd':
      hud.banner(`WINNER — ${e.winner}`, 'Victory Royale');
      audio.kill();
      break;
    case 'ping':
    case 'drop':
    case 'vehicle':
      break;
    case 'crate':
      audio.pickup();
      break;
  }
};

net.onClosed = () => {
  hud.message('Disconnected from server.', '#ff7a7a', 6000);
};

net.connect(meta);
input.attach();

// ---------------------------------------------------------------- helpers
function camInput(sample: InputSample): Parameters<typeof controller.update>[0] {
  const p = predictor!.local;
  return {
    pos: new Vector3(p.pos.x, p.pos.y, p.pos.z),
    yaw: p.yaw,
    pitch: p.pitch,
    lean: sample.lean,
    moving: sample.mv.f !== 0 || sample.mv.s !== 0,
    wantAds: sample.ads,
    crouching: sample.crouch,
    isDriving: false,
    dt: TICK_MS / 1000,
  };
}

function zoneMsg(): string | null {
  const z = net.getView().zone;
  const m = net.getView().match;
  if (!z || !m) return null;
  if (m.phase === 'lobby') return `Match starts in ${Math.max(1, Math.ceil((m.phaseEndTick - net.estServerTick()) / 30))}s`;
  if (m.phase === 'ended') return m.winnerName ? `Winner: ${m.winnerName}` : 'Match over';
  if (z.phase >= 6) return 'Zone collapsed — final circle';
  return `Zone ${z.phase + 1}/6`;
}

// ---------------------------------------------------------------- main loop
function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;

  // Pointer lock: resume after an ESC unlock or first click.
  if (input.pollLockClick()) input.requestLock();

  // Sample inputs for this client tick and forward them to net + predictor.
  const samples = input.consumeTick();
  for (const raw of samples) {
    const sample: InputSample = { ...raw, seq: 0 };
    predictor?.addInput(localSeq, sample);
    net.pushSamples([sample]);
    localSeq++;
    // Fire tracer when the shot sample is the first of this tick.
    if (raw.fire) {
      const ray = controller.aimRay();
      scene.effects.shot(
        { x: ray.origin.x, y: ray.origin.y, z: ray.origin.z },
        { x: ray.dir.x, y: ray.dir.y, z: ray.dir.z },
        320,
      );
      audio.shot(false);
    }
  }
  net.flushInputs();

  const view = net.getView();
  const me = view.players.get(net.ownId);

  // Reconcile prediction with authority, then drive camera from predicted state.
  if (predictor && me) predictor.reconcile(me, null);
  const p = predictor?.local ?? null;
  if (p) {
    const last = samples[samples.length - 1] ?? ({} as Partial<InputSample>);
    controller.update({
      pos: new Vector3(p.pos.x, p.pos.y, p.pos.z),
      yaw: p.yaw,
      pitch: p.pitch,
      lean: last.lean ?? 0,
      moving: p.sprinting || p.airborne,
      wantAds: last.ads ?? false,
      crouching: p.crouching,
      isDriving: false,
      dt,
    });

    // Footsteps: cadence-locked while grounded and actively moving.
    const stepMoving = !p.airborne && ((last.mv?.f ?? 0) !== 0 || (last.mv?.s ?? 0) !== 0);
    stepClock += dt;
    if (stepMoving && stepClock >= 0.36) {
      audio.footstep();
      stepClock = 0;
    } else if (!stepMoving) {
      stepClock = 0;
    }
  }

  // World sync + render.
  scene.syncCrates(view);
  scene.update(view, now, dt);
  scene.render();
  scene.water.update(now);

  // HUD + minimap.
  const alive = view.match?.aliveCount ?? 0;
  hud.update(p ?? me ?? null, me?.ammo ?? [0, 0, 0, 0], me?.kills ?? 0, alive, zoneMsg());
  if (me) {
    const pp = p ? p.pos : me.pos;
    minimap.draw(view, net.ownId, { pos: { x: pp.x, z: pp.z }, yaw: me.yaw });
  }

  // Spectate panel on death.
  const m = view.match;
  if (me && !me.alive && m && m.phase === 'ended' && m.winnerName) {
    hud.spectate(me.kills, alive + 1, m.winnerName);
  } else {
    hud.hideSpectate();
  }
}

requestAnimationFrame((t) => {
  startedAt = t;
  lastFrame = t;
  frame(t);
});
