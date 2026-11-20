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
- `supabase/localisation.sql` — ville et région des annonces (filtre de localisation)
- `supabase/moderation.sql` — journal des refus de modération
- `supabase/signalements.sql` — signalements des lecteurs + retrait automatique
- `supabase/functions/deposer-extrait/moderation.ts` — modération stricte par Claude Haiku 5.5
- `supabase/functions/valider-commande/` — commande + tirage des manuscrits mystères (jetons des QR codes)
- `supabase/functions/envoyer-avis/` — avis du lecteur envoyé par e-mail à l'auteur (Resend)

## Lancer en local

Ouvrir `index.html` dans un navigateur, ou servir le dossier :

```bash
python3 -m http.server 8000
```

## Vendre un livre

Bouton « Vendre un livre » (en-tête) ou étape 1 de « Comment ça marche » :

1. Saisie ou scan de l'ISBN (caméra en direct, ou photo du code-barres).
2. Recherche automatique sur Google Books (Open Library en secours) : titre, auteur, résumé, couverture, genre.
3. Le vendeur choisit l'état (Comme neuf, Très bon état, Bon état) et son prix.
4. L'annonce est enregistrée dans la table `annonces` de Supabase (vendeur connecté requis).

## Bookster Bag (panier)

- Catalogue « Les derniers livres en vente » : annonces Supabase (exemples lyonnais en mode démo), filtrées par la recherche et les genres.
- Protection Acheteur ajoutée automatiquement : 5 % du montant des livres + 0,70 €.
- Manuscrits mystères offerts **par vendeur** (jauge du Bookstery Drop) : dès 10 € → 1, dès 20 € → 2, dès 35 € → 3, avec barre de progression.
  Sous 10 € : « Plus que X € chez ce vendeur pour débloquer ton 1er manuscrit mystère ! » et des suggestions du même vendeur.
- Si le Bag mélange plusieurs genres, l'acheteur choisit le genre de son cadeau mystère avant de payer.
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
2. **texte pas en français** ;
3. **texte non littéraire** : recette, spam, liste, article, texte incohérent ;
4. **texte illisible** ou bourré de fautes graves.

L'auteur reçoit un message bienveillant (et un conseil personnalisé pour une relecture). Le texte reste dans le formulaire. Si la vérification est indisponible, rien n'est déposé. Ordre des contrôles : modération → détecteur d'IA → empreinte et horodatage.

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy deposer-extrait
```

En mode démo, une simulation simplifiée (langue, recette ou liste, écriture SMS) montre les messages de refus ; le contrôle des contenus interdits n'existe que côté serveur.

## Signaler un texte

Dans la liseuse : bouton **Signaler** (barre du haut) et lien « Signaler ce texte » en fin de lecture. Le lecteur doit choisir une raison (haine ou discrimination, violence gratuite, contenu sexuel explicite, contenu illégal ou dangereux, plagiat, texte généré par IA, illisible ou hors sujet, autre — précision obligatoire pour « autre »). Un seul signalement par lecteur et par texte, anonyme pour l'auteur. À partir de 3 signalements graves de lecteurs différents, le texte n'est plus offert en attendant la vérification de l'équipe.
