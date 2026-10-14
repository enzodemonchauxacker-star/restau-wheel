/**
 * Famille Fidelize — outils pour fidéliser le client.
 * Ajouter une solution = un objet dans `solutions`.
 * On n'y met que ce qui est prêt à être montré.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Fidelize = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const solutions = [
    {
      id: 'restauwheel',
      name: 'Restau Wheel',
      status: 'live',
      href: 'https://restauwheel.com',
      accent: '#FF2D6A',
      fr: {
        sector: 'Restaurants',
        tagline: 'La roue qui fait revenir à table.',
        summary: 'Le client scanne le QR, tourne la roue et repart avec un lot pour la prochaine visite. Vous gardez les lots et les probabilités.',
        points: ['QR code en salle', 'Lots et probabilités', 'Validation du gain au retour'],
        cta: 'Ouvrir Restau Wheel',
      },
      en: {
        sector: 'Restaurants',
        tagline: 'The wheel that brings them back to the table.',
        summary: 'The guest scans the QR, spins the wheel, and leaves with a prize for the next visit. You keep the prizes and the odds.',
        points: ['QR code in the dining room', 'Prizes and odds', 'Prize check on the return visit'],
        cta: 'Open Restau Wheel',
      },
    },
  ];

  function byId(id) {
    const key = String(id || '').trim().toLowerCase();
    return solutions.find((s) => s.id === key) || null;
  }

  function byHref(href) {
    const path = String(href || '').replace(/\/$/, '') || '/';
    return solutions.find((s) => s.href === path) || null;
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
