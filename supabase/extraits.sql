-- Bookstery : extraits déposés par les auteurs indépendants
-- À exécuter une fois dans Supabase > SQL Editor > New query > Run.
--
-- Les dépôts passent UNIQUEMENT par la fonction Edge « deposer-extrait »
-- (analyse Pangram + empreinte + horodatage) : le navigateur ne peut ni
-- insérer ni modifier ces tables directement.

create table if not exists public.extraits (
  id          uuid primary key default gen_random_uuid(),
  auteur_id   uuid not null references auth.users (id) on delete cascade,
  titre       text not null check (char_length(titre) between 1 and 200),
  genre       text not null,
  texte       text not null,
  nb_mots     integer not null check (nb_mots between 1000 and 5000),
  sha256      text not null unique check (sha256 ~ '^[0-9a-f]{64}$'),   -- empreinte du texte déposé
  ai_score    numeric(5, 4) not null check (ai_score >= 0 and ai_score <= 0.5), -- part de texte IA selon Pangram
  statut      text not null default 'depose' check (statut in ('depose', 'publie', 'retire')),
  created_at  timestamptz not null default now()                         -- horodatage fixé par le serveur
);
create index if not exists extraits_auteur_idx on public.extraits (auteur_id, created_at desc);

-- Tentatives refusées (taux d'IA > 50 %) : gardées pour repérer les abus, sans le texte.
create table if not exists public.depots_refuses (
  id          uuid primary key default gen_random_uuid(),
  auteur_id   uuid not null references auth.users (id) on delete cascade,
  sha256      text not null,
  nb_mots     integer not null,
  ai_score    numeric(5, 4) not null,
  created_at  timestamptz not null default now()
);

alter table public.extraits enable row level security;
alter table public.depots_refuses enable row level security;

-- Chaque auteur lit ses propres extraits. Aucune politique d'écriture :
-- seule la fonction Edge (clé service_role) peut déposer.
drop policy if exists "auteur lit ses extraits" on public.extraits;
create policy "auteur lit ses extraits" on public.extraits
  for select to authenticated
  using (auteur_id = (select auth.uid()));

-- depots_refuses : aucune politique, donc invisible depuis le navigateur.
