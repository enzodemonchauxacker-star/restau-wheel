(function () {
  const login = document.querySelector('.nav-login');
  const loginForm = document.getElementById('login-form');
  if (!login && !loginForm) return;

  function safeNext(value) {
    const text = String(value || '');
    return /^\/arcade\/[A-Za-z0-9/?=&._%-]{0,180}$/.test(text) ? text : '/arcade/dashboard/';
  }

  fetch('/arcade/api/compte/moi', { cache: 'no-store', credentials: 'same-origin' })
    .then((res) => res.json())
    .then((me) => {
      if (!me || !me.loggedIn) return;
      if (loginForm) {
        const next = new URLSearchParams(location.search).get('next');
        location.replace(safeNext(next));
        return;
      }
      if (!login) return;
      login.textContent = 'Tableau de bord';
      login.setAttribute('href', '/arcade/dashboard/');
    })
    .catch(() => {});
})();
