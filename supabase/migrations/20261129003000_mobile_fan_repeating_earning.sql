begin;
-- Forward-only extension. No policy is activated by deployment.
create table public.mobile_fan_earning_action_rules(
 policy_id uuid not null references public.mobile_fan_economy_policies(id),action_key text not null,
 scope_kind text not null check(scope_kind in('daily','lifetime','source')),
 daily_cap integer check(daily_cap>0),lifetime_cap integer check(lifetime_cap>0),
 primary key(policy_id,action_key),check((scope_kind='daily')=(daily_cap is not null)),
 check((scope_kind='lifetime')=(lifetime_cap is not null))
);
create table public.mobile_fan_earning_v2_activations(
 celebrity_id uuid not null references public.celebrities(id),version text not null,
 policy_id uuid not null unique references public.mobile_fan_economy_policies(id),effective_at timestamptz not null,
 manifest jsonb not null,primary key(celebrity_id,version)
);
-- A source tombstone survives content deletion and like cancellation. No body or path is copied.
create table public.mobile_fan_activity_sources(
 source_id uuid primary key,app_user_id uuid not null references public.app_users(id),
 celebrity_id uuid not null references public.celebrities(id),action_key text not null,
 source_type text not null,source_key uuid not null,target_key text not null,content_fingerprint text,
 occurred_at timestamptz not null,eligible boolean not null,
 captured_at timestamptz not null default clock_timestamp()
);
create index mobile_fan_activity_targets on public.mobile_fan_activity_sources(app_user_id,celebrity_id,action_key,target_key);
create index mobile_fan_activity_fingerprints on public.mobile_fan_activity_sources(app_user_id,celebrity_id,content_fingerprint)where content_fingerprint is not null;
create table public.mobile_fan_activity_decisions(
 id uuid primary key default extensions.gen_random_uuid(),app_user_id uuid not null references public.app_users(id),
 celebrity_id uuid not null references public.celebrities(id),action_key text not null,scope_key text not null,
 source_type text not null,source_id uuid not null,target_key text not null,
 occurred_at timestamptz not null,kst_day date not null,policy_id uuid not null references public.mobile_fan_economy_policies(id),
 decision text not null check(decision in('awarded','daily_limit','lifetime_limit','duplicate','not_eligible','disabled')),
 point_ledger_id uuid unique references public.mobile_fan_economy_ledger(id),
 decided_at timestamptz not null default clock_timestamp(),
 unique(app_user_id,celebrity_id,action_key,scope_key),
 check((decision='awarded')=(point_ledger_id is not null))
);
create index mobile_fan_activity_cap_usage on public.mobile_fan_activity_decisions(app_user_id,celebrity_id,action_key,kst_day)where decision='awarded';
do $$declare t text;begin
 foreach t in array array['mobile_fan_earning_action_rules','mobile_fan_earning_v2_activations','mobile_fan_activity_sources','mobile_fan_activity_decisions']loop
 execute format('alter table public.%I enable row level security',t);
 execute format('alter table public.%I force row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 execute format('create trigger immutable before update or delete on public.%I for each row execute function public.reject_fan_ticket_ledger_mutation()',t);
 execute format('create trigger no_truncate before truncate on public.%I for each statement execute function public.reject_fan_ticket_ledger_mutation()',t);
 end loop;
end $$;
alter table public.fan_post_likes add column reward_source_id uuid not null default extensions.gen_random_uuid() unique;
alter table public.fan_clip_likes add column reward_source_id uuid not null default extensions.gen_random_uuid() unique;
alter table public.celebrity_notice_likes add column reward_source_id uuid not null default extensions.gen_random_uuid() unique;
create function public.guard_mobile_fan_like_source()returns trigger language plpgsql set search_path='' as $$begin
 if new.reward_source_id is distinct from old.reward_source_id then raise exception 'FAN_ECONOMY_SOURCE_IMMUTABLE';end if;return new;
end $$;
do $$declare t text;begin foreach t in array array['fan_post_likes','fan_clip_likes','celebrity_notice_likes']loop
 execute format('create trigger reward_source_immutable before update on public.%I for each row execute function public.guard_mobile_fan_like_source()',t);
 end loop;end $$;
-- Only the validator, which reads the actual bytes, can bind a native upload digest.
alter table public.mobile_media_assets add column source_sha256 text check(source_sha256~'^[a-f0-9]{64}$');
create function public.guard_mobile_media_source_sha256()returns trigger language plpgsql set search_path='' as $$begin
 if old.source_sha256 is not null and new.source_sha256 is distinct from old.source_sha256 then raise exception 'MEDIA_SOURCE_IMMUTABLE';end if;return new;
end $$;
create trigger source_sha256_immutable before update on public.mobile_media_assets for each row execute function public.guard_mobile_media_source_sha256();
create function public.finish_mobile_media_validation_v2(p_asset_id uuid,p_asset_version integer,p_job_id uuid,p_content_type text,p_width integer,p_height integer,p_duration_seconds numeric,p_source_sha256 text)
returns void language plpgsql security definer set search_path='' as $$begin
 if p_source_sha256 is null or p_source_sha256!~'^[a-f0-9]{64}$'then raise exception 'MEDIA_INVALID_SOURCE';end if;
 perform public.finish_mobile_media_validation(p_asset_id,p_asset_version,p_job_id,p_content_type,p_width,p_height,p_duration_seconds);
 update public.mobile_media_assets set source_sha256=p_source_sha256 where id=p_asset_id and asset_version=p_asset_version;
end $$;
-- Keep the original producer intact for old policies and old timestamps.
alter function public.fan_ticket_activity_sources(uuid,uuid) rename to fan_ticket_activity_sources_v1;
create function public.fan_ticket_activity_sources(p_owner uuid default null,p_creator uuid default null)
returns table(app_user_id uuid,celebrity_id uuid,action_key text,scope_key text,source_id uuid,occurred_at timestamptz)
language sql stable security definer set search_path='' as $$
 select s.* from public.fan_ticket_activity_sources_v1(p_owner,p_creator)s
 where not(s.action_key in('reaction','comment','share')and exists(
 select 1 from public.mobile_fan_earning_v2_activations a where a.celebrity_id=s.celebrity_id and a.effective_at<=s.occurred_at))
 union all select s.app_user_id,s.celebrity_id,s.action_key,s.source_id::text,s.source_id,s.occurred_at
 from public.mobile_fan_activity_sources s join public.app_users u on u.id=s.app_user_id and u.status='active'
 join public.celebrities c on c.id=s.celebrity_id and c.status='published'and c.archived_at is null
 where(p_owner is null or s.app_user_id=p_owner)and(p_creator is null or s.celebrity_id=p_creator)
 and exists(select 1 from public.mobile_fan_earning_v2_activations a where a.celebrity_id=s.celebrity_id and a.effective_at<=s.occurred_at)
$$;
alter function public.award_mobile_fan_activity(uuid,uuid,text,text) rename to award_mobile_fan_activity_v1;
create function public.award_mobile_fan_activity(p_owner uuid,p_creator uuid,p_action text,p_scope text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare evidence record;policy public.mobile_fan_economy_policies%rowtype;rule public.mobile_fan_earning_action_rules%rowtype;
 prior public.mobile_fan_activity_decisions%rowtype;source public.mobile_fan_activity_sources%rowtype;
 entry uuid;amount bigint;reason text;day date;target text;stype text;
begin
 perform public.mobile_fan_lock_reward_source(p_owner,p_creator);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-economy-wallet:'||p_owner||':'||p_creator,0));
 select * into prior from public.mobile_fan_activity_decisions where app_user_id=p_owner and celebrity_id=p_creator and action_key=p_action and scope_key=p_scope;
 if found then return jsonb_build_object('status',case when prior.decision='awarded'then'awarded'else'not_eligible'end,'asset','fan_point','amount',coalesce((select l.amount from public.mobile_fan_economy_ledger l where l.id=prior.point_ledger_id),0),'policyVersion',(select version from public.mobile_fan_economy_policies where id=prior.policy_id),'sourceId',prior.source_id,'ledgerId',prior.point_ledger_id);end if;
 -- Financial receipts precede decisions and must never be overwritten or recounted.
 if exists(select 1 from public.mobile_fan_economy_activity_receipts where app_user_id=p_owner and celebrity_id=p_creator and action_key=p_action and scope_key=p_scope)then
 return public.award_mobile_fan_activity_v1(p_owner,p_creator,p_action,p_scope);end if;
 select * into evidence from public.fan_ticket_activity_sources(p_owner,p_creator)where action_key=p_action and scope_key=p_scope;
 if not found then return jsonb_build_object('status','not_eligible','asset','fan_point','amount',0,'policyVersion',null,'sourceId',null,'ledgerId',null);end if;
 select * into policy from public.mobile_fan_economy_policies where celebrity_id=p_creator and kind='earning'and effective_at<=evidence.occurred_at and(retired_at is null or evidence.occurred_at<retired_at)order by effective_at desc limit 1;
 select * into rule from public.mobile_fan_earning_action_rules where policy_id=policy.id and action_key=p_action;
 if not found then return public.award_mobile_fan_activity_v1(p_owner,p_creator,p_action,p_scope);end if;
 select * into source from public.mobile_fan_activity_sources where source_id=evidence.source_id;
 target:=coalesce(source.target_key,p_action||':'||p_scope);stype:=coalesce(source.source_type,p_action);
 day:=(evidence.occurred_at at time zone 'Asia/Seoul')::date;
 amount:=(policy.rules->>p_action)::bigint;reason:='awarded';
 if exists(select 1 from public.fan_ticket_activity_awards where app_user_id=p_owner and celebrity_id=p_creator and action_key=p_action and scope_key=p_scope)
 or exists(select 1 from public.fan_ticket_ledger l where l.app_user_id=p_owner and l.celebrity_id=p_creator and l.amount>0 and l.source_id=evidence.source_id)
 or(p_action='first_clip'and exists(select 1 from public.mobile_content_clip_reward_awards where app_user_id=p_owner and celebrity_id=p_creator))then reason:='duplicate';
 elsif source.source_id is not null and not source.eligible then reason:='not_eligible';
 elsif source.source_id is not null and exists(select 1 from public.mobile_fan_activity_sources s where s.app_user_id=p_owner and s.celebrity_id=p_creator and s.action_key=p_action and s.source_id<>source.source_id and s.captured_at<=source.captured_at and(s.target_key=target or(source.content_fingerprint is not null and s.content_fingerprint=source.content_fingerprint)))then reason:='duplicate';
 elsif(p_action='certification'or p_action like 'membership_%')and exists(
 select 1 from public.certification_uploads u left join public.mobile_media_assets m on m.id=u.mobile_media_asset_id
 where u.consumed_submission_id=evidence.source_id and(coalesce(u.sha256,m.source_sha256)is null or(u.mobile_media_asset_id is not null and m.state is distinct from'ready')))then reason:='not_eligible';
 elsif(p_action='certification'or p_action like 'membership_%')and exists(
 select 1 from public.certification_uploads u left join public.mobile_media_assets m on m.id=u.mobile_media_asset_id
 join public.certification_uploads old on old.app_user_id=u.app_user_id and old.celebrity_id=u.celebrity_id and old.consumed_submission_id<>u.consumed_submission_id
 left join public.mobile_media_assets om on om.id=old.mobile_media_asset_id
 join public.certification_submissions s on s.id=old.consumed_submission_id and s.status='approved'
 where u.consumed_submission_id=evidence.source_id and coalesce(u.sha256,m.source_sha256)=coalesce(old.sha256,om.source_sha256)and(s.reviewed_at,s.id)<(evidence.occurred_at,evidence.source_id))then reason:='duplicate';
 elsif p_action='invitation_milestone'and rule.lifetime_cap is not null and p_scope::bigint>rule.lifetime_cap then reason:='lifetime_limit';
 elsif rule.lifetime_cap is not null and(select count(*)from public.mobile_fan_economy_activity_receipts r where r.app_user_id=p_owner and r.celebrity_id=p_creator and r.action_key=p_action)>=rule.lifetime_cap then reason:='lifetime_limit';
 elsif rule.daily_cap is not null and(select count(*)from public.mobile_fan_economy_activity_receipts r where r.app_user_id=p_owner and r.celebrity_id=p_creator and r.action_key=p_action and(r.occurred_at at time zone 'Asia/Seoul')::date=day)>=rule.daily_cap then reason:='daily_limit';
 elsif amount=0 then reason:='disabled';end if;
 if reason='awarded'then
 entry:=public.mobile_fan_economy_post(p_owner,p_creator,'fan_point',amount,'activity',evidence.source_id,policy.id);
 insert into public.mobile_fan_economy_activity_receipts(app_user_id,celebrity_id,action_key,scope_key,source_id,occurred_at,policy_id,point_ledger_id)values(p_owner,p_creator,p_action,p_scope,evidence.source_id,evidence.occurred_at,policy.id,entry);
 end if;
 insert into public.mobile_fan_activity_decisions(app_user_id,celebrity_id,action_key,scope_key,source_type,source_id,target_key,occurred_at,kst_day,policy_id,decision,point_ledger_id)
 values(p_owner,p_creator,p_action,p_scope,stype,evidence.source_id,target,evidence.occurred_at,day,policy.id,reason,entry);
 return jsonb_build_object('status',case when reason='awarded'then'awarded'else'not_eligible'end,'asset','fan_point','amount',case when reason='awarded'then amount else 0 end,'policyVersion',policy.version,'sourceId',evidence.source_id,'ledgerId',entry);
end $$;
create function public.capture_mobile_fan_activity_event()returns trigger language plpgsql security definer set search_path='' as $$
declare owner_id uuid;creator uuid;sid uuid;action text;target text;body text;fingerprint text;happened timestamptz;eligible boolean:=true;target_owner uuid;assets text;
begin
 owner_id:=(to_jsonb(new)->>'app_user_id')::uuid;happened:=coalesce((to_jsonb(new)->>'created_at')::timestamptz,(to_jsonb(new)->>'visited_at')::timestamptz);sid:=(to_jsonb(new)->>'id')::uuid;
 case tg_table_name
 when 'fan_post_likes','fan_post_comments'then
 select p.celebrity_id,p.app_user_id,p.deleted_at is null and p.hidden_at is null into creator,target_owner,eligible from public.fan_posts p where p.id=new.post_id;
 target:='fan_post:'||new.post_id;
 when 'fan_clip_likes','fan_clip_comments'then
 select p.celebrity_id,p.app_user_id,p.deleted_at is null and p.hidden_at is null into creator,target_owner,eligible from public.fan_clips p where p.id=new.clip_id;
 target:='fan_clip:'||new.clip_id;
 when 'celebrity_notice_likes','celebrity_notice_comments'then
 select n.celebrity_id,n.publication_status='published'and n.archived_at is null into creator,eligible from public.celebrity_notices n where n.id=new.notice_id;
 target:='notice:'||new.notice_id;
 when 'fan_lounge_messages'then creator:=new.celebrity_id;target:='lounge:'||coalesce(new.reply_to_id,new.id);eligible:=new.removed_at is null;
 when 'fan_posts'then
 creator:=new.celebrity_id;target:='fan_post:'||new.id;
 select p.body,p.deleted_at is null and p.hidden_at is null into body,eligible from public.fan_posts p where p.id=new.id;
 select string_agg(a.sha256,','order by a.sha256)into assets from(
 select a.sha256 from public.content_assets a where a.post_id=new.id
 union all select a.source_sha256 from public.mobile_media_assets a where a.attached_type='fan_post'and a.attached_id=new.id and a.state='ready')a;
 -- Historical native uploads without a byte digest retain their content but earn no new points.
 eligible:=eligible and not exists(select 1 from public.mobile_media_assets a where a.attached_type='fan_post'and a.attached_id=new.id and(a.state<>'ready'or a.source_sha256 is null));
 when 'community_stamp_share_visits'then
 select l.owner_app_user_id,l.celebrity_id into owner_id,creator from public.community_stamp_share_links l where l.id=new.share_link_id;
 happened:=new.visited_at;target:='share:'||new.visitor_app_user_id||':'||(new.visited_at at time zone 'Asia/Seoul')::date;
 eligible:=new.visitor_app_user_id<>owner_id;
 else return new;
 end case;
 if creator is null then return new;end if;
 perform public.mobile_fan_lock_reward_source(owner_id,creator);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-economy-wallet:'||owner_id||':'||creator,0));
 if tg_table_name like '%_likes'then sid:=new.reward_source_id;action:='reaction';eligible:=eligible and target_owner is distinct from owner_id;
 elsif tg_table_name='community_stamp_share_visits'then action:='share';
 else
 action:='comment';body:=coalesce(body,to_jsonb(new)->>'body','');
 eligible:=eligible and coalesce(to_jsonb(new)->>'deleted_at',to_jsonb(new)->>'hidden_at',to_jsonb(new)->>'removed_at')is null;
 fingerprint:=encode(extensions.digest(lower(regexp_replace(btrim(body),'[[:space:]]+',' ','g'))||coalesce('|assets:'||assets,''),'sha256'),'hex');
 end if;
 insert into public.mobile_fan_activity_sources(source_id,app_user_id,celebrity_id,action_key,source_type,source_key,target_key,content_fingerprint,occurred_at,eligible)
 values(sid,owner_id,creator,action,tg_table_name,case when action='reaction'then split_part(target,':',2)::uuid else sid end,target,fingerprint,happened,eligible)on conflict(source_id)do nothing;
 if exists(select 1 from public.mobile_fan_earning_v2_activations a where a.celebrity_id=creator and a.effective_at<=happened)then
 perform public.award_mobile_fan_activity(owner_id,creator,action,sid::text);end if;
 return new;
end $$;
-- The post source is captured after create_owned_fan_post has attached all assets.
do $$declare t text;begin
 foreach t in array array['fan_post_likes','fan_clip_likes','celebrity_notice_likes','fan_lounge_messages','celebrity_notice_comments','fan_post_comments','fan_clip_comments','community_stamp_share_visits']loop
 execute format('create trigger zzz_repeating_earning after insert on public.%I for each row execute function public.capture_mobile_fan_activity_event()',t);
 end loop;
end $$;
create constraint trigger zzz_repeating_earning after insert on public.fan_posts deferrable initially deferred for each row execute function public.capture_mobile_fan_activity_event();
-- Disallow the old once branch for v2 repeat sources, including identity fan_reactions.
do $$declare definition text;needle text:=' perform public.award_fan_ticket_activity(owner_id,creator_id,action,scope,false);';begin
 select pg_get_functiondef('public.reward_fan_ticket_activity_event()'::regprocedure)into definition;
 if position(needle in definition)=0 then raise exception 'FAN_ECONOMY_PRODUCER_CONTRACT_CHANGED';end if;
 execute replace(definition,needle,$patch$
 if action in('reaction','comment','share')and exists(select 1 from public.mobile_fan_earning_v2_activations a where a.celebrity_id=creator_id and a.effective_at<=coalesce((to_jsonb(new)->>'created_at')::timestamptz,(to_jsonb(new)->>'completed_at')::timestamptz,(to_jsonb(new)->>'visited_at')::timestamptz))then return new;end if;
 perform public.award_fan_ticket_activity(owner_id,creator_id,action,scope,false);$patch$);
end $$;

create function public.activate_mobile_fan_earning_v2(p_celebrity_id uuid,p_version text,p_rules jsonb,p_action_rules jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare boundary timestamptz;policy uuid;prior public.mobile_fan_earning_v2_activations%rowtype;manifest jsonb;item jsonb;action text;expected_scope text;expected_daily integer;expected_lifetime integer;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-earning-creator:'||p_celebrity_id,0));
 perform 1 from public.celebrities where id=p_celebrity_id and status='published'and archived_at is null for share;
 if not found then raise exception 'FAN_ECONOMY_FAVORITE_UNAVAILABLE';end if;
 if p_version is null or length(p_version)not between 1 and 80 or jsonb_typeof(p_rules)is distinct from'object'or jsonb_typeof(p_action_rules)is distinct from'array'then raise exception 'FAN_ECONOMY_POLICY_UNCONFIGURED';end if;
 if p_rules->>'checkin'is distinct from'100'then raise exception 'FAN_ECONOMY_POLICY_UNCONFIGURED';end if;
 if jsonb_array_length(p_action_rules)<>15 or(select count(*)from jsonb_object_keys(p_rules))<>15 or(select count(distinct x->>'key')from jsonb_array_elements(p_action_rules)x)<>15 then raise exception 'FAN_ECONOMY_POLICY_UNCONFIGURED';end if;
 foreach action in array array['verification','reaction','comment','checkin','certification','membership_instagram','membership_tiktok','membership_youtube','share','live_reservation','live_attendance','mission_completion','first_clip','journey_completion','invitation_milestone']loop
 select x into item from jsonb_array_elements(p_action_rules)x where x->>'key'=action;
 expected_scope:=case when action in('verification','membership_instagram','membership_tiktok','membership_youtube','first_clip','invitation_milestone')then'lifetime'else'daily'end;
 expected_daily:=case when expected_scope='daily'then case action when'reaction'then 5 when'comment'then 2 else 1 end end;
 expected_lifetime:=case when expected_scope='lifetime'then case when action='invitation_milestone'then 5 else 1 end end;
 if item is null or item->>'scope'is distinct from expected_scope or(item->>'dailyLimit')::integer is distinct from expected_daily or(item->>'lifetimeLimit')::integer is distinct from expected_lifetime
 or coalesce(p_rules->>action,'')!~'^(0|[1-9][0-9]*)$'or(p_rules->>action)::numeric>9007199254740991 then raise exception 'FAN_ECONOMY_POLICY_UNCONFIGURED';end if;
 end loop;
 select jsonb_build_object('rules',p_rules,'actions',jsonb_agg(x order by x->>'key'))into manifest from jsonb_array_elements(p_action_rules)x;
 select * into prior from public.mobile_fan_earning_v2_activations where celebrity_id=p_celebrity_id and version=p_version;
 if found then
 if prior.manifest is distinct from manifest then raise exception 'FAN_ECONOMY_REQUEST_CONFLICT';end if;
 return jsonb_build_object('policyId',prior.policy_id,'effectiveAt',prior.effective_at,'version',p_version,'replayed',true);end if;
 boundary:=clock_timestamp();
 update public.mobile_fan_economy_policies set retired_at=boundary where celebrity_id=p_celebrity_id and kind='earning'and retired_at is null;
 insert into public.mobile_fan_economy_policies(celebrity_id,version,kind,rules,effective_at)values(p_celebrity_id,p_version,'earning',p_rules,boundary)returning id into policy;
 insert into public.mobile_fan_earning_cutovers(celebrity_id,policy_id,effective_at,version)values(p_celebrity_id,policy,boundary,p_version)on conflict(celebrity_id)do nothing;
 insert into public.mobile_fan_earning_action_rules(policy_id,action_key,scope_kind,daily_cap,lifetime_cap)
 select policy,x->>'key',x->>'scope',(x->>'dailyLimit')::integer,(x->>'lifetimeLimit')::integer from jsonb_array_elements(p_action_rules)x;
 -- Existing likes are ineligible tombstones; deletion before this first snapshot cannot be reconstructed.
 insert into public.mobile_fan_activity_sources(source_id,app_user_id,celebrity_id,action_key,source_type,source_key,target_key,occurred_at,eligible)
 select l.reward_source_id,l.app_user_id,p.celebrity_id,'reaction','fan_post_likes',p.id,'fan_post:'||p.id,l.created_at,false from public.fan_post_likes l join public.fan_posts p on p.id=l.post_id where p.celebrity_id=p_celebrity_id
 union all select l.reward_source_id,l.app_user_id,p.celebrity_id,'reaction','fan_clip_likes',p.id,'fan_clip:'||p.id,l.created_at,false from public.fan_clip_likes l join public.fan_clips p on p.id=l.clip_id where p.celebrity_id=p_celebrity_id
 union all select l.reward_source_id,l.app_user_id,p.celebrity_id,'reaction','celebrity_notice_likes',p.id,'notice:'||p.id,l.created_at,false from public.celebrity_notice_likes l join public.celebrity_notices p on p.id=l.notice_id where p.celebrity_id=p_celebrity_id
 on conflict(source_id)do nothing;
 insert into public.mobile_fan_activity_sources(source_id,app_user_id,celebrity_id,action_key,source_type,source_key,target_key,content_fingerprint,occurred_at,eligible)
 select x.id,x.owner,p_celebrity_id,'comment',x.kind,x.id,x.target,encode(extensions.digest(lower(regexp_replace(btrim(x.body),'[[:space:]]+',' ','g'))||coalesce('|assets:'||x.assets,''),'sha256'),'hex'),x.happened,false from(
 select m.id,m.app_user_id owner,'fan_lounge_messages'kind,'lounge:'||coalesce(m.reply_to_id,m.id)target,m.body,null::text assets,m.created_at happened from public.fan_lounge_messages m where m.celebrity_id=p_celebrity_id
 union all select m.id,m.app_user_id,'celebrity_notice_comments','notice:'||n.id,m.body,null,m.created_at from public.celebrity_notice_comments m join public.celebrity_notices n on n.id=m.notice_id where n.celebrity_id=p_celebrity_id
 union all select m.id,m.app_user_id,'fan_post_comments','fan_post:'||p.id,m.body,null,m.created_at from public.fan_post_comments m join public.fan_posts p on p.id=m.post_id where p.celebrity_id=p_celebrity_id
 union all select m.id,m.app_user_id,'fan_clip_comments','fan_clip:'||p.id,m.body,null,m.created_at from public.fan_clip_comments m join public.fan_clips p on p.id=m.clip_id where p.celebrity_id=p_celebrity_id
 union all select p.id,p.app_user_id,'fan_posts','fan_post:'||p.id,p.body,(select string_agg(a.sha256,','order by a.sha256)from(
 select a.sha256 from public.content_assets a where a.post_id=p.id
 union all select a.source_sha256 from public.mobile_media_assets a where a.attached_type='fan_post'and a.attached_id=p.id and a.state='ready')a),p.created_at from public.fan_posts p where p.celebrity_id=p_celebrity_id
 )x on conflict(source_id)do nothing;
 insert into public.mobile_fan_earning_v2_activations values(p_celebrity_id,p_version,policy,boundary,manifest);
 return jsonb_build_object('policyId',policy,'effectiveAt',boundary,'version',p_version,'replayed',false);
end $$;

alter function public.read_owned_mobile_fan_reward(uuid,uuid)rename to read_owned_mobile_fan_reward_v1;
create function public.read_owned_mobile_fan_reward(p_app_user_id uuid,p_source_id uuid)returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.mobile_fan_activity_decisions%rowtype;begin
 perform public.fan_web_lock_active_user(p_app_user_id);
 select * into d from public.mobile_fan_activity_decisions where app_user_id=p_app_user_id and source_id=p_source_id;
 if found then return jsonb_build_object('status',case when d.decision='awarded'then'awarded'else'not_eligible'end,'asset','fan_point','amount',coalesce((select amount from public.mobile_fan_economy_ledger where id=d.point_ledger_id),0),'policyVersion',(select version from public.mobile_fan_economy_policies where id=d.policy_id),'sourceId',d.source_id,'ledgerId',d.point_ledger_id);end if;
 return public.read_owned_mobile_fan_reward_v1(p_app_user_id,p_source_id);
end $$;
create function public.read_owned_mobile_fan_activity_source(p_app_user_id uuid,p_celebrity_slug text,p_source_type text,p_source_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$declare creator uuid;sid uuid;begin
 perform public.fan_web_lock_active_user(p_app_user_id);creator:=public.mobile_fan_economy_favorite(p_app_user_id,p_celebrity_slug);
 if p_source_type not in('fan_post_likes','fan_clip_likes','celebrity_notice_likes','fan_lounge_messages','celebrity_notice_comments','fan_posts','fan_post_comments','fan_clip_comments','quiz_attempts','live_survey_responses')or p_source_type is null or p_source_key is null then raise exception 'FAN_ECONOMY_INVALID';end if;
 if p_source_type='live_survey_responses'then
 select r.id into sid from public.live_survey_responses r where r.app_user_id=p_app_user_id and r.celebrity_id=creator and r.survey_id=p_source_key and r.status='submitted'and not r.legacy_contract;
 return jsonb_build_object('sourceId',sid);end if;
 if p_source_type='quiz_attempts'then
 select q.id into sid from public.quiz_passes q join public.quiz_attempts a on a.id=q.winning_attempt_id and a.app_user_id=q.app_user_id and a.celebrity_id=q.celebrity_id and a.status='passed'
 where q.app_user_id=p_app_user_id and q.celebrity_id=creator and a.id=p_source_key;
 return jsonb_build_object('sourceId',sid);end if;
 select s.source_id into sid from public.mobile_fan_activity_sources s where s.app_user_id=p_app_user_id and s.celebrity_id=creator and s.source_type=p_source_type and s.source_key=p_source_key order by s.captured_at,s.source_id limit 1;
 return jsonb_build_object('sourceId',sid);
end $$;
create function public.read_owned_mobile_fan_earning_status(p_app_user_id uuid,p_celebrity_slug text)
returns jsonb language plpgsql security definer set search_path='' as $$declare creator uuid;policy public.mobile_fan_economy_policies%rowtype;result jsonb;begin
 perform public.fan_web_lock_active_user(p_app_user_id);creator:=public.mobile_fan_economy_favorite(p_app_user_id,p_celebrity_slug);
 select * into policy from public.mobile_fan_economy_policies where celebrity_id=creator and kind='earning'and effective_at<=clock_timestamp()and(retired_at is null or clock_timestamp()<retired_at)order by effective_at desc limit 1;
 if not found or not exists(select 1 from public.mobile_fan_earning_action_rules where policy_id=policy.id)then return jsonb_build_object('celebrityId',creator,'policy',jsonb_build_object('status','unconfigured','version',null),'actions','[]'::jsonb);end if;
 select jsonb_agg(jsonb_build_object('key',r.action_key,'pointAmount',(policy.rules->>r.action_key)::bigint,'scope',r.scope_kind,'dailyLimit',r.daily_cap,'usedToday',usage.today,'remainingToday',case when r.daily_cap is not null then greatest(r.daily_cap-usage.today,0)end,'lifetimeLimit',r.lifetime_cap,'lifetimeUsed',usage.total,'status',case when(policy.rules->>r.action_key)::bigint=0 then'disabled'when r.lifetime_cap is not null and usage.total>=r.lifetime_cap then'lifetime_limit'
 when r.scope_kind='lifetime'and r.action_key<>'invitation_milestone'and(
 exists(select 1 from public.fan_ticket_activity_sources_v1(p_app_user_id,creator)s where s.action_key=r.action_key and s.scope_key='once')
 or exists(select 1 from public.fan_ticket_activity_awards a where a.app_user_id=p_app_user_id and a.celebrity_id=creator and a.action_key=r.action_key and a.scope_key='once')
 or(r.action_key='first_clip'and exists(select 1 from public.mobile_content_clip_reward_awards a where a.app_user_id=p_app_user_id and a.celebrity_id=creator)))then'not_eligible'
 when r.daily_cap is not null and usage.today>=r.daily_cap then'daily_limit'else'available'end,'sourceId',latest.source_id,'ledgerId',latest.point_ledger_id)order by r.action_key)into result
 from public.mobile_fan_earning_action_rules r
 -- Invitation ordinals consume account-global opportunities, including old ticket rewards.
 cross join lateral(select count(*)filter(where(x.occurred_at at time zone 'Asia/Seoul')::date=public.community_stamp_kst_date())today,
 case when r.action_key='invitation_milestone'then least(r.lifetime_cap,greatest(count(*),
 coalesce((select max(m.milestone_number)from public.community_stamp_invitation_milestones m where m.inviter_app_user_id=p_app_user_id),0),
 case when exists(select 1 from public.mobile_fan_activity_decisions d where d.app_user_id=p_app_user_id and d.action_key='invitation_milestone'and d.decision='lifetime_limit')then r.lifetime_cap else 0 end))else count(*)end total
 from public.mobile_fan_economy_activity_receipts x where x.app_user_id=p_app_user_id and x.celebrity_id=creator and x.action_key=r.action_key)usage
 left join lateral(select d.source_id,d.point_ledger_id from public.mobile_fan_activity_decisions d where d.app_user_id=p_app_user_id and d.celebrity_id=creator and d.action_key=r.action_key order by d.decided_at desc,d.id desc limit 1)latest on true
 where r.policy_id=policy.id;
 return jsonb_build_object('celebrityId',creator,'policy',jsonb_build_object('status','configured','version',policy.version),'actions',coalesce(result,'[]'::jsonb));
end $$;
-- Once missions cannot represent repeated sources or their daily caps.
alter function public.read_owned_mobile_fan_economy_missions(uuid,text)rename to read_owned_mobile_fan_economy_missions_v1;
create function public.read_owned_mobile_fan_economy_missions(p_app_user_id uuid,p_celebrity_slug text)returns jsonb language plpgsql security definer set search_path='' as $$declare result jsonb;creator uuid;begin
 result:=public.read_owned_mobile_fan_economy_missions_v1(p_app_user_id,p_celebrity_slug);creator:=(result->>'celebrityId')::uuid;
 return jsonb_set(result,'{missions}',coalesce((select jsonb_agg(m)from jsonb_array_elements(result->'missions')m where not exists(select 1 from public.mobile_fan_earning_action_rules r join public.mobile_fan_economy_policies p on p.id=r.policy_id where p.celebrity_id=creator and p.kind='earning'and p.effective_at<=clock_timestamp()and(p.retired_at is null or clock_timestamp()<p.retired_at)and r.scope_kind='daily'and r.action_key=m->>'key')),'[]'::jsonb));
end $$;
-- Qualification/stamp completion and milestone points are separate. Keep the legacy state vocabulary.
do $$declare definition text;needle text:=' if reward->>''status''<>''awarded''then return jsonb_build_object(''state'',''reward_pending_configuration'',''replayed'',false);end if;';begin
 select pg_get_functiondef('public.process_community_stamp_invitation_milestone(uuid,bigint)'::regprocedure)into definition;
 if position(needle in definition)=0 then raise exception 'FAN_ECONOMY_INVITATION_CONTRACT_CHANGED';end if;
 execute replace(definition,needle,$patch$
 if reward->>'status'<>'awarded'then
 if exists(select 1 from public.mobile_fan_activity_decisions d where d.app_user_id=p_inviter_app_user_id and d.source_id=milestone.id and d.decision in('lifetime_limit','duplicate','not_eligible','disabled'))then return jsonb_build_object('state','qualified_reward_issued','replayed',true);end if;
 return jsonb_build_object('state','reward_pending_configuration','replayed',false);end if;$patch$);
end $$;
do $$declare definition text;needle text:='and pending.status=''pending_configuration'' order by pending.milestone_number';begin
 select pg_get_functiondef('public.qualify_community_stamp_invitation_on_quiz_pass()'::regprocedure)into definition;
 if position(needle in definition)=0 then raise exception 'FAN_ECONOMY_INVITATION_RETRY_CONTRACT_CHANGED';end if;
 execute replace(definition,needle,'and pending.status=''pending_configuration'' and not exists(select 1 from public.mobile_fan_activity_decisions d where d.app_user_id=pending.inviter_app_user_id and d.source_id=pending.id and d.decision in(''lifetime_limit'',''duplicate'',''not_eligible'',''disabled'')) order by pending.milestone_number');
end $$;
-- An unawarded decision is still creator-bound proof; it must not cross favorites.
do $$declare definition text;needle text:='if exists(select 1 from public.mobile_fan_economy_activity_receipts where app_user_id=p_app_user_id and source_id=p_source_id and celebrity_id<>creator)then';begin
 select pg_get_functiondef('public.read_owned_mobile_fan_support_reward(uuid,uuid,bigint,text)'::regprocedure)into definition;
 if position(needle in definition)=0 then raise exception 'FAN_ECONOMY_PROOF_CONTRACT_CHANGED';end if;
 execute replace(definition,needle,'if exists(select 1 from public.mobile_fan_activity_decisions where app_user_id=p_app_user_id and source_id=p_source_id and celebrity_id<>creator)or '||substr(needle,4));
end $$;
-- Renamed v1 helpers inherit old grants: close them as well as all new internal functions.
do $$declare f record;begin
 for f in select oid::regprocedure signature,proname from pg_proc where pronamespace='public'::regnamespace and(proname in('guard_mobile_media_source_sha256','finish_mobile_media_validation_v2','guard_mobile_fan_like_source','fan_ticket_activity_sources_v1','fan_ticket_activity_sources','award_mobile_fan_activity_v1','award_mobile_fan_activity','capture_mobile_fan_activity_event','activate_mobile_fan_earning_v2','read_owned_mobile_fan_reward_v1','read_owned_mobile_fan_reward','read_owned_mobile_fan_activity_source','read_owned_mobile_fan_earning_status','read_owned_mobile_fan_economy_missions_v1','read_owned_mobile_fan_economy_missions'))loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 if f.proname in('finish_mobile_media_validation_v2','activate_mobile_fan_earning_v2','read_owned_mobile_fan_reward','read_owned_mobile_fan_activity_source','read_owned_mobile_fan_earning_status','read_owned_mobile_fan_economy_missions')then execute format('grant execute on function %s to service_role',f.signature);end if;
 end loop;
end $$;
commit;
