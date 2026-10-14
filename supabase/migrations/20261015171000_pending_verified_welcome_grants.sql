-- Preserve eligibility for accounts created while the welcome allowance is disabled.
-- Only accounts first created after this migration are marked welcome-eligible; existing accounts
-- are not retroactively enrolled. When the business later enables a positive allowance, verified
-- eligible accounts can receive their one-time grant without waiting for another auth event.

alter table public.cpgist_credit_accounts
  add column if not exists welcome_eligible_at timestamptz null;

create or replace function private.cpgist_try_welcome_grant(
  p_user_id uuid,
  p_email_confirmed_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $function$
declare
  v_welcome integer;
  v_enabled boolean;
  v_balance integer;
begin
  if p_user_id is null or p_email_confirmed_at is null then
    return;
  end if;

  select welcome_credits, welcome_grant_enabled
    into v_welcome, v_enabled
    from public.cpgist_credit_settings
    where id = 1;

  if not coalesce(v_enabled, false) or coalesce(v_welcome, 0) <= 0 then
    return;
  end if;

  update public.cpgist_credit_accounts
    set balance = balance + v_welcome,
        welcome_granted = true,
        welcome_granted_at = now(),
        updated_at = now()
    where user_id = p_user_id
      and welcome_eligible_at is not null
      and welcome_granted = false
    returning balance into v_balance;

  if found then
    insert into public.cpgist_credit_ledger(
      user_id, transaction_type, amount, balance_after,
      operation_key, idempotency_key, reason, metadata
    )
    values (
      p_user_id, 'grant', v_welcome, v_balance,
      'WELCOME_GRANT', 'welcome:' || p_user_id::text,
      'One-time welcome credit grant after email verification',
      jsonb_build_object(
        'configured_allowance', v_welcome,
        'verification_confirmed_at', p_email_confirmed_at
      )
    )
    on conflict (user_id, idempotency_key) do nothing;
  end if;
end;
$function$;

revoke all on function private.cpgist_try_welcome_grant(uuid, timestamptz) from public, anon, authenticated;

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
  values (new.id, 0, false, now())
  on conflict (user_id) do nothing;

  if new.email_confirmed_at is not null
     and (tg_op = 'INSERT' or old.email_confirmed_at is null) then
    perform private.cpgist_try_welcome_grant(new.id, new.email_confirmed_at);
  end if;

  return new;
end;
$function$;

revoke all on function private.cpgist_initialize_credit_account() from public, anon, authenticated;
drop trigger if exists cpgist_auth_user_credit_account on auth.users;
create trigger cpgist_auth_user_credit_account
  after insert or update of email_confirmed_at on auth.users
  for each row execute function private.cpgist_initialize_credit_account();

create or replace function private.cpgist_apply_pending_welcome_grants()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $function$
declare
  v_user record;
begin
  if not coalesce(new.welcome_grant_enabled, false)
     or coalesce(new.welcome_credits, 0) <= 0 then
    return new;
  end if;

  for v_user in
    select u.id, u.email_confirmed_at
    from auth.users u
    join public.cpgist_credit_accounts a on a.user_id = u.id
    where u.email_confirmed_at is not null
      and a.welcome_eligible_at is not null
      and a.welcome_granted = false
    order by u.created_at
  loop
    perform private.cpgist_try_welcome_grant(v_user.id, v_user.email_confirmed_at);
  end loop;

  return new;
end;
$function$;

revoke all on function private.cpgist_apply_pending_welcome_grants() from public, anon, authenticated;
drop trigger if exists cpgist_credit_settings_apply_pending_welcome on public.cpgist_credit_settings;
create trigger cpgist_credit_settings_apply_pending_welcome
  after update of welcome_credits, welcome_grant_enabled on public.cpgist_credit_settings
  for each row execute function private.cpgist_apply_pending_welcome_grants();
