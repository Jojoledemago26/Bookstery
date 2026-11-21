# Bookstery

Site Bookstery (page statique), repris depuis l'artefact Claude.

## Fichiers

- `index.html` — la page du site
- `config.js` — configuration Supabase (laisser vide pour le mode démo ; n'y mettre que la clé *anon/publishable*, jamais la clé `service_role`)
- `logo.png`, `mark.png` — logos
- `supabase/annonces.sql` — table des annonces de livres (à exécuter une fois dans Supabase > SQL Editor)
- `supabase/extraits.sql` — tables des extraits d'auteurs et des dépôts refusés
- `supabase/functions/deposer-extrait/` — fonction Edge : contrôle anti-IA, empreinte, horodatage
- `supabase/liseuse.sql` — commandes, manuscrits mystères, avis, abonnements
- `supabase/photos-annonces.sql` — photos réelles recto/verso obligatoires (colonnes, stockage « photos-annonces », contrôles)
- `supabase/vendeur-pro.sql` — statut du vendeur (particulier / professionnel) affiché sur les annonces
- `supabase/vip.sql` — statut Bookster VIP : cumul des achats et badge à 30 €
- `supabase/fondateur.sql` — badge « Fondateur Bookstery » sur les œuvres du fondateur (non éligibles au Golden Book et aux prix)
- `supabase/themes.sql` — Boîte à Thèmes : propositions (1 par membre), compteurs publics en temps réel
- `supabase/saisons.sql` — Bookster Thème : saison et format des textes, tirage prioritaire dans la saison en cours
- `supabase/qualite.sql` — contrôle qualité : note IA sur 10 conservée, archivage automatique (moyenne < 2,5/5 après 10 lectures)
- `supabase/tirage.sql` — tirage équitable des Mystery Drops par genre, sur tous les textes (à exécuter)
- `supabase/accelerateur.sql` — Pack Accélérateur Auteurs : abonnements, textes prioritaires, statistiques
- `supabase/connect.sql` — paiement des commandes Stripe Connect (comptes vendeurs, lignes vendeur, suivi)
- `supabase/functions/valider-commande/`, `stripe-connect/`, `suivi-commande/`, `liberer-paiements/`, `stripe-webhook/` — paiement Stripe Connect des commandes et abonnement du Pack Accélérateur
- `supabase/genres-disponibles.sql` — genres où des manuscrits mystères existent (genre de secours du cadeau)
- `supabase/localisation.sql` — ville et région des annonces (filtre de localisation)
- `supabase/moderation.sql` — journal des refus de modération
- `supabase/signalements.sql` — signalements des lecteurs + retrait automatique
- `supabase/functions/verifier-photos/` — vérification par IA des photos recto/verso d'une annonce
- `supabase/functions/aide/` — assistant d’aide (bulle « ? » en bas à droite) : répond à partir de la FAQ `faq.ts`
- `supabase/functions/deposer-extrait/moderation.ts` — modération stricte par Claude Haiku 5.5
- `supabase/functions/valider-commande/` — commande + tirage des manuscrits mystères (jetons des QR codes)
- `supabase/functions/envoyer-avis/` — avis du lecteur envoyé par e-mail à l'auteur (Resend)

## Lancer en local

Ouvrir `index.html` dans un navigateur, ou servir le dossier :

```bash
python3 -m http.server 8000
```

## Vendre un livre

Bouton « Vendre un livre » (en-tête) :

1. Trois façons de trouver le livre : **scanner le code-barres** (caméra du téléphone, ou photo du code-barres), **entrer l'ISBN** (10 ou 13 chiffres), ou **« Livre ancien sans code-barres ? Remplir manuellement »**.
2. Avec un ISBN, recherche automatique sur Google Books (Open Library en secours) : titre, auteur, résumé, couverture, genre.
3. **Photos réelles obligatoires** de l'exemplaire, recto et verso, contre les fausses annonces : réduites à 1600 px en JPEG sur le téléphone (métadonnées GPS retirées), affichées sur la fiche du livre. Côté Supabase : `supabase/photos-annonces.sql`.
   - **Contrôle instantané sur le téléphone** : photo trop petite, identique recto/verso, floue (netteté), trop sombre, surexposée ou sans contraste → refusée avec un conseil.
   - **Vérification par IA au moment de publier** (`supabase functions deploy verifier-photos`) : vraie photo d'un livre physique (pas une capture ou une image de catalogue), titre et texte lisibles, livre visible, couverture qui correspond au titre annoncé. Photo refusée = annonce non publiée. Si le service est indisponible, seuls les contrôles du téléphone s'appliquent.
4. Le vendeur choisit l'état (Comme neuf, Très bon état, Bon état), la ville et son prix. Encart « Paiement sécurisé : tu reçois 100 % de ton prix dès que l'acheteur confirme la réception ».
5. L'annonce est enregistrée dans la table `annonces` de Supabase (vendeur connecté requis).

## Bookster Bag (panier)

- Catalogue « Les derniers livres en vente » : annonces Supabase (exemples lyonnais en mode démo), filtrées par la recherche et les genres.
- Protection Acheteur ajoutée automatiquement : 5 % du montant des livres + 0,70 €.
- **Mystery Drops (commande en cours)** : le montant des livres du panier, tous vendeurs confondus, débloque des Mystery Drops (manuscrits mystères offerts) par **paliers dégressifs** : 10 € = 1, 18 € = 2, 25 € = 3, 28 € = 4, 30 € = 5 (maximum par commande). Jauge animée en haut du panier, qui fête chaque Drop et indique le montant manquant avec des suggestions.
- **Statut Bookster VIP (fidélité)** : cumul `total_spent_books` des livres achetés sur toutes les commandes ; barre bleu Majorelle de 0 à 30 € en bas du panier et dans « Mon espace » ; à 30 €, `is_vip_jury = true` et badge doré (vote du prochain Golden Book). Côté Supabase : `supabase/vip.sql`.
  Sous 10 € : « Plus que X € chez ce vendeur pour débloquer ton 1er manuscrit mystère ! » et des suggestions du même vendeur.
- Si le Bag mélange plusieurs genres, l'acheteur choisit le genre de son cadeau mystère avant de payer.
- Genre de secours : s'il n'existe aucun texte dans ce genre, le manuscrit mystère vient de la même famille (Imaginaire, Polar & Thriller, Littérature, Jeunesse) ; sinon le Bookster choisit parmi ses genres préférés (ou les genres disponibles) avant de payer.
- Le Bag est gardé dans le navigateur. Le paiement en ligne n'est pas encore branché.

## Espace auteur

Bouton « Envoyer mon texte » (section Auteurs) :

1. L'auteur saisit le titre, le genre et colle (ou importe en .txt) un extrait **calibré entre 1 000 et 5 000 mots**, avec jauge en direct.
2. La fonction Edge `deposer-extrait` fait analyser le texte par un détecteur d'IA : **au-delà de 50 % de texte IA, le dépôt est refusé** (la tentative est journalisée sans le texte).
3. Sinon, l'extrait est enregistré avec son empreinte SHA-256 ; la base fixe l'horodatage. Un **certificat d'horodatage** est affiché (copie de l'empreinte, téléchargement HTML).
4. Les textes sont affichés en **lecture protégée** : copie, clic droit et glisser bloqués, impression masquée, filigrane au nom du lecteur.

