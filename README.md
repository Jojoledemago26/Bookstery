# Bookstery

Site Bookstery (page statique), repris depuis l'artefact Claude.

## Fichiers

- `index.html` — la page du site
- `config.js` — configuration Supabase (laisser vide pour le mode démo ; n'y mettre que la clé *anon/publishable*, jamais la clé `service_role`)
- `logo.png`, `mark.png` — logos
- `supabase/annonces.sql` — table des annonces de livres (à exécuter une fois dans Supabase > SQL Editor)

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
