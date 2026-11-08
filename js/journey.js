// Dot journey (home). After the chapters one travelling dot carries the logo dot down the page:
// last chapter → process edge → step 03 → pricing edge (card edge on mobile) → last package edge → special edge → triangles
// → into the services ticker (it disappears among the ticker dots) → the first ticker dot that passes right above
// the CTA dot drops into it → CTA (holds until the CTA is 95% out of view) → falls onto the line above the footer,
// hops low along it to the right → waits on screen (never above HOLD_Y) until the footer logo comes into view →
// falls into the footer logo dot, landing exactly at the end of the page.
// Phones (stacked footer): from the line it bounces down the footer's two dividers, then lands in the logo dot
// and bounces twice before it rests (the rebounds run in time, in footer.js: at the end of the page nobody scrolls).
// Every stop holds: the next move starts only when the next section has come about a fifth into view.
// While the traveller rests on a real dot, that dot shows itself (package hop, CTA rings, footer bounce keep working).
(() => {
  const { $, $$, motion, gsapReady, root, on, emit } = WF;
  if (!motion || !gsapReady) return;

  const ENTER = .82;          // a move starts when its section's top reaches 82% of the viewport (18% in view)
  const ROLL = .4;            // scroll length of the hops along the footer line, in viewport heights
  const HOPS = 4;             // low hops along the footer line
  const HOP_H = 16;           // px: height of the first hop; each next one is lower
  const FOOTER_LEAD = 1.25;   // the descent starts when the footer logo is this many viewport heights below the top
  const HOLD_Y = .3;          // while it waits for the footer logo the dot stays at least this far down the screen
  const STACKED = matchMedia('(max-width: 900px)');   // the footer columns stack with dividers (footer.css)
  const STEP_IN = .95;        // a divider step starts when the divider is this far down the screen
  const STEP_AT = .7;         // and lands when it is here
  const CTA_OUT = .05;        // the CTA dot holds until only this share of the CTA is left in view
  const MIN_SCROLL = .12;     // shortest scroll length of any move
  const EDGE_AT = .55;        // share of a move spent falling to the section edge
  const EDGE_REACH = .6;      // a stop deeper than this (viewport heights) below its section top lands on its own card
  const FALL = .2;            // shortest scroll length of the fall from the CTA to the footer line, in viewport heights
  const DROP_TIME = 900;      // ms: a ticker dot falling into the CTA
  const WAIT_MAX = 600;        // ms: longest wait for a ticker dot right above the CTA dot; then the nearest drops
  const ALIGN = 4;            // px: a ticker dot counts as above the CTA dot within this distance
  const END_SLACK = 2;        // px: this close to the bottom counts as the bottom
  const RESIZE_WAIT = 150;    // ms: replan once the height has settled
  const BASE = 100;           // the overlay is drawn at 100px and scaled

  const el = name => $(`[data-journey="${name}"]`);
  const chapterDot = $$('.chapter-dot').pop();
  const parts = {
    process: $('.process'), pricing: $('.pricing'), special: $('.special-teaser'),
    ticker: $('.ticker'), cta: $('.cta'), testimonials: $('.testimonials'), footer: $('.footer'),
    card: $('.package--last'), shape: $('.special-teaser svg'),
  };
  const stops = {
    chapter: chapterDot, step3: el('step-3'), package: el('package'), special: el('special'),
    cta: el('cta'), line: el('line'), footer: $('.footer-logo .logo-dot'),
  };
  if (Object.values(parts).concat(Object.values(stops)).some(x => !x)) return;
  const tickerDots = $$('.ticker-dot', parts.ticker);

  document.body.classList.add('has-journey');
  const dot = document.createElement('div');
  dot.className = 'journey-dot';
  dot.setAttribute('aria-hidden', 'true');
  document.body.appendChild(dot);

  // ---------- Geometry ----------
  const lerp = (a, b, p) => a + (b - a) * p;
  const clamp = p => Math.min(1, Math.max(0, p));
  const easeIn = p => p * p;
  const easeOut = p => 1 - (1 - p) * (1 - p);
  const bounceOut = p => {
    const n = 7.5625, d = 2.75;
    if (p < 1 / d) return n * p * p;
    if (p < 2 / d) return n * (p -= 1.5 / d) * p + .75;
    if (p < 2.5 / d) return n * (p -= 2.25 / d) * p + .9375;
    return n * (p -= 2.625 / d) * p + .984375;
  };
  const center = node => {
    const r = node.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, d: Math.max(r.width, r.height) };
  };
  const top = node => node.getBoundingClientRect().top;
  const docTop = node => top(node) + scrollY;
  const at = (node, share) => {
    const r = node.getBoundingClientRect();
    return r.top + scrollY + r.height / 2 - innerHeight * share;
  };

  // ---------- Path shapes (p: 0 → 1) ----------
  // falls onto the top edge of a section (above its stop), bounces, then drops into the stop
  const viaEdge = edgeOf => (a, b, p) => {
    const edge = { x: b.x, y: top(edgeOf) };
    if (p < EDGE_AT) {
      const q = p / EDGE_AT;
      return { x: lerp(a.x, edge.x, easeOut(q)), y: lerp(a.y, edge.y - b.d / 2, easeIn(q)) };
    }
    const q = (p - EDGE_AT) / (1 - EDGE_AT);
    const hop = Math.max(40, b.d * 2.5) * Math.sin(Math.PI * Math.min(1, q * 1.6)) * (q < .62 ? 1 : 0);
    return { x: b.x, y: lerp(edge.y - b.d / 2, b.y, easeIn(clamp((q - .3) / .7))) - hop };
  };
  const drop = (a, b, p) => ({ x: lerp(a.x, b.x, easeOut(p)), y: lerp(a.y, b.y, easeIn(p)) });
  // an even descent: the last move is short, an eased one would bunch up at the very end of the page
  const settle = (a, b, p) => ({ x: lerp(a.x, b.x, easeOut(p)), y: lerp(a.y, b.y, p) });
  const fallBounce = (a, b, p) => ({ x: lerp(a.x, b.x, easeOut(p)), y: lerp(a.y, b.y, bounceOut(p)) });
  // low hops along a line, each one lower than the one before
  const hops = (a, b, p) => ({ x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p) - HOP_H * Math.abs(Math.sin(Math.PI * HOPS * p)) * (1 - p * .7) });
  // landing squash at the end of a move
  const squash = p => 1 - .3 * Math.max(0, Math.sin(Math.PI * clamp((p - .9) / .1)));

  // points on the footer line: under the CTA dot, and under the footer dot
  const lineUnder = node => () => ({ x: center(node).x, y: top(stops.line) - 10, d: 0 });
  // on the line under the footer dot, until the line scrolls above HOLD_Y: then the dot stays there on screen
  // (on phones the footer is taller than the screen, so the line and the footer logo are never in view together)
  const held = () => ({ x: center(stops.footer).x, y: Math.max(top(stops.line) - 10, innerHeight * HOLD_Y), d: 0 });

  // ---------- Moves ----------
  // from/to: a stop element (real, shows itself while resting) or a point function (virtual)
  let moves = [];
  // the edge a move lands on: the section top, or the stop's own card/shape when the section is taller than
  // the screen (stacked mobile layout), so the edge is still in view when the dot reaches it
  const edgeOf = (section, near, stop) => docTop(stop) - docTop(section) > innerHeight * EDGE_REACH ? near : section;
  function plan() {
    const vh = innerHeight;
    const pricingEdge = edgeOf(parts.pricing, parts.card, stops.package);
    const specialEdge = edgeOf(parts.special, parts.shape, stops.special);
    const lineEnd = docTop(stops.line) - vh * .8;
    const ctaOut = docTop(parts.cta) + parts.cta.offsetHeight - vh * CTA_OUT;
    const maxScroll = root.scrollHeight - vh;
    const list = [
      { from: stops.chapter, to: stops.step3, shape: viaEdge(parts.process), start: docTop(parts.process) - vh * ENTER, end: at(stops.step3, .6) },
      { from: stops.step3, to: stops.package, shape: viaEdge(pricingEdge), start: docTop(pricingEdge) - vh * ENTER, end: at(stops.package, .5) },
      { from: stops.package, to: stops.special, shape: viaEdge(specialEdge), start: docTop(specialEdge) - vh * ENTER, end: at(stops.special, .5) },
      { from: stops.special, to: () => ({ ...center(parts.ticker), x: center(stops.special).x, d: center(tickerDots[0]).d }), shape: drop, swallow: true, start: docTop(parts.ticker) - vh * .95, end: at(parts.ticker, .35) },
      { from: stops.cta, to: lineUnder(stops.cta), shape: fallBounce, start: ctaOut, end: Math.max(lineEnd, ctaOut + vh * FALL), needsCta: true },
    ];
    const footerEnd = Math.min(maxScroll, at(stops.footer, .82));
    const cols = $$('.footer-col', parts.footer);
    if (STACKED.matches && cols.length >= 3) {
      // on the divider above a footer column, a share of the way from the CTA side to the logo side
      const onDivider = (col, share) => () => ({
        x: lerp(center(stops.cta).x, center(stops.footer).x, share),
        y: top(col) - 6,
        d: 0,
      });
      const first = onDivider(cols[1], 1 / 3), second = onDivider(cols[2], 2 / 3);
      list.push(
        { from: lineUnder(stops.cta), to: first, shape: fallBounce, start: docTop(cols[1]) - vh * STEP_IN, end: docTop(cols[1]) - vh * STEP_AT },
        { from: first, to: second, shape: fallBounce, start: docTop(cols[2]) - vh * STEP_IN, end: docTop(cols[2]) - vh * STEP_AT },
        { from: second, to: stops.footer, shape: drop, start: docTop(stops.footer) - vh, end: footerEnd },
      );
    } else {
      list.push(
        { from: lineUnder(stops.cta), to: held, shape: hops, length: ROLL },
        // the descent starts just before the footer logo enters the screen and ends as the page ends
        { from: held, to: stops.footer, shape: settle, start: docTop(stops.footer) - vh * FOOTER_LEAD, end: footerEnd },
      );
    }
    let cursor = -Infinity;
    moves = list.map(m => {
      const start = Math.max(cursor, m.start ?? cursor);
      const end = Math.max(start + vh * MIN_SCROLL, m.length ? start + vh * m.length : m.end);
      cursor = end;
      return { ...m, start, end };
    });
    const last = moves[moves.length - 1];
    if (last.end > maxScroll) {
      last.end = maxScroll;
      last.start = Math.min(last.start, maxScroll - vh * MIN_SCROLL);
    }
  }

  // ---------- The CTA drop: timed, because the ticker moves by itself ----------
  // waiting → the first ticker dot right above the CTA dot falls → landed. Scrolling back above the ticker resets it.
  let landed = false, swallowedAt = 0;
  let ctaState = 'waiting', dropStart = 0, dropFrom = null, loop = 0;

  // the ticker dot right above the CTA dot; once WAIT_MAX has passed, the nearest one in view
  function tickerSource(waited) {
    const target = center(stops.cta).x;
    const band = parts.ticker.getBoundingClientRect();
    const inView = tickerDots.filter(d => {
      const c = center(d);
      return c.x > Math.max(0, band.left) && c.x < Math.min(innerWidth, band.right);
    });
    const aligned = inView.find(d => Math.abs(center(d).x - target) <= ALIGN);
    if (aligned || waited < WAIT_MAX) return aligned;
    return inView.sort((a, b) => Math.abs(center(a).x - target) - Math.abs(center(b).x - target))[0];
  }

  // ---------- Render ----------
  const reals = Object.values(stops).filter(x => x instanceof Element && x !== stops.line);
  const showReal = shown => reals.forEach(node => node.style.opacity = shown.includes(node) ? '' : '0');
  const point = target => typeof target === 'function' ? target() : center(target);

  function place(pos, size, sy = 1) {
    const s = size / BASE;
    dot.style.transform = `translate(${pos.x - BASE / 2}px, ${pos.y - BASE / 2}px) scale(${s * (2 - sy)}, ${s * sy})`;
    dot.classList.add('is-active');
  }
  const hide = () => dot.classList.remove('is-active');

  // size: real stops have their own; virtual points keep the size of the last real stop before them
  function sizes(index) {
    let carried = 0;
    for (let i = 0; i <= index; i++) {
      if (moves[i].from instanceof Element) carried = center(moves[i].from).d;
    }
    const to = moves[index].to;
    const toSize = to instanceof Element ? center(to).d : (point(to).d || carried);
    return [carried, toSize];
  }

  function render(now) {
    raf = 0;
    // the bottom of the page as it is now: on phones it moves when the address bar shows or hides
    const bottom = root.scrollHeight - innerHeight;
    // phones can stop a fraction of a pixel short of the bottom: count that as the bottom
    const y = bottom - scrollY < END_SLACK ? bottom : scrollY;
    let index = -1;
    const span = i => {
      // no move may end below the real bottom of the page, or it could never finish
      const end = Math.min(moves[i].end, bottom);
      return [Math.min(moves[i].start, end - 1), end];
    };
    for (let i = 0; i < moves.length; i++) if (y >= span(i)[0]) index = i;

    if (index < 0) {
      hide();
      showReal(reals);
      ctaState = 'waiting';
      return;
    }
    const m = moves[index];
    const [start, end] = span(index);
    const p = clamp((y - start) / (end - start));
    // above the ticker again: the CTA drop can happen once more
    if (index < 3 || (m.swallow && p < 1)) {
      ctaState = 'waiting';
      swallowedAt = 0;
    }

    // swallowed by the ticker: hidden until a ticker dot drops into the CTA
    if (m.swallow && p >= 1) {
      if (ctaState === 'waiting') {
        const t = now || performance.now();
        if (!swallowedAt) swallowedAt = t;
        const source = tickerSource(t - swallowedAt);
        if (source) {
          ctaState = 'dropping';
          dropStart = now || performance.now();
          dropFrom = center(source);
        }
      }
      if (ctaState === 'dropping') {
        const q = clamp(((now || performance.now()) - dropStart) / DROP_TIME);
        const b = center(stops.cta);
        place(fallBounce(dropFrom, b, q), lerp(dropFrom.d, b.d, q));
        showReal([]);
        if (q >= 1) ctaState = 'landed';
      }
      if (ctaState === 'landed') {
        hide();
        showReal([stops.cta]);
      } else if (ctaState === 'waiting') {
        hide();
        showReal([]);
      }
      // keep watching the moving ticker
      if (ctaState !== 'landed') keepAlive();
      return;
    }
    // past the ticker before a dot dropped: the CTA dot is simply there
    if (m.needsCta) ctaState = 'landed';

    // resting on a real stop: it shows itself. Arriving in the footer logo, the logo dot takes over the fall
    // and bounces (footer.js).
    const inFooter = p >= 1 && m.to === stops.footer;
    if (inFooter && !landed) emit('footer-land');
    landed = inFooter;
    if (p >= 1 && m.to instanceof Element) {
      hide();
      showReal([m.to]);
      return;
    }
    const [sizeA, sizeB] = sizes(index);
    const a = point(m.from), b = point(m.to);
    place(m.shape(a, b, p), lerp(sizeA, sizeB, p), squash(p));
    showReal([]);
  }

  let raf = 0;
  const request = () => {
    if (!raf) raf = requestAnimationFrame(render);
  };
  function keepAlive() {
    cancelAnimationFrame(loop);
    loop = requestAnimationFrame(now => {
      loop = 0;
      render(now);
    });
  }

  addEventListener('scroll', request, { passive: true });
  // ScrollTrigger ignores the phone address bar (ignoreMobileResize), so replan on any height change here
  let resizeTimer = 0;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      plan();
      request();
    }, RESIZE_WAIT);
  });
  ScrollTrigger.addEventListener('refresh', () => {
    plan();
    render();
  });
  on('layout', () => {
    plan();
    request();
  });
  plan();
  render();
})();
