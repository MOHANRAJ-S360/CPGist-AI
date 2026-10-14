-- Subscription entitlements and idempotent, reservation-scoped AI usage.
-- Apply only after reviewing and testing locally; do not run against production blindly.

alter table public.cpgist_ai_usage
  add column if not exists free_completed_count integer not null default 0,
  add column if not exists period_completed_count integer not null default 0,
  add column if not exists period_start date not null default (date_trunc('month', now() at time zone 'UTC')::date);

-- Preserve historical usage as free-tier usage when upgrading the original quota table.
update public.cpgist_ai_usage
set free_completed_count = greatest(free_completed_count, least(completed_count, 3))
where completed_count > 0 and free_completed_count = 0;

create table if not exists public.cpgist_ai_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_key text not null check (plan_key in ('pro','growth','enterprise')),
  razorpay_subscription_id text not null unique,
  status text not null check (status in ('created','authenticated','active','pending','halted','paused','cancelled','completed','expired')),
  monthly_ai_limit integer not null check (monthly_ai_limit > 0),
  current_start timestamptz,
  current_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cpgist_ai_subscriptions_user_status_idx
  on public.cpgist_ai_subscriptions(user_id, status, current_end desc);
create unique index if not exists cpgist_ai_subscriptions_one_open_per_user
  on public.cpgist_ai_subscriptions(user_id)
  where status in ('created','authenticated','pending','active');
alter table public.cpgist_ai_subscriptions enable row level security;
revoke all on public.cpgist_ai_subscriptions from anon, authenticated;
grant select on public.cpgist_ai_subscriptions to authenticated;
drop policy if exists "Users can read their own CPGist AI subscription" on public.cpgist_ai_subscriptions;
create policy "Users can read their own CPGist AI subscription"
  on public.cpgist_ai_subscriptions for select to authenticated
  using ((select auth.uid()) = user_id);

create table if not exists public.cpgist_ai_usage_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_key text not null check (plan_key in ('free','pro','growth','enterprise')),
  billing_period_start date,
  status text not null default 'pending' check (status in ('pending','completed','released')),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists cpgist_ai_usage_reservations_pending_idx
  on public.cpgist_ai_usage_reservations(user_id, status, plan_key, billing_period_start);
alter table public.cpgist_ai_usage_reservations enable row level security;
revoke all on public.cpgist_ai_usage_reservations from anon, authenticated;

create table if not exists public.cpgist_razorpay_webhook_events (
  event_id text primary key,
  event_name text not null,
  received_at timestamptz not null default now()
);
alter table public.cpgist_razorpay_webhook_events enable row level security;
revoke all on public.cpgist_razorpay_webhook_events from anon, authenticated;