Mise en route :

```bash
supabase secrets set PANGRAM_API_KEY=ta_cle            # ou : AI_DETECTOR=zerogpt ZEROGPT_API_KEY=ta_cle
supabase functions deploy deposer-extrait
```

Les adresses et champs des API Pangram / ZeroGPT sont à vérifier dans la documentation de ton compte (variables `PANGRAM_API_URL`, `ZEROGPT_API_URL`).

## Liseuse sécurisée

- Accès : QR code / lien `#lire-<jeton>` affiché après la commande, ou « Mes manuscrits mystères » (espace client, raccourci dans le Bag). Réservée au compte qui a reçu le manuscrit mystère.
- Fond papier crème, **mode nuit**, taille du texte réglable, temps de lecture estimé (230 mots/min) et temps restant, barre de progression.
- Clic droit, sélection, copier/couper, glisser, Ctrl+A/C/P bloqués ; impression masquée ; filigrane au nom du lecteur.
- À la fin : note de 1 à 5 étoiles, commentaire envoyé **par e-mail à l'auteur** (son adresse reste privée), bouton **Suivre l'auteur**.

Mise en route :

```bash
supabase secrets set RESEND_API_KEY=re_xxx MAIL_FROM="Bookstery <avis@ton-domaine.fr>"
supabase functions deploy valider-commande
supabase functions deploy envoyer-avis
```

Renseigne `SITE_URL` dans `config.js` pour que les QR codes pointent vers l'adresse publique du site.

## Catalogue : fiche livre et filtres

