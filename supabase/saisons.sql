-- Bookstery : Bookster Thème (un thème par semestre)
-- À exécuter APRÈS extraits.sql et tirage.sql, dans Supabase > SQL Editor.
--
-- Chaque texte déposé est rattaché à la saison en cours (ex. « 2027-S1 », Spécial Nouvelles)
-- et à son format (ex. « nouvelle »). Les Mystery Drops sont tirés d'abord parmi les textes
-- approuvés de la saison en cours ; s'il n'y en a pas assez, parmi les autres textes approuvés.

alter table public.extraits add column if not exists saison text;
alter table public.extraits add column if not exists format text;
create index if not exists extraits_saison_idx on public.extraits (saison, genre) where statut in ('depose', 'publie');

-- Tirage : saison en cours d'abord, puis genre demandé / famille / secours, puis hasard pondéré
create or replace function public.tirer_manuscrits(
  p_lecteur        uuid,
  p_genre          text,
  p_famille        text[],
  p_secours        text,
  p_genres_exclus  text[],
  p_nb             integer,
  p_saison         text default null
) returns table (id uuid, titre text, genre text)
language sql volatile security definer set search_path = public as $$
  select e.id, e.titre, e.genre
    from public.extraits e
   where e.statut in ('depose', 'publie')
     and e.auteur_id <> p_lecteur
     and not (e.genre = any (coalesce(p_genres_exclus, '{}')))
     and not exists (select 1 from public.booksterbooks b where b.lecteur_id = p_lecteur and b.extrait_id = e.id)
   order by
     case when p_saison is not null and e.saison = p_saison then 0 else 1 end,
     case when e.genre = p_genre then 0
          when e.genre = any (coalesce(p_famille, '{}')) then 1
          when e.genre = p_secours then 2
          else 3 end,
     -ln(1 - random()) / (case when e.is_boosted then 3 else 1 end)
   limit greatest(p_nb, 0);
$$;
revoke all on function public.tirer_manuscrits(uuid, text, text[], text, text[], integer, text) from public, anon, authenticated;
drop function if exists public.tirer_manuscrits(uuid, text, text[], text, text[], integer);
