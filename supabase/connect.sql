-- Bookstery : paiement des commandes avec Stripe Connect (paiements et virements séparés)
-- À exécuter APRÈS annonces.sql et liseuse.sql, dans Supabase > SQL Editor.
--
-- 1. L'acheteur paie tout en une fois (livres + Protection Acheteur) sur le compte Stripe de Bookstery.
-- 2. À la confirmation de réception (ou automatiquement après le délai), Bookstery vire à chaque
--    vendeur EXACTEMENT le prix de ses livres (100 %, aucune commission vendeur).
-- 3. La Protection Acheteur (5 % + 0,70 €) reste à Bookstery : c'est sa seule rémunération.
-- 4. Les Mystery Drops et le cumul VIP sont attribués quand le paiement est confirmé, sur le montant des livres seul.

-- Comptes Stripe Connect des vendeurs (Express)
create table if not exists public.vendeurs_stripe (
  vendeur_id         uuid primary key references auth.users (id) on delete cascade,
  stripe_account_id  text unique not null,
  details_submitted  boolean not null default false,
  payouts_enabled    boolean not null default false,
  updated_at         timestamptz not null default now()
);
alter table public.vendeurs_stripe enable row level security;
drop policy if exists "vendeur voit son compte stripe" on public.vendeurs_stripe;
create policy "vendeur voit son compte stripe" on public.vendeurs_stripe
  for select to authenticated using (vendeur_id = (select auth.uid()));

-- Commande : suivi du paiement Stripe
alter table public.commandes add column if not exists genre_secours text;
alter table public.commandes add column if not exists stripe_session_id text unique;
alter table public.commandes add column if not exists stripe_payment_intent text;
alter table public.commandes add column if not exists stripe_charge_id text;
alter table public.commandes add column if not exists payee_at timestamptz;
alter table public.commandes alter column statut set default 'en_attente';

-- Une ligne par vendeur et par commande : ce que le vendeur doit recevoir (100 % de ses livres)
create table if not exists public.commande_vendeurs (
  commande_id         uuid not null references public.commandes (id) on delete cascade,
  vendeur_id          uuid not null references auth.users (id) on delete cascade,
  acheteur_id         uuid not null references auth.users (id) on delete cascade,
  annonce_ids         uuid[] not null,
  titres              text[] not null default '{}',
  montant             numeric(8, 2) not null check (montant > 0),   -- somme des prix de ses livres
  statut              text not null default 'en_attente_paiement'
                      check (statut in ('en_attente_paiement', 'a_expedier', 'expedie', 'recu', 'paye', 'litige', 'annule', 'rembourse')),
  expedie_at          timestamptz,
  recu_at             timestamptz,
  paye_at             timestamptz,
  stripe_transfer_id  text unique,
  created_at          timestamptz not null default now(),
  primary key (commande_id, vendeur_id)
);
create index if not exists commande_vendeurs_vendeur_idx on public.commande_vendeurs (vendeur_id, created_at desc);
create index if not exists commande_vendeurs_attente_idx on public.commande_vendeurs (statut) where statut in ('a_expedier', 'expedie', 'recu');

alter table public.commande_vendeurs enable row level security;
drop policy if exists "acheteur et vendeur voient la ligne" on public.commande_vendeurs;
create policy "acheteur et vendeur voient la ligne" on public.commande_vendeurs
  for select to authenticated using (acheteur_id = (select auth.uid()) or vendeur_id = (select auth.uid()));
-- Aucune écriture depuis le navigateur : tout passe par les fonctions Edge (clé service).
