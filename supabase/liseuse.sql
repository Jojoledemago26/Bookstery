-- Bookstery : commandes, Booksterbooks (cadeaux mystère), avis et abonnements aux auteurs
-- À exécuter APRÈS annonces.sql et extraits.sql, dans Supabase > SQL Editor.

-- Nom d'auteur affiché dans la liseuse (renseigné par la fonction deposer-extrait)
alter table public.extraits add column if not exists auteur_nom text;

create table if not exists public.commandes (
  id              uuid primary key default gen_random_uuid(),
  acheteur_id     uuid not null references auth.users (id) on delete cascade,
  annonce_ids     uuid[] not null,
  montant_livres  numeric(8, 2) not null,
  protection      numeric(8, 2) not null,     -- Protection Acheteur : 5 % + 0,70 €
  total           numeric(8, 2) not null,
  genre_cadeau    text,
  nb_booksterbooks integer not null default 0,
  statut          text not null default 'payee' check (statut in ('en_attente', 'payee', 'annulee')),
  created_at      timestamptz not null default now()
);

-- Un Booksterbook = un extrait offert à un lecteur. Le jeton sert au lien et au QR code de la liseuse.
create table if not exists public.booksterbooks (
  id          uuid primary key default gen_random_uuid(),
  token       uuid not null unique default gen_random_uuid(),
  commande_id uuid references public.commandes (id) on delete set null,
  lecteur_id  uuid not null references auth.users (id) on delete cascade,
  extrait_id  uuid not null references public.extraits (id) on delete cascade,
  lu_at       timestamptz,
  created_at  timestamptz not null default now(),
  unique (lecteur_id, extrait_id)
);
create index if not exists booksterbooks_lecteur_idx on public.booksterbooks (lecteur_id, created_at desc);

create table if not exists public.avis (
  id              uuid primary key default gen_random_uuid(),
  booksterbook_id uuid not null unique references public.booksterbooks (id) on delete cascade,
  extrait_id      uuid not null references public.extraits (id) on delete cascade,
  auteur_id       uuid not null references auth.users (id) on delete cascade,
  lecteur_id      uuid not null references auth.users (id) on delete cascade,
  note            smallint not null check (note between 1 and 5),
  commentaire     text check (char_length(commentaire) <= 2000),
  created_at      timestamptz not null default now()
);

create table if not exists public.abonnements (
  lecteur_id  uuid not null references auth.users (id) on delete cascade,
  auteur_id   uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (lecteur_id, auteur_id),
  check (lecteur_id <> auteur_id)
);

alter table public.commandes     enable row level security;
alter table public.booksterbooks enable row level security;
alter table public.avis          enable row level security;
alter table public.abonnements   enable row level security;

-- Commandes : chacun voit les siennes (création par la fonction valider-commande uniquement)
drop policy if exists "acheteur voit ses commandes" on public.commandes;
create policy "acheteur voit ses commandes" on public.commandes
  for select to authenticated using (acheteur_id = (select auth.uid()));

-- Booksterbooks : le lecteur voit les siens et peut seulement marquer « lu »
drop policy if exists "lecteur voit ses booksterbooks" on public.booksterbooks;
create policy "lecteur voit ses booksterbooks" on public.booksterbooks
  for select to authenticated using (lecteur_id = (select auth.uid()));
drop policy if exists "lecteur marque lu" on public.booksterbooks;
create policy "lecteur marque lu" on public.booksterbooks
  for update to authenticated using (lecteur_id = (select auth.uid())) with check (lecteur_id = (select auth.uid()));
revoke update on public.booksterbooks from authenticated;
grant update (lu_at) on public.booksterbooks to authenticated;

-- Extraits : un lecteur peut lire les extraits qui lui ont été offerts
drop policy if exists "lecteur lit ses extraits offerts" on public.extraits;
create policy "lecteur lit ses extraits offerts" on public.extraits
  for select to authenticated using (
    exists (select 1 from public.booksterbooks b where b.extrait_id = extraits.id and b.lecteur_id = (select auth.uid()))
  );

-- Avis : le lecteur voit les siens, l'auteur voit ceux reçus (écriture par la fonction envoyer-avis)
drop policy if exists "avis visibles" on public.avis;
create policy "avis visibles" on public.avis
  for select to authenticated using (lecteur_id = (select auth.uid()) or auteur_id = (select auth.uid()));

-- Abonnements : chacun gère ceux qu'il suit ; l'auteur voit ses abonnés
drop policy if exists "abonnements visibles" on public.abonnements;
create policy "abonnements visibles" on public.abonnements
  for select to authenticated using (lecteur_id = (select auth.uid()) or auteur_id = (select auth.uid()));
drop policy if exists "suivre un auteur" on public.abonnements;
create policy "suivre un auteur" on public.abonnements
  for insert to authenticated with check (lecteur_id = (select auth.uid()));
drop policy if exists "ne plus suivre" on public.abonnements;
create policy "ne plus suivre" on public.abonnements
  for delete to authenticated using (lecteur_id = (select auth.uid()));
