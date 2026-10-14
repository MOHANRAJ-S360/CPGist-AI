-- CPGist credit ledger. Proposed launch defaults: 10 welcome credits, 1 credit per AI Analyst question.
-- No expiry is configured. Prices and allowance are stored in the database and can be changed by an authorized administrator.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.cpgist_credit_settings (
  id smallint primary key default 1 check (id = 1),
  welcome_credits integer not null default 10 check (welcome_credits >= 0),
  welcome_grant_enabled boolean not null default true,
  ai_analyst_question_cost integer not null default 1 check (ai_analyst_question_cost >= 0),
  welcome_expiration_days integer null default null check (welcome_expiration_days is null or welcome_expiration_days > 0),
  updated_at timestamptz not null default now()
);
insert into public.cpgist_credit_settings(id) values (1) on conflict (id) do nothing;
alter table public.cpgist_credit_settings enable row level security;
revoke all on public.cpgist_credit_settings from public, anon, authenticated;

create table if not exists public.cpgist_credit_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  welcome_granted boolean not null default false,
  welcome_granted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.cpgist_credit_accounts enable row level security;
drop policy if exists "Users can read their own credit account" on public.cpgist_credit_accounts;
create policy "Users can read their own credit account" on public.cpgist_credit_accounts
  for select to authenticated using ((select auth.uid()) = user_id);
grant select on public.cpgist_credit_accounts to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.cpgist_credit_accounts from anon, authenticated;

create table if not exists public.cpgist_credit_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_type text not null check (transaction_type in ('grant','deduction','refund','adjustment')),
  amount integer not null check (amount <> 0),
  balance_after integer not null check (balance_after >= 0),
  operation_key text null,
  idempotency_key text null,
  status text not null default 'posted' check (status in ('posted','reversed')),
  reason text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(user_id, idempotency_key)
);
create index if not exists cpgist_credit_ledger_user_created_idx on public.cpgist_credit_ledger(user_id, created_at desc);
alter table public.cpgist_credit_ledger enable row level security;
drop policy if exists "Users can read their own credit ledger" on public.cpgist_credit_ledger;
create policy "Users can read their own credit ledger" on public.cpgist_credit_ledger
  for select to authenticated using ((select auth.uid()) = user_id);
grant select on public.cpgist_credit_ledger to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.cpgist_credit_ledger from anon, authenticated;

create table if not exists public.cpgist_credit_operations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null,
  operation_key text not null,
  credits integer not null check (credits >= 0),
  status text not null default 'reserved' check (status in ('reserved','completed','refunded')),
  created_at timestamptz not null default now(),
  completed_at timestamptz null,
  refunded_at timestamptz null,
  failure_reason text null,
  unique(user_id, idempotency_key)
);
create index if not exists cpgist_credit_operations_user_created_idx on public.cpgist_credit_operations(user_id, created_at desc);
alter table public.cpgist_credit_operations enable row level security;
revoke all on public.cpgist_credit_operations from public, anon, authenticated;

-- Trigger function is kept in a non-exposed schema. It awards a welcome grant once per account.
create or replace function private.cpgist_initialize_credit_account()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_welcome integer;
  v_enabled boolean;
  v_balance integer := 0;
begin
  insert into public.cpgist_credit_accounts(user_id, balance, welcome_granted)
  values (new.id, 0, false)
  on conflict (user_id) do nothing;

  select welcome_credits, welcome_grant_enabled
    into v_welcome, v_enabled
    from public.cpgist_credit_settings where id = 1;

  if coalesce(v_enabled, false) and coalesce(v_welcome, 0) > 0 then
    update public.cpgist_credit_accounts
      set balance = balance + v_welcome,
          welcome_granted = true,
          welcome_granted_at = now(),
          updated_at = now()
      where user_id = new.id and welcome_granted = false
      returning balance into v_balance;

    if found then
      insert into public.cpgist_credit_ledger(user_id, transaction_type, amount, balance_after, operation_key, idempotency_key, reason, metadata)
      values (new.id, 'grant', v_welcome, v_balance, 'WELCOME_GRANT', 'welcome:' || new.id::text,
              'One-time welcome credit grant', jsonb_build_object('configured_allowance', v_welcome))
      on conflict (user_id, idempotency_key) do nothing;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.cpgist_initialize_credit_account() from public, anon, authenticated;
drop trigger if exists cpgist_auth_user_credit_account on auth.users;
create trigger cpgist_auth_user_credit_account
  after insert on auth.users
  for each row execute function private.cpgist_initialize_credit_account();

-- Existing accounts are provisioned with a zero balance; this migration does not silently grant
-- a welcome allowance to accounts that pre-date the feature.
insert into public.cpgist_credit_accounts(user_id, balance, welcome_granted)
select id, 0, false from auth.users
on conflict (user_id) do nothing;

