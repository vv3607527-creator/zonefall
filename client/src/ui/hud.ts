// hud.ts — in-game overlay: health/armor/stim, ammo, kills, kill feed,
// chat feed, hit markers, damage vignette, zone banner, spectate overlay.

import { AMMO_INDEX, CATEGORY_LABEL, WEAPONS } from '../../../shared/src/weapons.ts';
import { ITEMS, itemById } from '../../../shared/src/items.ts';
import type { GameEvent } from '../../../shared/src/types.ts';
import type { PlayerView } from '../net/client.ts';
import type { PredictedState } from '../predict.ts';

interface HudOpts {
  onChat: (text: string) => void;
}

const RARITY_COLOR = ['#a0a6ad', '#5ab56a', '#5d8ff0', '#ffb84f'];
// Colorblind-safe rarity palette: grey → blue → orange → magenta. Each tier is
// distinguishable for protanopia/deuteranopia (blue vs orange never collide).
const CB_RARITY_COLOR = ['#a0a6ad', '#5d8ff0', '#f0963a', '#c0579b'];

export class Hud {
  root: HTMLDivElement;
  private opts: HudOpts;
  private hpFill: HTMLDivElement;
  private armorFill: HTMLDivElement;
  private stimFill: HTMLDivElement;
  private hpText: HTMLDivElement;
  private ammoText: HTMLDivElement;
  private weaponText: HTMLDivElement;
  private killsText: HTMLDivElement;
  private aliveText: HTMLDivElement;
  private zoneText: HTMLDivElement;
  private feedEl: HTMLDivElement;
  private killfeedEl: HTMLDivElement;
  private chatInput: HTMLInputElement;
  private chatOpen = false;
  private hitmarkerEl: HTMLDivElement;
  private vignetteEl: HTMLDivElement;
  private spectateEl: HTMLDivElement;
  private crosshairEl: HTMLDivElement;
  private suppressedEl: HTMLDivElement;
  private bannerEl: HTMLDivElement;
  private invEl: HTMLDivElement;
  private cb = false;

