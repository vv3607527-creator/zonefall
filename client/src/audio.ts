// audio.ts — procedural WebAudio SFX with zero assets: shots, hits,
// footsteps, pickups, zone warnings, kills. Every sound is synthesized
// from oscillators + a shared noise buffer, so nothing needs loading and
// the whole engine is a few hundred bytes of state.

type OscType = OscillatorType;

const NOISE_SECONDS = 1;
const NOISE_LP = 2400;

export class AudioFX {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private volume = 0.6;

  /** Create the context on the first user gesture (browser autoplay gate). */
  unlock(): void {
    if (this.ctx) return;
    const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    this.noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate * NOISE_SECONDS, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  /** Attack/decay envelope routed to the master. Returns null before unlock. */
  private env(dur: number): GainNode | null {
    if (!this.ctx || !this.master) return null;
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(this.master);
    return g;
  }

  private osc(type: OscType, f0: number, f1: number, dur: number): void {
    if (!this.ctx) return;
    const g = this.env(dur);
    if (!g) return;
    const o = this.ctx.createOscillator();
    o.type = type;
    const t = this.ctx.currentTime;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    o.connect(g);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(dur: number, lp = NOISE_LP): void {
    if (!this.ctx || !this.noiseBuf) return;
    const g = this.env(dur);
    if (!g) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = lp;
    src.connect(filt);
    filt.connect(g);
    const t = this.ctx.currentTime;
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  // ---- One-shot SFX -----------------------------------------------------
  shot(heavy: boolean): void {
    this.noise(0.12, heavy ? 900 : 1600);
    this.osc('square', heavy ? 130 : 230, 40, 0.1);
  }

  hit(): void {
    this.noise(0.06, 3400);
  }

  headshot(): void {
    this.noise(0.09, 4200);
    this.osc('sine', 800, 1500, 0.08);
  }

  footstep(): void {
    this.noise(0.05, 520);
  }

  pickup(): void {
    this.osc('sine', 480, 960, 0.09);
  }

  zone(): void {
    this.osc('sawtooth', 300, 210, 0.35);
    this.noise(0.3, 600);
  }

  kill(): void {
    this.osc('sine', 620, 1240, 0.16);
  }

  death(): void {
    this.osc('sawtooth', 320, 55, 0.55);
  }

  explode(): void {
    this.noise(0.5, 700);
    this.osc('sine', 95, 28, 0.5);
  }
}
