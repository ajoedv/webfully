// Base: WF object, events, section entry, reveal, anchor scrolling (also on arrival from another page)
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const root = document.documentElement;

  // GSAP drives the home scenes. Pages that need it fall back to the static version when it is missing.
  const gsapReady = !!window.gsap && !!window.ScrollTrigger;
  const needsGsap = !!$('.hero-scene');
  const motion = root.classList.contains('motion') && (gsapReady || !needsGsap);
  if (!motion) root.classList.remove('motion');
  if (gsapReady) gsap.registerPlugin(ScrollTrigger);

  // Parts talk through `wf:<name>` events on document
  const emit = (name, detail) => document.dispatchEvent(new CustomEvent('wf:' + name, { detail }));
  const on = (name, fn) => document.addEventListener('wf:' + name, e => fn(e.detail));

  // st: hero ScrollTrigger (set by hero.js) · navH: nav height at the last hero layout
  const WF = window.WF = { $, $$, root, motion, gsapReady, emit, on, st: null, navH: 0 };

  // Adds `.is-visible` to each element the first time it enters the viewport, then runs fn
  const observe = (els, options, fn) => {
    const io = new IntersectionObserver(entries => entries.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-visible');
      io.unobserve(e.target);
      if (fn) fn(e.target);
    }), options);
    els.forEach(el => io.observe(el));
  };

  // Section entry: `.is-visible` once 20% of the section is inside the viewport, then fn runs
  WF.enter = (el, fn) => {
    if (!('IntersectionObserver' in window)) return el.classList.add('is-visible');
    observe([el], { rootMargin: '0px 0px -20% 0px' }, fn);
  };

  // Reveal: only text after the hero fades in; buttons and shapes show at once
  const REVEAL_STAGGER = .15;
  if (motion && 'IntersectionObserver' in window) {
    const els = $$([
      '.chapter-label', '.chapter-body > :not(.btn)', '.chapter-tags',
      '.process-head > *', '.step-no', '.step h3', '.step p',
      '.pricing-head > *', '.special-teaser-copy > :not(.btn)',
      '.section-head > *', '.section-head > div > *', '.capabilities-head > *', '.proof-copy > *',
      '.cta-label', '.cta-copy > :not(.btn)',
      '.footer-cols > *', '.footer-social', '.footer-bottom',
    ].join());
    els.forEach(el => {
      const siblings = [...el.parentElement.children].filter(c => els.includes(c));
      el.classList.add('reveal');
      el.style.setProperty('--reveal-delay', siblings.indexOf(el) * REVEAL_STAGGER + 's');
    });
    // no negative margin: elements at the very bottom of the page must still reach the zone
    observe(els, { threshold: .2 });
  }

  // Process: the step lines draw in when the section enters (process.css)
  $$('.process').forEach(el => WF.enter(el));

  // Anchor links scroll smoothly; the chapters start right at the top, other sections under the nav
  const sectionTop = el => {
    if (el.classList.contains('hero') || el.matches('main')) return 0;
    const flush = el.classList.contains('chapters');
    return el.getBoundingClientRect().top + scrollY - (flush ? 0 : WF.navH || $('.nav').offsetHeight);
  };
  const goTo = (el, smooth) => {
    scrollTo({ top: sectionTop(el), behavior: smooth && motion ? 'smooth' : 'auto' });
    if (el.matches('main')) el.focus({ preventScroll: true });
  };

  // Links to a part of this page, written as "#id" or as "/page/#id" (the nav uses the full form on every page)
  $$('a[href*="#"]').forEach(a => a.addEventListener('click', e => {
    const link = new URL(a.href, location.href);
    if (link.pathname !== location.pathname || !link.hash) return;
    const el = document.getElementById(decodeURIComponent(link.hash.slice(1)));
    if (!el) return;
    e.preventDefault();
    emit('navigate', el.id);
    history.replaceState(null, '', link.hash);
    goTo(el, true);
  }));

  // Arriving from another page with "#id": the browser jumps before the pinned scenes add their height,
  // so the jump lands too early. Jump again once the layout has settled (after load and the ScrollTrigger refresh).
  const arrival = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if (arrival) {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    const settle = () => requestAnimationFrame(() => goTo(arrival, false));
    addEventListener('load', () => {
      if (gsapReady) {
        ScrollTrigger.addEventListener('refresh', function once() {
          ScrollTrigger.removeEventListener('refresh', once);
          settle();
        });
        ScrollTrigger.refresh();
      } else {
        settle();
      }
    });
    if (document.fonts) document.fonts.ready.then(settle);
  }
})();
