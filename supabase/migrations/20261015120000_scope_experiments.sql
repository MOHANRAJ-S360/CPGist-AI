-- Experiments are written through the authenticated server API. Do not expose direct table access
-- while the legacy table is still RLS-disabled; a dedicated RLS policy migration remains a follow-up.
alter table public.cpgist_experiments
  add column if not exists created_by uuid null references auth.users(id) on delete set null;
create index if not exists cpgist_experiments_created_by_created_at_idx
  on public.cpgist_experiments(created_by, created_at desc);

revoke all on table public.cpgist_experiments from public, anon, authenticated;
