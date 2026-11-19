# Bookstery

Site Bookstery (page statique), repris depuis l'artefact Claude.

## Fichiers

- `index.html` — la page du site
- `config.js` — configuration Supabase (laisser vide pour le mode démo ; n'y mettre que la clé *anon/publishable*, jamais la clé `service_role`)
- `logo.png`, `mark.png` — logos
- `supabase/annonces.sql` — table des annonces de livres (à exécuter une fois dans Supabase > SQL Editor)
- `supabase/extraits.sql` — tables des extraits d'auteurs et des dépôts refusés
- `supabase/functions/deposer-extrait/` — fonction Edge : contrôle anti-IA, empreinte, horodatage

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
- Booksterbooks offerts **par vendeur** : dès 10 € → 1, dès 20 € → 2, dès 35 € → 3, avec barre de progression.
  Sous 10 € : « Plus que X € chez ce vendeur pour débloquer ton 1er Booksterbook ! » et des suggestions du même vendeur.
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