create or replace function public.cpgist_ai_usage_reserve()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := auth.uid();
  v_month date := date_trunc('month', now() at time zone 'UTC')::date;
  v_plan text := 'free';
  v_limit integer := 3;
  v_completed integer := 0;
  v_pending integer := 0;
  v_reservation uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  insert into public.cpgist_ai_usage(user_id, period_start)
  values (v_user, v_month) on conflict (user_id) do nothing;

  perform 1 from public.cpgist_ai_usage where user_id = v_user for update;

  -- Recover abandoned reservations from crashed/timed-out analysis requests.
  update public.cpgist_ai_usage_reservations
    set status = 'released', finished_at = now()
    where user_id = v_user and status = 'pending'
      and created_at < now() - interval '30 minutes';
  update public.cpgist_ai_usage
    set pending_count = (select count(*)::integer from public.cpgist_ai_usage_reservations
      where user_id = v_user and status = 'pending'), updated_at = now()
    where user_id = v_user;

  select plan_key, monthly_ai_limit into v_plan, v_limit
  from public.cpgist_ai_subscriptions
  where user_id = v_user and status = 'active'
    and (current_end is null or current_end > now())
  order by current_end desc nulls first, updated_at desc
  limit 1;

  if v_plan is null then v_plan := 'free'; v_limit := 3; end if;

  if v_plan <> 'free' then
    update public.cpgist_ai_usage
      set period_start = v_month,
          period_completed_count = case when period_start <> v_month then 0 else period_completed_count end,
          updated_at = now()
      where user_id = v_user;
    select period_completed_count into v_completed
      from public.cpgist_ai_usage where user_id = v_user;
    select count(*)::integer into v_pending from public.cpgist_ai_usage_reservations
      where user_id = v_user and status = 'pending' and plan_key = v_plan
        and billing_period_start = v_month;
  else
    select free_completed_count into v_completed from public.cpgist_ai_usage where user_id = v_user;
    select count(*)::integer into v_pending from public.cpgist_ai_usage_reservations
      where user_id = v_user and status = 'pending' and plan_key = 'free';
  end if;

  if v_completed + v_pending >= v_limit then
    return jsonb_build_object('allowed', false, 'completed', v_completed, 'limit', v_limit, 'remaining', 0);
  end if;

  insert into public.cpgist_ai_usage_reservations(user_id, plan_key, billing_period_start)
  values (v_user, v_plan, case when v_plan = 'free' then null else v_month end)
  returning id into v_reservation;

  update public.cpgist_ai_usage set pending_count = pending_count + 1, updated_at = now()
    where user_id = v_user;

  return jsonb_build_object(
    'allowed', true, 'completed', v_completed, 'limit', v_limit,
    'remaining', greatest(0, v_limit - v_completed - v_pending - 1),
    'reservationId', v_reservation
  );
end;
$$;

