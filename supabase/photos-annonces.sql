-- Bookstery : photos réelles des exemplaires mis en vente (recto / verso), obligatoires
-- À exécuter APRÈS annonces.sql, dans Supabase > SQL Editor.
--
-- Contre les fausses annonces : chaque nouvelle annonce doit avoir deux photos
-- prises par le vendeur (recto et verso). Le site les réduit à 1600 px en JPEG
-- (ce qui retire aussi les métadonnées GPS) avant l'envoi.

-- 1) Colonnes sur les annonces
alter table public.annonces add column if not exists photo_recto_url text check (photo_recto_url ~ '^https://');
alter table public.annonces add column if not exists photo_verso_url text check (photo_verso_url ~ '^https://');

-- Obligatoires pour toute nouvelle annonce (NOT VALID : les anciennes annonces sans photo restent valides)
alter table public.annonces drop constraint if exists photos_obligatoires;
alter table public.annonces add constraint photos_obligatoires
  check (photo_recto_url is not null and photo_verso_url is not null and photo_recto_url <> photo_verso_url) not valid;

-- 2) Espace de stockage public pour les photos (5 Mo max, images uniquement)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos-annonces', 'photos-annonces', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Chaque vendeur n'écrit que dans son propre dossier : photos-annonces/<son id>/...
drop policy if exists "vendeur envoie ses photos" on storage.objects;
create policy "vendeur envoie ses photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos-annonces' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "vendeur supprime ses photos" on storage.objects;
create policy "vendeur supprime ses photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos-annonces' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Les photos doivent venir de ce stockage (pas d'une image copiée sur internet)
create or replace function public.verifie_photos_annonce() returns trigger
language plpgsql as $$
begin
  if new.photo_recto_url is not null and position('/storage/v1/object/public/photos-annonces/' || new.vendeur_id::text || '/' in new.photo_recto_url) = 0 then
    raise exception 'photo_recto_url : la photo doit être envoyée depuis Bookstery';
  end if;
  if new.photo_verso_url is not null and position('/storage/v1/object/public/photos-annonces/' || new.vendeur_id::text || '/' in new.photo_verso_url) = 0 then
    raise exception 'photo_verso_url : la photo doit être envoyée depuis Bookstery';
  end if;
  return new;
end $$;

drop trigger if exists annonces_photos on public.annonces;
create trigger annonces_photos before insert or update of photo_recto_url, photo_verso_url on public.annonces
  for each row execute function public.verifie_photos_annonce();
