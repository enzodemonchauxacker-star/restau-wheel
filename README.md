# 🍽️ Restau Wheel

Logiciel de fidélisation pour restaurants basé sur une roue de fortune type casino.

**Prod :** https://restauwheel.com

## Concept

Un QR code placé sur chaque table ou carte du restaurant. Le client le scanne, renseigne son nom, email et téléphone, puis fait tourner une roue pour gagner un lot (réduction, dessert, café…) valable à sa prochaine visite.

Le restaurateur gère tout depuis un dashboard admin : lots, probabilités, délais, et peut valider les gains quand un client revient les réclamer.

## Fonctionnalités

- **Page client** : formulaire → roue de fortune animée → affichage du gain avec deadline
- **Anti-abus** : 1 tirage / email et / téléphone par restaurant (cooldown configurable, défaut 24h)
- **Dashboard admin** : stats, clients, lots, calibrage des probabilités, QR code, paramètres
- **Super-admin** : multi-restaurants, SMTP, Twilio
- **Base de données** : Neon Postgres (persistante sur Vercel) — historique des tirages et statut (en attente / utilisé / expiré)
- **Paiements** : Stripe Checkout (abonnement Pro)
- **SMS** : Twilio (optionnel, `SMS_ENABLED=1`)

## Installation

**Prérequis :** Node.js 22 ou supérieur + une base Neon (`DATABASE_URL`)

```bash
git clone <url-du-repo>
cd restau-wheel
cp .env.example .env
# Renseigne DATABASE_URL (Neon pooled) dans .env
npm install
npm start
```

L'application démarre sur **http://localhost:3000**

## Accès

| Page | URL |
|---|---|
| Landing | http://localhost:3000/ |
| Page client (QR) | http://localhost:3000/client?r=1 |
| Inscription | http://localhost:3000/register |
| Dashboard admin | http://localhost:3000/admin |
| Super-admin | http://localhost:3000/superadmin |
| Checkout | http://localhost:3000/checkout |

| Compte | Identifiants |
|---|---|
| Admin démo (seed) | `teddy@restauwheel.com` / `teddy2026` |
| Super-admin | mot de passe `superadmin123` (ou `SUPERADMIN_PASSWORD`) |

## Variables d'environnement

Voir [`.env.example`](.env.example). Les essentielles :

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | Neon Postgres (pooled, obligatoire) |
| `PUBLIC_BASE_URL` | URL publique (QR codes), ex. `https://restauwheel.com` |
| `SESSION_SECRET` | Secret cookie-session |
| `SUPERADMIN_PASSWORD` | Mot de passe super-admin |
| `STRIPE_*` | Checkout abonnement (optionnel) |
| `TWILIO_*` / `SMS_ENABLED` | SMS (optionnel) |

Sur Vercel, Neon Marketplace injecte automatiquement `DATABASE_URL` (+ alias `POSTGRES_*`).

## Configuration pour la production

1. Connectez-vous à l'admin → **Paramètres**
2. Changez le **nom du restaurant** et le **mot de passe**
3. Vérifiez `PUBLIC_BASE_URL` (QR code)
4. Optionnel : SMTP / Twilio via super-admin

## App iOS

Une enveloppe native SwiftUI + WKWebView vit dans [`ios/`](ios/README.md).
Elle affiche le site déployé — pas de logique dupliquée, un déploiement suffit
à mettre l'app à jour.

```bash
open ios/RestauWheel.xcodeproj
```

## Stack technique

- **Backend** : Node.js + Express (serverless sur Vercel)
- **Base de données** : Neon Postgres (`@neondatabase/serverless`)
- **Sessions** : cookie-session (compatible serverless)
- **Frontend** : HTML/CSS/JavaScript vanilla (pop art magenta/jaune)
- **QR Code** : bibliothèque `qrcode`
- **Paiements** : Stripe
- **SMS** : Twilio
- **iOS** : SwiftUI + WKWebView (iOS 17+)
