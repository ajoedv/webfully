// Nav: theme toggle, services dropdown, mobile menu, floating rectangle, active link
(() => {
  const { $, $$, root, emit, on } = WF;
  const nav = $('.nav');

  // Theme: auto → light → dark, saved in the browser (emits wf:theme). Labels come from the page language.
  // Without the button (site.json → theme_switch false) the page stays light.
  const MODES = ['auto', 'light', 'dark'];
  const themeButton = $('.theme-toggle');
  if (themeButton) setupTheme();
  else emit('theme', 'light');

  function setupTheme() {
    const LABELS = JSON.parse(themeButton.dataset.labels);
    const systemDark = matchMedia('(prefers-color-scheme: dark)');
    let mode = root.dataset.mode || 'auto';

    function applyTheme() {
      root.dataset.mode = mode;
      root.dataset.theme = mode === 'auto' ? (systemDark.matches ? 'dark' : 'light') : mode;
      themeButton.querySelector('span').textContent = LABELS[mode];
      themeButton.setAttribute('aria-label', LABELS.prefix + ': ' + LABELS[mode]);
      try {
        localStorage.setItem('wf-theme', mode);
      } catch (e) {}
      emit('theme', mode);
    }

    themeButton.addEventListener('click', () => {
      mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
      applyTheme();
    });
    systemDark.addEventListener('change', () => {
      if (mode === 'auto') applyTheme();
    });
    applyTheme();
  }

  // Services dropdown: click or keyboard opens it, hover opens it on desktop; Escape and outside clicks close it
  const servicesToggle = $('.nav-services-toggle');
  const servicesPanel = $('.nav-services');
  const HOVER_CLOSE_DELAY = 220;
  let hoverTimer = 0;
  const setServices = open => {
    servicesToggle.setAttribute('aria-expanded', open);
    servicesPanel.classList.toggle('is-open', open);
  };
  // On the home page "Services" also scrolls to the first chapter (every nav item there leads to a part of the page)
  const servicesTarget = new URL(servicesToggle.dataset.target, location.href);
  const onHome = servicesTarget.pathname === location.pathname;
  servicesToggle.addEventListener('click', () => {
    if (onHome) {
      const chapters = document.getElementById(servicesTarget.hash.slice(1));
      scrollTo({ top: chapters.getBoundingClientRect().top + scrollY, behavior: WF.motion ? 'smooth' : 'auto' });
      setServices(true);
      return;
    }
    setServices(servicesToggle.getAttribute('aria-expanded') !== 'true');
  });
  const item = servicesToggle.parentElement;
  item.addEventListener('pointerenter', e => {
    if (e.pointerType !== 'mouse') return;
    clearTimeout(hoverTimer);
    setServices(true);
  });
  item.addEventListener('pointerleave', e => {
    if (e.pointerType !== 'mouse') return;
    hoverTimer = setTimeout(() => setServices(false), HOVER_CLOSE_DELAY);
  });
  item.addEventListener('focusout', e => {
    if (!item.contains(e.relatedTarget)) setServices(false);
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || servicesToggle.getAttribute('aria-expanded') !== 'true') return;
    setServices(false);
    servicesToggle.focus();
  });
  document.addEventListener('click', e => {
    if (!item.contains(e.target)) setServices(false);
  });

  // Mobile menu: closes when an anchor link scrolls or Escape is pressed
  const menuToggle = $('.menu-toggle');
  const setMenu = open => {
    document.body.classList.toggle('is-menu-open', open);
    menuToggle.setAttribute('aria-expanded', open);
  };
  menuToggle.addEventListener('click', () => setMenu(!document.body.classList.contains('is-menu-open')));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.body.classList.contains('is-menu-open')) {
      setMenu(false);
      menuToggle.focus();
    }
  });
  on('navigate', () => setMenu(false));

  // Floating rectangle. Home: when the hero logo faces the visitor (wf:float from hero.js).
  // Other pages, or the home page without the scene: from the first scrolled pixel.
  const FLOAT_FROM = 1;
  const heroDrives = !!$('.hero-scene') && WF.motion;
  if (heroDrives) {
    on('float', floating => nav.classList.toggle('is-floating', floating));
  } else {
    const updateFloat = () => nav.classList.toggle('is-floating', scrollY >= FLOAT_FROM);
    addEventListener('scroll', updateFloat, { passive: true });
    updateFloat();
  }

  // Current page: links with data-nav that point to this page; on the home page a section link while that
  // section is under the spy line, otherwise Home
  const links = $$('[data-nav]');
  const path = location.pathname;
  const pageLinks = links.filter(a => new URL(a.href, location.href).pathname === path && !new URL(a.href, location.href).hash);
  $$('.nav-service, .menu-service').forEach(a => a.classList.toggle('is-active', new URL(a.href).pathname === path));
  // a service page: "Services" is the active nav item, its own service is active in the dropdown
  if ($('.nav-service.is-active')) pageLinks.push(servicesToggle);

  const spy = $$('section[id]').filter(s => links.some(a => a.hash === '#' + s.id));
  const SPY_LINE = .45;
  let raf = 0;

  function updateActive() {
    raf = 0;
    let current = pageLinks;
    const lineY = innerHeight * SPY_LINE;
    spy.forEach(section => {
      const r = section.getBoundingClientRect();
      if (r.top < lineY && r.bottom > lineY) current = links.filter(a => a.hash === '#' + section.id);
    });
    links.forEach(a => a.classList.toggle('is-active', current.includes(a)));
  }

  addEventListener('scroll', () => {
    if (!raf) raf = requestAnimationFrame(updateActive);
  }, { passive: true });
  on('layout', updateActive);
  updateActive();
})();
