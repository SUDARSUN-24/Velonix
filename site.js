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

  // Kept here too so the page (and Launch Control) works before or without the 3D studio
  const MODELS = {
    spectre:  { name: 'Velonix Spectre',    short: 'Spectre',  type: 'car',   zero: 3.9 },
    vortex:   { name: 'Apex Vortex',        short: 'Vortex',   type: 'car',   zero: 2.6 },
    behemoth: { name: 'Cyberdyne Behemoth', short: 'Behemoth', type: 'car',   zero: 4.1 },
    hauler:   { name: 'Cyber Hauler',       short: 'Hauler',   type: 'truck', zero: 11.8, est: true },  // no factory figure in the Lab, so an estimate
    titan:    { name: 'Titan Edge Bike',    short: 'Titan',    type: 'bike',  zero: 3.1 }
  };
  const ORDER = Object.keys(MODELS);

  // Camera goals per section (see driveShowroom in customize.html). x/y slide the vehicle across the screen.
  const PRESETS = {
    hero:   { az: 0.85, el: 0.23, dist: 1.0,  ty: 0, x: 0.19, y: 0.03, drift: 0.1 },
    about:  { az: 1.2,  el: 0.24, dist: 1.1,  ty: 0, x: 0.2,  y: 0,    drift: 0.05 },
    launch: { az: 0.02, el: 0.1,  dist: 1.3,  ty: 0, x: -0.2, y: 0.02, drift: 0 },
    lab:    { az: -2.3, el: 0.2,  dist: 1.15, ty: 0, x: 0.26, y: 0,    drift: 0.08 }
  };
  const MOBILE = {
    hero: { x: 0, y: 0.15 },
    about: { x: 0, y: -0.2 }, launch: { x: 0, y: -0.3, dist: 1.75 }, lab: { x: 0, y: -0.22 }
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
    V.set(LC.busy() ? { env: themeEnv() } : { env: themeEnv(), lights: 'drl', drive: false });
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
    LC.onModel();
  }
  function setModel(id) {
    if (id === modelId || LC.busy()) return;
    modelId = id;
    railP = 0;
    if (V) V.setModel(V.models.find(m => m.id === id));
    updateHud(false); applyChapter(chapter);
  }
  $$('.model-rail button').forEach(b => b.addEventListener('click', () => { railStopped = true; setModel(b.dataset.model); }));

  /* ---------- Launch Control: rev, launch on green, shift on the light ---------- */
  const LC = (() => {
    const box = $('[data-launch]');
    const q = k => $(`[data-lc-${k}]`, box);
    const btn = q('btn'), needle = q('needle'), lights = $$('[data-lc-tree] i', box), shiftLight = q('shift');
    const MAX = 9000, ZONE = [5200, 7000], SHIFT_AT = 7800, LIMIT = 8600, IDLE = 900;
    const GEARS = [0, 0.36, 0.68, 1];   // 0-100 split across three gears
    const PITCH = { car: 1, truck: 0.55, bike: 1.45 };
    let st = 'idle', rpm = IDLE, throttle = false, timers = [], run = null;
    let muted = store.get('velonix-sound-off', false);

    // gauge geometry: 0 rpm on the left, MAX on the right, over the top
    const pt = (r, rad = 80) => { const a = Math.PI * (1 - r / MAX); return [100 + rad * Math.cos(a), 110 - rad * Math.sin(a)]; };
    const arc = (a, b) => { const [x0, y0] = pt(a), [x1, y1] = pt(b); return `M${x0.toFixed(1)} ${y0.toFixed(1)} A80 80 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`; };
    q('zone').setAttribute('d', arc(ZONE[0], ZONE[1]));
    q('red').setAttribute('d', arc(8000, MAX));
    q('ticks').innerHTML = Array.from({ length: 10 }, (_, i) => {
      const [x0, y0] = pt(i * 1000, 72), [x1, y1] = pt(i * 1000, 80), [tx, ty] = pt(i * 1000, 60);
      return `<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}"></line><text x="${tx.toFixed(1)}" y="${(ty + 3).toFixed(1)}">${i}</text>`;
    }).join('');

    /* engine note: two detuned oscillators through a resonant low-pass, pitched by rpm */
    const sound = {
      ctx: null,
      init() {
        if (this.ctx || muted) { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); return; }
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
        const c = this.ctx = new AC();
        this.out = c.createGain(); this.out.gain.value = 0;
        this.lp = c.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.Q.value = 5;
        this.a = c.createOscillator(); this.a.type = 'sawtooth';
        this.b = c.createOscillator(); this.b.type = 'square';
        const half = c.createGain(); half.gain.value = 0.5;
        this.a.connect(this.lp); this.b.connect(half); half.connect(this.lp);
        this.lp.connect(this.out); this.out.connect(c.destination);
        this.a.start(); this.b.start();
      },
      update(load, on) {
        if (!this.ctx) return;
        const t = this.ctx.currentTime, f = (16 + rpm * 0.048) * (PITCH[MODELS[modelId].type] || 1);
        this.a.frequency.setTargetAtTime(f, t, 0.03);
        this.b.frequency.setTargetAtTime(f * 0.501, t, 0.03);
        this.lp.frequency.setTargetAtTime(260 + rpm * 0.22 + load * 700, t, 0.05);
        this.out.gain.setTargetAtTime(on && !muted ? 0.03 + load * 0.035 : 0, t, on ? 0.06 : 0.25);
      }
    };
    const muteBtn = q('mute');
    function paintMute() {
      muteBtn.setAttribute('aria-pressed', String(muted));
      muteBtn.title = muted ? 'Turn engine sound on' : 'Mute engine sound';
      muteBtn.innerHTML = `<i class="fas ${muted ? 'fa-volume-xmark' : 'fa-volume-high'}"></i>`;
    }
    paintMute();
    muteBtn.addEventListener('click', () => { muted = !muted; store.set('velonix-sound-off', muted); paintMute(); if (!muted) sound.init(); });

    function setLights(n, go = false) {
      lights.forEach((l, i) => l.className = i < 3 ? (i < n ? 'on' : '') : (go ? 'go on' : 'go'));
    }
    function label(text) { btn.textContent = text; }
    function result(html) { q('result').innerHTML = html; }
    const zeroFor = id => MODELS[id].zero;

    function start() {
      st = 'stage'; run = null;
      timers.forEach(clearTimeout); timers = [];
      setLights(0); result(''); label('Keep it in the green');
      q('speed').textContent = '0'; q('time').textContent = '0.00'; q('gear').textContent = 'N';
      box.classList.add('live');
      const green = 1500 + 500 + Math.random() * 700;
      [500, 1000, 1500].forEach((ms, i) => timers.push(setTimeout(() => setLights(i + 1), ms)));
      timers.push(setTimeout(go, green));
    }
    function go() {
      setLights(3, true);
      let factor, note;
      if (rpm >= ZONE[0] && rpm <= ZONE[1]) { factor = 0.97; note = 'Perfect launch'; }
      else if (rpm < ZONE[0]) { factor = 1 + (ZONE[0] - rpm) / ZONE[0] * 0.7; note = rpm < 2500 ? 'Stalled off the line' : 'Bogged down'; }
      else { factor = 1 + (rpm - ZONE[1]) / (MAX - ZONE[1]) * 0.35; note = 'Wheelspin'; }
      run = { T: zeroFor(modelId) * factor, p: 0, gear: 1, elapsed: 0, penalty: 0, stall: 0, launchRpm: rpm, notes: [note] };
      st = 'run';
      label('Tap to shift');
      flash(note, factor <= 0.97);
      if (V) V.set({ drive: true, driveRate: 0.6, lights: 'on' });
    }
    function shift(auto) {
      if (!run || run.gear >= 3) return;
      const b0 = GEARS[run.gear - 1], b1 = GEARS[run.gear], f = (run.p - b0) / (b1 - b0);
      if (!auto && f < 0.8) { run.penalty += (b1 - run.p) * run.T * 0.35; flash('Early shift', false); run.notes.push('early shift'); }
      else if (auto) { flash('Missed shift', false); run.notes.push('missed shift'); }
      else flash('Clean shift', true);
      run.gear++; run.stall = 0;
      shiftLight.classList.remove('on');
      q('gear').textContent = run.gear;
    }
    function finish() {
      st = 'done';
      const total = run.elapsed + run.penalty, factory = zeroFor(modelId);
      const rating = total <= factory * 0.99 ? 'Legend' : total <= factory * 1.06 ? 'Pro' : total <= factory * 1.25 ? 'Street' : 'Rookie';
      const bests = store.get('velonix-lc-best', {}), prev = bests[modelId];
      const isBest = !prev || total < prev;
      if (isBest) { bests[modelId] = +total.toFixed(2); store.set('velonix-lc-best', bests); }
      q('time').textContent = total.toFixed(2);
      result(`<b>${total.toFixed(2)} s</b><span class="rank r-${rating.toLowerCase()}">${rating}</span>${isBest ? '<span class="pb">New best</span>' : ''}<small>${run.notes[0]}${run.notes.length > 1 ? ' · ' + run.notes.slice(1).join(' · ') : ''} · factory ${factory.toFixed(1)} s</small>`);
      label('Hold to go again');
      box.classList.remove('live');
      setTimeout(() => { if (st === 'done') setLights(0); }, 1600);
      calm();
      paintBest();
    }
    function calm() {
      shiftLight.classList.remove('on');
      if (V) { V.set({ drive: false, driveRate: 1, lights: 'drl' }); V.kick({ dist: 1, el: 0, shake: 0, speed: 0 }); }
    }
    function abort() {
      if (st !== 'stage' && st !== 'run') return;
      timers.forEach(clearTimeout); timers = [];
      st = 'idle'; run = null; throttle = false;
      setLights(0); label('Hold to rev'); result('');
      box.classList.remove('live');
      calm();
    }
    let flashT;
    function flash(text, good) {
      const r = q('result');
      if (st === 'done') return;
      r.innerHTML = `<span class="flash ${good ? 'good' : 'bad'}">${text}</span>`;
      clearTimeout(flashT); flashT = setTimeout(() => { if (st === 'run') r.innerHTML = ''; }, 900);
    }
    function paintBest() {
      const b = store.get('velonix-lc-best', {})[modelId];
      q('best').textContent = b ? b.toFixed(2) + ' s' : '—';
    }

    function press() {
      sound.init();
      if (st === 'idle' || st === 'done') start();
      if (st === 'run' && run.elapsed > 0.3) shift(false);  // a press right at green is still the launch, not a shift
      throttle = true;
      btn.classList.add('held');
    }
    function release() { throttle = false; btn.classList.remove('held'); sound.init(); }
    // Mobile browsers only unlock audio on pointerup/touchend/keydown, so open it on the first such gesture anywhere
    const unlock = () => { if (muted) return; sound.init(); ['pointerup', 'touchend', 'keydown'].forEach(t => removeEventListener(t, unlock, true)); };
    ['pointerup', 'touchend', 'keydown'].forEach(t => addEventListener(t, unlock, true));
    // rAF stops in a background tab, so stop the run and the engine note with it
    document.addEventListener('visibilitychange', () => { if (document.hidden) { abort(); if (sound.ctx) sound.ctx.suspend(); } });

    btn.addEventListener('pointerdown', e => { e.preventDefault(); btn.setPointerCapture(e.pointerId); press(); });
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('lostpointercapture', release);
    btn.addEventListener('contextmenu', e => e.preventDefault());
    // keyboard: Space/Enter on the button, or Space anywhere while the section is on screen (vehicle chips included)
    addEventListener('keydown', e => {
      if (e.repeat || !(e.code === 'Space' || (e.code === 'Enter' && document.activeElement === btn))) return;
      if (document.activeElement !== btn && (chapter !== 'launch' || (e.target.closest('input, textarea, select, a, button') && !e.target.closest('[data-lc-pick]')))) return;
      e.preventDefault(); press();
    });
    addEventListener('keyup', e => { if (e.code === 'Space' || e.code === 'Enter') release(); });
    $$('[data-lc-pick]', box).forEach(b => b.addEventListener('click', () => setModel(b.dataset.lcPick)));

    function tick(dt) {
      let load = 0;
      if (st === 'stage' || st === 'idle' || st === 'done') {
        const target = throttle && st === 'stage' ? LIMIT + 300 : IDLE;
        rpm += (target - rpm) * (target > rpm ? 1.8 : 1.4) * dt;
        if (rpm >= LIMIT) rpm = LIMIT - 250 - Math.random() * 300;
        load = st === 'stage' && throttle ? 1 : 0;
        if (V && st === 'stage' && !reduce) V.kick({ shake: 0.002 + rpm / MAX * 0.008 });
      } else if (st === 'run') {
        run.elapsed += dt;
        const b0 = GEARS[run.gear - 1], b1 = GEARS[run.gear];
        if (run.p < b1) run.p = Math.min(b1, run.p + dt / run.T);
        else if (run.gear < 3) { run.stall += dt; if (run.stall > 1.1) shift(true); }
        const f = (run.p - b0) / (b1 - b0);
        const from = run.gear === 1 ? Math.max(3200, run.launchRpm * 0.75) : 5300;
        rpm = run.p >= b1 && run.gear < 3 ? LIMIT - Math.random() * 380 : from + (SHIFT_AT + 200 - from) * f;
        shiftLight.classList.toggle('on', run.gear < 3 && f > 0.8);
        q('speed').textContent = Math.round(100 * run.p);
        q('time').textContent = (run.elapsed + run.penalty).toFixed(2);
        if (run.gear === 1) q('gear').textContent = '1';
        load = 1;
        if (V) {
          V.set({ driveRate: 0.6 + run.p * 3.2 });
          V.kick(reduce ? { dist: 1 - 0.14 * run.p, speed: 4 + run.p * 16 } : { dist: 1 - 0.14 * run.p, el: -0.035, shake: 0.004 + (1 - run.p) * 0.01, speed: 4 + run.p * 16 });
        }
        if (run.p >= 1) finish();
      }
      needle.setAttribute('transform', `rotate(${(rpm / MAX * 180 - 90).toFixed(2)} 100 110)`);
      box.classList.toggle('in-zone', st === 'stage' && rpm >= ZONE[0] && rpm <= ZONE[1]);
      sound.update(load, st === 'stage' || st === 'run' || rpm > IDLE + 150);
    }

    return {
      tick, abort,
      busy: () => st === 'stage' || st === 'run',
      onModel() {
        q('model').textContent = MODELS[modelId].name;
        q('factory').textContent = zeroFor(modelId).toFixed(1) + ' s' + (MODELS[modelId].est ? ' (est.)' : '');
        $$('[data-lc-pick]', box).forEach(b => b.classList.toggle('on', b.dataset.lcPick === modelId));
        paintBest();
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
      if (chapter === 'launch') LC.abort();
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
    LC.tick(dt);
    if (V) {
      // gentle scroll-linked orbit inside the current section (held still during a launch)
      const el = chapters.find(c => c.dataset.chapter === chapter);
      if (el && !reduce) {
        const r = el.getBoundingClientRect();
        const off = (innerHeight / 2 - (r.top + r.height / 2)) / innerHeight;
        V.scrub(LC.busy() ? 0 : Math.max(-0.6, Math.min(0.6, off * 0.45)));
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
