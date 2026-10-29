// Velonix Home (index.html): drives the live 3D studio behind the page.
// The studio is customize.html?showroom=1 in a same-origin iframe; its window.velonix API
// moves the camera (show/nudge/scrub), swaps vehicles and applies options quietly.
(() => {
  const root = document.documentElement;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = () => innerWidth <= 760;
  const fmt = n => '$' + Math.round(n).toLocaleString('en-US');

  const SHORT = { spectre: 'Spectre', vortex: 'Vortex', behemoth: 'Behemoth', hauler: 'Hauler', titan: 'Titan' };
  const ORDER = Object.keys(SHORT);

  // Camera goals per chapter (see driveShowroom in customize.html). x/y slide the vehicle across the screen.
  const PRESETS = {
    hero:   { az: 0.85, el: 0.17, dist: 1.0,  ty: 0,     x: 0.19, y: 0.03, drift: 0.1 },
    paint:  { az: 1.2,  el: 0.24, dist: 0.95, ty: 0,     x: 0.2,  y: 0,    drift: 0.05 },
    wheels: { az: 0.3,  el: 0.12, dist: 0.72, ty: -0.1,  x: -0.2, y: 0,    drift: 0.03 },
    light:  { az: 0.75, el: 0.16, dist: 0.95, ty: 0,     x: 0.2,  y: 0,    drift: 0.04, env: 2, lights: 'on' },
    cabin:  { view: 'interior' },
    power:  { az: -2.3, el: 0.13, dist: 0.9,  ty: 0,     x: -0.2, y: 0,    drift: 0.05, drive: true },
    build:  { az: 0.85, el: 0.3,  dist: 1.2,  ty: 0,     x: 0,    y: 0.2,  drift: 0.16 }
  };
  const MOBILE = {
    hero: { x: 0, y: 0.15 },
    paint: { x: 0, y: -0.2 }, wheels: { x: 0, y: -0.2, dist: 0.75 }, light: { x: 0, y: -0.2 },
    power: { x: 0, y: -0.2 }, build: { x: 0, y: -0.22, dist: 1.05 }
  };
  const CYCLE = { paint: 'paint', wheels: 'wheel' };
  const PAINTS = ['purple', 'red', 'yellow', 'white', 'blue', 'green', 'black', 'gold', 'holo', 'mgrey'];
  const ENGINE_ICON = { v8: 'fa-fire', electric: 'fa-bolt', antimatter: 'fa-atom' };
  const RAIL_MS = 9000;

  let V = null;               // studio API once ready
  let chapter = 'hero';
  let lightEnv = null;        // scene picked by the visitor in the Light chapter
  let railP = 0, railStopped = reduce;
  const touched = new Set();  // option groups changed on this page, carried into the Lab
  const handPicked = new Set(); // groups the visitor picked by hand (stops auto-cycling)

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
    renderOpts(); updateHud(true); applyChapter(chapter);
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
    V.show(p);
    const env = name === 'light' && lightEnv !== null ? lightEnv : (p.env ?? themeEnv());
    V.set({ env, lights: p.lights || 'drl', drive: !!p.drive && !reduce });
    $$('[data-scene] button').forEach(b => b.classList.toggle('on', +b.dataset.env === env));
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
    const m = V.state.model, p = V.perf();
    const nameEl = $('[data-hud="name"]');
    if (first) nameEl.textContent = m.name; else decode(nameEl, m.name);
    decode($('[data-hud="eyebrow"]'), m.eyebrow);
    nameEl.classList.remove('glitch'); void nameEl.offsetWidth; nameEl.classList.add('glitch');
    countTo($('[data-hud="hp"]'), p.hp);
    countTo($('[data-hud="zero"]'), p.zero, oneDp);
    countTo($('[data-hud="top"]'), p.top);
    countTo($('[data-hud="price"]'), m.price, fmt);
    $$('[data-model-short]').forEach(el => el.textContent = SHORT[m.id]);
    $$('.model-rail button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.model === m.id)));
    updatePerf();
  }
  function setModel(id) {
    if (!V || V.state.model.id === id) return;
    V.setModel(V.models.find(m => m.id === id));
    railP = 0;
    renderOpts(); updateHud(false); applyChapter(chapter);
  }
  $$('.model-rail button').forEach(b => b.addEventListener('click', () => { railStopped = true; setModel(b.dataset.model); }));

  /* ---------- chapter options ---------- */
  function swatchBg(hex, finish) {
    if (!hex) return '#333';
    if (finish === 'chrome') return `radial-gradient(circle at 35% 30%, #fff 0%, ${hex} 35%, #3a2a08 100%)`;
    if (finish === 'iridescent') return 'conic-gradient(from 30deg, #7cf, #c7f, #f9c, #fd8, #8fd, #7cf)';
    if (finish === 'matte') return hex;
    return `radial-gradient(circle at 35% 30%, rgba(255,255,255,.55) 0%, ${hex} 38%, rgba(0,0,0,.65) 100%), ${hex}`;
  }
  function renderOpts() {
    $$('[data-opts]').forEach(box => {
      const group = box.dataset.opts;
      let list = V.choices(group);
      if (group === 'paint') list = PAINTS.map(id => list.find(c => c.id === id)).filter(Boolean);
      box.hidden = !list.length;
      const label = $(`[data-if-opts="${group}"]`); if (label) label.hidden = !list.length;
      const cur = V.state.sel[group];
      if (box.classList.contains('swatches')) {
        box.innerHTML = list.map(c => `<button type="button" data-id="${c.id}" title="${c.name}" aria-label="${c.name}" class="${c.id === cur ? 'on' : ''}" style="background:${swatchBg(c.hex, c.finish)}"></button>`).join('');
      } else if (box.classList.contains('cards')) {
        box.innerHTML = list.map(c => `<button type="button" data-id="${c.id}" class="${c.id === cur ? 'on' : ''}"><i class="fas ${ENGINE_ICON[c.id] || 'fa-gauge-high'}"></i><span><b>${c.name}</b><small>${c.desc || ''}</small></span><span class="pr">${c.price ? '+' + fmt(c.price) : 'Included'}</span></button>`).join('');
      } else {
        box.innerHTML = list.map(c => `<button type="button" data-id="${c.id}" class="${c.id === cur ? 'on' : ''}">${c.name}</button>`).join('');
      }
      showName(group);
    });
  }
  function showName(group) {
    const el = $(`[data-opt-name="${group}"]`); if (!el || !V) return;
    const c = V.choices(group).find(x => x.id === V.state.sel[group]);
    if (c) decode(el, c.name);
  }
  function pick(group, id) {
    V.quiet(group, id);
    touched.add(group);
    $$(`[data-opts="${group}"] button`).forEach(b => b.classList.toggle('on', b.dataset.id === id));
    showName(group);
    if (group === 'engine') updateHud(false);
  }
  $$('[data-opts]').forEach(box => box.addEventListener('click', e => {
    const b = e.target.closest('button[data-id]'); if (!b || !V) return;
    handPicked.add(box.dataset.opts);
    pick(box.dataset.opts, b.dataset.id);
  }));
  $$('[data-scene] button').forEach(b => b.addEventListener('click', () => { lightEnv = +b.dataset.env; applyChapter(chapter); }));
  function updatePerf() {
    if (!V) return;
    const p = V.perf();
    countTo($('[data-perf="hp"]'), p.hp);
    countTo($('[data-perf="zero"]'), p.zero, oneDp);
    countTo($('[data-perf="top"]'), p.top);
  }
  // Paint and wheels show themselves off while their chapter is on screen
  setInterval(() => {
    const group = CYCLE[chapter];
    if (!V || !group || reduce || handPicked.has(group) || document.hidden) return;
    const ids = $$(`[data-opts="${group}"] button`).map(b => b.dataset.id);
    if (ids.length < 2) return;
    pick(group, ids[(ids.indexOf(V.state.sel[group]) + 1) % ids.length]);
  }, 2600);

  function buildSummary() {
    if (!V) return;
    const rows = [['Model', V.state.model.name]];
    for (const [g, label] of [['paint', 'Paint'], ['wheel', 'Wheels'], ['upholstery', 'Cabin'], ['engine', 'Power']]) {
      const c = V.choices(g).find(x => x.id === V.state.sel[g]);
      if (c) rows.push([label, c.name]);
    }
    rows.push(['Est.', fmt(V.perf().price)]);
    $('[data-build-sum]').innerHTML = rows.map(([a, b]) => `<span>${a} <b>${b}</b></span>`).join('');
  }

  /* ---------- chapters ---------- */
  const chapters = $$('.chapter');
  const io = new IntersectionObserver(entries => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      const el = en.target, name = el.dataset.chapter;
      el.classList.add('in');
      if (name === chapter) continue;
      chapter = name;
      document.body.dataset.chapter = name;
      document.body.dataset.side = el.dataset.side || '';
      $$('.rail a').forEach(a => a.classList.toggle('on', a.dataset.for === name));
      $$('.site-nav a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + name));
      if (name === 'build') buildSummary();
      if (name === 'power') updatePerf();
      applyChapter(name);
    }
  }, { rootMargin: '-45% 0px -45% 0px' });
  chapters.forEach(c => io.observe(c));
  $('.rail a[data-for="hero"]').classList.add('on');

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

  /* ---------- links into the Lab carry the build ---------- */
  function buildHref() {
    if (!V) return 'customize.html';
    const q = new URLSearchParams({ model: V.state.model.id });
    for (const g of touched) if (V.state.sel[g]) q.set(g, V.state.sel[g]);
    return 'customize.html?' + q;
  }
  $$('[data-build-link]').forEach(a => a.addEventListener('click', e => {
    a.href = buildHref();
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
    const dt = Math.min(100, now - last); last = now;
    if (lenis) lenis.raf(now);
    const y = scrollY, max = document.documentElement.scrollHeight - innerHeight;
    progress.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
    header.classList.toggle('scrolled', y > 40);
    if (V) {
      // gentle scroll-linked orbit inside the current chapter
      const el = chapters.find(c => c.dataset.chapter === chapter);
      if (el && !reduce) {
        const r = el.getBoundingClientRect();
        const off = (innerHeight / 2 - (r.top + r.height / 2)) / innerHeight;
        V.scrub(Math.max(-0.6, Math.min(0.6, off * 0.45)));
      }
      // hero auto-advances through the lineup until the visitor takes over
      if (chapter === 'hero' && !railStopped && booted && !document.hidden) {
        railP += dt / RAIL_MS;
        if (railP >= 1) setModel(ORDER[(ORDER.indexOf(V.state.model.id) + 1) % ORDER.length]);
      }
      const active = $('.model-rail [aria-selected="true"]');
      if (active) active.style.setProperty('--p', railStopped ? 1 : Math.min(1, railP));
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  $$('[data-year]').forEach(el => el.textContent = new Date().getFullYear());
})();
