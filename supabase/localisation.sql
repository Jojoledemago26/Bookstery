-- Bookstery : localisation des annonces (filtre Lyon / ma ville / ma région / toute la France)
-- À exécuter une fois dans Supabase > SQL Editor, après annonces.sql.

alter table public.annonces add column if not exists ville  text check (char_length(ville) <= 120);
alter table public.annonces add column if not exists region text check (char_length(region) <= 60);

create index if not exists annonces_region_idx on public.annonces (region) where statut = 'en_vente';
create index if not exists annonces_ville_idx  on public.annonces (lower(ville)) where statut = 'en_vente';
