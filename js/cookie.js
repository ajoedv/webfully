// Cookie consent: shown until the visitor decides; the choice is stored in the browser and can be changed
// from "Cookie settings" in the footer. Other scripts read the result from WF.consent and the wf:consent event.
(() => {
  const { $, $$, emit } = WF;
  const KEY = 'wf-consent';
  const VERSION = 1;
  const banner = $('.cookie');
  const choices = $('.cookie-choices', banner);
  const customize = $('.cookie-customize', banner);
  const save = $('.cookie-save', banner);
  const optional = $$('input:not([disabled])', choices);

  const read = () => {
    try {
      const value = JSON.parse(localStorage.getItem(KEY));
      return value && value.version === VERSION ? value : null;
    } catch (e) {
      return null;
    }
  };

  const store = categories => {
    const value = { version: VERSION, date: new Date().toISOString(), categories };
    try {
      localStorage.setItem(KEY, JSON.stringify(value));
    } catch (e) {}
    WF.consent = value;
    emit('consent', value);
  };

  const all = state => Object.fromEntries(optional.map(input => [input.name, state]));

  function open() {
    const saved = read();
    optional.forEach(input => input.checked = !!(saved && saved.categories[input.name]));
    banner.hidden = false;
    $('[data-consent="accept"]', banner).focus();
  }

  function close() {
    banner.hidden = true;
    choices.hidden = true;
    save.hidden = true;
    customize.setAttribute('aria-expanded', 'false');
  }

  banner.addEventListener('click', e => {
    const action = e.target.closest('[data-consent]');
    if (!action) return;
    const kind = action.dataset.consent;
    if (kind === 'accept') store(all(true));
    if (kind === 'reject') store(all(false));
    if (kind === 'save') store(Object.fromEntries(optional.map(input => [input.name, input.checked])));
    close();
  });

  customize.addEventListener('click', () => {
    const show = choices.hidden;
    choices.hidden = !show;
    save.hidden = !show;
    customize.setAttribute('aria-expanded', show);
  });

  banner.addEventListener('keydown', e => {
    if (e.key === 'Escape' && read()) close();
  });

  $$('.cookie-open').forEach(button => button.addEventListener('click', open));

  WF.consent = read();
  if (!WF.consent) banner.hidden = false;
})();
