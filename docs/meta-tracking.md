# Suivi des ventes Restau Wheel — préparation locale

Le pixel 1674081597383551 est chargé après consentement sur les pages commerciales. Aucun pixel sur le paiement, la roue client ou les espaces administrateurs. La page de paiement permet de modifier le consentement et le joint à la création de la session Stripe.

La nouvelle route POST /api/webhooks/stripe-meta reçoit les événements Stripe signés. Elle ne modifie ni les abonnements ni les droits d'accès. Seules les sessions Checkout d'abonnement payées, de montant positif en EUR et comportant le consentement sont envoyées comme Purchase. Les événements invoice.paid de renouvellement sont ignorés. Aucun suivi rétroactif des sessions existantes. Les essais gratuits, paiements gratuits et autres devises sont exclus de cette version.

L'email normalisé est haché SHA-256 avant l'envoi à Meta. Les identifiants _fbp/_fbc sont facultatifs. Le montant provient de Stripe. Le nom, les données de carte et les paramètres privés de l'URL ne sont pas envoyés. Les URL commerciales avec des marqueurs publicitaires simples sont autorisées ; les URL avec email, jeton, fragment ou paramètre inconnu ne chargent pas le pixel.

## Configuration avant activation

Ajouter uniquement dans les variables serveur de Vercel :
- STRIPE_META_WEBHOOK_SECRET : secret de signature du nouvel endpoint Stripe, distinct de tout autre webhook.
- META_CAPI_ACCESS_TOKEN : jeton Conversions API pour le pixel indiqué.
- META_GRAPH_API_VERSION : version Graph API active, à confirmer dans Meta au moment de la configuration (format vNN.0).
- META_TEST_EVENT_CODE : uniquement pendant le test Meta, puis retirer avant le trafic réel.

Conserver STRIPE_SECRET_KEY et STRIPE_PRICE_ID existants. Ne jamais placer les secrets dans Git ou les scripts publics.

Créer un endpoint Stripe séparé, URL https://restauwheel.com/api/webhooks/stripe-meta, pour checkout.session.completed et checkout.session.async_payment_succeeded. Ne pas remplacer d'autres endpoints. Pour la recette, utiliser une instance de préproduction avec les clés et prix Stripe de test et une base Neon de test, ainsi que le code « Test events » Meta. Les événements Stripe de test sont ignorés en l'absence de META_TEST_EVENT_CODE.

Le journal meta_sales_delivery est créé lors du premier événement admissible. Il stocke un identifiant de transaction et l'état d'envoi, sans email. Une prise atomique évite les envois concurrents ; une notification déjà envoyée est acquittée. Une erreur Meta renvoie 503 pour permettre une nouvelle tentative Stripe. L'identifiant Meta reste stable lors des reprises, y compris si la réponse Meta a été perdue. Prévoir une surveillance des échecs Stripe et leur reprise manuelle après résolution d'une panne prolongée.

## Validation effectuée et restante

19 tests locaux passent, dont un test réel de signature avec le SDK Stripe officiel : une signature correcte est acceptée, un corps altéré est rejeté. Les autres tests couvrent consentement, refus, URLs privées, montant, renouvellements, doublons, pannes et événements de test. Node local : 24 ; production attendue : 22. Aucune dépendance ni version modifiée.

Les appels Meta et le journal SQL sont simulés dans ces tests. Il reste à vérifier sur une préproduction Node 22 : création et concurrence du journal dans Neon, paiement Stripe de test de bout en bout, réception Purchase dans « Test events » Meta, absence de Purchase sans accord, puis absence de double comptage lors d'une nouvelle livraison de la même notification. Vérifier visuellement le bandeau sur mobile et ordinateur.

Le consentement transmis au paiement est celui du lancement de la session Stripe. Un retrait effectué plus tard sur un autre onglet ne met pas à jour la session Stripe déjà créée ; ce cas nécessite un registre de consentement côté serveur si l'on veut synchroniser ces changements avant une confirmation de paiement différée.

Aucun déploiement, paiement réel ou changement du compte publicitaire n'a été effectué. Valider la recette et le déploiement avant activation publicitaire.

Sources :
- https://docs.stripe.com/webhooks
- https://github.com/facebook/facebook-php-business-sdk/blob/main/examples/AdsPixelEventsPostCustom.php

## Configuration réalisée le 7 septembre 2026

Vercel, projet restau-wheel-main, Production : META_CAPI_ACCESS_TOKEN et STRIPE_META_WEBHOOK_SECRET enregistrés en Secret ; META_GRAPH_API_VERSION=v26.0, version du SDK officiel Meta au moment de la vérification. Webhook Stripe we_1UCySy5WLE2Ane43l10amS7i créé séparément avec les deux événements prévus, version 2026-01-28.clover. Aucun push ni redéploiement. Vercel affiche Connect Git : vérifier le mode de publication avant toute mise en ligne. Le nouveau module lib/** est inclus explicitement dans le paquet Vercel.
