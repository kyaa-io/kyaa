begin;

alter table public.mobile_participation_spaces add column interior_image_url text
  check(interior_image_url is null or length(interior_image_url)<=2048 and
    (interior_image_url ~ '^/[^/[:space:]][^[:space:]]*$' or public.fan_web_https_url(interior_image_url)));

alter function public.read_owned_mobile_participation_space(uuid,uuid,public.content_locale)
  rename to read_owned_mobile_participation_space_before_interior;
create function public.read_owned_mobile_participation_space(p_app_user_id uuid,p_space_id uuid,p_locale public.content_locale)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;image_url text;
begin
  result:=public.read_owned_mobile_participation_space_before_interior(p_app_user_id,p_space_id,p_locale);
  if result is null then return null;end if;
  select s.interior_image_url into image_url from public.mobile_participation_spaces s where s.id=p_space_id;
  return jsonb_set(result,'{space}',(result->'space')||jsonb_build_object('interiorImageUrl',image_url));
end$$;

create function public.upsert_admin_mobile_participation_space_v2(
  p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_space_id uuid,p_expected_revision integer,
  p_celebrity_id uuid,p_slug text,p_policy_version text,p_state text,p_opens_at timestamptz,p_closes_at timestamptz,
  p_benefit_id uuid,p_title_ko text,p_title_en text,p_summary_ko text,p_summary_en text,p_image_url text,
  p_address_ko text,p_address_en text,p_reason text,p_correlation_id uuid,p_interior_image_url text
)returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if p_interior_image_url is not null and(length(p_interior_image_url)>2048 or
    not(p_interior_image_url ~ '^/[^/[:space:]][^[:space:]]*$' or public.fan_web_https_url(p_interior_image_url)))
    then raise exception 'MOBILE_PARTICIPATION_INVALID';end if;
  result:=public.upsert_admin_mobile_participation_space(p_actor_app_user_id,p_actor_admin_allowlist_id,
    p_space_id,p_expected_revision,p_celebrity_id,p_slug,p_policy_version,p_state,p_opens_at,p_closes_at,
    p_benefit_id,p_title_ko,p_title_en,p_summary_ko,p_summary_en,p_image_url,p_address_ko,p_address_en,p_reason,p_correlation_id);
  update public.mobile_participation_spaces set interior_image_url=p_interior_image_url where id=(result->>'id')::uuid;
  return result||jsonb_build_object('interiorImageUrl',p_interior_image_url);
end$$;

alter function public.read_owned_mobile_participation_catalog(uuid,public.content_locale,text,text,text,timestamptz,uuid,text,integer)
  rename to read_owned_mobile_participation_catalog_before_media_summary;
create function public.read_owned_mobile_participation_catalog(
  p_app_user_id uuid,p_locale public.content_locale,p_phase text,p_kind text,p_celebrity_slug text,
  p_after timestamptz,p_after_id uuid,p_after_kind text,p_limit integer
)returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;items jsonb;
begin
  result:=public.read_owned_mobile_participation_catalog_before_media_summary(p_app_user_id,p_locale,p_phase,p_kind,p_celebrity_slug,p_after,p_after_id,p_after_kind,p_limit);
  if p_phase<>'past' then return result;end if;
  select coalesce(jsonb_agg(item.value||jsonb_build_object(
    'mediaSummary',case when context_access.allowed then jsonb_build_object(
      'postCount',counts.posts,'photoCount',counts.photos,'videoCount',counts.videos)else null end,
    'hasReplay',exists(select 1 from public.live_events l where item.value->>'kind'='live'
      and l.id=(item.value->>'id')::uuid and l.replay_published and l.replay_url is not null)
  )order by item.position),'[]'::jsonb)into items
  from jsonb_array_elements(result->'items')with ordinality item(value,position)
  cross join lateral(
    select coalesce(bool_or(public.mobile_participation_context_access(p_app_user_id,c.id,false)),false)allowed
    from public.mobile_participation_contexts c where c.state='published'and
      ((item.value->>'kind'='event'and c.source_event_id=(item.value->>'id')::uuid)
        or(item.value->>'kind'='live'and c.source_live_event_id=(item.value->>'id')::uuid))
  )context_access
  cross join lateral(
    select count(distinct p.id)posts,count(a.id)filter(where a.kind='image')photos,
      count(a.id)filter(where a.kind='video')videos
    from public.mobile_participation_contexts c
    join public.mobile_participation_posts p on p.context_id=c.id and p.status='valid'
    join public.app_users u on u.id=p.app_user_id and u.status='active'
    left join public.mobile_participation_post_media m on m.post_id=p.id
    left join public.mobile_media_assets a on a.id=m.asset_id and a.state='ready'and a.storage_deleted_at is null
      and a.access_scope='participation'and a.attached_type='participation_post'and a.attached_id=p.id
    where c.state='published'and public.mobile_participation_context_access(p_app_user_id,c.id,false)
      and not public.fan_web_blocked(p_app_user_id,p.app_user_id)and
      ((item.value->>'kind'='event'and c.source_event_id=(item.value->>'id')::uuid)
        or(item.value->>'kind'='live'and c.source_live_event_id=(item.value->>'id')::uuid))
  )counts;
  return jsonb_set(result,'{items}',items);
end$$;

-- Previously issued media addresses obey the same block boundary as the feed.
alter function public.authorize_mobile_media_read(uuid,uuid,text)rename to authorize_mobile_media_read_before_participation_visibility;
create function public.authorize_mobile_media_read(p_app_user_id uuid,p_asset_id uuid,p_variant text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  result:=public.authorize_mobile_media_read_before_participation_visibility(p_app_user_id,p_asset_id,p_variant);
  if result is null then return null;end if;
  if exists(select 1 from public.mobile_media_assets a where a.id=p_asset_id and a.access_scope='participation'
    and not exists(select 1 from public.mobile_participation_posts p join public.app_users u on u.id=p.app_user_id
      where p.id=a.attached_id and p.status='valid'and u.status='active'and not public.fan_web_blocked(p_app_user_id,p.app_user_id)))
    then return null;end if;
  return result;
end$$;

revoke all on function public.read_owned_mobile_participation_space_before_interior(uuid,uuid,public.content_locale),
  public.read_owned_mobile_participation_catalog_before_media_summary(uuid,public.content_locale,text,text,text,timestamptz,uuid,text,integer),
  public.authorize_mobile_media_read_before_participation_visibility(uuid,uuid,text)from public,anon,authenticated,service_role;
revoke all on function public.read_owned_mobile_participation_space(uuid,uuid,public.content_locale),
  public.upsert_admin_mobile_participation_space_v2(uuid,uuid,uuid,integer,uuid,text,text,text,timestamptz,timestamptz,uuid,text,text,text,text,text,text,text,text,uuid,text),
  public.read_owned_mobile_participation_catalog(uuid,public.content_locale,text,text,text,timestamptz,uuid,text,integer),
  public.authorize_mobile_media_read(uuid,uuid,text)from public,anon,authenticated,service_role;
grant execute on function public.read_owned_mobile_participation_space(uuid,uuid,public.content_locale),
  public.upsert_admin_mobile_participation_space_v2(uuid,uuid,uuid,integer,uuid,text,text,text,timestamptz,timestamptz,uuid,text,text,text,text,text,text,text,text,uuid,text),
  public.read_owned_mobile_participation_catalog(uuid,public.content_locale,text,text,text,timestamptz,uuid,text,integer),
  public.authorize_mobile_media_read(uuid,uuid,text)to service_role;

commit;
