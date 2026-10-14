(function () {
  const gate = document.getElementById('gate');
  const editor = document.getElementById('editor');
  const gateNote = document.getElementById('gate-note');
  const saveNote = document.getElementById('save-note');

  function openEditor(gift) {
    gate.hidden = true;
    editor.hidden = false;
    document.getElementById('label').value = gift.label || '';
    document.getElementById('detail').value = gift.detail || '';
  }

  fetch('/api/arcade/desk')
    .then((response) => (response.ok ? response.json() : null))
    .then((gift) => { if (gift) openEditor(gift); })
    .catch(() => {});

  gate.addEventListener('submit', async (event) => {
    event.preventDefault();
    gateNote.textContent = '';
    gateNote.classList.remove('bad');
    const response = await fetch('/api/arcade/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: document.getElementById('code').value }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      gateNote.textContent = data.error || 'Code refusé';
      gateNote.classList.add('bad');
      return;
    }
    openEditor(data);
  });

  editor.addEventListener('submit', async (event) => {
    event.preventDefault();
    saveNote.textContent = '';
    saveNote.classList.remove('bad');
    const response = await fetch('/api/arcade/gift', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: document.getElementById('label').value,
        detail: document.getElementById('detail').value,
        nextCode: document.getElementById('next-code').value,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      saveNote.textContent = data.error || 'Enregistrement impossible';
      saveNote.classList.add('bad');
      return;
    }
    document.getElementById('next-code').value = '';
    saveNote.textContent = 'Le cadeau est en jeu.';
  });
})();
