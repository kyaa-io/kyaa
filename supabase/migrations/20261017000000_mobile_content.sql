-- Native fan clips, shared comment reactions, mobile certification proofs, and
-- explicit manual-photo metadata for official social missions.

alter table public.certification_uploads
  add column mobile_media_asset_id uuid unique references public.mobile_media_assets(id) on delete restrict,
  alter column object_path drop not null,
  alter column sha256 drop not null;
alter table public.certification_uploads drop constraint certification_uploads_content_type_check;
alter table public.certification_uploads add constraint certification_uploads_content_type_check
  check(content_type in('image/jpeg','image/png','image/webp'));
alter table public.certification_uploads add constraint certification_uploads_source_shape check(
  (mobile_media_asset_id is null and object_path is not null and sha256 is not null and content_type='image/webp')
  or (mobile_media_asset_id is not null and object_path is null and sha256 is null)
);

create function public.submit_owned_certification_with_media(
  p_app_user_id uuid,p_mission_id uuid,p_idempotency_key uuid,p_upload_ids jsonb,p_note text,p_previous_submission_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare ids uuid[]; mission public.certification_missions%rowtype; result jsonb; submission_id uuid;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  if jsonb_typeof(p_upload_ids)<>'array' or jsonb_array_length(p_upload_ids) not between 1 and 3 then raise exception 'CERTIFICATION_UPLOAD_COUNT_INVALID'; end if;
  begin select array_agg(value::uuid order by value) into ids from jsonb_array_elements_text(p_upload_ids); exception when invalid_text_representation then raise exception 'CERTIFICATION_UPLOAD_INVALID'; end;
  if array_length(ids,1)<>cardinality(array(select distinct unnest(ids))) then raise exception 'CERTIFICATION_UPLOAD_DUPLICATE'; end if;
  select * into mission from public.certification_missions where id=p_mission_id and status='active' and statement_timestamp()>=opens_at and statement_timestamp()<closes_at for share;
  if not found then raise exception 'CERTIFICATION_MISSION_UNAVAILABLE'; end if;
  if not public.fan_web_is_member(p_app_user_id,mission.celebrity_id) then raise exception 'CERTIFICATION_PASSPORT_REQUIRED'; end if;
  perform 1 from public.mobile_media_assets where id=any(ids) order by id for update;
  insert into public.certification_uploads(id,app_user_id,celebrity_id,mission_id,object_path,content_type,byte_size,width,height,sha256,mobile_media_asset_id,expires_at)
  select a.id,a.app_user_id,mission.celebrity_id,mission.id,null,a.content_type,a.actual_byte_size,a.width,a.height,null,a.id,clock_timestamp()+interval '24 hours'
  from public.mobile_media_assets a
  where a.id=any(ids) and a.app_user_id=p_app_user_id and a.purpose='certification' and a.kind='image'
    and a.state='ready' and a.storage_deleted_at is null and a.attached_id is null
    and not exists(select 1 from public.certification_uploads u where u.id=a.id);
  result:=public.submit_owned_certification(p_app_user_id,p_mission_id,p_idempotency_key,p_upload_ids,p_note,p_previous_submission_id);
  submission_id:=(result->>'id')::uuid;
  update public.mobile_media_assets a set attached_type='certification',attached_id=submission_id,
    attached_version=(select review_revision from public.certification_submissions where id=submission_id),access_scope='certification',position=u.position::smallint,updated_at=clock_timestamp()
  from (select cu.mobile_media_asset_id,row_number()over(order by array_position(ids,cu.id))-1 position
    from public.certification_uploads cu where cu.id=any(ids) and cu.consumed_submission_id=submission_id and cu.mobile_media_asset_id is not null) u
  where a.id=u.mobile_media_asset_id and (a.attached_id is null or(a.attached_type='certification' and a.attached_id=submission_id));
  if (select count(*) from public.certification_uploads cu where cu.id=any(ids) and cu.consumed_submission_id=submission_id)<>array_length(ids,1) then raise exception 'CERTIFICATION_UPLOAD_INVALID'; end if;
  return result;
end $$;

create function public.get_owned_certification_proof_source(p_app_user_id uuid,p_submission_id uuid,p_upload_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select case when u.mobile_media_asset_id is null
    then jsonb_build_object('bucket','certification-proofs','storagePath',u.object_path,'contentType',u.content_type)
    else jsonb_build_object('bucket','mobile-media','storagePath',a.storage_path,'contentType',a.content_type) end
  from public.certification_uploads u left join public.mobile_media_assets a on a.id=u.mobile_media_asset_id and a.state='ready' and a.storage_deleted_at is null
  where u.id=p_upload_id and u.consumed_submission_id=p_submission_id and u.app_user_id=p_app_user_id
    and (u.mobile_media_asset_id is null or a.id is not null);
$$;
create function public.get_admin_certification_proof_source(p_actor uuid,p_allowlist uuid,p_submission_id uuid,p_upload_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$ declare result jsonb; begin
  perform public.assert_certification_admin(p_actor,p_allowlist);
  select case when u.mobile_media_asset_id is null
    then jsonb_build_object('bucket','certification-proofs','storagePath',u.object_path,'contentType',u.content_type)
    else jsonb_build_object('bucket','mobile-media','storagePath',a.storage_path,'contentType',a.content_type) end into result
  from public.certification_uploads u left join public.mobile_media_assets a on a.id=u.mobile_media_asset_id and a.state='ready' and a.storage_deleted_at is null
  where u.id=p_upload_id and u.consumed_submission_id=p_submission_id and (u.mobile_media_asset_id is null or a.id is not null);
  return result;
end $$;

create or replace function public.certification_membership_payload(p_base jsonb,p_platform public.social_platform) returns jsonb
language sql immutable set search_path='' as $$
  select case when p_platform is null or p_base is null then p_base
    else p_base||jsonb_build_object('membershipPlatform',p_platform,'verificationMode','manual_photo','requiredPhotoCount',1)
      ||case when p_base ? 'reward' then jsonb_build_object('reward',(p_base->'reward')||jsonb_build_object('stampCount',1)) else '{}'::jsonb end
    end;
$$;

create table public.fan_clips(
  id uuid primary key default extensions.gen_random_uuid(), celebrity_id uuid not null references public.celebrities(id) on delete restrict,
  app_user_id uuid not null references public.app_users(id) on delete restrict, body text not null check(length(body)<=5000),
  visibility text not null check(visibility in('public','members')), revision integer not null default 1 check(revision>0),
  idempotency_key uuid not null, create_request_hash text not null check(create_request_hash~'^[a-f0-9]{64}$'),
  created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,hidden_at timestamptz,hidden_by_admin_id uuid references public.admin_allowlist(id) on delete restrict,hide_reason text,
  unique(app_user_id,idempotency_key)
);
create index fan_clips_feed on public.fan_clips(celebrity_id,created_at desc,id desc) where deleted_at is null and hidden_at is null;
create table public.fan_clip_likes(
  clip_id uuid not null references public.fan_clips(id) on delete restrict,app_user_id uuid not null references public.app_users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),primary key(clip_id,app_user_id)
);
create table public.fan_clip_comments(
  id uuid primary key default extensions.gen_random_uuid(),clip_id uuid not null references public.fan_clips(id) on delete restrict,
  parent_id uuid references public.fan_clip_comments(id) on delete restrict,app_user_id uuid not null references public.app_users(id) on delete restrict,
  body text not null,revision integer not null default 1 check(revision>0),idempotency_key uuid not null,
  created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,hidden_at timestamptz,hidden_by_admin_id uuid references public.admin_allowlist(id) on delete restrict,hide_reason text,
  check(deleted_at is not null or length(btrim(body)) between 1 and 1000),check(parent_id is distinct from id),unique(app_user_id,idempotency_key)
);
create index fan_clip_comments_feed on public.fan_clip_comments(clip_id,created_at desc,id desc) where deleted_at is null and hidden_at is null;
create table public.mobile_content_comment_reactions(
  target_type text not null check(target_type in('fan_post_comment','fan_clip_comment')),target_id uuid not null,
  app_user_id uuid not null references public.app_users(id) on delete restrict,emoji text not null check(emoji in('❤','👏','✨')),
  created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),primary key(target_type,target_id,app_user_id)
);
create index mobile_content_comment_reactions_target on public.mobile_content_comment_reactions(target_type,target_id,emoji);

create table public.mobile_content_clip_reward_policies(
  id uuid primary key default extensions.gen_random_uuid(),celebrity_id uuid not null references public.celebrities(id)on delete restrict,
  policy_version text not null check(policy_version=btrim(policy_version)and length(policy_version)between 1 and 80),ticket_amount integer not null check(ticket_amount>0),
  enabled boolean not null default false,created_at timestamptz not null default clock_timestamp(),retired_at timestamptz,unique(celebrity_id,policy_version)
);
create unique index mobile_content_clip_reward_one_current on public.mobile_content_clip_reward_policies(celebrity_id)where retired_at is null;
create table public.mobile_content_clip_reward_awards(
  id uuid primary key,app_user_id uuid not null references public.app_users(id)on delete restrict,celebrity_id uuid not null references public.celebrities(id)on delete restrict,
  clip_id uuid not null unique references public.fan_clips(id)on delete restrict,policy_id uuid not null references public.mobile_content_clip_reward_policies(id)on delete restrict,
  ticket_amount integer not null check(ticket_amount>0),ledger_id uuid not null unique references public.fan_ticket_ledger(id)on delete restrict,created_at timestamptz not null default clock_timestamp(),
  unique(app_user_id,celebrity_id)
);

create function public.validate_mobile_content_clip_reward_credit()returns trigger language plpgsql security definer set search_path=''as $$begin
 if new.source_type='mobile_clip_first_upload'and not exists(select 1 from public.mobile_content_clip_reward_awards a where a.id=new.source_id and a.ledger_id=new.id and a.app_user_id=new.app_user_id and a.celebrity_id=new.celebrity_id and new.entry_kind='credit'and new.amount=a.ticket_amount and new.idempotency_key=a.id)then raise exception'MOBILE_CONTENT_CLIP_REWARD_SOURCE_INVALID';end if;return new;
end$$;
create constraint trigger mobile_content_clip_reward_credit_source after insert on public.fan_ticket_ledger deferrable initially deferred for each row execute function public.validate_mobile_content_clip_reward_credit();

create function public.read_admin_mobile_content_clip_reward_policies(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid)returns jsonb language plpgsql stable security definer set search_path=''as $$begin
 perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,false);return jsonb_build_object('policies',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'celebrityId',p.celebrity_id,'policyVersion',p.policy_version,'ticketAmount',p.ticket_amount,'enabled',p.enabled,'createdAt',p.created_at,'retiredAt',p.retired_at)order by p.created_at desc,p.id desc)from public.mobile_content_clip_reward_policies p),'[]'::jsonb));
