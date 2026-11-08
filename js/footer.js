// Footer: bouncing logo dot and live Mjölby clock
(() => {
  const { $, motion } = WF;
  const footer = $('.footer');
  const svg = $('.footer-logo svg');
  const dot = $('.footer-logo .logo-dot');
  // the dot starts at rest in the logo instead of dropping in: on the home page the travelling dot lands here,
  // and on the error pages the only travelling dot is the one inside the zero
  const arrives = document.body.classList.contains('has-journey') || document.body.classList.contains('page--error');

  const GRAVITY = 1500;
  const JUMP = Math.sqrt(2 * GRAVITY * 70);   // speed for a 70-unit jump
  const EVERY = 4200;                         // ms between bounces
  const LIFT = -56;                           // hover height when the mouse is near

  const DROP_FROM = -170;
  const LAND_SPEED = 1100;                    // the travelling dot hits the logo at this speed (home page)
  const LAND_KEEP = .45;                      // share of speed kept on each rebound of that landing: two bounces
  const REST_SPEED = 120;                     // below this a landing stops instead of rebounding
  let keep = .32;                             // rebound share; LAND_KEEP while the journey's landing plays
  let y = arrives ? 0 : DROP_FROM, velocity = 0, running = false, near = false, last = 0, nextJump = 0, raf = 0;

  function frame(now) {
    if (!running) return;
    const dt = Math.min(.033, (now - (last || now)) / 1000);
    last = now;
    if (near) {
      // spring towards the lift height
      velocity += (LIFT - y) * 40 * dt;
      velocity *= Math.pow(.02, dt);
    } else {
      velocity += GRAVITY * dt;
      if (y >= 0 && velocity >= 0 && now > nextJump) {
        velocity = -JUMP;
        nextJump = now + EVERY;
      }
    }
    y += velocity * dt;
    // landing: small rebound, then rest
    if (!near && y > 0) {
      y = 0;
      velocity = velocity > REST_SPEED ? -velocity * keep : 0;
      if (!velocity) keep = .32;
    }
    dot.setAttribute('transform', `translate(0 ${y.toFixed(2)})`);
    raf = requestAnimationFrame(frame);
  }

  // is the pointer within reach of the dot (logo units: viewBox 1000 wide, dot at 918.9 / 207.9)
  const isNearDot = e => {
    const r = svg.getBoundingClientRect();
    const u = r.width / 1000;
    return Math.hypot(e.clientX - (r.left + 918.9 * u), e.clientY - (r.top + 207.9 * u)) < Math.max(36, 40 * u);
  };

  if (motion) {
    dot.setAttribute('transform', `translate(0 ${y})`);

    // runs only while visible; the dot drops in on first view
    new IntersectionObserver(entries => entries.forEach(e => {
      if (!e.isIntersecting) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        last = 0;
        nextJump = performance.now() + EVERY;
        raf = requestAnimationFrame(frame);
      }
    }), { rootMargin: '0px 0px -10% 0px' }).observe(svg);

    // the travelling dot arrives (journey.js): it hits the logo and bounces twice before it rests
    WF.on('footer-land', () => {
      y = 0;
      velocity = LAND_SPEED;
      keep = LAND_KEEP;
      near = false;
      nextJump = performance.now() + EVERY;
      if (!running) {
        running = true;
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    });

    footer.addEventListener('pointermove', e => {
      if (e.pointerType === 'mouse') near = isNearDot(e);
    });
    footer.addEventListener('pointerleave', () => near = false);
    footer.addEventListener('click', e => {
      if (!isNearDot(e) || y <= -2) return;
      near = false;
      velocity = -JUMP;
      nextJump = performance.now() + EVERY;
    });
  }

  // Clock
  const clock = $('.footer-clock');
  const time = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit' });
  const tick = () => clock.textContent = time.format(new Date());
  tick();
  setInterval(tick, 30000);
})();
