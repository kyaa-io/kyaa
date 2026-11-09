begin;
-- B6 (2026-11-09 plan v4): a fan can report a profile. The report goes to the admin queue as target_type 'user_profile'.
-- The admin sees what the profile said when it was reported (name, intro, links, details): the text is kept beside the report and
-- returned as the existing target.body, so the admin reply keeps its keys. A profile report can be resolved or dismissed and the
-- person restricted; there is nothing to hide (like user_block). The reported content (fan post, comment, group post) is the context.
-- Deploy the web build that accepts 'user_profile' and context 'group_post' in the admin list before this file.

alter table public.content_reports drop constraint content_reports_target_type_check;
alter table public.content_reports add constraint content_reports_target_type_check check(target_type in('fan_post','fan_post_comment','fan_clip','fan_clip_comment','notice','notice_comment','cheer','live_submission','participation_post','participation_comment','dm_message','user_block','user_profile'));
alter table public.content_reports drop constraint content_reports_context_target_type_check;
alter table public.content_reports add constraint content_reports_context_target_type_check check(context_target_type in('fan_post','fan_post_comment','fan_clip','fan_clip_comment','notice','notice_comment','cheer','live_submission','participation_post','participation_comment','group_post'));

create table public.social_profile_report_snapshots(
 report_id uuid primary key references public.content_reports(id) on delete cascade,
 body text not null check(length(body)<=2000)
);
alter table public.social_profile_report_snapshots enable row level security;
alter table public.social_profile_report_snapshots force row level security;
revoke all on table public.social_profile_report_snapshots from public,anon,authenticated,service_role;

create function public.social_profile_report_daily_limit() returns integer language sql immutable set search_path='' as $$ select 30 $$;

create function public.report_social_profile(p_viewer uuid,p_ref jsonb,p_reason text,p_details text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare resolved jsonb;subject uuid;snapshot text;prev public.content_reports%rowtype;report uuid;replay jsonb;result jsonb;
 operation text:='report-profile';payload text:=md5(coalesce(p_ref::text,'')||':'||coalesce(p_reason,'')||':'||coalesce(p_details,''));
begin
 perform public.social_request_lock(p_viewer,p_request_id);
 perform public.fan_web_lock_active_user(p_viewer);
 replay:=public.social_action_claim(p_viewer,p_request_id,operation,payload);
 if replay is not null then return replay; end if;
 if p_reason is null or p_reason not in('spam','harassment','sexual','hate','other') or length(p_details)>500 then raise exception 'SOCIAL_CONFLICT'; end if;
 resolved:=public.social_profile_ref_subject(p_viewer,p_ref);
 if resolved is null then raise exception 'SOCIAL_NOT_FOUND'; end if;
 subject:=(resolved->>'subjectId')::uuid;
 if subject=p_viewer then raise exception 'SOCIAL_FORBIDDEN'; end if;
 select left(concat_ws(E'\n',
   'nickname: '||coalesce(nullif(btrim(p.nickname),''),'-'),
   'bio: '||coalesce(f.bio,'-'),
   'links: '||coalesce(nullif(array_to_string(f.sns_links,' '),''),'-'),
   'details: '||coalesce(nullif(btrim(p_details),''),'-')),2000)
  into snapshot
  from public.app_users u left join public.user_profiles p on p.app_user_id=u.id left join public.fan_profile_public_fields f on f.app_user_id=u.id where u.id=subject;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('social-profile-report:'||p_viewer::text||':'||subject::text,0));
 select * into prev from public.content_reports r where r.app_user_id=p_viewer and r.target_type='user_profile' and r.target_id=subject order by r.target_revision desc limit 1;
 -- An open report, or one already handled for the same text, is the answer: no second row for the queue.
 if prev.id is not null and (prev.status='open' or (select s.body from public.social_profile_report_snapshots s where s.report_id=prev.id) is not distinct from snapshot) then
  report:=prev.id;
 else
  if (select count(*) from public.content_reports r where r.app_user_id=p_viewer and r.target_type='user_profile' and r.created_at>now()-interval '24 hours')>=public.social_profile_report_daily_limit() then
   raise exception 'SOCIAL_RATE_LIMITED';
  end if;
  insert into public.content_reports(app_user_id,target_type,target_id,target_revision,target_app_user_id,reason,idempotency_key,context_target_type,context_target_id)
   values(p_viewer,'user_profile',subject,coalesce(prev.target_revision,0)+1,subject,p_reason,p_request_id,resolved->>'contextType',(resolved->>'contextId')::uuid)
   returning id into report;
  insert into public.social_profile_report_snapshots(report_id,body) values(report,snapshot);
 end if;
 result:=jsonb_build_object('id',report,'reported',true);
 return public.social_action_store(p_viewer,p_request_id,operation,payload,result);
end $$;
revoke all on function public.social_profile_report_daily_limit() from public,anon,authenticated,service_role;
revoke all on function public.report_social_profile(uuid,jsonb,text,text,uuid) from public,anon,authenticated;
grant execute on function public.report_social_profile(uuid,jsonb,text,text,uuid) to service_role;

create function pg_temp.b6_patch(p_sig regprocedure,p_anchor text,p_replacement text,p_count integer default 1)
returns void language plpgsql as $$
declare def text:=pg_catalog.pg_get_functiondef(p_sig);n integer;
begin
 n:=(length(def)-length(replace(def,p_anchor,'')))/length(p_anchor);
 if n<>p_count then raise exception 'B6_PROFILE_REPORT_UNPATCHED: % (% of %)',p_sig,n,p_count; end if;
 execute replace(def,p_anchor,p_replacement);
