# Restau Wheel — app iOS

Enveloppe native (SwiftUI + WKWebView) autour de l'app web Restau Wheel.
Le site reste la seule source de vérité : aucune logique métier n'est dupliquée ici.
Un déploiement Vercel met l'app à jour instantanément, sans repasser par l'App Store.

## Ouvrir le projet

```bash
open ios/RestauWheel.xcodeproj
```

Puis ⌘R. Aucune dépendance externe, aucun `pod install`.

## Ce que la coquille native apporte

| | |
|---|---|
| Icône + écran de lancement | roue pop art aux couleurs de `public/css/theme.css` |
| Session persistante | `WKWebsiteDataStore.default()` — la connexion admin survit à la fermeture |
| Bouton retour | pastille dorée en bas à gauche, visible seulement s'il y a un historique |
| Tirer pour rafraîchir | sur toutes les pages |
| Barre de progression | filet doré en haut pendant les navigations |
| Écran hors ligne | message natif + « Réessayer », au lieu de la page d'erreur grise de WebKit |
| Dialogues JS | `alert()`, `confirm()`, `prompt()` routés vers des alertes iOS natives |
| Liens externes | ouverts dans Safari ; Stripe reste dans l'app pour que la redirection retour fonctionne |

## Configuration

Tout est dans [`RestauWheel/AppConfig.swift`](RestauWheel/AppConfig.swift) :

- `baseURL` — le serveur visé. Actuellement `https://restauwheel.com`.
- `startURL` — la page d'accueil de l'app. Pour démarrer sur le dashboard :
  `static let startURL = baseURL.appending(path: "admin")`
- `internalDomains` — les domaines qui s'affichent dans l'app plutôt que dans Safari.

### Tester contre un serveur local

`npm start` écoute sur le port 3000, mais le simulateur ne voit pas `localhost`
en HTTPS. Le plus simple est un tunnel :

```bash
npx localtunnel --port 3000
```

puis reporter l'URL HTTPS obtenue dans `baseURL`.

## Régénérer l'icône

```bash
python3 ios/Tools/make-icon.py
```

Le script ([`Tools/make-icon.py`](Tools/make-icon.py)) redessine le PNG 1024×1024
depuis les couleurs de la charte. Modifie `SEGMENTS` pour changer la roue.

## Installer sur un iPhone

1. Xcode → **Settings** → **Accounts** → **+** → ajouter son Apple ID.
   Sans compte, le menu Team est vide et le build échoue sur
   `Signing for "RestauWheel" requires a development team`.
2. Onglet **Signing & Capabilities** de la cible `RestauWheel` → choisir le **Team**
3. `PRODUCT_BUNDLE_IDENTIFIER` vaut `com.teddyvann.restauwheel` — le changer s'il
   appartient à quelqu'un d'autre
4. Sélectionner l'iPhone branché en USB, ⌘R

Avec un compte développeur gratuit, l'app expire au bout de 7 jours et doit être
réinstallée. Un compte payant (99 €/an) lève cette limite et donne accès à
TestFlight et à l'App Store.

## Avant une soumission App Store

La page `/checkout` vend l'abonnement Restau Wheel Pro par Stripe. Apple applique
la règle 3.1.1 (achats intégrés obligatoires pour les biens numériques) et la
dérogation « service d'entreprise » de la 3.1.3(e) n'est pas automatique. Deux
options si la revue bloque :

- masquer le tunnel d'achat dans l'app et laisser les restaurateurs s'abonner sur
  le web (`startURL` pointant directement sur `/admin`) ;
- ou passer l'abonnement en achat intégré StoreKit.

Rien à faire tant que l'app reste distribuée en interne ou via TestFlight.
