(function () {
  if (!window.gsap || !window.ScrollTrigger) return;
  gsap.registerPlugin(ScrollTrigger);

  const TEXT = '#1E1E1E';
  const CREAM = '#FFF8F1';
  const ICONS = {
    qr: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 5h5v5H5zM14 5h5v5h-5zM5 14h5v5H5zM14 14h2v2h-2zM18 14h1v3h-3"/></svg>',
    wheel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 5v3M12 16v3M5 12h3M16 12h3"/></svg>',
    gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="10" width="16" height="9" rx="1.5"/><path d="M4 14h16M12 10v9"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 4.5l1.8 4.2 4.6.5-3.4 3.1.9 4.5L12 14.6 7.1 16.8l.9-4.5L4.6 9.2l4.6-.5z"/></svg>',
    ticket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 8h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 1 0-4z"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 18s-6-3.6-6-7.2A3.2 3.2 0 0 1 12 8a3.2 3.2 0 0 1 6 2.8C18 14.4 12 18 12 18z"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="6" width="16" height="13" rx="2"/><path d="M8 4v4M16 4v4M4 10h16"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="7"/><path d="M8.5 12.2l2.3 2.3 4.7-5"/></svg>',
    offer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="8" cy="8" r="2"/><circle cx="16" cy="16" r="2"/><path d="M7 17L17 7"/></svg>',
  };
  const ORDER = ['qr', 'wheel', 'gift', 'star', 'ticket', 'heart', 'calendar', 'check', 'offer'];
  const TILES = ['#6C5CE7', '#2ECC71', '#F1C40F', '#3498DB', '#E8FF95', '#E67E22', '#1ABC9C', '#9B59B6', '#F3E36A'];
  const SPEEDS = [0.82, 1.12, 1.28, 0.9, 1.18, 1.24, 0.86, 1.08, 1.2];
  const TILTS = [-8, 6, -4, 11, -12, 5, 8, -6, 9];
  const SIZES = [48, 58, 44, 62, 50, 56, 46, 60, 52];
  const SPARKS = ['1,11 8,8 14,12 22,4 34,7', '1,8 9,12 16,5 24,9 34,3', '1,10 7,6 15,11 23,7 34,9', '1,7 10,10 18,4 26,8 34,5', '1,12 8,7 16,10 25,3 34,8', '1,6 9,11 17,6 25,10 34,4', '1,9 11,9 16,4 23,12 34,6', '1,11 8,5 15,8 24,4 34,10', '1,8 7,12 14,7 22,11 34,5'];

  function splitWords(el) {
    if (el.dataset.split === '1') return [...el.querySelectorAll('.word')];
    const text = el.textContent.replace(/\s+/g, ' ').trim();
    el.dataset.split = '1';
    el.setAttribute('aria-label', text);
    el.innerHTML = text.split(' ').map((word) => `<span class="word">${word}</span>`).join(' ');
    return [...el.querySelectorAll('.word')];
  }

  function wordsIn(nodes) {
    return nodes.flatMap((node) => splitWords(node));
  }

  function scrollRevealText(lines, timeline, position, color) {
    const words = lines.flatMap((line) => [...line.querySelectorAll('.word')]);
    timeline.to(words, { color: color || TEXT, stagger: 0.05, ease: 'none', duration: 0.45 }, position);
  }

  function blurIn(targets) {
    return gsap.from(targets, {
      opacity: 0, y: 20, filter: 'blur(12px)', duration: 0.8, ease: 'power3.out', stagger: 0.08,
    });
  }

  function scrambleText(el) {
    const finalText = el.dataset.final || el.textContent;
    if (el.dataset.played === '1') {
      el.textContent = finalText;
      return gsap.set(el, {});
    }
    el.dataset.played = '1';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const proxy = { i: 0 };
    return gsap.to(proxy, {
      i: finalText.length, duration: 0.6, ease: 'none',
      onUpdate: () => {
        const count = Math.floor(proxy.i);
        let out = '';
        for (let index = 0; index < finalText.length; index += 1) {
          const glyph = finalText[index];
          if (glyph === ' ') out += ' ';
          else out += index < count ? glyph : chars[Math.floor(Math.random() * chars.length)];
        }
        el.textContent = out;
      },
    });
  }

  function icon(name) { return ICONS[name] || ICONS.wheel; }

  function paintOrbit() {
    document.getElementById('orbit').innerHTML = ORDER.map((name, index) => `
      <div class="orbit-item">
        <div class="floater">
          <div class="state state-a"><span class="lime-sq">${icon(name)}</span><svg class="spark" viewBox="0 0 36 14"><polyline points="${SPARKS[index]}"/></svg></div>
          <div class="state state-b"><span class="outline-sq">${icon(name)}</span></div>
          <div class="state state-c"><span class="solid-sq" style="--tile:${TILES[index]};--size:${SIZES[index]}px">${icon(name)}</span></div>
        </div>
      </div>`).join('');
    document.getElementById('flies').innerHTML = ORDER.map((name, index) => `
      <div class="fly" data-i="${index}"><span class="solid-sq" style="--tile:${TILES[index]};--size:42px">${icon(name)}</span></div>`).join('');
    const places = [['18%', '8%'], ['60%', '2%'], ['6%', '44%'], ['40%', '36%'], ['66%', '46%'], ['30%', '72%']];
    document.getElementById('screen-slots').innerHTML = places.map(([left, top]) => `<i class="slot" style="left:${left};top:${top}"></i>`).join('');
    document.getElementById('tool-grid').innerHTML = ORDER.concat(ORDER.slice(0, 6)).map((name, index) => `<span class="tool-cell"><span class="solid-sq" style="--tile:${TILES[index % TILES.length]};--size:34px">${icon(name)}</span></span>`).join('');
  }

  function layoutOrbit() {
    const rx = Math.min(window.innerWidth * 0.32, 420);
    const ry = Math.min(window.innerHeight * 0.18, 170);
    gsap.utils.toArray('.orbit-item').forEach((el, index) => {
      const angle = (index / ORDER.length) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(angle) * rx;
      const y = Math.sin(angle) * ry - (index === 0 ? 78 : 0);
      el.dataset.baseY = String(y);
      gsap.set(el, { x, y, xPercent: -50, yPercent: -50 });
    });
  }

  document.querySelectorAll('[data-reveal]').forEach(splitWords);
  document.querySelectorAll('[data-scramble]').forEach((title) => {
    title.dataset.final = title.textContent.trim();
  });
  paintOrbit();

  const tool = window.Fidelize && window.Fidelize.list().find((item) => item.status === 'live');
  if (tool) {
    document.querySelectorAll('a[href="https://restauwheel.com"]').forEach((link) => { link.href = tool.href; });
  }

  document.getElementById('theme-toggle').addEventListener('click', () => {
    document.getElementById('gate-screen').classList.toggle('is-night');
  });
  document.getElementById('news-form').addEventListener('submit', (event) => {
    event.preventDefault();
    event.currentTarget.querySelector('button').textContent = 'Inscrit';
  });

  const prefersReduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let lenis = null;
  if (!prefersReduce && window.Lenis) {
    lenis = new Lenis({ lerp: 0.1, autoRaf: false });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  const mm = gsap.matchMedia();
  mm.add({
    reduce: '(prefers-reduced-motion: reduce)',
    desktop: '(min-width: 901px) and (prefers-reduced-motion: no-preference)',
    mobile: '(max-width: 900px) and (prefers-reduced-motion: no-preference)',
  }, (context) => {
    const { reduce: reduced, desktop } = context.conditions;
    if (reduced || !desktop) {
      gsap.set('.word', { color: TEXT });
      gsap.set('#works .word, #events .word, #footer .word', { color: CREAM });
      gsap.set('#works, #events', { backgroundColor: '#3B3B3B' });
      gsap.set('#gateway, #community', { backgroundColor: '#E8FF95' });
      gsap.set('.check', { backgroundColor: '#E8FF95', borderColor: '#E8FF95' });
      gsap.set('.check i', { autoAlpha: 1 });
      gsap.from('.badge, .hero-title, .hero-cta', { opacity: 0, duration: reduced ? 0.35 : 0.6, stagger: 0.06 });
      if (!reduced) {
        gsap.to('.shot-wheel', {
          autoAlpha: 1, ease: 'none',
          scrollTrigger: { trigger: '#events', start: 'top 80%', end: 'center 55%', scrub: 0.5 },
          onUpdate() {
            document.querySelector('.events-phone .screen').classList.toggle('is-wheel', this.progress() > 0.45);
          },
        });
      }
      return () => document.documentElement.classList.remove('fid-motion');
    }

    document.documentElement.classList.add('fid-motion');
    blurIn(['.badge', '.hero-title', '.hero-cta']);
    gsap.to('#hero .line:first-child .word', { color: TEXT, duration: 0.8, stagger: 0.08, ease: 'power3.out', delay: 0.1 });
    gsap.set('.state', { xPercent: -50, yPercent: -50 });
    gsap.set('.events-phone', { xPercent: -50 });
    layoutOrbit();
    ScrollTrigger.addEventListener('refreshInit', layoutOrbit);
    gsap.set('.state-b, .state-c', { autoAlpha: 0, scale: 0.84 });
    gsap.set('.state-a', { autoAlpha: 1, scale: 1 });

    const hero = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: { trigger: '#hero', start: 'top top', end: '+=200%', pin: true, scrub: 0.5, invalidateOnRefresh: true, zIndex: 1 },
    });
    scrollRevealText(gsap.utils.toArray('#hero .line').slice(1), hero, 0, TEXT);
    hero.to('.state-a', { autoAlpha: 0, scale: 0.8, rotation: -8, duration: 0.28, stagger: 0.012 }, 0.28);
    hero.to('.state-b', { autoAlpha: 1, scale: 1, rotation: 0, duration: 0.28, stagger: 0.012 }, 0.36);
    hero.to('.state-b', { autoAlpha: 0, scale: 0.86, rotation: 6, duration: 0.28, stagger: 0.012 }, 0.72);
    hero.to('.state-c', { autoAlpha: 1, scale: 1, rotation: (i) => TILTS[i], duration: 0.28, stagger: 0.012 }, 0.8);
    hero.to('.orbit-item', { y: (i, el) => Number(el.dataset.baseY) + (SPEEDS[i] - 1) * 140, duration: 1.1 }, 0);

    const phoneGroup = document.querySelector('.gateway-phone');
    const phoneGrid = phoneGroup.parentNode;
    const phoneAfter = phoneGroup.nextSibling;
    const phoneHold = document.createElement('div');
    phoneHold.className = 'gateway-phone-spacer';
    phoneHold.setAttribute('aria-hidden', 'true');
    let phoneDocked = false;
    let gatewayOpen = false;
    const phoneTravel = { p: 0 };
    const phonePeek = 220;

    function placeGatewayPhone(p) {
      const vh = window.innerHeight;
      const height = phoneGroup.offsetHeight;
      const startTop = vh - phonePeek;
      const endTop = (vh - height) / 2;
      gsap.set(phoneGroup, {
        xPercent: -50,
        x: 0,
        y: 0,
        left: '50%',
        top: startTop + (endTop - startTop) * p,
      });
    }

    function floatGatewayPhone() {
      if (!phoneHold.isConnected) phoneGrid.insertBefore(phoneHold, phoneGroup);
      if (phoneGroup.parentNode !== document.body) document.body.appendChild(phoneGroup);
      phoneGroup.classList.add('is-float');
      phoneDocked = false;
    }

    function dockGatewayPhone() {
      if (phoneGroup.parentNode === phoneGrid) return;
      phoneDocked = true;
      phoneGroup.classList.remove('is-float');
      gsap.set(phoneGroup, { clearProps: 'all' });
      phoneGrid.insertBefore(phoneGroup, phoneHold.isConnected ? phoneHold : phoneAfter);
      if (phoneHold.isConnected) phoneHold.remove();
    }

    floatGatewayPhone();
    placeGatewayPhone(0);
    gsap.to(phoneTravel, {
      p: 1,
      ease: 'none',
      scrollTrigger: {
        trigger: '#gateway',
        start: 'top bottom',
        end: 'top top',
        scrub: 0.5,
        invalidateOnRefresh: true,
      },
      onUpdate: () => {
        if (phoneDocked) return;
        placeGatewayPhone(phoneTravel.p);
        if (gatewayOpen && phoneTravel.p > 0.985) dockGatewayPhone();
      },
    });

    const gate = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: '#gateway',
        start: 'top top',
        end: '+=180%',
        pin: true,
        scrub: 0.5,
        invalidateOnRefresh: true,
        zIndex: 1,
        onEnter: () => { gatewayOpen = true; if (phoneTravel.p > 0.985) dockGatewayPhone(); },
        onLeave: () => dockGatewayPhone(),
        onEnterBack: () => { gatewayOpen = true; floatGatewayPhone(); placeGatewayPhone(phoneTravel.p); },
        onLeaveBack: () => { gatewayOpen = false; floatGatewayPhone(); placeGatewayPhone(phoneTravel.p); },
      },
    });
    scrollRevealText(gsap.utils.toArray('#gateway .line'), gate, 0, TEXT);
    gate.from('.gateway-copy', { autoAlpha: 0, y: 16, duration: 0.3 }, 0.22);
    gsap.utils.toArray('.fly').forEach((fly, index) => {
      const angle = (index / ORDER.length) * Math.PI * 2 - Math.PI / 2;
      const start = { x: Math.cos(angle) * 320, y: Math.sin(angle) * 170 };
      gsap.set(fly, { xPercent: -50, yPercent: -50, x: start.x, y: start.y });
      const proxy = { p: 0 };
      gate.to(proxy, {
        p: 1,
        duration: 0.7,
        onUpdate: () => {
          const slot = document.querySelectorAll('#screen-slots .slot')[index % 6];
          const flies = document.getElementById('flies');
          if (!slot || !flies) return;
          const a = slot.getBoundingClientRect();
          const b = flies.getBoundingClientRect();
          const targetX = (a.left + a.width / 2) - (b.left + b.width / 2);
          const targetY = (a.top + a.height / 2) - (b.top + b.height * 0.46);
          gsap.set(fly, {
            x: start.x + (targetX - start.x) * proxy.p,
            y: start.y + (targetY - start.y) * proxy.p,
            scale: 1 - proxy.p * 0.2,
            autoAlpha: index < 6 ? 1 : 1 - proxy.p,
          });
        },
      }, 0.18);
    });

    const works = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: { trigger: '#works', start: 'top top', end: '+=170%', pin: true, scrub: 0.5, invalidateOnRefresh: true, zIndex: 1 },
    });
    scrollRevealText(gsap.utils.toArray('#works [data-reveal]'), works, 0, CREAM);
    works.to('.bento', {
      y: () => {
        const bento = document.querySelector('.bento');
        const clip = document.querySelector('.bento-clip');
        return -Math.max(0, bento.offsetHeight - clip.clientHeight + 8);
      },
      duration: 0.8,
    }, 0.18);
    works.to('.check', { backgroundColor: '#E8FF95', borderColor: '#E8FF95', duration: 0.12, stagger: 0.12 }, 0.18);
    works.to('.check i', { autoAlpha: 1, duration: 0.1, stagger: 0.12 }, 0.2);
    works.from('.tool-cell', { scale: 0, autoAlpha: 0, duration: 0.35, stagger: 0.025 }, 0.28);

    const community = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: '#community',
        start: 'top top',
        end: '+=300%',
        pin: true,
        scrub: 0.5,
        invalidateOnRefresh: true,
        zIndex: 1,
      },
    });
    const titleScale = 1.62;
    community.from('.avatars img', {
      x: (i, el) => {
        const stage = el.offsetParent;
        return (stage.clientWidth / 2) - (el.offsetLeft + el.offsetWidth / 2);
      },
      y: (i, el) => {
        const stage = el.offsetParent;
        return (stage.clientHeight / 2) - (el.offsetTop + el.offsetHeight / 2);
      },
      scale: 0.3,
      duration: 0.55,
      stagger: 0.04,
    }, 0);
    scrollRevealText(gsap.utils.toArray('#community .line'), community, 0.06, TEXT);
    community.to('.community-copy', {
      scale: titleScale,
      duration: 0.34,
      transformOrigin: '50% 50%',
    }, 1.25);
    community.to('.community-copy', {
      y: () => {
        const stage = document.querySelector('.community-stage');
        const copy = document.querySelector('.community-copy');
        const visualTop = (stage.clientHeight - copy.offsetHeight * titleScale) / 2;
        return 84 - visualTop;
      },
      duration: 0.42,
    }, 1.6);
    community.from('.community-copy p', { autoAlpha: 0, duration: 0.32, immediateRender: true }, 1.82);
    community.to('.avatars img', { y: (i) => -16 - (i % 5) * 14, duration: 0.4 }, 2.15);

    const events = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: { trigger: '#events', start: 'top top', end: '+=280%', pin: true, scrub: 0.5, invalidateOnRefresh: true, zIndex: 1 },
    });
    const stageWidth = () => document.querySelector('.events-stage').clientWidth;
    scrollRevealText(gsap.utils.toArray('#events [data-reveal]'), events, 0, CREAM);
    events.from('.pill-now.pill-l', {
      x: () => stageWidth() * 0.34,
      stagger: 0.05, duration: 0.42,
    }, 0.1);
    events.from('.pill-now.pill-r', {
      x: () => -stageWidth() * 0.34,
      stagger: 0.05, duration: 0.42,
    }, 0.1);
    const shot = { p: 0 };
    events.to(shot, {
      p: 1, duration: 0.42,
      onUpdate: () => {
        gsap.set('.shot-wheel', { autoAlpha: shot.p });
        document.querySelector('.events-phone .screen').classList.toggle('is-wheel', shot.p > 0.45);
      },
    }, 0.1);
    events.from('.events-note', { autoAlpha: 0, duration: 0.2 }, 0.55);
    events.to({ hold: 0 }, { hold: 1, duration: 0.28 }, 0.58);
    events.to('.pill-now.pill-l', {
      x: () => -stageWidth() * 0.62,
      autoAlpha: 0,
      stagger: 0.04,
      duration: 0.34,
    }, 0.9);
    events.to('.pill-now.pill-r', {
      x: () => stageWidth() * 0.62,
      autoAlpha: 0,
      stagger: 0.04,
      duration: 0.34,
    }, 0.9);
    events.to('.events-note', { autoAlpha: 0, duration: 0.2 }, 0.9);
    events.fromTo('.pill-next.pill-l', {
      x: () => stageWidth() * 0.34,
      autoAlpha: 0,
    }, {
      x: 0,
      autoAlpha: 1,
      stagger: 0.05,
      duration: 0.42,
      immediateRender: true,
    }, 1.28);
    events.fromTo('.pill-next.pill-r', {
      x: () => -stageWidth() * 0.34,
      autoAlpha: 0,
    }, {
      x: 0,
      autoAlpha: 1,
      stagger: 0.05,
      duration: 0.42,
      immediateRender: true,
    }, 1.28);
    const nextShot = { p: 0 };
    events.to(nextShot, {
      p: 1, duration: 0.42,
      onUpdate: () => {
        gsap.set('.shot-next', { autoAlpha: nextShot.p });
        document.querySelector('.events-phone .screen').classList.toggle('is-next', nextShot.p > 0.45);
      },
    }, 1.28);

    const stories = gsap.utils.toArray('.story');
    gsap.set(stories.slice(1), { autoAlpha: 0 });
    const storyTl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: { trigger: '#stories', start: 'top top', end: '+=400%', pin: true, scrub: 0.5, zIndex: 1 },
    });
    storyTl.set(stories[0].querySelectorAll('.word'), { color: TEXT }, 0);
    stories.forEach((story, index) => {
      if (!index) return;
      const at = 0.12 + (index - 1) * 0.22;
      const prev = stories[index - 1];
      const photo = story.querySelector('.story-photo');
      const prevPhoto = prev.querySelector('.story-photo');
      const toward = story.dataset.side === 'left' ? 90 : -90;
      storyTl.to(prevPhoto, { x: toward, clipPath: 'inset(10% 70% 10% 6% round 28px)', duration: 0.1 }, at);
      storyTl.to(prev.querySelectorAll('.word'), { color: '#9A9A9A', duration: 0.08 }, at);
      storyTl.to(prev, { autoAlpha: 0, duration: 0.06 }, at + 0.08);
      storyTl.fromTo(story, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.06 }, at + 0.1);
      storyTl.fromTo(photo, { clipPath: 'inset(10% 6% 10% 70% round 28px)', x: -toward }, { clipPath: 'inset(0% 0% 0% 0% round 28px)', x: 0, duration: 0.12 }, at + 0.1);
      storyTl.to(story.querySelectorAll('.word'), { color: TEXT, stagger: 0.02, duration: 0.08 }, at + 0.1);
    });
    storyTl.to({}, { duration: 0.12 }, 0.86);

    const colors = [
      ['#gateway', '#FFF8F1', '#E8FF95', 'top bottom', 'top 58%'],
      ['#works', '#E8FF95', '#3B3B3B', 'top 70%', 'top 30%'],
      ['#community', '#3B3B3B', '#E8FF95', 'top 70%', 'top 30%'],
      ['#events', '#E8FF95', '#3B3B3B', 'top 70%', 'top 30%'],
      ['#stories', '#3B3B3B', '#FFF8F1', 'top 70%', 'top 30%'],
    ];
    colors.forEach(([sel, from, to, start, end]) => {
      gsap.fromTo(document.body, { backgroundColor: from }, {
        backgroundColor: to, ease: 'none', immediateRender: false,
        scrollTrigger: { trigger: sel, start, end, scrub: true },
      });
    });

    document.querySelectorAll('[data-theme]').forEach((section) => {
      ScrollTrigger.create({
        trigger: section, start: 'top 64px', end: 'bottom 64px',
        onToggle: (self) => {
          if (!self.isActive) return;
          document.getElementById('nav').classList.toggle('is-dark', section.dataset.theme === 'dark');
        },
      });
    });

    gsap.utils.toArray('[data-scramble]').forEach((title) => {
      ScrollTrigger.create({
        trigger: title, start: 'top 75%', once: true,
        onEnter: () => scrambleText(title),
      });
    });

    const path = document.getElementById('ribbon-path');
    const length = path.getTotalLength();
    gsap.set(path, { strokeDasharray: length, strokeDashoffset: length });
    gsap.to(path, {
      strokeDashoffset: 0, ease: 'none',
      scrollTrigger: { trigger: '#footer', start: 'top 80%', end: 'bottom bottom', scrub: 0.5 },
    });
    ScrollTrigger.create({
      trigger: '#footer',
      start: 'top bottom',
      end: 'top 40%',
      scrub: true,
      onUpdate: (self) => {
        const amount = self.progress * 18;
        document.getElementById('stories').style.filter = amount ? `blur(${amount}px)` : 'none';
      },
    });
    gsap.fromTo('.veil', { autoAlpha: 0 }, {
      autoAlpha: 1, ease: 'none',
      scrollTrigger: { trigger: '#footer', start: 'top bottom', end: 'top 45%', scrub: true },
    });
    gsap.from('.fcard', {
      filter: 'blur(16px)', y: 24, autoAlpha: 0, duration: 0.7, stagger: 0.08, ease: 'power3.out',
      scrollTrigger: { trigger: '#footer', start: 'top 70%', toggleActions: 'play none none reverse' },
    });

    return () => {
      dockGatewayPhone();
      if (phoneHold.isConnected) phoneHold.remove();
      ScrollTrigger.removeEventListener('refreshInit', layoutOrbit);
      document.querySelectorAll('[data-scramble]').forEach((title) => {
        if (title.dataset.final) title.textContent = title.dataset.final;
        delete title.dataset.played;
      });
      document.documentElement.classList.remove('fid-motion');
    };
  }, document.body);

  window.FidelizePage = { lenis, scrambleText, scrollRevealText, blurIn };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => ScrollTrigger.refresh());
})();