create or replace function public.cpgist_ai_usage_complete(p_reservation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := auth.uid();
  v_res public.cpgist_ai_usage_reservations%rowtype;
  v_month date := date_trunc('month', now() at time zone 'UTC')::date;
  v_completed integer := 0;
  v_limit integer := 3;
  v_pending integer := 0;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select * into v_res from public.cpgist_ai_usage_reservations
    where id = p_reservation_id and user_id = v_user for update;
  if not found or v_res.status <> 'pending' then raise exception 'Usage reservation is missing or already finalized'; end if;

  update public.cpgist_ai_usage_reservations set status = 'completed', finished_at = now()
    where id = p_reservation_id and user_id = v_user and status = 'pending';

  if v_res.plan_key = 'free' then
    update public.cpgist_ai_usage set free_completed_count = free_completed_count + 1,
      completed_count = completed_count + 1, pending_count = greatest(0, pending_count - 1), updated_at = now()
      where user_id = v_user;
    select free_completed_count into v_completed from public.cpgist_ai_usage where user_id = v_user;
  else
    update public.cpgist_ai_usage set
      period_completed_count = case when period_start = v_res.billing_period_start then period_completed_count + 1 else period_completed_count end,
      pending_count = greatest(0, pending_count - 1), updated_at = now()
      where user_id = v_user;
    select coalesce(s.monthly_ai_limit, 3), case when u.period_start = v_month then u.period_completed_count else 0 end
      into v_limit, v_completed
    from public.cpgist_ai_usage u left join lateral (
      select monthly_ai_limit from public.cpgist_ai_subscriptions
      where user_id = v_user and status = 'active' and (current_end is null or current_end > now())
      order by current_end desc nulls first, updated_at desc limit 1
    ) s on true where u.user_id = v_user;
  end if;

  select count(*)::integer into v_pending from public.cpgist_ai_usage_reservations
    where user_id = v_user and status = 'pending'
      and (v_res.plan_key = 'free' and plan_key = 'free'
        or v_res.plan_key <> 'free' and plan_key = v_res.plan_key and billing_period_start = v_month);
  return jsonb_build_object('completed', v_completed, 'limit', v_limit,
    'remaining', greatest(0, v_limit - v_completed - v_pending));
end;
$$;

create or replace function public.cpgist_ai_usage_release(p_reservation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := auth.uid();
  v_res public.cpgist_ai_usage_reservations%rowtype;
  v_completed integer := 0;
  v_limit integer := 3;
  v_pending integer := 0;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select * into v_res from public.cpgist_ai_usage_reservations
    where id = p_reservation_id and user_id = v_user for update;
  if not found or v_res.status <> 'pending' then raise exception 'Usage reservation is missing or already finalized'; end if;
  update public.cpgist_ai_usage_reservations set status = 'released', finished_at = now()
    where id = p_reservation_id and user_id = v_user;
  update public.cpgist_ai_usage set pending_count = greatest(0, pending_count - 1), updated_at = now()
    where user_id = v_user;

  if v_res.plan_key = 'free' then
    select free_completed_count into v_completed from public.cpgist_ai_usage where user_id = v_user;
  else
    select coalesce(s.monthly_ai_limit, 3), case when u.period_start = v_res.billing_period_start then u.period_completed_count else 0 end
      into v_limit, v_completed
    from public.cpgist_ai_usage u left join lateral (
      select monthly_ai_limit from public.cpgist_ai_subscriptions
      where user_id = v_user and status = 'active' and (current_end is null or current_end > now())
      order by current_end desc nulls first, updated_at desc limit 1
    ) s on true where u.user_id = v_user;
  end if;
  select count(*)::integer into v_pending from public.cpgist_ai_usage_reservations
    where user_id = v_user and status = 'pending' and plan_key = v_res.plan_key
      and (v_res.plan_key = 'free' or billing_period_start = v_res.billing_period_start);
  return jsonb_build_object('completed', v_completed, 'limit', v_limit,
    'remaining', greatest(0, v_limit - v_completed - v_pending));
end;
$$;

create or replace function public.cpgist_ai_usage_status()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := auth.uid();
  v_month date := date_trunc('month', now() at time zone 'UTC')::date;
  v_plan text := 'free';
  v_limit integer := 3;
  v_completed integer := 0;
  v_pending integer := 0;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  insert into public.cpgist_ai_usage(user_id, period_start) values (v_user, v_month)
    on conflict (user_id) do nothing;
  select plan_key, monthly_ai_limit into v_plan, v_limit from public.cpgist_ai_subscriptions
    where user_id = v_user and status = 'active' and (current_end is null or current_end > now())
    order by current_end desc nulls first, updated_at desc limit 1;
  if v_plan is null then v_plan := 'free'; v_limit := 3; end if;
  if v_plan = 'free' then
    select free_completed_count into v_completed from public.cpgist_ai_usage where user_id = v_user;
    select count(*)::integer into v_pending from public.cpgist_ai_usage_reservations
      where user_id = v_user and status = 'pending' and plan_key = 'free';
  else
    update public.cpgist_ai_usage set period_start = v_month,
      period_completed_count = case when period_start <> v_month then 0 else period_completed_count end,
      updated_at = now() where user_id = v_user;
    select period_completed_count into v_completed from public.cpgist_ai_usage where user_id = v_user;
    select count(*)::integer into v_pending from public.cpgist_ai_usage_reservations
      where user_id = v_user and status = 'pending' and plan_key = v_plan and billing_period_start = v_month;
  end if;
  return jsonb_build_object('completed', coalesce(v_completed, 0), 'limit', v_limit,
    'remaining', greatest(0, v_limit - coalesce(v_completed, 0) - v_pending));
end;
$$;

revoke all on function public.cpgist_ai_usage_reserve() from public, anon;
revoke all on function public.cpgist_ai_usage_complete(uuid) from public, anon;
revoke all on function public.cpgist_ai_usage_release(uuid) from public, anon;
revoke all on function public.cpgist_ai_usage_status() from public, anon;
grant execute on function public.cpgist_ai_usage_reserve() to authenticated;
grant execute on function public.cpgist_ai_usage_complete(uuid) to authenticated;
grant execute on function public.cpgist_ai_usage_release(uuid) to authenticated;
grant execute on function public.cpgist_ai_usage_status() to authenticated;

-- Remove legacy no-argument functions so clients cannot bypass reservation IDs.
drop function if exists public.cpgist_ai_usage_complete();
drop function if exists public.cpgist_ai_usage_release();
