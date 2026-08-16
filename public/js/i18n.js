/**
 * Restau Wheel — i18n FR / EN
 * Usage: data-i18n="key" | data-i18n-placeholder="key" | data-i18n-html="key"
 * Toggle: button[data-lang-btn="fr|en"]
 */
(function (global) {
  const STORAGE_KEY = 'rw_lang';

  const dict = {
    fr: {
      // Nav / common
      'nav.login': 'Connexion',
      'nav.start': 'Commencer',
      'nav.home': 'Accueil',
      'nav.cancel': 'Résilier',
      'lang.fr': 'FR',
      'lang.en': 'EN',
      'footer.tagline': 'Fidélisation · Roue de fortune · Restaurants',
      'footer.cancel': 'Résilier mon abonnement',
      'footer.legal': 'Mentions légales',
      'footer.privacy': 'Confidentialité',

      'legal.title': 'Mentions légales – Restau Wheel',
      'legal.tag': 'MENTIONS LÉGALES',
      'legal.h1': 'Mentions légales',
      'legal.sub': 'Informations sur l’éditeur du service Restau Wheel.',
      'legal.editor.h': 'Éditeur du site',
      'legal.editor.name': 'Nom',
      'legal.editor.form': 'Forme juridique',
      'legal.editor.form.v': 'Entrepreneur individuel',
      'legal.editor.trade': 'Nom commercial',
      'legal.editor.ape': 'Code APE',
      'legal.editor.rne': 'Immatriculation RNE',
      'legal.editor.addr': 'Adresse',
      'legal.editor.pub': 'Directeur de publication',
      'legal.editor.contact': 'Contact',
      'legal.editor.product': 'Service',
      'legal.host.h': 'Hébergement',
      'legal.host.p': 'Le site est hébergé par :',
      'legal.host.name': 'Hébergeur',
      'legal.db.h': 'Base de données',
      'legal.db.p': 'Les données applicatives sont stockées sur Neon (Postgres serverless), connecté via l’intégration Vercel Marketplace.',
      'legal.privacy.h': 'Données personnelles',
      'legal.privacy.p1': 'Restau Wheel traite des données nécessaires au service de fidélisation (identité du client restaurant, email, téléphone, historique de tirages et gains), ainsi que les données de compte restaurateur et de facturation.',
      'legal.privacy.p2': 'Base légale : exécution du contrat (abonnement / utilisation du service) et intérêt légitime (sécurité, anti-abus, statistiques d’usage anonymisées).',
      'legal.privacy.p3': 'Durée : conservation pendant la relation commerciale, puis archivage limité au besoin légal (comptabilité, preuves).',
      'legal.privacy.p4': 'Vos droits (accès, rectification, effacement, opposition, portabilité) : écrivez à contact@restauwheel.com. Réclamation possible auprès de la CNIL (cnil.fr).',
      'legal.privacy.p5': 'Paiements : traités par Stripe ; Restau Wheel ne stocke pas les numéros de carte. SMS éventuels : Twilio.',
      'legal.ip.h': 'Propriété intellectuelle',
      'legal.ip.p': 'Le site Restau Wheel, sa marque, ses textes, visuels et logiciels sont protégés. Toute reproduction non autorisée est interdite.',

      // Landing
      'land.title': 'Restau Wheel — Fidélisation par la chance',
      'land.tag': 'N° 000 · FIDÉLITÉ',
      'land.h1': 'Faites tourner la chance à table.',
      'land.sub': 'Une roue sur chaque table. Vos clients scannent, jouent, reviennent. Vous gardez le contrôle des lots et des probabilités.',
      'land.cta': 'Lancer mon restaurant →',
      'land.how': 'Voir comment',
      'land.ticket.top': 'BON DE CHANCE',
      'land.ticket.warn': 'VALABLE 7 J',
      'land.ticket.h2': 'Dessert offert',
      'land.ticket.meta': 'Gagné au tirage · Table 12',
      'land.ticket.note': 'Présentez ce ticket à votre prochaine visite. Le restaurateur valide le lot.',
      'land.ticket.stamp': 'À RÉCLAMER',
      'land.steps.eyebrow': '03 ÉTAPES',
      'land.steps.h2': 'Simple comme un ticket.',
      'land.step1.h': 'Scannez',
      'land.step1.p': 'QR code sur la table. Le client entre son nom et son email.',
      'land.step2.h': 'Tournez',
      'land.step2.p': "La roue s'anime. Un lot tombe — dessert, café, réduction…",
      'land.step3.h': 'Revenez',
      'land.step3.p': 'Le gain est valable à la prochaine visite. Vous validez.',
      'land.feat.h2': "Tout ce qu'il faut\npour faire revenir.",
      'land.feat1.h': 'Lots & probabilités',
      'land.feat1.p': 'Définissez chaque segment de la roue. Contrôlez exactement ce qui tombe.',
      'land.feat2.h': 'QR code table',
      'land.feat2.p': 'Générez et téléchargez un QR unique pour votre salle.',
      'land.feat3.h': 'Validation en caisse',
      'land.feat3.p': 'Recherchez le client, validez le gain en un clic.',
      'land.feat4.h': 'Email automatique',
      'land.feat4.p': 'Le client reçoit son ticket avec la date limite.',
      'land.cta.h2': 'Prêt à faire tourner ?',
      'land.cta.p': 'Abonnement 20 € / mois. Configuration en 5 minutes.',
      'land.cta.btn': 'Créer mon compte restaurant',

      // Register
      'reg.title': 'Inscription – Restau Wheel',
      'reg.h1': 'Ouvrez la roue\nde votre salle.',
      'reg.sub': 'Créez votre compte restaurant. Vous configurez les lots, le QR et la caisse en quelques minutes.',
      'reg.card.title': 'Nouveau restaurant',
      'reg.name': 'Nom du restaurant',
      'reg.email': 'Email',
      'reg.password': 'Mot de passe',
      'reg.submit': 'Créer mon compte →',
      'reg.has': 'Déjà un compte ?',
      'reg.login': 'Se connecter',
      'reg.ph.name': 'Le Bistrot du Coin',
      'reg.ph.email': 'vous@restaurant.fr',
      'reg.ph.password': '••••••••',

      // Checkout
      'chk.title': 'Paiement – Restau Wheel',
      'chk.back': '← Retour',
      'chk.plan.tag': 'ABONNEMENT',
      'chk.plan.h1': 'Restau Wheel Pro',
      'chk.plan.price': '20€',
      'chk.plan.per': '/ mois',
      'chk.plan.f1': 'Roue illimitée & QR tables',
      'chk.plan.f2': 'Lots & probabilités personnalisés',
      'chk.plan.f3': 'Validation des gains en caisse',
      'chk.plan.f4': 'Emails automatiques',
      'chk.pay.h2': 'Payer par carte',
      'chk.pay.name': 'Nom',
      'chk.pay.email': 'Email',
      'chk.pay.btn': 'Payer 20€ →',
      'chk.cancel.link': 'Résilier un abonnement existant',

      // Cancel / résiliation
      'cancel.title': 'Résiliation – Restau Wheel',
      'cancel.tag': 'RÉSILIATION',
      'cancel.h1': 'Résilier mon abonnement',
      'cancel.sub': 'Indiquez l’email utilisé pour le paiement. Votre abonnement reste actif jusqu’à la fin de la période déjà payée, puis s’arrête automatiquement.',
      'cancel.email': 'Email de facturation',
      'cancel.ph.email': 'vous@restaurant.fr',
      'cancel.confirm': 'Je confirme vouloir résilier mon abonnement Restau Wheel Pro (20 €/mois).',
      'cancel.submit': 'Confirmer la résiliation →',
      'cancel.note': 'Conformément au droit de la consommation, vous pouvez résilier à tout moment. Aucun frais de résiliation.',
      'cancel.success': 'Résiliation enregistrée. Votre accès reste actif jusqu’à la fin de la période en cours.',
      'cancel.none': 'Aucun abonnement actif trouvé pour cet email.',
      'cancel.error': 'Une erreur est survenue. Réessayez ou contactez le support.',
      'cancel.back': '← Retour à l’accueil',
      'cancel.already': 'Cet abonnement est déjà programmé pour s’arrêter à la fin de la période.',
    },
    en: {
      'nav.login': 'Log in',
      'nav.start': 'Get started',
      'nav.home': 'Home',
      'nav.cancel': 'Cancel plan',
      'lang.fr': 'FR',
      'lang.en': 'EN',
      'footer.tagline': 'Loyalty · Fortune wheel · Restaurants',
      'footer.cancel': 'Cancel my subscription',
      'footer.legal': 'Legal notice',
      'footer.privacy': 'Privacy',

      'legal.title': 'Legal notice – Restau Wheel',
      'legal.tag': 'LEGAL NOTICE',
      'legal.h1': 'Legal notice',
      'legal.sub': 'Information about the publisher of the Restau Wheel service.',
      'legal.editor.h': 'Publisher',
      'legal.editor.name': 'Name',
      'legal.editor.form': 'Legal form',
      'legal.editor.form.v': 'Sole trader (Entrepreneur individuel)',
      'legal.editor.trade': 'Trade name',
      'legal.editor.ape': 'APE code',
      'legal.editor.rne': 'RNE registration',
      'legal.editor.addr': 'Address',
      'legal.editor.pub': 'Publication director',
      'legal.editor.contact': 'Contact',
      'legal.editor.product': 'Service',
      'legal.host.h': 'Hosting',
      'legal.host.p': 'The site is hosted by:',
      'legal.host.name': 'Host',
      'legal.db.h': 'Database',
      'legal.db.p': 'Application data is stored on Neon (serverless Postgres), connected via the Vercel Marketplace integration.',
      'legal.privacy.h': 'Personal data',
      'legal.privacy.p1': 'Restau Wheel processes data required for the loyalty service (restaurant guest identity, email, phone, spin and prize history), as well as restaurant account and billing data.',
      'legal.privacy.p2': 'Legal basis: performance of the contract (subscription / use of the service) and legitimate interest (security, anti-abuse, anonymized usage stats).',
      'legal.privacy.p3': 'Retention: for the duration of the commercial relationship, then limited archiving as required by law (accounting, evidence).',
      'legal.privacy.p4': 'Your rights (access, rectification, erasure, objection, portability): email contact@restauwheel.com. You may also lodge a complaint with the CNIL (cnil.fr).',
      'legal.privacy.p5': 'Payments are processed by Stripe; Restau Wheel does not store card numbers. Optional SMS: Twilio.',
      'legal.ip.h': 'Intellectual property',
      'legal.ip.p': 'The Restau Wheel site, brand, copy, visuals and software are protected. Unauthorized reproduction is prohibited.',

      'land.title': 'Restau Wheel — Loyalty by chance',
      'land.tag': 'N° 000 · LOYALTY',
      'land.h1': 'Spin chance at the table.',
      'land.sub': 'A wheel on every table. Guests scan, play, come back. You stay in control of prizes and odds.',
      'land.cta': 'Launch my restaurant →',
      'land.how': 'See how',
      'land.ticket.top': 'LUCKY TICKET',
      'land.ticket.warn': 'VALID 7 D',
      'land.ticket.h2': 'Free dessert',
      'land.ticket.meta': 'Won on spin · Table 12',
      'land.ticket.note': 'Show this ticket on your next visit. The restaurant validates the prize.',
      'land.ticket.stamp': 'TO CLAIM',
      'land.steps.eyebrow': '03 STEPS',
      'land.steps.h2': 'As simple as a ticket.',
      'land.step1.h': 'Scan',
      'land.step1.p': 'QR on the table. The guest enters name and email.',
      'land.step2.h': 'Spin',
      'land.step2.p': 'The wheel spins. A prize lands — dessert, drink, discount…',
      'land.step3.h': 'Return',
      'land.step3.p': 'The prize is valid on the next visit. You validate it.',
      'land.feat.h2': 'Everything you need\nto bring them back.',
      'land.feat1.h': 'Prizes & odds',
      'land.feat1.p': 'Define every wheel segment. Control exactly what lands.',
      'land.feat2.h': 'Table QR code',
      'land.feat2.p': 'Generate and download a unique QR for your room.',
      'land.feat3.h': 'POS validation',
      'land.feat3.p': 'Search the guest, validate the prize in one click.',
      'land.feat4.h': 'Automatic email',
      'land.feat4.p': 'The guest gets their ticket with the deadline.',
      'land.cta.h2': 'Ready to spin?',
      'land.cta.p': '€20 / month. Set up in 5 minutes.',
      'land.cta.btn': 'Create my restaurant account',

      'reg.title': 'Sign up – Restau Wheel',
      'reg.h1': 'Open the wheel\nfor your room.',
      'reg.sub': 'Create your restaurant account. Set prizes, QR and till validation in minutes.',
      'reg.card.title': 'New restaurant',
      'reg.name': 'Restaurant name',
      'reg.email': 'Email',
      'reg.password': 'Password',
      'reg.submit': 'Create my account →',
      'reg.has': 'Already have an account?',
      'reg.login': 'Log in',
      'reg.ph.name': 'The Corner Bistro',
      'reg.ph.email': 'you@restaurant.com',
      'reg.ph.password': '••••••••',

      'chk.title': 'Checkout – Restau Wheel',
      'chk.back': '← Back',
      'chk.plan.tag': 'SUBSCRIPTION',
      'chk.plan.h1': 'Restau Wheel Pro',
      'chk.plan.price': '€20',
      'chk.plan.per': '/ month',
      'chk.plan.f1': 'Unlimited wheel & table QR',
      'chk.plan.f2': 'Custom prizes & odds',
      'chk.plan.f3': 'In-store prize validation',
      'chk.plan.f4': 'Automatic emails',
      'chk.pay.h2': 'Pay by card',
      'chk.pay.name': 'Name',
      'chk.pay.email': 'Email',
      'chk.pay.btn': 'Pay €20 →',
      'chk.cancel.link': 'Cancel an existing subscription',

      'cancel.title': 'Cancellation – Restau Wheel',
      'cancel.tag': 'CANCEL PLAN',
      'cancel.h1': 'Cancel my subscription',
      'cancel.sub': 'Enter the email used for payment. Your plan stays active until the end of the paid period, then stops automatically.',
      'cancel.email': 'Billing email',
      'cancel.ph.email': 'you@restaurant.com',
      'cancel.confirm': 'I confirm I want to cancel my Restau Wheel Pro subscription (€20/month).',
      'cancel.submit': 'Confirm cancellation →',
      'cancel.note': 'You can cancel anytime. No cancellation fee.',
      'cancel.success': 'Cancellation recorded. Access stays active until the end of the current period.',
      'cancel.none': 'No active subscription found for this email.',
      'cancel.error': 'Something went wrong. Try again or contact support.',
      'cancel.back': '← Back to home',
      'cancel.already': 'This subscription is already set to end at the period close.',
    },
  };

  function getLang() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'fr' || saved === 'en') return saved;
    return (navigator.language || 'fr').toLowerCase().startsWith('en') ? 'en' : 'fr';
  }

  function t(key) {
    const lang = getLang();
    return (dict[lang] && dict[lang][key]) || dict.fr[key] || key;
  }

  function applyI18n(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      const val = t(key);
      if (el.hasAttribute('data-i18n-keep-br')) {
        el.innerHTML = val.replace(/\n/g, '<br>');
      } else {
        el.textContent = val;
      }
    });
    scope.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
    });
    scope.querySelectorAll('[data-i18n-title]').forEach((el) => {
      document.title = t(el.getAttribute('data-i18n-title'));
    });
    document.documentElement.lang = getLang();
    document.querySelectorAll('[data-lang-btn]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.getAttribute('data-lang-btn') === getLang());
      btn.setAttribute('aria-pressed', btn.getAttribute('data-lang-btn') === getLang() ? 'true' : 'false');
    });
    document.dispatchEvent(new CustomEvent('rw:lang', { detail: { lang: getLang() } }));
  }

  function setLang(lang) {
    if (lang !== 'fr' && lang !== 'en') return;
    localStorage.setItem(STORAGE_KEY, lang);
    applyI18n();
  }

  function mount() {
    applyI18n();
    document.querySelectorAll('[data-lang-btn]').forEach((btn) => {
      btn.addEventListener('click', () => setLang(btn.getAttribute('data-lang-btn')));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  global.RW_I18N = { t, setLang, getLang, applyI18n, dict };
})(typeof window !== 'undefined' ? window : globalThis);
