// Звукова система: усе синтезується програмно через Web Audio API (жодних зовнішніх файлів).
// Аудіо запускається лише після першої взаємодії користувача (обмеження автовідтворення в браузерах).
import type { Settings } from '../systems/types';

type MusicId = 'menu' | 'divine' | 'ceremony' | null;

class AudioSystem {
  private ctx: AudioContext | null = null;
  private master!: GainNode; private gMusic!: GainNode; private gSfx!: GainNode; private gCrowd!: GainNode;
  private noise: AudioBuffer | null = null;
  private crowdSrc: AudioBufferSourceNode | null = null; private crowdGain: GainNode | null = null; private crowdFilter: BiquadFilterNode | null = null;
  private settings: Settings = { music: 0.5, sfx: 0.8, crowd: 0.6, muted: false, lowGfx: false, speed: 1 };
  private musicId: MusicId = null; private wantMusic: MusicId = null;
  private timer: number | null = null; private step = 0; private nextT = 0;
  private chantT = 0;

  /** Викликається з обробника жесту користувача. */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    this.master = c.createGain(); this.master.connect(c.destination);
    this.gMusic = c.createGain(); this.gSfx = c.createGain(); this.gCrowd = c.createGain();
    for (const g of [this.gMusic, this.gSfx, this.gCrowd]) g.connect(this.master);
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.04 * w) / 1.04; d[i] = last * 6 + w * 0.15; }
    this.apply(this.settings);
    if (this.wantMusic) this.music(this.wantMusic);
  }

  apply(s: Settings) {
    this.settings = s;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.muted ? 0 : 1, t, 0.03);
    this.gMusic.gain.setTargetAtTime(s.music * 0.5, t, 0.05);
    this.gSfx.gain.setTargetAtTime(s.sfx, t, 0.05);
    this.gCrowd.gain.setTargetAtTime(s.crowd, t, 0.05);
  }

  suspend(on: boolean) { if (this.ctx) void (on ? this.ctx.suspend() : this.ctx.resume()); }

  // ---------- базові цеглинки ----------
  private tone(freq: number, t0: number, dur: number, type: OscillatorType, vol: number, dest: AudioNode, slideTo?: number) {
    const c = this.ctx!;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest);
    o.start(t0); o.stop(t0 + dur + 0.03);
  }

  private burst(t0: number, dur: number, vol: number, freq: number, q: number, dest: AudioNode, type: BiquadFilterType = 'bandpass', swell = false) {
    const c = this.ctx!;
    const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    if (swell) { g.gain.exponentialRampToValueAtTime(vol, t0 + dur * 0.25); g.gain.setValueAtTime(vol, t0 + dur * 0.55); }
    else g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t0, Math.random() * 1.5); src.stop(t0 + dur + 0.05);
  }

  // ---------- ефекти ----------
  sfx(name: string) {
    const c = this.ctx;
    if (!c || c.state !== 'running' || this.settings.muted) return;
    const t = c.currentTime + 0.01, S = this.gSfx, C = this.gCrowd;
    switch (name) {
      case 'kick': this.tone(170, t, 0.09, 'sine', 0.5, S, 55); this.burst(t, 0.03, 0.25, 2500, 0.8, S); break;
      case 'shot': this.tone(220, t, 0.14, 'sine', 0.8, S, 45); this.burst(t, 0.05, 0.4, 1800, 0.7, S); this.burst(t + 0.05, 0.7, 0.35, 900, 0.6, C, 'bandpass', true); break;
      case 'whistle': this.whistle(t, 0.28); break;
      case 'whistleLong': this.whistle(t, 0.3); this.whistle(t + 0.38, 0.3); this.whistle(t + 0.76, 0.75); break;
      case 'save': this.tone(130, t, 0.1, 'sine', 0.5, S, 60); this.burst(t, 0.9, 0.5, 700, 0.5, C, 'bandpass', true); break;
      case 'post': this.tone(1150, t, 0.5, 'triangle', 0.35, S); this.tone(1730, t, 0.35, 'sine', 0.2, S); this.burst(t, 0.9, 0.45, 650, 0.5, C, 'bandpass', true); break;
      case 'net': this.burst(t, 0.25, 0.3, 3500, 0.5, S, 'highpass'); break;
      case 'goal':
        this.burst(t, 3.4, 1.0, 1100, 0.35, C, 'bandpass', true); this.burst(t, 3.0, 0.6, 2400, 0.4, C, 'bandpass', true);
        [392, 494, 587, 784].forEach((f, i) => this.tone(f, t + 0.05 + i * 0.09, 0.55, 'sawtooth', 0.12, S));
        this.tone(784, t + 0.45, 0.9, 'square', 0.1, S);
        break;
      case 'groan': this.burst(t, 1.3, 0.5, 380, 0.7, C, 'bandpass', true); break;
      case 'card': this.tone(880, t, 0.09, 'square', 0.2, S); this.tone(660, t + 0.11, 0.16, 'square', 0.2, S); break;
      case 'click': this.tone(700, t, 0.04, 'triangle', 0.18, S); break;
      case 'coin': this.tone(1320, t, 0.08, 'square', 0.14, S); this.tone(1760, t + 0.07, 0.25, 'square', 0.14, S); break;
      case 'error': this.tone(180, t, 0.2, 'sawtooth', 0.18, S, 120); break;
      case 'drum':
        for (let i = 0; i < 44; i++) this.burst(t + i * 0.038, 0.035, 0.12 + i * 0.012, 240 + i * 4, 1.2, S);
        this.burst(t + 1.7, 1.2, 0.5, 6000, 0.3, S, 'highpass'); this.tone(90, t + 1.7, 0.5, 'sine', 0.8, S, 40);
        break;
      case 'reveal-rare': [523, 659, 784].forEach((f, i) => this.tone(f, t + i * 0.1, 0.6, 'triangle', 0.2, S)); break;
      case 'reveal-epic': [440, 554, 659, 880].forEach((f, i) => this.tone(f, t + i * 0.09, 0.8, 'triangle', 0.22, S)); break;
      case 'reveal-legendary': [392, 494, 587, 784, 988].forEach((f, i) => this.tone(f, t + i * 0.09, 1.0, 'sawtooth', 0.12, S)); this.burst(t, 1.0, 0.25, 5000, 0.3, S, 'highpass'); break;
      case 'reveal-mythic': [220, 277, 330, 440, 554, 660].forEach((f, i) => this.tone(f, t + i * 0.08, 1.3, 'sawtooth', 0.11, S)); this.tone(55, t, 1.6, 'sine', 0.6, S); this.burst(t, 1.6, 0.3, 1200, 0.4, S, 'bandpass', true); break;
      case 'reveal-divine': [262, 330, 392, 523, 659, 784, 1047].forEach((f, i) => { this.tone(f, t + i * 0.11, 2.2, 'triangle', 0.16, S); this.tone(f * 2, t + i * 0.11 + 0.05, 1.6, 'sine', 0.06, S); }); this.burst(t + 0.6, 2.5, 0.25, 7000, 0.3, S, 'highpass', true); break;
      case 'alert': [330, 330, 440].forEach((f, i) => this.tone(f, t + i * 0.16, 0.14, 'square', 0.16, S)); this.tone(110, t, 0.6, 'sawtooth', 0.2, S); break;
      case 'special': [660, 880, 1320].forEach((f, i) => this.tone(f, t + i * 0.07, 0.35, 'triangle', 0.18, S)); break;
    }
  }

  private whistle(t: number, dur: number) {
    const c = this.ctx!;
    const o = c.createOscillator(), o2 = c.createOscillator(), l = c.createOscillator(), lg = c.createGain(), g = c.createGain();
    o.type = 'sine'; o.frequency.value = 2850; o2.type = 'sine'; o2.frequency.value = 3020;
    l.frequency.value = 38; lg.gain.value = 90; l.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.02); g.gain.setValueAtTime(0.22, t + dur - 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); o2.connect(g); g.connect(this.gSfx);
    for (const x of [o, o2, l]) { x.start(t); x.stop(t + dur + 0.05); }
  }

  // ---------- трибуни ----------
  crowd(on: boolean) {
    const c = this.ctx;
    if (!c) return;
    if (on && !this.crowdSrc) {
      const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 650; f.Q.value = 0.35;
      const g = c.createGain(); g.gain.value = 0.0001; g.gain.setTargetAtTime(0.16, c.currentTime, 0.8);
      src.connect(f); f.connect(g); g.connect(this.gCrowd); src.start();
      this.crowdSrc = src; this.crowdGain = g; this.crowdFilter = f; this.chantT = c.currentTime + 6;
    } else if (!on && this.crowdSrc) {
      const src = this.crowdSrc, g = this.crowdGain!;
      g.gain.setTargetAtTime(0.0001, c.currentTime, 0.3);
      setTimeout(() => { try { src.stop(); src.disconnect(); g.disconnect(); } catch { /* вже зупинено */ } }, 1500);
      this.crowdSrc = null; this.crowdGain = null; this.crowdFilter = null;
    }
  }

  /** Рівень збудження трибун 0..1 (небезпечна атака — гучніше). Також запускає скандування. */
  excitement(v: number) {
    const c = this.ctx;
    if (!c || !this.crowdGain || !this.crowdFilter) return;
    this.crowdGain.gain.setTargetAtTime(0.14 + v * 0.3, c.currentTime, 0.4);
    this.crowdFilter.frequency.setTargetAtTime(600 + v * 700, c.currentTime, 0.5);
    if (c.currentTime > this.chantT && c.state === 'running') {
      this.chantT = c.currentTime + 9 + Math.random() * 9;
      // оригінальне ритмічне скандування: оплески «та-та-тататá» та гул
      const t = c.currentTime + 0.05;
      [0, 0.42, 0.84, 1.05, 1.26, 1.9, 2.32, 2.74, 2.95, 3.16].forEach((dt) => this.burst(t + dt, 0.07, 0.22, 1700, 0.9, this.gCrowd));
      [0, 1.9].forEach((dt) => { this.tone(196, t + dt, 1.2, 'sawtooth', 0.025, this.gCrowd); this.tone(247, t + dt, 1.2, 'sawtooth', 0.02, this.gCrowd); });
    }
  }

  // ---------- музика (оригінальні секвенції) ----------
  music(id: MusicId) {
    this.wantMusic = id;
    if (!this.ctx) return;
    if (id === this.musicId) return;
    this.musicId = id;
    if (this.timer != null) { clearInterval(this.timer); this.timer = null; }
    if (!id) return;
    this.step = 0; this.nextT = this.ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 90);
  }

  private schedule() {
    const c = this.ctx;
    if (!c || !this.musicId || c.state !== 'running') return;
    const M = this.gMusic;
    const defs = {
      menu: { bpm: 118, bass: [110, 110, 131, 131, 87, 87, 98, 98], lead: [659, 0, 784, 659, 587, 0, 523, 587, 659, 0, 880, 784, 659, 587, 523, 0, 523, 0, 659, 523, 440, 0, 392, 440, 494, 0, 587, 494, 440, 392, 494, 0] },
      divine: { bpm: 84, bass: [131, 131, 165, 165, 175, 175, 196, 196], lead: [523, 659, 784, 1047, 784, 659, 784, 1047, 659, 784, 988, 1319, 988, 784, 988, 1319, 698, 880, 1047, 1397, 1047, 880, 1047, 1397, 784, 988, 1175, 1568, 1175, 988, 1175, 1568] },
      ceremony: { bpm: 126, bass: [131, 131, 175, 175, 196, 196, 131, 131], lead: [523, 523, 523, 659, 784, 0, 784, 0, 698, 698, 698, 880, 1047, 0, 1047, 0, 784, 784, 784, 988, 1175, 0, 988, 784, 1047, 0, 784, 659, 523, 0, 0, 0] },
    } as const;
    const d = defs[this.musicId];
    const sp = 60 / d.bpm / 2; // восьмі
    while (this.nextT < c.currentTime + 0.25) {
      const i = this.step % 32, t = this.nextT;
      const b = d.bass[Math.floor(i / 4)];
      if (i % 2 === 0) this.tone(b, t, sp * 1.6, 'triangle', 0.3, M);
      if (this.musicId !== 'divine') { if (i % 4 === 0) this.tone(120, t, 0.12, 'sine', 0.5, M, 45); if (i % 4 === 2) this.burst(t, 0.06, 0.12, 3000, 0.6, M, 'highpass'); }
      else if (i % 8 === 0) this.tone(b * 2, t, sp * 7, 'sine', 0.12, M);
      const n = d.lead[i];
      if (n) { this.tone(n, t, sp * (this.musicId === 'divine' ? 2.4 : 1.1), this.musicId === 'menu' ? 'square' : 'triangle', this.musicId === 'menu' ? 0.07 : 0.14, M); if (this.musicId === 'ceremony') this.tone(n * 1.5, t, sp, 'sawtooth', 0.04, M); }
      this.nextT += sp; this.step++;
    }
  }
}

export const audio = new AudioSystem();
