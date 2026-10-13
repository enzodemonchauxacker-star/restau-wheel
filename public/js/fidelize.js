(function () {
  const root = document.getElementById('fid');
  if (!root || !window.gsap || !window.ScrollTrigger) return;

  gsap.registerPlugin(ScrollTrigger);

  const TEXT = '#1E1E1E';
  const MUTED = '#9A9A9A';
  const ICONS = {
    qr: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 5h5v5H5zM14 5h5v5h-5zM5 14h5v5H5zM14 14h2v2h-2zM18 14h1v3h-3v-1M14 18h2v1"/></svg>',
    wheel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 5v3M12 16v3M5 12h3M16 12h3"/></svg>',
    gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="10" width="16" height="9" rx="1.5"/><path d="M4 14h16M12 10v9M12 10c-2 0-4-2-3-4s4 1 3 4zM12 10c2 0 4-2 3-4s-4 1-3 4z"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 4.5l1.8 4.2 4.6.5-3.4 3.1.9 4.5L12 14.6 7.1 16.8l.9-4.5L4.6 9.2l4.6-.5z"/></svg>',
    ticket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 8a2 2 0 0 0 2-2h12a2 2 0 0 0 2 2v2a2 2 0 0 1 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 18s-6-3.6-6-7.2A3.2 3.2 0 0 1 12 8a3.2 3.2 0 0 1 6 2.8C18 14.4 12 18 12 18z"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="6" width="16" height="13" rx="2"/><path d="M8 4v4M16 4v4M4 10h16"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="7"/><path d="M8.5 12.2l2.3 2.3 4.7-5"/></svg>',
    offer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 17L17 7M8.5 8.5h.01M15.5 15.5h.01"/><circle cx="8.5" cy="8.5" r="1.2"/><circle cx="15.5" cy="15.5" r="1.2"/></svg>',
  };
  const SPARKS = [
    '1,11 8,8 14,12 22,4 34,7',
    '1,8 9,12 16,5 24,9 34,3',
    '1,10 7,6 15,11 23,7 34,9',
    '1,7 10,10 18,4 26,8 34,5',
    '1,12 8,7 16,10 25,3 34,8',
    '1,6 9,11 17,6 25,10 34,4',
    '1,9 11,9 16,4 23,12 34,6',
    '1,11 8,5 15,8 24,4 34,10',
    '1,8 7,12 14,7 22,11 34,5',
  ];
  const ORDER = ['qr', 'wheel', 'gift', 'star', 'ticket', 'heart', 'calendar', 'check', 'offer'];
  const SPEEDS = [0.82, 1.12, 1.28, 0.9, 1.18, 1.24, 0.86, 1.08, 1.2];
  const TILTS = [-8, 6, -4, 11, -12, 5, 8, -6, 9];
  const SIZES = [48, 58, 44, 62, 50, 56, 46, 60, 52];

  function splitWords(el) {
    const text = el.textContent.replace(/\s+/g, ' ').trim();
    el.setAttribute('aria-label', text);
    el.innerHTML = text.split(' ').map((word) => `<span class="word">${word}</span>`).join(' ');
    return [...el.querySelectorAll('.word')];
  }

  function scrollRevealText(lines, timeline, position, color) {
    const words = lines.flatMap((line) => [...line.querySelectorAll('.word')]);
    timeline.to(words, {
      color: color || TEXT,
      stagger: 0.06,
      ease: 'none',
      duration: 0.55,
    }, position);
    return words;
  }

  function blurIn(targets) {
    return gsap.from(targets, {
      opacity: 0,
      y: 20,
      filter: 'blur(12px)',
      duration: 0.8,
      ease: 'power3.out',
      stagger: 0.08,
    });
  }

  function scrambleText(el, duration) {
    const finalText = el.textContent;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const proxy = { i: 0 };
    return gsap.to(proxy, {
      i: finalText.length,
      duration: duration || 0.6,
      ease: 'none',
      onUpdate: () => {
        const count = Math.floor(proxy.i);
        let out = '';
        for (let index = 0; index < finalText.length; index += 1) {
          const glyph = finalText[index];
          if (glyph === ' ') out += ' ';
          else if (index < count) out += glyph;
          else out += chars[Math.floor(Math.random() * chars.length)];
        }
        el.textContent = out;
      },
    });
  }

  function paintOrbit() {
    const orbit = document.getElementById('orbit');
    orbit.innerHTML = ORDER.map((name, index) => `
      <div class="orbit-item" style="--size:${SIZES[index]}px">
        <div class="floater">
          <div class="state state-a">
            <span class="lime-sq">${ICONS[name]}</span>
            <svg class="spark" viewBox="0 0 36 14" aria-hidden="true"><polyline points="${SPARKS[index]}"/></svg>
          </div>
          <div class="state state-b"><span class="outline-sq">${ICONS[name]}</span></div>
          <div class="state state-c" style="--size:${SIZES[index]}px"><span class="solid-sq">${ICONS[name]}</span></div>
        </div>
      </div>`).join('');
  }

  function layoutOrbit() {
    const rx = Math.min(window.innerWidth * 0.34, 440);
    const ry = Math.min(window.innerHeight * 0.2, 190);
    gsap.utils.toArray('.orbit-item').forEach((el, index) => {
      const angle = (index / ORDER.length) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(angle) * rx;
      const y = Math.sin(angle) * ry - (index === 0 ? 72 : 0);
      el.dataset.baseX = String(x);
      el.dataset.baseY = String(y);
      gsap.set(el, { x, y, xPercent: -50, yPercent: -50 });
    });
  }

  function mountLenis() {
    if (!window.Lenis) return null;
    const lenis = new Lenis({ lerp: 0.1, autoRaf: false });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
    return lenis;
  }

  function bindNavTheme() {
    document.querySelectorAll('[data-theme]').forEach((section) => {
      ScrollTrigger.create({
        trigger: section,
        start: 'top 64px',
        end: 'bottom 64px',
        onToggle: (self) => {
          if (!self.isActive) return;
          document.getElementById('nav').classList.toggle('is-dark', section.dataset.theme === 'dark');
        },
      });
    });
  }

  paintOrbit();
  document.querySelectorAll('[data-reveal]').forEach(splitWords);

  const tool = window.Fidelize && window.Fidelize.list().find((item) => item.status === 'live');
  if (tool) {
    document.querySelectorAll('a[href="https://restauwheel.com"]').forEach((link) => {
      link.href = tool.href;
    });
  }

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let lenis = null;
  if (!reduce) lenis = mountLenis();

  const mm = gsap.matchMedia();
  mm.add({
    reduce: '(prefers-reduced-motion: reduce)',
    desktop: '(min-width: 768px) and (prefers-reduced-motion: no-preference)',
    mobile: '(max-width: 767px) and (prefers-reduced-motion: no-preference)',
  }, (context) => {
    const { reduce: reduced, desktop } = context.conditions;
    if (reduced) {
      gsap.set('.word', { color: TEXT });
      gsap.from('.badge, .hero-title, .hero-cta', { opacity: 0, duration: 0.45, stagger: 0.08 });
      return undefined;
    }

    blurIn(['.badge', '.hero-title', '.hero-cta']);
    if (!desktop) {
      gsap.to('.word', { color: TEXT, duration: 0.8, stagger: 0.05, ease: 'power3.out', delay: 0.1 });
      return undefined;
    }

    gsap.to('.hero-title .line:first-child .word', {
      color: TEXT,
      duration: 0.8,
      stagger: 0.08,
      ease: 'power3.out',
      delay: 0.12,
    });

    gsap.set('.state', { xPercent: -50, yPercent: -50 });
    gsap.set('.phone', { xPercent: -50 });
    layoutOrbit();
    gsap.set('.state-b, .state-c', { autoAlpha: 0, scale: 0.82 });
    gsap.set('.state-a', { autoAlpha: 1, scale: 1 });

    const lines = gsap.utils.toArray('.hero-title .line').slice(1);
    const hero = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: '#hero',
        start: 'top top',
        end: '+=200%',
        pin: true,
        scrub: 0.5,
        invalidateOnRefresh: true,
      },
    });
    scrollRevealText(lines, hero, 0, TEXT);
    hero.to('.state-a', { autoAlpha: 0, scale: 0.8, rotation: -8, duration: 0.32, stagger: 0.015 }, 0.34);
    hero.to('.state-b', { autoAlpha: 1, scale: 1, rotation: 0, duration: 0.32, stagger: 0.015 }, 0.34);
    hero.to('.state-b', { autoAlpha: 0, scale: 0.84, rotation: 7, duration: 0.32, stagger: 0.015 }, 0.78);
    hero.to('.state-c', {
      autoAlpha: 1,
      scale: 1,
      rotation: (index) => TILTS[index],
      duration: 0.32,
      stagger: 0.015,
    }, 0.78);
    hero.to('.orbit-item', {
      y: (index, el) => Number(el.dataset.baseY) + (SPEEDS[index] - 1) * 150,
      duration: 1.15,
    }, 0);
    hero.to('.phone', { y: -80, duration: 1.15 }, 0);

    bindNavTheme();
    return undefined;
  }, document.body);

  window.FidelizePage = { lenis, scrambleText, scrollRevealText, blurIn };
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => ScrollTrigger.refresh());
  }
})();
