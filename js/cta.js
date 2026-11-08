// CTA rings around the dot.
// Mouse inside the section: its distance to the dot sets how many rings show.
// Otherwise (touch, or mouse outside) a loop runs: one ring at a time outwards, light zoom, fade out.
(() => {
  const { $, $$, motion } = WF;
  const section = $('.cta');
  const icon = $('.cta-icon');
  const group = $('.cta .rings');
  const rings = $$('.cta .ring');
  const dot = $('.cta .dot');

  const RADII = rings.map(r => +r.getAttribute('r'));
  const LAST = RADII[RADII.length - 1];
  const CYCLE = 3.8;      // loop length (s)
  const STAGGER = .26;    // delay between rings (s)
  const FADE_AT = 1.55;   // fade-out start (s)
  const FADE_FOR = 1.5;   // fade-out length (s)

  const clamp = x => Math.min(1, Math.max(0, x));
  const easeOut = x => 1 - Math.pow(1 - x, 3);
  const smooth = (a, b, x) => {
    const t = clamp((x - a) / (b - a));
    return t * t * (3 - 2 * t);
  };

  const opacity = rings.map(() => 0);
  const scale = rings.map(() => .9);
  let groupScale = 1, running = false, start = 0, raf = 0, hovering = false, distance = 1e4;

  // target opacity and scale of each ring, and the group zoom
  function targets(now) {
    if (hovering) {
      const o = RADII.map(r => smooth(r - 34, r + 14, distance));
      return { o, s: o.map((v, i) => .86 + .14 * v + i * .004), g: 1 + .05 * smooth(LAST, LAST + 320, distance) };
    }
    const t = ((now - start) / 1000) % CYCLE;
    const fade = smooth(0, 1, (t - FADE_AT) / FADE_FOR);
    const o = [], s = [];
    RADII.forEach((r, i) => {
      const age = t - i * STAGGER;
      const p = easeOut(clamp(age / .55));
      o.push((age < 0 ? 0 : p) * (1 - fade));
      s.push(.9 + .1 * p + Math.max(0, age) * .014 * (1 + i * .18) + .04 * fade);
    });
    return { o, s, g: 1 + .035 * smooth(0, 1, t / (FADE_AT + FADE_FOR)) };
  }

  function frame(now) {
    if (!running) return;
    const { o, s, g } = targets(now);
    const k = hovering ? .1 : .5;
    rings.forEach((ring, i) => {
      opacity[i] += (o[i] - opacity[i]) * k;
      scale[i] += (s[i] - scale[i]) * k;
      ring.style.opacity = opacity[i].toFixed(3);
      ring.style.transform = `scale(${scale[i].toFixed(4)})`;
    });
    groupScale += (g - groupScale) * k;
    group.style.transform = `scale(${groupScale.toFixed(4)})`;
    dot.classList.toggle('is-hover', hovering && distance < 40);
    raf = requestAnimationFrame(frame);
  }

  function play() {
    if (running) return;
    running = true;
    start = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  if (!motion) return;

  rings.forEach(r => r.style.opacity = 0);

  // distance from the mouse to the dot, in icon units (viewBox 1000)
  section.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    hovering = true;
    const r = icon.getBoundingClientRect();
    distance = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)) / (r.width / 1000);
  });
  section.addEventListener('pointerleave', () => {
    hovering = false;
    start = performance.now();
  });

  // runs only while visible
  new IntersectionObserver(entries => entries.forEach(e => {
    if (!e.isIntersecting) return stop();
    setTimeout(() => {
      if (section.classList.contains('is-visible')) play();
    }, 900);
  }), { rootMargin: '0px 0px -20% 0px' }).observe(section);

  WF.enter(section, () => {
    setTimeout(play, 900);
    setTimeout(() => dot.classList.add('is-landed'), 1000);
  });
})();
