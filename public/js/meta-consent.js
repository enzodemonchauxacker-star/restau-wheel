/* Meta is loaded only after an explicit advertising-consent choice. */
(() => {
  'use strict';
  const KEY = 'rw_ads_consent_v1';
  const PIXEL = '1674081597383551';
  const MAX_AGE = 180 * 86400000;
  let loaded = false;
  function read() {
    try {
      const choice = JSON.parse(localStorage.getItem(KEY));
      return choice && Number.isFinite(choice.at) && choice.at <= Date.now() && Date.now() - choice.at < MAX_AGE ? choice.value : null;
    } catch (_) { return null; }
  }
  function load() {
    if (loaded || location.pathname === '/checkout' || location.pathname === '/checkout/') return;
    // Do not send URLs containing form data, tokens, or other query values.
    // Only the explicit homepage-demo navigation marker is permitted.
    const url = new URL(location.href);
    if (url.hash || [...url.searchParams].some(([k,v]) => !((k === 'src' && v === 'home') || (k === 'fbclid' && /^[A-Za-z0-9_-]{1,300}$/.test(v)) || (/^utm_(source|medium|campaign|content|term)$/.test(k) && /^[A-Za-z0-9_.-]{1,100}$/.test(v))))) return;
    loaded = true;
    const fbq = window.fbq = function () {
      fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments);
    };
    window._fbq = fbq;
    fbq.push = fbq; fbq.loaded = true; fbq.version = '2.0'; fbq.queue = [];
    // Disable automatic event detection and automatic collection from forms.
    fbq('set', 'autoConfig', false, PIXEL);
    fbq('init', PIXEL);
    fbq('track', 'PageView');
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(script);
  }
  window.rwAdsMetadata = () => {
    if (read() !== 'granted') return { consent: false };
    const result = { consent: true };
    for (const key of ['fbp', 'fbc']) {
      const match = (document.cookie || '').split('; ').find(v => v.startsWith('_' + key + '='));
      if (match) result[key] = match.slice(key.length + 2);
    }
    return result;
  };
  function clearCookies() {
    for (const name of ['_fbp', '_fbc']) {
      document.cookie = `${name}=; Max-Age=0; path=/`;
      const parts = location.hostname.split('.');
      for (let i=0; i<parts.length-1; i++) {
        document.cookie = `${name}=; Max-Age=0; path=/; domain=.${parts.slice(i).join('.')}`;
      }
    }
  }
  const panel = document.createElement('section');
  panel.className = 'rw-consent';
  panel.setAttribute('aria-label', 'Préférences publicitaires');
  panel.innerHTML = '<p><strong>Mesure publicitaire</strong><br>Avec votre accord, nous transmettons vos visites et votre premier paiement à Meta pour mesurer nos publicités, avec des identifiants publicitaires et votre email haché lors du paiement. Vous pouvez refuser et utiliser le site normalement. <a href="/mentions#meta-publicite">En savoir plus</a></p><div><button type="button" data-choice="denied">Refuser</button><button type="button" data-choice="granted">Accepter</button></div>';
  const manage = document.createElement('button');
  manage.type = 'button'; manage.className = 'rw-consent-manage';
  manage.textContent = 'Cookies publicitaires';
  manage.addEventListener('click', () => { panel.hidden = false; panel.querySelector('button').focus(); });
  panel.querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
    const value = button.dataset.choice;
    try { localStorage.setItem(KEY, JSON.stringify({ value, at: Date.now() })); } catch (_) {}
    panel.hidden = true;
    if (value === 'granted') load();
    else {
      if (window.fbq) window.fbq('consent', 'revoke');
      clearCookies();
      // Unload the third-party script after withdrawing an earlier consent.
      if (loaded) location.reload();
    }
  }));
  document.body.append(panel, manage);
  const choice = read();
  panel.hidden = choice === 'granted' || choice === 'denied';
  if (choice === 'granted') load();
})();
