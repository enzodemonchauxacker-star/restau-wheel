(function () {
  const KEY = 'rekone-compte';
  const dashboard = '/arcade/dashboard/';
  const login = document.querySelector('.nav-login');
  const loginForm = document.getElementById('login-form');

  function remember(open) {
    try {
      if (open) localStorage.setItem(KEY, '1');
      else localStorage.removeItem(KEY);
    } catch (error) {}
  }

  function known() {
    try { return localStorage.getItem(KEY) === '1'; }
    catch (error) { return false; }
  }

  function safeNext(value) {
    const text = String(value || '');
    return /^\/arcade\/[A-Za-z0-9/?=&._#%-]{0,180}$/.test(text) ? text : dashboard;
  }

  if (login && known()) login.setAttribute('href', dashboard);

  function moi() {
    return fetch('/arcade/api/compte/moi', { cache: 'no-store', credentials: 'same-origin' })
      .then((res) => res.json());
  }

  if (login && !loginForm) {
    login.addEventListener('click', (event) => {
      if (login.getAttribute('href') === dashboard) return;
      event.preventDefault();
      moi().then((me) => {
        if (me && me.loggedIn) {
          remember(true);
          location.assign(dashboard);
          return;
        }
        remember(false);
        location.assign('/arcade/connexion/');
      }).catch(() => location.assign('/arcade/connexion/'));
    });
  }

  if (!login && !loginForm) return;

  moi().then((me) => {
    const open = !!(me && me.loggedIn);
    remember(open);
    if (loginForm) {
      if (open) {
        const next = new URLSearchParams(location.search).get('next');
        location.replace(safeNext(next));
        return;
      }
      document.documentElement.classList.remove('session-checking');
      const lead = document.getElementById('lead');
      if (lead) lead.textContent = "Entrez l'email et le mot de passe choisis après l'abonnement.";
      return;
    }
    if (login && open) login.setAttribute('href', dashboard);
  }).catch(() => {
    document.documentElement.classList.remove('session-checking');
    const lead = document.getElementById('lead');
    if (lead && loginForm) lead.textContent = "Entrez l'email et le mot de passe choisis après l'abonnement.";
  });
})();