- Clic sur une couverture ou un titre : **fiche du livre** (genre, état, prix, vendeur et ville, résumé) avec **« Dans sa bibliothèque »** : tous les autres livres du même vendeur, l'avancement vers le prochain manuscrit mystère chez lui et un bouton « Tout ajouter » pour acheter le lot.
- Bulles de genre cliquables partout (accueil, catalogue, cartes, fiche), dont le nouveau genre **Nouvelles**.
- Filtre de localisation : **Lyon / Ma ville / Ma région / Toute la France** (ville et région demandées une fois, gardées dans le navigateur).
- Tri : nouveautés, titre de A à Z, prix croissant ou décroissant.
- « Vendre un livre » demande maintenant la ville et la région du livre.

## Modération automatique des manuscrits

Avant tout enregistrement, la fonction `deposer-extrait` envoie le texte à un modèle Claude léger (Claude Haiku 5.5, réponse JSON imposée) qui refuse :

1. **contenu interdit** : haine, racisme, antisémitisme, violence gratuite ou glorifiée, terrorisme, contenu illégal, pornographie (la fiction peut raconter un crime, comme dans un polar, sans en faire l'apologie) ;
2. **plagiat** : l'IA vérifie explicitement si le texte est un extrait, une copie retouchée ou une traduction d'une œuvre déjà publiée (classique ou contemporaine) ; le dépôt est bloqué et l'œuvre reconnue est indiquée à l'auteur ;
3. **texte pas en français** ;
4. **texte non littéraire** : recette, spam, liste, article, texte incohérent ;
5. **texte illisible** ou bourré de fautes graves.

Avant l'envoi, l'auteur doit cocher : « Je certifie sur l'honneur être l'auteur unique de ce texte original et inédit » (vérifié aussi côté serveur). Dans la liseuse, le lien discret « Signaler un plagiat ou un problème » ouvre le formulaire de signalement (raison « Plagiat » incluse).

L'auteur reçoit un message bienveillant (et un conseil personnalisé pour une relecture). Le texte reste dans le formulaire. Si la vérification est indisponible, rien n'est déposé. Ordre des contrôles : modération → détecteur d'IA → empreinte et horodatage.

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy deposer-extrait
```

En mode démo, une simulation simplifiée (langue, recette ou liste, écriture SMS) montre les messages de refus ; le contrôle des contenus interdits n'existe que côté serveur.

## Signaler un texte

Dans la liseuse : bouton **Signaler** (barre du haut) et lien « Signaler ce texte » en fin de lecture. Le lecteur doit choisir une raison (haine ou discrimination, violence gratuite, contenu sexuel explicite, contenu illégal ou dangereux, plagiat, texte généré par IA, illisible ou hors sujet, autre — précision obligatoire pour « autre »). Un seul signalement par lecteur et par texte, anonyme pour l'auteur. À partir de 3 signalements graves de lecteurs différents, le texte n'est plus offert en attendant la vérification de l'équipe.

## Assistant d'aide

Bulle « ? » en bas à droite (et lien « Aide » du pied de page) : fenêtre de discussion avec questions suggérées.

- Avec Supabase : la fonction `aide` fait répondre un modèle Claude léger (Claude Haiku 5.5 par défaut, variable `AIDE_MODEL`) **uniquement à partir de la FAQ** `supabase/functions/aide/faq.ts`. Il n'a accès à aucun compte ni commande et oriente vers l'équipe pour un cas personnel. Limite : 20 questions / 10 min par adresse IP.
  ```
  supabase functions deploy aide
  ```
  (même clé `ANTHROPIC_API_KEY` que la modération ; facultatif : `supabase secrets set SUPPORT_EMAIL=...`)
- Sans Supabase (mode démo) ou si la fonction ne répond pas : réponses tirées de la FAQ intégrée au site (liste `AIDE_FAQ` dans `index.html`).
- Mettre à jour `faq.ts` **et** `AIDE_FAQ` quand une règle du site change. L'adresse affichée vient de `SUPPORT_EMAIL` dans `config.js`.

## Informations légales

Page `legal.html` (lien « Mentions légales » et « CGU » du pied de page) : mentions légales (éditeur, hébergeurs, propriété intellectuelle, données personnelles, cookies, signalement, médiation) et CGU (vente, achat, Protection Acheteur, Bookstery Drop, Espace auteur, charte, modération, responsabilité…).
Les passages surlignés en jaune `[à compléter]` doivent être remplis (société, SIRET, adresses, médiateur, prestataire de paiement, délais), puis le texte validé par un juriste avant l'ouverture des ventes.

## Pack Accélérateur Auteurs (abonnement Stripe)

Espace auteur, onglet « ⚡ Pack Accélérateur » : 15 €/mois, sans engagement. Sous le bouton « Activer le Pack Accélérateur (15€/mois) », mention : « Sans engagement – renouvellement mensuel automatique, annulable en 1 clic à tout moment depuis ton Espace Auteur ».

- Tant que l'abonnement Stripe est `active` (ou `trialing`) : `is_boosted = true` sur les textes de l'auteur (3× plus de chances dans les Mystery Drops de leur genre, tirage pondéré dans `valider-commande`) et accès aux statistiques de lecture (`stats_auteur()`).
- « Gérer / Arrêter mon abonnement » ouvre le portail client Stripe (arrêt du renouvellement à la fin du mois en cours, changement de carte).
- Le webhook Stripe tient le statut à jour ; un déclencheur SQL répercute `is_boosted` sur tous les textes de l'auteur.

Mise en place :
1. Stripe > Catalogue de produits : produit « Pack Accélérateur Auteurs », prix récurrent **15,00 € / mois** (TTC). Noter l'identifiant `price_...`.
2. Stripe > Paramètres > Portail client : autoriser l'annulation **à la fin de la période de facturation** et la mise à jour du moyen de paiement.
3. SQL : exécuter `supabase/accelerateur.sql`.
4. Secrets et déploiement :
   ```
   supabase secrets set STRIPE_SECRET_KEY=sk_live_... STRIPE_PRICE_ACCELERATEUR=price_... SITE_URL=https://ton-site.fr
   supabase functions deploy stripe-abonnement
   supabase functions deploy stripe-webhook --no-verify-jwt
   ```
5. Stripe > Développeurs > Webhooks : point de terminaison `https://<projet>.supabase.co/functions/v1/stripe-webhook`, événements `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted` ; puis `supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...`.
6. Redéployer `valider-commande` (tirage pondéré des textes prioritaires).

Sans Supabase (mode démo), l'activation et l'arrêt sont simulés dans le navigateur, avec des statistiques d'exemple.

## Distribution des textes (Mystery Drops)

1. **Dépôt** : l'auteur choisit le genre (liste des genres de fiction, vérifiée par le serveur). Le texte accepté est enregistré dans `extraits` avec ce genre et devient disponible tout de suite (statut `depose`), indexé par genre.
2. **Commande** : `valider-commande` appelle `tirer_manuscrits()` (`supabase/tirage.sql`) avec le genre du cadeau.
3. **Tirage** : genre demandé d'abord, puis sa famille, puis le genre de secours ; à l'intérieur de chaque groupe, **tirage aléatoire sur tous les textes disponibles** : même chance pour chaque texte (×3 pour le Pack Accélérateur). Jamais ses propres textes, jamais un texte déjà reçu, jamais un genre utilitaire.

## Œuvres du fondateur

Les textes déposés par le compte fondateur portent le badge « ★ Fondateur Bookstery » (liseuse, « Mes textes déposés »), sont tirés dans les Mystery Drops comme les autres (sans priorité) et sont non éligibles au Golden Book et aux prix des partenaires (CGU, article 8 ter ; vue `extraits_eligibles_prix`).
Mise en place : exécuter `supabase/fondateur.sql`, puis les deux requêtes `update` à la fin du fichier avec l'adresse e-mail du compte fondateur.

## Paiement des commandes (Stripe Connect)

Modèle Stripe « paiements et virements séparés » (le plus adapté à un panier multi-vendeurs payé à la réception) :

1. **Paiement** — `valider-commande` recalcule tout, réserve les livres 30 min et ouvre Stripe Checkout : une ligne par livre + une ligne séparée « Protection Acheteur Bookstery (5 % + 0,70 €) ». L'acheteur paie le total sur le compte Stripe de Bookstery.
2. **Confirmation** — webhook `checkout.session.completed` : commande payée, livres vendus, Mystery Drops tirés et cumul VIP (sur le montant des livres seul). Paiement abandonné/expiré : livres remis en vente.
3. **Vendeur** — « Mon espace › Mes ventes & paiements » : activation Stripe Express (identité + IBAN, `stripe-connect`), suivi des ventes, bouton « J'ai envoyé / remis le livre ».
4. **Réception** — « Mon espace › Mes commandes » : « J'ai bien reçu ce colis » → virement Stripe immédiat de **100 % du prix de ses livres** au vendeur (`suivi-commande`, `transfer_group` = commande, `source_transaction` = paiement). « Signaler un problème » bloque le virement.
5. **Automatique** — `liberer-paiements` (cron quotidien) vire les ventes envoyées depuis 14 jours sans problème signalé. Un vendeur sans compte Stripe actif est payé dès l'activation (webhook `account.updated`).
6. **Bookstery** garde la Protection Acheteur : c'est la différence entre le paiement et les virements (équivalent d'un `application_fee_amount`, compatible avec plusieurs vendeurs).

