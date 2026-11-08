// Testimonials: one quote at a time, crossfading every few seconds. Pauses on hover and focus, and with the pause button.
(() => {
  const { $, $$ } = WF;

  $$('.testimonials').forEach(section => {
    const slides = $$('.testimonial', section);
    if (!slides.length) return;
    const index = $('.testimonials-index', section);
    const pause = $('.testimonials-pause', section);
    const INTERVAL = 7000;
    let current = 0, timer = 0, paused = false, held = false, offscreen = true;

    const show = i => {
      current = (i + slides.length) % slides.length;
      slides.forEach((slide, n) => {
        const on = n === current;
        slide.classList.toggle('is-current', on);
        slide.setAttribute('aria-hidden', !on);
      });
      index.textContent = String(current + 1).padStart(2, '0');
    };

    const schedule = () => {
      clearTimeout(timer);
      if (!paused && !held && !offscreen && slides.length > 1) timer = setTimeout(() => {
        show(current + 1);
        schedule();
      }, INTERVAL);
    };

    $('.testimonials-prev', section).addEventListener('click', () => {
      show(current - 1);
      schedule();
    });
    $('.testimonials-next', section).addEventListener('click', () => {
      show(current + 1);
      schedule();
    });
    pause.addEventListener('click', () => {
      paused = !paused;
      pause.setAttribute('aria-pressed', paused);
      pause.textContent = paused ? pause.dataset.play : pause.dataset.pause;
      schedule();
    });

    // hovering or focusing the quotes holds the rotation so they can be read
    const stage = $('.testimonials-stage', section);
    ['pointerenter', 'focusin'].forEach(type => stage.addEventListener(type, () => {
      held = true;
      schedule();
    }));
    ['pointerleave', 'focusout'].forEach(type => stage.addEventListener(type, () => {
      held = false;
      schedule();
    }));

    // runs only while visible
    new IntersectionObserver(entries => entries.forEach(e => {
      offscreen = !e.isIntersecting;
      schedule();
    })).observe(section);
  });
})();
