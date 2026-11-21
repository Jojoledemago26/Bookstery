-- Bookstery : contrôle qualité des manuscrits mystères
-- À exécuter APRÈS extraits.sql, liseuse.sql et moderation.sql, dans Supabase > SQL Editor.
--
-- 1) Au dépôt : au moins 2 500 caractères et 1 000 mots (fonction deposer-extrait).
-- 2) Au dépôt : l'IA note la qualité rédactionnelle sur 10 (orthographe, syntaxe, narration) ;
--    sous 6/10, le texte est refusé poliment. La note est conservée ici.
-- 3) Après distribution : si un texte a été lu au moins 10 fois et que sa note moyenne
--    (avis des lecteurs, sur 5) est inférieure à 2,5, il passe automatiquement en « archived »
--    et n'est plus distribué dans les Mystery Drops. Les lecteurs qui l'ont déjà reçu le gardent.

alter table public.extraits add column if not exists note_qualite smallint check (note_qualite between 0 and 10);
alter table public.depots_refuses add column if not exists note_qualite smallint;

-- Nouveau statut « archived » (le tirage ne prend que « depose » et « publie »)
alter table public.extraits drop constraint if exists extraits_statut_check;
alter table public.extraits add constraint extraits_statut_check
  check (statut in ('depose', 'publie', 'retire', 'archived'));
alter table public.extraits add column if not exists archived_at timestamptz;

create or replace function public.verifier_qualite_texte(p_extrait uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_lectures bigint;
  v_moyenne  numeric;
begin
  select count(*) into v_lectures from public.booksterbooks
   where extrait_id = p_extrait and lu_at is not null;
  if v_lectures < 10 then return; end if;

  select avg(note) into v_moyenne from public.avis where extrait_id = p_extrait;
  if v_moyenne is not null and v_moyenne < 2.5 then
    update public.extraits set statut = 'archived', archived_at = now()
     where id = p_extrait and statut in ('depose', 'publie');
  end if;
end $$;

-- Vérification à chaque nouvel avis et à chaque nouvelle lecture
create or replace function public.declencher_qualite_avis() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform public.verifier_qualite_texte(new.extrait_id); return new; end $$;
drop trigger if exists avis_qualite on public.avis;
create trigger avis_qualite after insert or update of note on public.avis
  for each row execute function public.declencher_qualite_avis();

create or replace function public.declencher_qualite_lecture() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.lu_at is not null and old.lu_at is null then perform public.verifier_qualite_texte(new.extrait_id); end if;
  return new;
end $$;
drop trigger if exists booksterbooks_qualite on public.booksterbooks;
create trigger booksterbooks_qualite after update of lu_at on public.booksterbooks
  for each row execute function public.declencher_qualite_lecture();

-- Rattrapage des textes déjà en circulation
select public.verifier_qualite_texte(id) from public.extraits where statut in ('depose', 'publie');
