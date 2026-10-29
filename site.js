// Velonix Home (index.html): drives the live 3D studio behind the page.
// The studio is customize.html?showroom=1 in a same-origin iframe; its window.velonix API
// moves the camera (show/nudge/scrub/kick), swaps vehicles and runs the wheels. Customizing stays in the Lab.
(() => {
  const root = document.documentElement;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = () => innerWidth <= 760;
  const fmt = n => '$' + Math.round(n).toLocaleString('en-US');
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };

  // Kept here too so the page (and the Engine Room) works before or without the 3D studio
  const MODELS = {
    spectre:  { name: 'Velonix Spectre',    short: 'Spectre',  type: 'car' },
    vortex:   { name: 'Apex Vortex',        short: 'Vortex',   type: 'car' },
    behemoth: { name: 'Cyberdyne Behemoth', short: 'Behemoth', type: 'car' },
    hauler:   { name: 'Cyber Hauler',       short: 'Hauler',   type: 'truck' },
    titan:    { name: 'Titan Edge Bike',    short: 'Titan',    type: 'bike' }
  };
  const ORDER = Object.keys(MODELS);

  // Camera goals per section (see driveShowroom in customize.html). x/y slide the vehicle across the screen.
  const PRESETS = {
    hero:   { az: 0.85, el: 0.23, dist: 1.0,  ty: 0, x: 0.19, y: 0.03, drift: 0.1 },
    about:  { az: 1.2,  el: 0.24, dist: 1.1,  ty: 0, x: 0.2,  y: 0,    drift: 0.05 },
    engine: { az: 0.5,  el: 0.07, dist: 1.2,  ty: 0, x: -0.2, y: 0.02, drift: 0.03 },
    lab:    { az: -2.3, el: 0.2,  dist: 1.15, ty: 0, x: 0.26, y: 0,    drift: 0.08 }
  };
  const MOBILE = {
    hero: { x: 0, y: 0.15 },
    about: { x: 0, y: -0.2 }, engine: { x: 0, y: -0.3, dist: 1.6 }, lab: { x: 0, y: -0.22 }
  };
  const TYPE_DIST = { bike: 1.3 };  // the bike's fit radius is tall for its length, so pull back a little
  const RAIL_MS = 9000;

  let V = null;               // studio API once ready
  let modelId = 'spectre';
  let chapter = 'hero';
  let railP = 0, railStopped = reduce;

  /* ---------- split text ---------- */
  $$('.split-text').forEach(el => {
    const parent = el.closest('.hero-title') || el;
    const start = parent._ci || 0;
    let i = 0;
    const text = el.textContent;
    // words stay unbreakable so lines only wrap between them
    el.innerHTML = text.split(' ').map(w => `<span class="word">${[...w].map(ch => `<span class="char" style="--ci:${start + i++}">${ch}</span>`).join('')}</span>`).join('<span class="space"> </span>');
    parent._ci = start + i + 3;
    el.setAttribute('aria-label', text);
  });

  /* ---------- theme ---------- */
  const toggle = $('[data-theme-toggle]');
  function paintToggle() {
    const light = root.dataset.theme === 'light';
    toggle.setAttribute('aria-pressed', String(light));
    toggle.title = light ? 'Switch to dark theme' : 'Switch to light theme';
    toggle.innerHTML = `<span aria-hidden="true">${light ? '☾' : '☼'}</span><span class="theme-label">${light ? 'Dark' : 'Light'}</span>`;
  }
  paintToggle();
  toggle.addEventListener('click', () => {
    const light = root.dataset.theme !== 'light';
    root.dataset.theme = light ? 'light' : 'dark';
    try { localStorage.setItem('velonix-theme', root.dataset.theme); } catch (e) {}
    document.cookie = 'velonix-theme=' + root.dataset.theme + '; path=/; max-age=31536000; SameSite=Lax';
    paintToggle();
    if (V) { V.theme(light); applyChapter(chapter); }
  });
  const themeEnv = () => root.dataset.theme === 'light' ? 1 : 0;

  /* ---------- smooth scroll ---------- */
  const lenis = window.Lenis && !reduce ? new Lenis({ lerp: 0.09, smoothWheel: true }) : null;
  if (lenis) lenis.stop();
  $$('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
    const id = a.getAttribute('href');
    const target = id === '#top' ? 0 : $(id);
    if (target === null) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(target, { duration: 1.5 });
    else if (target === 0) scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    else target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
  }));

  /* ---------- boot ---------- */
  const bootBar = $('.boot-bar span'), bootPct = $('[data-boot-pct]'), bootStep = $('[data-boot-step]');
  const bootStart = performance.now();
  let booted = false, bootRaf;
  function bootTick(now) {
    const t = (now - bootStart) / 1000, pct = V ? 100 : 90 * (1 - Math.exp(-t / 2.2));
    bootBar.style.transform = `scaleX(${pct / 100})`;
    bootPct.textContent = Math.round(pct) + '%';
    bootStep.textContent = V ? 'Studio online' : pct < 30 ? 'Linking 3D studio' : pct < 60 ? 'Compiling shaders' : pct < 82 ? 'Building vehicle' : 'Materializing';
    if (!booted && !V) bootRaf = requestAnimationFrame(bootTick);
  }
  bootRaf = requestAnimationFrame(bootTick);
  function endBoot() {
    if (booted) return;
    booted = true;
    cancelAnimationFrame(bootRaf);
    root.classList.remove('booting');
    root.classList.add('go');
    if (lenis) lenis.start();
  }
  // Slow device or no WebGL: show the poster and let the page through; the studio fades in if it arrives later
  const bootTimeout = setTimeout(() => { if (!V) { root.classList.add('no3d'); endBoot(); } }, 9000);

  /* ---------- studio bridge ---------- */
  const frame = $('#studio');
  function studioApi() { try { const v = frame.contentWindow.velonix; return v && v.ready ? v : null; } catch (e) { return null; } }
  function onReady() {
    if (V) return;
    V = studioApi(); if (!V) return;
    clearTimeout(bootTimeout);
    root.classList.remove('no3d');
    root.classList.add('studio-ready');
    if (V.state.model.id !== modelId) V.setModel(V.models.find(m => m.id === modelId));
    updateHud(true); applyChapter(chapter);
    bootTick(performance.now());
    setTimeout(endBoot, 450);
  }
  function onFail() { clearTimeout(bootTimeout); root.classList.add('no3d'); endBoot(); }
  addEventListener('message', e => {
    if (e.origin !== location.origin || !e.data) return;
    if (e.data.velonix === 'ready') onReady();
    else if (e.data.velonix === 'error') onFail();
  });
  frame.addEventListener('load', () => { if (studioApi()) onReady(); });

  function applyChapter(name) {
    if (!V) return;
    const p = Object.assign({}, PRESETS[name], isMobile() ? MOBILE[name] : null);
    if (p.dist) p.dist *= TYPE_DIST[MODELS[modelId].type] || 1;
    V.show(p);
    V.set(EN.busy() ? { env: themeEnv() } : { env: themeEnv(), lights: 'drl', drive: false });
  }

  /* ---------- text effects ---------- */
  const GLYPHS = '<>/\\[]{}=+*#_-01ABCDEFXV';
  function decode(el, text) {
    cancelAnimationFrame(el._dec);
    if (reduce) { el.textContent = text; return; }
    const start = performance.now(), dur = 420 + text.length * 22;
    const step = now => {
      const p = Math.min(1, (now - start) / dur);
      el.textContent = p < 1 ? [...text].map((c, i) => c === ' ' || i / text.length < p * 1.2 - 0.15 ? c : GLYPHS[(Math.random() * GLYPHS.length) | 0]).join('') : text;
      if (p < 1) el._dec = requestAnimationFrame(step);
    };
    el._dec = requestAnimationFrame(step);
  }
  function countTo(el, value, format = v => Math.round(v)) {
    if (el._val === value) return;
    cancelAnimationFrame(el._cnt);
    const from = el._val ?? 0, start = performance.now();
    el._val = value;
    if (reduce) { el.textContent = format(value); return; }
    const step = now => {
      const p = Math.min(1, (now - start) / 800), e = 1 - Math.pow(1 - p, 3);
      el.textContent = format(from + (value - from) * e);
      if (p < 1) el._cnt = requestAnimationFrame(step);
    };
    el._cnt = requestAnimationFrame(step);
  }
  const oneDp = v => v ? v.toFixed(1) : '—';

  /* ---------- hero HUD + model rail ---------- */
  function updateHud(first) {
    if (V) {
      const m = V.state.model, p = V.perf();
      const nameEl = $('[data-hud="name"]');
      if (first) nameEl.textContent = m.name; else decode(nameEl, m.name);
      decode($('[data-hud="eyebrow"]'), m.eyebrow);
      nameEl.classList.remove('glitch'); void nameEl.offsetWidth; nameEl.classList.add('glitch');
      countTo($('[data-hud="hp"]'), p.hp);
      countTo($('[data-hud="zero"]'), p.zero, oneDp);
      countTo($('[data-hud="top"]'), p.top);
      countTo($('[data-hud="price"]'), m.price, fmt);
    }
    $$('[data-model-short]').forEach(el => el.textContent = MODELS[modelId].short);
    $$('.model-rail button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.model === modelId)));
    EN.onModel();
  }
  function setModel(id) {
    if (id === modelId) return;
    modelId = id;
    railP = 0;
    if (V) V.setModel(V.models.find(m => m.id === id));
    updateHud(false); applyChapter(chapter);
  }
  $$('.model-rail button').forEach(b => b.addEventListener('click', () => { railStopped = true; setModel(b.dataset.model); }));

  /* ---------- Engine Room: free-rev the engine, crackle on lift-off, horn, light flash, burnout ---------- */
  const EN = (() => {
    const box = $('[data-engine]');
    const q = k => $(`[data-en-${k}]`, box);
    const btn = q('rev'), needle = q('needle'), limitLight = q('limit'), pops = q('pops'), vol = q('vol');
    // cyl sets the firing note (rpm / 60 * cyl / 2); up is how fast it spins up under throttle
    const ENGINES = {
      spectre:  { label: 'Twin-turbo V8',   cyl: 8,  idle: 850,  limit: 7800,  max: 9000,  step: 1000, up: 2.6 },
      vortex:   { label: 'V12',             cyl: 12, idle: 1000, limit: 9200,  max: 10000, step: 1000, up: 3.4 },
      behemoth: { label: 'Supercharged V8', cyl: 8,  idle: 750,  limit: 6800,  max: 8000,  step: 1000, up: 2.0 },
      hauler:   { label: 'Inline-6 diesel', cyl: 6,  idle: 600,  limit: 2300,  max: 3000,  step: 500,  up: 1.5 },
      titan:    { label: 'Inline-4',        cyl: 4,  idle: 1300, limit: 13000, max: 14000, step: 2000, up: 4.6 }
    };
    const SEGMENTS = 18;
    let eng = ENGINES[modelId];
    let rpm = 0, peak = 0, throttle = false, started = false, burn = 0, crackle = 0, limitT = 0, level = 0, db = 0;
    let volume = store.get('velonix-volume', 70);

    meter();
    function meter() {
      const m = q('meter');
      m.innerHTML = Array.from({ length: SEGMENTS }, (_, i) => `<i class="${i >= SEGMENTS - 3 ? 'r' : i >= SEGMENTS - 7 ? 'a' : ''}"></i>`).join('');
    }
    const segs = $$('[data-en-meter] i', box);

    function buildGauge() {
      const M = eng.max;
      const pt = (r, rad) => { const a = Math.PI * (1 - r / M); return [100 + rad * Math.cos(a), 110 - rad * Math.sin(a)]; };
      const [x0, y0] = pt(eng.limit, 80), [x1, y1] = pt(M, 80);
      q('red').setAttribute('d', `M${x0.toFixed(1)} ${y0.toFixed(1)} A80 80 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`);
      let h = '';
      for (let v = 0; v <= M; v += eng.step) {
        const [a0, b0] = pt(v, 72), [a1, b1] = pt(v, 80), [tx, ty] = pt(v, 60), k = v / 1000;
        h += `<line x1="${a0.toFixed(1)}" y1="${b0.toFixed(1)}" x2="${a1.toFixed(1)}" y2="${b1.toFixed(1)}"></line><text x="${tx.toFixed(1)}" y="${(ty + 3).toFixed(1)}">${Number.isInteger(k) ? k : k.toFixed(1)}</text>`;
      }
      q('ticks').innerHTML = h;
    }

    /* sound: firing note + sub octave + upper partial through a soft clipper and resonant low-pass,
       then volume -> compressor so MAX is loud without clipping. Noise covers crackle and tyre screech. */
    const clipCurve = k => { const n = 1024, a = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; a[i] = Math.tanh(k * x) / Math.tanh(k); } return a; };
    const sound = {
      ctx: null,
      init() {
        if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
        const c = this.ctx = new AC();
        this.master = c.createGain(); this.master.gain.value = 0;
        const comp = c.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 8;
        this.master.connect(comp); comp.connect(c.destination);
        const shaper = c.createWaveShaper(); shaper.curve = clipCurve(4); shaper.oversample = '2x';
        this.lp = c.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.Q.value = 5;
        this.eng = c.createGain(); this.eng.gain.value = 0;
        this.oscs = [['sawtooth', 1, 0.6], ['square', 0.5, 0.5], ['sawtooth', 2.01, 0.2]].map(([type, mul, gain]) => {
          const o = c.createOscillator(), g = c.createGain(); o.type = type; g.gain.value = gain;
          o.connect(g); g.connect(shaper); o.start(); return { o, mul };
        });
        shaper.connect(this.lp); this.lp.connect(this.eng); this.eng.connect(this.master);
        const buf = this.noise = c.createBuffer(1, c.sampleRate, c.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
        this.screechF = c.createBiquadFilter(); this.screechF.type = 'bandpass'; this.screechF.Q.value = 7;
        this.screech = c.createGain(); this.screech.gain.value = 0;
        src.connect(this.screechF); this.screechF.connect(this.screech); this.screech.connect(this.master); src.start();
        this.setVolume();
      },
      setVolume() { if (this.ctx) this.master.gain.setTargetAtTime(Math.pow(volume / 100, 1.6) * 1.8, this.ctx.currentTime, 0.05); },
      update(load, on) {
        if (!this.ctx) return;
        const t = this.ctx.currentTime, f = rpm / 60 * eng.cyl / 2;
        this.oscs.forEach(({ o, mul }) => o.frequency.setTargetAtTime(Math.max(18, f * mul), t, 0.02));
        this.lp.frequency.setTargetAtTime(260 + f * 2.4 + load * 2000, t, 0.04);
        this.eng.gain.setTargetAtTime(on ? 0.14 + load * 0.2 : 0, t, on ? 0.05 : 0.35);
        this.screech.gain.setTargetAtTime(burn > 0 ? 0.3 : 0, t, 0.08);
        this.screechF.frequency.setTargetAtTime(2300 + Math.sin(t * 11) * 600, t, 0.05);
      },
      pop(strength) {
        const c = this.ctx; if (!c) return;
        const t = c.currentTime, s = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
        s.buffer = this.noise; bp.type = 'bandpass'; bp.frequency.value = 350 + Math.random() * 900; bp.Q.value = 1.1;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(strength, t + 0.004); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05 + Math.random() * 0.07);
        s.connect(bp); bp.connect(g); g.connect(this.master); s.start(t, Math.random() * 0.8, 0.15);
      },
      horn(on) {
        const c = this.ctx; if (!c) return;
        const t = c.currentTime;
        if (on && !this.hornNodes) {
          const type = MODELS[modelId].type, tones = { car: [415, 523], truck: [185, 233, 277], bike: [554, 698] }[type];
          const g = c.createGain(), lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
          g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.2, t + 0.02);
          const os = tones.map(fr => { const o = c.createOscillator(); o.type = type === 'truck' ? 'sawtooth' : 'square'; o.frequency.value = fr; o.connect(lp); o.start(); return o; });
          lp.connect(g); g.connect(this.master);
          this.hornNodes = { g, os };
        } else if (!on && this.hornNodes) {
          const { g, os } = this.hornNodes; this.hornNodes = null;
          g.gain.setTargetAtTime(0, t, 0.03); os.forEach(o => o.stop(t + 0.25));
        }
      }
    };

    function label(text, icon) { btn.innerHTML = `<i class="fas ${icon}"></i> <span>${text}</span>`; }
    function paintVolume() {
      vol.value = volume;
      vol.style.setProperty('--v', volume + '%');
      q('volval').textContent = volume >= 100 ? 'MAX' : volume;
      q('volicon').className = 'fas ' + (volume === 0 ? 'fa-volume-xmark' : volume < 45 ? 'fa-volume-low' : 'fa-volume-high');
      box.classList.toggle('maxed', volume >= 100);
    }
    vol.addEventListener('input', () => { volume = +vol.value; store.set('velonix-volume', volume); paintVolume(); sound.init(); sound.setVolume(); });
    paintVolume();

    function start() {
      started = true;
      rpm = Math.max(rpm, eng.idle * 0.3);
      box.classList.add('running');
      label('Hold to rev', 'fa-gauge-high');
      if (V) V.set({ lights: 'on' });
    }
    function stop() {
      started = false; throttle = false; crackle = 0;
      if (burn > 0) endBurnout();
      sound.horn(false);
      box.classList.remove('running');
      btn.classList.remove('held');
      $$('[data-en-act]', box).forEach(b => b.classList.remove('on'));
      label('Start & rev', 'fa-power-off');
      if (V) { V.set({ lights: 'drl', drive: false, driveRate: 1 }); V.kick({ dist: 1, el: 0, shake: 0, speed: 0 }); }
    }
    function press() {
      sound.init();
      if (!started) start();
      throttle = true;
      btn.classList.add('held');
    }
    function release() {
      if (throttle && rpm > eng.limit * 0.55) crackle = 0.45 + rpm / eng.limit * 0.6;
      throttle = false;
      btn.classList.remove('held');
      sound.init();
    }

    function popText(big) {
      if (pops.childElementCount > 5) return;
      const w = ['POP', 'BANG', 'CRACK', 'BRAP'][(Math.random() * 4) | 0];
      const el = document.createElement('span');
      el.textContent = w;
      el.style.cssText = `left:${10 + Math.random() * 80}%;top:${10 + Math.random() * 55}%;--r:${(Math.random() * 40 - 20).toFixed(0)}deg;--s:${big ? 1.25 : 0.9}`;
      pops.appendChild(el);
      setTimeout(() => el.remove(), 650);
    }
    function crack(strength) { sound.pop(strength); if (!reduce || Math.random() < 0.3) popText(strength > 0.7); }

    let flashing = 0;
    function flash() {
      if (!V || flashing) return;
      const base = started ? 'on' : 'drl';
      ['off', 'on', 'off', 'on', 'off', base].forEach((l, i) => { flashing++; setTimeout(() => { flashing--; V.set({ lights: l }); }, i * 95); });
    }
    function burnout() {
      sound.init();
      if (!started) start();
      burn = 2.8;
      $('[data-en-act="burnout"]', box).classList.add('on');
      if (V) V.set({ drive: true, driveRate: 5 });
    }
    function endBurnout() {
      burn = 0;
      crackle = 0.9;
      $('[data-en-act="burnout"]', box).classList.remove('on');
      if (V) V.set({ drive: false, driveRate: 1 });
    }
    function act(name, down) {
      if (name === 'horn') {
        sound.init();
        sound.horn(down);
        $('[data-en-act="horn"]', box).classList.toggle('on', down);
      } else if (down && name === 'flash') flash();
      else if (down && name === 'burnout' && burn <= 0) burnout();
    }

    btn.addEventListener('pointerdown', e => { e.preventDefault(); btn.setPointerCapture(e.pointerId); press(); });
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('lostpointercapture', release);
    btn.addEventListener('contextmenu', e => e.preventDefault());
    $$('[data-en-act]', box).forEach(b => {
      const name = b.dataset.enAct;
      b.addEventListener('pointerdown', e => { e.preventDefault(); if (name === 'horn') b.setPointerCapture(e.pointerId); act(name, true); });
      if (name === 'horn') ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => b.addEventListener(t, () => act('horn', false)));
      b.addEventListener('contextmenu', e => e.preventDefault());
      b.addEventListener('keydown', e => { if (e.code === 'Enter') { e.preventDefault(); if (!e.repeat) act(name, true); } });
      b.addEventListener('keyup', e => { if (e.code === 'Enter') act(name, false); });
    });
    $$('[data-en-pick]', box).forEach(b => b.addEventListener('click', () => setModel(b.dataset.enPick)));

    // keyboard while the section is on screen: Space revs, H horn, F flash, B burnout
    const KEYS = { KeyH: 'horn', KeyF: 'flash', KeyB: 'burnout' };
    addEventListener('keydown', e => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || (chapter !== 'engine' && !box.contains(document.activeElement))) return;
      if (e.target.closest('textarea, input:not([type=range])')) return;
      if (e.code === 'Space') {
        if (e.target.closest('a, button, input') && !box.contains(e.target)) return;
        e.preventDefault(); press();
      } else if (KEYS[e.code]) act(KEYS[e.code], true);
    });
    addEventListener('keyup', e => {
      if (e.code === 'Space') release();
      if (e.code === 'KeyH') act('horn', false);
    });

    // Mobile browsers only unlock audio on pointerup/touchend/keydown, so open it on the first such gesture anywhere
    const unlock = () => { sound.init(); ['pointerup', 'touchend', 'keydown'].forEach(t => removeEventListener(t, unlock, true)); };
    ['pointerup', 'touchend', 'keydown'].forEach(t => addEventListener(t, unlock, true));
    // rAF stops in a background tab, so switch the engine off with it
    document.addEventListener('visibilitychange', () => { if (document.hidden) { if (started) stop(); if (sound.ctx) sound.ctx.suspend(); } });

    function tick(dt) {
      if (started && chapter !== 'engine') stop();
      let target = started ? eng.idle : 0;
      if (started && throttle) target = eng.limit * 1.08;
      if (burn > 0) {
        burn -= dt;
        target = eng.limit * (0.86 + Math.sin(performance.now() / 85) * 0.06);
        if (burn <= 0) endBurnout();
      }
      rpm += (target - rpm) * Math.min(1, (target > rpm ? eng.up : 1.6) * dt);
      if (rpm >= eng.limit) {
        // limiter: cut and bounce, with a bang now and then
        rpm = eng.limit * (0.93 + Math.random() * 0.03);
        limitT = 0.14;
        if (Math.random() < 0.35) crack(0.5);
      }
      limitT -= dt;
      if (crackle > 0) {
        crackle -= dt;
        if (Math.random() < dt * 16) crack(0.35 + Math.random() * 0.6);
      }
      if (rpm < 5 && !started) rpm = 0;
      peak = Math.max(peak, rpm);

      const frac = rpm / eng.limit, load = started && (throttle || burn > 0) ? 1 : 0;
      level += ((started ? (volume / 100) * (0.28 + 0.72 * Math.min(1, frac)) : 0) - level) * Math.min(1, dt * 10);
      db += ((started && volume ? 42 + level * 76 : 0) - db) * Math.min(1, dt * 8);
      sound.update(load, started);

      needle.setAttribute('transform', `rotate(${(Math.min(rpm, eng.max) / eng.max * 180 - 90).toFixed(2)} 100 110)`);
      limitLight.classList.toggle('on', limitT > 0);
      q('rpm').textContent = Math.round(rpm / 10) * 10;
      q('peak').textContent = Math.round(peak / 10) * 10;
      q('db').textContent = Math.round(db);
      const lit = Math.round(level * SEGMENTS);
      segs.forEach((s, i) => s.classList.toggle('on', i < lit));
      box.style.setProperty('--throb', (level * frac).toFixed(3));

      if (V && started) V.kick(reduce ? {} : { shake: Math.pow(Math.min(1, frac), 2.4) * 0.013 + (burn > 0 ? 0.006 : 0), dist: 1 - Math.min(1, frac) * 0.04 });
    }

    label('Start & rev', 'fa-power-off');
    return {
      tick,
      busy: () => started,
      onModel() {
        const next = ENGINES[modelId];
        if (next !== eng) {
          if (burn > 0) endBurnout();
          rpm = rpm / eng.limit * next.limit;
          eng = next; peak = 0;
          sound.horn(false);
        }
        buildGauge();
        q('model').textContent = MODELS[modelId].name;
        q('spec').textContent = `${eng.label} · redline ${eng.limit.toLocaleString('en-US')} rpm`;
        $$('[data-en-pick]', box).forEach(b => b.classList.toggle('on', b.dataset.enPick === modelId));
      }
    };
  })();

  /* ---------- sections ---------- */
  const chapters = $$('.chapter');
  const io = new IntersectionObserver(entries => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      const el = en.target, name = el.dataset.chapter;
      if (!el.classList.contains('in')) {
        el.classList.add('in');
        $$('[data-count]', el).forEach(dd => countTo(dd, +dd.dataset.count, v => Math.round(v) + (dd.dataset.suffix || '')));
      }
      if (name === chapter) continue;
      chapter = name;
      document.body.dataset.chapter = name;
      document.body.dataset.side = el.dataset.side || '';
      $$('.rail a').forEach(a => a.classList.toggle('on', a.dataset.for === name));
      $$('.site-nav a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + name));
      applyChapter(name);
    }
  }, { rootMargin: '-45% 0px -45% 0px' });
  chapters.forEach(c => io.observe(c));
  $('.rail a[data-for="hero"]').classList.add('on');
  updateHud(true);

  let resizeT;
  addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => applyChapter(chapter), 200); });

  /* ---------- drag to rotate (hero) ---------- */
  const hero = $('.hero');
  let drag = null;
  hero.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('a, button, .spec-hud, .hero-copy')) return;
    drag = { x: e.clientX, y: e.clientY, touch: e.pointerType === 'touch' };
    railStopped = true;
    hero.classList.add('dragging');
    if (!drag.touch) hero.setPointerCapture(e.pointerId);
  });
  hero.addEventListener('pointermove', e => {
    if (!drag || !V) return;
    V.nudge(e.clientX - drag.x, drag.touch ? 0 : e.clientY - drag.y);
    drag.x = e.clientX; drag.y = e.clientY;
  });
  const endDrag = () => { drag = null; hero.classList.remove('dragging'); };
  hero.addEventListener('pointerup', endDrag);
  hero.addEventListener('pointercancel', endDrag);

  /* ---------- links into the Lab open the vehicle on screen ---------- */
  $$('[data-build-link]').forEach(a => a.addEventListener('click', e => {
    a.href = 'customize.html?model=' + modelId;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0 || reduce) return;
    e.preventDefault();
    $('.curtain').classList.add('cover');
    setTimeout(() => { location.href = a.href; }, 480);
  }));
  addEventListener('pageshow', e => { if (e.persisted) $('.curtain').classList.remove('cover'); });

  /* ---------- frame loop ---------- */
  const header = $('.site-header'), progress = $('.progress');
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(100, now - last) / 1000; last = now;
    if (lenis) lenis.raf(now);
    const y = scrollY, max = document.documentElement.scrollHeight - innerHeight;
    progress.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
    header.classList.toggle('scrolled', y > 40);
    EN.tick(dt);
    if (V) {
      // gentle scroll-linked orbit inside the current section
      const el = chapters.find(c => c.dataset.chapter === chapter);
      if (el && !reduce) {
        const r = el.getBoundingClientRect();
        const off = (innerHeight / 2 - (r.top + r.height / 2)) / innerHeight;
        V.scrub(Math.max(-0.6, Math.min(0.6, off * 0.45)));
      }
      // hero auto-advances through the lineup until the visitor takes over
      if (chapter === 'hero' && !railStopped && booted && !document.hidden) {
        railP += dt * 1000 / RAIL_MS;
        if (railP >= 1) setModel(ORDER[(ORDER.indexOf(modelId) + 1) % ORDER.length]);
      }
      const active = $('.model-rail [aria-selected="true"]');
      if (active) active.style.setProperty('--p', railStopped ? 1 : Math.min(1, railP));
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  $$('[data-year]').forEach(el => el.textContent = new Date().getFullYear());
})();
