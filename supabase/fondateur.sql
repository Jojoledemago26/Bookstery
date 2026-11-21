-- Bookstery : badge « Fondateur Bookstery » sur les œuvres du fondateur
-- À exécuter APRÈS extraits.sql, dans Supabase > SQL Editor.
--
-- Les textes déposés par le compte fondateur portent le badge « Fondateur Bookstery »,
-- sont distribués dans les Mystery Drops comme les autres (sans priorité),
-- mais sont NON ÉLIGIBLES au Golden Bookster et à tout prix ou sélection de Bookstery
-- et de ses librairies partenaires (voir CGU, article 8 ter).

alter table public.profiles add column if not exists is_fondateur boolean not null default false;
alter table public.extraits add column if not exists est_fondateur boolean not null default false;

-- Le badge est posé automatiquement sur chaque texte déposé par un compte fondateur
create or replace function public.marquer_texte_fondateur() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.est_fondateur := coalesce((select p.is_fondateur from public.profiles p where p.id = new.auteur_id), false);
  return new;
end $$;
drop trigger if exists extraits_fondateur on public.extraits;
create trigger extraits_fondateur before insert on public.extraits
  for each row execute function public.marquer_texte_fondateur();

-- Personne ne peut se déclarer fondateur depuis le site
create or replace function public.proteger_fondateur() returns trigger
language plpgsql as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    new.is_fondateur := case when tg_op = 'INSERT' then false else old.is_fondateur end;
  end if;
  return new;
end $$;
drop trigger if exists profiles_fondateur on public.profiles;
create trigger profiles_fondateur before insert or update on public.profiles
  for each row execute function public.proteger_fondateur();

-- Vue des textes éligibles au Golden Bookster et aux prix des librairies partenaires
create or replace view public.extraits_eligibles_prix as
  select * from public.extraits where statut <> 'retire' and not est_fondateur;

-- ─── À faire une fois, avec TON adresse e-mail de compte Bookstery ───
-- update public.profiles set is_fondateur = true
--  where id = (select id from auth.users where email = 'ton-adresse@exemple.fr');
-- update public.extraits set est_fondateur = true
--  where auteur_id = (select id from auth.users where email = 'ton-adresse@exemple.fr');
