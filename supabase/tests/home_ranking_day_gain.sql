\set ON_ERROR_STOP on
-- Local-only synthetic fixture; all rows and snapshot rebuilds roll back.
begin;
set local session_replication_role = replica;
delete from public.creator_heart_ledger;
delete from public.fan_heart_conversions;
delete from public.fan_score_ledger;
delete from public.home_ranking_daily;
delete from public.home_ranking_builds;
delete from public.home_ranking_kind_builds;
delete from public.home_ranking_build_failures;
set local session_replication_role = origin;
create temporary table day_gain_ids(tag text primary key, id uuid default extensions.gen_random_uuid());
insert into day_gain_ids(tag) values ('creator'),('fan'),('newfan'),('viewer');
create function pg_temp.dg_id(t text) returns uuid language sql as $$ select id from day_gain_ids where tag=t $$;
create function pg_temp.dg_heart(f text, n int) returns void language sql set session_replication_role=replica as $$
  insert into public.creator_heart_ledger(celebrity_id,app_user_id,amount,source_type,source_id,created_at)
  select pg_temp.dg_id('creator'),pg_temp.dg_id(f),1,'passport_page_claim',extensions.gen_random_uuid(),'2099-11-10 23:59:00+09' from generate_series(1,n)
$$;
create function pg_temp.dg_fan(f text, metric text) returns jsonb language sql as $$
  select r from jsonb_array_elements(public.read_home_fan_ranking_v2(null,metric,50)->'rows') r where r->>'nickname'='day_gain_'||f
$$;
create function pg_temp.dg_creator(metric text) returns jsonb language sql as $$
  select r from jsonb_array_elements(public.read_home_creator_ranking_v2('ko',metric,50)->'rows') r where r->>'slug'='day-gain-fixture'
