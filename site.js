// Velonix shared site script (index.html, Garage.html).
(function () {
  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var introDelay = root.classList.contains('boot-on') ? 2250 : 350;

  // Split headline letters first so the hidden heading never waits on anything else
  document.querySelectorAll('.split-text').forEach(function (el) {
    if (!reduceMotion) {
      var label = el.textContent.replace(/\s+/g, ' ').trim();
      var index = 0;
      (function walk(node) {
        Array.prototype.slice.call(node.childNodes).forEach(function (child) {
          if (child.nodeType === 1) { walk(child); return; }
          if (child.nodeType !== 3) return;
          var frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
            var word = document.createElement('span');
            word.className = 'word';
            word.setAttribute('aria-hidden', 'true');
            part.split('').forEach(function (letter) {
              var char = document.createElement('span');
              char.className = 'char';
              char.textContent = letter;
              char.style.setProperty('--i', index++);
              word.appendChild(char);
            });
            frag.appendChild(word);
          });
          node.replaceChild(frag, child);
        });
      }(el));
      el.setAttribute('aria-label', label);
    }
    el.classList.add('is-split');
  });

  // Shared site theme (same storage key as customize.html)
  var themeKey = 'velonix-theme';
  var toggle = document.querySelector('[data-theme-toggle]');
  function applyTheme(theme) {
    var light = theme === 'light';
    root.dataset.theme = light ? 'light' : 'dark';
    try { localStorage.setItem(themeKey, light ? 'light' : 'dark'); } catch (error) {}
    document.cookie = themeKey + '=' + (light ? 'light' : 'dark') + '; path=/; max-age=31536000; SameSite=Lax';
    if (!toggle) return;
    toggle.setAttribute('aria-pressed', String(light));
    toggle.title = light ? 'Switch to dark theme' : 'Switch to light theme';
    toggle.setAttribute('aria-label', toggle.title);
    toggle.innerHTML = '<span aria-hidden="true">' + (light ? '☾' : '☼') + '</span><span class="theme-label">' + (light ? 'Dark' : 'Light') + '</span>';
  }
  if (toggle) {
    toggle.addEventListener('click', function () {
      applyTheme(root.dataset.theme === 'light' ? 'dark' : 'light');
    });
  }
  applyTheme(root.dataset.theme || 'dark');

  // Footer year
  var year = document.querySelector('[data-year]');
  if (year) year.textContent = new Date().getFullYear();

  // ---------- Smooth scroll ----------
  var lenis = null;
  if (window.Lenis && !reduceMotion) {
    lenis = new window.Lenis({ duration: 1.2, easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); } });
  }
  var header = document.querySelector('.site-header');
  var curtain = document.querySelector('.curtain');

  document.addEventListener('click', function (event) {
    var link = event.target.closest('a[href]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target === '_blank') return;
    var href = link.getAttribute('href');

    // In-page anchors glide instead of jumping
    if (href.charAt(0) === '#') {
      var target = href === '#' ? 0 : document.querySelector(href);
      if (target === null) return;
      event.preventDefault();
      var offset = -(header ? header.offsetHeight : 0) - 8;
      if (lenis) lenis.scrollTo(target, { offset: offset });
      else window.scrollTo({ top: target === 0 ? 0 : target.getBoundingClientRect().top + window.scrollY + offset, behavior: 'smooth' });
      return;
    }

    // Other site pages: drop the curtain, then navigate
    if (reduceMotion || !curtain || link.origin !== window.location.origin || !/\.html$/i.test(link.pathname)) return;
    if (link.pathname === window.location.pathname && link.search === window.location.search) return;
    event.preventDefault();
    curtain.classList.add('cover');
    setTimeout(function () { window.location.href = link.href; }, 480);
  });
  // Coming back through the history cache: lift the curtain again
  window.addEventListener('pageshow', function (event) {
    if (event.persisted && curtain) curtain.classList.remove('cover');
  });

  // ---------- Scroll reveal ----------
  var items = document.querySelectorAll('.reveal');
  items.forEach(function (el) {
    var siblings = Array.prototype.filter.call(el.parentNode.children, function (sibling) { return sibling.classList.contains('reveal'); });
    if (siblings.length > 1) el.style.setProperty('--d', Math.min(siblings.indexOf(el), 6) * 0.1 + 's');
  });
  if (!('IntersectionObserver' in window)) {
    items.forEach(function (el) { el.classList.add('in'); });
  } else {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        el.classList.add('in');
        revealObserver.unobserve(el);
        // Hand transitions back to the element's own hover styles once revealed
        el.addEventListener('transitionend', function done(event) {
          if (event.target !== el || event.propertyName !== 'opacity') return;
          el.classList.remove('reveal', 'in');
          el.style.removeProperty('--d');
          el.removeEventListener('transitionend', done);
        });
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    items.forEach(function (el) { revealObserver.observe(el); });
  }

  if (reduceMotion) {
    var bar = document.querySelector('.site-header .progress');
    if (bar) window.addEventListener('scroll', function () {
      var max = root.scrollHeight - window.innerHeight;
      bar.style.transform = 'scaleX(' + (max > 0 ? window.scrollY / max : 0) + ')';
    }, { passive: true });
    return;
  }

  // ---------- Text effects: decode labels, count up numbers ----------
  var glyphs = '<>/\\[]{}=+*#_-01ABCDEFXV';
  function scramble(el) {
    var text = el.dataset.text || el.textContent;
    el.dataset.text = text;
    var start = null;
    var duration = 650 + text.length * 22;
    requestAnimationFrame(function step(time) {
      if (start === null) start = time;
      var progress = Math.min(1, (time - start) / duration);
      var out = '';
      for (var i = 0; i < text.length; i++) {
        var settled = i / text.length < progress * 1.2 - 0.15;
        out += text[i] === ' ' || settled ? text[i] : glyphs[(Math.random() * glyphs.length) | 0];
      }
      el.textContent = progress < 1 ? out : text;
      if (progress < 1) requestAnimationFrame(step);
    });
  }
  function countUp(el) {
    var target = parseFloat(el.dataset.count);
    var suffix = el.dataset.suffix || '';
    var start = null;
    requestAnimationFrame(function step(time) {
      if (start === null) start = time;
      var progress = Math.min(1, (time - start) / 1600);
      var eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      el.textContent = Math.round(target * eased) + suffix;
      if (progress < 1) requestAnimationFrame(step);
    });
  }
  var textTargets = document.querySelectorAll('.eyebrow, [data-scramble], [data-count]');
  document.querySelectorAll('[data-count]').forEach(function (el) { el.textContent = '0' + (el.dataset.suffix || ''); });
  if ('IntersectionObserver' in window) {
    var textObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        textObserver.unobserve(el);
        var inIntro = el.closest('.hero, .page-head');
        var delay = inIntro ? introDelay + (el.closest('.hero-strip') ? 900 : 0) : 200;
        setTimeout(function () { if (el.hasAttribute('data-count')) countUp(el); else scramble(el); }, delay);
      });
    }, { threshold: 0.6 });
    textTargets.forEach(function (el) { textObserver.observe(el); });
  }

  // ---------- Pointer effects (mouse / trackpad only) ----------
  var glow = null;
  var ring = null;
  var mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  var glowPos = { x: mouse.x, y: mouse.y };
  var ringPos = { x: mouse.x, y: mouse.y };

  if (finePointer) {
    glow = document.createElement('div');
    glow.className = 'cursor-glow';
    ring = document.createElement('div');
    ring.className = 'cursor-ring';
    document.body.appendChild(glow);
    document.body.appendChild(ring);
    window.addEventListener('pointermove', function (event) {
      mouse.x = event.clientX;
      mouse.y = event.clientY;
      root.classList.add('cursor-on');
    }, { passive: true });
    document.addEventListener('mouseout', function (event) { if (!event.relatedTarget) root.classList.remove('cursor-on'); });
    document.addEventListener('pointerover', function (event) {
      ring.classList.toggle('hover', !!event.target.closest('a, button, .fx-card'));
    });

    // Cards tilt toward the cursor with a spotlight border
    document.querySelectorAll('.vehicle-card, .feature-card, .sig-card').forEach(function (card) {
      card.classList.add('fx-card');
      card.addEventListener('pointermove', function (event) {
        var rect = card.getBoundingClientRect();
        var x = (event.clientX - rect.left) / rect.width;
        var y = (event.clientY - rect.top) / rect.height;
        card.classList.add('tilting');
        card.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
        card.style.setProperty('--my', (y * 100).toFixed(1) + '%');
        card.style.setProperty('--rx', ((0.5 - y) * 7).toFixed(2) + 'deg');
        card.style.setProperty('--ry', ((x - 0.5) * 9).toFixed(2) + 'deg');
      });
      card.addEventListener('pointerleave', function () {
        card.classList.remove('tilting');
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ry', '0deg');
      });
    });

    // Hero stage leans toward the cursor; the car shifts the other way for depth
    var stage = document.querySelector('.stage-wrap');
    var hero = document.querySelector('.hero');
    if (stage && hero) {
      hero.addEventListener('pointermove', function (event) {
        var rect = stage.getBoundingClientRect();
        var x = Math.max(-1, Math.min(1, (event.clientX - (rect.left + rect.width / 2)) / rect.width));
        var y = Math.max(-1, Math.min(1, (event.clientY - (rect.top + rect.height / 2)) / rect.height));
        stage.style.setProperty('--ry', (x * 10).toFixed(2) + 'deg');
        stage.style.setProperty('--rx', (-y * 8).toFixed(2) + 'deg');
        stage.style.setProperty('--ix', (-x * 16).toFixed(1) + 'px');
        stage.style.setProperty('--iy', (-y * 12).toFixed(1) + 'px');
      });
      hero.addEventListener('pointerleave', function () {
        ['--rx', '--ry', '--ix', '--iy'].forEach(function (prop) { stage.style.removeProperty(prop); });
      });
    }

    // Buttons lean toward the cursor
    document.querySelectorAll('.btn').forEach(function (button) {
      button.addEventListener('pointermove', function (event) {
        var rect = button.getBoundingClientRect();
        button.style.translate = ((event.clientX - rect.left - rect.width / 2) * 0.18).toFixed(1) + 'px ' + ((event.clientY - rect.top - rect.height / 2) * 0.3).toFixed(1) + 'px';
      });
      button.addEventListener('pointerleave', function () { button.style.translate = ''; });
    });
  }

  // ---------- Frame loop: smooth scroll, parallax, progress, ticker, cursor ----------
  var parallax = Array.prototype.map.call(document.querySelectorAll('.split .media, .cta .media, .vehicle-card .media'), function (media) {
    media.classList.add('parallax');
    return media.querySelector('img');
  });
  var progressBar = document.querySelector('.site-header .progress');
  var skewEl = document.querySelector('.ticker-skew');
  var lastY = -1;
  var skew = 0;

  function frame(time) {
    if (lenis) lenis.raf(time);
    var y = window.scrollY;
    var vh = window.innerHeight;

    if (y !== lastY) {
      if (progressBar) {
        var max = root.scrollHeight - vh;
        progressBar.style.transform = 'scaleX(' + (max > 0 ? y / max : 0).toFixed(4) + ')';
      }
      parallax.forEach(function (img) {
        if (!img) return;
        var rect = img.parentNode.getBoundingClientRect();
        if (rect.bottom < -100 || rect.top > vh + 100) return;
        var centre = (rect.top + rect.height / 2 - vh / 2) / vh;
        img.style.translate = '0 ' + (centre * -36).toFixed(1) + 'px';
      });
    }

    if (skewEl) {
      var velocity = lenis ? lenis.velocity : (lastY < 0 ? 0 : y - lastY);
      skew += (Math.max(-10, Math.min(10, velocity * 0.35)) - skew) * 0.12;
      skewEl.style.transform = Math.abs(skew) < 0.01 ? '' : 'skewX(' + (-skew).toFixed(2) + 'deg)';
    }
    lastY = y;

    if (glow) {
      glowPos.x += (mouse.x - glowPos.x) * 0.08;
      glowPos.y += (mouse.y - glowPos.y) * 0.08;
      ringPos.x += (mouse.x - ringPos.x) * 0.25;
      ringPos.y += (mouse.y - ringPos.y) * 0.25;
      glow.style.transform = 'translate3d(' + glowPos.x.toFixed(1) + 'px,' + glowPos.y.toFixed(1) + 'px,0)';
      ring.style.transform = 'translate3d(' + ringPos.x.toFixed(1) + 'px,' + ringPos.y.toFixed(1) + 'px,0)';
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}());