create or replace function public.cpgist_credit_status()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := auth.uid();
  v_balance integer;
  v_welcome integer;
  v_cost integer;
  v_completed integer;
  v_pending integer;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select balance into v_balance from public.cpgist_credit_accounts where user_id = v_user;
  select welcome_credits, ai_analyst_question_cost into v_welcome, v_cost
    from public.cpgist_credit_settings where id = 1;
  select count(*) filter (where status = 'completed'), count(*) filter (where status = 'reserved')
    into v_completed, v_pending from public.cpgist_credit_operations where user_id = v_user;
  return jsonb_build_object('balance', coalesce(v_balance,0), 'remaining', coalesce(v_balance,0),
    'completed', coalesce(v_completed,0), 'pending', coalesce(v_pending,0),
    'limit', coalesce(v_welcome,10), 'cost', coalesce(v_cost,1));
end;
$$;

create or replace function public.cpgist_credit_reserve(p_operation_key text, p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := auth.uid();
  v_balance integer;
  v_cost integer;
  v_welcome integer;
  v_existing public.cpgist_credit_operations%rowtype;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_operation_key is null or length(trim(p_operation_key)) = 0 or length(p_operation_key) > 100 then
    raise exception 'Invalid operation key';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 or length(p_idempotency_key) > 200 then
    raise exception 'A valid idempotency key is required';
  end if;

  insert into public.cpgist_credit_accounts(user_id, balance) values (v_user,0) on conflict (user_id) do nothing;
  select balance into v_balance from public.cpgist_credit_accounts where user_id = v_user for update;

  select * into v_existing from public.cpgist_credit_operations
    where user_id = v_user and idempotency_key = p_idempotency_key;
  if found then
    select welcome_credits into v_welcome from public.cpgist_credit_settings where id = 1;
    return jsonb_build_object('allowed', false, 'duplicate', true, 'status', v_existing.status,
      'balance', v_balance, 'remaining', v_balance, 'limit', coalesce(v_welcome,10), 'cost', v_existing.credits);
  end if;

  select case when p_operation_key = 'AI_ANALYST_QUESTION' then ai_analyst_question_cost else null end,
         welcome_credits
    into v_cost, v_welcome from public.cpgist_credit_settings where id = 1;
  if v_cost is null then
    return jsonb_build_object('allowed', false, 'code', 'OPERATION_NOT_METERED', 'balance', v_balance,
      'remaining', v_balance, 'limit', coalesce(v_welcome,10), 'cost', 0);
  end if;
  if v_cost = 0 then
    insert into public.cpgist_credit_operations(user_id,idempotency_key,operation_key,credits,status)
      values(v_user,p_idempotency_key,p_operation_key,0,'reserved');
    return jsonb_build_object('allowed', true, 'balance', v_balance, 'remaining', v_balance,
      'limit', coalesce(v_welcome,10), 'cost', 0);
  end if;
  if coalesce(v_balance,0) < v_cost then
    return jsonb_build_object('allowed', false, 'insufficient', true, 'balance', coalesce(v_balance,0),
      'remaining', coalesce(v_balance,0), 'limit', coalesce(v_welcome,10), 'cost', v_cost);
  end if;

  insert into public.cpgist_credit_operations(user_id,idempotency_key,operation_key,credits,status)
    values(v_user,p_idempotency_key,p_operation_key,v_cost,'reserved');
  update public.cpgist_credit_accounts set balance = balance - v_cost, updated_at = now()
    where user_id = v_user returning balance into v_balance;
  insert into public.cpgist_credit_ledger(user_id,transaction_type,amount,balance_after,operation_key,idempotency_key,reason,metadata)
    values(v_user,'deduction',-v_cost,v_balance,p_operation_key,'usage:' || p_idempotency_key,
      'Credits reserved for metered operation',jsonb_build_object('operation_idempotency_key',p_idempotency_key));
  select welcome_credits into v_welcome from public.cpgist_credit_settings where id = 1;
  return jsonb_build_object('allowed', true, 'balance', v_balance, 'remaining', v_balance,
    'limit', coalesce(v_welcome,10), 'cost', v_cost);
end;
$$;

create or replace function public.cpgist_credit_complete(p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := auth.uid();
  v_balance integer;
  v_welcome integer;
  v_cost integer;
  v_completed integer;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  update public.cpgist_credit_operations set status='completed', completed_at=now()
    where user_id=v_user and idempotency_key=p_idempotency_key and status='reserved'
    returning credits into v_cost;
  if not found then
    if exists(select 1 from public.cpgist_credit_operations where user_id=v_user and idempotency_key=p_idempotency_key and status='completed') then
      return public.cpgist_credit_status();
    end if;
    raise exception 'No active credit reservation exists';
  end if;
  select balance into v_balance from public.cpgist_credit_accounts where user_id=v_user;
  select welcome_credits into v_welcome from public.cpgist_credit_settings where id=1;
  select count(*) into v_completed from public.cpgist_credit_operations where user_id=v_user and status='completed';
  return jsonb_build_object('balance',coalesce(v_balance,0),'remaining',coalesce(v_balance,0),
    'completed',coalesce(v_completed,0),'limit',coalesce(v_welcome,10),'cost',coalesce(v_cost,0));
end;
$$;

create or replace function public.cpgist_credit_refund(p_idempotency_key text, p_reason text default 'operation_failed')
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := auth.uid();
  v_credits integer;
  v_balance integer;
  v_welcome integer;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  update public.cpgist_credit_operations set status='refunded', refunded_at=now(),
    failure_reason=left(coalesce(p_reason,'operation_failed'),200)
    where user_id=v_user and idempotency_key=p_idempotency_key and status='reserved'
    returning credits into v_credits;
  if not found then
    if exists(select 1 from public.cpgist_credit_operations where user_id=v_user and idempotency_key=p_idempotency_key and status='refunded') then
      return public.cpgist_credit_status();
    end if;
    raise exception 'No refundable credit reservation exists';
  end if;
  update public.cpgist_credit_accounts set balance=balance+v_credits,updated_at=now()
    where user_id=v_user returning balance into v_balance;
  if v_credits > 0 then
    insert into public.cpgist_credit_ledger(user_id,transaction_type,amount,balance_after,operation_key,idempotency_key,reason)
      values(v_user,'refund',v_credits,v_balance,'AI_ANALYST_QUESTION','refund:' || p_idempotency_key,
        left(coalesce(p_reason,'operation_failed'),200))
      on conflict (user_id,idempotency_key) do nothing;
  end if;
  select welcome_credits into v_welcome from public.cpgist_credit_settings where id=1;
  return jsonb_build_object('balance',coalesce(v_balance,0),'remaining',coalesce(v_balance,0),'limit',coalesce(v_welcome,10));
end;
$$;

revoke all on function public.cpgist_credit_status() from public, anon;
revoke all on function public.cpgist_credit_reserve(text,text) from public, anon;
revoke all on function public.cpgist_credit_complete(text) from public, anon;
revoke all on function public.cpgist_credit_refund(text,text) from public, anon;
grant execute on function public.cpgist_credit_status() to authenticated;
grant execute on function public.cpgist_credit_reserve(text,text) to authenticated;
grant execute on function public.cpgist_credit_complete(text) to authenticated;
grant execute on function public.cpgist_credit_refund(text,text) to authenticated;


-- Administrative balance adjustments are atomic and require an app_metadata admin claim.
create or replace function public.cpgist_credit_admin_adjust(
  p_user_id uuid,
  p_amount integer,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_admin uuid := auth.uid();
  v_balance integer;
  v_existing public.cpgist_credit_ledger%rowtype;
begin
  if v_admin is null or coalesce(auth.jwt()->'app_metadata'->>'role','') <> 'admin' then
    raise exception 'Administrator permission required';
  end if;
  if p_user_id is null or p_amount = 0 or p_amount < -100000 or p_amount > 100000 then
    raise exception 'Invalid adjustment';
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 or length(p_idempotency_key) > 200 then
    raise exception 'A valid idempotency key is required';
  end if;
  if length(trim(coalesce(p_reason,''))) < 3 then
    raise exception 'Adjustment reason is required';
  end if;

  insert into public.cpgist_credit_accounts(user_id,balance) values(p_user_id,0) on conflict(user_id) do nothing;
  select balance into v_balance from public.cpgist_credit_accounts where user_id=p_user_id for update;
  select * into v_existing from public.cpgist_credit_ledger
    where user_id=p_user_id and idempotency_key='admin:' || p_idempotency_key;
  if found then
    return jsonb_build_object('balance',v_balance,'duplicate',true,'ledger_id',v_existing.id);
  end if;
  if v_balance + p_amount < 0 then raise exception 'Adjustment would make the balance negative'; end if;
  update public.cpgist_credit_accounts set balance=balance+p_amount,updated_at=now()
    where user_id=p_user_id returning balance into v_balance;
  insert into public.cpgist_credit_ledger(user_id,transaction_type,amount,balance_after,idempotency_key,reason,metadata)
    values(p_user_id,'adjustment',p_amount,v_balance,'admin:' || p_idempotency_key,
      left(trim(p_reason),200),jsonb_build_object('adjusted_by',v_admin));
  return jsonb_build_object('balance',v_balance,'duplicate',false);
end;
$$;
revoke all on function public.cpgist_credit_admin_adjust(uuid,integer,text,text) from public, anon;
grant execute on function public.cpgist_credit_admin_adjust(uuid,integer,text,text) to authenticated;
