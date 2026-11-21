-- Bookstery : Pack Accélérateur Auteurs (abonnement Stripe à 15 €/mois, sans engagement)
-- À exécuter APRÈS extraits.sql et liseuse.sql, dans Supabase > SQL Editor.
--
-- Tant que l'abonnement Stripe est actif (statut « active » ou « trialing ») :
--   • les textes de l'auteur ont is_boosted = true → 3× plus de chances d'être tirés
--     dans les Mystery Drops de leur genre (fonction valider-commande) ;
--   • l'auteur accède à ses statistiques de lecture (fonction stats_auteur).
-- Le statut est tenu à jour par le webhook Stripe (fonction stripe-webhook).

alter table public.extraits add column if not exists is_boosted boolean not null default false;

create table if not exists public.abonnements_auteurs (
  auteur_id              uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id     text unique,
  stripe_subscription_id text unique,
  statut                 text not null default 'aucun',   -- statut Stripe : active, trialing, past_due, canceled…
  current_period_end     timestamptz,                     -- fin de la période payée en cours
  cancel_at_period_end   boolean not null default false,  -- résiliation programmée à la fin du mois
  updated_at             timestamptz not null default now()
);

alter table public.abonnements_auteurs enable row level security;
drop policy if exists "auteur voit son abonnement" on public.abonnements_auteurs;
create policy "auteur voit son abonnement" on public.abonnements_auteurs
  for select to authenticated using (auteur_id = (select auth.uid()));
-- Aucune écriture depuis le navigateur : seules les fonctions Edge (clé service) écrivent.

create or replace function public.accelerateur_actif(p_auteur uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.abonnements_auteurs a
                 where a.auteur_id = p_auteur and a.statut in ('active', 'trialing'));
$$;

-- Répercute le statut de l'abonnement sur tous les textes de l'auteur
create or replace function public.sync_boost() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.extraits set is_boosted = public.accelerateur_actif(new.auteur_id)
   where auteur_id = new.auteur_id;
  return new;
end $$;
drop trigger if exists abonnements_sync_boost on public.abonnements_auteurs;
create trigger abonnements_sync_boost after insert or update on public.abonnements_auteurs
  for each row execute function public.sync_boost();

-- Un texte déposé pendant l'abonnement est prioritaire tout de suite
create or replace function public.boost_nouveau_texte() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.is_boosted := public.accelerateur_actif(new.auteur_id);
  return new;
end $$;
drop trigger if exists extraits_boost on public.extraits;
create trigger extraits_boost before insert on public.extraits
  for each row execute function public.boost_nouveau_texte();

-- Statistiques de lecture, réservées aux abonnés actifs
create or replace function public.stats_auteur()
returns table (extrait_id uuid, titre text, genre text, is_boosted boolean,
               envois bigint, lectures bigint, avis bigint, note_moyenne numeric, abonnes bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.accelerateur_actif(auth.uid()) then
    raise exception 'pack_inactif';
  end if;
  return query
    select e.id, e.titre, e.genre, e.is_boosted,
           (select count(*) from public.booksterbooks b where b.extrait_id = e.id),
           (select count(*) from public.booksterbooks b where b.extrait_id = e.id and b.lu_at is not null),
           (select count(*) from public.avis v where v.extrait_id = e.id),
           (select round(avg(v.note)::numeric, 1) from public.avis v where v.extrait_id = e.id),
           (select count(*) from public.abonnements s where s.auteur_id = auth.uid())
      from public.extraits e
     where e.auteur_id = auth.uid() and e.statut <> 'retire'
     order by e.created_at desc;
end $$;
revoke all on function public.stats_auteur() from public, anon;
grant execute on function public.stats_auteur() to authenticated;
