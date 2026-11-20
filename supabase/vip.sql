-- Bookstery : statut Bookster VIP (fidélité)
-- Cumul des livres achetés au fil de toutes les commandes ; à 50 € → is_vip_jury = true
-- (badge doré sur le profil, vote pour le prochain Golden Book).
-- À exécuter dans Supabase > SQL Editor (la table profiles doit exister).

alter table public.profiles add column if not exists total_spent_books numeric(10, 2) not null default 0;
alter table public.profiles add column if not exists is_vip_jury boolean not null default false;

-- Ajout atomique d'un montant d'achat, appelé uniquement par la fonction valider-commande (clé service)
create or replace function public.ajouter_achats_livres(p_user uuid, p_montant numeric)
returns table (total_spent_books numeric, is_vip_jury boolean)
language sql
security definer
set search_path = public
as $$
  update public.profiles p
     set total_spent_books = p.total_spent_books + greatest(p_montant, 0),
         is_vip_jury = p.is_vip_jury or (p.total_spent_books + greatest(p_montant, 0) >= 50)
   where p.id = p_user
  returning p.total_spent_books, p.is_vip_jury;
$$;
revoke all on function public.ajouter_achats_livres(uuid, numeric) from public, anon, authenticated;

-- Un membre ne peut pas modifier lui-même son cumul ni son statut VIP
create or replace function public.proteger_statut_vip() returns trigger
language plpgsql as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    if tg_op = 'INSERT' then
      new.total_spent_books := 0;
      new.is_vip_jury := false;
    else
      new.total_spent_books := old.total_spent_books;
      new.is_vip_jury := old.is_vip_jury;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists profiles_statut_vip on public.profiles;
create trigger profiles_statut_vip before insert or update on public.profiles
  for each row execute function public.proteger_statut_vip();
