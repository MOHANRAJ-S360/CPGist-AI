-- Allow users to review their own operation status without exposing another account's usage.
drop policy if exists "Users can read their own credit operations" on public.cpgist_credit_operations;
create policy "Users can read their own credit operations"
  on public.cpgist_credit_operations for select to authenticated
  using ((select auth.uid()) = user_id);
grant select on table public.cpgist_credit_operations to authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.cpgist_credit_operations from public, anon, authenticated;
