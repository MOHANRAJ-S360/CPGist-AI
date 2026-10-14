-- Provision a personal organization for each authenticated account, without replacing existing memberships.
create or replace function private.cpgist_provision_user_workspace()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_org uuid;
begin
  if exists (select 1 from public.organization_members where user_id = new.id) then
    return new;
  end if;
  insert into public.organizations(name)
    values ('CPGist Workspace')
    returning id into v_org;
  insert into public.organization_members(organization_id,user_id,role)
    values (v_org,new.id,'owner')
    on conflict do nothing;
  return new;
end;
$$;
revoke all on function private.cpgist_provision_user_workspace() from public, anon, authenticated;

drop trigger if exists cpgist_auth_user_workspace on auth.users;
create trigger cpgist_auth_user_workspace
  after insert on auth.users
  for each row execute function private.cpgist_provision_user_workspace();

do $$
declare
  r record;
  v_org uuid;
begin
  for r in
    select u.id
    from auth.users u
    where not exists (select 1 from public.organization_members m where m.user_id = u.id)
  loop
    insert into public.organizations(name) values ('CPGist Workspace') returning id into v_org;
    insert into public.organization_members(organization_id,user_id,role)
      values (v_org,r.id,'owner')
      on conflict do nothing;
  end loop;
end;
$$;
