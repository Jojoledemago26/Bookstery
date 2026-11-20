-- Bookstery : statut du vendeur (particulier / professionnel), affiché sur chaque annonce
-- Obligation d'information des places de marché (art. L. 111-7 du Code de la consommation).
-- À exécuter APRÈS annonces.sql, dans Supabase > SQL Editor.
alter table public.annonces add column if not exists vendeur_pro boolean not null default false;
