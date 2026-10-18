begin;

-- Operators can attach a real, currently public fan post to each invitation
-- milestone. Versions are append-only so an issued milestone keeps an audit trail.
create table public.community_stamp_invitation_content_configs (
  invitation_policy_version integer not null
    references public.community_stamp_invitation_policy_versions(version) on delete restrict,
  threshold integer not null check(threshold>0),
  config_version integer not null check(config_version>0),
  fan_post_id uuid not null references public.fan_posts(id) on delete restrict,
  effective_at timestamptz not null,
  actor_app_user_id uuid not null references public.app_users(id) on delete restrict,
  actor_admin_allowlist_id uuid not null references public.admin_allowlist(id) on delete restrict,
  reason text not null check(length(pg_catalog.btrim(reason)) between 10 and 500),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key(invitation_policy_version,threshold,config_version),
  unique(invitation_policy_version,threshold,effective_at)
);

alter table public.community_stamp_invitation_content_configs enable row level security;
alter table public.community_stamp_invitation_content_configs force row level security;
revoke all on table public.community_stamp_invitation_content_configs
  from public,anon,authenticated,service_role;

create trigger community_stamp_invitation_content_configs_immutable
before update or delete on public.community_stamp_invitation_content_configs
for each statement execute function public.reject_community_stamp_invitation_policy_mutation();
create trigger community_stamp_invitation_content_configs_reject_truncate
before truncate on public.community_stamp_invitation_content_configs
for each statement execute function public.reject_community_stamp_invitation_policy_mutation();

create function public.require_community_stamp_invitation_admin(
  p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_mutation boolean default false
) returns public.admin_allowlist language plpgsql security definer set search_path='' as $$
declare actor public.admin_allowlist%rowtype;
begin
  if not exists(select 1 from public.app_users u
      where u.id=p_actor_app_user_id and u.status='active') then
    raise exception 'COMMUNITY_STAMP_FORBIDDEN' using errcode='42501';
  end if;
  select * into actor from public.admin_allowlist a
  where a.id=p_actor_admin_allowlist_id and a.active
    and (not p_mutation or a.role in('admin','operator')) for share;
  if not found then raise exception 'COMMUNITY_STAMP_FORBIDDEN' using errcode='42501'; end if;
  return actor;
end $$;

create function public.community_stamp_invitation_post_preview(p_post_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'postId',post.id,
    'linkUrl','/c/'||celebrity.slug||'/community/'||post.id::text,
    'imageUrl',media.image_url,
    'title',case when pg_catalog.length(pg_catalog.btrim(post.body))>0
      then pg_catalog.left(pg_catalog.regexp_replace(pg_catalog.btrim(post.body),'[[:space:]]+',' ','g'),120)
      else celebrity.slug||' fan post' end,
    'createdAt',post.created_at
  )
  from public.fan_posts post
  join public.app_users author on author.id=post.app_user_id and author.status='active'
  join public.celebrities celebrity on celebrity.id=post.celebrity_id
    and celebrity.status='published' and celebrity.archived_at is null
  join lateral(
    select source.image_url from(
      select '/api/content-assets/'||asset.id::text image_url,asset.position,0 source_order
      from public.content_assets asset
      where asset.post_id=post.id and asset.uploaded_at is not null
        and asset.deleted_at is null and asset.cleanup_requested_at is null
        and asset.storage_deleted_at is null
      union all
      select '/api/media/'||asset.id::text||'?variant=thumbnail',0,1
      from public.mobile_media_assets asset
      where asset.attached_type='fan_post' and asset.attached_id=post.id
        and asset.kind='image' and asset.state='ready' and asset.storage_deleted_at is null
    ) source order by source.source_order,source.position,source.image_url limit 1
  ) media on true
  where post.id=p_post_id and post.visibility='public'
    and post.deleted_at is null and post.hidden_at is null
$$;

