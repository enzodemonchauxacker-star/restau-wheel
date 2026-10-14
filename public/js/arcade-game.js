(function () {
  const canvas = document.getElementById('lane');
  const ctx = canvas.getContext('2d');
  const reveal = document.getElementById('reveal');
  const throwBtn = document.getElementById('throw');
  const hint = document.getElementById('hint');
  const again = document.getElementById('again');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let w = 800;
  let h = 640;
  let gift = { label: 'Partie offerte', detail: 'À récupérer au comptoir.' };
  let aim = 0;
  let phase = 'ready';
  let roll = { from: 0, to: 0, start: 0, ms: 1100 };
  let ballZ = 0.08;
  let shake = 0;
  let pins = makePins();
  let last = 0;
  let pointerId = null;

  function makePins() {
    const layout = [
      [0, 0],
      [-1, 1], [1, 1],
      [-2, 2], [0, 2], [2, 2],
      [-3, 3], [-1, 3], [1, 3], [3, 3],
    ];
    return layout.map(([col, row]) => ({
      x: col * 0.155,
      z: 0.8 + row * 0.042,
      hit: false,
      ox: 0,
      oy: 0,
      rot: 0,
      vx: 0,
      vy: 0,
      vr: 0,
    }));
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    w = rect.width;
    h = rect.height;
  }

  function project(x, z) {
    const depth = 1 - z * 0.74;
    const y = h * 0.9 + (h * 0.16 - h * 0.9) * z;
    return { x: w / 2 + x * w * 0.46 * depth, y, s: depth };
  }

  function drawLane() {
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

    const boards = 16;
    for (let i = 0; i < boards; i += 1) {
      const z0 = i / boards;
      const z1 = (i + 1) / boards;
      const a = project(-1, z0);
      const b = project(1, z0);
      const c = project(1, z1);
      const d = project(-1, z1);
      ctx.fillStyle = i % 2 === 0 ? '#d3924e' : '#c07838';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.fill();
    }

    [-1, 1].forEach((side) => {
      const near = project(side, 0);
      const far = project(side, 1);
      ctx.strokeStyle = '#e4b4b4';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(near.x, near.y);
      ctx.lineTo(far.x, far.y);
      ctx.stroke();
    });

    const foulA = project(-1, 0.16);
    const foulB = project(1, 0.16);
    ctx.strokeStyle = 'rgba(246,243,238,.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(foulA.x, foulA.y);
    ctx.lineTo(foulB.x, foulB.y);
    ctx.stroke();

    for (let i = -2; i <= 2; i += 1) {
      const dot = project(i * 0.08, 0.22);
      ctx.fillStyle = 'rgba(246,243,238,.7)';
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, 3.2 * dot.s, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPin(pin) {
    const p = project(pin.x, pin.z);
    const height = 58 * p.s;
    const width = 18 * p.s;
    ctx.save();
    ctx.translate(p.x + pin.ox, p.y + pin.oy);
    ctx.rotate(pin.rot);
    ctx.fillStyle = '#f6f1e8';
    ctx.beginPath();
    ctx.moveTo(-width / 2, 0);
    ctx.quadraticCurveTo(-width / 2, -height * 0.46, -width * 0.28, -height * 0.74);
    ctx.quadraticCurveTo(0, -height, width * 0.28, -height * 0.74);
    ctx.quadraticCurveTo(width / 2, -height * 0.46, width / 2, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#e4b4b4';
    ctx.fillRect(-width * 0.34, -height * 0.55, width * 0.68, Math.max(2, height * 0.08));
    ctx.restore();
  }

  function drawBall() {
    const p = project(ballX(), ballZ);
    const radius = 24 * p.s;
    const shade = ctx.createRadialGradient(p.x - radius * 0.35, p.y - radius * 0.4, radius * 0.15, p.x, p.y, radius);
    shade.addColorStop(0, '#f4e4e4');
    shade.addColorStop(0.42, '#d7a3a3');
    shade.addColorStop(1, '#6d4545');
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + radius * 0.85, radius * 0.8, radius * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a0614';
    [[-0.28, -0.15], [0.28, -0.15], [0, 0.22]].forEach(([hx, hy]) => {
      ctx.beginPath();
      ctx.arc(p.x + hx * radius, p.y + hy * radius, radius * 0.13, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function ballX() {
    if (phase === 'roll' || phase === 'settle' || phase === 'done') {
      const travel = Math.min(1, Math.max(0, (ballZ - 0.08) / 0.78));
      return aim * (0.28 + 0.72 * travel);
    }
    return aim;
  }

  function draw() {
    drawLane();
    const ordered = pins.slice().sort((a, b) => b.z - a.z);
    let ballDrawn = false;
    ordered.forEach((pin) => {
      if (!ballDrawn && pin.z < ballZ) {
        drawBall();
        ballDrawn = true;
      }
      drawPin(pin);
    });
    if (!ballDrawn) drawBall();
    ctx.restore();
  }

  function knockPins() {
    const impact = aim * 0.85;
    const ranked = pins
      .map((pin) => ({ pin, distance: Math.abs(pin.x - impact) }))
      .sort((a, b) => a.distance - b.distance);
    const bag = [0, 2, 3, 4, 5, 6, 6, 7, 7, 8, 8, 9, 10, 10];
    const count = bag[Math.floor(Math.random() * bag.length)];
    ranked.slice(0, count).forEach(({ pin }, index) => {
      const dir = Math.sign(pin.x - impact) || (index % 2 === 0 ? -1 : 1);
      pin.hit = true;
      pin.vx = dir * (1.6 + Math.random() * 3.4);
      pin.vy = -(2.4 + Math.random() * 4.2);
      pin.vr = dir * (0.04 + Math.random() * 0.1);
    });
    shake = 8;
    return count;
  }

  function showReward(count) {
    const phrase = count === 0 ? 'Aucune quille' : count === 1 ? '1 quille' : `${count} quilles`;
    document.getElementById('pins-note').textContent = `${phrase} · le cadeau reste le même`;
    document.getElementById('gift-label').textContent = gift.label;
    document.getElementById('gift-detail').textContent = gift.detail;
    reveal.hidden = false;
    throwBtn.disabled = false;
    hint.textContent = 'Le cadeau est à toi.';
    phase = 'done';
  }

  function finishRoll() {
    const count = knockPins();
    phase = 'settle';
    window.setTimeout(() => showReward(count), reduced ? 0 : 900);
  }

  function throwBall() {
    if (phase === 'roll' || phase === 'settle') return;
    reveal.hidden = true;
    pins = makePins();
    ballZ = 0.08;
    phase = 'roll';
    roll.start = performance.now();
    roll.ms = reduced ? 0 : 1500;
    throwBtn.disabled = true;
    hint.textContent = 'La boule file.';
    if (reduced) {
      ballZ = 0.86;
      finishRoll();
    }
  }

  function frame(now) {
    const dt = Math.min(32, now - last || 16);
    last = now;
    if (phase === 'roll') {
      const t = roll.ms === 0 ? 1 : Math.min(1, (now - roll.start) / roll.ms);
      ballZ = 0.08 + (0.86 - 0.08) * t * t;
      if (t >= 1) finishRoll();
    }
    if (phase === 'settle' || phase === 'done') {
      pins.forEach((pin) => {
        if (!pin.hit) return;
        pin.ox += pin.vx;
        pin.oy += pin.vy;
        pin.vy += 0.18 * (dt / 16);
        pin.rot += pin.vr;
      });
    }
    if (shake > 0) shake *= 0.86;
    draw();
    requestAnimationFrame(frame);
  }

  function aimFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    aim = Math.max(-1, Math.min(1, (x - 0.5) / 0.34));
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (phase === 'roll' || phase === 'settle') return;
    pointerId = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    aimFromEvent(event);
    if (phase === 'done') reveal.hidden = true;
    phase = 'aim';
    hint.textContent = 'Lâche pour lancer.';
  });
  canvas.addEventListener('pointermove', (event) => {
    if (pointerId !== event.pointerId || phase !== 'aim') return;
    aimFromEvent(event);
  });
  function release(event) {
    if (pointerId !== event.pointerId) return;
    pointerId = null;
    if (phase === 'aim') throwBall();
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  throwBtn.addEventListener('click', throwBall);
  again.addEventListener('click', () => {
    reveal.hidden = true;
    pins = makePins();
    ballZ = 0.08;
    aim = 0;
    phase = 'ready';
    hint.textContent = 'Glisse sur la piste pour viser, puis lâche ou appuie sur Lancer.';
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') aim = Math.max(-1, aim - 0.08);
    if (event.key === 'ArrowRight') aim = Math.min(1, aim + 0.08);
    if (event.key === ' ' || event.key === 'Enter') {
      if (document.activeElement === again) return;
      event.preventDefault();
      throwBall();
    }
  });
  window.addEventListener('resize', resize);

  fetch('/api/arcade/gift')
    .then((response) => response.json())
    .then((data) => {
      if (!data || !data.label) return;
      gift = { label: data.label, detail: data.detail || '' };
      document.getElementById('live-gift').textContent = gift.label;
    })
    .catch(() => {});

  resize();
  requestAnimationFrame(frame);
})();
