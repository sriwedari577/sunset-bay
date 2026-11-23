// Synthesized WebAudio: no audio files, everything is oscillators and
// filtered noise. The context is created on the first user gesture, and
// every method no-ops safely before that (headless probes included).
export class Sound {
  constructor() {
    this.ctx = null;
    this.sirenNodes = null;
    this.master = null;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return this.ctx;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.32;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  unlock() { this.ensure(); }

  tone(freq, dur, type = 'sine', vol = 0.5, slideTo = null, delay = 0) {
    const ctx = this.ensure();
    if (!ctx) return;
    try {
      const t0 = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(g); g.connect(this.master);
      osc.start(t0); osc.stop(t0 + dur + 0.02);
    } catch { /* audio is garnish, never fatal */ }
  }

  noise(dur, vol = 0.5, filterFreq = 1200, delay = 0) {
    const ctx = this.ensure();
    if (!ctx) return;
    try {
      const t0 = ctx.currentTime + delay;
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = filterFreq;
      const g = ctx.createGain();
      g.gain.value = vol;
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(t0);
    } catch { /* ignore */ }
  }

  gunshot() { this.noise(0.14, 0.7, 2400); this.tone(140, 0.09, 'square', 0.25, 50); }
  punch() { this.noise(0.08, 0.5, 500); this.tone(95, 0.08, 'sine', 0.5, 45); }
  thud() { this.tone(70, 0.16, 'sine', 0.6, 35); }
  hurt() { this.tone(220, 0.12, 'sawtooth', 0.3, 110); }
  click() { this.tone(1800, 0.03, 'square', 0.12); }
  carDoor() { this.noise(0.07, 0.35, 900); this.tone(160, 0.06, 'sine', 0.3, 80); }
  pickup() { this.tone(660, 0.1, 'sine', 0.4); this.tone(880, 0.12, 'sine', 0.4, null, 0.09); this.tone(1320, 0.16, 'sine', 0.35, null, 0.18); }
  missionStart() { this.tone(392, 0.14, 'triangle', 0.4); this.tone(523, 0.2, 'triangle', 0.4, null, 0.12); }
  missionDone() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.4, null, i * 0.11)); }

  siren(on) {
    const ctx = this.ensure();
    if (!ctx) return;
    try {
      if (on && !this.sirenNodes) {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = 700;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.8;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 220;
        lfo.connect(lfoGain); lfoGain.connect(osc.frequency);
        const g = ctx.createGain();
        g.gain.value = 0.05;
        osc.connect(g); g.connect(this.master);
        osc.start(); lfo.start();
        this.sirenNodes = { osc, lfo, g };
      } else if (!on && this.sirenNodes) {
        const { osc, lfo, g } = this.sirenNodes;
        g.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
        setTimeout(() => { try { osc.stop(); lfo.stop(); } catch { /* already stopped */ } }, 300);
        this.sirenNodes = null;
      }
    } catch { /* ignore */ }
  }
}
