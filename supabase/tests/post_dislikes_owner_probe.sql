-- Local disposable-database probe for review r4 M2 (20261215030000). Superuser only; everything rolls back.
-- A non-superuser owner that is a member of the table owners (dev's byus_admin) owns the new functions; the policy block is the
-- migration's own, run as that role. Expect: probe1 'like', probe2 'dislike'. Without the block: probe1 null, probe2 42501.
\set ON_ERROR_STOP on
begin;
create role c_probe_owner nologin nosuperuser nobypassrls;
grant postgres to c_probe_owner;
grant byus_admin to c_probe_owner;
grant usage on schema public to c_probe_owner;
alter table public.fan_post_dislikes owner to c_probe_owner;
alter table public.group_post_dislikes owner to c_probe_owner;
create policy fan_post_dislikes_owner on public.fan_post_dislikes for all to c_probe_owner using (true) with check (true);
alter function public.fan_post_dislike_count_visible(uuid,uuid) owner to c_probe_owner;
alter function public.read_fan_post_reaction(uuid,uuid) owner to c_probe_owner;
alter function public.set_fan_post_reaction(uuid,uuid,text) owner to c_probe_owner;
alter function public.clear_opposite_post_reaction() owner to c_probe_owner;
set local role c_probe_owner;
do $$
declare me record; t record;
begin
 select oid,rolname,rolsuper,rolbypassrls into me from pg_roles where rolname=current_user;
 if me.rolsuper or me.rolbypassrls then return; end if;
 for t in select * from (values
   ('fan_post_likes','select, delete'),('content_write_events','select, insert'),('fan_posts','select'),
   ('group_pages','select'),('group_memberships','select'),('group_posts','select'),('group_post_reactions','select, delete'),
   ('channel_operators','select'),('account_deletion_requests','select'),('app_users','select')) v(tname,privs) loop
  execute format('grant %s on table public.%I to %I',t.privs,t.tname,me.rolname);
  if exists(select 1 from pg_class c where c.oid=('public.'||t.tname)::regclass and c.relrowsecurity
      and (c.relforcerowsecurity or not pg_has_role(me.oid,c.relowner,'USAGE')))
    and not exists(select 1 from pg_policy pol where pol.polrelid=('public.'||t.tname)::regclass and me.oid=any(pol.polroles)) then
   execute format('create policy %I on public.%I for all to %I using (true) with check (true)','p3_fn_owner_'||me.rolname,t.tname,me.rolname);
  end if;
 end loop;
end $$;
reset role;
do $$
declare p uuid; u uuid; r jsonb;
begin
  select l.post_id,l.app_user_id into p,u from public.fan_post_likes l join public.fan_posts f on f.id=l.post_id join public.app_users a on a.id=l.app_user_id and a.status='active'
   where f.deleted_at is null and f.hidden_at is null and public.fan_web_content_visible(l.app_user_id,'fan_post',l.post_id) limit 1;
  r := public.read_fan_post_reaction(u,p);
  raise notice 'probe1 liked post reads as %', r->>'reaction';
  begin
    r := public.set_fan_post_reaction(u,p,'dislike');
    raise notice 'probe2 dislike saved: %', r->>'reaction';
  exception when others then raise notice 'probe2 dislike failed: % %', sqlstate, sqlerrm; end;
end $$;
rollback;

