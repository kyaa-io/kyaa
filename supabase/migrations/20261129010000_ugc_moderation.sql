-- Keep moderation separate from account deletion and its destructive disable hooks.
create table public.app_user_moderation_restrictions (
 app_user_id uuid primary key references public.app_users(id) on delete restrict,
 report_id uuid not null references public.content_reports(id) on delete restrict,
 reason text not null check(length(btrim(reason)) between 10 and 500),
 actor_admin_id uuid not null references public.admin_allowlist(id) on delete restrict,
 created_at timestamptz not null default clock_timestamp(), revoked_at timestamptz
);
alter table public.app_user_moderation_restrictions enable row level security;
alter table public.app_user_moderation_restrictions force row level security;
revoke all on public.app_user_moderation_restrictions from public,anon,authenticated,service_role;
grant select on public.app_user_moderation_restrictions to service_role;

alter function public.fan_web_lock_active_user(uuid) rename to fan_web_lock_active_user_before_moderation;
create function public.fan_web_lock_active_user(p_app_user_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.fan_web_lock_active_user_before_moderation(p_app_user_id);
 if exists(select 1 from public.app_user_moderation_restrictions where app_user_id=p_app_user_id and revoked_at is null) then raise exception 'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED' using errcode='42501'; end if;
end $$;

create function public.ugc_body_rejected(p_body text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.prohibited_nickname_catalog c
 where c.active and c.reason_code='abusive' and c.catalog_version='fan-nickname-v1'
 and case when c.value_normalized ~ '^[a-z0-9]+$'
 then lower(translate(normalize(coalesce(p_body,''),NFKC),U&'\200B\200C\200D\2060\FEFF','')) ~ ('\m'||c.value_normalized||'\M')
 else position(c.value_normalized in lower(translate(normalize(coalesce(p_body,''),NFKC),U&'\200B\200C\200D\2060\FEFF','')))>0 end)
$$;
create function public.guard_ugc_body() returns trigger language plpgsql security definer set search_path='' as $$
declare n jsonb:=to_jsonb(new); o jsonb;
begin
 if tg_op='UPDATE' then o:=to_jsonb(old); end if;
 if (tg_op='INSERT' or n->'body' is distinct from o->'body') and public.ugc_body_rejected(new.body) then raise exception 'CONTENT_REJECTED' using errcode='22023'; end if;
 if tg_table_name='live_fan_submissions' and (tg_op='INSERT' or n->'song' is distinct from o->'song')
 and (public.ugc_body_rejected(n->'song'->>'title') or public.ugc_body_rejected(n->'song'->>'artist') or public.ugc_body_rejected(n->'song'->>'album')) then raise exception 'CONTENT_REJECTED' using errcode='22023'; end if;
 return new;
end $$;
do $$ declare t text; begin
 foreach t in array array['fan_posts','fan_post_comments','fan_clips','fan_clip_comments','celebrity_notice_comments','fan_lounge_messages','live_fan_submissions','mobile_participation_posts','mobile_participation_comments','social_dm_messages'] loop
 execute format('create trigger ugc_body_filter before insert or update on public.%I for each row execute function public.guard_ugc_body()',t);
 end loop;
end $$;

alter table public.content_reports alter column celebrity_id drop not null;
alter table public.content_reports drop constraint content_reports_target_type_check;
alter table public.content_reports add constraint content_reports_target_type_check check(target_type in('fan_post','fan_post_comment','fan_clip','fan_clip_comment','notice','notice_comment','cheer','live_submission','participation_post','participation_comment','dm_message','user_block'));
alter table public.content_reports add column context_target_type text check(context_target_type in('fan_post','fan_post_comment','fan_clip','fan_clip_comment','notice','notice_comment','cheer','live_submission','participation_post','participation_comment')),add column context_target_id uuid,
 add column author_restricted boolean not null default false,
 add constraint content_reports_context_pair check((context_target_type is null)=(context_target_id is null));
create function public.queue_ugc_moderation_report() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='social_dm_message_reports' then
 insert into public.content_reports(id,app_user_id,target_type,target_id,target_revision,target_app_user_id,reason,idempotency_key,created_at)
 select new.id,new.reporter_id,'dm_message',new.message_id,1,m.sender_id,new.reason,new.id,new.created_at from public.social_dm_messages m where m.id=new.message_id on conflict do nothing;
 else
 insert into public.content_reports(app_user_id,target_type,target_id,target_revision,target_app_user_id,reason,idempotency_key,created_at)
 values(new.app_user_id,'user_block',new.id,1,new.blocked_app_user_id,'user_block',new.id,new.created_at) on conflict do nothing;
 end if;
 return new;
end $$;
create trigger dm_moderation_queue after insert on public.social_dm_message_reports for each row execute function public.queue_ugc_moderation_report();
create trigger block_moderation_queue after insert on public.user_blocks for each row execute function public.queue_ugc_moderation_report();
insert into public.content_reports(id,app_user_id,target_type,target_id,target_revision,target_app_user_id,reason,idempotency_key,created_at)
 select r.id,r.reporter_id,'dm_message',r.message_id,1,m.sender_id,r.reason,r.id,r.created_at from public.social_dm_message_reports r join public.social_dm_messages m on m.id=r.message_id on conflict do nothing;

alter function public.block_content_author(uuid,text,uuid) rename to block_content_author_before_moderation;
create function public.block_content_author(p_app_user_id uuid,p_target_type text,p_target_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; context jsonb; begin
 perform public.fan_web_lock_active_user(p_app_user_id);
 select jsonb_build_object('id',b.id)into result from public.user_blocks b join public.content_reports r on r.target_type='user_block'and r.target_id=b.id where b.app_user_id=p_app_user_id and r.context_target_type=p_target_type and r.context_target_id=p_target_id;
 if result is not null then return result;end if;
 context:=public.fan_web_content_target(p_app_user_id,p_target_type,p_target_id);
 result:=public.block_content_author_before_moderation(p_app_user_id,p_target_type,p_target_id);
 update public.content_reports set context_target_type=p_target_type,context_target_id=p_target_id,celebrity_id=(context->>'celebrityId')::uuid where app_user_id=p_app_user_id and target_type='user_block' and target_id=(result->>'id')::uuid and context_target_id is null;
 return result;
end $$;

alter table public.social_dm_messages add column hidden_at timestamptz,add column hidden_by_admin_id uuid references public.admin_allowlist(id),add column hide_reason text;
-- Preserve the current media-aware read and all media authorization wrappers.
do $$ declare d text; begin
 select pg_get_functiondef('public.read_social_dm_messages(uuid,uuid,timestamptz,uuid,integer)'::regprocedure) into d;
 if position('where m.conversation_id=p_conversation_id' in d)=0 then raise exception 'DM read contract changed'; end if;
 execute replace(d,'where m.conversation_id=p_conversation_id','where m.hidden_at is null and m.conversation_id=p_conversation_id');
 select pg_get_functiondef('public.read_owned_dm_conversations(uuid)'::regprocedure) into d;
 if position('where m.conversation_id=d.id' in d)=0 then raise exception 'DM inbox contract changed'; end if;
 execute replace(d,'where m.conversation_id=d.id','where m.hidden_at is null and m.conversation_id=d.id');
end $$;
alter function public.authorize_mobile_media_read(uuid,uuid,text) rename to authorize_mobile_media_read_before_moderation;
create function public.authorize_mobile_media_read(p_app_user_id uuid,p_asset_id uuid,p_variant text) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if exists(select 1 from public.mobile_media_assets a join public.social_dm_messages m on a.attached_type='dm_message'and m.id=a.attached_id where a.id=p_asset_id and m.hidden_at is not null)then return null;end if;
 return public.authorize_mobile_media_read_before_moderation(p_app_user_id,p_asset_id,p_variant);
end $$;

create or replace function public.read_admin_content_reports(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_status text default 'open',p_before timestamptz default null,p_before_id uuid default null,p_limit integer default 20) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; begin
 perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,false);
 if p_status not in('open','resolved','dismissed') or (p_before is null)<>(p_before_id is null) then raise exception 'FAN_WEB_INVALID_INPUT';end if;
 with candidates as materialized(select r.* from public.content_reports r where r.status=p_status and(p_before is null or (p_status='open'and(r.created_at,r.id)>(p_before,p_before_id))or(p_status<>'open'and(r.created_at,r.id)<(p_before,p_before_id)))
 order by case when p_status='open'then r.created_at end asc,case when p_status='open'then r.id end asc,case when p_status<>'open'then r.created_at end desc,case when p_status<>'open'then r.id end desc limit least(greatest(p_limit,1),50)+1),
 page as(select *,case when target_type='user_block'then context_target_type else target_type end body_target_type,case when target_type='user_block'then context_target_id else target_id end body_target_id from candidates order by case when p_status='open'then created_at end asc,case when p_status='open'then id end asc,case when p_status<>'open'then created_at end desc,case when p_status<>'open'then id end desc limit least(greatest(p_limit,1),50))
 select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'targetType',r.target_type,'targetId',r.target_id,'targetRevision',r.target_revision,'reason',r.reason,'status',r.status,'createdAt',r.created_at,
 'target',jsonb_build_object('authorUserId',r.target_app_user_id,'authorNickname',profile.nickname,'celebritySlug',c.slug,'contextTargetType',r.context_target_type,'contextTargetId',r.context_target_id,'body',case r.body_target_type
 when 'fan_post'then(select body from public.fan_posts where id=r.body_target_id)when 'fan_post_comment'then(select body from public.fan_post_comments where id=r.body_target_id)
 when 'fan_clip'then(select body from public.fan_clips where id=r.body_target_id)when 'fan_clip_comment'then(select body from public.fan_clip_comments where id=r.body_target_id)
 when 'notice'then(select title from public.celebrity_notice_localizations where notice_id=r.body_target_id and locale='ko')
 when 'notice_comment'then(select body from public.celebrity_notice_comments where id=r.body_target_id)when 'cheer'then(select body from public.fan_lounge_messages where id=r.body_target_id)
 when 'live_submission'then(select body from public.live_fan_submissions where id=r.body_target_id)when 'participation_post'then(select body from public.mobile_participation_posts where id=r.body_target_id)
 when 'participation_comment'then(select body from public.mobile_participation_comments where id=r.body_target_id)when 'dm_message'then(select body from public.social_dm_messages where id=r.body_target_id)else null end))
 order by case when p_status='open'then r.created_at end asc,case when p_status='open'then r.id end asc,case when p_status<>'open'then r.created_at end desc,case when p_status<>'open'then r.id end desc)
 from page r left join public.celebrities c on c.id=r.celebrity_id left join public.user_profiles profile on profile.app_user_id=r.target_app_user_id),'[]'::jsonb),'hasMore',(select count(*)>least(greatest(p_limit,1),50)from candidates))into result;
 return result;