  constructor(opts: HudOpts) {
    this.opts = opts;
    const root = document.createElement('div');
    root.id = 'hud';
    root.style.cssText = 'position:fixed;inset:0;pointer-events:none;font-family:ui-sans-serif,system-ui,sans-serif;color:#e8e8e8;overflow:hidden;';
    document.body.appendChild(root);
    this.root = root;

    // Crosshair.
    const ch = document.createElement('div');
    ch.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:8px;height:8px;border:1.5px solid rgba(255,255,255,0.9);border-radius:50%;box-shadow:0 0 3px rgba(0,0,0,0.8);';
    this.crosshairEl = ch;
    root.appendChild(ch);

    // Hit marker.
    const hm = document.createElement('div');
    hm.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:34px;height:34px;opacity:0;transition:opacity 90ms;';
    hm.innerHTML = `<svg viewBox="0 0 34 34"><path d="M17 6v8M17 20v8M6 17h8M20 17h8" stroke="#ff5f4f" stroke-width="2.5" stroke-linecap="round"/></svg>`;
    this.hitmarkerEl = hm;
    root.appendChild(hm);

    // Damage vignette.
    const vg = document.createElement('div');
    vg.style.cssText = 'position:absolute;inset:0;opacity:0;transition:opacity 250ms;background:radial-gradient(ellipse at center, transparent 45%, rgba(200,20,20,0.55) 100%);';
    this.vignetteEl = vg;
    root.appendChild(vg);

    // Suppression edge.
    const su = document.createElement('div');
    su.style.cssText = 'position:absolute;inset:0;opacity:0;transition:opacity 300ms;background:radial-gradient(ellipse at center, transparent 55%, rgba(120,80,20,0.5) 100%);';
    this.suppressedEl = su;
    root.appendChild(su);

    // Zone banner.
    const zn = document.createElement('div');
    zn.style.cssText = 'position:absolute;top:14%;left:50%;transform:translateX(-50%);font-size:15px;letter-spacing:2px;text-transform:uppercase;opacity:0;transition:opacity 300ms;text-shadow:0 1px 4px #000;';
    this.zoneText = zn;
    root.appendChild(zn);

    // Top-left: stats stack.
    const stats = document.createElement('div');
    stats.style.cssText = 'position:absolute;top:14px;left:16px;display:flex;flex-direction:column;gap:6px;text-shadow:0 1px 3px #000;font-size:13px;';
    this.killsText = this.bar('kills', stats);
    root.appendChild(stats);

    // Top-right: alive count + minimap slot.
    const right = document.createElement('div');
    right.style.cssText = 'position:absolute;top:14px;right:16px;display:flex;flex-direction:column;align-items:flex-end;gap:6px;text-shadow:0 1px 3px #000;font-size:13px;';
    this.aliveText = this.bar('alive', right);
    root.appendChild(right);

    // Bottom-center: HP/armor/stim.
    const vitals = document.createElement('div');
    vitals.style.cssText = 'position:absolute;left:50%;bottom:26px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:5px;width:280px;';
    const hpRow = this.row(['HP', this.hpFill = this.fill(), this.hpText = this.text()]);
    const arRow = this.row(['ARMOR', this.armorFill = this.fill('#6d9dd0'), this.text()]);
    const stRow = this.row(['STIM', this.stimFill = this.fill('#e8c95a'), this.text()]);
    vitals.append(hpRow, arRow, stRow);
    root.appendChild(vitals);

    // Bottom-right: consumable inventory chips.
    const inv = document.createElement('div');
    inv.style.cssText = 'position:absolute;right:16px;bottom:26px;display:flex;flex-direction:column;align-items:flex-end;gap:3px;text-shadow:0 1px 3px #000;font-size:13px;text-align:right;';
    this.invEl = inv;
    root.appendChild(inv);

    // Bottom-left: weapon + ammo.
    const wep = document.createElement('div');
    wep.style.cssText = 'position:absolute;left:20px;bottom:26px;display:flex;flex-direction:column;gap:2px;text-shadow:0 1px 3px #000;';
    this.weaponText = this.text();
    this.weaponText.style.fontSize = '17px';
    this.ammoText = this.text();
    this.ammoText.style.fontSize = '20px';
    this.ammoText.style.fontWeight = '700';
    wep.append(this.weaponText, this.ammoText);
    root.appendChild(wep);

    // Kill feed (top-center under banner).
    this.killfeedEl = document.createElement('div');
    this.killfeedEl.style.cssText = 'position:absolute;top:64px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;gap:3px;align-items:center;text-shadow:0 1px 3px #000;font-size:13px;';
    root.appendChild(this.killfeedEl);

    // Message feed (bottom-left above weapon).
    this.feedEl = document.createElement('div');
    this.feedEl.style.cssText = 'position:absolute;left:20px;bottom:96px;display:flex;flex-direction:column;gap:2px;text-shadow:0 1px 3px #000;font-size:13px;max-width:420px;';
    root.appendChild(this.feedEl);

    // Chat input (bottom-left, pointer-events auto).
    this.chatInput = document.createElement('input');
    this.chatInput.style.cssText = 'position:absolute;left:20px;bottom:120px;width:300px;padding:6px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.3);background:rgba(0,0,0,0.55);color:#fff;font-size:13px;display:none;pointer-events:auto;outline:none;';
    this.chatInput.maxLength = 80;
    root.appendChild(this.chatInput);

    // Spectate overlay.
    const sp = document.createElement('div');
    sp.style.cssText = 'position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;background:rgba(10,8,6,0.45);gap:8px;';
    this.spectateEl = sp;
    root.appendChild(sp);

    // Banner (match start / winner).
    const bn = document.createElement('div');
    bn.style.cssText = 'position:absolute;top:36%;left:50%;transform:translate(-50%,-50%);font-size:44px;font-weight:800;letter-spacing:6px;text-transform:uppercase;opacity:0;transition:opacity 600ms;text-shadow:0 2px 12px #000;color:#f2e8d0;white-space:nowrap;';
    this.bannerEl = bn;
    root.appendChild(bn);

    this.chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const v = this.chatInput.value.trim();
        this.chatInput.value = '';
        this.setChatOpen(false);
        if (v) this.opts.onChat(v);
      } else if (e.key === 'Escape') {
        this.chatInput.value = '';
        this.setChatOpen(false);
      }
      e.stopPropagation();
    });
  }

  private bar(id: string, parent: HTMLElement): HTMLDivElement {
    const d = document.createElement('div');
    d.id = `hud-${id}`;
    parent.appendChild(d);
    return d;
  }

  private fill(color = '#5ab56a'): HTMLDivElement {
    const f = document.createElement('div');
    f.style.cssText = `height:10px;border-radius:5px;background:${color};width:100%;transition:width 120ms linear;`;
    return f;
  }

  private text(): HTMLDivElement {
    const t = document.createElement('div');
    t.style.cssText = 'min-width:0;';
    return t;
  }

  private row(labels: [string, HTMLDivElement, HTMLDivElement]): HTMLDivElement {
    const r = document.createElement('div');
    r.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%;';
    const l = document.createElement('div');
    l.textContent = labels[0];
    l.style.cssText = 'font-size:10px;letter-spacing:1px;opacity:0.7;width:44px;';
    const track = document.createElement('div');
    track.style.cssText = 'flex:1;background:rgba(0,0,0,0.45);border-radius:5px;height:10px;';
    track.appendChild(labels[1]);
    r.append(l, track, labels[2]);
    return r;
  }

  setChatOpen(open: boolean): void {
    this.chatOpen = open;
    this.chatInput.style.display = open ? 'block' : 'none';
    this.crosshairEl.style.opacity = open ? '0' : '1';
    if (open) this.chatInput.focus();
    else this.chatInput.blur();
  }

  isChatOpen(): boolean {
    return this.chatOpen;
  }

  /** Per-frame view update. */
  update(me: PlayerView | PredictedState | null, ammo: number[], kills: number, aliveCount: number, zoneMsg: string | null): void {
    if (!me) return;
    const hp = Math.max(0, Math.round(me.hp));
    this.hpFill.style.width = `${Math.min(100, hp)}%`;
    this.hpFill.style.background = hp > 50 ? '#5ab56a' : hp > 25 ? '#d0a53f' : '#d04a3a';
    this.hpText.textContent = `${hp}`;
    const armor = Math.max(0, Math.round(me.armor));
    this.armorFill.style.width = `${Math.min(100, armor)}%`;
    this.killsText.textContent = `KILLS  ${kills}`;
    this.aliveText.textContent = `ALIVE  ${aliveCount}`;

    const w = weaponOf(me);
    this.weaponText.textContent = w ? `${w.name}` : 'FISTS';
    if (w) {
      const inMag = me.activeSlot === -1 ? 0 : ammo[w.mag] ?? 0;
      const total = ammo[w.ammo] ?? 0;
      this.ammoText.textContent = `${inMag} / ${total}`;
      this.ammoText.style.color = inMag === 0 ? '#e05a4a' : '#e8e8e8';
    } else {
      this.ammoText.textContent = '';
    }

    if (zoneMsg) {
      this.zoneText.textContent = zoneMsg;
      this.zoneText.style.opacity = '1';
    } else {
      this.zoneText.style.opacity = '0';
    }

    // Consumable inventory chips (authoritative PlayerView carries inv; the
    // local PredictedState does not, so skip it on the predictive path).
    this.invEl.innerHTML = 'inv' in me ? invChips(me.inv, this.cb ? CB_RARITY_COLOR : RARITY_COLOR) : '';
  }

  setStim(v: number): void {
    this.stimFill.style.width = `${Math.min(100, v)}%`;
  }

  /** Toggle the colorblind-safe rarity palette for inventory chips. */
  setColorblind(on: boolean): void {
    this.cb = on;
  }

  hitmarker(headshot = false): void {
    this.hitmarkerEl.style.opacity = '1';
    this.hitmarkerEl.style.transform = `translate(-50%,-50%) ${headshot ? 'scale(1.4)' : 'scale(1)'}`;
    setTimeout(() => { this.hitmarkerEl.style.opacity = '0'; }, 130);
  }

  damage(): void {
    this.vignetteEl.style.opacity = '1';
    setTimeout(() => { this.vignetteEl.style.opacity = '0'; }, 300);
  }

  suppression(v: number): void {
    this.suppressedEl.style.opacity = `${Math.min(1, v * 1.2)}`;
  }

  message(text: string, color = '#e8e8e8', ttl = 5000): void {
    const d = document.createElement('div');
    d.textContent = text;
    d.style.cssText = `color:${color};text-shadow:0 1px 3px #000;`;
    this.feedEl.appendChild(d);
    while (this.feedEl.childNodes.length > 6) this.feedEl.removeChild(this.feedEl.firstChild!);
    setTimeout(() => { d.style.opacity = '0'; d.style.transition = 'opacity 400ms'; }, ttl - 400);
    setTimeout(() => d.remove(), ttl);
  }

  killFeed(killer: string, victim: string, weaponId: number, headshot: boolean): void {
    const w = weaponById(weaponId);
    const d = document.createElement('div');
    d.style.cssText = 'padding:3px 12px;background:rgba(0,0,0,0.5);border-radius:4px;';
    d.innerHTML = `<b style="color:#ffd9a0">${esc(killer)}</b> <span style="opacity:0.75">${w ? `[${esc(w.name)}]` : 'FISTS'}${headshot ? ' <span style="color:#ff6a5a">HEADSHOT</span>' : ''}</span> <b style="color:#d98f9f">${esc(victim)}</b>`;
    this.killfeedEl.appendChild(d);
    while (this.killfeedEl.childNodes.length > 5) this.killfeedEl.removeChild(this.killfeedEl.firstChild!);
    setTimeout(() => d.remove(), 6000);
  }

  banner(text: string, sub?: string): void {
    this.bannerEl.textContent = text;
    this.bannerEl.style.opacity = '1';
    setTimeout(() => { this.bannerEl.style.opacity = '0'; }, 3500);
    if (sub) {
      const s = document.createElement('div');
      s.textContent = sub;
      s.style.cssText = 'position:absolute;top:calc(36% + 40px);left:50%;transform:translateX(-50%);font-size:15px;letter-spacing:2px;opacity:0;transition:opacity 600ms;text-shadow:0 1px 6px #000;';
      this.root.appendChild(s);
      setTimeout(() => { s.style.opacity = '1'; }, 60);
      setTimeout(() => { s.style.opacity = '0'; }, 3200);
      setTimeout(() => s.remove(), 3800);
    }
  }

  spectate(kills: number, place: number, winner: string): void {
    this.spectateEl.style.display = 'flex';
    this.spectateEl.innerHTML = `
      <div style="font-size:42px;font-weight:800;letter-spacing:4px;text-shadow:0 2px 12px #000">ELIMINATED</div>
      <div style="font-size:16px;opacity:0.9">Place <b>#${place}</b> · ${kills} kill${kills === 1 ? '' : 's'}</div>
      <div style="font-size:14px;opacity:0.7;margin-top:4px">Winner: ${esc(winner)}</div>
      <div style="font-size:12px;opacity:0.6;margin-top:18px">Spectating — press SPACE to re-deploy when the server allows</div>`;
  }

  hideSpectate(): void {
    this.spectateEl.style.display = 'none';
    this.spectateEl.innerHTML = '';
  }
}

