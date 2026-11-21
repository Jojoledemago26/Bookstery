-- Bookstery : Boîte à Thèmes — la communauté vote pour le genre de la prochaine saison
-- (genres littéraires du site uniquement, les genres utilitaires sont exclus)
-- À exécuter dans Supabase > SQL Editor.
--
-- • Une seule proposition par membre et par saison (table propositions_themes, privée).
-- • Des compteurs publics par thème (table themes_compteurs), mis à jour par déclencheur
--   et diffusés en temps réel (Supabase Realtime) pour le graphe « Tendances en direct ».

create table if not exists public.propositions_themes (
  saison      text not null,
  membre_id   uuid not null references auth.users (id) on delete cascade,
  cle         text not null,                                   -- thème normalisé (minuscules, sans accents)
  libelle     text not null check (char_length(libelle) between 2 and 40),
  created_at  timestamptz not null default now(),
  primary key (saison, membre_id)                              -- 1 proposition par membre et par saison
);

create table if not exists public.themes_compteurs (
  saison   text not null,
  cle      text not null,
  libelle  text not null,
  votes    integer not null default 0,
  primary key (saison, cle)
);

alter table public.propositions_themes enable row level security;
alter table public.themes_compteurs enable row level security;

-- Chaque membre voit uniquement sa propre proposition
drop policy if exists "membre voit sa proposition" on public.propositions_themes;
create policy "membre voit sa proposition" on public.propositions_themes
  for select to authenticated using (membre_id = (select auth.uid()));
-- Les compteurs sont publics (lecture seule)
drop policy if exists "compteurs publics" on public.themes_compteurs;
create policy "compteurs publics" on public.themes_compteurs for select to anon, authenticated using (true);

-- Normalisation : « Polar », « polar », « POLAR » et « Pölar » comptent pour le même thème
create or replace function public.cle_theme(t text) returns text language sql immutable as $$
  select regexp_replace(lower(translate(trim(t),
    'àâäáãåçéèêëíìîïñóòôöõúùûüýÿœæÀÂÄÁÃÅÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝŒÆ',
    'aaaaaaceeeeiiiinooooouuuuyyoaaaaaaaceeeeiiiinooooouuuuyoa')), '[^a-z0-9]+', ' ', 'g');
$$;

-- Envoi d'une proposition (appelé par le site) : contrôle, normalisation, 1 par membre
create or replace function public.proposer_theme(p_saison text, p_theme text)
returns table (cle text, libelle text)
language plpgsql security definer set search_path = public as $$
declare
  v_lib text := regexp_replace(trim(coalesce(p_theme, '')), '\s+', ' ', 'g');
  v_cle text;
begin
  if auth.uid() is null then raise exception 'connexion_requise'; end if;
  if char_length(v_lib) < 2 or char_length(v_lib) > 40 or v_lib !~ '^[[:alpha:]0-9][[:alpha:]0-9 &''’,.-]*$' then
    raise exception 'theme_invalide';
  end if;
  v_lib := upper(left(v_lib, 1)) || substr(v_lib, 2);
  -- Vote limité aux genres littéraires du site (les genres utilitaires sont exclus)
  if v_lib <> all (array['Aventure','BD','Classiques','Comics','Contes & Légendes','Fantastique','Fantasy','Feel-good','Horreur','Humour','Jeunesse','Manga','Nouvelles','Poésie','Polar','Roman historique','Romance','Romans','Science-fiction','Théâtre','Thriller','Young Adult']) then
    raise exception 'theme_invalide';
  end if;
  v_cle := public.cle_theme(v_lib);
  insert into public.propositions_themes (saison, membre_id, cle, libelle) values (p_saison, auth.uid(), v_cle, v_lib);
  return query select v_cle, v_lib;
exception when unique_violation then
  raise exception 'deja_propose';
end $$;
revoke all on function public.proposer_theme(text, text) from public, anon;
grant execute on function public.proposer_theme(text, text) to authenticated;

-- Compteurs tenus à jour automatiquement
create or replace function public.compter_theme() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.themes_compteurs (saison, cle, libelle, votes) values (new.saison, new.cle, new.libelle, 1)
    on conflict (saison, cle) do update set votes = public.themes_compteurs.votes + 1;
  elsif tg_op = 'DELETE' then
    update public.themes_compteurs set votes = greatest(votes - 1, 0) where saison = old.saison and cle = old.cle;
  end if;
  return null;
end $$;
drop trigger if exists propositions_compteur on public.propositions_themes;
create trigger propositions_compteur after insert or delete on public.propositions_themes
  for each row execute function public.compter_theme();

-- Diffusion en temps réel des compteurs
do $$ begin
  alter publication supabase_realtime add table public.themes_compteurs;
exception when duplicate_object then null; end $$;
