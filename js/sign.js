// Page hero drawings: crop the drawing to its own lines, so its top edge sits level with the breadcrumb (page.css)
(() => {
  const PAD = 2;
  WF.$$('.page-hero > svg.chapter-sign').forEach(svg => {
    const box = svg.getBBox();
    if (!box.width || !box.height) return;
    svg.setAttribute('viewBox', [box.x - PAD, box.y - PAD, box.width + PAD * 2, box.height + PAD * 2].join(' '));
    svg.setAttribute('preserveAspectRatio', 'xMaxYMin meet');
    svg.classList.add('is-fitted');
  });
})();
