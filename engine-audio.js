// Velonix engine sound, shared by the Home Engine Room (site.js) and the Lab (customize.html).
// A per-cylinder synth in an AudioWorklet: every firing is a pressure pulse sent down tuned exhaust pipes
// (a cross-plane V8 splits them into two uneven banks, which is where the burble comes from), plus intake
// roar, turbo whistle and flutter, supercharger whine, diesel clatter, the starter motor and backfires.
// Sim runs the rpm (crank, catch, rev, limiter, crackle) so both pages drive the engine the same way.
(() => {
  const WORKLET = `
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const SIZE = 8192;

// Exhaust pipe: a damped delay line with an inverted reflection at the open end
class Pipe {
  constructor() { this.buf = new Float32Array(SIZE); this.w = 0; this.lp = 0; this.d = 100; this.fb = 0.5; this.damp = 0.5; }
  run(x) {
    const v = this.buf[(this.w - this.d + SIZE) & (SIZE - 1)];
    this.lp += this.damp * (v - this.lp);
    const y = x - this.fb * this.lp;
    this.buf[this.w] = y; this.w = (this.w + 1) & (SIZE - 1);
    return y;
  }
}
// State-variable band-pass
class Band {
  constructor() { this.l = 0; this.b = 0; }
  run(x, f, q) { this.l += f * this.b; const h = x - this.l - q * this.b; this.b += f * h; return this.b; }
}

class VelonixEngine extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    const k = (name, max) => ({ name, defaultValue: 0, minValue: 0, maxValue: max, automationRate: 'k-rate' });
    return [k('rpm', 20000), k('load', 1), k('ign', 1), k('starter', 1), k('cut', 1)];
  }
  constructor() {
    super();
    const sr = sampleRate, co = s => 1 - Math.exp(-1 / (sr * s));
    this.a = { rpm: co(0.012), load: co(0.03), level: co(0.06), up: co(0.7), down: co(0.25), clat: Math.exp(-1 / (sr * 0.0007)), zap: Math.exp(-1 / (sr * 0.006)), wind: co(0.002) };
    this.p = null; this.n = 0; this.np = 1;
    this.crank = 0; this.slot = -1;
    this.rpm = 0; this.load = 0; this.level = 0; this.boost = 0; this.prevLoad = 0;
    this.pulse = []; this.cylVar = [];
    this.pipes = [new Pipe(), new Pipe()]; this.muff = [new Pipe(), new Pipe()];
    this.dcx = [0, 0]; this.dcy = [0, 0];
    this.intake = new Band(); this.hiss = new Band(); this.flutF = new Band();
    this.ph = { turbo: 0, sc: 0, st: 0, fl: 0, e1: 0, inv: 0, hum: 0, car: 0, fm: 0, sub: 0, shim: 0 };
    this.flutT = 0; this.flutLen = 0.6; this.flutAmt = 0;
    this.clat = 0; this.nPrev = 0; this.zap = 0; this.wind = 0;
    this.pops = [];
    this.seed = 0x2545f491;
    this.port.onmessage = e => {
      const d = e.data;
      if (d.profile) this.setProfile(d.profile);
      if (d.pop && this.pops.length < 8) this.pops.push({ t: 0, a: d.pop });
    };
  }
  noise() { let x = this.seed; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.seed = x; return (x >>> 0) / 2147483648 - 1; }
  setProfile(p) {
    this.p = p; this.n = p.cyl || 0; this.np = p.pipes ? p.pipes.length : 1;
    this.pulse = Array.from({ length: this.n }, (_, i) => ({ age: 1, dur: 1, amp: 0, bank: p.banks ? p.banks[i] : i % this.np }));
    this.cylVar = Array.from({ length: this.n }, () => Math.random() * 2 - 1);
    (p.pipes || []).forEach((ms, i) => {
      const P = this.pipes[i], M = this.muff[i];
      P.d = Math.round(ms * sampleRate / 1000); P.fb = p.fb; P.damp = p.damp;
      M.d = Math.max(8, Math.round(ms * 0.29 * sampleRate / 1000)); M.fb = 0.32; M.damp = 0.6;
    });
    this.slot = -1;
  }
  fire(k, rpm, load, ign, cut) {
    const p = this.p, q = this.pulse[k];
    q.dur = clamp(120 / Math.max(rpm, 60) * p.width, 0.0006, 0.016);
    q.age = 0;
    const lope = p.lope * clamp(1 - (rpm - p.idle) / (p.idle * 2.5), 0, 1);
    let a = 1 + this.cylVar[k] * (0.06 + lope) + (Math.random() - 0.5) * 0.1;
    if (!ign) a *= 0.16;                                    // compression only: cranking or winding down
    else {
      a *= 0.42 + 0.58 * load;
      if (cut && Math.random() < 0.72) a *= 0.06;           // limiter fuel cut
      else if (load < 0.1 && rpm > p.idle * 1.7) {          // overrun: misfires and the odd burble pop
        if (Math.random() < 0.1) a *= 0.12;
        if (Math.random() < p.burble * 0.035 && this.pops.length < 8) this.pops.push({ t: 0, a: 0.12 + Math.random() * 0.25 });
      }
      if (p.diesel) this.clat = Math.min(1.5, this.clat + a * (0.5 + 0.5 * load));
    }
    q.amp = a;
  }
  process(inputs, outputs, P) {
    const out = outputs[0], L = out[0], R = out[1] || out[0], N = L.length, p = this.p;
    if (!p) { L.fill(0); if (R !== L) R.fill(0); return true; }
    const sr = sampleRate, dt = 1 / sr, a = this.a, ph = this.ph;
    const tRpm = P.rpm[0], tLoad = P.load[0], ign = P.ign[0] > 0.5, starter = P.starter[0] > 0.5, cut = P.cut[0] > 0.5;
    const limit = p.limit, kind = p.kind;
    // lifting off with boost up: compressor flutter (or a diesel's blow-off hiss)
    if (p.turbo && this.prevLoad > 0.5 && tLoad < 0.2 && this.boost > 0.35) { this.flutLen = this.flutT = p.bov ? 0.45 : 0.6; this.flutAmt = this.boost; }
    this.prevLoad = tLoad;
    const bp = fc => 2 * Math.sin(Math.PI * Math.min(fc, sr / 7) / sr);

    for (let i = 0; i < N; i++) {
      this.rpm += (tRpm - this.rpm) * a.rpm;
      this.load += (tLoad - this.load) * a.load;
      const rpm = this.rpm, load = this.load, frac = rpm / limit, nz = this.noise();
      let l = 0, r = 0, extra = 0, crack = 0;

      // backfires: an impulse fed into the pipes so it rings like the real exhaust, plus a dry crack
      let pop = 0;
      for (let j = this.pops.length - 1; j >= 0; j--) {
        const o = this.pops[j];
        pop += o.a * Math.exp(-o.t / 0.0016) * (0.55 + 0.45 * this.noise());
        crack += o.a * Math.exp(-o.t / 0.005) * this.noise();
        o.t += dt;
        if (o.t > 0.06) { this.pops[j] = this.pops[this.pops.length - 1]; this.pops.pop(); }
      }

      if (kind === 'combustion') {
        const n = this.n;
        this.crank += rpm / 120 * dt;                       // position in the 720° four-stroke cycle
        if (this.crank >= 1) this.crank -= 1;
        const slot = Math.floor(this.crank * n);
        if (slot !== this.slot) { this.slot = slot; if (rpm > 30) this.fire(slot, rpm, load, ign, cut); }

        let b0 = 0, b1 = 0, env = 0;
        for (let k = 0; k < n; k++) {
          const q = this.pulse[k];
          if (q.age >= q.dur) continue;
          const x = q.age / q.dur; q.age += dt;
          const s = (x < 0.1 ? x * 10 : (1 - x) * (1 - x) * 1.235) * q.amp;
          env += s;
          const v = s * (1 + p.noise * (0.5 + load) * nz);
          if (q.bank) b1 += v; else b0 += v;
        }
        b0 += pop * 2.4; if (this.np > 1) b1 += pop * 2.4;
        // DC blockers (pulses are one-sided pressure)
        let y0 = b0 - this.dcx[0] + 0.995 * this.dcy[0]; this.dcx[0] = b0; this.dcy[0] = y0;
        const e0 = this.muff[0].run(this.pipes[0].run(y0));
        if (this.np > 1) {
          const y1 = b1 - this.dcx[1] + 0.995 * this.dcy[1]; this.dcx[1] = b1; this.dcy[1] = y1;
          const e1 = this.muff[1].run(this.pipes[1].run(y1));
          l = e0 * 0.82 + e1 * 0.38; r = e1 * 0.82 + e0 * 0.38;   // the two banks sit a little apart
        } else l = r = e0;

        // induction roar: band-passed air noise that rides the firing pulses
        extra += this.intake.run(nz, bp(180 + rpm * 0.16 * p.intakeMul), 0.35) * (0.15 + env * 0.6) * load * (0.25 + frac) * p.intake;

        if (p.turbo) {
          const bt = load * clamp((frac - 0.22) / 0.5, 0, 1);
          this.boost += (bt - this.boost) * (bt > this.boost ? a.up : a.down);
          const b = this.boost;
          ph.turbo += (p.turboHz[0] + p.turboHz[1] * b) * dt; if (ph.turbo > 1) ph.turbo -= 1;
          extra += Math.sin(TAU * ph.turbo) * 0.022 * b * b + this.hiss.run(nz, bp(5200), 0.8) * 0.035 * b;
        }
        if (this.flutT > 0) {
          this.flutT -= dt;
          const fe = this.flutT / this.flutLen;
          let s = this.flutF.run(nz, bp(p.bov ? 2600 : 1150), 0.45);
          if (!p.bov) { ph.fl += (12 + 14 * fe) * dt; const am = 0.5 + 0.5 * Math.sin(TAU * ph.fl); s *= am * am * am * 2; }
          extra += s * fe * this.flutAmt * 0.6;
        }
        if (p.blower) {
          ph.sc += rpm / 60 * p.blower * dt; if (ph.sc > 1) ph.sc -= 1;
          extra += (Math.sin(TAU * ph.sc) + 0.3 * Math.sin(2 * TAU * ph.sc)) * (0.006 + 0.032 * load * Math.min(1, frac));
        }
        if (p.diesel) { extra += (nz - this.nPrev) * this.clat * 0.16; this.clat *= a.clat; }
        if (starter) {
          const comp = Math.sin(TAU * this.crank * n);     // each compression stroke loads the starter
          ph.st += (118 + 22 * comp) * dt; if (ph.st > 1) ph.st -= 1;
          extra += ((2 * ph.st - 1) * 0.09 + Math.sin(TAU * ph.st * 4) * 0.03 + nz * 0.02) * (0.75 + 0.25 * comp);
        }
      } else if (kind === 'electric') {
        const fr = clamp(frac, 0, 1.2), on = ign ? 1 : 0;
        ph.e1 += (40 + fr * 1500) * dt; if (ph.e1 > 1) ph.e1 -= 1;
        let s = (Math.sin(TAU * ph.e1) * 0.5 + Math.sin(2 * TAU * ph.e1) * 0.22 + Math.sin(3 * TAU * ph.e1 + 0.3) * 0.12) * (0.2 + 0.8 * load) * Math.min(1, fr * 6);
        ph.inv += 520 * (1 + Math.floor(fr * 5)) * dt; if (ph.inv > 1) ph.inv -= 1;      // stepped inverter tones
        s += Math.sin(TAU * ph.inv) * 0.07 * load * (fr < 0.6 ? 1 : 0.35);
        this.wind += (nz - this.wind) * a.wind; s += this.wind * fr * fr * 2.2;
        ph.hum += 100 * dt; if (ph.hum > 1) ph.hum -= 1;
        s += Math.sin(TAU * ph.hum) * 0.05 * on;
        l = r = s;
      } else {
        // dark matter core: an FM drone that climbs with the revs, a beating sub, shimmer and arcing zaps
        const fr = clamp(frac, 0, 1.2), f0 = 32 + fr * 180;
        ph.car += f0 * dt; if (ph.car > 1) ph.car -= 1;
        ph.fm += f0 * 1.503 * dt; if (ph.fm > 1) ph.fm -= 1;
        ph.sub += (f0 * 0.5 + 0.7) * dt; if (ph.sub > 1) ph.sub -= 1;
        ph.shim += f0 * 6.02 * dt; if (ph.shim > 1) ph.shim -= 1;
        const idx = 1.5 + load * 3.5 + fr * 2;
        let s = Math.sin(TAU * ph.car + idx * Math.sin(TAU * ph.fm)) * 0.5 + Math.sin(TAU * ph.sub) * 0.4 + Math.sin(TAU * ph.shim) * 0.06 * (0.3 + load);
        if (Math.random() < dt * (3 + 40 * load * fr)) this.zap = 0.6 + Math.random() * 0.4;
        s += this.zap * (nz - this.nPrev) * 0.8; this.zap *= a.zap;
        l = r = s;
      }
      this.nPrev = nz;

      // loudness follows revs and throttle, like a real engine
      // (the electric cores go quiet with the ignition; a combustion engine chugs on as it winds down)
      const live = kind === 'combustion' ? rpm > 30 || starter : ign;
      const lt = live ? 0.32 + 0.38 * load + 0.3 * Math.min(1, frac) : 0;
      this.level += (lt - this.level) * a.level;
      // idle and low revs get a lift so they still carry on small speakers
      const g = this.level * p.gain * (1 + 1.2 * (1 - Math.min(1, frac * 2.5))), c = extra + crack * 0.35;
      L[i] = Math.tanh((l + c) * g);
      if (R !== L) R[i] = Math.tanh((r + c) * g);
    }
    return true;
  }
}
registerProcessor('velonix-engine', VelonixEngine);
`;

  const CROSS_PLANE = [0, 1, 1, 0, 1, 0, 0, 1];  // bank of each firing in the 1-8-4-3-6-5-7-2 order
  const PROFILES = {
    v8tt:     { kind: 'combustion', cyl: 8, banks: CROSS_PLANE, pipes: [3.4, 4.1], fb: 0.5, damp: 0.42, width: 0.11, noise: 0.35, lope: 0.18, intake: 0.6, intakeMul: 1, turbo: 1, turboHz: [1800, 6200], burble: 1, rasp: 0.25, gain: 0.55, lp: [700, 4200] },
    v12:      { kind: 'combustion', cyl: 12, pipes: [2.1, 2.35], fb: 0.42, damp: 0.35, width: 0.075, noise: 0.22, lope: 0.03, intake: 1, intakeMul: 1.6, burble: 0.5, rasp: 0.7, gain: 0.42, lp: [1100, 7000] },
    scv8:     { kind: 'combustion', cyl: 8, banks: CROSS_PLANE, pipes: [4.6, 5.3], fb: 0.56, damp: 0.5, width: 0.13, noise: 0.42, lope: 0.32, intake: 0.5, intakeMul: 1, blower: 31, burble: 1.3, rasp: 0.1, gain: 0.6, lp: [550, 3200] },
    diesel6:  { kind: 'combustion', cyl: 6, pipes: [7.2], fb: 0.5, damp: 0.55, width: 0.16, noise: 0.5, lope: 0.06, intake: 0.4, intakeMul: 1, turbo: 1, turboHz: [900, 3200], bov: 1, diesel: 1, burble: 0, rasp: 0.2, gain: 0.6, lp: [450, 2600] },
    i4:       { kind: 'combustion', cyl: 4, pipes: [1.5], fb: 0.5, damp: 0.3, width: 0.08, noise: 0.55, lope: 0.04, intake: 1.3, intakeMul: 2.2, burble: 0.8, rasp: 0.9, gain: 0.36, lp: [1200, 8000] },
    electric: { kind: 'electric', gain: 0.6, rasp: 0.3, lp: [3000, 9000] },
    core:     { kind: 'core', gain: 0.6, rasp: 0.2, lp: [1500, 6000] }
  };

  // Per vehicle: sound picks the voice above, up is how fast it spins up under throttle, crank how long the starter turns.
  // max/step lay out the Engine Room's rev counter.
  const ENGINES = {
    spectre:  { label: 'Twin-turbo V8',   sound: 'v8tt',    idle: 850,  limit: 7800,  max: 9000,  step: 1000, up: 2.6 },
    vortex:   { label: 'V12',             sound: 'v12',     idle: 1000, limit: 9200,  max: 10000, step: 1000, up: 3.4 },
    behemoth: { label: 'Supercharged V8', sound: 'scv8',    idle: 750,  limit: 6800,  max: 8000,  step: 1000, up: 2.0 },
    hauler:   { label: 'Inline-6 diesel', sound: 'diesel6', idle: 600,  limit: 2300,  max: 3000,  step: 500,  up: 1.5, crank: 0.9, flare: 1.4 },
    titan:    { label: 'Inline-4',        sound: 'i4',      idle: 1300, limit: 13000, max: 14000, step: 2000, up: 4.6, crank: 0.4 }
  };
  // The Lab's alternative power cores
  const CORES = {
    electric:   { label: 'Ion Drive',        sound: 'electric', idle: 0,    limit: 16000, max: 16000, step: 2000, up: 2.2, crank: 0, limiter: false, pops: false },
    antimatter: { label: 'Dark Matter Core', sound: 'core',     idle: 1500, limit: 9000,  max: 10000, step: 1000, up: 2.4, crank: 0, limiter: false, pops: false, flare: 2.4 }
  };

  // Short garage reverb so it sounds like a room, not a plugin
  function garageIR(ctx) {
    const len = Math.round(ctx.sampleRate * 0.9), buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) { const t = i / len; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3) * (i < 90 ? i / 90 : 1); }
    }
    return buf;
  }

  class Engine {
    constructor(ctx) {
      this.ctx = ctx;
      this.node = new AudioWorkletNode(ctx, 'velonix-engine', { numberOfInputs: 0, outputChannelCount: [2] });
      this.prm = {};
      for (const k of ['rpm', 'load', 'ign', 'starter', 'cut']) this.prm[k] = this.node.parameters.get(k);
      this.low = ctx.createBiquadFilter(); this.low.type = 'lowshelf'; this.low.frequency.value = 110;
      this.high = ctx.createBiquadFilter(); this.high.type = 'highshelf'; this.high.frequency.value = 2600;
      this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.Q.value = 0.7;
      this.output = ctx.createGain();
      const verb = ctx.createConvolver(), wet = ctx.createGain();
      verb.buffer = garageIR(ctx); wet.gain.value = 0.14;
      this.node.connect(this.low); this.low.connect(this.high); this.high.connect(this.lp);
      this.lp.connect(this.output); this.lp.connect(verb); verb.connect(wet); wet.connect(this.output);
      this.lpMul = 1;
    }
    // spec carries idle/limit so the synth knows where the revs sit
    setProfile(name, spec, tone) {
      this.profile = Object.assign({}, PROFILES[name] || PROFILES.v8tt, { idle: spec.idle || 800, limit: spec.limit || 8000 });
      this.node.port.postMessage({ profile: this.profile });
      this.setTone(tone || this.tone);
    }
    // exhaust options in the Lab: loud = output level, rasp = brighter top end, deep = more low end and a darker tone
    setTone(tone = {}) {
      const t = this.ctx.currentTime, p = this.profile || PROFILES.v8tt, { loud = 1, rasp = 0, deep = 0 } = tone;
      this.tone = tone;
      this.low.gain.setTargetAtTime(4 + deep * 5, t, 0.1);
      this.high.gain.setTargetAtTime((p.rasp || 0) * 6 + rasp * 6, t, 0.1);
      this.output.gain.setTargetAtTime(loud, t, 0.1);
      this.lpMul = (1 - deep * 0.25) * (1 + rasp * 0.3);
    }
    set({ rpm = 0, load = 0, ign = false, starter = false, cut = false }) {
      const p = this.profile; if (!p) return;
      const t = this.ctx.currentTime, frac = Math.min(1.1, rpm / p.limit);
      this.prm.rpm.setValueAtTime(rpm, t); this.prm.load.setValueAtTime(load, t);
      this.prm.ign.setValueAtTime(ign ? 1 : 0, t); this.prm.starter.setValueAtTime(starter ? 1 : 0, t); this.prm.cut.setValueAtTime(cut ? 1 : 0, t);
      this.lp.frequency.setTargetAtTime(Math.min(16000, (p.lp[0] + frac * p.lp[1] + load * 1800) * this.lpMul), t, 0.05);
    }
    pop(strength) { this.node.port.postMessage({ pop: strength }); }
    // power-on chime for the electric cores (they have no starter to crank)
    chime(dark) {
      const c = this.ctx, t = c.currentTime;
      (dark ? [110, 165, 220] : [660, 880, 1320]).forEach((fr, i) => {
        const o = c.createOscillator(), g = c.createGain(), t0 = t + i * 0.09;
        o.type = dark ? 'sawtooth' : 'sine'; o.frequency.setValueAtTime(fr * 0.94, t0); o.frequency.exponentialRampToValueAtTime(fr, t0 + 0.12);
        g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(dark ? 0.06 : 0.08, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.7);
        o.connect(g); g.connect(this.lp); o.start(t0); o.stop(t0 + 0.75);
      });
    }
  }

  async function create(ctx) {
    if (!ctx.audioWorklet || typeof AudioWorkletNode === 'undefined') return null;
    if (!ctx._velonix) ctx._velonix = ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' })));
    try { await ctx._velonix; } catch (e) { console.warn('Engine sound unavailable', e); return null; }
    return new Engine(ctx);
  }

  // rpm model: crank on the starter, catch and flare, rev under throttle, bounce off the limiter, crackle on lift-off
  class Sim {
    constructor(spec) { this.rpm = 0; this.started = false; this.ign = false; this.hold = false; this.force = null; this.crankT = 0; this.flareT = 0; this.limitT = 0; this.crackle = 0; this.engine = null; this.onPop = null; this.configure(spec); }
    configure(spec) {
      if (this.spec && this.rpm) this.rpm = this.rpm / this.spec.limit * spec.limit;
      this.spec = Object.assign({ crank: 0.55, flare: 1.6, limiter: true, pops: true }, spec);
    }
    attach(engine) { this.engine = engine; }
    start() {
      if (this.started) return;
      this.started = true;
      if (this.spec.crank > 0 && this.rpm < this.spec.idle * 0.5) { this.crankT = this.spec.crank; this.ign = false; }
      else { this.ign = true; this.flareT = this.rpm < this.spec.idle * 0.5 ? 0.5 : 0; }
    }
    stop() { this.started = false; this.ign = false; this.hold = false; this.force = null; this.crankT = 0; this.crackle = 0; }
    throttle(on) {
      if (!on && this.hold && this.spec.pops && this.rpm > this.spec.limit * 0.55) this.crackle = 0.45 + this.rpm / this.spec.limit * 0.6;
      this.hold = on;
    }
    crack(strength) { if (this.engine) this.engine.pop(strength); if (this.onPop) this.onPop(strength); }
    step(dt) {
      const s = this.spec;
      let target = 0;
      if (this.crankT > 0) {
        this.crankT -= dt; target = 240;
        if (this.crankT <= 0) { this.crankT = 0; this.ign = true; this.flareT = 0.5; }
      } else if (this.started) {
        target = s.idle;
        if (this.flareT > 0) { this.flareT -= dt; target = Math.max(s.idle * s.flare, 400); }
        if (this.hold) target = s.limit * (s.limiter ? 1.08 : 1);
        if (this.force !== null) target = this.force;
      }
      const rate = target > this.rpm ? (this.crankT > 0 ? 8 : s.up) : this.ign ? 1.6 : 1.1;
      this.rpm += (target - this.rpm) * Math.min(1, rate * dt);
      if (s.limiter && this.ign && this.rpm >= s.limit) {
        // limiter: cut and bounce, with a bang now and then
        this.rpm = s.limit * (0.93 + Math.random() * 0.03);
        this.limitT = 0.14;
        if (s.pops && Math.random() < 0.35) this.crack(0.5);
      }
      this.limitT -= dt;
      if (this.crackle > 0) {
        this.crackle -= dt;
        if (Math.random() < dt * 16) this.crack(0.35 + Math.random() * 0.6);
      }
      if (!this.started && this.rpm < 5) this.rpm = 0;
      this.load = this.started && this.ign && (this.hold || this.force !== null) ? 1 : 0;
      if (this.engine) this.engine.set({ rpm: this.rpm, load: this.load, ign: this.ign, starter: this.crankT > 0, cut: this.limitT > 0 });
    }
  }

  window.VelonixAudio = { PROFILES, ENGINES, CORES, create, Sim };
})();
