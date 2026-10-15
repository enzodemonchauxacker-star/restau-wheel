(function () {
  function arcadeRound(phase) {
    window.dispatchEvent(new CustomEvent('arcade-round', { detail: { phase } }));
  }
  const sackMarkup = '<svg class="sack" viewBox="0 0 80 100" aria-hidden="true"><use href="#sack-glyph"/></svg>';
  const giftMarkup = '<svg class="mark mark-gift" viewBox="0 0 64 64" aria-hidden="true"><use href="#gift-glyph"/></svg>';
  const boneMarkup = '<svg class="mark mark-bone" viewBox="0 0 72 36" aria-hidden="true"><use href="#bone-glyph"/></svg>';

  const lane = document.getElementById('bowl-lane');
  const rack = document.getElementById('bowl-pins');
  const ball = document.getElementById('bowl-ball');
  const wrap = document.getElementById('bowl-ball-wrap');
  const throwBtn = document.getElementById('bowl-throw');
  const bowlScore = document.getElementById('bowl-score');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (throwBtn && wrap && rack && ball) {
  let sway = 0;
  let swayDir = 1;
  let phase = 'aim';
  let roll = null;

  function placeBall(x, y, s) {
    wrap.setAttribute('transform', 'translate(' + x.toFixed(2) + ' ' + y.toFixed(2) + ') scale(' + s.toFixed(3) + ')');
  }

  function standPin(pin) {
    pin.classList.remove('is-down');
    pin.setAttribute('opacity', '1');
    pin.setAttribute('transform', 'translate(' + pin.dataset.x + ' ' + pin.dataset.y + ') scale(' + pin.dataset.s + ')');
  }

  function resetPins() {
    rack.querySelectorAll('.bowl-pin').forEach(standPin);
  }

  function knockPin(pin, angle) {
    pin.classList.add('is-down');
    pin.setAttribute('opacity', '0.22');
    pin.setAttribute('transform', 'translate(' + pin.dataset.x + ' ' + pin.dataset.y + ') rotate(' + angle + ') scale(' + pin.dataset.s + ')');
  }

  function finishRoll() {
    const ballBox = ball.getBoundingClientRect();
    const bx = ballBox.left + ballBox.width / 2;
    let down = 0;
    rack.querySelectorAll('.bowl-pin').forEach((pin) => {
      const box = pin.getBoundingClientRect();
      const cx = box.left + box.width / 2;
      const row = Number(pin.dataset.row);
      const reach = ballBox.width * 0.62 + box.width * (0.35 + (3 - row) * 0.12);
      if (Math.abs(cx - bx) < reach) {
        const angle = cx < bx ? -78 : 78;
        window.setTimeout(() => knockPin(pin, angle), row * 45);
        down += 1;
      }
    });
    bowlScore.textContent = down === 0 ? 'Aucune quille' : down + (down > 1 ? ' quilles' : ' quille');
    throwBtn.disabled = false;
    throwBtn.textContent = 'Rejouer';
    throwBtn.dataset.mode = 'reset';
    phase = 'rest';
    arcadeRound('end');
  }

  function tick(now) {
    if (phase === 'aim' && !reduceMotion) {
      sway += swayDir * 0.72;
      if (sway > 34) { sway = 34; swayDir = -1; }
      if (sway < -34) { sway = -34; swayDir = 1; }
      placeBall(sway, 0, 1);
    } else if (phase === 'roll' && roll) {
      const t = Math.min(1, (now - roll.t0) / 520);
      const e = 1 - Math.pow(1 - t, 3);
      placeBall(roll.x0 + (roll.x1 - roll.x0) * e, -102 * e, 1 - 0.55 * e);
      if (t >= 1) finishRoll();
    }
    window.requestAnimationFrame(tick);
  }
  window.requestAnimationFrame(tick);

  throwBtn.addEventListener('click', () => {
    if (throwBtn.dataset.mode === 'reset') {
      resetPins();
      phase = 'aim';
      placeBall(reduceMotion ? 0 : sway, 0, 1);
      bowlScore.textContent = 'Vise, puis lance.';
      throwBtn.textContent = 'Lancer';
      delete throwBtn.dataset.mode;
      arcadeRound('start');
      return;
    }
    if (phase !== 'aim') return;
    throwBtn.disabled = true;
    roll = { t0: performance.now(), x0: sway, x1: sway * 0.34 };
    phase = 'roll';
  });
  }

  const arena = document.getElementById('laser-arena');
  const laserBtn = document.getElementById('laser-start');
  const laserScore = document.getElementById('laser-score');
  let laserTimer = 0;
  let laserSpawn = 0;
  let laserPoints = 0;
  let laserLeft = 0;

  if (arena && laserBtn && laserScore) {
  function clearLaser() {
    window.clearInterval(laserTimer);
    window.clearInterval(laserSpawn);
    laserTimer = 0;
    laserSpawn = 0;
    arena.querySelectorAll('.target, .beam').forEach((node) => node.remove());
  }

  function flash(event) {
    const box = arena.getBoundingClientRect();
    const x = event.clientX - box.left;
    const y = event.clientY - box.top;
    const beam = document.createElement('i');
    beam.className = 'beam';
    const originX = box.width / 2;
    const originY = box.height - 4;
    beam.style.left = originX + 'px';
    beam.style.top = originY + 'px';
    beam.style.width = Math.hypot(x - originX, y - originY) + 'px';
    beam.style.transform = 'rotate(' + (Math.atan2(y - originY, x - originX) * 180 / Math.PI) + 'deg)';
    arena.appendChild(beam);
    window.setTimeout(() => beam.remove(), 140);
  }

  function spawnTarget() {
    const target = document.createElement('button');
    target.type = 'button';
    target.className = 'target';
    target.setAttribute('aria-label', 'Cible');
    target.style.left = (12 + Math.random() * 76) + '%';
    target.style.top = (16 + Math.random() * 68) + '%';
    target.addEventListener('click', (event) => {
      event.stopPropagation();
      if (!laserTimer) return;
      laserPoints += 1;
      laserScore.textContent = laserPoints + (laserPoints > 1 ? ' cibles' : ' cible');
      flash(event);
      target.remove();
    });
    arena.appendChild(target);
    window.setTimeout(() => target.remove(), 1300);
  }

  laserBtn.addEventListener('click', () => {
    arcadeRound('start');
    clearLaser();
    laserPoints = 0;
    laserLeft = 12;
    laserScore.textContent = '12 s';
    laserBtn.disabled = true;
    spawnTarget();
    laserSpawn = window.setInterval(spawnTarget, 680);
    laserTimer = window.setInterval(() => {
      laserLeft -= 1;
      if (laserLeft <= 0) {
        clearLaser();
        laserScore.textContent = laserPoints + (laserPoints > 1 ? ' cibles' : ' cible');
        laserBtn.disabled = false;
        laserBtn.textContent = 'Rejouer';
        arcadeRound('end');
        return;
      }
      laserScore.textContent = laserLeft + ' s · ' + laserPoints;
    }, 1000);
  });
  }

  const claw = document.getElementById('claw');
  const gift = document.getElementById('claw-gift');
  const clawBtn = document.getElementById('claw-go');
  const clawMsg = document.getElementById('claw-msg');
  let clawBusy = false;

  if (claw && gift && clawBtn && clawMsg) {
  function releaseClaw() {
    const cable = claw.querySelector('.cable');
    claw.classList.remove('is-open', 'is-shut');
    cable.style.height = '';
    cable.style.transition = '';
    claw.style.animation = '';
    claw.style.left = '';
    gift.classList.remove('is-caught');
    gift.style.transition = 'none';
    gift.style.transform = '';
    clawBusy = false;
    clawBtn.disabled = false;
    clawBtn.textContent = 'Attraper';
    delete clawBtn.dataset.mode;
    clawMsg.textContent = 'Attrape le cadeau.';
  }

  clawBtn.addEventListener('click', () => {
    if (clawBtn.dataset.mode === 'reset') {
      releaseClaw();
      arcadeRound('start');
      return;
    }
    if (clawBusy) return;
    clawBusy = true;
    clawBtn.disabled = true;
    const cable = claw.querySelector('.cable');
    const left = getComputedStyle(claw).left;
    const clawBox = claw.getBoundingClientRect();
    const giftBox = gift.getBoundingClientRect();
    const clawMid = (clawBox.left + clawBox.right) / 2;
    const giftMid = (giftBox.left + giftBox.right) / 2;
    const hit = Math.abs(clawMid - giftMid) < 28;
    const extra = Math.max(48, giftBox.top + giftBox.height * 0.28 - clawBox.bottom);
    const rest = 28;
    claw.style.animation = 'none';
    claw.style.left = left;
    claw.classList.add('is-open');
    cable.style.transition = 'height .56s cubic-bezier(.55,.05,.85,.4)';
    window.requestAnimationFrame(() => {
      cable.style.height = (rest + extra) + 'px';
    });
    window.setTimeout(() => {
      claw.classList.remove('is-open');
      claw.classList.add('is-shut');
      window.setTimeout(() => {
        cable.style.transition = 'height .62s cubic-bezier(.16,.8,.28,1)';
        cable.style.height = rest + 'px';
        if (hit) {
          gift.classList.add('is-caught');
          gift.style.transition = 'transform .62s cubic-bezier(.16,.8,.28,1)';
          gift.style.transform = 'translateY(' + (-extra) + 'px)';
          clawMsg.textContent = 'Cadeau attrapé.';
          clawBtn.disabled = false;
          clawBtn.textContent = 'Rejouer';
          clawBtn.dataset.mode = 'reset';
          arcadeRound('end');
          return;
        }
        clawMsg.textContent = 'À côté.';
        arcadeRound('end');
        window.setTimeout(() => {
          claw.classList.remove('is-shut');
          window.setTimeout(() => {
            cable.style.height = '';
            cable.style.transition = '';
            claw.style.animation = '';
            claw.style.left = '';
            clawBusy = false;
            clawBtn.disabled = false;
            clawMsg.textContent = 'Attrape le cadeau.';
          }, 280);
        }, 640);
      }, 240);
    }, 560);
  });
  }

  const lootGrid = document.getElementById('loot-grid');
  const lootMsg = document.getElementById('loot-msg');
  const lootReset = document.getElementById('loot-reset');
  let lootLock = false;

  if (lootGrid && lootMsg && lootReset) {
  function paintLoots() {
    lootLock = false;
    arcadeRound('start');
    lootMsg.textContent = 'Un cadeau, neuf os.';
    lootReset.textContent = 'Mélanger';
    const giftAt = Math.floor(Math.random() * 10);
    lootGrid.innerHTML = '';
    for (let index = 0; index < 10; index += 1) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'loot';
      button.dataset.kind = index === giftAt ? 'gift' : 'bone';
      button.innerHTML = sackMarkup;
      button.setAttribute('aria-label', 'Butin ' + (index + 1));
      button.addEventListener('click', () => openLoot(button));
      lootGrid.appendChild(button);
    }
  }

  function reveal(button) {
    if (button.classList.contains('is-open')) return;
    button.disabled = true;
    button.classList.add('is-boom', 'is-open', button.dataset.kind === 'gift' ? 'is-gift' : 'is-bone');
    const burst = document.createElement('span');
    burst.className = 'burst';
    burst.innerHTML = '<i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>';
    button.appendChild(burst);
    button.insertAdjacentHTML('beforeend', button.dataset.kind === 'gift' ? giftMarkup : boneMarkup);
    button.setAttribute('aria-label', button.dataset.kind === 'gift' ? 'Cadeau' : 'Os');
  }

  function openLoot(button) {
    if (lootLock || button.classList.contains('is-open')) return;
    lootLock = true;
    reveal(button);
    lootMsg.textContent = button.dataset.kind === 'gift' ? 'Le cadeau.' : 'Un os.';
    lootReset.textContent = 'Rejouer';
    arcadeRound('end');
    const others = [...lootGrid.querySelectorAll('.loot')].filter((other) => other !== button);
    others.forEach((other, index) => {
      window.setTimeout(() => reveal(other), 220 + index * 80);
    });
  }

  lootReset.addEventListener('click', paintLoots);
  paintLoots();
  }
})();
