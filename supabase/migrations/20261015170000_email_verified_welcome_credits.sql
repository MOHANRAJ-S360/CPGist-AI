-- Welcome credits are awarded only after Supabase marks the user's email as verified.
-- Welcome allowance is intentionally disabled and set to zero until the business approves an amount.
-- Existing balances and ledger rows are not rewritten by this migration.

create or replace function private.cpgist_initialize_credit_account()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_welcome integer;
  v_enabled boolean;
  v_balance integer := 0;
begin
  insert into public.cpgist_credit_accounts(user_id, balance, welcome_granted)
  values (new.id, 0, false)
  on conflict (user_id) do nothing;

  if new.email_confirmed_at is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.email_confirmed_at is not null then
    return new;
  end if;

  select welcome_credits, welcome_grant_enabled
    into v_welcome, v_enabled
    from public.cpgist_credit_settings
    where id = 1;

  if coalesce(v_enabled, false) and coalesce(v_welcome, 0) > 0 then
    update public.cpgist_credit_accounts
      set balance = balance + v_welcome,
          welcome_granted = true,
          welcome_granted_at = now(),
          updated_at = now()
      where user_id = new.id
        and welcome_granted = false
      returning balance into v_balance;

    if found then
      insert into public.cpgist_credit_ledger(
        user_id, transaction_type, amount, balance_after,
        operation_key, idempotency_key, reason, metadata
      )
      values (
        new.id, 'grant', v_welcome, v_balance,
        'WELCOME_GRANT', 'welcome:' || new.id::text,
        'One-time welcome credit grant after email verification',
        jsonb_build_object(
          'configured_allowance', v_welcome,
          'verification_confirmed_at', new.email_confirmed_at
        )
      )
      on conflict (user_id, idempotency_key) do nothing;
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function private.cpgist_initialize_credit_account() from public, anon, authenticated;
drop trigger if exists cpgist_auth_user_credit_account on auth.users;
create trigger cpgist_auth_user_credit_account
  after insert or update of email_confirmed_at on auth.users
  for each row execute function private.cpgist_initialize_credit_account();

update public.cpgist_credit_settings
set welcome_credits = 0,
    welcome_grant_enabled = false,
    updated_at = now()
where id = 1;