end$$;
create function public.create_admin_mobile_content_clip_reward_policy(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_celebrity_id uuid,p_policy_version text,p_ticket_amount integer,p_reason text,p_correlation_id uuid)returns jsonb language plpgsql security definer set search_path=''as $$declare old public.mobile_content_clip_reward_policies%rowtype;created public.mobile_content_clip_reward_policies%rowtype;begin
 perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,true);if p_ticket_amount<=0 or length(btrim(coalesce(p_policy_version,'')))not between 1 and 80 or length(btrim(coalesce(p_reason,'')))not between 10 and 1000 then raise exception'MOBILE_CONTENT_CLIP_REWARD_INVALID';end if;
 select*into old from public.mobile_content_clip_reward_policies where celebrity_id=p_celebrity_id and retired_at is null for update;if found then if old.enabled then raise exception'MOBILE_CONTENT_CLIP_REWARD_DISABLE_CURRENT_FIRST';end if;update public.mobile_content_clip_reward_policies set retired_at=clock_timestamp()where id=old.id;end if;
 insert into public.mobile_content_clip_reward_policies(celebrity_id,policy_version,ticket_amount)values(p_celebrity_id,btrim(p_policy_version),p_ticket_amount)returning*into created;
 insert into public.audit_logs(actor_app_user_id,actor_admin_allowlist_id,action,entity_type,entity_id,before_after_summary,correlation_id)values(p_actor_app_user_id,p_actor_admin_allowlist_id,'mobile_content.clip_reward.created','mobile_content_clip_reward_policy',created.id::text,jsonb_build_object('policyVersion',created.policy_version,'ticketAmount',created.ticket_amount,'reason',btrim(p_reason)),p_correlation_id);
 return jsonb_build_object('policyId',created.id,'policyVersion',created.policy_version,'ticketAmount',created.ticket_amount,'enabled',false);
