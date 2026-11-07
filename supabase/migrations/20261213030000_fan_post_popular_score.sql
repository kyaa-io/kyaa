-- Fan page popular posts: rank by one score instead of likes alone, and always fill the list.
--
-- Before: only posts that had a like inside the period were listed, so a page without recent likes showed
-- "no popular posts yet". Now the latest 200 public-visible candidates are scored and the best ten are listed.
-- Score, a Hacker News style time decay: (4 x likes + 2 x comments + views, counted inside the period) / (age in hours + 2) ^ 1.8.
--   Likes weigh most because they are deliberate; a comment costs effort; a view is the weakest signal.
--   The exponent 1.8 is the value Hacker News ranks with: a post loses half its score in roughly a day.
--   A post with no engagement scores 0 and ties are broken by newest first, so a page with no counts at all
--   shows its latest posts and a page with counts shows engaged posts first.
-- Who may read what does not change: every listed post passes fan_web_content_visible() for the viewer
-- (members-only, hidden, deleted, blocked authors, disabled authors, sanctions), and the body comes from fan_web_post_json().
-- Candidates are the 200 newest rows that are not deleted or hidden, which the partial index fan_posts_feed serves.
-- Visibility is then checked in rank order until ten posts are kept (offset 0 keeps the check out of the scoring pass).
--
-- Same signature and grants as 20261208065000, so the API call does not change. create or replace keeps the current owner.
-- The owner needs to read the comment and view tables directly now. A superuser or the table owner already can;
-- any other owner gets column-only select, and a row-security-bound owner gets a select policy for that owner alone.
--
-- Conflict: t3/doc-board-speed has 20261212120300_fan_period_ranking_lazy_visibility, which replaces this same function
-- (likes-only, lazy visibility). This file sorts after it and keeps its lazy visibility pattern, so after both are applied
-- the function is this one. If that branch is applied later it must not run after this file.
-- Rollback: supabase/rollback/20261213030000_fan_post_popular_score.sql
begin;
set local lock_timeout = '5s';

create or replace function public.read_fan_post_period_ranking(p_app_user_id uuid,p_slug text,p_period text,p_locale public.content_locale default 'ko')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; v_since timestamptz;
begin
 v_since:=case p_period when 'day' then now()-interval '1 day' when 'week' then now()-interval '7 days' when 'month' then now()-interval '30 days' else null end;
 if v_since is null then raise exception 'FAN_WEB_INVALID_INPUT' using errcode='22023'; end if;
 with creator as (select id from public.celebrities where slug=p_slug and status='published' and archived_at is null),
 pool as (
  select p.id,p.created_at from public.fan_posts p join creator c on c.id=p.celebrity_id
  where p.deleted_at is null and p.hidden_at is null
  order by p.created_at desc,p.id desc limit 200),
 scored as (
  select pl.id,pl.created_at,
   ((select count(*) from public.fan_post_likes l join public.app_users u on u.id=l.app_user_id and u.status='active' where l.post_id=pl.id and l.created_at>=v_since)*4
   +(select count(*) from public.fan_post_comments m where m.post_id=pl.id and m.deleted_at is null and m.hidden_at is null and m.created_at>=v_since)*2
   +(select count(*) from public.fan_post_views v where v.post_id=pl.id and v.created_at>=v_since))::double precision
   /power(greatest(extract(epoch from now()-pl.created_at)/3600.0,0)+2,1.8) score
  from pool pl),
 ordered as (select * from scored order by score desc,created_at desc,id desc offset 0),
 ranked as (select * from ordered where public.fan_web_content_visible(p_app_user_id,'fan_post',id) limit 10)
 select jsonb_build_object('items',coalesce(jsonb_agg(public.fan_web_post_json(p_app_user_id,id,p_locale) order by score desc,created_at desc,id desc),'[]'::jsonb)) into result from ranked;
 return result;
end $$;
revoke all on function public.read_fan_post_period_ranking(uuid,text,text,public.content_locale) from public,anon,authenticated;
grant execute on function public.read_fan_post_period_ranking(uuid,text,text,public.content_locale) to service_role;

do $$
declare reader record; t record;
begin
 select o.oid,o.rolname,o.rolsuper,o.rolbypassrls into reader
  from pg_proc p join pg_roles o on o.oid=p.proowner
  where p.oid='public.read_fan_post_period_ranking(uuid,text,text,public.content_locale)'::regprocedure;
 if reader.rolsuper then return; end if;
 for t in select * from (values
   ('public.fan_post_comments'::regclass,'post_id,created_at,deleted_at,hidden_at'),
   ('public.fan_post_views'::regclass,'post_id,created_at')) v(rel,cols) loop
  if pg_has_role(reader.oid,(select relowner from pg_class where oid=t.rel),'USAGE') then continue; end if;
  execute format('grant select (%s) on %s to %I',t.cols,t.rel,reader.rolname);
  if not reader.rolbypassrls then
   execute format('drop policy if exists %I on %s','fan_post_popular_read_owner_'||reader.rolname,t.rel);
   execute format('create policy %I on %s for select to %I using (true)','fan_post_popular_read_owner_'||reader.rolname,t.rel,reader.rolname);
  end if;
 end loop;
 if not (has_column_privilege(reader.rolname,'public.fan_post_comments','created_at','select')
  and has_column_privilege(reader.rolname,'public.fan_post_views','created_at','select')) then
  raise exception 'FAN_POST_POPULAR_READ_PRIVILEGE_MISSING: %',reader.rolname;
 end if;
end $$;

commit;
