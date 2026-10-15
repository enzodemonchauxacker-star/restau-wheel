(function () {
  const pinMarkup = '<svg viewBox="0 0 160 340" aria-hidden="true"><use href="#pin-glyph"/></svg>';
  const sackMarkup = '<svg class="sack" viewBox="0 0 80 100" aria-hidden="true"><use href="#sack-glyph"/></svg>';
  const dollarMarkup = '<svg class="mark mark-dollar" viewBox="0 0 32 44" aria-hidden="true"><use href="#dollar-glyph"/></svg>';
  const bombMarkup = '<svg class="mark mark-bomb" viewBox="0 0 48 48" aria-hidden="true"><use href="#bomb-glyph"/></svg>';

  const lane = document.getElementById('bowl-lane');
  const rack = document.getElementById('bowl-pins');
  const ball = document.getElementById('bowl-ball');
  const throwBtn = document.getElementById('bowl-throw');
  const bowlScore = document.getElementById('bowl-score');
  const formation = [
    [0.12, 0], [0.37, 0], [0.63, 0], [0.88, 0],
    [0.24, 1], [0.50, 1], [0.76, 1],
    [0.37, 2], [0.63, 2],
    [0.50, 3],
  ];

  function buildPins() {
    rack.innerHTML = formation.map(([x, row]) => {
      const pin = document.createElement('span');
      pin.className = 'bowl-pin';
      pin.dataset.row = String(row);
      pin.style.left = (x * 100) + '%';
      pin.style.top = (row * 16) + 'px';
      pin.innerHTML = pinMarkup;
      return pin.outerHTML;
    }).join('');
  }

  function armBall() {
    ball.style.transition = 'none';
    ball.style.bottom = '';
    ball.style.left = '';
    ball.style.animation = '';
  }

  let bowling = false;
  buildPins();
  throwBtn.addEventListener('click', () => {
    if (throwBtn.dataset.mode === 'reset') {
      buildPins();
      armBall();
      bowlScore.textContent = 'Vise, puis lance.';
      throwBtn.textContent = 'Lancer';
      delete throwBtn.dataset.mode;
      bowling = false;
      return;
    }
    if (bowling) return;
    bowling = true;
    throwBtn.disabled = true;
    const laneBox = lane.getBoundingClientRect();
    const ballBox = ball.getBoundingClientRect();
    const left = ballBox.left - laneBox.left;
    ball.style.animation = 'none';
    ball.style.left = left + 'px';
    ball.style.bottom = '8px';
    requestAnimationFrame(() => {
      ball.style.transition = 'bottom .42s cubic-bezier(.25,.7,.2,1)';
      ball.style.bottom = (lane.clientHeight - 46) + 'px';
    });
    window.setTimeout(() => {
      const freshLane = lane.getBoundingClientRect();
      const freshBall = ball.getBoundingClientRect();
      const impact = freshBall.left + freshBall.width / 2 - freshLane.left;
      let down = 0;
      rack.querySelectorAll('.bowl-pin').forEach((pin) => {
        const row = Number(pin.dataset.row);
        const box = pin.getBoundingClientRect();
        const center = box.left + box.width / 2 - freshLane.left;
        const reach = 20 + (3 - row) * 12;
        if (Math.abs(center - impact) < reach) {
          pin.classList.add('is-down');
          down += 1;
        }
      });
      bowlScore.textContent = down + (down > 1 ? ' quilles' : ' quille');
      throwBtn.disabled = false;
      throwBtn.textContent = 'Rejouer';
      throwBtn.dataset.mode = 'reset';
    }, 460);
  });

  const arena = document.getElementById('laser-arena');
  const laserBtn = document.getElementById('laser-start');
  const laserScore = document.getElementById('laser-score');
  let laserTimer = 0;
  let laserSpawn = 0;
  let laserPoints = 0;
  let laserLeft = 0;

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
        return;
      }
      laserScore.textContent = laserLeft + ' s · ' + laserPoints;
    }, 1000);
  });

  const claw = document.getElementById('claw');
  const gift = document.getElementById('claw-gift');
  const clawBtn = document.getElementById('claw-go');
  const clawMsg = document.getElementById('claw-msg');
  let clawBusy = false;

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
          return;
        }
        clawMsg.textContent = 'À côté.';
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

  const lootGrid = document.getElementById('loot-grid');
  const lootMsg = document.getElementById('loot-msg');
  const lootReset = document.getElementById('loot-reset');
  let lootLock = false;

  function paintLoots() {
    lootLock = false;
    lootMsg.textContent = 'Un cadeau, neuf bombes.';
    lootReset.textContent = 'Mélanger';
    const giftAt = Math.floor(Math.random() * 10);
    lootGrid.innerHTML = '';
    for (let index = 0; index < 10; index += 1) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'loot';
      button.dataset.kind = index === giftAt ? 'gift' : 'bomb';
      button.innerHTML = sackMarkup;
      button.setAttribute('aria-label', 'Butin ' + (index + 1));
      button.addEventListener('click', () => openLoot(button));
      lootGrid.appendChild(button);
    }
  }

  function reveal(button) {
    button.disabled = true;
    button.classList.add('is-open', button.dataset.kind === 'gift' ? 'is-gift' : 'is-bomb');
    if (!button.querySelector('.mark')) {
      button.insertAdjacentHTML('beforeend', button.dataset.kind === 'gift' ? dollarMarkup : bombMarkup);
    }
    button.setAttribute('aria-label', button.dataset.kind === 'gift' ? 'Cadeau' : 'Bombe');
  }

  function openLoot(button) {
    if (lootLock || button.classList.contains('is-open')) return;
    lootLock = true;
    reveal(button);
    lootMsg.textContent = button.dataset.kind === 'gift' ? 'Le cadeau.' : 'Une bombe.';
    lootReset.textContent = 'Rejouer';
    window.setTimeout(() => {
      lootGrid.querySelectorAll('.loot').forEach(reveal);
    }, 420);
  }

  lootReset.addEventListener('click', paintLoots);
  paintLoots();
})();