end $$;
do $snapshot$
declare sig regprocedure;def text;
begin
 foreach sig in array array['public.read_admin_content_reports(uuid,uuid,text,timestamptz,uuid,integer)',
  'public.resolve_admin_content_report_before_grant_correction(uuid,uuid,uuid,uuid,text,boolean,text,boolean)']::regprocedure[] loop
  def:=regexp_replace(pg_catalog.pg_get_functiondef(sig),'FUNCTION public\.([a-z_]+)\(','FUNCTION public.\1_before_b6(');
  execute def;
 end loop;
 revoke all on function public.read_admin_content_reports_before_b6(uuid,uuid,text,timestamptz,uuid,integer),
  public.resolve_admin_content_report_before_grant_correction_before_b6(uuid,uuid,uuid,uuid,text,boolean,text,boolean) from public,anon,authenticated,service_role;
end $snapshot$;

select pg_temp.b6_patch('public.read_admin_content_reports(uuid,uuid,text,timestamptz,uuid,integer)',
 $a$when 'dm_message'then(select body from public.social_dm_messages where id=r.body_target_id)else null end$a$,
 $a$when 'dm_message'then(select body from public.social_dm_messages where id=r.body_target_id)when 'user_profile'then(select s.body from public.social_profile_report_snapshots s where s.report_id=r.id)else null end$a$);
-- The user_profile report keeps its own body; only a block borrows its context's body.
select pg_temp.b6_patch('public.resolve_admin_content_report_before_grant_correction(uuid,uuid,uuid,uuid,text,boolean,text,boolean)',
 $a$if r.target_type='user_block'and p_hide_target then raise exception 'FAN_WEB_INVALID_INPUT';end if;$a$,
 $a$if r.target_type in('user_block','user_profile')and p_hide_target then raise exception 'FAN_WEB_INVALID_INPUT';end if;$a$);
select pg_temp.b6_patch('public.resolve_admin_content_report_before_grant_correction(uuid,uuid,uuid,uuid,text,boolean,text,boolean)',
 $a$if r.target_type in('dm_message','user_block')then$a$,
 $a$if r.target_type in('dm_message','user_block','user_profile')then$a$);

create or replace function public.b6_owner_function_names() returns text[] language sql immutable set search_path='' as $$
 select array['request_social_dm','resolve_social_dm','send_social_dm_message','send_social_dm_message_before_groups_text','send_social_dm_message_before_groups_media',
  'react_social_dm_message','block_social_profile','unblock_social_profile','read_owned_dm_conversations','read_social_dm_messages',
  'read_kyaa_wave_friend_messages','send_kyaa_wave_friend_message','assert_kyaa_wave_dm_pair','read_social_fan_profile','social_dm_request_state',
  'mobile_social_notification_path','evaluate_owned_kyaa_wave_missions','reconcile_wave_mission_evidence','read_admin_wave_stage_presentation',
  'read_owned_social_blocks_closed','social_lock_pair_for','social_lock_pair_actor','social_dm_request_count',
  'social_profile_ref_subject','social_profile_public_card','read_social_profile_by_ref','issue_social_profile_return_ref','read_social_profile_refs_open',
  'scrub_social_account_on_deletion','report_social_profile','read_admin_content_reports','resolve_admin_content_report_before_grant_correction']::text[]
$$;
create or replace function public.b6_owner_tables() returns table(table_name text,cmds text[]) language sql immutable set search_path='' as $$
 values('social_dm_request_log',array['select','insert']),('social_profile_return_refs',array['select','insert','delete']),
  ('social_profile_report_snapshots',array['select','insert'])
$$;
create or replace function public.b6_owner_functions() returns text[] language sql immutable set search_path='' as $$
 select array['public.social_lock_user_quiet(uuid)','public.social_lock_pair_actor(uuid,uuid)','public.social_lock_pair_for(uuid,uuid)',
  'public.social_dm_counterpart_open(uuid)','public.social_dm_hidden_for(uuid,public.social_dm_conversations)','public.social_dm_request_count(uuid)',
  'public.social_profile_is_public(uuid)','public.fan_web_lock_active_user(uuid)','public.group_wallet_enabled()','public.fan_web_blocked(uuid,uuid)',
  'public.social_profile_ref_subject(uuid,jsonb)','public.social_profile_public_card(uuid,public.content_locale)','public.fan_web_content_target(uuid,text,uuid,public.content_locale)',
  'public.group_post_visible(uuid,uuid)','public.read_page_ranking(uuid,text,text,uuid,timestamptz)','public.read_social_fan_profile(uuid,uuid,text,public.content_locale,timestamptz,uuid,text,integer)',
  'public.read_social_profile_reach(uuid,uuid)','public.read_social_profile_card(uuid,uuid,uuid,public.content_locale)','public.public_fan_avatar_url(uuid)',
  'public.mobile_profile_account_level(uuid)','public.fan_profile_favorite_json(uuid,public.content_locale)','public.get_fan_effective_tier(uuid,uuid)','public.passport_hearts(uuid,uuid)',
  'public.social_profile_report_daily_limit()','public.social_request_lock(uuid,uuid)','public.social_action_claim(uuid,uuid,text,text)','public.social_action_store(uuid,uuid,text,text,jsonb)']::text[]
$$;
revoke all on function public.b6_owner_function_names(),public.b6_owner_tables(),public.b6_owner_functions() from public,anon,authenticated,service_role;
select public.b6_owner_access();
select public.b6_owner_check();
commit;
