// Chapters: as each card rises, the logo dot leaves the number of the card before, falls onto the new card's
// top edge, squashes, bounces, then drops into its place after the new number. The first card's dot falls from above.
(() => {
  const { $, $$, motion } = WF;

  // Cross-page view transition: the dot of the clicked chapter becomes the dot of the service page hero
  $$('.chapter').forEach(chapter => {
    $('.chapter-btn', chapter).addEventListener('click', () => {
      $('.chapter-dot', chapter).style.viewTransitionName = 'wf-dot';
    });
  });

  if (!motion) return;

  const HOLD = .2;        // share of the card's rise during which the dot stays where it is
  const HOP = 2.8;        // bounce height on the edge, in dot sizes
  const SQUASH_Y = .62;   // landing squash
  const SQUASH_X = 1.24;


  const dots = $$('.chapter-dot');

  $$('.chapter').forEach((chapter, index) => {
    const dot = dots[index];
    const prevDot = dots[index - 1];

    // distances measured with the dots at rest, relative to their chapter top
    let dotTop = 0, dotH = 0, prevTop = 0;
    const offsetIn = el => el.getBoundingClientRect().top - el.closest('.chapter').getBoundingClientRect().top;
    const measure = () => {
      gsap.set(dot, { clearProps: 'transform' });
      dotTop = offsetIn(dot);
      dotH = dot.offsetHeight;
      if (prevDot) prevTop = offsetIn(prevDot);
    };
    measure();

    // y values from the rest position. Start (after the hold): where the previous dot sits (its card is stuck
    // at the top), or above the screen for the first card. Then: on this card's top edge, while the card rises.
    const rise = () => innerHeight * (1 - HOLD);
    const start = () => prevDot ? prevTop - (rise() + dotTop) : -(rise() + dotTop + dotH);
    const onEdge = () => -(dotTop + dotH);
    const hop = () => onEdge() - dotH * HOP;

    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: chapter,
        start: 'top bottom',
        end: 'top top',
        scrub: .6,
        invalidateOnRefresh: true,
        onRefreshInit: measure,
        // refreshed after the hero pin above, which shifts every position below it
        refreshPriority: -1,
      },
    });

    // the previous dot rests during the hold, then hands over to this card's dot
    tl.fromTo(dot, { visibility: 'hidden' }, { visibility: 'visible', duration: .001 }, HOLD);
    if (prevDot) tl.fromTo(prevDot, { opacity: 1 }, { opacity: 0, duration: .001 }, HOLD);

    tl.fromTo(dot, { y: start }, { y: onEdge, ease: 'power2.in', duration: .32 }, HOLD)
      .to(dot, { scaleY: SQUASH_Y, scaleX: SQUASH_X, transformOrigin: '50% 100%', duration: .05 })
      .to(dot, { scaleY: 1, scaleX: 1, y: hop, ease: 'power2.out', duration: .15 })
      .to(dot, { y: 0, ease: 'power2.in', duration: .2 })
      .to(dot, { scaleY: SQUASH_Y + .15, scaleX: SQUASH_X - .1, duration: .04 })
      .to(dot, { scaleY: 1, scaleX: 1, duration: .04 });
  });
})();
