// Sunset Bay — every sound is synthesized with WebAudio: no audio files,
// no network. Engine hum, sirens, shots, pickups and a lazy sunset groove.
export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenLfo = null;
    this.musicTimer = null;
    this.musicStep = 0;
    this.noiseBuf = null;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
    } catch { return false; }
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 0.5;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return true;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.55;
  }

  blip(freq, dur, type = 'sine', vol = 0.2, slideTo = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  noise(dur, vol, filterFreq, type = 'lowpass') {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
  }

  click() { this.blip(720, 0.07, 'triangle', 0.16); }
  pickup() { this.blip(660, 0.09, 'sine', 0.22); setTimeout(() => this.blip(990, 0.12, 'sine', 0.22), 70); }
  punch() { this.noise(0.09, 0.3, 500); this.blip(140, 0.08, 'sine', 0.25, 70); }
  shot() { this.noise(0.14, 0.5, 2600, 'highpass'); this.blip(180, 0.1, 'square', 0.2, 60); }
  crash() { this.noise(0.35, 0.45, 300); }
  reload() { this.blip(440, 0.06, 'square', 0.12); setTimeout(() => this.blip(560, 0.06, 'square', 0.12), 90); }
  sting(win) {
    const notes = win ? [523, 659, 784, 1047] : [392, 330, 262, 196];
    notes.forEach((n, i) => setTimeout(() => this.blip(n, 0.22, 'triangle', 0.22), i * 110));
  }
  phone() { this.blip(880, 0.12, 'sine', 0.2); setTimeout(() => this.blip(880, 0.12, 'sine', 0.2), 180); }

  engine(on, speed01) {
    if (!this.ctx) return;
    if (!on) {
      if (this.engineGain) this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      return;
    }
    if (!this.engineOsc) {
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 420;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();
    }
    const t = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(55 + speed01 * 130, t, 0.08);
    this.engineGain.gain.setTargetAtTime(0.05 + speed01 * 0.1, t, 0.1);
  }

  siren(on) {
    if (!this.ctx) return;
    if (!on) {
      if (this.sirenGain) this.sirenGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
      return;
    }
    if (!this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 750;
      this.sirenLfo = this.ctx.createOscillator();
      this.sirenLfo.frequency.value = 1.4;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 160;
      this.sirenLfo.connect(lfoGain);
      lfoGain.connect(this.sirenOsc.frequency);
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      this.sirenLfo.start();
    }
    this.sirenGain.gain.setTargetAtTime(0.05, this.ctx.currentTime, 0.15);
  }

  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    // A slow two-chord sunset groove: warm bass notes and soft hats.
    const bass = [110, 110, 130.8, 98, 110, 110, 146.8, 130.8];
    const hats = [0, 1, 0, 1, 0, 1, 0, 1];
    this.musicTimer = setInterval(() => {
      if (!this.ctx) return;
      const step = this.musicStep++ % 8;
      this.blip(bass[step], 0.42, 'triangle', 0.1);
      if (hats[step]) this.noise(0.04, 0.05, 7000, 'highpass');
      if (step === 0) this.blip(220, 0.6, 'sine', 0.05);
      if (step === 4) this.blip(277, 0.6, 'sine', 0.05);
    }, 340);
  }

  stopMusic() {
    if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
  }
}
