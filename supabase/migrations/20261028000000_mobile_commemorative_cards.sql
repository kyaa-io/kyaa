begin;

-- Commemorative cards are operator-configured and intentionally unseeded.
create table public.mobile_commemorative_cards (
  id uuid primary key default extensions.gen_random_uuid(),
  source_event_id uuid not null references public.mobile_participation_events(id) on delete restrict,
  slug text not null unique check(slug~'^[a-z0-9]+(-[a-z0-9]+)*$'),
  policy_version text not null check(length(btrim(policy_version))between 1 and 80),
  state text not null default'draft' check(state in('draft','published','ended')),
  opens_at timestamptz not null, closes_at timestamptz not null,
  title_ko text not null check(length(btrim(title_ko))between 1 and 200),
  title_en text not null check(length(btrim(title_en))between 1 and 200),
  subtitle_ko text not null default'', subtitle_en text not null default'',
  caption_ko text not null check(length(btrim(caption_ko))between 1 and 300),
  caption_en text not null check(length(btrim(caption_en))between 1 and 300),
  selection_label_ko text not null default'받을 멤버 카드',
  selection_label_en text not null default'Member card',
  image_url text not null check(image_url~'^/'or image_url~'^https://'),
  member_options jsonb not null check(jsonb_typeof(member_options)='array'and jsonb_array_length(member_options)between 1 and 20),
  share_allowed boolean not null default true,
  revision integer not null default 1 check(revision>0),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  check(opens_at<closes_at), unique(source_event_id)
);
create table public.mobile_commemorative_card_claims (
  id uuid primary key default extensions.gen_random_uuid(),
  card_id uuid not null references public.mobile_commemorative_cards(id) on delete restrict,
  app_user_id uuid not null references public.app_users(id) on delete restrict,
  member_key text not null check(member_key~'^[a-z0-9]+(-[a-z0-9]+)*$'),
  request_key uuid not null,
  claimed_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique(card_id,app_user_id), unique(app_user_id,request_key)
);
alter table public.mobile_commemorative_cards enable row level security;
alter table public.mobile_commemorative_cards force row level security;
alter table public.mobile_commemorative_card_claims enable row level security;
alter table public.mobile_commemorative_card_claims force row level security;
revoke all on public.mobile_commemorative_cards,public.mobile_commemorative_card_claims from public,anon,authenticated,service_role;

create function public.read_owned_mobile_commemorative_card(p_app_user_id uuid,p_card_id uuid,p_locale public.content_locale default'ko')returns jsonb language plpgsql security definer set search_path=''as $$
declare c public.mobile_commemorative_cards%rowtype;o public.mobile_commemorative_card_claims%rowtype;v_eligible boolean;v_members jsonb;
begin
  perform 1 from public.app_users where id=p_app_user_id;
  if not found then raise exception'MOBILE_PARTICIPATION_FORBIDDEN';end if;
  select*into c from public.mobile_commemorative_cards where id=p_card_id and state in('published','ended');
  if not found then return null;end if;
  select*into o from public.mobile_commemorative_card_claims where card_id=c.id and app_user_id=p_app_user_id;
  v_eligible:=o.id is not null or(c.state='published'and pg_catalog.clock_timestamp()>=c.opens_at and pg_catalog.clock_timestamp()<c.closes_at and exists(select 1 from public.mobile_participation_checkins x where x.event_id=c.source_event_id and x.app_user_id=p_app_user_id and x.status='valid'));
  select coalesce(jsonb_agg(jsonb_build_object('key',x->>'key','name',case p_locale when'en'then x->>'nameEn'else x->>'nameKo'end)order by ord),'[]'::jsonb)into v_members from jsonb_array_elements(c.member_options)with ordinality m(x,ord);
  return jsonb_build_object('id',c.id,'policyVersion',c.policy_version,'title',case p_locale when'en'then c.title_en else c.title_ko end,'subtitle',case p_locale when'en'then c.subtitle_en else c.subtitle_ko end,'caption',case p_locale when'en'then c.caption_en else c.caption_ko end,'selectionLabel',case p_locale when'en'then c.selection_label_en else c.selection_label_ko end,'imageUrl',c.image_url,'members',v_members,'eligible',v_eligible,'eligibilityReason',case when o.id is not null then null when c.state<>'published'or pg_catalog.clock_timestamp()<c.opens_at or pg_catalog.clock_timestamp()>=c.closes_at then'closed'when not v_eligible then'checkin_required'else null end,'shareAllowed',c.share_allowed,'ownership',case when o.id is null then null else jsonb_build_object('id',o.id,'memberKey',o.member_key,'claimedAt',o.claimed_at)end);
end$$;