end$$;
create function public.set_admin_mobile_content_clip_reward_policy_enabled(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_policy_id uuid,p_enabled boolean,p_reason text,p_correlation_id uuid)returns jsonb language plpgsql security definer set search_path=''as $$declare policy public.mobile_content_clip_reward_policies%rowtype;begin
 perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,true);if p_enabled is null or length(btrim(coalesce(p_reason,'')))not between 10 and 1000 then raise exception'MOBILE_CONTENT_CLIP_REWARD_INVALID';end if;select*into policy from public.mobile_content_clip_reward_policies where id=p_policy_id and retired_at is null for update;if not found then raise exception'MOBILE_CONTENT_CLIP_REWARD_NOT_FOUND';end if;
 update public.mobile_content_clip_reward_policies set enabled=p_enabled where id=policy.id returning*into policy;
 insert into public.audit_logs(actor_app_user_id,actor_admin_allowlist_id,action,entity_type,entity_id,before_after_summary,correlation_id)values(p_actor_app_user_id,p_actor_admin_allowlist_id,case when p_enabled then'mobile_content.clip_reward.enabled'else'mobile_content.clip_reward.disabled'end,'mobile_content_clip_reward_policy',policy.id::text,jsonb_build_object('reason',btrim(p_reason)),p_correlation_id);
 return jsonb_build_object('policyId',policy.id,'policyVersion',policy.policy_version,'ticketAmount',policy.ticket_amount,'enabled',policy.enabled);
end$$;

create function public.award_mobile_content_first_clip(p_app_user_id uuid,p_celebrity_id uuid,p_clip_id uuid)returns jsonb language plpgsql security definer set search_path=''as $$declare policy public.mobile_content_clip_reward_policies%rowtype;award public.mobile_content_clip_reward_awards%rowtype;receipt uuid:=extensions.gen_random_uuid();ledger jsonb;rule_version integer;begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('phase1:ticket:balance:'||p_app_user_id::text||':'||p_celebrity_id::text,0));perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mobile-content-first-clip:'||p_app_user_id::text||':'||p_celebrity_id::text,0));
 select*into award from public.mobile_content_clip_reward_awards where app_user_id=p_app_user_id and celebrity_id=p_celebrity_id;if found then return jsonb_build_object('status','awarded','ticketAmount',award.ticket_amount,'policyVersion',(select policy_version from public.mobile_content_clip_reward_policies where id=award.policy_id),'ledgerId',award.ledger_id);end if;
 select*into policy from public.mobile_content_clip_reward_policies where celebrity_id=p_celebrity_id and enabled and retired_at is null;if not found then return jsonb_build_object('status','unconfigured');end if;
 if exists(select 1 from public.fan_clips where app_user_id=p_app_user_id and celebrity_id=p_celebrity_id and(id<>p_clip_id or created_at<policy.created_at))then return jsonb_build_object('status','not_eligible','reason','not_first_upload','policyVersion',policy.policy_version);end if;
 select policy_version into rule_version from public.reward_policy_activation where singleton;ledger:=public.post_fan_ticket_entry(p_app_user_id,p_celebrity_id,'credit',policy.ticket_amount,'mobile_clip_first_upload',receipt,receipt,rule_version,null,null);
 insert into public.mobile_content_clip_reward_awards(id,app_user_id,celebrity_id,clip_id,policy_id,ticket_amount,ledger_id)values(receipt,p_app_user_id,p_celebrity_id,p_clip_id,policy.id,policy.ticket_amount,(ledger->>'entryId')::uuid)returning*into award;
 return jsonb_build_object('status','awarded','ticketAmount',award.ticket_amount,'policyVersion',policy.policy_version,'ledgerId',award.ledger_id);
end$$;

