(function () {
  const root = document.getElementById('fid');
  if (!root || !window.Fidelize || !window.RW_I18N) return;

  let mm = null;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function paint() {
    const lang = window.RW_I18N.getLang() === 'en' ? 'en' : 'fr';
    const solution = window.Fidelize.list().find((item) => item.status === 'live');
    const grid = document.getElementById('solution-grid');
    const track = document.getElementById('steps-track');
    const close = document.getElementById('close-cta');
    if (!solution) {
      grid.innerHTML = '';
      track.innerHTML = '';
      return;
    }
    const copy = solution[lang];
    const statusLabel = window.RW_I18N.t('fid.status.live');
    const external = /^https?:\/\//i.test(solution.href);
    const rel = external ? ' rel="noopener noreferrer"' : '';
    grid.innerHTML = `
      <article class="panel">
        <div class="panel-top">
          <span class="sector">${esc(copy.sector)}</span>
          <span class="status">${esc(statusLabel)}</span>
        </div>
        <h2>${esc(solution.name)}</h2>
        <p class="tagline">${esc(copy.tagline)}</p>
        <p class="summary">${esc(copy.summary)}</p>
        <a class="fid-cta" href="${esc(solution.href)}"${rel}>${esc(copy.cta)}</a>
      </article>`;
    track.innerHTML = (copy.points || []).map((point, index) => `
      <article class="step">
        <span class="idx">${String(index + 1).padStart(2, '0')}</span>
        <h3>${esc(point)}</h3>
      </article>`).join('');
    if (close) {
      close.href = solution.href;
      close.textContent = copy.cta;
      if (external) close.setAttribute('rel', 'noopener noreferrer');
    }
  }

  function travel() {
    const track = document.getElementById('steps-track');
    const steps = document.getElementById('steps');
    if (!track || !steps) return 0;
    return Math.max(0, track.scrollWidth - steps.clientWidth);
  }

  function teardown() {
    if (mm) mm.revert();
    mm = null;
    document.documentElement.classList.remove('fid-motion');
  }

  function setupMotion() {
    teardown();
    if (!window.gsap || !window.ScrollTrigger) return;

    gsap.registerPlugin(ScrollTrigger);
    mm = gsap.matchMedia();
    mm.add({
      reduce: '(prefers-reduced-motion: reduce)',
      desktop: '(min-width: 800px) and (prefers-reduced-motion: no-preference)',
      mobile: '(max-width: 799px) and (prefers-reduced-motion: no-preference)',
    }, (context) => {
      const { reduce, desktop } = context.conditions;
      if (reduce) return undefined;

      document.documentElement.classList.add('fid-motion');
      const pinEnd = desktop ? '+=120%' : '+=80%';
      const lineEnd = desktop ? '+=200%' : '+=140%';

      gsap.fromTo('.progress', { scaleX: 0 }, {
        scaleX: 1,
        ease: 'none',
        scrollTrigger: {
          trigger: root,
          start: 'top top',
          end: 'bottom bottom',
          scrub: 0.3,
        },
      });

      ScrollTrigger.create({
        start: 8,
        end: 99999,
        toggleClass: { targets: '#chrome', className: 'is-scrolled' },
      });

      gsap.to('.glow', {
        y: 160,
        ease: 'none',
        scrollTrigger: {
          trigger: root,
          start: 'top top',
          end: 'bottom bottom',
          scrub: true,
        },
      });

      const hero = gsap.timeline({
        scrollTrigger: {
          trigger: '#hero',
          start: 'top top',
          end: pinEnd,
          pin: true,
          scrub: 0.6,
        },
      });
      hero
        .to('.watermark', { yPercent: -22, ease: 'none' }, 0)
        .to('.rule', { scaleX: 2.2, ease: 'none' }, 0)
        .to('.cue', { autoAlpha: 0, y: -12, ease: 'none' }, 0);

      gsap.set('#manifesto .line', { autoAlpha: 0, y: 28 });
      gsap.set('#manifesto .line-1', { autoAlpha: 1, y: 0 });
      const lines = gsap.timeline({
        scrollTrigger: {
          trigger: '#manifesto',
          start: 'top top',
          end: lineEnd,
          pin: true,
          scrub: 0.7,
        },
      });
      lines
        .to('.line-1', { autoAlpha: 0, y: -24, ease: 'none', duration: 0.45 })
        .to('.line-2', { autoAlpha: 1, y: 0, ease: 'none', duration: 0.45 }, '+=0.08')
        .to('.line-2', { autoAlpha: 0, y: -24, ease: 'none', duration: 0.45 }, '+=0.55')
        .to('.line-3', { autoAlpha: 1, y: 0, ease: 'none', duration: 0.45 }, '+=0.08');

      gsap.from('#solution-grid .panel', {
        y: 48,
        autoAlpha: 0,
        duration: 0.8,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: '#offer',
          start: 'top 78%',
          toggleActions: 'play none none reverse',
        },
      });

      gsap.fromTo('.offer-rule', { scaleX: 0 }, {
        scaleX: 1,
        ease: 'none',
        scrollTrigger: {
          trigger: '#offer',
          start: 'top 80%',
          end: 'top 45%',
          scrub: 0.4,
        },
      });

      if (travel() > 0) {
        const steps = gsap.timeline({
          scrollTrigger: {
            trigger: '#steps',
            start: 'top top',
            end: () => '+=' + travel(),
            pin: true,
            scrub: 0.6,
            invalidateOnRefresh: true,
          },
        });
        steps.to('#steps-track', { x: () => -travel(), ease: 'none' }, 0);
        steps.to('.steps-bar span', { scaleX: 1, ease: 'none' }, 0);
      }

      return () => document.documentElement.classList.remove('fid-motion');
    }, document.body);

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => ScrollTrigger.refresh());
    }
  }

  function render() {
    teardown();
    paint();
    setupMotion();
  }

  document.addEventListener('rw:lang', render);
  render();
})();
