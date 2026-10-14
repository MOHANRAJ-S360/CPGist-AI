-- Existing auth identities must not become welcome-eligible merely because an account row
-- was missing when an UPDATE event occurred. Eligibility is stamped only on a new auth.users row.
create or replace function private.cpgist_initialize_credit_account()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $function$
begin
  insert into public.cpgist_credit_accounts(
    user_id, balance, welcome_granted, welcome_eligible_at
  )
  values (
    new.id, 0, false,
    case when tg_op = 'INSERT' then now() else null end
  )
  on conflict (user_id) do nothing;

  if new.email_confirmed_at is not null
     and (tg_op = 'INSERT' or old.email_confirmed_at is null) then
    perform private.cpgist_try_welcome_grant(new.id, new.email_confirmed_at);
  end if;

  return new;
end;
$function$;

revoke all on function private.cpgist_initialize_credit_account() from public, anon, authenticated;