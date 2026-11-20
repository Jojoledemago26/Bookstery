-- Bookstery : badge « Mécène Bookster » (50 € d'achats chez un même vendeur dans une commande)
-- Attribué par la fonction valider-commande. À exécuter dans Supabase > SQL Editor.
alter table public.profiles add column if not exists badge_mecene boolean not null default false;
