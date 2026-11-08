// Accordion: buttons with aria-expanded control their panels (capabilities, FAQ). Several rows may be open.
(() => {
  const { $$ } = WF;

  $$('.accordion-toggle').forEach(button => {
    const panel = document.getElementById(button.getAttribute('aria-controls'));
    button.addEventListener('click', () => {
      const open = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded', open);
      panel.hidden = !open;
    });
  });
})();