Mise en place :
1. Stripe > Connect : activer Connect (comptes **Express**, France), personnaliser le nom et le logo.
2. SQL : `supabase/connect.sql` (après `tirage.sql`, `vip.sql`).
3. Secrets : `supabase secrets set STRIPE_SECRET_KEY=sk_... SITE_URL=https://ton-site.fr CRON_SECRET=...` (facultatif `DELAI_CONFIRMATION_JOURS=14`).
4. Déployer :
   ```
   supabase functions deploy valider-commande
   supabase functions deploy stripe-connect
   supabase functions deploy suivi-commande
   supabase functions deploy stripe-webhook --no-verify-jwt
   supabase functions deploy liberer-paiements --no-verify-jwt
   ```
5. Webhook Stripe : ajouter les événements `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired` ; et un second point de terminaison (même URL) pour **les événements des comptes connectés** : `account.updated` (son secret : le même `STRIPE_WEBHOOK_SECRET` si un seul point de terminaison écoute les deux, sinon adapter).
6. Cron quotidien (Supabase > Integrations > Cron, `pg_net`) : `POST https://<projet>.supabase.co/functions/v1/liberer-paiements` avec l'en-tête `x-cron-secret`.
7. Tester en **mode test** Stripe (carte `4242 4242 4242 4242`) avant de passer en production.

