// WebFully fields panel: turns one content file (JSON) into a form and writes it back on save.
// Texts → inputs (long ones → text areas), numbers, yes/no → checkboxes, images → field + media library,
// lists → items that can be added, removed and moved. Structure keys stay read-only.
(() => {
  const source = document.getElementById('wf-json');
  const host = document.getElementById('wf-editor');
  const form = document.getElementById('wf-form');
  if (!source || !host || !form) return;

  let data = JSON.parse(source.value);
  let dirty = false;

  const READ_ONLY = ['type', 'kind', 'key', 'slug', 'output', 'schema_type', 'name_key'];
  const LONG = ['lead', 'text', 'body', 'a', 'quote', 'description', 'summary', 'intro', 'note', 'answer', 'message'];
  const IMAGE = /(^|_)(image|img|photo|logo|src|picture|og_image)$/;
  const TITLE_KEYS = ['title', 'name', 'label', 'q', 'heading', 'key', 'type', 'value'];

  const el = (tag, attrs = {}, ...kids) => {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') node.className = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else if (v !== false && v !== null && v !== undefined) node.setAttribute(k, v === true ? '' : v);
    });
    kids.flat().forEach(kid => node.append(kid));
    return node;
  };
  const human = key => String(key).replace(/[_-]+/g, ' ').replace(/^\w/, c => c.toUpperCase());
  const changed = () => {
    dirty = true;
  };

  // a new list item: same shape as the last one, texts emptied
  const blank = value => {
    if (Array.isArray(value)) return [];
    if (value && typeof value === 'object') {
      const out = {};
      Object.entries(value).forEach(([k, v]) => out[k] = READ_ONLY.includes(k) ? v : blank(v));
      return out;
    }
    if (typeof value === 'number') return 0;
    if (typeof value === 'boolean') return false;
    return '';
  };

  const summary = (item, index) => {
    if (item && typeof item === 'object') {
      const key = TITLE_KEYS.find(k => typeof item[k] === 'string' && item[k].trim());
      if (key) return `${index + 1}. ${item[key].slice(0, 70)}`;
    }
    if (typeof item === 'string' && item.trim()) return `${index + 1}. ${item.slice(0, 70)}`;
    return `${index + 1}.`;
  };

  function field(parent, key, value, path) {
    const id = 'wf-' + path.join('-');
    const set = v => {
      parent[key] = v;
      changed();
    };

    if (READ_ONLY.includes(key) && typeof value !== 'object') {
      return el('div', { class: 'wf-field wf-field--fixed' }, el('span', { class: 'wf-label' }, human(key)), el('code', {}, String(value)));
    }
    if (typeof value === 'boolean') {
      return el('div', { class: 'wf-field wf-field--check' },
        el('label', { for: id }, el('input', { id, type: 'checkbox', checked: value, onchange: e => set(e.target.checked) }), ' ', human(key)));
    }
    if (typeof value === 'number') {
      return el('div', { class: 'wf-field' }, el('label', { class: 'wf-label', for: id }, human(key)),
        el('input', { id, type: 'number', step: 'any', value, class: 'small-text', oninput: e => set(e.target.value === '' ? 0 : Number(e.target.value)) }));
    }
    if (value === null || typeof value === 'string') {
      const text = value || '';
      const long = LONG.includes(key) || text.length > 80 || text.includes('\n');
      const input = long
        ? el('textarea', { id, rows: Math.min(10, Math.max(3, Math.ceil(text.length / 90))), class: 'large-text', oninput: e => set(e.target.value) }, text)
        : el('input', { id, type: 'text', value: text, class: 'regular-text', oninput: e => set(e.target.value) });
      const row = el('div', { class: 'wf-field' }, el('label', { class: 'wf-label', for: id }, human(key)), input);
      if (IMAGE.test(String(key)) && window.wp && wp.media) {
        row.append(el('button', {
          type: 'button', class: 'button wf-media', onclick: () => {
            const frame = wp.media({ title: human(key), library: { type: 'image' }, multiple: false });
            frame.on('select', () => {
              const file = frame.state().get('selection').first().toJSON();
              input.value = file.url;
              set(file.url);
            });
            frame.open();
          },
        }, 'Choose image'));
      }
      return row;
    }
    if (Array.isArray(value)) return list(parent, key, value, path);
    return group(key, value, path);
  }

  function group(key, obj, path, open = false) {
    const body = el('div', { class: 'wf-group-body' });
    Object.keys(obj).forEach(k => body.append(field(obj, k, obj[k], path.concat(k))));
    const title = key === null ? '' : human(key);
    return el('details', { class: 'wf-group', open: open || path.length < 2 }, el('summary', {}, title), body);
  }

  function list(parent, key, items, path) {
    const box = el('div', { class: 'wf-list' });
    const draw = () => {
      box.innerHTML = '';
      items.forEach((item, i) => {
        const tools = el('span', { class: 'wf-tools' },
          el('button', { type: 'button', class: 'button-link', 'aria-label': 'Move up', disabled: i === 0, onclick: e => move(e, i, -1) }, '↑'),
          el('button', { type: 'button', class: 'button-link', 'aria-label': 'Move down', disabled: i === items.length - 1, onclick: e => move(e, i, 1) }, '↓'),
          el('button', { type: 'button', class: 'button-link wf-danger', 'aria-label': 'Remove', onclick: e => remove(e, i) }, '✕'));
        let content;
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          const body = el('div', { class: 'wf-group-body' });
          Object.keys(item).forEach(k => body.append(field(item, k, item[k], path.concat(i, k))));
          content = el('details', { class: 'wf-group wf-item' }, el('summary', {}, summary(item, i), tools), body);
        } else {
          const row = field(items, i, item, path.concat(i));
          row.classList.add('wf-item');
          const label = row.querySelector('.wf-label');
          if (label) label.textContent = `${i + 1}.`;
          row.append(tools);
          content = row;
        }
        box.append(content);
      });
      box.append(el('button', { type: 'button', class: 'button wf-add', onclick: add }, '+ Add'));
    };
    const move = (e, i, step) => {
      e.preventDefault();
      const [item] = items.splice(i, 1);
      items.splice(i + step, 0, item);
      changed();
      draw();
    };
    const remove = (e, i) => {
      e.preventDefault();
      if (!confirm('Remove this item?')) return;
      items.splice(i, 1);
      changed();
      draw();
    };
    function add() {
      items.push(items.length ? blank(items[items.length - 1]) : '');
      changed();
      draw();
      const last = box.querySelectorAll('.wf-item');
      const target = last[last.length - 1];
      if (target && target.tagName === 'DETAILS') target.open = true;
    }
    draw();
    return el('div', { class: 'wf-field wf-field--list' }, el('span', { class: 'wf-label' }, human(key)), box);
  }

  // top level: sections get one open panel each, titled by their type
  host.innerHTML = '';
  // edited elsewhere: social links live under WebFully → Settings
  const ELSEWHERE = { social: 'Social links: WebFully → Settings' };
  Object.keys(data).forEach(k => {
    if (ELSEWHERE[k] && source.dataset.doc === 'site.json') {
      host.append(el('p', { class: 'wf-field wf-field--fixed' }, el('span', { class: 'wf-label' }, human(k)), el('em', {}, ELSEWHERE[k])));
      return;
    }
    if (k === 'sections' && Array.isArray(data.sections)) {
      host.append(el('h2', {}, 'Sections'));
      data.sections.forEach((section, i) => {
        const body = el('div', { class: 'wf-group-body' });
        Object.keys(section).forEach(sk => body.append(field(section, sk, section[sk], ['sections', i, sk])));
        host.append(el('details', { class: 'wf-group wf-section' }, el('summary', {}, `${i + 1}. ${human(section.type || 'section')}`), body));
      });
      return;
    }
    host.append(field(data, k, data[k], [k]));
  });

  form.addEventListener('submit', () => {
    source.value = JSON.stringify(data);
    dirty = false;
  });
  addEventListener('beforeunload', e => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
})();
