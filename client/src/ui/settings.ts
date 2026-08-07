// settings.ts — pause overlay (Escape): mouse sensitivity, master volume,
// colorblind-safe rarity palette, and resume. Values persist to localStorage.

interface SettingsState {
  sensitivity: number; // rad per pixel
  volume: number; // 0..1
  colorblind: boolean;
}

interface SettingsHandlers {
  onSensitivity: (v: number) => void;
  onVolume: (v: number) => void;
  onColorblind: (v: boolean) => void;
  onResume: () => void;
}

const STORAGE_KEY = 'zonefall_settings';

const DEFAULTS: SettingsState = { sensitivity: 0.0022, volume: 0.6, colorblind: false };

function loadState(): SettingsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<SettingsState>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export class SettingsPanel {
  readonly el: HTMLDivElement;
  private state: SettingsState;
  private handlers: SettingsHandlers;
  private inputs: { sens: HTMLInputElement; vol: HTMLInputElement; cb: HTMLInputElement } | null = null;

  constructor(handlers: SettingsHandlers) {
    this.handlers = handlers;
    this.state = loadState();
    this.el = document.createElement('div');
    this.build();
    this.hide();
  }

  get isOpen(): boolean {
    return this.el.style.display !== 'none';
  }

  /** Open the overlay (releases pointer lock via the browser's own Escape). */
  toggle(): void {
    if (this.isOpen) this.closeFromPanel();
    else this.open();
  }

  private open(): void {
    this.el.style.display = 'flex';
  }

  private closeFromPanel(): void {
    // Called from the Resume button (a user gesture), so lock can be re-requested.
    this.el.style.display = 'none';
    this.handlers.onResume();
  }

  private build(): void {
    const s = this.state;
    this.el.style.cssText =
      'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
      'background:rgba(4,8,12,.82);backdrop-filter:blur(4px);z-index:60;font-family:ui-monospace,monospace;';
    const panel = document.createElement('div');
    panel.style.cssText =
      'background:#0b141c;border:1px solid #2a3c4c;border-radius:12px;padding:26px 34px;width:320px;' +
      'display:flex;flex-direction:column;gap:18px;color:#dfe6ee;box-shadow:0 12px 40px rgba(0,0,0,.5);';

    const title = document.createElement('div');
    title.textContent = 'SETTINGS';
    title.style.cssText = 'font-size:18px;letter-spacing:3px;color:#8fe3ff;text-align:center;';

    const sensLabel = sliderLabel('Mouse sensitivity', `${(s.sensitivity / DEFAULTS.sensitivity).toFixed(1)}x`);
    const sens = sensLabel.el as HTMLDivElement;
    const sensSel = sensLabel.input;
    sensSel.min = '0.4';
    sensSel.max = '2.6';
    sensSel.step = '0.1';
    sensSel.value = String(s.sensitivity / DEFAULTS.sensitivity);

    const volLabel = sliderLabel('SFX volume', `${Math.round(s.volume * 100)}%`);
    const vol = volLabel.el as HTMLDivElement;
    const volSel = volLabel.input;
    volSel.min = '0';
    volSel.max = '1';
    volSel.step = '0.05';
    volSel.value = String(s.volume);

    const cb = document.createElement('label');
    cb.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:13px;color:#aeb8c0;cursor:pointer;';
    const cbSel = document.createElement('input');
    cbSel.type = 'checkbox';
    cbSel.checked = s.colorblind;
    cb.appendChild(cbSel);
    cb.append('Colorblind-safe rarity palette');

    const resume = document.createElement('button');
    resume.textContent = 'Resume';
    resume.style.cssText =
      'padding:10px;border:1px solid #2a3c4c;background:#12212d;color:#dfe6ee;border-radius:6px;' +
      'font-size:14px;cursor:pointer;';
    resume.addEventListener('click', () => this.closeFromPanel());

    this.inputs = { sens: sensSel, vol: volSel, cb: cbSel };
    sensSel.addEventListener('input', () => {
      const v = Number(sensSel.value) * DEFAULTS.sensitivity;
      sensSel.parentElement!.querySelector('span')!.textContent = `${Number(sensSel.value)}x`;
      this.apply({ sensitivity: v });
    });
    volSel.addEventListener('input', () => {
      const v = Number(volSel.value);
      volSel.parentElement!.querySelector('span')!.textContent = `${Math.round(v * 100)}%`;
      this.apply({ volume: v });
    });
    cbSel.addEventListener('change', () => this.apply({ colorblind: cbSel.checked }));

    panel.append(title, sens, vol, cb, resume);
    this.el.appendChild(panel);
  }

  private apply(patch: Partial<SettingsState>): void {
    this.state = { ...this.state, ...patch };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // Storage full or denied — settings still apply for the session.
    }
    if (this.state.sensitivity !== undefined) this.handlers.onSensitivity(this.state.sensitivity);
    if (this.state.volume !== undefined) this.handlers.onVolume(this.state.volume);
    if (this.state.colorblind !== undefined) this.handlers.onColorblind(this.state.colorblind);
  }

  private hide(): void {
    this.el.style.display = 'none';
  }
}

function sliderLabel(label: string, value: string): { el: HTMLDivElement; input: HTMLInputElement } {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;font-size:13px;color:#aeb6c0;';
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;justify-content:space-between;';
  const lbl = document.createElement('span');
  lbl.textContent = label;
  const val = document.createElement('span');
  val.textContent = value;
  row.append(lbl, val);
  const input = document.createElement('input');
  input.type = 'range';
  input.style.cssText = 'width:100%;';
  wrap.append(row, input);
  return { el: wrap, input };
}