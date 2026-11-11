/**
 * Rekone — la solution des salles de jeux.
 * Le client choisit ses jeux, puis règle lots, pourcentages et suivi.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Arcade = api;
  root.Fidelize = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const solutions = [
    {
      id: 'arcade',
      name: 'Rekone',
      status: 'live',
      href: '/arcade/',
      accent: '#E8FF95',
      fr: {
        sector: 'Salles de jeux',
        tagline: 'Vos jeux. Vos règles.',
        summary: 'La salle active le bowling, le laser game, la pince ou le butin. Elle fixe les lots, les pourcentages et les espérances, puis suit les joueurs.',
        points: ['Jeux au choix', 'Lots, pourcentages, espérances', 'Dashboard et export RGPD'],
        cta: 'Voir Rekone',
      },
      en: {
        sector: 'Game venues',
        tagline: 'Your games. Your rules.',
        summary: 'The venue turns on bowling, laser game, the claw, or the loot. It sets prizes, odds, and expectations, then follows the players.',
        points: ['Games to choose from', 'Prizes, odds, expectations', 'Dashboard and GDPR export'],
        cta: 'See Rekone',
      },
    },
  ];

  function byId(id) {
    const key = String(id || '').trim().toLowerCase();
    return solutions.find((s) => s.id === key) || null;
  }

  function byHref(href) {
    const path = String(href || '').replace(/\/$/, '') || '/';
    return solutions.find((s) => s.href.replace(/\/$/, '') === path) || null;
  }

  function detailPaths() {
    return solutions
      .filter((s) => s.page === 'detail' && typeof s.href === 'string' && s.href.startsWith('/'))
      .map((s) => s.href);
  }

  function present(s) {
    return {
      id: s.id,
      name: s.name,
      status: s.status,
      href: s.href,
      page: s.page || null,
      accent: s.accent,
      fr: s.fr,
      en: s.en,
    };
  }

  function list() {
    return solutions.map(present);
  }

  return { solutions, byId, byHref, detailPaths, list, present };
});
