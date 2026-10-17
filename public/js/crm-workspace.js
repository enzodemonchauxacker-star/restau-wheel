/* CRM Restau Wheel : personnes, pipeline, fiche. */
(function (global) {
  const STAGES = ['new', 'once', 'regular', 'pending', 'dormant'];
  let view = 'overview';
  let people = [];
  let file = null;
  let creating = false;
  let notice = '';
  let dragging = false;

  const t = (key, vars) => (global.RW_I18N ? global.RW_I18N.t(key, vars) : key);
  const loc = () => (global.RW_I18N ? global.RW_I18N.locale() : 'fr-FR');

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function qs(id) {
    return document.getElementById(id);
  }

  function restaurants() {
    return (global.crmRestaurants && global.crmRestaurants()) || [];
  }

  function stageLabel(key) {
    return t('sa.crm.seg.' + key);
  }

  function when(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString(loc());
  }

  function scopeParams() {
    const params = new URLSearchParams();
    const rid = qs('crm-resto')?.value || '';
    const q = qs('crm-q')?.value.trim() || '';
    if (rid) params.set('restaurant_id', rid);
    if (q.length >= 2) params.set('q', q);
    const text = params.toString();
    return text ? `?${text}` : '';
  }

  function showView(name) {
    view = STAGES.concat(['overview', 'people', 'board']).includes(name) ? name : 'overview';
    if (!['overview', 'people', 'board'].includes(view)) view = 'overview';
    document.querySelectorAll('[data-crm-view]').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-crm-view') === view);
    });
    const overview = qs('crm-view-overview');
    const peopleView = qs('crm-view-people');
    const board = qs('crm-view-board');
    if (overview) overview.style.display = view === 'overview' ? 'block' : 'none';
    if (peopleView) peopleView.style.display = view === 'people' ? 'block' : 'none';
    if (board) board.style.display = view === 'board' ? 'block' : 'none';
    const search = qs('crm-q');
    if (search) search.style.display = view === 'overview' ? 'none' : '';
    if (view !== 'overview') reload();
  }

  function renderPeople() {
    const body = qs('crm-people-body');
    if (!body) return;
    if (!people.length) {
      body.innerHTML = `<tr><td colspan="7" class="muted">${esc(t('sa.crm.empty'))}</td></tr>`;
      return;
    }
    const rid = qs('crm-resto')?.value;
    body.innerHTML = people.map((person) => `
      <tr class="crm-open" data-person="${esc(person.id)}">
        <td><strong>${esc(person.name || '—')}</strong></td>
        <td>${esc(person.email || '—')}</td>
        <td>${esc(person.phone || '—')}</td>
        <td>${rid ? '' : esc(person.restaurant_name || '—')}</td>
        <td><span class="chip ${esc(person.stage)}">${esc(stageLabel(person.stage))}</span></td>
        <td>${person.note_count || 0}</td>
        <td>${person.open_tasks || 0}</td>
      </tr>
    `).join('');
  }

  function renderBoard() {
    const board = qs('crm-board');
    if (!board) return;
    const columns = STAGES.map((key) => ({
      key,
      people: people.filter((person) => person.stage === key),
    }));
    board.innerHTML = columns.map((column) => `
      <section class="crm-col" data-stage="${esc(column.key)}">
        <h3><span>${esc(stageLabel(column.key))}</span><span>${column.people.length}</span></h3>
        ${column.people.map((person) => `
          <article class="crm-card" draggable="true" data-person="${esc(person.id)}">
            <strong>${esc(person.name || '—')}</strong>
            <div class="meta">${esc(person.restaurant_name || person.email || '')}</div>
            <div class="meta">${esc(t('sa.crm.person', { n: person.spin_count || 0, date: when(person.last_spin_at) }))}</div>
          </article>
        `).join('') || `<p class="muted">${esc(t('sa.crm.board.empty'))}</p>`}
      </section>
    `).join('');
  }

  function restaurantOptions(selected) {
    return restaurants().map((restaurant) => `
      <option value="${esc(restaurant.id)}"${String(restaurant.id) === String(selected) ? ' selected' : ''}>${esc(restaurant.name)}</option>
    `).join('');
  }

  function stageOptions(person) {
    const selected = person && person.stage_manual ? person.stage : 'auto';
    const auto = `<option value="auto"${selected === 'auto' ? ' selected' : ''}>${esc(t('sa.crm.stage.auto'))}</option>`;
    const rest = STAGES.map((key) => `
      <option value="${key}"${selected === key ? ' selected' : ''}>${esc(stageLabel(key))}</option>
    `).join('');
    return auto + rest;
  }

  function renderDrawer() {
    const drawer = qs('crm-drawer');
    const backdrop = qs('crm-backdrop');
    if (!drawer || !backdrop) return;
    const open = creating || !!file;
    drawer.hidden = !open;
    backdrop.hidden = !open;
    if (!open) {
      drawer.innerHTML = '';
      return;
    }
    const person = file?.person || {};
    const notes = file?.notes || [];
    const tasks = file?.tasks || [];
    const spins = file?.spins || [];
    drawer.innerHTML = `
      <div class="crm-row" style="justify-content:space-between;margin-bottom:8px">
        <button type="button" class="action-btn" data-crm-close>${esc(t('sa.crm.close'))}</button>
        <button type="button" class="action-btn" data-crm-save>${esc(t('sa.crm.save'))}</button>
      </div>
      <h2>${esc(creating ? t('sa.crm.new') : (person.name || '—'))}</h2>
      <p class="crm-file-error" id="crm-f-error">${esc(notice)}</p>
      <div class="field">
        <label>${esc(t('sa.crm.first'))}</label>
        <input id="crm-f-first" value="${esc(person.first_name || '')}">
      </div>
      <div class="field">
        <label>${esc(t('sa.crm.last'))}</label>
        <input id="crm-f-last" value="${esc(person.last_name || '')}">
      </div>
      <div class="field">
        <label>${esc(t('sa.crm.email'))}</label>
        <input id="crm-f-email" type="email" value="${esc(person.email || '')}">
      </div>
      <div class="field">
        <label>${esc(t('sa.crm.phone'))}</label>
        <input id="crm-f-phone" value="${esc(person.phone || '')}">
      </div>
      <div class="field">
        <label>${esc(t('sa.crm.company'))}</label>
        <select id="crm-f-resto">${restaurantOptions(person.restaurant_id || qs('crm-resto')?.value)}</select>
      </div>
      <div class="field">
        <label>${esc(t('sa.crm.stage'))}</label>
        <select id="crm-f-stage">${stageOptions(person)}</select>
      </div>
      ${creating ? '' : `
        <div class="crm-section">
          <div class="section-title">${esc(t('sa.crm.notes'))}</div>
          <textarea id="crm-f-note" rows="3" placeholder="${esc(t('sa.crm.note.ph'))}"></textarea>
          <button type="button" class="action-btn" data-crm-note-add style="margin-top:8px">${esc(t('sa.crm.note.add'))}</button>
          ${notes.map((note) => `
            <div class="crm-note-item">
              <div>${esc(note.body)}</div>
              <div class="meta">${esc(when(note.created_at))} · <button type="button" class="action-btn danger" data-note-del="${esc(note.id)}">${esc(t('sa.crm.delete'))}</button></div>
            </div>
          `).join('') || `<p class="muted">${esc(t('sa.crm.note.empty'))}</p>`}
        </div>
        <div class="crm-section">
          <div class="section-title">${esc(t('sa.crm.tasks'))}</div>
          <div class="crm-row">
            <input id="crm-f-task" placeholder="${esc(t('sa.crm.task.ph'))}">
            <button type="button" class="action-btn" data-crm-task-add>${esc(t('sa.crm.task.add'))}</button>
          </div>
          ${tasks.map((task) => `
            <div class="crm-task-item${task.done ? ' done' : ''}">
              <label class="crm-row">
                <input type="checkbox" data-task-done="${esc(task.id)}"${task.done ? ' checked' : ''}>
                <span>${esc(task.title)}</span>
              </label>
              <button type="button" class="action-btn danger" data-task-del="${esc(task.id)}">${esc(t('sa.crm.delete'))}</button>
            </div>
          `).join('') || `<p class="muted">${esc(t('sa.crm.task.empty'))}</p>`}
        </div>
        <div class="crm-section">
          <div class="section-title">${esc(t('sa.crm.activity'))}</div>
          ${spins.map((spin) => `
            <div class="crm-spin-item">
              <strong>${esc(spin.prize || t('sa.crm.activity.lost'))}</strong>
              <div class="meta">${esc(when(spin.won_at))} · ${esc(spin.used ? t('sa.crm.activity.used') : (spin.prize ? t('sa.crm.activity.open') : t('sa.crm.activity.lost')))}</div>
            </div>
          `).join('') || `<p class="muted">${esc(t('sa.crm.activity.empty'))}</p>`}
        </div>
      `}
    `;
  }

  function render() {
    renderPeople();
    renderBoard();
    if (creating || file) renderDrawer();
    const status = qs('crm-status');
    if (status && view !== 'overview' && notice && !file && !creating) status.textContent = notice;
  }

  async function readError(res) {
    const data = await res.json().catch(() => ({}));
    return data.error || t('sa.crm.err');
  }

  async function reload() {
    if (view === 'overview') return;
    const res = await fetch('/api/superadmin/crm/people' + scopeParams());
    const status = qs('crm-status');
    if (!res.ok) {
      if (status) status.textContent = await readError(res);
      return;
    }
    const data = await res.json();
    people = data.people || [];
    if (status) status.textContent = data.truncated ? t('sa.crm.limited') : '';
    renderPeople();
    renderBoard();
  }

  function formValue() {
    return {
      first_name: qs('crm-f-first')?.value || '',
      last_name: qs('crm-f-last')?.value || '',
      email: qs('crm-f-email')?.value || '',
      phone: qs('crm-f-phone')?.value || '',
      restaurant_id: qs('crm-f-resto')?.value || '',
      stage: qs('crm-f-stage')?.value || 'auto',
    };
  }

  function remember(next) {
    const person = next?.person;
    if (!person) return;
    const index = people.findIndex((row) => String(row.id) === String(person.id));
    if (index >= 0) people[index] = person;
    else people.unshift(person);
    if (file && String(file.person?.id) === String(person.id)) file = next;
  }

  function applyFile(next, message) {
    file = next;
    creating = false;
    notice = message || '';
    remember(next);
    renderPeople();
    renderBoard();
    renderDrawer();
  }

  async function open(id) {
    creating = false;
    notice = '';
    const res = await fetch('/api/superadmin/crm/people/' + encodeURIComponent(id));
    if (!res.ok) {
      const status = qs('crm-status');
      if (status) status.textContent = await readError(res);
      return;
    }
    file = await res.json();
    renderDrawer();
  }

  function openCreate() {
    file = null;
    creating = true;
    notice = '';
    renderDrawer();
  }

  function close() {
    file = null;
    creating = false;
    notice = '';
    renderDrawer();
  }

  async function save() {
    const payload = formValue();
    const creatingNow = creating || !file?.person?.id;
    const url = creatingNow
      ? '/api/superadmin/crm/people'
      : '/api/superadmin/crm/people/' + encodeURIComponent(file.person.id);
    const res = await fetch(url, {
      method: creatingNow ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      notice = await readError(res);
      const error = qs('crm-f-error');
      if (error) error.textContent = notice;
      return;
    }
    applyFile(await res.json(), t('sa.crm.saved'));
    if (view === 'overview' && global.loadCrm) global.loadCrm();
  }

  async function move(id, stage) {
    if (!id || !STAGES.includes(stage)) return;
    const current = people.find((person) => String(person.id) === String(id));
    if (current && current.stage === stage && current.stage_manual) return;
    const res = await fetch('/api/superadmin/crm/people/' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage }),
    });
    if (!res.ok) return;
    const next = await res.json();
    const keepOpen = file && String(file.person?.id) === String(id);
    remember(next);
    if (keepOpen) {
      notice = t('sa.crm.saved');
      renderDrawer();
    }
    renderPeople();
    renderBoard();
  }

  async function addNote() {
    if (!file?.person?.id) return;
    const body = qs('crm-f-note')?.value || '';
    const res = await fetch('/api/superadmin/crm/people/' + encodeURIComponent(file.person.id) + '/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });
    if (!res.ok) {
      notice = await readError(res);
      const error = qs('crm-f-error');
      if (error) error.textContent = notice;
      return;
    }
    applyFile(await res.json(), '');
  }

  async function deleteNote(id) {
    const res = await fetch('/api/superadmin/crm/notes/' + encodeURIComponent(id), { method: 'DELETE' });
    if (!res.ok) return;
    applyFile(await res.json(), '');
  }

  async function addTask() {
    if (!file?.person?.id) return;
    const title = qs('crm-f-task')?.value || '';
    const res = await fetch('/api/superadmin/crm/people/' + encodeURIComponent(file.person.id) + '/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) {
      notice = await readError(res);
      const error = qs('crm-f-error');
      if (error) error.textContent = notice;
      return;
    }
    applyFile(await res.json(), '');
  }

  async function toggleTask(id, done) {
    const res = await fetch('/api/superadmin/crm/tasks/' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done }),
    });
    if (!res.ok) return;
    applyFile(await res.json(), '');
  }

  async function deleteTask(id) {
    const res = await fetch('/api/superadmin/crm/tasks/' + encodeURIComponent(id), { method: 'DELETE' });
    if (!res.ok) return;
    applyFile(await res.json(), '');
  }

  function mount() {
    document.addEventListener('click', (event) => {
      const viewBtn = event.target.closest('[data-crm-view]');
      if (viewBtn) {
        showView(viewBtn.getAttribute('data-crm-view'));
        return;
      }
      if (event.target.closest('#crm-new')) {
        openCreate();
        return;
      }
      if (event.target.closest('[data-crm-close]') || event.target.closest('#crm-backdrop')) {
        close();
        return;
      }
      if (event.target.closest('[data-crm-save]')) {
        save();
        return;
      }
      if (event.target.closest('[data-crm-note-add]')) {
        addNote();
        return;
      }
      if (event.target.closest('[data-crm-task-add]')) {
        addTask();
        return;
      }
      const noteDel = event.target.closest('[data-note-del]');
      if (noteDel) {
        deleteNote(noteDel.getAttribute('data-note-del'));
        return;
      }
      const taskDel = event.target.closest('[data-task-del]');
      if (taskDel) {
        deleteTask(taskDel.getAttribute('data-task-del'));
        return;
      }
      if (dragging) return;
      const person = event.target.closest('[data-person]');
      if (person && !event.target.closest('#crm-drawer')) open(person.getAttribute('data-person'));
    });
    document.addEventListener('change', (event) => {
      const box = event.target.closest('[data-task-done]');
      if (!box) return;
      toggleTask(box.getAttribute('data-task-done'), box.checked);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') close();
      if (event.key === 'Enter' && event.target.id === 'crm-f-task') {
        event.preventDefault();
        addTask();
      }
    });
    document.addEventListener('dragstart', (event) => {
      const card = event.target.closest('#crm-board [data-person]');
      if (!card) return;
      dragging = true;
      event.dataTransfer.setData('text/plain', card.getAttribute('data-person'));
      event.dataTransfer.effectAllowed = 'move';
    });
    document.addEventListener('dragend', () => {
      setTimeout(() => { dragging = false; }, 0);
    });
    document.addEventListener('dragover', (event) => {
      if (event.target.closest('.crm-col')) event.preventDefault();
    });
    document.addEventListener('drop', (event) => {
      const column = event.target.closest('.crm-col');
      if (!column) return;
      event.preventDefault();
      move(event.dataTransfer.getData('text/plain'), column.getAttribute('data-stage'));
    });
    const search = qs('crm-q');
    if (search) search.style.display = 'none';
  }

  global.CrmWorkspace = { mount, reload, render, open, showView };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})(window);
