// Pricing: each package opens its full sheet in a modal dialog (focus is kept inside, Escape closes).
// The dot on the last package hops when the pointer comes near.
(() => {
  const { $, $$ } = WF;

  const dot = $('.package-dot');
  const NEAR = 90;
  if (dot) {
    dot.addEventListener('animationend', () => dot.classList.remove('is-hopping'));
    $('.packages').addEventListener('pointermove', e => {
      const r = dot.getBoundingClientRect();
      const near = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)) < NEAR;
      if (near && !dot.classList.contains('is-hopping')) dot.classList.add('is-hopping');
    });
  }

  // Yearly / monthly switch: .is-month on the section swaps every price and term; the choose links carry the plan
  const section = $('.pricing');
  const options = $$('.billing-option');
  const setBilling = mode => {
    section.classList.toggle('is-month', mode === 'month');
    options.forEach(o => {
      const on = o.dataset.billing === mode;
      o.classList.toggle('is-active', on);
      o.setAttribute('aria-pressed', on);
    });
    const label = $(`.billing-option[data-billing="${mode}"]`).textContent.trim().toLowerCase();
    $$('.package-choose').forEach(a => {
      const base = a.getAttribute('href').split('&plan=')[0];
      a.setAttribute('href', `${base}&plan=${encodeURIComponent(`${a.dataset.plan} (${label})`)}`);
    });
  };
  options.forEach(o => o.addEventListener('click', () => setBilling(o.dataset.billing)));
  setBilling('year');

  $$('.package-open').forEach(button => {
    const dialog = document.getElementById(button.getAttribute('aria-controls'));
    const close = () => dialog.close();

    button.addEventListener('click', () => {
      dialog.showModal();
      document.body.classList.add('is-dialog-open');
      $('.package-close', dialog).focus();
    });
    $('.package-close', dialog).addEventListener('click', close);
    // a click on the backdrop (outside the sheet) closes it
    dialog.addEventListener('click', e => {
      if (e.target === dialog) close();
    });
    dialog.addEventListener('close', () => {
      document.body.classList.remove('is-dialog-open');
      button.focus();
    });
  });
})();
