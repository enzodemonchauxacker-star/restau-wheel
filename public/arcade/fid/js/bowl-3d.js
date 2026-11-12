/**
 * Bowling Reikon — piste en perspective (canvas), palette crème / lime / encre.
 * Branche sur #bowl-canvas, #bowl-throw, #bowl-score et émet arcade-round.
 */
(function () {
  function arcadeRound(phase) {
    window.dispatchEvent(new CustomEvent('arcade-round', { detail: { phase } }));
  }

  const canvas = document.getElementById('bowl-canvas');
  const throwBtn = document.getElementById('bowl-throw');
  const bowlScore = document.getElementById('bowl-score');
  if (!canvas || !throwBtn || !bowlScore) return;

  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let w = 560;
  let h = 260;
  let aim = 0;
  let phase = 'aim';
  let ballZ = 0.06;
  let rollStart = 0;
  let rollMs = 1100;
  let shake = 0;
  let pins = makePins();
  let last = 0;
  let sway = 0;
  let swayDir = 1;

  function makePins() {
    const layout = [
      [0, 0],
      [-1, 1], [1, 1],
      [-2, 2], [0, 2], [2, 2],
      [-3, 3], [-1, 3], [1, 3], [3, 3],
    ];
    return layout.map(([col, row]) => ({
      x: col * 0.13,
      z: 0.72 + row * 0.045,
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
    const depth = 1 - z * 0.78;
    const y = h * 0.92 + (h * 0.12 - h * 0.92) * z;
    return { x: w / 2 + x * w * 0.42 * depth, y, s: depth };
  }

  function drawLane() {
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake * 0.4);

    // room cream
    ctx.fillStyle = '#fff8f1';
    ctx.fillRect(0, 0, w, h);

    // backboard
    const topL = project(-1.15, 1);
    const topR = project(1.15, 1);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(topL.x, 8, topR.x - topL.x, h * 0.18);
    ctx.strokeStyle = '#e8e2d9';
    ctx.strokeRect(topL.x + 0.5, 8.5, topR.x - topL.x - 1, h * 0.18 - 1);
    ctx.fillStyle = '#1e1e1e';
    ctx.font = `600 ${Math.max(11, h * 0.055)}px "Inter Tight", "General Sans", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('BOWLING', w / 2, 8 + h * 0.11);

    // gutters
    const gNearL = project(-1.08, 0);
    const gFarL = project(-1.08, 1);
    const gNearR = project(1.08, 0);
    const gFarR = project(1.08, 1);
    const nearL = project(-1, 0);
    const farL = project(-1, 1);
    const nearR = project(1, 0);
    const farR = project(1, 1);
    ctx.fillStyle = '#2a2a2a';
    ctx.beginPath();
    ctx.moveTo(gNearL.x, gNearL.y);
    ctx.lineTo(gFarL.x, gFarL.y);
    ctx.lineTo(farL.x, farL.y);
    ctx.lineTo(nearL.x, nearL.y);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(nearR.x, nearR.y);
    ctx.lineTo(farR.x, farR.y);
    ctx.lineTo(gFarR.x, gFarR.y);
    ctx.lineTo(gNearR.x, gNearR.y);
    ctx.closePath();
    ctx.fill();

    // wood boards
    const boards = 18;
    for (let i = 0; i < boards; i += 1) {
      const z0 = i / boards;
      const z1 = (i + 1) / boards;
      const a = project(-1, z0);
      const b = project(1, z0);
      const c = project(1, z1);
      const d = project(-1, z1);
      ctx.fillStyle = i % 2 === 0 ? '#efe0c4' : '#e4d3b0';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.fill();
    }

    // plank lines
    ctx.strokeStyle = 'rgba(59,59,59,.12)';
    ctx.lineWidth = 1;
    for (let i = -3; i <= 3; i += 1) {
      if (i === 0) continue;
      const n = project(i * 0.22, 0);
      const f = project(i * 0.14, 1);
      ctx.beginPath();
      ctx.moveTo(n.x, n.y);
      ctx.lineTo(f.x, f.y);
      ctx.stroke();
    }

    // foul line
    const foulA = project(-1, 0.14);
    const foulB = project(1, 0.14);
    ctx.strokeStyle = 'rgba(59,59,59,.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(foulA.x, foulA.y);
    ctx.lineTo(foulB.x, foulB.y);
    ctx.stroke();

    // arrows
    ctx.fillStyle = 'rgba(59,59,59,.28)';
    for (let i = -2; i <= 2; i += 1) {
      const p = project(i * 0.12, 0.28);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 5 * p.s);
      ctx.lineTo(p.x + 4 * p.s, p.y + 3 * p.s);
      ctx.lineTo(p.x - 4 * p.s, p.y + 3 * p.s);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawPin(pin) {
    const p = project(pin.x, pin.z);
    const height = 62 * p.s;
    const width = 19 * p.s;
    ctx.save();
    ctx.translate(p.x + pin.ox, p.y + pin.oy);
    ctx.rotate(pin.rot);
    // shadow
    if (!pin.hit || Math.abs(pin.oy) < 8) {
      ctx.fillStyle = 'rgba(59,59,59,.14)';
      ctx.beginPath();
      ctx.ellipse(0, 2, width * 0.55, width * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // body cream
    ctx.fillStyle = '#fff8f1';
    ctx.strokeStyle = '#3b3b3b';
    ctx.lineWidth = Math.max(1, 1.2 * p.s);
    ctx.beginPath();
    ctx.moveTo(-width / 2, 0);
    ctx.quadraticCurveTo(-width / 2, -height * 0.46, -width * 0.28, -height * 0.74);
    ctx.quadraticCurveTo(0, -height, width * 0.28, -height * 0.74);
    ctx.quadraticCurveTo(width / 2, -height * 0.46, width / 2, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // ink bands
    ctx.strokeStyle = '#3b3b3b';
    ctx.lineWidth = Math.max(1.4, 2 * p.s);
    ctx.beginPath();
    ctx.moveTo(-width * 0.34, -height * 0.52);
    ctx.lineTo(width * 0.34, -height * 0.52);
    ctx.moveTo(-width * 0.32, -height * 0.44);
    ctx.lineTo(width * 0.32, -height * 0.44);
    ctx.stroke();
    // lime tip highlight
    ctx.fillStyle = 'rgba(232,255,149,.55)';
    ctx.beginPath();
    ctx.ellipse(-width * 0.08, -height * 0.82, width * 0.16, height * 0.06, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function ballX() {
    if (phase === 'roll' || phase === 'settle' || phase === 'rest') {
      const travel = Math.min(1, Math.max(0, (ballZ - 0.06) / 0.78));
      return aim * (0.22 + 0.78 * travel);
    }
    return aim;
  }

  function drawBall() {
    const p = project(ballX(), ballZ);
    const radius = 22 * p.s;
    ctx.fillStyle = 'rgba(30,30,30,.22)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + radius * 0.82, radius * 0.78, radius * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
    const shade = ctx.createRadialGradient(
      p.x - radius * 0.35, p.y - radius * 0.4, radius * 0.12,
      p.x, p.y, radius
    );
    shade.addColorStop(0, '#5a5a5a');
    shade.addColorStop(0.45, '#3b3b3b');
    shade.addColorStop(1, '#1e1e1e');
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();
    // lime specular
    ctx.fillStyle = '#e8ff95';
    ctx.beginPath();
    ctx.ellipse(p.x - radius * 0.32, p.y - radius * 0.38, radius * 0.28, radius * 0.18, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1e1e1e';
    [[-0.22, -0.05], [0.18, -0.12], [0.05, 0.22]].forEach(([hx, hy]) => {
      ctx.beginPath();
      ctx.arc(p.x + hx * radius, p.y + hy * radius, radius * 0.11, 0, Math.PI * 2);
      ctx.fill();
    });
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
      pin.vx = dir * (1.4 + Math.random() * 3.2);
      pin.vy = -(2.2 + Math.random() * 4);
      pin.vr = dir * (0.04 + Math.random() * 0.1);
    });
    shake = 7;
    return count;
  }

  function finishRoll() {
    const count = knockPins();
    phase = 'settle';
    window.setTimeout(() => {
      bowlScore.textContent = count === 0 ? 'Aucune quille' : count + (count > 1 ? ' quilles' : ' quille');
      throwBtn.disabled = false;
      throwBtn.textContent = 'Rejouer';
      throwBtn.dataset.mode = 'reset';
      phase = 'rest';
      arcadeRound('end');
    }, reduceMotion ? 0 : 720);
  }

  function throwBall() {
    if (phase === 'roll' || phase === 'settle') return;
    throwBtn.disabled = true;
    pins = makePins();
    ballZ = 0.06;
    phase = 'roll';
    rollStart = performance.now();
    rollMs = reduceMotion ? 0 : 1200;
    if (reduceMotion) {
      ballZ = 0.84;
      finishRoll();
    }
  }

  function reset() {
    pins = makePins();
    ballZ = 0.06;
    aim = reduceMotion ? 0 : sway * 0.02;
    phase = 'aim';
    bowlScore.textContent = 'Vise, puis lance.';
    throwBtn.textContent = 'Lancer';
    delete throwBtn.dataset.mode;
    arcadeRound('start');
  }

  throwBtn.addEventListener('click', () => {
    if (throwBtn.dataset.mode === 'reset') {
      reset();
      return;
    }
    if (phase !== 'aim') return;
    aim = reduceMotion ? 0 : Math.max(-1, Math.min(1, sway / 34));
    throwBall();
  });

  function frame(now) {
    const dt = Math.min(32, now - last || 16);
    last = now;
    if (phase === 'aim' && !reduceMotion) {
      sway += swayDir * 0.7;
      if (sway > 34) { sway = 34; swayDir = -1; }
      if (sway < -34) { sway = -34; swayDir = 1; }
      aim = sway / 34;
    }
    if (phase === 'roll') {
      const t = rollMs === 0 ? 1 : Math.min(1, (now - rollStart) / rollMs);
      const e = t * t;
      ballZ = 0.06 + (0.84 - 0.06) * e;
      if (t >= 1) finishRoll();
    }
    if (phase === 'settle' || phase === 'rest') {
      pins.forEach((pin) => {
        if (!pin.hit) return;
        pin.ox += pin.vx * (dt / 16);
        pin.oy += pin.vy * (dt / 16);
        pin.vy += 0.18 * (dt / 16);
        pin.rot += pin.vr * (dt / 16);
      });
    }
    if (shake > 0) shake *= 0.86;
    draw();
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(frame);
})();
