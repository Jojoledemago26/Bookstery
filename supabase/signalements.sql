-- Bookstery : signalements de textes par les lecteurs
-- À exécuter après liseuse.sql, dans Supabase > SQL Editor.

create table if not exists public.signalements (
  id          uuid primary key default gen_random_uuid(),
  extrait_id  uuid not null references public.extraits (id) on delete cascade,
  lecteur_id  uuid not null references auth.users (id) on delete cascade,
  raison      text not null check (raison in ('haine', 'violence', 'sexuel', 'illegal', 'plagiat', 'ia', 'qualite', 'autre')),
  commentaire text check (char_length(commentaire) <= 1000),
  statut      text not null default 'a_traiter' check (statut in ('a_traiter', 'fonde', 'rejete')),
  created_at  timestamptz not null default now(),
  unique (extrait_id, lecteur_id),                                   -- un signalement par lecteur et par texte
  check (raison <> 'autre' or char_length(coalesce(commentaire, '')) >= 5)
);
create index if not exists signalements_extrait_idx on public.signalements (extrait_id) where statut = 'a_traiter';

alter table public.signalements enable row level security;

-- Un lecteur ne peut signaler que les textes qu'il a reçus, et ne voit que ses propres signalements.
-- L'auteur ne voit pas qui l'a signalé.
drop policy if exists "lecteur signale un texte recu" on public.signalements;
create policy "lecteur signale un texte recu" on public.signalements
  for insert to authenticated with check (
    lecteur_id = (select auth.uid())
    and exists (select 1 from public.booksterbooks b where b.extrait_id = signalements.extrait_id and b.lecteur_id = (select auth.uid()))
  );
drop policy if exists "lecteur voit ses signalements" on public.signalements;
create policy "lecteur voit ses signalements" on public.signalements
  for select to authenticated using (lecteur_id = (select auth.uid()));

-- Retrait automatique et prudent : à partir de 3 signalements de lecteurs différents
-- pour haine, violence, contenu sexuel ou illégal, le texte n'est plus offert
-- (statut « retire ») en attendant la vérification par l'équipe.
create or replace function public.retrait_si_signalements() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.signalements s
      where s.extrait_id = new.extrait_id and s.statut = 'a_traiter'
        and s.raison in ('haine', 'violence', 'sexuel', 'illegal')) >= 3 then
    update public.extraits set statut = 'retire' where id = new.extrait_id and statut <> 'retire';
  end if;
  return new;
end $$;

drop trigger if exists signalements_retrait on public.signalements;
create trigger signalements_retrait after insert on public.signalements
  for each row execute function public.retrait_si_signalements();