create function public.read_admin_community_stamp_invitation_content(
  p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  perform public.require_community_stamp_invitation_admin(
    p_actor_app_user_id,p_actor_admin_allowlist_id,false);
  select jsonb_build_object(
    'policyVersion',policy.version,
    'milestoneSize',policy.milestone_size,
    'mappings',coalesce((
      select jsonb_agg(jsonb_build_object(
        'threshold',latest.threshold,'configVersion',latest.config_version,
        'effectiveAt',latest.effective_at,'postId',latest.fan_post_id,
        'content',public.community_stamp_invitation_post_preview(latest.fan_post_id)
      ) order by latest.threshold)
      from(
        select distinct on(config.threshold) config.*
        from public.community_stamp_invitation_content_configs config
        where config.invitation_policy_version=policy.version
        order by config.threshold,config.effective_at desc,config.config_version desc
      ) latest
    ),'[]'::jsonb),
    'candidates',coalesce((
      select jsonb_agg(candidate.preview order by candidate.created_at desc,candidate.post_id desc)
      from(
        select post.id post_id,post.created_at,
          public.community_stamp_invitation_post_preview(post.id) preview
        from public.fan_posts post
        where post.visibility='public' and post.deleted_at is null and post.hidden_at is null
        order by post.created_at desc,post.id desc limit 100
      ) candidate where candidate.preview is not null
    ),'[]'::jsonb)
  ) into result
  from public.community_stamp_invitation_policy_versions policy
  where policy.effective_at<=pg_catalog.clock_timestamp()
  order by policy.effective_at desc,policy.version desc limit 1;
  if result is null then raise exception 'COMMUNITY_STAMP_UNAVAILABLE'; end if;
  return result;
end $$;

create function public.create_admin_community_stamp_invitation_content(
  p_actor_app_user_id uuid,p_actor_admin_allowlist_id uuid,p_threshold integer,
  p_fan_post_id uuid,p_effective_at timestamptz,p_reason text,p_correlation_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare policy public.community_stamp_invitation_policy_versions%rowtype;
  next_version integer; inserted public.community_stamp_invitation_content_configs%rowtype;
begin
  perform public.require_community_stamp_invitation_admin(
    p_actor_app_user_id,p_actor_admin_allowlist_id,true);
  select * into policy from public.community_stamp_invitation_policy_versions
  where effective_at<=pg_catalog.clock_timestamp()
  order by effective_at desc,version desc limit 1 for share;
  if not found or p_threshold<policy.milestone_size
      or p_threshold%policy.milestone_size<>0 or p_effective_at is null
      or p_correlation_id is null or pg_catalog.length(pg_catalog.btrim(coalesce(p_reason,''))) not between 10 and 500 then
    raise exception 'COMMUNITY_STAMP_INVALID_REQUEST' using errcode='22023';
  end if;
  if public.community_stamp_invitation_post_preview(p_fan_post_id) is null then
    raise exception 'COMMUNITY_STAMP_CONTENT_UNAVAILABLE' using errcode='23514';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'community-stamp:invitation-content:'||policy.version::text||':'||p_threshold::text,0));
  select coalesce(max(config_version),0)+1 into next_version
  from public.community_stamp_invitation_content_configs
  where invitation_policy_version=policy.version and threshold=p_threshold;
  insert into public.community_stamp_invitation_content_configs(
    invitation_policy_version,threshold,config_version,fan_post_id,effective_at,
    actor_app_user_id,actor_admin_allowlist_id,reason
  ) values(policy.version,p_threshold,next_version,p_fan_post_id,p_effective_at,
    p_actor_app_user_id,p_actor_admin_allowlist_id,pg_catalog.btrim(p_reason)) returning * into inserted;
  insert into public.audit_logs(actor_app_user_id,actor_admin_allowlist_id,action,
    entity_type,entity_id,before_after_summary,correlation_id)
  values(p_actor_app_user_id,p_actor_admin_allowlist_id,
    'community_stamp.invitation_content.created','community_stamp_invitation_content',
    policy.version::text||':'||p_threshold::text||':'||next_version::text,
    jsonb_build_object('threshold',p_threshold,'configVersion',next_version,
      'fanPostId',p_fan_post_id,'effectiveAt',p_effective_at,'reason',pg_catalog.btrim(p_reason)),
    p_correlation_id);
  return jsonb_build_object('policyVersion',policy.version,'threshold',p_threshold,
    'configVersion',next_version,'postId',p_fan_post_id,'effectiveAt',p_effective_at,
    'content',public.community_stamp_invitation_post_preview(p_fan_post_id));
end $$;

alter function public.get_mobile_social_stamp_collection(uuid)
  rename to get_mobile_social_stamp_collection_before_invitation_content;
revoke all on function public.get_mobile_social_stamp_collection_before_invitation_content(uuid)
  from public,anon,authenticated,service_role;

create function public.get_mobile_social_stamp_collection(p_app_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; invitation_content jsonb;
begin
  result:=public.get_mobile_social_stamp_collection_before_invitation_content(p_app_user_id);
  with current_policy as(
    select policy.version from public.community_stamp_invitation_policy_versions policy
    where policy.effective_at<=pg_catalog.clock_timestamp()
    order by policy.effective_at desc,policy.version desc limit 1
  ), latest as(
    select distinct on(config.threshold) config.*
    from public.community_stamp_invitation_content_configs config
    join public.community_stamp_invitation_policy_versions policy
      on policy.version=config.invitation_policy_version
    join current_policy on current_policy.version=config.invitation_policy_version
    where config.effective_at<=pg_catalog.clock_timestamp()
      and policy.effective_at<=pg_catalog.clock_timestamp()
    order by config.threshold,policy.effective_at desc,config.effective_at desc,config.config_version desc
  ), visible as(
    select latest.threshold,preview.content
    from latest
    join public.fan_posts post on post.id=latest.fan_post_id
    join lateral(select public.community_stamp_invitation_post_preview(post.id) content) preview on true
    where preview.content is not null
      and public.fan_web_content_visible(p_app_user_id,'fan_post',post.id)
      and not public.fan_web_blocked(p_app_user_id,post.app_user_id)
    order by latest.threshold limit 20
  )
  select coalesce(jsonb_agg(content order by threshold),'[]'::jsonb)
    into invitation_content from visible;
  return jsonb_set(result,'{invitation,content}',invitation_content);
end $$;

revoke all on function public.require_community_stamp_invitation_admin(uuid,uuid,boolean),
  public.community_stamp_invitation_post_preview(uuid),
  public.read_admin_community_stamp_invitation_content(uuid,uuid),
  public.create_admin_community_stamp_invitation_content(uuid,uuid,integer,uuid,timestamptz,text,uuid),
  public.get_mobile_social_stamp_collection(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.read_admin_community_stamp_invitation_content(uuid,uuid),
  public.create_admin_community_stamp_invitation_content(uuid,uuid,integer,uuid,timestamptz,text,uuid),
  public.get_mobile_social_stamp_collection(uuid)
  to service_role;

commit;