$$;
do $$ declare f text; metric text; r jsonb; ref jsonb; opened jsonb; bad_ref jsonb; begin
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values(pg_temp.dg_id('creator'),'day-gain-fixture','published','/fixture.webp',now(),'{creator}','creator');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values(pg_temp.dg_id('creator'),'ko','Day gain fixture','fixture','fixture');
  insert into public.group_pages(kind,celebrity_id,name) values('fan',pg_temp.dg_id('creator'),'Day gain fixture');
  foreach f in array array['fan','newfan','viewer'] loop
    insert into public.app_users(id,privy_user_id,verified_email) values(pg_temp.dg_id(f),'did:privy:day-gain-'||f,f||'@day-gain.example.test');
    insert into public.user_profiles(app_user_id,nickname,nickname_normalized) values(pg_temp.dg_id(f),'day_gain_'||f,'day_gain_'||f);
  end loop;
  perform pg_temp.dg_heart('fan',4);
  set local session_replication_role=replica;
  insert into public.fan_score_ledger(adjustment_id,app_user_id,celebrity_id,points,created_at)
  values(extensions.gen_random_uuid(),pg_temp.dg_id('fan'),pg_temp.dg_id('creator'),900,'2099-11-10 23:59:00+09');
  set local session_replication_role=origin;
  perform public.refresh_home_rankings('2099-11-10 14:59:59+00');
  if pg_temp.dg_fan('fan','hearts')->'dayGain' is distinct from 'null'::jsonb
     or pg_temp.dg_creator('fans')->'dayGain' is distinct from 'null'::jsonb then raise exception 'DAY_GAIN first day must be unknown'; end if;
  -- One UTC second later is the next KST date. Unchanged hearts must reset to zero.
  perform public.refresh_home_rankings('2099-11-10 15:00:00+00');
  if public.read_home_fan_ranking_v2(null,'hearts',5)->>'day' is distinct from '2099-11-11' then raise exception 'DAY_GAIN KST midnight'; end if;
  if pg_temp.dg_fan('fan','hearts')->>'dayGain' is distinct from '0'
     or pg_temp.dg_creator('fans')->>'dayGain' is distinct from '0' then raise exception 'DAY_GAIN midnight reset'; end if;
  perform pg_temp.dg_heart('fan',3),pg_temp.dg_heart('newfan',2);
  perform public.refresh_home_rankings('2099-11-10 15:10:01+00');
  foreach metric in array array['hearts','points'] loop
    if pg_temp.dg_fan('fan',metric)->>'dayGain' is distinct from '3' then raise exception 'DAY_GAIN fan heart/point metric mismatch: %',metric; end if;
  end loop;
  if pg_temp.dg_fan('newfan','hearts')->>'dayGain' is distinct from '2' then raise exception 'DAY_GAIN absent fan starts from zero'; end if;
  foreach metric in array array['fans','hearts'] loop
    if pg_temp.dg_creator(metric)->>'dayGain' is distinct from '5' then raise exception 'DAY_GAIN creator heart/fan metric mismatch: %',metric; end if;
  end loop;
  if pg_temp.dg_creator('fans')->>'weekGain' is distinct from '1' then raise exception 'DAY_GAIN changed weekly semantics'; end if;
  -- Same refresh path: under ten minutes, no rebuild (fixture timestamp is in the future).
  r:=public.ensure_home_rankings('2099-11-10 15:20:00+00');
  if r->>'built' is distinct from 'false' then raise exception 'DAY_GAIN ten-minute TTL changed'; end if;
  perform public.refresh_home_rankings('2099-11-11 15:00:00+00');
  if pg_temp.dg_fan('fan','points')->>'dayGain' is distinct from '0' then raise exception 'DAY_GAIN next midnight'; end if;
  -- Decreasing totals remain signed; test-only deletion is rolled back with the fixture.
  set local session_replication_role=replica;
  delete from public.creator_heart_ledger where id=(select id from public.creator_heart_ledger where app_user_id=pg_temp.dg_id('fan') limit 1);
  set local session_replication_role=origin;
  perform public.refresh_home_rankings('2099-11-11 15:10:01+00');
  if pg_temp.dg_fan('fan','hearts')->>'dayGain' is distinct from '-1'
     or pg_temp.dg_creator('hearts')->>'dayGain' is distinct from '-1' then raise exception 'DAY_GAIN negative differences'; end if;
  -- A gap is not a one-day comparison even if weekGain has an older baseline.
  perform public.refresh_home_rankings('2099-11-13 15:00:00+00');
  if pg_temp.dg_fan('fan','hearts')->'dayGain' is distinct from 'null'::jsonb
     or pg_temp.dg_creator('fans')->'dayGain' is distinct from 'null'::jsonb then raise exception 'DAY_GAIN missing exact previous day'; end if;
  foreach metric in array array['hearts','points'] loop
    r:=pg_temp.dg_fan('fan',metric);
    if (select array_agg(k order by k) from jsonb_object_keys(r) k) is distinct from
      array['characterId','dayGain','delta','fans','favorite','hearts','isMe','isNew','nickname','points','rank','score','tier','weekGain'] then
      raise exception 'PROFILE_REF guest row keys: %',r;
    end if;
    select e into r from jsonb_array_elements(public.read_home_fan_ranking_v2(pg_temp.dg_id('newfan'),metric,50)->'rows') e
      where e->>'nickname'='day_gain_fan';
    ref:=r->'profileRef';
    if (select array_agg(key order by key) from jsonb_object_keys(ref) key) is distinct from array['computedAt','day','kind','metric','rank']
       or ref->>'kind' is distinct from 'home_ranking' or ref->>'metric' is distinct from metric
       or ref::text like '%'||pg_temp.dg_id('fan')||'%' then raise exception 'PROFILE_REF signed-in format'; end if;
    opened:=public.read_social_profile_by_ref(pg_temp.dg_id('newfan'),ref,'ko');
    if opened->'profile'->>'id' is distinct from pg_temp.dg_id('fan')::text then raise exception 'PROFILE_REF existing endpoint did not resolve'; end if;
    begin
      perform public.read_social_profile_by_ref(null,ref,'ko');
      raise exception 'PROFILE_REF guest was allowed';
    exception when raise_exception then
      if sqlerrm <> 'SOCIAL_FORBIDDEN' then raise; end if;
    end;
  end loop;
  -- The reference points to a stable stored rank, not a viewer-dependent ordinal.
  select e into r from jsonb_array_elements(public.read_home_fan_ranking_v2(pg_temp.dg_id('viewer'),'hearts',50)->'rows') e
    where e->>'nickname'='day_gain_newfan';
  ref:=r->'profileRef';
  if r->>'rank' is distinct from '2' or ref->>'rank' is distinct from '2' then raise exception 'PROFILE_REF initial stored rank'; end if;
  insert into public.user_blocks(app_user_id,blocked_app_user_id) values(pg_temp.dg_id('viewer'),pg_temp.dg_id('fan'));
  select e into r from jsonb_array_elements(public.read_home_fan_ranking_v2(pg_temp.dg_id('viewer'),'hearts',50)->'rows') e
    where e->>'nickname'='day_gain_newfan';
  if r->>'rank' is distinct from '1' or r->'profileRef' is distinct from ref then raise exception 'PROFILE_REF changed target after earlier row hidden'; end if;
  opened:=public.read_social_profile_by_ref(pg_temp.dg_id('viewer'),ref,'ko');
  if opened->'profile'->>'id' is distinct from pg_temp.dg_id('newfan')::text then raise exception 'PROFILE_REF wrong target after reranking'; end if;
  -- Invalid/nonexistent coordinates and additional identifiers are not accepted.
  foreach bad_ref in array array[
    ref||'{"rank":0}', ref||'{"rank":999999}', ref||'{"rank":"2"}', ref||'{"metric":"unknown"}',
    ref||'{"metric":"points"}', ref||'{"day":"2099-01-01"}', ref||'{"computedAt":"2099-01-01T00:00:00Z"}',
    ref||jsonb_build_object('profileId',pg_temp.dg_id('fan')), ref-'computedAt'
  ] loop
    if public.home_ranking_profile_subject(pg_temp.dg_id('viewer'),bad_ref) is not null then raise exception 'PROFILE_REF accepted invalid coordinates: %',bad_ref; end if;
  end loop;
  -- A target hidden after the list was read must disappear, not resolve to the next row.
  insert into public.user_blocks(app_user_id,blocked_app_user_id) values(pg_temp.dg_id('viewer'),pg_temp.dg_id('newfan'));
  if public.read_social_profile_by_ref(pg_temp.dg_id('viewer'),ref,'ko') is not null then raise exception 'PROFILE_REF target block'; end if;
  delete from public.user_blocks where app_user_id=pg_temp.dg_id('viewer');
  insert into public.user_blocks(app_user_id,blocked_app_user_id) values(pg_temp.dg_id('newfan'),pg_temp.dg_id('viewer'));
  if public.read_social_profile_by_ref(pg_temp.dg_id('viewer'),ref,'ko') is not null then raise exception 'PROFILE_REF reverse block'; end if;
  delete from public.user_blocks where app_user_id=pg_temp.dg_id('newfan');
  set local session_replication_role=replica;
  insert into public.app_user_moderation_restrictions(app_user_id,report_id,reason,actor_admin_id)
    values(pg_temp.dg_id('newfan'),extensions.gen_random_uuid(),'profile locator fixture',extensions.gen_random_uuid());
  set local session_replication_role=origin;
  if public.read_social_profile_by_ref(pg_temp.dg_id('viewer'),ref,'ko') is not null then raise exception 'PROFILE_REF moderation restriction'; end if;
  delete from public.app_user_moderation_restrictions where app_user_id=pg_temp.dg_id('newfan');
  perform public.refresh_home_rankings('2099-11-13 15:11:00+00');
  if public.read_social_profile_by_ref(pg_temp.dg_id('viewer'),ref,'ko') is not null then raise exception 'PROFILE_REF old same-day snapshot'; end if;
  select e->'profileRef' into ref from jsonb_array_elements(public.read_home_fan_ranking_v2(pg_temp.dg_id('viewer'),'hearts',50)->'rows') e
    where e->>'nickname'='day_gain_newfan';
  perform public.refresh_home_rankings('2099-11-14 15:00:00+00');
  if public.read_social_profile_by_ref(pg_temp.dg_id('viewer'),ref,'ko') is not null then raise exception 'PROFILE_REF old day'; end if;
  raise notice 'PASS profile locator: immutable rank, invalid coordinates, bilateral blocks, moderation, same-day rebuild and next-day rejection';
  raise notice 'PASS profileRef: signed-in resolution through existing endpoint; guest full-key whitelist and SOCIAL_FORBIDDEN';
  raise notice 'PASS dayGain: first day, KST midnight, zero, new fan, all metrics, negative, missing yesterday, ten-minute TTL';
end $$;
do $$ declare role_name text; begin
  foreach role_name in array array['anon','authenticated','service_role'] loop
    if has_function_privilege(role_name,'public.home_ranking_profile_subject(uuid,jsonb)','execute') then raise exception 'PROFILE_REF helper exposed to %',role_name; end if;
  end loop;
  if not has_function_privilege((select proowner from pg_proc where oid='public.social_profile_ref_subject(uuid,jsonb)'::regprocedure),'public.home_ranking_profile_subject(uuid,jsonb)','execute') then raise exception 'PROFILE_REF wrapper owner cannot call helper'; end if;
  if (select proowner from pg_proc where oid='public.home_ranking_profile_subject(uuid,jsonb)'::regprocedure) is distinct from
     (select proowner from pg_proc where oid='public.read_home_fan_ranking_v2(uuid,text,integer)'::regprocedure) then raise exception 'PROFILE_REF wrong helper owner'; end if;
  raise notice 'PASS profile locator helper ACL and owner';
end $$;
rollback;
