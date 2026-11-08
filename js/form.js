// Contact form: accessible validation. Errors sit under each field (aria-describedby), a summary is focused
// and read out, the first invalid field is linked. On WordPress it sends to data-endpoint (inc/contact.php); the static preview only confirms.
(() => {
  const { $, $$ } = WF;
  const form = $('.contact-form');
  if (!form) return;

  const summary = $('.form-error-summary', form);
  const status = $('.form-status', form);
  // required inputs, plus checkbox groups that need at least one choice
  const fields = [...$$('[required]', form), ...$$('.field-group[data-required]', form)];
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // ?type=special or ?package=growth (links from special projects and the pricing sheets) preselects the type
  const params = new URLSearchParams(location.search);
  const wanted = params.get('type') || (params.get('package') ? 'package' : '');
  const choice = wanted && $(`[name="type[]"][value="${wanted}"]`, form);
  if (choice) choice.checked = true;
  if (params.get('package')) {
    const message = $('[name="message"]', form);
    message.value = message.value || (params.get('plan') || params.get('package').replace(/^\w/, c => c.toUpperCase())) + ': ';
  }

  const isValid = field => {
    if (field.matches('fieldset')) return $$('input:checked', field).length > 0;
    if (field.type === 'checkbox') return field.checked;
    const value = field.value.trim();
    if (!value) return false;
    return field.type === 'email' ? EMAIL.test(value) : true;
  };

  const setError = (field, message) => {
    const error = document.getElementById(field.id + '-error');
    error.textContent = message;
    if (message) field.setAttribute('aria-invalid', 'true');
    else field.removeAttribute('aria-invalid');
  };

  // after the first attempt, errors update as the visitor fixes them
  // the server ignores forms sent within seconds of the page opening (bots)
  const started = $('[name="started"]', form);
  if (started) started.value = Date.now();

  let tried = false;
  fields.forEach(field => {
    const check = () => {
      if (tried) setError(field, isValid(field) ? '' : field.dataset.error);
    };
    field.addEventListener('input', check);
    field.addEventListener('change', check);
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    tried = true;
    status.textContent = '';
    const invalid = fields.filter(field => !isValid(field));
    fields.forEach(field => setError(field, invalid.includes(field) ? field.dataset.error : ''));

    const list = $('ul', summary);
    list.innerHTML = '';
    if (invalid.length) {
      invalid.forEach(field => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = '#' + field.id;
        a.textContent = field.dataset.error;
        a.addEventListener('click', event => {
          event.preventDefault();
          (field.matches('fieldset') ? $('input', field) : field).focus();
        });
        li.appendChild(a);
        list.appendChild(li);
      });
      summary.hidden = false;
      summary.focus();
      return;
    }
    summary.hidden = true;
    // static preview: no server, only confirm
    if (!form.dataset.endpoint) {
      done(true);
      return;
    }
    const button = $('.contact-submit', form);
    button.disabled = true;
    form.setAttribute('aria-busy', 'true');
    fetch(form.dataset.endpoint, { method: 'POST', body: new FormData(form), credentials: 'same-origin' })
      .then(r => r.json())
      .then(r => done(!!r.success))
      .catch(() => done(false))
      .finally(() => {
        button.disabled = false;
        form.removeAttribute('aria-busy');
      });
  });

  function done(ok) {
    status.textContent = ok ? status.dataset.success : status.dataset.failed;
    status.classList.toggle('is-error', !ok);
    if (!ok) return;
    form.reset();
    started.value = Date.now();
    tried = false;
  }
})();