create function public.claim_owned_mobile_commemorative_card(p_app_user_id uuid,p_card_id uuid,p_member_key text,p_request_key uuid,p_expected_policy_version text,p_locale public.content_locale default'ko')returns jsonb language plpgsql security definer set search_path=''as $$
declare c public.mobile_commemorative_cards%rowtype;o public.mobile_commemorative_card_claims%rowtype;v_replayed boolean:=false;
begin
  select*into c from public.mobile_commemorative_cards where id=p_card_id for update;
  if not found then raise exception'MOBILE_PARTICIPATION_NOT_FOUND';end if;
  select*into o from public.mobile_commemorative_card_claims where card_id=c.id and app_user_id=p_app_user_id;
  if o.id is not null then return public.read_owned_mobile_commemorative_card(p_app_user_id,c.id,p_locale)||jsonb_build_object('claimedAlready',true,'replayed',o.request_key=p_request_key);end if;
  if exists(select 1 from public.mobile_commemorative_card_claims where app_user_id=p_app_user_id and request_key=p_request_key)then raise exception'MOBILE_PARTICIPATION_CONFLICT';end if;
  if c.state<>'published'or pg_catalog.clock_timestamp()<c.opens_at or pg_catalog.clock_timestamp()>=c.closes_at then raise exception'MOBILE_PARTICIPATION_CARD_CLOSED';end if;
  if c.policy_version<>p_expected_policy_version then raise exception'MOBILE_PARTICIPATION_POLICY_CHANGED';end if;
  if not exists(select 1 from public.mobile_participation_checkins x where x.event_id=c.source_event_id and x.app_user_id=p_app_user_id and x.status='valid')then raise exception'MOBILE_PARTICIPATION_VISIT_REQUIRED';end if;
  if not exists(select 1 from jsonb_array_elements(c.member_options)x where x->>'key'=p_member_key)then raise exception'MOBILE_PARTICIPATION_INVALID';end if;
  insert into public.mobile_commemorative_card_claims(card_id,app_user_id,member_key,request_key)values(c.id,p_app_user_id,p_member_key,p_request_key)returning*into o;
  return public.read_owned_mobile_commemorative_card(p_app_user_id,c.id,p_locale)||jsonb_build_object('claimedAlready',false,'replayed',v_replayed);
end$$;

create function public.read_owned_mobile_commemorative_card_share(p_app_user_id uuid,p_card_id uuid,p_locale public.content_locale default'ko')returns jsonb language plpgsql security definer set search_path=''as $$
declare c public.mobile_commemorative_cards%rowtype;o public.mobile_commemorative_card_claims%rowtype;v_member jsonb;
begin
  select*into c from public.mobile_commemorative_cards where id=p_card_id and share_allowed;
  if found then select*into o from public.mobile_commemorative_card_claims where card_id=c.id and app_user_id=p_app_user_id;end if;
  if not found then raise exception'MOBILE_PARTICIPATION_FORBIDDEN';end if;
  select x into v_member from jsonb_array_elements(c.member_options)x where x->>'key'=o.member_key;
  return jsonb_build_object('id',c.id,'title',case p_locale when'en'then c.title_en else c.title_ko end,'caption',case p_locale when'en'then c.caption_en else c.caption_ko end,'imageUrl',c.image_url,'member',case p_locale when'en'then v_member->>'nameEn'else v_member->>'nameKo'end);
end$$;

