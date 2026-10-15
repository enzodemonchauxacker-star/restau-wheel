(function () {
  const pinMarkup = '<svg viewBox="0 0 20 40" aria-hidden="true"><path fill="#fff" d="M10 1c4 0 6 4 6 8 0 3-1 5-2 7 2 4 5 8 5 14 0 5-3 8-9 8S1 35 1 30c0-6 3-10 5-14-1-2-2-4-2-7C4 5 6 1 10 1z"/><path d="M5 13h10M4.6 16.2h10.8" stroke="#e23d4a" stroke-width="1.5" stroke-linecap="round"/></svg>';
  const sackMarkup = '<svg class="sack" viewBox="0 0 80 100" aria-hidden="true"><use href="#sack-glyph"/></svg>';
  const giftMarkup = '<svg class="mark mark-gift" viewBox="0 0 64 64" aria-hidden="true"><use href="#gift-glyph"/></svg>';
  const boneMarkup = '<svg class="mark mark-bone" viewBox="0 0 72 36" aria-hidden="true"><use href="#bone-glyph"/></svg>';

  const lane = document.getElementById('bowl-lane');
  const rack = document.getElementById('bowl-pins');
  const ball = document.getElementById('bowl-ball');
  const throwBtn = document.getElementById('bowl-throw');
  const bowlScore = document.getElementById('bowl-score');
  const formation = [
    [0.16, 0], [0.38, 0], [0.62, 0], [0.84, 0],
    [0.27, 1], [0.50, 1], [0.73, 1],
    [0.38, 2], [0.62, 2],
    [0.50, 3],
  ];

  function buildPins() {
    rack.innerHTML = formation.map(([x, row]) => {
      const pin = document.createElement('span');
      pin.className = 'bowl-pin';
      pin.dataset.row = String(row);
      pin.style.left = (x * 100) + '%';
      pin.style.top = (row * 18) + '%';
      pin.innerHTML = pinMarkup;
      return pin.outerHTML;
    }).join('');
  }

  function armBall() {
    ball.style.transition = 'none';
    ball.style.bottom = '';
    ball.style.left = '';
    ball.style.transform = '';
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
    ball.style.bottom = '7%';
    requestAnimationFrame(() => {
      ball.style.transition = 'bottom .48s cubic-bezier(.25,.7,.2,1), transform .48s ease';
      ball.style.bottom = '46%';
      ball.style.transform = 'scale(.62)';
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
        const reach = 7 + (3 - row) * 4;
        if (Math.abs(center - impact) < reach) {
          pin.classList.add('is-down');
          down += 1;
        }
      });
      bowlScore.textContent = down + (down > 1 ? ' quilles' : ' quille');
      throwBtn.disabled = false;
      throwBtn.textContent = 'Rejouer';
      throwBtn.dataset.mode = 'reset';
    }, 500);
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
    const others = [...lootGrid.querySelectorAll('.loot')].filter((other) => other !== button);
    others.forEach((other, index) => {
      window.setTimeout(() => reveal(other), 220 + index * 80);
    });
  }

  lootReset.addEventListener('click', paintLoots);
  paintLoots();
})();