do $$ declare t text; begin foreach t in array array['fan_clips','fan_clip_likes','fan_clip_comments','mobile_content_comment_reactions','mobile_content_clip_reward_policies','mobile_content_clip_reward_awards'] loop
  execute format('alter table public.%I enable row level security',t);execute format('alter table public.%I force row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);end loop;end $$;

alter table public.content_reports drop constraint content_reports_target_type_check;
alter table public.content_reports add constraint content_reports_target_type_check check(target_type in('fan_post','fan_post_comment','fan_clip','fan_clip_comment','notice','notice_comment','cheer','live_submission'));
alter table public.content_translations drop constraint content_translations_target_type_check;
alter table public.content_translations add constraint content_translations_target_type_check check(target_type in('fan_post','fan_post_comment','fan_clip','fan_clip_comment','notice','notice_comment','cheer','live_submission'));

alter function public.fan_web_content_target(uuid,text,uuid,public.content_locale) rename to fan_web_content_target_before_mobile_content;
create function public.fan_web_content_target(p_app_user_id uuid,p_target_type text,p_target_id uuid,p_locale public.content_locale default'ko') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare row_record record;parent jsonb;owner_id uuid;creator_id uuid;creator_slug text;source_body text;source_revision integer;target_link text;
begin
  if p_target_type not in('fan_clip','fan_clip_comment') then return public.fan_web_content_target_before_mobile_content(p_app_user_id,p_target_type,p_target_id,p_locale);end if;
  if p_app_user_id is not null and not exists(select 1 from public.app_users where id=p_app_user_id and status='active')then return null;end if;
  if p_target_type='fan_clip' then
    select * into row_record from public.fan_clips where id=p_target_id and deleted_at is null and hidden_at is null;if not found then return null;end if;
    owner_id:=row_record.app_user_id;creator_id:=row_record.celebrity_id;source_body:=row_record.body;source_revision:=row_record.revision;
    if row_record.visibility='members'and not public.fan_web_is_member(p_app_user_id,creator_id)then return null;end if;target_link:='/clips/'||p_target_id::text;
  else
    select * into row_record from public.fan_clip_comments where id=p_target_id and deleted_at is null and hidden_at is null;if not found then return null;end if;
    parent:=public.fan_web_content_target(p_app_user_id,'fan_clip',row_record.clip_id,p_locale);if parent is null then return null;end if;
    if row_record.parent_id is not null and not exists(select 1 from public.fan_clip_comments x where x.id=row_record.parent_id and x.clip_id=row_record.clip_id and x.parent_id is null and public.fan_web_content_target(p_app_user_id,'fan_clip_comment',x.id,p_locale)is not null)then return null;end if;
    owner_id:=row_record.app_user_id;creator_id:=(parent->>'celebrityId')::uuid;source_body:=row_record.body;source_revision:=row_record.revision;target_link:='/clips/'||row_record.clip_id::text||'#comment-'||p_target_id::text;
  end if;
  select slug into creator_slug from public.celebrities where id=creator_id and status='published'and archived_at is null;if creator_slug is null then return null;end if;
  if not exists(select 1 from public.app_users where id=owner_id and status='active')or public.fan_web_blocked(p_app_user_id,owner_id)then return null;end if;
  return jsonb_build_object('targetType',p_target_type,'targetId',p_target_id,'celebrityId',creator_id,'celebritySlug',creator_slug,'appUserId',owner_id,
    'revision',source_revision,'sourceLocale','und','body',source_body,'sourceHash',encode(extensions.digest(source_body,'sha256'),'hex'),'deepLink','/c/'||creator_slug||target_link);
end $$;

create function public.mobile_content_reactions_json(p_app_user_id uuid,p_target_type text,p_target_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('emoji',e.emoji,'count',coalesce(r.count,0),'selected',coalesce(r.selected,false)) order by e.position),'[]'::jsonb)
  from(values('❤'::text,1),('👏',2),('✨',3))e(emoji,position)
  left join lateral(select count(*)::integer count,bool_or(x.app_user_id=p_app_user_id)selected from public.mobile_content_comment_reactions x
    join public.app_users u on u.id=x.app_user_id and u.status='active' where x.target_type=p_target_type and x.target_id=p_target_id and x.emoji=e.emoji
      and not public.fan_web_blocked(p_app_user_id,x.app_user_id))r on true;
$$;

create function public.set_mobile_content_comment_reaction(p_app_user_id uuid,p_target_type text,p_target_id uuid,p_emoji text) returns jsonb
language plpgsql security definer set search_path='' as $$ begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  if p_target_type not in('fan_post_comment','fan_clip_comment')or(p_emoji is not null and p_emoji not in('❤','👏','✨'))then raise exception'FAN_WEB_INVALID_INPUT';end if;
  if public.fan_web_content_target(p_app_user_id,p_target_type,p_target_id)is null then raise exception'FAN_WEB_NOT_FOUND';end if;
  if(select count(*)from public.mobile_content_comment_reactions where app_user_id=p_app_user_id and updated_at>clock_timestamp()-interval'1 minute')>=60 then raise exception'FAN_WEB_RATE_LIMITED';end if;
  if p_emoji is null then delete from public.mobile_content_comment_reactions where target_type=p_target_type and target_id=p_target_id and app_user_id=p_app_user_id;
  else insert into public.mobile_content_comment_reactions(target_type,target_id,app_user_id,emoji)values(p_target_type,p_target_id,p_app_user_id,p_emoji)
    on conflict(target_type,target_id,app_user_id)do update set emoji=excluded.emoji,updated_at=clock_timestamp();end if;
  return jsonb_build_object('commentId',p_target_id,'reactions',public.mobile_content_reactions_json(p_app_user_id,p_target_type,p_target_id));
end $$;

alter function public.read_fan_post_comments(uuid,uuid,timestamptz,uuid,integer,public.content_locale) rename to read_fan_post_comments_before_mobile_content;
create function public.read_fan_post_comments(p_app_user_id uuid,p_post_id uuid,p_before timestamptz default null,p_before_id uuid default null,p_limit integer default 20,p_locale public.content_locale default'ko') returns jsonb
language plpgsql stable security definer set search_path='' as $$ declare base jsonb;items jsonb;begin
  base:=public.read_fan_post_comments_before_mobile_content(p_app_user_id,p_post_id,p_before,p_before_id,p_limit,p_locale);if base is null then return null;end if;
  select coalesce(jsonb_agg(row.item||jsonb_build_object('reactions',public.mobile_content_reactions_json(p_app_user_id,'fan_post_comment',(row.item->>'id')::uuid))order by row.ord),'[]'::jsonb)into items
    from jsonb_array_elements(base->'items')with ordinality row(item,ord);
  return jsonb_set(base,'{items}',items);
