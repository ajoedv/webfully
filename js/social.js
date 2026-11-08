// Social icons: one template copied into every .social, plus dock magnification (like the macOS Dock)
(() => {
  const { $, $$ } = WF;
  const template = $('.social-template');
  const MAX_GROW = .7;   // the icon under the pointer grows to 1 + MAX_GROW
  const REACH = 2.4;     // neighbours within REACH icon steps grow less by distance
  const EASE = .22;

  $$('.social').forEach(el => {
    el.append(template.content.cloneNode(true));

    const vertical = el.classList.contains('social--col');
    const icons = $$('a', el);
    const scale = icons.map(() => 1);
    const shift = icons.map(() => 0);
    let px = null, py = null, raf = 0, lastTouch = 0;

    icons.forEach(a => a.style.transformOrigin = vertical ? '0% 50%' : '50% 100%');

    function frame() {
      raf = 0;
      const size = icons[0].offsetWidth;
      if (!size) return;
      const step = vertical ? icons[1].offsetTop - icons[0].offsetTop : icons[1].offsetLeft - icons[0].offsetLeft;
      const r = el.getBoundingClientRect();
      const active = px !== null && el.style.pointerEvents !== 'none' &&
        (vertical ? px > r.left - 40 && px < r.right + 40 : py > r.top - 40 && py < r.bottom + 40);
      // centre of the first icon without its shift (scaling does not move the centre along the axis)
      const r0 = icons[0].getBoundingClientRect();
      const c0 = (vertical ? r0.top + r0.height / 2 : r0.left + r0.width / 2) - shift[0];
      const pos = active ? (vertical ? py : px) - c0 : 0;
      let moving = false;

      icons.forEach((a, i) => {
        const d = active ? Math.abs(pos - i * step) / (step * REACH) : 1;
        const target = 1 + MAX_GROW * Math.max(0, Math.cos(Math.min(d, 1) * Math.PI / 2)) ** 2;
        scale[i] += (target - scale[i]) * EASE;
        if (Math.abs(target - scale[i]) > .002) moving = true;
        else scale[i] = target;
      });

      // spread the icons so they never overlap: centred, or locked to the start (hero mobile row)
      const grow = scale.reduce((sum, k) => sum + (k - 1) * size, 0);
      const centred = vertical || getComputedStyle(el).justifyContent === 'center';
      let offset = centred ? -grow / 2 : 0;
      icons.forEach((a, i) => {
        shift[i] = offset + (scale[i] - 1) * size / 2;
        offset += (scale[i] - 1) * size;
        a.style.transform = `${vertical ? 'translateY' : 'translateX'}(${shift[i]}px) scale(${scale[i]})`;
      });

      if (moving) raf = requestAnimationFrame(frame);
    }

    const update = (x, y) => {
      px = x;
      py = y;
      if (!raf) raf = requestAnimationFrame(frame);
    };

    // mouse: only near the dock; ignored right after a touch (touch also fires mouse events)
    addEventListener('mousemove', e => {
      if (performance.now() - lastTouch < 1000) return;
      const r = el.getBoundingClientRect();
      const near = e.clientX > r.left - 120 && e.clientX < r.right + 120 &&
        e.clientY > r.top - 120 && e.clientY < r.bottom + 120;
      if (near) update(e.clientX, e.clientY);
      else if (px !== null) update(null, null);
    }, { passive: true });
    document.addEventListener('mouseleave', () => update(null, null));

    // touch: the finger sliding along the row drives it, lifting the finger resets
    const touch = e => update(e.touches[0].clientX, e.touches[0].clientY);
    const release = () => {
      lastTouch = performance.now();
      update(null, null);
    };
    el.addEventListener('touchstart', touch, { passive: true });
    el.addEventListener('touchmove', touch, { passive: true });
    el.addEventListener('touchend', release);
    el.addEventListener('touchcancel', release);
  });
})();
