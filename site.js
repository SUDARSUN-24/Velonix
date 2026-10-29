// Velonix shared site script (index.html, Garage.html).
(function () {
  // Shared site theme (same storage key as customize.html)
  var themeKey = 'velonix-theme';
  var toggle = document.querySelector('[data-theme-toggle]');
  function applyTheme(theme) {
    var light = theme === 'light';
    document.documentElement.dataset.theme = light ? 'light' : 'dark';
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
      applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
    });
  }
  applyTheme(document.documentElement.dataset.theme || 'dark');

  // Footer year
  var year = document.querySelector('[data-year]');
  if (year) year.textContent = new Date().getFullYear();

  // Scroll reveal (the head script adds .js; without it everything stays visible)
  var items = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    items.forEach(function (el) { el.classList.add('in'); });
    return;
  }
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var el = entry.target;
      el.classList.add('in');
      observer.unobserve(el);
      // Hand transitions back to the element's own hover styles once revealed
      el.addEventListener('transitionend', function done(event) {
        if (event.target !== el || event.propertyName !== 'opacity') return;
        el.classList.remove('reveal', 'in');
        el.removeEventListener('transitionend', done);
      });
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  items.forEach(function (el) { observer.observe(el); });
}());