end $$;

create function public.mobile_content_clip_json(p_app_user_id uuid,p_clip_id uuid,p_locale public.content_locale default'ko') returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',c.id,'celebritySlug',celebrity.slug,'body',c.body,'visibility',c.visibility,'revision',c.revision,'createdAt',c.created_at,'updatedAt',c.updated_at,
    'isOwner',coalesce(c.app_user_id=p_app_user_id,false),'author',jsonb_build_object('nickname',coalesce(nullif(btrim(profile.nickname),''),case when p_locale='ko'then'팬'else'Fan'end),'avatarUrl','/images/avatars/'||coalesce(avatar.selected_character_id,'star-pink')||'.webp'),
    'assets',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'kind',a.kind,'width',a.width,'height',a.height,'durationSeconds',a.duration_seconds)order by a.position)from public.mobile_media_assets a where a.attached_type='fan_clip'and a.attached_id=c.id and a.state='ready'and a.storage_deleted_at is null),'[]'::jsonb),
    'likeCount',(select count(*)from public.fan_clip_likes l join public.app_users u on u.id=l.app_user_id and u.status='active'where l.clip_id=c.id and not public.fan_web_blocked(p_app_user_id,l.app_user_id)),
    'liked',exists(select 1 from public.fan_clip_likes where clip_id=c.id and app_user_id=p_app_user_id),
    'commentCount',(select count(*)from public.fan_clip_comments x where x.clip_id=c.id and public.fan_web_content_visible(p_app_user_id,'fan_clip_comment',x.id)))
  from public.fan_clips c join public.celebrities celebrity on celebrity.id=c.celebrity_id left join public.user_profiles profile on profile.app_user_id=c.app_user_id left join public.app_user_avatars avatar on avatar.app_user_id=c.app_user_id
  where c.id=p_clip_id and public.fan_web_content_visible(p_app_user_id,'fan_clip',c.id);
$$;
create function public.read_mobile_content_fan_clip(p_app_user_id uuid,p_clip_id uuid,p_locale public.content_locale default'ko') returns jsonb
language sql stable security definer set search_path='' as $$select public.mobile_content_clip_json(p_app_user_id,p_clip_id,p_locale)$$;
create function public.read_mobile_content_fan_clips(p_app_user_id uuid,p_slug text,p_before timestamptz default null,p_before_id uuid default null,p_limit integer default 20,p_locale public.content_locale default'ko') returns jsonb
language sql stable security definer set search_path='' as $$with creator as(select id from public.celebrities where slug=p_slug and status='published'and archived_at is null),candidates as materialized(
 select c.id,c.created_at from public.fan_clips c join creator on creator.id=c.celebrity_id where public.fan_web_content_visible(p_app_user_id,'fan_clip',c.id)and(p_before is null or(c.created_at,c.id)<(p_before,p_before_id))order by c.created_at desc,c.id desc limit least(greatest(p_limit,1),50)+1),page as(select*from candidates order by created_at desc,id desc limit least(greatest(p_limit,1),50))
 select jsonb_build_object('items',coalesce((select jsonb_agg(public.mobile_content_clip_json(p_app_user_id,id,p_locale)order by created_at desc,id desc)from page),'[]'::jsonb),'hasMore',(select count(*)>least(greatest(p_limit,1),50)from candidates))from creator$$;

