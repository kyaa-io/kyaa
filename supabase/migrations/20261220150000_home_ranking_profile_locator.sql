-- DB emits signed-in-only snapshot coordinates; the trusted HTTP server signs them for the viewer.
-- Client references are HMAC-verified before these coordinates reach the service-role RPC.
-- The stored rank stays stable when read-time visibility closes the displayed rank gaps.
-- Resolution must still match a current visible top-50 row in the same metric/snapshot.
-- Rollback: supabase/rollback/20261220150000_home_ranking_profile_locator.sql
begin;
set local lock_timeout = '5s';

create or replace function public.home_ranking_profile_subject(p_viewer uuid, p_ref jsonb)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare ranking jsonb; subject uuid; k text;
begin
  if p_viewer is null then raise exception 'SOCIAL_FORBIDDEN'; end if;
  if pg_catalog.jsonb_typeof(p_ref) is distinct from 'object' then return null; end if;
  if (select array_agg(key order by key) from pg_catalog.jsonb_object_keys(p_ref) key)
       is distinct from array['computedAt','day','kind','metric','rank']
     or p_ref->>'kind' is distinct from 'home_ranking'
     or pg_catalog.jsonb_typeof(p_ref->'rank') is distinct from 'number'
     or p_ref->>'metric' not in ('hearts','points') then return null; end if;
  k := case p_ref->>'metric' when 'hearts' then 'fan_hearts' when 'points' then 'fan_points' end;
  if k is null then return null; end if;
  -- Reuse the reader's active-account, moderation and bilateral-block filters and its current snapshot.
  ranking := public.read_home_fan_ranking_v2(p_viewer, p_ref->>'metric', 50);
  if ranking->>'day' is distinct from p_ref->>'day'
     or ranking->>'computedAt' is distinct from p_ref->>'computedAt' then return null; end if;
  -- Match the complete locator before mapping its stable stored rank to a subject, inside this statement's snapshot.
  select s.subject_id into subject
    from pg_catalog.jsonb_array_elements(ranking->'rows') e
    join public.home_ranking_daily s on s.kind = k and s.day = (ranking->>'day')::date
      and s.rank = (e->'profileRef'->>'rank')::bigint
      and s.computed_at = (ranking->>'computedAt')::timestamptz
   where e->'profileRef' = p_ref;
  return subject;
end $$;
revoke all on function public.home_ranking_profile_subject(uuid,jsonb) from public,anon,authenticated,service_role;

-- Reuse the ranking reader's existing FORCE-RLS owner, without new table grants or policies.
do $owner$
declare owner_name name;
begin
  select pg_catalog.pg_get_userbyid(proowner) into owner_name from pg_catalog.pg_proc
    where oid = 'public.read_home_fan_ranking_v2(uuid,text,integer)'::regprocedure;
  if owner_name in ('anon','authenticated','service_role') or not pg_catalog.pg_has_role(current_user, owner_name, 'USAGE') then
    raise exception 'HOME_PROFILE_OWNER_GAP: %', owner_name;
  end if;
  execute format('alter function public.home_ranking_profile_subject(uuid,jsonb) owner to %I', owner_name);
end $owner$;

-- Supports the immutable original 140000, the earlier local member-id variant, and reapplication.
do $reader$
declare def text;
  original text := $a$) order by v.rn)
      from moved v$a$;
  intermediate text := $a$) || case when p_viewer is not null then pg_catalog.jsonb_build_object(
        'profileRef', pg_catalog.jsonb_build_object('kind', 'profile', 'profileId', v.subject_id)) else '{}'::jsonb end order by v.rn)
      from moved v$a$;
  final_text text := $a$) || case when p_viewer is not null then pg_catalog.jsonb_build_object(
        'profileRef', pg_catalog.jsonb_build_object('kind', 'home_ranking', 'day', h.day,
          'computedAt', h.computed_at, 'metric', p_metric, 'rank', v.stored_rank)) else '{}'::jsonb end order by v.rn)
      from moved v$a$;
begin
  def := pg_catalog.pg_get_functiondef('public.read_home_fan_ranking_v2(uuid,text,integer)'::regprocedure);
  if (length(def) - length(replace(def, final_text, ''))) / length(final_text) = 1 then return; end if;
  if (length(def) - length(replace(def, intermediate, ''))) / length(intermediate) = 1 then
    def := replace(def, intermediate, final_text);
  elsif (length(def) - length(replace(def, original, ''))) / length(original) = 1 then
    def := replace(def, original, final_text);
  else raise exception 'HOME_PROFILE_SHAPE: read_home_fan_ranking_v2'; end if;
  execute def;
end $reader$;

do $patch$
declare p record; def text;
begin
  for p in select * from (values
    ('public.social_profile_ref_subject(uuid,jsonb)',
     $a$elsif kind in('fan_post','fan_post_comment') then$a$,
     $b$elsif kind='home_ranking' then
  if p_viewer is null then raise exception 'SOCIAL_FORBIDDEN'; end if;
  subject:=public.home_ranking_profile_subject(p_viewer,p_ref);
 elsif kind in('fan_post','fan_post_comment') then$b$),
    ('public.list_facts_wrapper_access()',
     $a$from (values$a$,
     $b$from (values
   ('public.social_profile_ref_subject(uuid,jsonb)','public.home_ranking_profile_subject(uuid,jsonb)'),
   ('public.home_ranking_profile_subject(uuid,jsonb)','public.read_home_fan_ranking_v2(uuid,text,integer)'),$b$)
  ) v(fn, old_text, new_text) loop
    def := pg_catalog.pg_get_functiondef(p.fn::regprocedure);
    if (length(def) - length(replace(def, p.new_text, ''))) / length(p.new_text) = 1 then continue; end if;
    if (length(def) - length(replace(def, p.old_text, ''))) / length(p.old_text) <> 1 then
      raise exception 'HOME_PROFILE_SHAPE: %', p.fn;
    end if;
    execute replace(def, p.old_text, p.new_text);
  end loop;
end $patch$;
select public.list_facts_wrapper_access();
notify pgrst, 'reload schema';
commit;