function weaponOf(me: PlayerView | PredictedState): WeaponShort | null {
  if ('equippedWeapon' in me) {
    const idx = me.equippedWeapon;
    return idx >= 0 ? { name: WEAPONS[idx]?.name ?? '?', mag: WEAPONS[idx]?.mag ?? -1, ammo: AMMO_INDEX[WEAPONS[idx]?.ammo ?? 'none'] } : null;
  }
  return null;
}

interface WeaponShort {
  name: string;
  mag: number;
  ammo: number;
}

function weaponById(id: number): { name: string } | null {
  return id >= 0 && id < WEAPONS.length ? WEAPONS[id] : null;
}

/** Render [idx, count, idx, count, ...] inventory as rarity-colored chips. */
function invChips(inv: number[], palette: string[]): string {
  const chips: string[] = [];
  for (let i = 0; i + 1 < inv.length; i += 2) {
    const def = ITEMS[inv[i]];
    if (!def || (def.kind !== 'heal' && def.kind !== 'armor' && def.kind !== 'throwable')) continue;
    const color = palette[def.rarity] ?? palette[0];
    chips.push(`<span style="color:${color}">${esc(def.name)} <b>×${inv[i + 1]}</b></span>`);
  }
  return chips.join('<br>');
}

function esc(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export { RARITY_COLOR, CATEGORY_LABEL, ITEMS, itemById };