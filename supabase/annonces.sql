-- Bookstery : table des annonces de livres à vendre
-- À exécuter une fois dans Supabase > SQL Editor > New query > Run.

create table if not exists public.annonces (
  id             uuid primary key default gen_random_uuid(),
  vendeur_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  isbn           text check (isbn ~ '^97[89][0-9]{10}$'),           -- ISBN-13 (les ISBN-10 sont convertis par le site)
  titre          text not null check (char_length(titre) between 1 and 300),
  auteur         text check (char_length(auteur) <= 300),
  resume         text check (char_length(resume) <= 5000),
  couverture_url text check (couverture_url ~ '^https://'),
  genre          text not null,
  etat           text not null check (etat in ('comme_neuf', 'tres_bon', 'bon')),
  prix           numeric(6, 2) not null check (prix >= 0.50 and prix <= 999),
  statut         text not null default 'en_vente' check (statut in ('en_vente', 'reserve', 'vendu', 'retire')),
  created_at     timestamptz not null default now()
);

create index if not exists annonces_vendeur_idx on public.annonces (vendeur_id);
create index if not exists annonces_isbn_idx    on public.annonces (isbn);
create index if not exists annonces_genre_idx   on public.annonces (genre) where statut = 'en_vente';

-- Sécurité (RLS) : tout le monde voit les annonces en vente,
-- chaque vendeur ne crée, modifie et supprime que les siennes.
alter table public.annonces enable row level security;

drop policy if exists "annonces visibles" on public.annonces;
create policy "annonces visibles" on public.annonces
  for select to anon, authenticated
  using (statut = 'en_vente' or vendeur_id = (select auth.uid()));

drop policy if exists "vendeur cree ses annonces" on public.annonces;
create policy "vendeur cree ses annonces" on public.annonces
  for insert to authenticated
  with check (vendeur_id = (select auth.uid()));

drop policy if exists "vendeur modifie ses annonces" on public.annonces;
create policy "vendeur modifie ses annonces" on public.annonces
  for update to authenticated
  using (vendeur_id = (select auth.uid()))
  with check (vendeur_id = (select auth.uid()));

drop policy if exists "vendeur supprime ses annonces" on public.annonces;
create policy "vendeur supprime ses annonces" on public.annonces
  for delete to authenticated
  using (vendeur_id = (select auth.uid()));
