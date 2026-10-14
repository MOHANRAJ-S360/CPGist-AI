-- Server-enforced free AI Analyst quota: three successfully completed analyses per Supabase account.
-- Pending requests are reserved atomically so concurrent requests cannot bypass the limit.
create table if not exists public.cpgist_ai_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  completed_count integer not null default 0 check (completed_count >= 0),
  pending_count integer not null default 0 check (pending_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.cpgist_ai_usage enable row level security;
revoke all on public.cpgist_ai_usage from anon, authenticated;
grant select on public.cpgist_ai_usage to authenticated;
drop policy if exists "Users can read their own AI usage" on public.cpgist_ai_usage;
create policy "Users can read their own AI usage"
  on public.cpgist_ai_usage for select to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.cpgist_ai_usage_reserve()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := auth.uid();
  v_completed integer;
  v_pending integer;
  v_limit constant integer := 3;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  insert into public.cpgist_ai_usage(user_id) values (v_user) on conflict (user_id) do nothing;
  select completed_count, pending_count into v_completed, v_pending
    from public.cpgist_ai_usage where user_id = v_user for update;
  if v_completed + v_pending >= v_limit then
    return jsonb_build_object('allowed', false, 'completed', v_completed, 'limit', v_limit, 'remaining', 0);
  end if;
  update public.cpgist_ai_usage
    set pending_count = pending_count + 1, updated_at = now()
    where user_id = v_user
    returning completed_count, pending_count into v_completed, v_pending;
  return jsonb_build_object('allowed', true, 'completed', v_completed, 'limit', v_limit,
                            'remaining', greatest(0, v_limit - v_completed - v_pending));
end;
$$;

create or replace function public.cpgist_ai_usage_complete()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := auth.uid();
  v_completed integer;
  v_pending integer;
  v_limit constant integer := 3;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  update public.cpgist_ai_usage
    set pending_count = greatest(0, pending_count - 1),
        completed_count = completed_count + 1, updated_at = now()
    where user_id = v_user
    returning completed_count, pending_count into v_completed, v_pending;
  if not found then raise exception 'No usage reservation exists'; end if;
  return jsonb_build_object('completed', v_completed, 'limit', v_limit,
                            'remaining', greatest(0, v_limit - v_completed - v_pending));
end;
$$;

create or replace function public.cpgist_ai_usage_release()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := auth.uid();
  v_completed integer;
  v_pending integer;
  v_limit constant integer := 3;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  update public.cpgist_ai_usage
    set pending_count = greatest(0, pending_count - 1), updated_at = now()
    where user_id = v_user
    returning completed_count, pending_count into v_completed, v_pending;
  if not found then
    return jsonb_build_object('completed', 0, 'limit', v_limit, 'remaining', v_limit);
  end if;
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
  v_completed integer := 0;
  v_pending integer := 0;
  v_limit constant integer := 3;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select completed_count, pending_count into v_completed, v_pending
    from public.cpgist_ai_usage where user_id = v_user;
  return jsonb_build_object('completed', coalesce(v_completed, 0), 'limit', v_limit,
                            'remaining', greatest(0, v_limit - coalesce(v_completed, 0) - coalesce(v_pending, 0)));
end;
$$;

revoke all on function public.cpgist_ai_usage_reserve() from public, anon;
revoke all on function public.cpgist_ai_usage_complete() from public, anon;
revoke all on function public.cpgist_ai_usage_release() from public, anon;
revoke all on function public.cpgist_ai_usage_status() from public, anon;
grant execute on function public.cpgist_ai_usage_reserve() to authenticated;
grant execute on function public.cpgist_ai_usage_complete() to authenticated;
grant execute on function public.cpgist_ai_usage_release() to authenticated;
grant execute on function public.cpgist_ai_usage_status() to authenticated;
