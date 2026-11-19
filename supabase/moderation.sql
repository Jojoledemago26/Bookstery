-- Bookstery : journal des refus de modération (à exécuter après extraits.sql)

alter table public.depots_refuses alter column ai_score drop not null;
alter table public.depots_refuses add column if not exists motif text;
alter table public.depots_refuses add column if not exists categories text[] not null default '{}';
create index if not exists depots_refuses_auteur_idx on public.depots_refuses (auteur_id, created_at desc);