end $$;
create function public.read_admin_content_report_summary(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,false);
 return(select jsonb_build_object('openCount',count(*),'overdueCount',count(*)filter(where created_at<=now()-interval'24 hours'),'oldestDueAt',min(created_at)+interval'24 hours')from public.content_reports where status='open');
end $$;

-- The owner guard may lock an already restricted author during trusted hiding.
-- The transaction-local marker is set only after the resolver validates its admin.
do $$ declare d text; begin
 select pg_get_functiondef('public.fan_web_guard_owner_write()'::regprocedure) into d;
 if position('perform public.fan_web_lock_active_user(owner_id); return new;' in d)=0 then raise exception 'Owner guard contract changed';end if;
 execute replace(d,'perform public.fan_web_lock_active_user(owner_id); return new;',
 'if tg_op=''UPDATE'' and current_setting(''byus.moderation_owner'',true)=owner_id::text and (to_jsonb(new)->''body'') is not distinct from (to_jsonb(old)->''body'') then perform public.fan_web_lock_active_user_before_moderation(owner_id); else perform public.fan_web_lock_active_user(owner_id); end if; return new;');
end $$;
alter function public.resolve_admin_content_report(uuid,uuid,uuid,uuid,text,boolean,text) rename to resolve_admin_content_report_before_moderation;
create function public.resolve_admin_content_report(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_correlation_id uuid,p_report_id uuid,p_resolution text,p_hide_target boolean,p_reason text,p_restrict_author boolean default false)returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.content_reports%rowtype; a public.admin_allowlist%rowtype; result jsonb; previous_owner text:=coalesce(current_setting('byus.moderation_owner',true),'');
begin
 perform public.fan_web_lock_active_user(p_actor_app_user_id);
 perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,true);
 select * into a from public.admin_allowlist where id=p_actor_admin_allowlist_id;
 if p_resolution is null or p_resolution not in('resolved','dismissed')or p_hide_target is null or p_restrict_author is null or length(btrim(coalesce(p_reason,'')))not between 10 and 500 or (p_resolution='dismissed'and(p_hide_target or p_restrict_author))then raise exception 'FAN_WEB_INVALID_INPUT';end if;
 select * into r from public.content_reports where id=p_report_id for update;
 if not found then raise exception 'FAN_WEB_NOT_FOUND';end if;
 if r.target_type='user_block'and p_hide_target then raise exception 'FAN_WEB_INVALID_INPUT';end if;
 if p_restrict_author then
 if a.role<>'admin' or r.target_app_user_id is null or r.target_app_user_id=p_actor_app_user_id or exists(select 1 from public.admin_allowlist x join public.app_users u on u.verified_email=x.email where u.id=r.target_app_user_id and x.active)then raise exception 'FAN_WEB_FORBIDDEN';end if;
 end if;
 if r.status<>'open'then
 if r.status<>p_resolution or r.target_hidden<>p_hide_target or r.author_restricted<>p_restrict_author or r.resolution_reason<>btrim(p_reason)then raise exception 'FAN_WEB_CONFLICT';end if;
 return jsonb_build_object('id',r.id,'status',r.status,'targetHidden',r.target_hidden);
 end if;
 if r.target_app_user_id is not null then
 if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('fan-web-user:'||r.target_app_user_id::text,0))then raise exception 'FAN_WEB_ACCOUNT_BUSY' using errcode='55P03';end if;
 perform set_config('byus.moderation_owner',r.target_app_user_id::text,true);
 end if;
 if r.target_type in('dm_message','user_block')then
 if p_hide_target then update public.social_dm_messages set hidden_at=coalesce(hidden_at,clock_timestamp()),hidden_by_admin_id=p_actor_admin_allowlist_id,hide_reason=btrim(p_reason) where id=r.target_id;end if;
 update public.content_reports set status=p_resolution,resolved_at=clock_timestamp(),resolved_by_admin_id=p_actor_admin_allowlist_id,resolution_reason=btrim(p_reason),target_hidden=p_hide_target where id=r.id;
 insert into public.audit_logs(actor_app_user_id,actor_admin_allowlist_id,action,entity_type,entity_id,correlation_id,before_after_summary)values(p_actor_app_user_id,p_actor_admin_allowlist_id,'content.report.resolve','content_report',r.id::text,p_correlation_id,jsonb_build_object('status',p_resolution,'targetType',r.target_type,'targetId',r.target_id,'hidden',p_hide_target));
 result:=jsonb_build_object('id',r.id,'status',p_resolution,'targetHidden',p_hide_target);
 else result:=public.resolve_admin_content_report_before_moderation(p_actor_app_user_id,p_actor_admin_allowlist_id,p_correlation_id,p_report_id,p_resolution,p_hide_target,p_reason);end if;
 perform set_config('byus.moderation_owner',previous_owner,true);
 if p_restrict_author then
 insert into public.app_user_moderation_restrictions(app_user_id,report_id,reason,actor_admin_id)values(r.target_app_user_id,r.id,btrim(p_reason),p_actor_admin_allowlist_id)
 on conflict(app_user_id)do update set report_id=excluded.report_id,reason=excluded.reason,actor_admin_id=excluded.actor_admin_id,created_at=clock_timestamp(),revoked_at=null;
 update public.content_reports set author_restricted=true where id=r.id;
 insert into public.audit_logs(actor_app_user_id,actor_admin_allowlist_id,action,entity_type,entity_id,correlation_id,before_after_summary)values(p_actor_app_user_id,p_actor_admin_allowlist_id,'content.author.restrict','app_user',r.target_app_user_id::text,p_correlation_id,jsonb_build_object('reportId',r.id));
 end if;
 return result;
end $$;

revoke all on function public.fan_web_lock_active_user_before_moderation(uuid),public.block_content_author_before_moderation(uuid,text,uuid),public.authorize_mobile_media_read_before_moderation(uuid,uuid,text),public.resolve_admin_content_report_before_moderation(uuid,uuid,uuid,uuid,text,boolean,text),public.ugc_body_rejected(text),public.guard_ugc_body(),public.queue_ugc_moderation_report()from public,anon,authenticated,service_role;
revoke all on function public.fan_web_lock_active_user(uuid),public.block_content_author(uuid,text,uuid),public.authorize_mobile_media_read(uuid,uuid,text),public.resolve_admin_content_report(uuid,uuid,uuid,uuid,text,boolean,text,boolean),public.read_admin_content_report_summary(uuid,uuid)from public,anon,authenticated,service_role;
grant execute on function public.fan_web_lock_active_user(uuid),public.block_content_author(uuid,text,uuid),public.authorize_mobile_media_read(uuid,uuid,text),public.resolve_admin_content_report(uuid,uuid,uuid,uuid,text,boolean,text,boolean),public.read_admin_content_report_summary(uuid,uuid)to service_role;