create function public.create_mobile_content_fan_clip(p_app_user_id uuid,p_slug text,p_body text,p_visibility text,p_asset_ids uuid[],p_idempotency_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$declare creator_id uuid;existing public.fan_clips%rowtype;clip_id uuid:=extensions.gen_random_uuid();normalized text:=btrim(coalesce(p_body,''));ids uuid[]:=coalesce(p_asset_ids,'{}');payload_hash text;kind_count integer;reward jsonb;begin
 perform public.fan_web_lock_active_user(p_app_user_id);if p_idempotency_key is null or p_visibility not in('public','members')or length(normalized)>5000 or cardinality(ids)not between 1 and 4 or cardinality(ids)<>(select count(distinct x)from unnest(ids)x)then raise exception'FAN_WEB_INVALID_INPUT';end if;
 select id into creator_id from public.celebrities where slug=p_slug and status='published'and archived_at is null for share;if creator_id is null then raise exception'FAN_WEB_NOT_FOUND';end if;if not public.fan_web_is_member(p_app_user_id,creator_id)then raise exception'FAN_WEB_FORBIDDEN';end if;
 payload_hash:=encode(extensions.digest(jsonb_build_array(creator_id,normalized,p_visibility,ids)::text,'sha256'),'hex');select*into existing from public.fan_clips where app_user_id=p_app_user_id and idempotency_key=p_idempotency_key;
 if found then if existing.create_request_hash<>payload_hash then raise exception'FAN_WEB_CONFLICT';end if;reward:=public.award_mobile_content_first_clip(p_app_user_id,existing.celebrity_id,existing.id);return jsonb_build_object('id',existing.id,'revision',existing.revision,'replayed',true,'reward',reward);end if;
 if(select count(*)from public.fan_clips where app_user_id=p_app_user_id and created_at>clock_timestamp()-interval'1 minute')>=5 then raise exception'FAN_WEB_RATE_LIMITED';end if;
 perform 1 from public.mobile_media_assets where id=any(ids)order by id for update;
 if(select count(*)from public.mobile_media_assets where id=any(ids)and app_user_id=p_app_user_id and purpose='fan_clip'and state='ready'and storage_deleted_at is null and attached_id is null)<>cardinality(ids)then raise exception'MEDIA_INVALID_ASSET';end if;
 select count(distinct kind)into kind_count from public.mobile_media_assets where id=any(ids);if kind_count<>1 or(exists(select 1 from public.mobile_media_assets where id=any(ids)and kind='video')and cardinality(ids)<>1)then raise exception'MEDIA_INVALID_ASSET';end if;
 insert into public.fan_clips(id,celebrity_id,app_user_id,body,visibility,idempotency_key,create_request_hash)values(clip_id,creator_id,p_app_user_id,normalized,p_visibility,p_idempotency_key,payload_hash);
 update public.mobile_media_assets a set attached_type='fan_clip',attached_id=clip_id,attached_version=1,access_scope='fan_clip',position=(ordered.ord-1)::smallint,updated_at=clock_timestamp()
 from unnest(ids)with ordinality ordered(id,ord)where a.id=ordered.id;
 reward:=public.award_mobile_content_first_clip(p_app_user_id,creator_id,clip_id);return jsonb_build_object('id',clip_id,'revision',1,'replayed',false,'reward',reward);
end $$;
create function public.remove_mobile_content_fan_clip(p_app_user_id uuid,p_clip_id uuid) returns void language plpgsql security definer set search_path='' as $$begin
 perform public.fan_web_lock_active_user(p_app_user_id);perform 1 from public.fan_clips where id=p_clip_id and app_user_id=p_app_user_id and deleted_at is null for update;if not found then raise exception'FAN_WEB_NOT_FOUND';end if;
 update public.fan_clips set body='',deleted_at=clock_timestamp(),revision=revision+1,updated_at=clock_timestamp()where id=p_clip_id;
 update public.fan_clip_comments set body='[deleted]',deleted_at=coalesce(deleted_at,clock_timestamp()),revision=revision+1,updated_at=clock_timestamp()where clip_id=p_clip_id and deleted_at is null;
 delete from public.fan_clip_likes where clip_id=p_clip_id;delete from public.mobile_content_comment_reactions where target_type='fan_clip_comment'and target_id in(select id from public.fan_clip_comments where clip_id=p_clip_id);
 update public.mobile_media_assets set state='cancelled',asset_version=asset_version+1,cleanup_requested_at=coalesce(cleanup_requested_at,clock_timestamp()),cleanup_retry_at=greatest(clock_timestamp(),coalesce(storage_token_expires_at,upload_expires_at)+interval'5 minutes'),updated_at=clock_timestamp()where attached_type='fan_clip'and attached_id=p_clip_id and storage_deleted_at is null;
end $$;
create function public.set_mobile_content_fan_clip_like(p_app_user_id uuid,p_clip_id uuid,p_liked boolean) returns void language plpgsql security definer set search_path='' as $$begin
 perform public.fan_web_lock_active_user(p_app_user_id);if p_liked is null then raise exception'FAN_WEB_INVALID_INPUT';end if;if public.fan_web_content_target(p_app_user_id,'fan_clip',p_clip_id)is null then raise exception'FAN_WEB_NOT_FOUND';end if;
 if p_liked then insert into public.fan_clip_likes values(p_clip_id,p_app_user_id,clock_timestamp())on conflict do nothing;else delete from public.fan_clip_likes where clip_id=p_clip_id and app_user_id=p_app_user_id;end if;
end $$;

create function public.read_mobile_content_clip_comments(p_app_user_id uuid,p_clip_id uuid,p_before timestamptz default null,p_before_id uuid default null,p_limit integer default 20,p_locale public.content_locale default'ko') returns jsonb
language sql stable security definer set search_path='' as $$with candidates as materialized(select x.*from public.fan_clip_comments x where x.clip_id=p_clip_id and public.fan_web_content_visible(p_app_user_id,'fan_clip_comment',x.id)and(p_before is null or(x.created_at,x.id)<(p_before,p_before_id))order by x.created_at desc,x.id desc limit least(greatest(p_limit,1),50)+1),page as(select*from candidates order by created_at desc,id desc limit least(greatest(p_limit,1),50))
 select case when not public.fan_web_content_visible(p_app_user_id,'fan_clip',p_clip_id)then null else jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'clipId',x.clip_id,'parentId',x.parent_id,'body',x.body,'revision',x.revision,'createdAt',x.created_at,'isOwner',coalesce(x.app_user_id=p_app_user_id,false),'author',jsonb_build_object('nickname',coalesce(nullif(btrim(profile.nickname),''),case when p_locale='ko'then'팬'else'Fan'end),'avatarUrl','/images/avatars/'||coalesce(avatar.selected_character_id,'star-pink')||'.webp'),'reactions',public.mobile_content_reactions_json(p_app_user_id,'fan_clip_comment',x.id))order by x.created_at desc,x.id desc)from page x left join public.user_profiles profile on profile.app_user_id=x.app_user_id left join public.app_user_avatars avatar on avatar.app_user_id=x.app_user_id),'[]'::jsonb),'hasMore',(select count(*)>least(greatest(p_limit,1),50)from candidates))end$$;