## Contrôle qualité des manuscrits

1. **Longueur** : au moins 2 500 caractères et 1 000 mots (site + `deposer-extrait`).
2. **Note IA sur 10** : la modération (`moderation.ts`) note la qualité rédactionnelle (orthographe, syntaxe, narration). Sous **6/10**, refus poli (motif `qualite_insuffisante`) avec la note et un conseil personnalisé ; la note des textes acceptés est enregistrée (`note_qualite`).
3. **Archivage automatique** (`supabase/qualite.sql`) : dès qu'un texte a **au moins 10 lectures** et une **note moyenne < 2,5/5**, il passe en `archived` et n'est plus tiré dans les Mystery Drops (déclencheurs sur les avis et les lectures).

## Bookster Thème (saisons)

Un thème par semestre, défini à deux endroits identiques : `SAISONS` dans `index.html` et `supabase/functions/_shared/saisons.ts`.
Saison 1 (janvier – juin 2027) : « Spécial Nouvelles », format nouvelle courte complète ; Saison 2 (juillet – décembre 2027) : thème à définir.

- **Bannière** noir / bleu Majorelle / blanc sur l'accueil et dans l'Espace auteur, avec le compte à rebours jusqu'à l'ouverture de la saison suivante. Avant le 1er janvier 2027, la Saison 1 est en « avant-première » (dépôts déjà ouverts).
- **Dépôt verrouillé** sur le format de la saison : case obligatoire « Mon texte est une nouvelle courte complète… », et contrôle par l'IA (motif `hors_theme` si c'est un extrait ou un chapitre). Chaque texte est enregistré avec sa saison et son format.
- **Mystery Drops** : dès 10 €, quel que soit le type de livre, tirés en priorité parmi les nouvelles approuvées de la saison en cours (puis parmi les autres textes s'il n'y en a pas assez).
- Mise en place : exécuter `supabase/saisons.sql`, puis redéployer `deposer-extrait`, `valider-commande` et `stripe-webhook`.

## Boîte à Thèmes (prochaine saison)

Sur l'accueil (sous la bannière de la saison) et dans « Mon espace » :
- **Proposition rapide** : « Propose un thème ou un genre pour la Saison 2 » + bouton « Envoyer mon idée » (suggestions en un clic). Réservée aux membres connectés, **une proposition par membre et par saison** (clé primaire `(saison, membre_id)`, fonction `proposer_theme`). Les variantes d'écriture (« Polar », « polar », « Pölar ») comptent pour le même thème.
- **Tendances en direct** : top 3 des thèmes avec barres et compteurs de votes, mis à jour en temps réel (Supabase Realtime sur `themes_compteurs`) dès qu'un membre propose. En mode démo, des votes sont simulés.
- Mise en place : exécuter `supabase/themes.sql` (il active Realtime sur `themes_compteurs`).