create function public.upsert_admin_mobile_commemorative_card(p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_card_id uuid,p_expected_revision integer,p_source_event_id uuid,p_slug text,p_policy_version text,p_state text,p_opens_at timestamptz,p_closes_at timestamptz,p_title_ko text,p_title_en text,p_subtitle_ko text,p_subtitle_en text,p_caption_ko text,p_caption_en text,p_selection_label_ko text,p_selection_label_en text,p_image_url text,p_member_options jsonb,p_share_allowed boolean,p_reason text,p_correlation_id uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare c public.mobile_commemorative_cards%rowtype;v_count integer;
begin
  perform public.assert_active_admin(p_actor_app_user_id,p_actor_admin_allowlist_id,true);
  v_count:=jsonb_array_length(coalesce(p_member_options,'[]'));
  if length(btrim(coalesce(p_reason,'')))not between 10 and 500 or p_correlation_id is null or v_count not between 1 and 20 or exists(select 1 from jsonb_array_elements(p_member_options)x where coalesce(x->>'key','')!~'^[a-z0-9]+(-[a-z0-9]+)*$'or length(btrim(coalesce(x->>'nameKo','')))not between 1 and 100 or length(btrim(coalesce(x->>'nameEn','')))not between 1 and 100)or not exists(select 1 from public.mobile_participation_events where id=p_source_event_id)then raise exception'MOBILE_PARTICIPATION_INVALID';end if;
  if p_card_id is null then insert into public.mobile_commemorative_cards(source_event_id,slug,policy_version,state,opens_at,closes_at,title_ko,title_en,subtitle_ko,subtitle_en,caption_ko,caption_en,selection_label_ko,selection_label_en,image_url,member_options,share_allowed)values(p_source_event_id,p_slug,p_policy_version,p_state,p_opens_at,p_closes_at,p_title_ko,p_title_en,p_subtitle_ko,p_subtitle_en,p_caption_ko,p_caption_en,p_selection_label_ko,p_selection_label_en,p_image_url,p_member_options,p_share_allowed)returning*into c;
  else update public.mobile_commemorative_cards set source_event_id=p_source_event_id,slug=p_slug,policy_version=p_policy_version,state=p_state,opens_at=p_opens_at,closes_at=p_closes_at,title_ko=p_title_ko,title_en=p_title_en,subtitle_ko=p_subtitle_ko,subtitle_en=p_subtitle_en,caption_ko=p_caption_ko,caption_en=p_caption_en,selection_label_ko=p_selection_label_ko,selection_label_en=p_selection_label_en,image_url=p_image_url,member_options=p_member_options,share_allowed=p_share_allowed,revision=revision+1,updated_at=pg_catalog.clock_timestamp()where id=p_card_id and revision=p_expected_revision and not exists(select 1 from public.mobile_commemorative_card_claims where card_id=p_card_id)returning*into c;if not found then raise exception'MOBILE_PARTICIPATION_CONFLICT';end if;end if;
  insert into public.mobile_participation_admin_audits(actor_app_user_id,actor_admin_allowlist_id,action,target_type,target_id,correlation_id,reason,detail)values(p_actor_app_user_id,p_actor_admin_allowlist_id,'commemorative_card_upserted','commemorative_card',c.id,p_correlation_id,btrim(p_reason),jsonb_build_object('revision',c.revision,'state',c.state));
  return jsonb_build_object('id',c.id,'revision',c.revision,'state',c.state,'policyVersion',c.policy_version);
end$$;

create or replace function public.read_owned_mobile_participation_event_v2(p_app_user_id uuid,p_event_id uuid,p_locale public.content_locale)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare e public.mobile_participation_events%rowtype;r jsonb;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  select*into e from public.mobile_participation_events where id=p_event_id and state in('published','ended');
  if not found then return null;end if;
  select jsonb_build_object(
    'serverNow',pg_catalog.clock_timestamp(),
    'event',public.mobile_participation_event_json_v2(p_app_user_id,e.id,p_locale)||jsonb_build_object('commemorativeCardId',(
      select c.id from public.mobile_commemorative_cards c where c.source_event_id=e.id and c.state='published'and pg_catalog.clock_timestamp()>=c.opens_at and pg_catalog.clock_timestamp()<c.closes_at limit 1
    )),
    'contexts',coalesce((select jsonb_agg(jsonb_build_object(
      'id',c.id,'type',c.context_type,'slug',c.slug,'policyVersion',c.policy_version,'state',c.state,
      'access',public.mobile_participation_context_access(p_app_user_id,c.id,false),
      'writeAllowed',public.mobile_participation_context_access(p_app_user_id,c.id,true),
      'votePolicyId',(select v.id from public.mobile_participation_votes v where v.context_id=c.id and v.state='published'and pg_catalog.clock_timestamp()>=v.opens_at and pg_catalog.clock_timestamp()<v.closes_at order by v.opens_at desc,v.id limit 1),
      'activityPolicyId',(select a.id from public.mobile_participation_activity_policies a where a.context_id=c.id and a.state='published'and pg_catalog.clock_timestamp()>=a.opens_at and pg_catalog.clock_timestamp()<a.closes_at order by a.opens_at desc,a.id limit 1)
    )order by c.context_type,c.id)from public.mobile_participation_contexts c where c.source_event_id=e.id and c.state<>'draft'),'[]'::jsonb)
  )into r;return r;
end$$;

revoke all on function public.read_owned_mobile_commemorative_card(uuid,uuid,public.content_locale),public.claim_owned_mobile_commemorative_card(uuid,uuid,text,uuid,text,public.content_locale),public.read_owned_mobile_commemorative_card_share(uuid,uuid,public.content_locale),public.upsert_admin_mobile_commemorative_card(uuid,uuid,uuid,integer,uuid,text,text,text,timestamptz,timestamptz,text,text,text,text,text,text,text,text,text,jsonb,boolean,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_owned_mobile_commemorative_card(uuid,uuid,public.content_locale),public.claim_owned_mobile_commemorative_card(uuid,uuid,text,uuid,text,public.content_locale),public.read_owned_mobile_commemorative_card_share(uuid,uuid,public.content_locale),public.upsert_admin_mobile_commemorative_card(uuid,uuid,uuid,integer,uuid,text,text,text,timestamptz,timestamptz,text,text,text,text,text,text,text,text,text,jsonb,boolean,text,uuid) to service_role;
commit;
