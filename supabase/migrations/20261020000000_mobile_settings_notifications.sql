begin;

alter table public.app_users add column mobile_account_version bigint not null default 1 check (mobile_account_version>0);
alter table public.notification_preferences add column marketing_notifications boolean not null default false,
  add column participation_notifications boolean not null default true;

create table public.mobile_app_settings (
  app_user_id uuid primary key references public.app_users(id) on delete restrict,
  region_code text not null default 'KR' check(region_code ~ '^[A-Z]{2}$'),
  qr_visible boolean not null default true,
  push_enabled boolean not null default true,
  revision bigint not null default 1 check(revision>0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.mobile_installations (
  id uuid primary key default extensions.gen_random_uuid(),
  app_user_id uuid not null references public.app_users(id) on delete restrict,
  installation_id uuid not null,
  platform text not null check(platform in('ios','android')),
  push_token text,
  push_token_hash text,
  permission text not null check(permission in('authorized','provisional','denied')),
  app_version text not null check(length(app_version) between 1 and 80),
  locale text not null check(locale in('ko','en','ja','zh-Hans','zh-Hant','es','id','vi','th','pt','fr')),
  installation_version bigint not null default 1 check(installation_version>0),
  link_version bigint not null default 1 check(link_version>0),
  disabled_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(app_user_id,installation_id),
  constraint mobile_installations_token_shape check(
    (disabled_at is not null and push_token is null and push_token_hash is null)
    or (permission='denied' and push_token is null and push_token_hash is null)
    or (permission in('authorized','provisional') and push_token is not null and push_token_hash ~ '^[0-9a-f]{64}$' and length(push_token) between 8 and 4096)
  )
);
create unique index mobile_installations_active_token_idx on public.mobile_installations(push_token_hash) where disabled_at is null and push_token_hash is not null;
create index mobile_installations_owner_idx on public.mobile_installations(app_user_id,installation_id);

create table public.mobile_installation_requests (
  app_user_id uuid not null references public.app_users(id) on delete restrict,
  request_id uuid not null,
  request_hash text not null check(request_hash ~ '^[0-9a-f]{64}$'),
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key(app_user_id,request_id)
);

create table public.mobile_push_delivery_outbox (
  id uuid primary key default extensions.gen_random_uuid(),
  notification_id uuid not null references public.fan_notifications(id) on delete restrict,
  installation_row_id uuid not null references public.mobile_installations(id) on delete restrict,
  installation_version bigint not null,
  link_version bigint not null,
  account_version bigint not null,
  status public.notification_delivery_status not null default 'pending',
  available_at timestamptz not null,
  attempt_count integer not null default 0 check(attempt_count between 0 and 20),
  lease_owner text, lease_expires_at timestamptz, sent_at timestamptz, last_error_code text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(notification_id,installation_row_id),
  constraint mobile_push_delivery_state check(
    (status='processing' and lease_owner is not null and lease_expires_at is not null and sent_at is null)
    or (status='sent' and sent_at is not null and lease_owner is null and lease_expires_at is null)
    or (status in('pending','failed') and sent_at is null and lease_owner is null and lease_expires_at is null)
  )
);
create index mobile_push_due_idx on public.mobile_push_delivery_outbox(status,available_at) where status in('pending','failed');

alter table public.cs_inquiries add column related_target_type text,
  add column related_target_id uuid,
  add constraint cs_inquiries_related_target_shape check(
    (related_target_type is null and related_target_id is null) or
    (related_target_type in('store_transaction','benefit','participation_event','fan_post') and related_target_id is not null)
  );
alter table public.schedule_suggestions alter column ends_at drop not null, alter column source_url drop not null;
alter table public.fanpage_requests add column subject_type text not null default 'artist' check(subject_type in('artist','creator','brand'));

create or replace function public.fan_web_request_json(p_id uuid,p_locale public.content_locale) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',r.id,'name',r.name,'subjectType',r.subject_type,'officialSocialUrl',r.official_social_url,'note',r.note,'locale',r.locale,
  'status',r.status,'revision',r.revision,'reviewReason',r.review_reason,'reviewedAt',r.reviewed_at,'createdAt',r.created_at,
  'artist',(select jsonb_build_object('slug',c.slug,'name',l.name,'imageUrl',c.image_url,'href','/'||c.slug)
    from public.celebrities c join public.celebrity_localizations l on l.celebrity_id=c.id and l.locale=p_locale
    where c.id=r.celebrity_id and c.status='published' and c.archived_at is null))
 from public.fanpage_requests r where r.id=p_id
$$;
create or replace function public.fan_web_submit_fanpage_request(p_app_user_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_key text:=public.fan_web_social_profile_key(p_payload->>'officialSocialUrl');v_subject text:=coalesce(p_payload->>'subjectType','artist');
 v_hash text:=encode(extensions.digest((p_payload-'idempotencyKey')::text,'sha256'),'hex');r public.fanpage_requests%rowtype;
begin
 perform public.fan_web_lock_active_user(p_app_user_id);
 if v_key is null or v_subject not in('artist','creator','brand')then raise exception'FAN_WEB_INVALID_REQUEST';end if;
 select*into r from public.fanpage_requests where app_user_id=p_app_user_id and idempotency_key=(p_payload->>'idempotencyKey')::uuid;
 if found then if r.request_hash<>v_hash then raise exception'FAN_WEB_IDEMPOTENCY_CONFLICT';end if;return jsonb_build_object('item',public.fan_web_request_json(r.id,(p_payload->>'locale')::public.content_locale),'replayed',true);end if;
 select*into r from public.fanpage_requests where app_user_id=p_app_user_id and official_social_key=v_key and status='pending';
 if found then return jsonb_build_object('item',public.fan_web_request_json(r.id,(p_payload->>'locale')::public.content_locale),'replayed',true);end if;
 if(select count(*)from public.fanpage_requests where app_user_id=p_app_user_id and created_at>clock_timestamp()-interval'24 hours')>=5 then raise exception'FAN_WEB_RATE_LIMIT';end if;
 insert into public.fanpage_requests(app_user_id,name,subject_type,official_social_url,official_social_key,note,locale,idempotency_key,request_hash)
 values(p_app_user_id,btrim(p_payload->>'name'),v_subject,p_payload->>'officialSocialUrl',v_key,coalesce(p_payload->>'note',''),(p_payload->>'locale')::public.content_locale,(p_payload->>'idempotencyKey')::uuid,v_hash)returning id into v_id;
 return jsonb_build_object('item',public.fan_web_request_json(v_id,(p_payload->>'locale')::public.content_locale),'replayed',false);
end $$;
create table public.cs_message_media(
  message_id uuid not null references public.cs_messages(id) on delete restrict,
  asset_id uuid not null unique references public.mobile_media_assets(id) on delete restrict,
  position smallint not null check(position between 0 and 3),
  primary key(message_id,position)
);
alter table public.cs_message_media enable row level security;
alter table public.cs_message_media force row level security;
revoke all on table public.cs_message_media from public,anon,authenticated,service_role;
grant select,insert,delete on table public.cs_message_media to service_role;

create function public.mobile_cs_related_target_allowed(p_app_user_id uuid,p_type text,p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select case p_type
  when 'store_transaction' then exists(select 1 from public.mobile_store_transactions x where x.id=p_id and x.app_user_id=p_app_user_id)
  when 'benefit' then exists(select 1 from public.benefits x where x.id=p_id and x.publication_status='published' and x.archived_at is null)
  when 'participation_event' then exists(select 1 from public.mobile_participation_events x where x.id=p_id and x.state in('published','ended'))
  when 'fan_post' then public.fan_web_content_visible(p_app_user_id,'fan_post',p_id)
  else false end
$$;
create function public.mobile_cs_related_target_json(p_app_user_id uuid,p_type text,p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare allowed boolean; path text; begin if p_type is null then return null; end if; allowed:=public.mobile_cs_related_target_allowed(p_app_user_id,p_type,p_id);
 if allowed then path:=case p_type when'store_transaction'then'/my/store/transactions/'||p_id::text when'benefit'then'/benefits/'||p_id::text when'participation_event'then'/participation/events/'||p_id::text else'/community/posts/'||p_id::text end; end if;
 return jsonb_build_object('type',p_type,'id',case when allowed then p_id else null end,'available',allowed,'deepLink',path); end $$;
create function public.mobile_cs_attach_assets(p_app_user_id uuid,p_message_id uuid,p_asset_ids uuid[]) returns void language plpgsql security definer set search_path='' as $$
declare current_ids uuid[]; requested uuid[]; begin requested:=coalesce(p_asset_ids,'{}'::uuid[]);
 if cardinality(requested)>4 or cardinality(requested)<>(select count(distinct x)from unnest(requested)x) then raise exception'CS_INVALID_REQUEST' using errcode='22023'; end if;
 select array_agg(asset_id order by asset_id)into current_ids from public.cs_message_media where message_id=p_message_id;
 if current_ids is not null then if current_ids<>(select array_agg(x order by x)from unnest(requested)x)then raise exception'CS_IDEMPOTENCY_CONFLICT' using errcode='23505';end if;return;end if;
 if cardinality(requested)=0 then return;end if;
 perform 1 from public.mobile_media_assets where id=any(requested) order by id for update;
 if (select count(*)from public.mobile_media_assets where id=any(requested)and app_user_id=p_app_user_id and purpose='support'and kind='image'and state='ready'and attached_type is null and storage_deleted_at is null)<>cardinality(requested)then raise exception'CS_INVALID_REQUEST' using errcode='22023';end if;
 update public.mobile_media_assets set attached_type='cs_message',attached_id=p_message_id,access_scope='support',asset_version=asset_version+1,updated_at=clock_timestamp()where id=any(requested);
 insert into public.cs_message_media(message_id,asset_id,position)select p_message_id,x,(n-1)::smallint from unnest(requested)with ordinality a(x,n);
end $$;
create function public.mobile_cs_create(p_app_user_id uuid,p_subject text,p_body text,p_locale text,p_idempotency_key uuid,p_related_target_type text,p_related_target_id uuid,p_asset_ids uuid[]) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; v_message_id uuid; existing_type text; existing_id uuid;current_assets uuid[];requested uuid[]:=coalesce(p_asset_ids,'{}'::uuid[]); begin
 if (p_related_target_type is null)<>(p_related_target_id is null)or(p_related_target_type is not null and not public.mobile_cs_related_target_allowed(p_app_user_id,p_related_target_type,p_related_target_id))then raise exception'CS_INVALID_REQUEST' using errcode='22023';end if;
 result:=public.cs_create(p_app_user_id,p_subject,p_body,p_locale,p_idempotency_key);
 select related_target_type,related_target_id into existing_type,existing_id from public.cs_inquiries where id=(result->>'id')::uuid for update;
 if (result->>'replayed')::boolean then if existing_type is distinct from p_related_target_type or existing_id is distinct from p_related_target_id then raise exception'CS_IDEMPOTENCY_CONFLICT' using errcode='23505';end if;
 else update public.cs_inquiries set related_target_type=p_related_target_type,related_target_id=p_related_target_id where id=(result->>'id')::uuid;end if;
 select id into strict v_message_id from public.cs_messages where actor_app_user_id=p_app_user_id and idempotency_key=p_idempotency_key;
 if(result->>'replayed')::boolean then select coalesce(array_agg(asset_id order by asset_id),'{}'::uuid[])into current_assets from public.cs_message_media where message_id=v_message_id;if current_assets<>(select coalesce(array_agg(x order by x),'{}'::uuid[])from unnest(requested)x)then raise exception'CS_IDEMPOTENCY_CONFLICT'using errcode='23505';end if;else perform public.mobile_cs_attach_assets(p_app_user_id,v_message_id,requested);end if;return result;
end $$;
create function public.mobile_cs_post(p_app_user_id uuid,p_admin_allowlist_id uuid,p_inquiry_id uuid,p_body text,p_idempotency_key uuid,p_correlation_id uuid,p_asset_ids uuid[]) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; v_message_id uuid;current_assets uuid[];requested uuid[]:=coalesce(p_asset_ids,'{}'::uuid[]); begin if p_admin_allowlist_id is not null then raise exception'CS_FORBIDDEN' using errcode='42501';end if;
 result:=public.cs_post(p_app_user_id,null,p_inquiry_id,p_body,p_idempotency_key,null);
 select id into strict v_message_id from public.cs_messages where actor_app_user_id=p_app_user_id and idempotency_key=p_idempotency_key;
 if(result->>'replayed')::boolean then select coalesce(array_agg(asset_id order by asset_id),'{}'::uuid[])into current_assets from public.cs_message_media where message_id=v_message_id;if current_assets<>(select coalesce(array_agg(x order by x),'{}'::uuid[])from unnest(requested)x)then raise exception'CS_IDEMPOTENCY_CONFLICT'using errcode='23505';end if;else perform public.mobile_cs_attach_assets(p_app_user_id,v_message_id,requested);end if;return result;end $$;
create function public.mobile_cs_list(p_app_user_id uuid,p_admin_allowlist_id uuid default null,p_status text default null,p_before timestamptz default null,p_before_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare base jsonb; begin if p_admin_allowlist_id is not null then raise exception'CS_FORBIDDEN';end if;base:=public.cs_list(p_app_user_id,null,p_status,p_before,p_before_id);
 return jsonb_set(base,'{inquiries}',coalesce((select jsonb_agg(item||jsonb_build_object('relatedTarget',public.mobile_cs_related_target_json(p_app_user_id,i.related_target_type,i.related_target_id))order by n)from jsonb_array_elements(base->'inquiries')with ordinality x(item,n)join public.cs_inquiries i on i.id=(item->>'id')::uuid),'[]'::jsonb));end $$;
create function public.mobile_cs_read(p_app_user_id uuid,p_inquiry_id uuid,p_admin_allowlist_id uuid default null,p_before timestamptz default null,p_before_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare base jsonb;i public.cs_inquiries%rowtype;begin if p_admin_allowlist_id is not null then raise exception'CS_FORBIDDEN';end if;base:=public.cs_read(p_app_user_id,p_inquiry_id,null,p_before,p_before_id);select*into strict i from public.cs_inquiries where id=p_inquiry_id;
 base:=jsonb_set(base,'{inquiry}',(base->'inquiry')||jsonb_build_object('relatedTarget',public.mobile_cs_related_target_json(p_app_user_id,i.related_target_type,i.related_target_id)));
 return jsonb_set(base,'{messages}',coalesce((select jsonb_agg(item||jsonb_build_object('assetIds',coalesce((select jsonb_agg(m.asset_id order by m.position)from public.cs_message_media m where m.message_id=(item->>'id')::uuid),'[]'::jsonb))order by n)from jsonb_array_elements(base->'messages')with ordinality x(item,n)),'[]'::jsonb));end $$;
create or replace function public.authorize_mobile_media_read(p_app_user_id uuid,p_asset_id uuid,p_variant text)returns jsonb language plpgsql stable security definer set search_path=''as $$declare a public.mobile_media_assets%rowtype;allowed boolean:=false;begin perform public.fan_web_lock_active_user(p_app_user_id);if p_variant not in('original','thumbnail')then raise exception'MEDIA_INVALID_INPUT';end if;select*into a from public.mobile_media_assets where id=p_asset_id and state='ready'and storage_deleted_at is null;if not found then return null;end if;allowed:=(a.app_user_id=p_app_user_id and a.access_scope in('owner','certification'))or(a.access_scope='fan_post'and a.attached_type='fan_post'and public.fan_web_content_visible(p_app_user_id,'fan_post',a.attached_id))or(a.access_scope='fan_clip'and a.attached_type='fan_clip'and public.fan_web_content_visible(p_app_user_id,'fan_clip',a.attached_id))or(a.access_scope='participation'and a.attached_type='participation_post'and exists(select 1 from public.mobile_participation_posts p where p.id=a.attached_id and p.status='valid'and public.mobile_participation_context_access(p_app_user_id,p.context_id,false)))or(a.access_scope='dm'and a.attached_type='dm_message'and exists(select 1 from public.social_dm_messages m join public.social_dm_conversations c on c.id=m.conversation_id where m.id=a.attached_id and p_app_user_id in(c.user_low_id,c.user_high_id)and not public.fan_web_blocked(c.user_low_id,c.user_high_id)and not exists(select 1 from public.social_dm_message_deletions d where d.message_id=m.id and d.app_user_id=p_app_user_id)))or(a.access_scope='support'and a.attached_type='cs_message'and exists(select 1 from public.cs_message_media cm join public.cs_messages m on m.id=cm.message_id join public.cs_inquiries i on i.id=m.inquiry_id where cm.asset_id=a.id and i.app_user_id=p_app_user_id));if not allowed then return null;end if;return jsonb_build_object('storagePath',case when p_variant='thumbnail'then a.thumbnail_path else a.storage_path end,'contentType',case when p_variant='thumbnail'then'image/webp'else a.content_type end);end$$;

create trigger mobile_app_settings_updated before update on public.mobile_app_settings for each row execute function public.set_updated_at();
create trigger mobile_installations_updated before update on public.mobile_installations for each row execute function public.set_updated_at();
create trigger mobile_push_delivery_updated before update on public.mobile_push_delivery_outbox for each row execute function public.set_updated_at();

create function public.mobile_notification_category(p_kind text) returns text language sql immutable set search_path='' as $$
 select case when p_kind in('live_24h','live_10m','schedule_reminder','schedule_changed','schedule_cancelled') then 'schedule'
  when p_kind in('benefit_available','benefit_unlocked','benefit_won','recipient_information_required','fulfillment_meaningful_update','collectible_claim_available','collectible_claim_expiring') then 'benefit'
  when p_kind in('content_reply','official_post') then 'community'
  when p_kind in('participation_checkin','participation_result') then 'participation'
  when p_kind='survey_reminder' then 'participation' else 'account' end
$$;

create function public.mobile_notification_topic_enabled(p_app_user_id uuid,p_kind text) returns boolean language sql stable security definer set search_path='' as $$
 select case public.mobile_notification_category(p_kind)
  when 'schedule' then coalesce(n.live_reminders,true) and coalesce(n.schedule_notifications,true)
  when 'benefit' then coalesce(n.benefit_notifications,true)
  when 'community' then coalesce(n.reply_notifications,true) and coalesce(n.official_post_notifications,true)
  when 'marketing' then coalesce(n.marketing_notifications,false)
  when 'participation' then coalesce(n.participation_notifications,true)
  else true end
 from (select p_app_user_id app_user_id) x left join public.notification_preferences n using(app_user_id)
$$;

create function public.mobile_get_owned_settings(p_app_user_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.mobile_app_settings%rowtype; u public.app_users%rowtype; n public.notification_preferences%rowtype;
begin
 perform public.fan_web_lock_active_user(p_app_user_id);
 insert into public.mobile_app_settings(app_user_id) values(p_app_user_id) on conflict do nothing;
 insert into public.notification_preferences(app_user_id) values(p_app_user_id) on conflict do nothing;
 select * into strict s from public.mobile_app_settings where app_user_id=p_app_user_id;
 select * into strict u from public.app_users where id=p_app_user_id;
 select * into strict n from public.notification_preferences where app_user_id=p_app_user_id;
 return jsonb_build_object('preferredLocale',coalesce(u.preferred_locale,'ko'),'regionCode',s.region_code,'qrVisible',s.qr_visible,'revision',s.revision,
  'topics',jsonb_build_object('schedule',n.live_reminders and n.schedule_notifications,'benefit',n.benefit_notifications,'community',n.reply_notifications and n.official_post_notifications,'marketing',n.marketing_notifications,'participation',n.participation_notifications),
  'channels',jsonb_build_object(
    'push',jsonb_build_object('enabled',s.push_enabled,'available',exists(select 1 from public.mobile_installations i where i.app_user_id=p_app_user_id and i.disabled_at is null and i.permission in('authorized','provisional'))),
    'email',jsonb_build_object('enabled',exists(select 1 from public.fan_notification_channels c where c.app_user_id=p_app_user_id and c.kind='email' and c.status='eligible' and c.consented_at is not null and c.consent_revoked_at is null),'available',exists(select 1 from public.fan_notification_channels c where c.app_user_id=p_app_user_id and c.kind='email' and c.status='eligible')),
    'kakao',jsonb_build_object('enabled',exists(select 1 from public.fan_notification_channels c where c.app_user_id=p_app_user_id and c.kind='kakao' and c.status='eligible' and c.consented_at is not null and c.consent_revoked_at is null),'available',exists(select 1 from public.fan_notification_channels c where c.app_user_id=p_app_user_id and c.kind='kakao' and c.status='eligible')),
    'sms',jsonb_build_object('enabled',false,'available',false)));
end $$;

create function public.mobile_patch_owned_settings(p_app_user_id uuid,p_expected_revision bigint,p_patch jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.mobile_app_settings%rowtype; allowed text[]:=array['preferredLocale','regionCode','qrVisible','pushEnabled','topics']; topics jsonb;
begin
 perform public.fan_web_lock_active_user(p_app_user_id);
 if p_expected_revision is null or jsonb_typeof(p_patch)<>'object' or exists(select 1 from jsonb_object_keys(p_patch) k where not(k=any(allowed))) then raise exception 'MOBILE_SETTINGS_INVALID' using errcode='22023'; end if;
 if p_patch?'preferredLocale' and (jsonb_typeof(p_patch->'preferredLocale')<>'string' or p_patch->>'preferredLocale' not in('ko','en','ja','zh-Hans','zh-Hant','es','id','vi','th','pt','fr')) then raise exception 'MOBILE_SETTINGS_INVALID' using errcode='22023'; end if;
 if p_patch?'regionCode' and (jsonb_typeof(p_patch->'regionCode')<>'string' or p_patch->>'regionCode' !~ '^[A-Z]{2}$') then raise exception 'MOBILE_SETTINGS_INVALID' using errcode='22023'; end if;
 if p_patch?'qrVisible' and jsonb_typeof(p_patch->'qrVisible')<>'boolean' or p_patch?'pushEnabled' and jsonb_typeof(p_patch->'pushEnabled')<>'boolean' then raise exception 'MOBILE_SETTINGS_INVALID' using errcode='22023'; end if;
 topics:=coalesce(p_patch->'topics','{}'::jsonb);
 if jsonb_typeof(topics)<>'object' or exists(select 1 from jsonb_each(topics) x where x.key not in('schedule','benefit','community','marketing','participation') or jsonb_typeof(x.value)<>'boolean') then raise exception 'MOBILE_SETTINGS_INVALID' using errcode='22023'; end if;
 insert into public.mobile_app_settings(app_user_id) values(p_app_user_id) on conflict do nothing;
 select * into strict s from public.mobile_app_settings where app_user_id=p_app_user_id for update;
 if s.revision<>p_expected_revision then raise exception 'MOBILE_SETTINGS_REVISION_CONFLICT' using errcode='40001'; end if;
 if p_patch?'preferredLocale' then update public.app_users set preferred_locale=p_patch->>'preferredLocale' where id=p_app_user_id; end if;
 update public.mobile_app_settings set region_code=coalesce(p_patch->>'regionCode',region_code),qr_visible=coalesce((p_patch->>'qrVisible')::boolean,qr_visible),push_enabled=coalesce((p_patch->>'pushEnabled')::boolean,push_enabled),revision=revision+1 where app_user_id=p_app_user_id;
 insert into public.notification_preferences(app_user_id) values(p_app_user_id) on conflict do nothing;
 update public.notification_preferences set
  live_reminders=coalesce((topics->>'schedule')::boolean,live_reminders),schedule_notifications=coalesce((topics->>'schedule')::boolean,schedule_notifications),
  benefit_notifications=coalesce((topics->>'benefit')::boolean,benefit_notifications),reply_notifications=coalesce((topics->>'community')::boolean,reply_notifications),official_post_notifications=coalesce((topics->>'community')::boolean,official_post_notifications),
  marketing_notifications=coalesce((topics->>'marketing')::boolean,marketing_notifications),participation_notifications=coalesce((topics->>'participation')::boolean,participation_notifications)
 where app_user_id=p_app_user_id;
 return public.mobile_get_owned_settings(p_app_user_id);
end $$;

create function public.mobile_get_installation_version(p_app_user_id uuid,p_installation_id uuid)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare version bigint;begin
 if not exists(select 1 from public.app_users where id=p_app_user_id and status='active')then raise exception'ACTIVE_APP_USER_REQUIRED'using errcode='42501';end if;
 select coalesce(max(installation_version),0)into version from public.mobile_installations where installation_id=p_installation_id;
 return jsonb_build_object('installationId',p_installation_id,'installationVersion',version);
end$$;

create function public.mobile_register_owned_installation(p_app_user_id uuid,p_installation_id uuid,p_platform text,p_push_token text,p_permission text,p_app_version text,p_locale text,p_expected_installation_version bigint,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare token_hash text; request_hash text; prior public.mobile_installation_requests%rowtype; row public.mobile_installations%rowtype; existing public.mobile_installations%rowtype; current_link public.mobile_installations%rowtype; result jsonb; acct bigint;
begin
 perform public.fan_web_lock_active_user(p_app_user_id);
 if p_expected_installation_version is null or p_expected_installation_version<0 or p_platform not in('ios','android') or p_permission not in('authorized','provisional','denied') or length(p_app_version) not between 1 and 80 or p_locale not in('ko','en','ja','zh-Hans','zh-Hant','es','id','vi','th','pt','fr') or (p_permission='denied' and p_push_token is not null) or (p_permission<>'denied' and (p_push_token is null or length(p_push_token) not between 8 and 4096)) then raise exception 'MOBILE_INSTALLATION_INVALID' using errcode='22023'; end if;
 token_hash:=case when p_push_token is null then null else encode(extensions.digest(p_push_token,'sha256'),'hex') end;
 request_hash:=encode(extensions.digest(concat_ws('|',p_installation_id,p_platform,coalesce(token_hash,''),p_permission,p_app_version,p_locale,p_expected_installation_version),'sha256'),'hex');
 select * into prior from public.mobile_installation_requests where app_user_id=p_app_user_id and request_id=p_request_id;
 if found then if prior.request_hash<>request_hash then raise exception 'MOBILE_INSTALLATION_IDEMPOTENCY_CONFLICT' using errcode='23505'; end if; return prior.response; end if;
 insert into public.mobile_app_settings(app_user_id) values(p_app_user_id) on conflict do nothing;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mobile-installation:'||p_installation_id::text,0));
 select * into current_link from public.mobile_installations where installation_id=p_installation_id order by installation_version desc,disabled_at nulls first,updated_at desc,id limit 1 for update;
 if (not found and p_expected_installation_version<>0) or (found and current_link.installation_version<>p_expected_installation_version) then raise exception 'MOBILE_INSTALLATION_REVISION_CONFLICT' using errcode='40001'; end if;
 if token_hash is not null then perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mobile-token:'||token_hash,0)); end if;
 update public.mobile_installations set disabled_at=coalesce(disabled_at,pg_catalog.clock_timestamp()),push_token=null,push_token_hash=null,installation_version=installation_version+1,link_version=link_version+1
  where disabled_at is null and ((installation_id=p_installation_id and app_user_id<>p_app_user_id) or (token_hash is not null and push_token_hash=token_hash and (app_user_id<>p_app_user_id or installation_id<>p_installation_id)));
 select*into existing from public.mobile_installations where app_user_id=p_app_user_id and installation_id=p_installation_id for update;
 if found and existing.platform=p_platform and existing.push_token_hash is not distinct from token_hash and existing.permission=p_permission and existing.app_version=p_app_version and existing.locale=p_locale and((p_permission='denied'and existing.disabled_at is not null)or(p_permission<>'denied'and existing.disabled_at is null))then
  select mobile_account_version into strict acct from public.app_users where id=p_app_user_id;result:=jsonb_build_object('installationId',existing.installation_id,'installationVersion',existing.installation_version,'linkVersion',existing.link_version,'accountVersion',acct,'status',case when existing.disabled_at is null then'active'else'disabled'end);
  insert into public.mobile_installation_requests values(p_app_user_id,p_request_id,request_hash,result,pg_catalog.clock_timestamp());return result;
 end if;
 insert into public.mobile_installations(app_user_id,installation_id,platform,push_token,push_token_hash,permission,app_version,locale,installation_version,disabled_at)
 values(p_app_user_id,p_installation_id,p_platform,p_push_token,token_hash,p_permission,p_app_version,p_locale,p_expected_installation_version+1,case when p_permission='denied' then pg_catalog.clock_timestamp() else null end)
 on conflict(app_user_id,installation_id) do update set platform=excluded.platform,push_token=excluded.push_token,push_token_hash=excluded.push_token_hash,permission=excluded.permission,app_version=excluded.app_version,locale=excluded.locale,disabled_at=excluded.disabled_at,installation_version=p_expected_installation_version+1,link_version=mobile_installations.link_version+case when mobile_installations.disabled_at is not null and excluded.disabled_at is null then 1 else 0 end
 returning * into row;
 select mobile_account_version into strict acct from public.app_users where id=p_app_user_id;
 result:=jsonb_build_object('installationId',row.installation_id,'installationVersion',row.installation_version,'linkVersion',row.link_version,'accountVersion',acct,'status',case when row.disabled_at is null then 'active' else 'disabled' end);
 insert into public.mobile_installation_requests values(p_app_user_id,p_request_id,request_hash,result,pg_catalog.clock_timestamp()); return result;
end $$;

create function public.mobile_disable_owned_installation(p_app_user_id uuid,p_installation_id uuid,p_expected_installation_version bigint,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare row public.mobile_installations%rowtype;prior public.mobile_installation_requests%rowtype;request_hash text;result jsonb;acct bigint;begin
 perform public.fan_web_lock_active_user(p_app_user_id);
 request_hash:=encode(extensions.digest(concat_ws('|','disable',p_installation_id,p_expected_installation_version),'sha256'),'hex');
 select*into prior from public.mobile_installation_requests where app_user_id=p_app_user_id and request_id=p_request_id;
 if found then if prior.request_hash<>request_hash then raise exception'MOBILE_INSTALLATION_IDEMPOTENCY_CONFLICT'using errcode='23505';end if;return prior.response||jsonb_build_object('replayed',true);end if;
 select*into row from public.mobile_installations where app_user_id=p_app_user_id and installation_id=p_installation_id for update;
 if not found then raise exception'MOBILE_INSTALLATION_NOT_FOUND';end if;
 if row.disabled_at is not null or row.installation_version<>p_expected_installation_version then raise exception'MOBILE_INSTALLATION_REVISION_CONFLICT'using errcode='40001';end if;
 update public.mobile_installations set disabled_at=pg_catalog.clock_timestamp(),push_token=null,push_token_hash=null,installation_version=installation_version+1,link_version=link_version+1 where id=row.id returning*into row;
 select mobile_account_version into strict acct from public.app_users where id=p_app_user_id;
 result:=jsonb_build_object('installationId',row.installation_id,'installationVersion',row.installation_version,'linkVersion',row.link_version,'accountVersion',acct,'status','disabled','replayed',false);
 insert into public.mobile_installation_requests(app_user_id,request_id,request_hash,response)values(p_app_user_id,p_request_id,request_hash,result);return result;
end $$;

create function public.mobile_enqueue_notification() returns trigger language plpgsql security definer set search_path='' as $$ begin
 insert into public.mobile_push_delivery_outbox(notification_id,installation_row_id,installation_version,link_version,account_version,available_at)
 select new.id,i.id,i.installation_version,i.link_version,u.mobile_account_version,greatest(new.scheduled_for,pg_catalog.clock_timestamp()) from public.mobile_installations i join public.app_users u on u.id=i.app_user_id and u.status='active' join public.mobile_app_settings s on s.app_user_id=i.app_user_id and s.push_enabled
 where i.app_user_id=new.app_user_id and i.disabled_at is null and i.permission in('authorized','provisional') and public.mobile_notification_topic_enabled(new.app_user_id,new.kind::text)
 on conflict do nothing; return new; end $$;
create trigger mobile_enqueue_notification after insert on public.fan_notifications for each row execute function public.mobile_enqueue_notification();

create function public.mobile_claim_push_deliveries(p_worker_id text,p_batch_size integer,p_lease_seconds integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; begin
 if length(trim(p_worker_id)) not between 3 and 120 or p_batch_size not between 1 and 100 or p_lease_seconds not between 30 and 900 then raise exception 'MOBILE_PUSH_CLAIM_INVALID' using errcode='22023'; end if;
 with due as(select o.id from public.mobile_push_delivery_outbox o where o.attempt_count<8 and o.available_at<=pg_catalog.clock_timestamp() and (o.status in('pending','failed') or(o.status='processing' and o.lease_expires_at<=pg_catalog.clock_timestamp())) order by o.available_at,o.id for update skip locked limit p_batch_size), claimed as(update public.mobile_push_delivery_outbox o set status='processing',attempt_count=o.attempt_count+1,lease_owner=p_worker_id,lease_expires_at=pg_catalog.clock_timestamp()+pg_catalog.make_interval(secs=>p_lease_seconds),last_error_code=null from due where o.id=due.id returning o.*)
 select coalesce(jsonb_agg(jsonb_build_object('deliveryId',id,'notificationId',notification_id,'attemptCount',attempt_count,'leaseExpiresAt',lease_expires_at) order by available_at,id),'[]'::jsonb) into result from claimed; return result; end $$;

create function public.mobile_prepare_push_delivery(p_delivery_id uuid,p_worker_id text) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.mobile_push_delivery_outbox%rowtype; i public.mobile_installations%rowtype; n public.fan_notifications%rowtype; u public.app_users%rowtype; path text; begin
 select * into d from public.mobile_push_delivery_outbox where id=p_delivery_id and status='processing' and lease_owner=p_worker_id and lease_expires_at>pg_catalog.clock_timestamp() for update;
 if not found then return null; end if;
 select * into i from public.mobile_installations where id=d.installation_row_id; select * into n from public.fan_notifications where id=d.notification_id; select * into u from public.app_users where id=n.app_user_id;
 path:=public.fan_web_notification_path(n.app_user_id,n.id);
 if u.status<>'active' or i.disabled_at is not null or i.permission not in('authorized','provisional') or i.installation_version<>d.installation_version or i.link_version<>d.link_version or u.mobile_account_version<>d.account_version or i.app_user_id<>n.app_user_id or not exists(select 1 from public.mobile_app_settings s where s.app_user_id=n.app_user_id and s.push_enabled) or not public.mobile_notification_topic_enabled(n.app_user_id,n.kind::text) or path is null then
  update public.mobile_push_delivery_outbox set status='failed',available_at='infinity'::timestamptz,last_error_code='CURRENT_STATE_INELIGIBLE',lease_owner=null,lease_expires_at=null where id=d.id; return null;
 end if;
 return jsonb_build_object('deliveryId',d.id,'platform',i.platform,'pushToken',i.push_token,'locale',i.locale,'payload',jsonb_build_object('type','notification_available','notificationId',n.id,'category',public.mobile_notification_category(n.kind::text)));
end $$;

create function public.mobile_finish_push_delivery(p_delivery_id uuid,p_worker_id text,p_succeeded boolean,p_error_code text default null) returns boolean language plpgsql security definer set search_path='' as $$
declare changed integer; begin update public.mobile_push_delivery_outbox set status=case when p_succeeded then 'sent'::public.notification_delivery_status else 'failed'::public.notification_delivery_status end,sent_at=case when p_succeeded then pg_catalog.clock_timestamp() else null end,available_at=case when p_succeeded then available_at when p_error_code in('INVALID_TOKEN','PROVIDER_NOT_CONFIGURED','PROVIDER_REJECTED')then'infinity'::timestamptz else pg_catalog.clock_timestamp()+pg_catalog.make_interval(secs=>least(3600,30*power(2,least(attempt_count,7)))::integer) end,last_error_code=case when p_succeeded then null else left(coalesce(p_error_code,'PROVIDER_ERROR'),80) end,lease_owner=null,lease_expires_at=null where id=p_delivery_id and status='processing' and lease_owner=p_worker_id and lease_expires_at>pg_catalog.clock_timestamp(); get diagnostics changed=row_count; return changed>0; end $$;
create function public.mobile_invalidate_push_delivery_token(p_delivery_id uuid,p_worker_id text) returns boolean language plpgsql security definer set search_path='' as $$
declare changed integer; begin
 update public.mobile_installations i set disabled_at=coalesce(i.disabled_at,pg_catalog.clock_timestamp()),push_token=null,push_token_hash=null,installation_version=i.installation_version+1,link_version=i.link_version+1
 from public.mobile_push_delivery_outbox d where d.id=p_delivery_id and d.installation_row_id=i.id and d.status='processing' and d.lease_owner=p_worker_id and d.lease_expires_at>pg_catalog.clock_timestamp() and i.installation_version=d.installation_version;
 get diagnostics changed=row_count; return changed>0;
end $$;

create function public.mobile_get_owned_notifications(p_app_user_id uuid,p_locale public.content_locale,p_category text,p_limit integer,p_cursor_created_at timestamptz default null,p_cursor_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; begin
 if p_category is not null and p_category not in('schedule','benefit','community','participation','account') or p_limit not between 1 and 100 or (p_cursor_created_at is null)<>(p_cursor_id is null) then raise exception 'MOBILE_NOTIFICATIONS_INVALID' using errcode='22023'; end if;
 if not exists(select 1 from public.app_users where id=p_app_user_id and status='active') then raise exception 'ACTIVE_APP_USER_REQUIRED' using errcode='42501'; end if;
 with visible as materialized(select n.*,public.mobile_notification_category(n.kind::text) category,public.fan_web_notification_path(p_app_user_id,n.id) path from public.fan_notifications n where n.app_user_id=p_app_user_id and n.scheduled_for<=pg_catalog.clock_timestamp() and (p_cursor_id is null or(n.created_at,n.id)<(p_cursor_created_at,p_cursor_id))), candidates as materialized(select * from visible where path is not null and (p_category is null or category=p_category) order by created_at desc,id desc limit p_limit+1), page as materialized(select * from candidates order by created_at desc,id desc limit p_limit)
 select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'category',category,'kind',kind,'title',case when p_locale='ko' then '새 알림이 있어요' else 'You have a new notification' end,'detail',case when p_locale='ko' then '앱에서 내용을 확인해 주세요.' else 'Open the app to view the details.' end,'readAt',read_at,'createdAt',created_at,'target',jsonb_build_object('available',true,'deepLink',path)) order by created_at desc,id desc) from page),'[]'::jsonb),'nextCursor',case when(select count(*) from candidates)>p_limit then(select jsonb_build_object('createdAt',created_at,'id',id) from page order by created_at,id limit 1) else null end,'unreadByCategory',coalesce((select jsonb_object_agg(category,total) from(select category,count(*) total from visible where path is not null and read_at is null group by category)x),'{}'::jsonb)) into result; return result; end $$;

create function public.mobile_get_owned_notification(p_app_user_id uuid,p_notification_id uuid,p_locale public.content_locale) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',n.id,'category',public.mobile_notification_category(n.kind::text),'kind',n.kind,'title',case when p_locale='ko' then '새 알림이 있어요' else 'You have a new notification' end,'detail',case when p_locale='ko' then '앱에서 내용을 확인해 주세요.' else 'Open the app to view the details.' end,'readAt',n.read_at,'createdAt',n.created_at,'target',jsonb_build_object('available',true,'deepLink',v.path))
 from public.fan_notifications n cross join lateral(select public.fan_web_notification_path(p_app_user_id,n.id) path)v
 where n.id=p_notification_id and n.app_user_id=p_app_user_id and v.path is not null
$$;

create function public.mobile_get_owned_account_deletion_status(p_app_user_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select case when r.app_user_id is null then jsonb_build_object('status','none') else jsonb_build_object('status',r.status,'requestedAt',r.created_at,'completedAt',r.completed_at,'lastErrorCode',r.last_error_code) end from (select p_app_user_id id)x left join public.account_deletion_requests r on r.app_user_id=x.id where exists(select 1 from public.app_users u where u.id=p_app_user_id)
$$;
create function public.mobile_get_account_deletion_status_by_subject(p_privy_user_id text) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce((select jsonb_build_object('status',r.status,'requestedAt',r.created_at,'completedAt',r.completed_at,'lastErrorCode',r.last_error_code) from public.account_deletion_requests r where r.provider_subject=p_privy_user_id),jsonb_build_object('status','none'))
$$;

create function public.mobile_disable_installations_on_account() returns trigger language plpgsql security definer set search_path='' as $$ begin if old.status='active' and new.status='disabled' then new.mobile_account_version:=old.mobile_account_version+1; update public.mobile_installations set disabled_at=coalesce(disabled_at,pg_catalog.clock_timestamp()),push_token=null,push_token_hash=null,installation_version=installation_version+1,link_version=link_version+1 where app_user_id=new.id and disabled_at is null; end if; return new; end $$;
create trigger mobile_disable_installations_on_account before update of status on public.app_users for each row execute function public.mobile_disable_installations_on_account();

alter function public.scrub_account_deletion(uuid) rename to scrub_account_deletion_before_mobile_settings;
create function public.scrub_account_deletion(p_app_user_id uuid) returns void language plpgsql security definer set search_path='' as $$ begin
 delete from public.cs_message_media cm using public.cs_messages m,public.cs_inquiries i where cm.message_id=m.id and m.inquiry_id=i.id and(i.app_user_id=p_app_user_id or m.actor_app_user_id=p_app_user_id);
 delete from public.mobile_push_delivery_outbox where installation_row_id in(select id from public.mobile_installations where app_user_id=p_app_user_id);
 delete from public.mobile_installation_requests where app_user_id=p_app_user_id;
 delete from public.mobile_installations where app_user_id=p_app_user_id;
 delete from public.mobile_app_settings where app_user_id=p_app_user_id;
 perform public.scrub_account_deletion_before_mobile_settings(p_app_user_id);
end $$;

-- Trustworthy activity playback, live context lookup, and owned pickup QR issuance.
create table public.mobile_participation_activity_sources (
  id uuid primary key default extensions.gen_random_uuid(),
  source_kind text not null check(source_kind in('video','mission')),
  playback_url text not null check(length(playback_url) between 1 and 2000 and playback_url=btrim(playback_url) and playback_url!~'[@[:space:]]' and(playback_url~'^/[^/[:space:]][^[:space:]]*$'or playback_url~'^https://[a-z0-9]([a-z0-9.-]*[a-z0-9])?/[^[:space:]]+$')),
  duration_ms bigint not null check(duration_ms between 1000 and 86400000),
  state text not null default'active' check(state in('active','revoked')),
  revision integer not null default 1 check(revision>0),
  created_by_admin_id uuid not null references public.admin_allowlist(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),updated_at timestamptz not null default pg_catalog.clock_timestamp()
);
alter table public.mobile_participation_activity_sources enable row level security;
alter table public.mobile_participation_activity_sources force row level security;
revoke all on table public.mobile_participation_activity_sources from public,anon,authenticated,service_role;
grant select,insert,update on table public.mobile_participation_activity_sources to service_role;

alter table public.mobile_participation_activity_policies add column source_id uuid references public.mobile_participation_activity_sources(id) on delete restrict;
alter table public.mobile_participation_activity_policies add constraint mobile_participation_published_activity_source check(state<>'published'or source_id is not null) not valid;
alter table public.mobile_participation_activity_policies validate constraint mobile_participation_published_activity_source;
alter table public.mobile_participation_activity_sessions add column source_id uuid references public.mobile_participation_activity_sources(id) on delete restrict,
  add column source_revision integer,
  add column last_position_ms bigint not null default 0 check(last_position_ms>=0),
  add column last_client_monotonic_ms bigint check(last_client_monotonic_ms is null or last_client_monotonic_ms>=0);

create function public.upsert_admin_mobile_participation_activity_source(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_source_id uuid,p_expected_revision integer,p_source_kind text,p_playback_url text,p_duration_ms bigint,p_state text,p_reason text,p_correlation_id uuid)returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.mobile_participation_activity_sources%rowtype;begin
 perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,true);
 if p_source_kind not in('video','mission')or p_state not in('active','revoked')or p_duration_ms not between 1000 and 86400000 or length(btrim(coalesce(p_reason,'')))not between 10 and 500 or p_correlation_id is null then raise exception'MOBILE_PARTICIPATION_INVALID';end if;
 if p_source_id is null then
  insert into public.mobile_participation_activity_sources(source_kind,playback_url,duration_ms,state,created_by_admin_id)values(p_source_kind,p_playback_url,p_duration_ms,p_state,p_actor_admin_allowlist_id)returning*into s;
 else
  update public.mobile_participation_activity_sources set source_kind=p_source_kind,playback_url=p_playback_url,duration_ms=p_duration_ms,state=p_state,revision=revision+1,updated_at=pg_catalog.clock_timestamp()where id=p_source_id and revision=p_expected_revision and((source_kind=p_source_kind and playback_url=p_playback_url and duration_ms=p_duration_ms)or not exists(select 1 from public.mobile_participation_activity_policies x where x.source_id=p_source_id))returning*into s;
  if not found then raise exception'MOBILE_PARTICIPATION_CONFLICT';end if;
 end if;
 insert into public.mobile_participation_admin_audits(actor_app_user_id,actor_admin_allowlist_id,action,target_type,target_id,correlation_id,reason,detail)values(p_actor_app_user_id,p_actor_admin_allowlist_id,'activity_source_upserted','activity_source',s.id,p_correlation_id,btrim(p_reason),jsonb_build_object('revision',s.revision,'state',s.state));
 return jsonb_build_object('id',s.id,'revision',s.revision,'state',s.state,'sourceKind',s.source_kind,'playbackUrl',s.playback_url,'durationMs',s.duration_ms);
end $$;

create function public.upsert_admin_mobile_participation_activity_v2(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_activity_id uuid,p_expected_revision integer,p_context_id uuid,p_source_id uuid,p_policy_version text,p_activity_kind text,p_state text,p_opens_at timestamptz,p_closes_at timestamptz,p_completion_seconds integer,p_max_heartbeat_gap_seconds integer,p_reward_config jsonb,p_reason text,p_correlation_id uuid)returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.mobile_participation_activity_policies%rowtype;s public.mobile_participation_activity_sources%rowtype;begin
 perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,true);
 select*into s from public.mobile_participation_activity_sources where id=p_source_id and source_kind=p_activity_kind;
 if not found or(p_state='published'and s.state<>'active')or p_completion_seconds*1000>s.duration_ms or length(btrim(coalesce(p_reason,'')))not between 10 and 500 or not exists(select 1 from public.mobile_participation_contexts where id=p_context_id)then raise exception'MOBILE_PARTICIPATION_INVALID';end if;
 if p_activity_id is null then
  insert into public.mobile_participation_activity_policies(context_id,source_id,policy_version,activity_kind,state,opens_at,closes_at,completion_seconds,max_heartbeat_gap_seconds,reward_config)values(p_context_id,p_source_id,p_policy_version,p_activity_kind,p_state,p_opens_at,p_closes_at,p_completion_seconds,p_max_heartbeat_gap_seconds,p_reward_config)returning*into a;
 else
  update public.mobile_participation_activity_policies set context_id=p_context_id,source_id=p_source_id,policy_version=p_policy_version,activity_kind=p_activity_kind,state=p_state,opens_at=p_opens_at,closes_at=p_closes_at,completion_seconds=p_completion_seconds,max_heartbeat_gap_seconds=p_max_heartbeat_gap_seconds,reward_config=p_reward_config,revision=revision+1 where id=p_activity_id and revision=p_expected_revision and not exists(select 1 from public.mobile_participation_activity_sessions where activity_id=p_activity_id)returning*into a;
  if not found then raise exception'MOBILE_PARTICIPATION_CONFLICT';end if;
 end if;
 insert into public.mobile_participation_admin_audits(actor_app_user_id,actor_admin_allowlist_id,action,target_type,target_id,correlation_id,reason,detail)values(p_actor_app_user_id,p_actor_admin_allowlist_id,'activity_upserted','activity',a.id,p_correlation_id,btrim(p_reason),jsonb_build_object('revision',a.revision,'state',a.state,'sourceId',a.source_id));
 return jsonb_build_object('id',a.id,'revision',a.revision,'state',a.state,'policyVersion',a.policy_version,'sourceId',a.source_id);
end $$;

create or replace function public.start_owned_mobile_participation_activity(p_app_user_id uuid,p_activity_id uuid,p_request_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare a public.mobile_participation_activity_policies%rowtype;s public.mobile_participation_activity_sessions%rowtype;src public.mobile_participation_activity_sources%rowtype;h text:=md5(p_activity_id::text);begin
 perform public.fan_web_lock_active_user(p_app_user_id);
 select a0.*into a from public.mobile_participation_activity_policies a0 join public.mobile_participation_activity_sources x on x.id=a0.source_id and x.state='active'and x.source_kind=a0.activity_kind where a0.id=p_activity_id and a0.state='published'and pg_catalog.clock_timestamp()>=a0.opens_at and pg_catalog.clock_timestamp()<a0.closes_at;
 if not found then raise exception'MOBILE_PARTICIPATION_ACTIVITY_NOT_CONFIGURED';end if;
 select*into src from public.mobile_participation_activity_sources where id=a.source_id;
 if not public.mobile_participation_context_access(p_app_user_id,a.context_id,false)then raise exception'MOBILE_PARTICIPATION_FORBIDDEN';end if;
 select*into s from public.mobile_participation_activity_sessions where(app_user_id=p_app_user_id and request_key=p_request_key)or(activity_id=p_activity_id and app_user_id=p_app_user_id)order by(request_key=p_request_key)desc limit 1 for update;
 if found then if s.activity_id<>p_activity_id or s.payload_hash<>h then raise exception'MOBILE_PARTICIPATION_CONFLICT';end if;return jsonb_build_object('id',s.id,'state',s.state,'version',s.version,'watchedSeconds',s.watched_seconds,'completionSeconds',a.completion_seconds,'source',jsonb_build_object('id',src.id,'kind',src.source_kind,'playbackUrl',src.playback_url,'durationMs',src.duration_ms,'revision',src.revision),'replayed',true);end if;
 insert into public.mobile_participation_activity_sessions(activity_id,app_user_id,request_key,payload_hash,source_id,source_revision)values(p_activity_id,p_app_user_id,p_request_key,h,src.id,src.revision)returning*into s;
 return jsonb_build_object('id',s.id,'state',s.state,'version',s.version,'watchedSeconds',s.watched_seconds,'completionSeconds',a.completion_seconds,'source',jsonb_build_object('id',src.id,'kind',src.source_kind,'playbackUrl',src.playback_url,'durationMs',src.duration_ms,'revision',src.revision),'replayed',false);
end$$;

drop function public.heartbeat_owned_mobile_participation_activity(uuid,uuid,integer,boolean);
create function public.heartbeat_owned_mobile_participation_activity(p_app_user_id uuid,p_session_id uuid,p_expected_version integer,p_foreground boolean,p_playing boolean,p_position_ms bigint,p_client_monotonic_ms bigint)returns jsonb language plpgsql security definer set search_path=''as $$
declare s public.mobile_participation_activity_sessions%rowtype;a public.mobile_participation_activity_policies%rowtype;src public.mobile_participation_activity_sources%rowtype;server_delta bigint;client_delta bigint;position_delta bigint;credited integer:=0;begin
 perform public.fan_web_lock_active_user(p_app_user_id);
 if p_position_ms<0 or p_client_monotonic_ms<0 then raise exception'MOBILE_PARTICIPATION_INVALID';end if;
 select*into s from public.mobile_participation_activity_sessions where id=p_session_id and app_user_id=p_app_user_id for update;
 if not found then raise exception'MOBILE_PARTICIPATION_NOT_FOUND';end if;if s.version<>p_expected_version then raise exception'MOBILE_PARTICIPATION_CONFLICT';end if;
 select*into a from public.mobile_participation_activity_policies where id=s.activity_id;select*into src from public.mobile_participation_activity_sources where id=s.source_id;
 if s.state<>'viewing'then return jsonb_build_object('id',s.id,'state',s.state,'version',s.version,'watchedSeconds',s.watched_seconds,'completionSeconds',a.completion_seconds,'creditedSeconds',0);end if;
 if a.state<>'published'or pg_catalog.clock_timestamp()>=a.closes_at or src.state<>'active'or src.revision<>s.source_revision or a.source_id<>src.id then
  update public.mobile_participation_activity_sessions set state='rejected',rejection_code='ACTIVITY_CLOSED',version=version+1,updated_at=pg_catalog.clock_timestamp()where id=s.id returning*into s;
 elsif p_position_ms>src.duration_ms+1000 then raise exception'MOBILE_PARTICIPATION_INVALID';
 else
  server_delta:=least(a.max_heartbeat_gap_seconds::bigint*1000,greatest(0,floor(extract(epoch from(pg_catalog.clock_timestamp()-s.last_heartbeat_at))*1000)::bigint));
  if s.last_client_monotonic_ms is not null then client_delta:=p_client_monotonic_ms-s.last_client_monotonic_ms;position_delta:=p_position_ms-s.last_position_ms;end if;
  if p_foreground and p_playing and client_delta>0 and position_delta>0 and position_delta<=client_delta+1500 and position_delta<=server_delta+1500 then credited:=floor(least(server_delta,client_delta,position_delta)/1000)::integer;end if;
  update public.mobile_participation_activity_sessions set watched_seconds=watched_seconds+credited,last_heartbeat_at=pg_catalog.clock_timestamp(),last_position_ms=p_position_ms,last_client_monotonic_ms=p_client_monotonic_ms,version=version+1,updated_at=pg_catalog.clock_timestamp()where id=s.id returning*into s;
 end if;
 return jsonb_build_object('id',s.id,'state',s.state,'version',s.version,'watchedSeconds',s.watched_seconds,'completionSeconds',a.completion_seconds,'creditedSeconds',credited);
end$$;

create or replace function public.claim_mobile_participation_activity_completion(p_limit integer default 25)returns jsonb language plpgsql security definer set search_path=''as $$declare r jsonb;begin with candidates as(select s.id from public.mobile_participation_activity_sessions s join public.mobile_participation_activity_policies a on a.id=s.activity_id join public.mobile_participation_activity_sources src on src.id=s.source_id and src.id=a.source_id and src.state='active'and src.revision=s.source_revision join public.app_users u on u.id=s.app_user_id and u.status='active'where s.state='viewing'and s.watched_seconds>=a.completion_seconds and a.state='published'and pg_catalog.clock_timestamp()<a.closes_at order by s.updated_at for update of s skip locked limit least(greatest(p_limit,1),50)),claimed as(update public.mobile_participation_activity_sessions s set state='completing',version=version+1,updated_at=pg_catalog.clock_timestamp()from candidates c where s.id=c.id and s.state='viewing'returning s.*)select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object('sessionId',id,'activityId',activity_id,'appUserId',app_user_id,'version',version)),'[]'::jsonb))into r from claimed;return r;end$$;

create or replace function public.finish_mobile_participation_activity_completion(p_session_id uuid,p_expected_version integer,p_accepted boolean,p_rejection_code text default null)returns jsonb language plpgsql security definer set search_path=''as $$declare s public.mobile_participation_activity_sessions%rowtype;a public.mobile_participation_activity_policies%rowtype;source_valid boolean;begin select*into s from public.mobile_participation_activity_sessions where id=p_session_id for update;if not found or s.state<>'completing'or s.version<>p_expected_version then raise exception'MOBILE_PARTICIPATION_CONFLICT';end if;select*into a from public.mobile_participation_activity_policies where id=s.activity_id;select exists(select 1 from public.mobile_participation_activity_sources src where src.id=s.source_id and src.id=a.source_id and src.state='active'and src.revision=s.source_revision)into source_valid;if not p_accepted or a.state<>'published'or not source_valid or not exists(select 1 from public.app_users where id=s.app_user_id and status='active')then update public.mobile_participation_activity_sessions set state='rejected',rejection_code=coalesce(p_rejection_code,'ACTIVITY_REJECTED'),version=version+1,updated_at=pg_catalog.clock_timestamp()where id=s.id returning*into s;update public.mobile_participation_activity_rewards set status='cancelled',updated_at=pg_catalog.clock_timestamp()where session_id=s.id and status='pending';else update public.mobile_participation_activity_sessions set state='completed',completed_at=pg_catalog.clock_timestamp(),version=version+1,updated_at=pg_catalog.clock_timestamp()where id=s.id returning*into s;insert into public.mobile_participation_activity_rewards(session_id,status,reward_snapshot)values(s.id,case when a.reward_config is null then'awarded'else'pending'end,coalesce(a.reward_config,jsonb_build_object('kind','none')))on conflict(session_id)do nothing;end if;return jsonb_build_object('id',s.id,'state',s.state,'version',s.version,'completedAt',s.completed_at,'rewardStatus',(select status from public.mobile_participation_activity_rewards where session_id=s.id));end$$;

create function public.read_owned_mobile_participation_live_context(p_app_user_id uuid,p_live_slug text)returns jsonb language plpgsql security definer set search_path=''as $$declare result jsonb;begin perform public.fan_web_lock_active_user(p_app_user_id);select jsonb_build_object('id',c.id,'contextType',c.context_type,'sourceLiveEventId',l.id,'slug',c.slug,'policyVersion',c.policy_version,'opensAt',c.opens_at,'closesAt',c.closes_at)into result from public.live_events l join public.mobile_participation_contexts c on c.source_live_event_id=l.id and c.context_type='live'and c.state='published'where l.slug=p_live_slug and l.publication_status='published'and l.archived_at is null and public.mobile_participation_context_access(p_app_user_id,c.id,false);return result;end$$;

alter table public.mobile_participation_qr_codes alter column created_by_admin_id drop not null;
alter table public.mobile_participation_qr_codes add column created_by_app_user_id uuid references public.app_users(id) on delete restrict;
alter table public.mobile_participation_qr_codes add constraint mobile_participation_qr_issuer check((created_by_admin_id is not null)::integer+(created_by_app_user_id is not null)::integer=1);
create table public.mobile_benefit_pickup_qr_requests(
 app_user_id uuid not null references public.app_users(id) on delete restrict,request_key uuid not null,award_id uuid not null references public.mobile_benefit_awards(id) on delete restrict,
 qr_id uuid not null references public.mobile_participation_qr_codes(id) on delete restrict,raw_code text not null,result jsonb not null,created_at timestamptz not null default pg_catalog.clock_timestamp(),primary key(app_user_id,request_key)
);
alter table public.mobile_benefit_pickup_qr_requests enable row level security;alter table public.mobile_benefit_pickup_qr_requests force row level security;
revoke all on table public.mobile_benefit_pickup_qr_requests from public,anon,authenticated,service_role;grant select,insert on table public.mobile_benefit_pickup_qr_requests to service_role;

create function public.issue_owned_mobile_benefit_pickup_qr(p_app_user_id uuid,p_award_id uuid,p_request_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare award public.mobile_benefit_awards%rowtype;existing public.mobile_benefit_pickup_qr_requests%rowtype;q public.mobile_participation_qr_codes%rowtype;raw text:='byus_'||replace(extensions.gen_random_uuid()::text,'-','');policy text;result jsonb;begin
 perform public.fan_web_lock_active_user(p_app_user_id);
 select*into existing from public.mobile_benefit_pickup_qr_requests where app_user_id=p_app_user_id and request_key=p_request_key;if found then if existing.award_id<>p_award_id then raise exception'MOBILE_BENEFIT_REQUEST_CONFLICT';end if;return existing.result||jsonb_build_object('replayed',true);end if;
 select*into award from public.mobile_benefit_awards where id=p_award_id and app_user_id=p_app_user_id for update;
 if not found or award.fulfillment_method<>'on_site_pickup'or award.fulfillment_status<>'pickup_available'then raise exception'MOBILE_BENEFIT_PICKUP_NOT_AVAILABLE';end if;
 select d.policy_version into policy from public.mobile_benefit_draw_requests d where d.id=award.draw_request_id;
 update public.mobile_participation_qr_codes set state='revoked'where purpose='prize_pickup'and target_id=award.id and owner_app_user_id=p_app_user_id and state='active';
 insert into public.mobile_participation_qr_codes(token_hash,purpose,target_type,target_id,owner_app_user_id,policy_version,expires_at,one_time,staff_required,created_by_app_user_id)values(encode(extensions.digest(raw,'sha256'),'hex'),'prize_pickup','mobile_benefit_award',award.id,p_app_user_id,policy,pg_catalog.clock_timestamp()+interval'10 minutes',true,true,p_app_user_id)returning*into q;
 result:=jsonb_build_object('id',q.id,'awardId',award.id,'rawCode',raw,'purpose','prize_pickup','expiresAt',q.expires_at,'oneTime',true,'staffConfirmationRequired',true,'replayed',false);
 insert into public.mobile_benefit_pickup_qr_requests(app_user_id,request_key,award_id,qr_id,raw_code,result)values(p_app_user_id,p_request_key,award.id,q.id,raw,result);return result;
end$$;
create function public.read_owned_mobile_benefit_pickup_qr(p_app_user_id uuid,p_award_id uuid)returns jsonb language plpgsql security definer set search_path=''as $$declare result jsonb;begin perform public.fan_web_lock_active_user(p_app_user_id);select r.result||jsonb_build_object('replayed',true)into result from public.mobile_benefit_pickup_qr_requests r join public.mobile_participation_qr_codes q on q.id=r.qr_id join public.mobile_benefit_awards a on a.id=r.award_id and a.app_user_id=r.app_user_id where r.app_user_id=p_app_user_id and r.award_id=p_award_id and q.state='active'and q.expires_at>pg_catalog.clock_timestamp()and a.fulfillment_method='on_site_pickup'and a.fulfillment_status='pickup_available'order by r.created_at desc limit 1;return result;end$$;

create function public.mobile_store_admin_create_product_policy(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_correlation_id uuid,p_store text,p_product_id text,p_policy_version text,p_ticket_quantity bigint,p_support_rate_bps integer,p_reward_policy_version integer,p_effective_at timestamptz,p_expected_current_policy_id uuid,p_reason text)returns jsonb language plpgsql security definer set search_path=''as $$
declare current_policy public.mobile_store_product_policies%rowtype;created public.mobile_store_product_policies%rowtype;begin
 perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,true);
 if p_correlation_id is null or p_store not in('apple','google')or length(btrim(coalesce(p_product_id,'')))not between 1 and 200 or length(btrim(coalesce(p_policy_version,'')))not between 1 and 80 or p_ticket_quantity<=0 or p_support_rate_bps not between 0 and 10000 or p_reward_policy_version<=0 or p_effective_at is null or length(btrim(coalesce(p_reason,'')))not between 10 and 1000 then raise exception'MOBILE_STORE_POLICY_INVALID';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mobile-store-policy:'||p_store||':'||btrim(p_product_id),0));
 select*into current_policy from public.mobile_store_product_policies where store=p_store and environment='sandbox'and product_id=btrim(p_product_id)and retired_at is null for update;
 if current_policy.id is distinct from p_expected_current_policy_id then raise exception'MOBILE_STORE_POLICY_CONFLICT'using errcode='40001';end if;
 if current_policy.id is not null then update public.mobile_store_product_policies set retired_at=greatest(pg_catalog.clock_timestamp(),current_policy.effective_at+interval'1 microsecond')where id=current_policy.id;end if;
 insert into public.mobile_store_product_policies(store,environment,product_id,policy_version,currency,ticket_quantity,support_rate_bps,reward_policy_version,effective_at)
 values(p_store,'sandbox',btrim(p_product_id),btrim(p_policy_version),'KRW',p_ticket_quantity,p_support_rate_bps,p_reward_policy_version,p_effective_at)returning*into created;
 insert into public.audit_logs(actor_app_user_id,actor_admin_allowlist_id,action,entity_type,entity_id,correlation_id,before_after_summary)values(p_actor_app_user_id,p_actor_admin_allowlist_id,'mobile_store.product_policy.created','mobile_store_product_policy',created.id::text,p_correlation_id,jsonb_build_object('replacedPolicyId',current_policy.id,'store',created.store,'productId',created.product_id,'policyVersion',created.policy_version,'ticketQuantity',created.ticket_quantity,'supportRateBps',created.support_rate_bps,'rewardPolicyVersion',created.reward_policy_version,'effectiveAt',created.effective_at,'reason',btrim(p_reason)));
 return jsonb_build_object('id',created.id,'store',created.store,'environment',created.environment,'productId',created.product_id,'policyVersion',created.policy_version,'currency',created.currency,'ticketQuantity',created.ticket_quantity,'supportRateBps',created.support_rate_bps,'rewardPolicyVersion',created.reward_policy_version,'effectiveAt',created.effective_at,'replacedPolicyId',current_policy.id);
exception when unique_violation then raise exception'MOBILE_STORE_POLICY_CONFLICT'using errcode='40001';end$$;

create function public.mobile_store_admin_set_sandbox_tester(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_correlation_id uuid,p_app_user_id uuid,p_enabled boolean,p_reason text)returns jsonb language plpgsql security definer set search_path=''as $$
declare previous boolean;begin perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,true);
 if p_correlation_id is null or p_enabled is null or length(btrim(coalesce(p_reason,'')))not between 10 and 1000 then raise exception'MOBILE_STORE_TESTER_INVALID';end if;
 if p_enabled and not exists(select 1 from public.app_users where id=p_app_user_id and status='active')or not exists(select 1 from public.app_users where id=p_app_user_id)then raise exception'MOBILE_STORE_TESTER_NOT_FOUND';end if;
 select enabled into previous from public.mobile_store_sandbox_testers where app_user_id=p_app_user_id for update;
 insert into public.mobile_store_sandbox_testers(app_user_id,enabled)values(p_app_user_id,p_enabled)on conflict(app_user_id)do update set enabled=excluded.enabled;
 insert into public.audit_logs(actor_app_user_id,actor_admin_allowlist_id,action,entity_type,entity_id,correlation_id,before_after_summary)values(p_actor_app_user_id,p_actor_admin_allowlist_id,'mobile_store.sandbox_tester.changed','app_user',p_app_user_id::text,p_correlation_id,jsonb_build_object('beforeEnabled',previous,'afterEnabled',p_enabled,'reason',btrim(p_reason)));
 return jsonb_build_object('appUserId',p_app_user_id,'enabled',p_enabled);
end$$;

create function public.resolve_admin_mobile_participation_qr(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_raw_code text,p_request_key uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare h text:=encode(extensions.digest(coalesce(p_raw_code,''),'sha256'),'hex');q public.mobile_participation_qr_codes%rowtype;req public.mobile_participation_qr_requests%rowtype;result jsonb;begin
 perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,true);
 if p_request_key is null or length(coalesce(p_raw_code,''))not between 8 and 512 then raise exception'MOBILE_PARTICIPATION_INVALID';end if;
 select*into q from public.mobile_participation_qr_codes where token_hash=h for update;
 if not found or q.state<>'active'or q.expires_at<=pg_catalog.clock_timestamp()or not q.staff_required or q.owner_app_user_id is null then raise exception'MOBILE_PARTICIPATION_QR_NOT_FOUND';end if;
 select*into req from public.mobile_participation_qr_requests where app_user_id=q.owner_app_user_id and request_key=p_request_key;
 if found then if req.token_hash<>h then raise exception'MOBILE_PARTICIPATION_CONFLICT';end if;return req.result||jsonb_build_object('replayed',true);end if;
 result:=jsonb_build_object('requestId',extensions.gen_random_uuid(),'status','resolved','purpose',q.purpose,'targetType',q.target_type,'targetId',q.target_id,'expiresAt',q.expires_at,'consumedAt',q.consumed_at,'staffConfirmationRequired',true,'replayed',false);
 insert into public.mobile_participation_qr_requests(id,app_user_id,request_key,token_hash,result)values((result->>'requestId')::uuid,q.owner_app_user_id,p_request_key,h,result);return result;
end$$;

revoke all on function public.upsert_admin_mobile_participation_activity_source(uuid,uuid,uuid,integer,text,text,bigint,text,text,uuid),public.upsert_admin_mobile_participation_activity_v2(uuid,uuid,uuid,integer,uuid,uuid,text,text,text,timestamptz,timestamptz,integer,integer,jsonb,text,uuid),public.heartbeat_owned_mobile_participation_activity(uuid,uuid,integer,boolean,boolean,bigint,bigint),public.read_owned_mobile_participation_live_context(uuid,text),public.issue_owned_mobile_benefit_pickup_qr(uuid,uuid,uuid),public.read_owned_mobile_benefit_pickup_qr(uuid,uuid),public.resolve_admin_mobile_participation_qr(uuid,uuid,text,uuid)from public,anon,authenticated,service_role;
grant execute on function public.upsert_admin_mobile_participation_activity_source(uuid,uuid,uuid,integer,text,text,bigint,text,text,uuid),public.upsert_admin_mobile_participation_activity_v2(uuid,uuid,uuid,integer,uuid,uuid,text,text,text,timestamptz,timestamptz,integer,integer,jsonb,text,uuid),public.heartbeat_owned_mobile_participation_activity(uuid,uuid,integer,boolean,boolean,bigint,bigint),public.read_owned_mobile_participation_live_context(uuid,text),public.issue_owned_mobile_benefit_pickup_qr(uuid,uuid,uuid),public.read_owned_mobile_benefit_pickup_qr(uuid,uuid),public.resolve_admin_mobile_participation_qr(uuid,uuid,text,uuid)to service_role;

revoke all on table public.mobile_app_settings,public.mobile_installations,public.mobile_installation_requests,public.mobile_push_delivery_outbox from public,anon,authenticated;
grant select,insert,update,delete on table public.mobile_app_settings,public.mobile_installations,public.mobile_installation_requests,public.mobile_push_delivery_outbox to service_role;
do $$ declare f record; begin for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'mobile_%' or p.proname='scrub_account_deletion') loop execute format('revoke all on function %s from public,anon,authenticated',f.signature); execute format('grant execute on function %s to service_role',f.signature); end loop; end $$;

commit;
