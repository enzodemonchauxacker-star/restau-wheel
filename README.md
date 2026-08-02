# 🍽️ Restau Wheel

Logiciel de fidélisation pour restaurants basé sur une roue de fortune type casino.

## Concept

Un QR code placé sur chaque table ou carte du restaurant. Le client le scanne, renseigne son nom et email, puis fait tourner une roue pour gagner un lot (réduction, dessert, café…) valable à sa prochaine visite.

Le restaurateur gère tout depuis un dashboard admin : lots, probabilités, délais, et peut valider les gains quand un client revient les réclamer.

## Fonctionnalités

- **Page client** : formulaire → roue de fortune animée → affichage du gain avec deadline
- **Dashboard admin** : tableau de bord, recherche client, gestion des lots, QR code téléchargeable, paramètres
- **Base de données** : historique de tous les tirages, statut (en attente / utilisé / expiré)

## Installation

**Prérequis :** Node.js 22 ou supérieur

```bash
git clone <url-du-repo>
cd restau-wheel
npm install
npm start
```

L'application démarre sur **http://localhost:3000**

## Accès

| Page | URL |
|---|---|
| Page client (QR code) | http://localhost:3000/client |
| Dashboard admin | http://localhost:3000/admin |

Mot de passe admin par défaut : `admin123`  
À changer dans **Paramètres** dès la première connexion.

## Configuration pour la production

1. Connectez-vous à l'admin → **Paramètres**
2. Changez le **nom du restaurant**
3. Renseignez l'**URL publique** de votre serveur (ex: `https://monrestaurant.fr`) — cela met à jour le lien encodé dans le QR code
4. Changez le **mot de passe admin**

## Stack technique

- **Backend** : Node.js + Express
- **Base de données** : SQLite (module natif Node.js, aucune dépendance externe)
- **Frontend** : HTML/CSS/JavaScript vanilla
- **QR Code** : bibliothèque `qrcode`