create function public.post_mobile_content_clip_comment(p_app_user_id uuid,p_clip_id uuid,p_parent_id uuid,p_body text,p_idempotency_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare existing public.fan_clip_comments%rowtype;new_id uuid;normalized text:=btrim(coalesce(p_body,''));begin
 perform public.fan_web_lock_active_user(p_app_user_id);if p_idempotency_key is null or length(normalized)not between 1 and 1000 then raise exception'FAN_WEB_INVALID_INPUT';end if;if public.fan_web_content_target(p_app_user_id,'fan_clip',p_clip_id)is null then raise exception'FAN_WEB_NOT_FOUND';end if;
 select*into existing from public.fan_clip_comments where app_user_id=p_app_user_id and idempotency_key=p_idempotency_key;if found then if existing.clip_id<>p_clip_id or existing.parent_id is distinct from p_parent_id or existing.body<>normalized then raise exception'FAN_WEB_CONFLICT';end if;return jsonb_build_object('id',existing.id,'revision',existing.revision,'replayed',true);end if;
 if p_parent_id is not null and not exists(select 1 from public.fan_clip_comments where id=p_parent_id and clip_id=p_clip_id and parent_id is null and public.fan_web_content_visible(p_app_user_id,'fan_clip_comment',id))then raise exception'FAN_WEB_NOT_FOUND';end if;
 if(select count(*)from public.fan_clip_comments where app_user_id=p_app_user_id and created_at>clock_timestamp()-interval'1 minute')>=10 then raise exception'FAN_WEB_RATE_LIMITED';end if;
 insert into public.fan_clip_comments(clip_id,parent_id,app_user_id,body,idempotency_key)values(p_clip_id,p_parent_id,p_app_user_id,normalized,p_idempotency_key)returning id into new_id;return jsonb_build_object('id',new_id,'revision',1,'replayed',false);
end $$;
create function public.remove_mobile_content_clip_comment(p_app_user_id uuid,p_comment_id uuid) returns void language plpgsql security definer set search_path='' as $$begin
 perform public.fan_web_lock_active_user(p_app_user_id);update public.fan_clip_comments set body='[deleted]',deleted_at=clock_timestamp(),revision=revision+1,updated_at=clock_timestamp()where id=p_comment_id and app_user_id=p_app_user_id and deleted_at is null;if not found then raise exception'FAN_WEB_NOT_FOUND';end if;delete from public.mobile_content_comment_reactions where target_type='fan_clip_comment'and target_id=p_comment_id;
end $$;

create or replace function public.authorize_mobile_media_read(p_app_user_id uuid,p_asset_id uuid,p_variant text)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare a public.mobile_media_assets%rowtype;allowed boolean:=false;begin perform public.fan_web_lock_active_user(p_app_user_id);if p_variant not in('original','thumbnail')then raise exception'MEDIA_INVALID_INPUT';end if;select*into a from public.mobile_media_assets where id=p_asset_id and state='ready'and storage_deleted_at is null;if not found then return null;end if;
 allowed:=(a.app_user_id=p_app_user_id and a.access_scope in('owner','certification'))or(a.access_scope='fan_post'and a.attached_type='fan_post'and public.fan_web_content_visible(p_app_user_id,'fan_post',a.attached_id))or(a.access_scope='fan_clip'and a.attached_type='fan_clip'and public.fan_web_content_visible(p_app_user_id,'fan_clip',a.attached_id))or(a.access_scope='dm'and a.attached_type='dm_message'and exists(select 1 from public.social_dm_messages m join public.social_dm_conversations c on c.id=m.conversation_id where m.id=a.attached_id and p_app_user_id in(c.user_low_id,c.user_high_id)and not public.fan_web_blocked(c.user_low_id,c.user_high_id)and not exists(select 1 from public.social_dm_message_deletions d where d.message_id=m.id and d.app_user_id=p_app_user_id)));
 if not allowed then return null;end if;return jsonb_build_object('storagePath',case when p_variant='thumbnail'then a.thumbnail_path else a.storage_path end,'contentType',case when p_variant='thumbnail'then'image/webp'else a.content_type end);end $$;

alter function public.resolve_admin_content_report(uuid,uuid,uuid,uuid,text,boolean,text) rename to resolve_admin_content_report_before_mobile_content;
create function public.resolve_admin_content_report(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_correlation_id uuid,p_report_id uuid,p_resolution text,p_hide_target boolean,p_reason text)returns jsonb language plpgsql security definer set search_path=''as $$declare result jsonb;report public.content_reports%rowtype;begin
 result:=public.resolve_admin_content_report_before_mobile_content(p_actor_app_user_id,p_actor_admin_allowlist_id,p_correlation_id,p_report_id,p_resolution,p_hide_target,p_reason);
 if p_hide_target then select*into report from public.content_reports where id=p_report_id;if report.target_type='fan_clip'then update public.fan_clips set hidden_at=coalesce(hidden_at,clock_timestamp()),hidden_by_admin_id=coalesce(hidden_by_admin_id,p_actor_admin_allowlist_id),hide_reason=coalesce(hide_reason,btrim(p_reason)),revision=revision+case when hidden_at is null then 1 else 0 end,updated_at=clock_timestamp()where id=report.target_id;elsif report.target_type='fan_clip_comment'then update public.fan_clip_comments set hidden_at=coalesce(hidden_at,clock_timestamp()),hidden_by_admin_id=coalesce(hidden_by_admin_id,p_actor_admin_allowlist_id),hide_reason=coalesce(hide_reason,btrim(p_reason)),revision=revision+case when hidden_at is null then 1 else 0 end,updated_at=clock_timestamp()where id=report.target_id;end if;end if;return result;
end $$;

alter function public.scrub_account_deletion(uuid) rename to scrub_account_deletion_before_mobile_content;
create function public.scrub_account_deletion(p_app_user_id uuid)returns void language plpgsql security definer set search_path=''as $$begin
 if not public.fan_web_account_erasing(p_app_user_id)then raise exception'ACCOUNT_DELETION_UNAVAILABLE';end if;
 delete from public.mobile_content_comment_reactions where app_user_id=p_app_user_id or(target_type='fan_clip_comment'and target_id in(select x.id from public.fan_clip_comments x join public.fan_clips c on c.id=x.clip_id where x.app_user_id=p_app_user_id or c.app_user_id=p_app_user_id));
 delete from public.fan_clip_likes where app_user_id=p_app_user_id or clip_id in(select id from public.fan_clips where app_user_id=p_app_user_id);
 update public.mobile_media_assets a set state='cancelled',asset_version=asset_version+1,cleanup_requested_at=coalesce(cleanup_requested_at,clock_timestamp()),cleanup_retry_at=greatest(clock_timestamp(),coalesce(storage_token_expires_at,upload_expires_at)+interval'5 minutes'),updated_at=clock_timestamp()
   where a.attached_type='fan_clip'and a.attached_id in(select id from public.fan_clips where app_user_id=p_app_user_id)and a.storage_deleted_at is null;
 update public.fan_clip_comments x set body='[deleted]',hide_reason=null,deleted_at=coalesce(x.deleted_at,clock_timestamp()),updated_at=clock_timestamp()
   where x.app_user_id=p_app_user_id or x.clip_id in(select id from public.fan_clips where app_user_id=p_app_user_id);
 update public.fan_clips set body='',hide_reason=null,deleted_at=coalesce(deleted_at,clock_timestamp()),updated_at=clock_timestamp()where app_user_id=p_app_user_id;
 perform public.scrub_account_deletion_before_mobile_content(p_app_user_id);
end $$;

revoke all on function public.validate_mobile_content_clip_reward_credit(),public.award_mobile_content_first_clip(uuid,uuid,uuid),public.read_admin_mobile_content_clip_reward_policies(uuid,uuid),public.create_admin_mobile_content_clip_reward_policy(uuid,uuid,uuid,text,integer,text,uuid),public.set_admin_mobile_content_clip_reward_policy_enabled(uuid,uuid,uuid,boolean,text,uuid)from public,anon,authenticated,service_role;
grant execute on function public.read_admin_mobile_content_clip_reward_policies(uuid,uuid),public.create_admin_mobile_content_clip_reward_policy(uuid,uuid,uuid,text,integer,text,uuid),public.set_admin_mobile_content_clip_reward_policy_enabled(uuid,uuid,uuid,boolean,text,uuid)to service_role;
revoke all on function public.submit_owned_certification_with_media(uuid,uuid,uuid,jsonb,text,uuid),public.get_owned_certification_proof_source(uuid,uuid,uuid),public.get_admin_certification_proof_source(uuid,uuid,uuid,uuid),public.fan_web_content_target(uuid,text,uuid,public.content_locale),public.mobile_content_reactions_json(uuid,text,uuid),public.set_mobile_content_comment_reaction(uuid,text,uuid,text),public.read_fan_post_comments(uuid,uuid,timestamptz,uuid,integer,public.content_locale),public.mobile_content_clip_json(uuid,uuid,public.content_locale),public.read_mobile_content_fan_clip(uuid,uuid,public.content_locale),public.read_mobile_content_fan_clips(uuid,text,timestamptz,uuid,integer,public.content_locale),public.create_mobile_content_fan_clip(uuid,text,text,text,uuid[],uuid),public.remove_mobile_content_fan_clip(uuid,uuid),public.set_mobile_content_fan_clip_like(uuid,uuid,boolean),public.read_mobile_content_clip_comments(uuid,uuid,timestamptz,uuid,integer,public.content_locale),public.post_mobile_content_clip_comment(uuid,uuid,uuid,text,uuid),public.remove_mobile_content_clip_comment(uuid,uuid),public.authorize_mobile_media_read(uuid,uuid,text),public.resolve_admin_content_report(uuid,uuid,uuid,uuid,text,boolean,text),public.scrub_account_deletion(uuid)from public,anon,authenticated,service_role;
grant execute on function public.submit_owned_certification_with_media(uuid,uuid,uuid,jsonb,text,uuid),public.get_owned_certification_proof_source(uuid,uuid,uuid),public.get_admin_certification_proof_source(uuid,uuid,uuid,uuid),public.fan_web_content_target(uuid,text,uuid,public.content_locale),public.mobile_content_reactions_json(uuid,text,uuid),public.set_mobile_content_comment_reaction(uuid,text,uuid,text),public.read_fan_post_comments(uuid,uuid,timestamptz,uuid,integer,public.content_locale),public.mobile_content_clip_json(uuid,uuid,public.content_locale),public.read_mobile_content_fan_clip(uuid,uuid,public.content_locale),public.read_mobile_content_fan_clips(uuid,text,timestamptz,uuid,integer,public.content_locale),public.create_mobile_content_fan_clip(uuid,text,text,text,uuid[],uuid),public.remove_mobile_content_fan_clip(uuid,uuid),public.set_mobile_content_fan_clip_like(uuid,uuid,boolean),public.read_mobile_content_clip_comments(uuid,uuid,timestamptz,uuid,integer,public.content_locale),public.post_mobile_content_clip_comment(uuid,uuid,uuid,text,uuid),public.remove_mobile_content_clip_comment(uuid,uuid),public.authorize_mobile_media_read(uuid,uuid,text),public.resolve_admin_content_report(uuid,uuid,uuid,uuid,text,boolean,text),public.scrub_account_deletion(uuid)to service_role;
revoke all on function public.fan_web_content_target_before_mobile_content(uuid,text,uuid,public.content_locale),public.read_fan_post_comments_before_mobile_content(uuid,uuid,timestamptz,uuid,integer,public.content_locale),public.resolve_admin_content_report_before_mobile_content(uuid,uuid,uuid,uuid,text,boolean,text),public.scrub_account_deletion_before_mobile_content(uuid)from public,anon,authenticated,service_role;
