// Media: an image that fails to load is replaced by its blueprint placeholder, with the same alt text announced
(() => {
  const { $$ } = WF;

  $$('.media img').forEach(img => {
    const fail = () => {
      const media = img.closest('.media');
      media.classList.add('is-broken');
      media.setAttribute('role', 'img');
      media.setAttribute('aria-label', img.alt);
    };
    if (img.complete && img.naturalWidth === 0) fail();
    else img.addEventListener('error', fail, { once: true });
  });
})();
