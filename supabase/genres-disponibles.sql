-- Bookstery : genres pour lesquels des manuscrits mystères sont disponibles
-- À exécuter APRÈS extraits.sql, dans Supabase > SQL Editor.
--
-- Le Bag s'en sert pour le genre de secours du cadeau mystère :
--   1) texte du genre exact ; 2) sinon de la même famille (genre parent) ;
--   3) sinon le Bookster choisit parmi ses genres préférés.
-- La fonction ne renvoie que des comptes par genre, jamais le contenu des textes.

create or replace function public.genres_disponibles()
returns table (genre text, nb bigint)
language sql
stable
security definer
set search_path = public
as $$
  select e.genre, count(*) as nb
  from public.extraits e
  where e.statut in ('depose', 'publie')
  group by e.genre;
$$;

revoke all on function public.genres_disponibles() from public;
grant execute on function public.genres_disponibles() to anon, authenticated;
