-- Bookstery : tirage des Mystery Drops, équitable et classé par genre
-- À exécuter APRÈS extraits.sql et liseuse.sql (et accelerateur.sql si utilisé), dans Supabase > SQL Editor.
--
-- Chaque texte accepté est enregistré dans public.extraits avec le genre choisi par l'auteur.
-- À chaque commande, la fonction valider-commande appelle tirer_manuscrits() :
--   • on cherche d'abord dans le genre du cadeau, puis dans sa famille, puis dans le genre de secours ;
--   • DANS chaque groupe, le tirage est vraiment aléatoire sur TOUS les textes disponibles
--     (aucune limite, aucun ordre de dépôt) : chaque texte a exactement la même chance,
--     sauf les textes du Pack Accélérateur, qui ont 3 fois plus de chances ;
--   • jamais un texte de l'acheteur lui-même, ni un texte qu'il a déjà reçu, ni un genre utilitaire.

alter table public.extraits add column if not exists is_boosted boolean not null default false;

-- Classement par genre : accès direct aux textes disponibles d'un genre
create index if not exists extraits_genre_dispo_idx on public.extraits (genre) where statut in ('depose', 'publie');

create or replace function public.tirer_manuscrits(
  p_lecteur        uuid,
  p_genre          text,
  p_famille        text[],
  p_secours        text,
  p_genres_exclus  text[],
  p_nb             integer
) returns table (id uuid, titre text, genre text)
language sql volatile security definer set search_path = public as $$
  select e.id, e.titre, e.genre
    from public.extraits e
   where e.statut in ('depose', 'publie')
     and e.auteur_id <> p_lecteur
     and not (e.genre = any (coalesce(p_genres_exclus, '{}')))
     and not exists (select 1 from public.booksterbooks b where b.lecteur_id = p_lecteur and b.extrait_id = e.id)
   order by
     -- 1) priorité au genre demandé, puis à sa famille, puis au genre de secours
     case when e.genre = p_genre then 0
          when e.genre = any (coalesce(p_famille, '{}')) then 1
          when e.genre = p_secours then 2
          else 3 end,
     -- 2) tirage aléatoire pondéré (méthode d'Efraimidis–Spirakis) : poids 1 pour tous, 3 avec le Pack Accélérateur
     -ln(1 - random()) / (case when e.is_boosted then 3 else 1 end)
   limit greatest(p_nb, 0);
$$;
revoke all on function public.tirer_manuscrits(uuid, text, text[], text, text[], integer) from public, anon, authenticated;
