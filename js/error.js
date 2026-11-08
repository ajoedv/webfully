// Error pages: the logo dot lives inside the coral zero. On arrival it falls and settles on the floor of the zero's
// inner hole. When the pointer reaches the digit the dot hops, then follows it, never leaving the hole;
// once the pointer leaves it falls back and rests. The hole is measured from the real glyph.
(() => {
  const { $ } = WF;
  const dot = $('.error-dot');
  if (!dot) return;
  const digit = dot.parentElement;

  const RAYS = 96;          // directions measured from the hole's center to its edge
  const GRAVITY = 2600;     // px/s² at a 300px digit; scales with the digit
  const BOUNCE = .42;       // share of speed kept on hitting the edge
  const FRICTION = .985;    // per frame while rolling on the floor
  const FOLLOW = 18;        // pull towards the pointer (1/s²) while it is over the digit
  const FOLLOW_DAMP = 7;    // damping of that pull (1/s)
  const HOP_SPEED = 900;    // px/s at a 300px digit

  // hole: center (viewport px) and the distance to the inner edge for each direction, minus the dot radius
  let hole = null;

  function measure() {
    const style = getComputedStyle(digit);
    const size = parseFloat(style.fontSize);
    const text = digit.firstChild;
    if (!text || text.nodeType !== 3) return;
    // where the glyph sits on screen: its text start and its baseline
    const range = document.createRange();
    range.selectNodeContents(text);
    const startX = range.getClientRects()[0].left;
    const probe = document.createElement('i');
    probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
    digit.insertBefore(probe, text.nextSibling);
    const baseline = probe.getBoundingClientRect().top;
    probe.remove();

    // draw the same glyph, filled, and walk out from the center of its ink until the ink starts
    const canvas = document.createElement('canvas');
    const pad = Math.ceil(size * .2);
    canvas.width = Math.ceil(size * 1.2) + pad * 2;
    canvas.height = Math.ceil(size * 1.4) + pad * 2;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.font = `${style.fontStyle} ${style.fontWeight} ${size}px ${style.fontFamily}`;
    const m = ctx.measureText(text.data);
    const base = pad + m.actualBoundingBoxAscent;
    ctx.fillText(text.data, pad, base);
    const ink = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const filled = (x, y) => {
      x = Math.round(x);
      y = Math.round(y);
      if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return true;
      return ink[(y * canvas.width + x) * 4 + 3] > 40;
    };
    const cx = pad + (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2;
    const cy = base - (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
    const r = dot.offsetWidth / 2;
    const edge = [];
    for (let i = 0; i < RAYS; i++) {
      const a = i / RAYS * Math.PI * 2;
      let d = 0;
      while (d < size && !filled(cx + Math.cos(a) * d, cy + Math.sin(a) * d)) d += .5;
      edge.push(Math.max(0, d - r - 1));
    }
    // the hole's center as an offset from the digit's own center, so scrolling never moves it
    const box = digit.getBoundingClientRect();
    hole = {
      dx: startX + (cx - pad) - (box.left + box.width / 2),
      dy: baseline + (cy - base) - (box.top + box.height / 2),
      edge,
      scale: size / 300,
    };
  }

  // the limit for a direction (angle in radians), interpolated between measured rays
  const limitAt = a => {
    const t = ((a / (Math.PI * 2)) % 1 + 1) % 1 * RAYS;
    const i = Math.floor(t) % RAYS;
    return hole.edge[i] + (hole.edge[(i + 1) % RAYS] - hole.edge[i]) * (t - Math.floor(t));
  };

  // state relative to the hole's center
  const pos = { x: 0, y: 0 }, vel = { x: 0, y: 0 };
  let pointer = null, over = false, wasOver = false, last = 0;

  addEventListener('pointermove', e => {
    pointer = { x: e.clientX, y: e.clientY };
    const box = digit.getBoundingClientRect();
    over = e.clientX >= box.left && e.clientX <= box.right && e.clientY >= box.top && e.clientY <= box.bottom;
  }, { passive: true });
  // a finger lifted or turned into a scroll lets go of the dot
  const release = e => {
    if (e.pointerType !== 'mouse') pointer = null;
  };
  addEventListener('pointerup', release, { passive: true });
  addEventListener('pointercancel', release, { passive: true });
  document.addEventListener('pointerleave', () => {
    pointer = null;
    over = false;
  });
  // a tap makes it hop too
  digit.addEventListener('pointerdown', () => {
    vel.y = -HOP_SPEED * hole.scale;
  });

  function step(now) {
    const dt = Math.min(.033, (now - last) / 1000 || 0);
    last = now;
    if (hole) {
      const s = hole.scale;
      // where the digit and its hole are now (the page may have scrolled)
      const box = digit.getBoundingClientRect();
      const hx = box.left + box.width / 2 + hole.dx, hy = box.top + box.height / 2 + hole.dy;
      over = !!pointer && pointer.x >= box.left && pointer.x <= box.right && pointer.y >= box.top && pointer.y <= box.bottom;
      if (pointer && over) {
        // follow the pointer inside the hole
        const tx = pointer.x - hx, ty = pointer.y - hy;
        vel.x += ((tx - pos.x) * FOLLOW - vel.x * FOLLOW_DAMP) * dt;
        vel.y += ((ty - pos.y) * FOLLOW - vel.y * FOLLOW_DAMP) * dt;
      } else {
        vel.y += GRAVITY * s * dt;
      }
      // the pointer reaching the digit makes it hop first
      if (over && !wasOver) vel.y = -HOP_SPEED * s;
      wasOver = over;
      pos.x += vel.x * dt;
      pos.y += vel.y * dt;
      // keep it inside: back onto the edge, bounce off it, roll along the floor
      const a = Math.atan2(pos.y, pos.x);
      const lim = limitAt(a);
      const d = Math.hypot(pos.x, pos.y);
      if (d > lim) {
        const nx = Math.cos(a), ny = Math.sin(a);
        pos.x = nx * lim;
        pos.y = ny * lim;
        const vn = vel.x * nx + vel.y * ny;
        if (vn > 0) {
          vel.x -= (1 + BOUNCE) * vn * nx;
          vel.y -= (1 + BOUNCE) * vn * ny;
        }
        vel.x *= FRICTION;
        vel.y *= FRICTION;
      }
      // the dot is centered in the digit by CSS; move it from there
      dot.style.transform = `translate(${hole.dx + pos.x}px, ${hole.dy + pos.y}px)`;
    }
    requestAnimationFrame(step);
  }

  function start() {
    measure();
    if (!hole) return;
    // arrive: start at the top of the hole and fall
    pos.x = 0;
    pos.y = -limitAt(-Math.PI / 2);
    vel.x = 0;
    vel.y = 0;
    requestAnimationFrame(now => {
      last = now;
      step(now);
    });
  }

  addEventListener('resize', measure);
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(start);
})();
