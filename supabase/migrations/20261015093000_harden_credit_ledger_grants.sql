-- Remove default PUBLIC/anon grants from private credit data. RLS remains defense in depth.
revoke all on table public.cpgist_credit_accounts from public, anon, authenticated;
grant select on table public.cpgist_credit_accounts to authenticated;

revoke all on table public.cpgist_credit_ledger from public, anon, authenticated;
grant select on table public.cpgist_credit_ledger to authenticated;

revoke all on table public.cpgist_credit_operations from public, anon, authenticated;
revoke all on table public.cpgist_credit_settings from public, anon, authenticated;
