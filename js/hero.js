// Hero: 3D logo, pinned scroll scene, window into the intro, parallax at rest
(() => {
  const { $, $$, root, motion, emit, on } = WF;

  // ---------- Logo geometry (logo units 1000 × 921.484) ----------
  const LW = 1000, LH = 921.484;
  const LAYERS = 14;   // stacked layers that give each piece its thickness
  const FRAME = [
    [0, 0], [0, 272.5], [95.729, 272.5], [95.729, 95.729], [904.271, 95.729],
    [904.271, 825.755], [663.811, 825.755], [663.811, 921.484], [1000, 921.484], [1000, 0],
  ];
  const LETTER = [
    [0, 921.484], [0, 417.58], [95.729, 417.58], [95.729, 774.754], [177.716, 643.937],
    [234.204, 553.804], [290.692, 643.937], [371.993, 773.661], [371.993, 417.58], [467.723, 417.58],
    [467.723, 921.484], [351.661, 921.484], [234.204, 734.069], [116.747, 921.484],
  ];
  const DOT_X = 565.233, SEAT_Y = 872.729;

  // clip-path polygon of points, relative to a box
  const polygon = (pts, [bx, by, bw, bh]) => 'polygon(' +
    pts.map(([x, y]) => ((x - bx) / bw * 100).toFixed(3) + '% ' + ((y - by) / bh * 100).toFixed(3) + '%').join(',') + ')';

  // box: [x, y, w, h]; points: clip outline. The frame's two closing edges are separate pieces so they can draw in.
  const PIECES = {
    frame: { cls: 'frame', box: [0, 0, 1000, LH], points: FRAME },
    edgeLeft: { cls: 'edge-left', box: [0, 272.5, 95.729, LH - 272.5] },
    edgeBottom: { cls: 'edge-bottom', box: [95.729, 825.755, 568.082, 95.729] },
    letter: { cls: 'letter', box: [0, 417.58, 467.723, 503.904], points: LETTER, coral: true },
    dot: { cls: 'dot', box: [516.478, 823.974, 97.51, 97.51], coral: true, round: true },
  };

  // The 3D logo has its own lighting and does not follow the site's flat palette
  const LIGHT_FACE = 'linear-gradient(135deg,#FFFFFF 0%,#F4F2EF 40%,#D8D3CC 100%)';
  const DARK_FACE = 'linear-gradient(135deg,#4A4A4A 0%,#2A2A2A 45%,#161616 100%)';
  const CORAL_FACE = 'linear-gradient(135deg,#F8826F 0%,#F0624D 45%,#D24D39 100%)';
  const mix = (a, b, t) => 'rgb(' + a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',') + ')';
  const coralSide = t => mix([204, 76, 57], [122, 40, 29], t);
  const pct = (v, of) => v / of * 100 + '%';
  const boxStyle = ([x, y, w, h]) => ({ left: pct(x, LW), top: pct(y, LH), width: pct(w, LW), height: pct(h, LH) });

  const el = (cls, style, parent, html = '') => {
    const e = document.createElement('div');
    e.className = cls;
    Object.assign(e.style, style);
    e.innerHTML = html;
    parent.appendChild(e);
    return e;
  };

  // ---------- Elements ----------
  const hero = $('.hero');
  const copy = $('.hero-copy');
  const scrollHint = $('.scroll-hint');
  const social = $('.hero-social');
  const rig = $('.logo-rig');
  const logo = $('.hero-logo');
  const heroWindow = $('.hero-window');
  const bar = $('.window-bar');
  const intro = $('.intro');
  const blueprint = $('.blueprint');
  const compare = $('.compare');
  const handle = $('.compare-handle');
  const dragHint = $('.compare-hint');
  const nav = $('.nav');

  // ---------- Build the logo: each piece = LAYERS stacked divs (layer 0 is the face) ----------
  const piece = {};
  for (const key in PIECES) {
    const P = PIECES[key];
    const [bx, by, bw, bh] = P.box;
    const p = el('piece piece--' + P.cls, boxStyle(P.box), logo);
    const clip = P.points && polygon(P.points, P.box);
    for (let i = 0; i < LAYERS; i++) {
      const layer = el('layer', {}, p);
      if (i === 0) {
        // the face shows its part of one gradient spread over the whole logo
        if (P.coral) layer.style.background = CORAL_FACE;
        layer.style.backgroundSize = (LW / bw * 100) + '% ' + (LH / bh * 100) + '%';
        layer.style.backgroundPosition = (bw < LW ? bx / (LW - bw) * 100 : 0) + '% ' + (bh < LH ? by / (LH - bh) * 100 : 0) + '%';
      } else if (P.coral) {
        layer.style.background = coralSide(i / LAYERS);
      }
      if (clip) layer.style.clipPath = clip;
      if (P.round) layer.style.borderRadius = '50%';
    }
    piece[key] = p;
  }

  // Piece names come from the page language (data-labels on .hero-logo)
  const PIECE_NAMES = logo.dataset.labels.split(',').map(n => n.trim().toUpperCase());

  // Exploded-view helpers: piece labels, depth rails, drop line, dot seat, floor shadows, launch ring
  const labels = [
    el('piece-label piece-label--right piece-label--below', { top: '100%', marginTop: '14px' }, piece.frame, '<b>01</b>' + PIECE_NAMES[0]),
    el('piece-label piece-label--left', { bottom: '100%', left: 0, marginBottom: '12px' }, piece.letter, '<b>02</b>' + PIECE_NAMES[1]),
    el('piece-label piece-label--left', { bottom: '100%', left: '50%', marginBottom: '14px' }, piece.dot, '<b>03</b>' + PIECE_NAMES[2]),
  ];
  const rails = [[0, 417.58], [467.723, 417.58], [467.723, 921.484], [0, 921.484]]
    .map(([x, y]) => el('guide', { left: pct(x, LW), top: pct(y, LH) }, logo));
  const dotRail = el('guide', { left: pct(DOT_X, LW) }, logo);
  const dropLine = el('drop-line', { left: pct(DOT_X, LW) }, logo);
  const seat = el('dot-seat', boxStyle(PIECES.dot.box), logo);
  const shadows = {
    frame: el('shadow', { left: '-4%', width: '108%' }, logo),
    letter: el('shadow', { left: '-3%', width: pct(500, LW) }, logo),
    dot: el('shadow', { left: pct(500, LW), width: pct(130, LW) }, logo),
  };
  const ring = el('launch-ring', {}, logo);

  // Frame colour follows the hero tone: light frame on a dark hero, dark frame on a light hero
  let heroLight = false, frameRGB = '244,242,239';
  function paintLogo() {
    const cs = getComputedStyle(hero);
    heroLight = cs.getPropertyValue('--is-light').trim() === '1';
    frameRGB = cs.getPropertyValue('--frame-rgb').trim();
    const face = heroLight ? DARK_FACE : LIGHT_FACE;
    const near = heroLight ? [34, 34, 34] : [200, 195, 188];
    const far = heroLight ? [10, 10, 10] : [118, 114, 109];
    ['frame', 'edgeLeft', 'edgeBottom'].forEach(key => [...piece[key].children].forEach((layer, i) => {
      if (!layer.classList.contains('layer')) return;
      if (i === 0) layer.style.backgroundImage = face;
      else layer.style.background = mix(near, far, i / LAYERS);
    }));
  }

  // ---------- Timeline (units; total T). The nav floats once the logo faces the visitor (end of pFlat). ----------
  const T = 14, FLOAT_T = 6;
  let lastFloat = null;
  const linear = t => t;
  const curve = name => motion ? gsap.parseEase(name) : linear;
  const ease = { io3: curve('power3.inOut'), io2: curve('power2.inOut'), in2: curve('power2.in'), out2: curve('power2.out') };
  // progress of t inside [a, b], optionally eased
  const seg = (t, a, b, fn) => {
    const p = Math.min(1, Math.max(0, (t - a) / (b - a)));
    return fn ? fn(p) : p;
  };
  const lerp = (a, b, p) => a + (b - a) * p;
  const lerpRect = (A, B, p) => Object.fromEntries(Object.keys(A).map(k => [k, lerp(A[k], B[k], p)]));

  // layout values (set by layout())
  let vw, vh, mobile, navH, lw, lh, S, drop, rx0, ry0, secH;
  let rest = { x: 0, y: 0 }, flat = { x: 0, y: 0 };
  // window rectangles: R0 = logo frame, R1 = window, R2 = full screen
  let R0, R1, R2, R = { x: 0, y: 0, w: 0, h: 0, b: 0, bar: 0 };
  let cur = 0, manual = null, dragged = false, dragging = false;
  // scroll-driven time of the scene (the tween animates it); layout() renders from it, so a page that opens
  // mid-scroll (a link to #pricing) shows the scene at its real state
  const proxy = { t: 0 };
  const REST_T = motion ? 0 : 4.3;   // static version: the assembled logo
  const tilt = { x: 0, y: 0 }, tiltTarget = { x: 0, y: 0 };
  let tiltRaf = 0;

  function render(t) {
    cur = t;
    const pLetter = seg(t, 0, 2.6, ease.io3);
    const pDotZ = seg(t, .5, 3, ease.io3);
    const pDrop = seg(t, 3, 3.6, ease.in2);
    const squash = seg(t, 3.6, 4);
    const pRing = seg(t, 3.6, 4.8, ease.out2);
    const pFlat = seg(t, 4.4, 6, ease.io3);
    const pCopy = seg(t, 4.2, 5, ease.in2);
    const pBack = seg(t, 5.6, 6.3, ease.in2);
    const pClose = seg(t, 6, 7.05, ease.io2);
    const pSwap = seg(t, 7.05, 7.2);

    // parallax at rest: follows the mouse or tilt and fades out as scrolling starts
    const pTilt = motion ? 1 - seg(t, 0, .9, ease.out2) : 0;
    const tx = tilt.x * pTilt, ty = tilt.y * pTilt;
    const x = lerp(rest.x, flat.x, pFlat) + tx * 14, y = lerp(rest.y, flat.y, pFlat) + ty * 10;
    rig.style.transform = `translate3d(${x}px,${y}px,0) ` +
      `rotateX(${lerp(rx0, 0, pFlat) - ty * 6}deg) rotateY(${lerp(ry0, 0, pFlat) + tx * 9}deg)`;

    // the W assembles, the dot drops (squash on landing), both sink back
    const back = -S * .8 * pBack;
    const zLetter = lerp(S, 0, pLetter) + back;
    const zDot = lerp(.55 * S, 0, pDotZ) + back;
    const yDot = lerp(-drop, 0, pDrop);
    piece.letter.style.transform = `translate3d(0,0,${zLetter}px)`;
    piece.letter.style.opacity = 1 - pBack;
    piece.dot.style.transform = `translate3d(0,${yDot}px,${zDot}px) scaleY(${1 - .18 * Math.sin(Math.PI * squash)})`;
    piece.dot.style.opacity = 1 - pBack;

    // the frame closes as one line: down the left edge, then around the corner along the bottom
    const leftLen = LH - 272.5, bottomLen = 568.082;
    const run = pClose * (leftLen + bottomLen);
    const pLeft = Math.min(1, run / leftLen), pBottom = Math.max(0, (run - leftLen) / bottomLen);
    piece.edgeLeft.style.transform = `scaleY(${Math.max(pLeft, .0001)})`;
    piece.edgeLeft.style.opacity = pLeft > 0 ? 1 : 0;
    piece.edgeBottom.style.transform = `scaleX(${Math.max(pBottom, .0001)})`;
    piece.edgeBottom.style.opacity = pBottom > 0 ? 1 : 0;

    // floor shadows follow their pieces
    const shadowO = (1 - seg(t, 4.4, 5.4)) * (heroLight ? .55 : 1);
    const floor = (e, z, o, s = 1) => {
      e.style.transform = `translateZ(${z}px) rotateX(90deg) scale(${s})`;
      e.style.opacity = o;
    };
    floor(shadows.frame, 0, .85 * shadowO);
    floor(shadows.letter, zLetter, .85 * shadowO * (1 - pBack));
    floor(shadows.dot, zDot, lerp(.22, .9, pDrop) * shadowO * (1 - pBack), lerp(.55, 1, pDrop));

    // exploded-view helpers fade out
    const railO = 1 - seg(t, 0, 1.1);
    rails.forEach(r => r.style.opacity = railO);
    dotRail.style.opacity = railO;
    dropLine.style.opacity = 1 - seg(t, 2.8, 3.4);
    seat.style.opacity = 1 - seg(t, 3.3, 3.6);
    labels.forEach(l => l.style.opacity = 1 - seg(t, .15, 1.1));
    ring.style.opacity = squash > 0 ? (1 - pRing) * (1 - pFlat) : 0;
    ring.style.transform = `rotateX(90deg) scale(${lerp(.4, 2.6, pRing)})`;

    // text, scroll hint and social column leave
    copy.style.opacity = 1 - pCopy;
    copy.style.transform = `translateX(${-40 * pCopy}px)`;
    scrollHint.style.opacity = 1 - seg(t, 0, 1);
    social.style.opacity = 1 - pCopy;
    social.style.pointerEvents = pCopy > .5 ? 'none' : 'auto';

    if (!motion || !R1) return;

    const floating = t >= FLOAT_T;
    if (floating !== lastFloat) emit('float', lastFloat = floating);

    logo.style.opacity = 1 - pSwap;
    hero.style.visibility = t >= T - .001 ? 'hidden' : 'visible';

    // the window: logo frame → window → full screen
    const pR1 = seg(t, 7.1, 8.6, ease.io3), pR2 = seg(t, 11.9, T, ease.io3);
    R = pR2 > 0 ? lerpRect(R1, R2, pR2) : lerpRect(R0, R1, pR1);
    heroWindow.style.opacity = pSwap;
    Object.assign(heroWindow.style, {
      left: R.x + 'px', top: R.y + 'px', width: R.w + 'px', height: R.h + 'px',
      borderWidth: R.b + 'px', borderColor: `rgba(${frameRGB},${1 - seg(t, 13.2, T)})`,
    });
    bar.style.height = R.bar + 'px';

    // the intro inside the window: scaled to the window, clipped to its height
    if (t < 7.05) {
      intro.style.visibility = 'hidden';
    } else if (t >= T - .001) {
      Object.assign(intro.style, { visibility: 'visible', opacity: 1, transform: 'none', clipPath: 'none' });
    } else {
      const cw = R.w - 2 * R.b, ch = R.h - 2 * R.b - R.bar, s = cw / vw;
      Object.assign(intro.style, {
        visibility: 'visible',
        opacity: seg(t, 7.1, 7.7),
        transform: `translate(${R.x + R.b}px,${R.y + R.b + R.bar}px) scale(${s})`,
        clipPath: `inset(0 0 ${Math.max(0, secH - ch / s)}px 0)`,
      });
    }

    // before / after: the line sweeps to .55 (or where it was dragged), then to the end
    if (t < 8.4) {
      manual = null;
      dragged = false;
    }
    let v;
    if (t < 10.8) v = manual ?? seg(t, 8.4, 9.8, ease.io2) * .55;
    else {
      const from = manual ?? .55;
      v = from + (1 - from) * seg(t, 10.8, 11.9, ease.io2);
    }
    blueprint.style.clipPath = `inset(0 0 0 ${v * 100}%)`;
    compare.style.left = v * 100 + '%';
    const compareO = seg(t, 8.2, 8.6) * (1 - seg(t, 11.6, 12));
    compare.style.opacity = compareO;
    handle.style.pointerEvents = compareO > .5 ? 'auto' : 'none';
    dragHint.style.opacity = t > 9.3 && t < 10.9 && !dragged ? 1 : 0;
  }

  // Bounding box of the logo faces (plus labels on mobile), relative to the hero
  function faceBox() {
    const hr = hero.getBoundingClientRect();
    const els = ['frame', 'letter', 'dot'].map(k => piece[k].firstChild);
    if (mobile) els.push(...labels);
    const rs = els.map(e => e.getBoundingClientRect());
    return {
      l: Math.min(...rs.map(r => r.left)) - hr.left,
      t: Math.min(...rs.map(r => r.top)) - hr.top,
      r: Math.max(...rs.map(r => r.right)) - hr.left,
      b: Math.max(...rs.map(r => r.bottom)) - hr.top,
    };
  }

  // Blueprint of the intro: layout columns, a dashed box per element with its role and size, spacing marks
  const BLUEPRINT_COLS = { desktop: 12, mobile: 4 };
  const BLUEPRINT_GUTTER = { desktop: 24, mobile: 16 };
  const DIM_OFFSET = 36;     // dimension line distance below the last element
  const GAP_MIN = 8;         // smaller vertical gaps get no spacing mark
  const GAP_OFFSET = 14;     // spacing marks sit this far left of the content edge

  function buildBlueprint() {
    blueprint.innerHTML = '';
    const base = intro.getBoundingClientRect();
    const cs = getComputedStyle(intro);
    const left = parseFloat(cs.paddingLeft);
    const width = base.width - left - parseFloat(cs.paddingRight);
    const frag = document.createDocumentFragment();
    const add = (cls, x, y, w, h, note) => {
      const i = document.createElement('i');
      i.className = cls;
      i.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
      if (note) i.dataset.note = note;
      frag.appendChild(i);
    };

    const size = mobile ? 'mobile' : 'desktop';
    const cols = BLUEPRINT_COLS[size];
    const gutter = BLUEPRINT_GUTTER[size];
    const colW = (width - gutter * (cols - 1)) / cols;
    for (let c = 0; c < cols; c++) add('blueprint-col', left + c * (colW + gutter), 0, colW, base.height);

    const els = $$('[data-blueprint]', intro);
    const boxes = els.map(e => {
      const r = e.getBoundingClientRect();
      const box = { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height };
      const font = Math.round(parseFloat(getComputedStyle(e).fontSize));
      const isText = !e.children.length || /^(H\d|P)$/.test(e.tagName);
      add('blueprint-box', box.x, box.y, box.w, box.h, e.dataset.blueprint + (isText ? ' · ' + font + 'px' : ''));
      return box;
    });
    if (!boxes.length) return blueprint.appendChild(frag);

    const bottom = Math.max(...boxes.map(b => b.y + b.h));
    add('blueprint-dim', left, bottom + DIM_OFFSET, width, 9, Math.round(width) + ' px · ' + cols + ' col');

    // spacing marks between the main stacked elements (direct children only)
    const stack = boxes.filter((b, i) => els[i].parentElement === intro);
    stack.forEach((b, i) => {
      const next = stack[i + 1];
      if (!next) return;
      const gap = next.y - (b.y + b.h);
      if (gap < GAP_MIN) return;
      add('blueprint-gap', Math.max(4, left - GAP_OFFSET - 9), b.y + b.h, 9, gap, Math.round(gap));
    });
    blueprint.appendChild(frag);
  }

  function layout() {
    paintLogo();
    vw = root.clientWidth;
    vh = innerHeight;
    root.style.setProperty('--vh', vh + 'px');
    // same breakpoint as the mobile media queries in hero.css
    mobile = matchMedia('(max-width:900px), (orientation:portrait) and (max-width:1200px)').matches;
    navH = WF.navH = nav.offsetHeight;
    rig.style.transform = 'none';
    if (motion) {
      intro.style.transform = 'none';
      intro.style.clipPath = 'none';
    }

    // sizes that follow the logo size
    lw = logo.offsetWidth;
    lh = logo.offsetHeight;
    S = lw * (mobile ? .3 : .4);   // depth spread of the exploded view
    drop = lh * .62;               // dot drop height
    rx0 = mobile ? 8 : 11;
    ry0 = mobile ? -22 : -28;
    const depth = lw * .05;
    for (const key in piece) {
      [...piece[key].children].forEach((layer, i) => {
        if (layer.classList.contains('layer')) layer.style.transform = `translateZ(${-i * depth / (LAYERS - 1)}px)`;
      });
    }
    rails.forEach(r => {
      r.style.width = 1.3 * S + 'px';
      r.style.transform = 'rotateY(-90deg)';
    });
    const seatY = SEAT_Y / LH * lh;
    Object.assign(dotRail.style, { top: seatY - drop + 'px', width: .85 * S + 'px', transform: 'rotateY(-90deg)' });
    Object.assign(dropLine.style, { top: seatY - drop + 'px', height: drop + 'px' });
    const shadowH = lw * .2, dotShadowH = lw * .09;
    [shadows.frame, shadows.letter].forEach(s => {
      s.style.top = lh - shadowH / 2 + 'px';
      s.style.height = shadowH + 'px';
    });
    shadows.dot.style.top = lh - dotShadowH / 2 + 'px';
    shadows.dot.style.height = dotShadowH + 'px';
    const rs = lw * .12;
    Object.assign(ring.style, {
      width: rs + 'px', height: rs + 'px', left: DOT_X / LW * lw - rs / 2 + 'px', top: lh - rs / 2 + 'px',
    });

    // rest position: centred between the text and the right edge (desktop), centred (mobile)
    const hr = hero.getBoundingClientRect();
    const lr = logo.getBoundingClientRect();
    const sr = $('.hero-stage').getBoundingClientRect();
    const cx0 = lr.left - hr.left + lw / 2, cy0 = lr.top - hr.top + lh / 2;
    rest = { x: 0, y: 0 };
    render(REST_T);
    const fb = faceBox();
    if (mobile) {
      rest.x = vw / 2 - (fb.l + fb.r) / 2;
    } else {
      // the text's real right edge (its lines, not its column)
      let textRight = 0;
      $$('h1, p', copy).forEach(e => {
        const range = document.createRange();
        range.selectNodeContents(e);
        [...range.getClientRects()].forEach(r => textRight = Math.max(textRight, r.right - hr.left));
      });
      const gap = (vw - textRight - (fb.r - fb.l)) / 2;
      rest.x = textRight + gap - fb.l;
    }
    rest.y = sr.top - hr.top + sr.height / 2 - (fb.t + fb.b) / 2 + (mobile ? 0 : lh * .04);
    flat = { x: vw / 2 - cx0, y: navH + (vh - navH) / 2 - cy0 };

    if (motion) {
      R0 = { x: cx0 - lw / 2 + flat.x, y: cy0 - lh / 2 + flat.y, w: lw, h: lh, b: 95.729 / LW * lw, bar: 0 };
      // window: share k of the viewport, limited so it fits under the nav
      let k = mobile ? .86 : .64;
      const barH = mobile ? 22 : 28, b = 1.5, maxH = vh - navH - (mobile ? 28 : 56);
      if (k * vh + barH + 2 * b > maxH) k = (maxH - barH - 2 * b) / vh;
      const w = k * vw + 2 * b, h = k * vh + barH + 2 * b;
      R1 = { x: (vw - w) / 2, y: navH + (vh - navH - h) / 2, w, h, b, bar: barH };
      R2 = { x: -1, y: -1, w: vw + 2, h: vh + 2, b: 1, bar: 0 };
      secH = intro.offsetHeight;
      buildBlueprint();
    }
    render(motion ? proxy.t : REST_T);
  }

  on('theme', () => {
    paintLogo();
    render(cur);
  });

  // Drag the before/after handle
  handle.addEventListener('pointerdown', e => {
    if (cur < 8.4 || cur > 11.9) return;
    dragging = dragged = true;
    handle.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  handle.addEventListener('pointermove', e => {
    if (!dragging) return;
    const s = (R.w - 2 * R.b) / vw;
    const x = (e.clientX - (R.x + R.b)) / s;
    manual = Math.min(.98, Math.max(.02, x / vw));
    render(cur);
  });
  ['pointerup', 'pointercancel'].forEach(type => handle.addEventListener(type, () => dragging = false));

  // Parallax at rest: soft follow of the mouse or phone tilt; the loop runs only while something moves
  function tiltFrame() {
    tilt.x += (tiltTarget.x - tilt.x) * .06;
    tilt.y += (tiltTarget.y - tilt.y) * .06;
    const done = Math.abs(tiltTarget.x - tilt.x) < .001 && Math.abs(tiltTarget.y - tilt.y) < .001;
    if (done) Object.assign(tilt, tiltTarget);
    if (cur < 1) render(cur);
    tiltRaf = done ? 0 : requestAnimationFrame(tiltFrame);
  }
  const clamp1 = v => Math.max(-1, Math.min(1, v));
  const setTilt = (x, y) => {
    tiltTarget.x = x;
    tiltTarget.y = y;
    if (!tiltRaf) tiltRaf = requestAnimationFrame(tiltFrame);
  };

  if (motion) {
    addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse' || cur >= 1) return;
      setTilt(clamp1((e.clientX / innerWidth - .5) * 2), clamp1((e.clientY / innerHeight - .5) * 2));
    }, { passive: true });
    root.addEventListener('mouseleave', () => setTilt(0, 0));

    // phone tilt; the neutral pose slowly follows how the phone is held
    let neutral = null;
    addEventListener('deviceorientation', e => {
      if (e.beta == null || cur >= 1) return;
      const angle = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
      let x = e.gamma, y = e.beta;
      if (angle === 90) [x, y] = [e.beta, -e.gamma];
      else if (angle === -90 || angle === 270) [x, y] = [-e.beta, e.gamma];
      if (!neutral) neutral = { x, y };
      neutral.x += (x - neutral.x) * .008;
      neutral.y += (y - neutral.y) * .008;
      setTilt(clamp1((x - neutral.x) / 18), clamp1((y - neutral.y) / 18));
    }, { passive: true });

    // iOS needs permission after a tap; other systems send the tilt directly
    if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
      addEventListener('touchend', () => {
        if (!neutral) DeviceOrientationEvent.requestPermission().catch(() => {});
      }, { once: true });
    }
  }

  // ---------- Start ----------
  function init() {
    layout();
    if (motion) {
      ScrollTrigger.config({ ignoreMobileResize: true });
      const tween = gsap.to(proxy, {
        t: T,
        ease: 'none',
        onUpdate: () => render(proxy.t),
        scrollTrigger: {
          trigger: '.hero-scene',
          start: 'top top',
          end: () => '+=' + innerHeight * 2.3,
          pin: true,
          scrub: 1.1,
          invalidateOnRefresh: true,
        },
      });
      WF.st = tween.scrollTrigger;
      ScrollTrigger.addEventListener('refresh', () => {
        layout();
        emit('layout');
      });
    }
    emit('layout');
  }

  // static version only: relayout on real size changes (not on mobile toolbar show/hide)
  let lastW = 0, lastH = 0, resizeTimer;
  addEventListener('resize', () => {
    if (motion) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (root.clientWidth === lastW && Math.abs(innerHeight - lastH) < 120) return;
      lastW = root.clientWidth;
      lastH = innerHeight;
      layout();
    }, 150);
  });

  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
    lastW = root.clientWidth;
    lastH = innerHeight;
    init();
  });
})();
