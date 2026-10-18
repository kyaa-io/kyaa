begin;

alter table public.mobile_participation_events
  add column hero_url text,
  add column venue_name_ko text not null default '',
  add column venue_name_en text not null default '',
  add column address_ko text not null default '',
  add column address_en text not null default '',
  add column directions_url text,
  add column featured_rank smallint,
  add constraint mobile_participation_events_hero_url_safe
    check(hero_url is null or hero_url~'^/[^/[:space:]][^[:space:]]*$' or hero_url~'^https://[^[:space:]]+$'),
  add constraint mobile_participation_events_directions_url_safe
    check(directions_url is null or directions_url~'^https://[^[:space:]]+$'),
  add constraint mobile_participation_events_featured_rank_valid
    check(featured_rank is null or featured_rank between 1 and 100);

create table public.mobile_participation_post_requests (
  app_user_id uuid not null references public.app_users(id) on delete restrict,
  request_key uuid not null,
  operation text not null check(operation in('create','update','delete')),
  post_id uuid not null references public.mobile_participation_posts(id) on delete restrict,
  payload_hash text not null check(payload_hash~'^[a-f0-9]{32}$'),
  result jsonb not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key(app_user_id,request_key)
);
alter table public.mobile_participation_post_requests enable row level security;
alter table public.mobile_participation_post_requests force row level security;
revoke all on public.mobile_participation_post_requests from public,anon,authenticated,service_role;

insert into public.mobile_participation_post_requests(
  app_user_id,request_key,operation,post_id,payload_hash,result,created_at
)
select p.app_user_id,p.request_key,'create',p.id,p.payload_hash,
  jsonb_build_object(
    'id',p.id,
    'revision',p.revision,
    'removed',p.status<>'valid',
    'replayed',true
  ),p.created_at
from public.mobile_participation_posts p
on conflict(app_user_id,request_key)do nothing;

create function public.mobile_participation_event_json_v2(
  p_app_user_id uuid,
  p_event_id uuid,
  p_locale public.content_locale
) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'id',e.id,
    'slug',e.slug,
    'kind',e.event_kind,
    'policyVersion',e.policy_version,
    'state',e.state,
    'title',case p_locale when'en'then e.title_en else e.title_ko end,
    'summary',case p_locale when'en'then e.summary_en else e.summary_ko end,
    'startsAt',e.starts_at,
    'endsAt',e.ends_at,
    'updatedAt',e.updated_at,
    'heroUrl',e.hero_url,
    'venueName',nullif(case p_locale when'en'then e.venue_name_en else e.venue_name_ko end,''),
    'address',nullif(case p_locale when'en'then e.address_en else e.address_ko end,''),
    'directionsUrl',e.directions_url,
    'applicationUrl',e.application_url,
    'featuredRank',e.featured_rank,
    'checkin',(
      select jsonb_build_object(
        'id',x.id,
        'status',x.status,
        'confirmedAt',x.confirmed_at
      )
      from public.mobile_participation_checkins x
      where x.event_id=e.id and x.app_user_id=p_app_user_id
    )
  )
  from public.mobile_participation_events e
  where e.id=p_event_id and e.state in('published','ended')
$$;

create function public.read_owned_mobile_participation_events_v2(
  p_app_user_id uuid,
  p_locale public.content_locale,
  p_after timestamptz,
  p_after_id uuid,
  p_limit integer
) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r jsonb;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  with rows as(
    select e.*
    from public.mobile_participation_events e
    where e.state in('published','ended')
      and(p_after is null or(e.starts_at,e.id)>(p_after,p_after_id))
    order by e.starts_at,e.id
    limit least(greatest(p_limit,1),50)+1
  ),page as(
    select*from rows
    order by starts_at,id
    limit least(greatest(p_limit,1),50)
  )
  select jsonb_build_object(
    'serverNow',pg_catalog.clock_timestamp(),
    'configured',exists(
      select 1 from public.mobile_participation_events where state in('published','ended')
    ),
    'items',coalesce((
      select jsonb_agg(
        public.mobile_participation_event_json_v2(p_app_user_id,page.id,p_locale)
        order by page.starts_at,page.id
      ) from page
    ),'[]'::jsonb),
    'hasMore',(select count(*)>least(greatest(p_limit,1),50)from rows)
  ) into r;
  return r;
end
$$;

create function public.read_owned_mobile_participation_event_v2(
  p_app_user_id uuid,
  p_event_id uuid,
  p_locale public.content_locale
) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare e public.mobile_participation_events%rowtype;r jsonb;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  select*into e from public.mobile_participation_events
  where id=p_event_id and state in('published','ended');
  if not found then return null;end if;
  select jsonb_build_object(
    'serverNow',pg_catalog.clock_timestamp(),
    'event',public.mobile_participation_event_json_v2(p_app_user_id,e.id,p_locale),
    'contexts',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',c.id,
        'type',c.context_type,
        'slug',c.slug,
        'policyVersion',c.policy_version,
        'state',c.state,
        'access',public.mobile_participation_context_access(p_app_user_id,c.id,false),
        'writeAllowed',public.mobile_participation_context_access(p_app_user_id,c.id,true),
        'votePolicyId',(
          select v.id from public.mobile_participation_votes v
          where v.context_id=c.id and v.state='published'
            and pg_catalog.clock_timestamp()>=v.opens_at
            and pg_catalog.clock_timestamp()<v.closes_at
          order by v.opens_at desc,v.id limit 1
        ),
        'activityPolicyId',(
          select a.id from public.mobile_participation_activity_policies a
          where a.context_id=c.id and a.state='published'
            and pg_catalog.clock_timestamp()>=a.opens_at
            and pg_catalog.clock_timestamp()<a.closes_at
          order by a.opens_at desc,a.id limit 1
        )
      )order by c.context_type,c.id)
      from public.mobile_participation_contexts c
      where c.source_event_id=e.id and c.state<>'draft'
    ),'[]'::jsonb)
  )into r;
  return r;
end
$$;

create function public.read_owned_mobile_participation_context_v2(
  p_app_user_id uuid,
  p_context_type text,
  p_context_id uuid,
  p_locale public.content_locale,
  p_after timestamptz,
  p_after_id uuid,
  p_limit integer
) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  c public.mobile_participation_contexts%rowtype;
  e public.mobile_participation_events%rowtype;
  r jsonb;
  allowed boolean;
  write_allowed boolean;
  access_reason text;
  my_count integer;
  total_count integer;
  photo_count integer;
  video_count integer;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  select*into c from public.mobile_participation_contexts
  where id=p_context_id and context_type=p_context_type and state='published';
  if not found then return null;end if;
  if c.source_event_id is not null then
    select*into e from public.mobile_participation_events
    where id=c.source_event_id and state in('published','ended');
  end if;
  allowed:=public.mobile_participation_context_access(p_app_user_id,c.id,false);
  write_allowed:=public.mobile_participation_context_access(p_app_user_id,c.id,true);
  select count(*) into my_count from public.mobile_participation_posts p
  where p.context_id=c.id and p.app_user_id=p_app_user_id and p.status='valid';
  if c.context_type='album' and c.album_kind='concert' and not allowed then
    access_reason:=case when write_allowed then'POST_REQUIRED'else'CHECKIN_REQUIRED'end;
  elsif not allowed then access_reason:='CHECKIN_REQUIRED';
  end if;
  if allowed then
    select count(*) into total_count from public.mobile_participation_posts p
    where p.context_id=c.id and p.status='valid';
    select count(*) filter(where a.kind='image'),count(*) filter(where a.kind='video')
      into photo_count,video_count
    from public.mobile_participation_post_media m
    join public.mobile_participation_posts p on p.id=m.post_id and p.status='valid'
    join public.mobile_media_assets a on a.id=m.asset_id and a.state='ready'
    where p.context_id=c.id;
  else
    total_count:=0;photo_count:=0;video_count:=0;
  end if;
  if not allowed then
    return jsonb_build_object(
      'serverNow',pg_catalog.clock_timestamp(),
      'pollAfterMs',2000,
      'access',jsonb_build_object(
        'allowed',false,'reason',access_reason,'writeAllowed',write_allowed
      ),
      'context',jsonb_build_object(
        'id',c.id,'type',c.context_type,'policyVersion',c.policy_version,
        'opensAt',c.opens_at,'closesAt',c.closes_at,'albumKind',c.album_kind,
        'title',case p_locale when'en'then e.title_en else e.title_ko end
      ),
      'event',case when e.id is null then null else jsonb_build_object(
        'id',e.id,'title',case p_locale when'en'then e.title_en else e.title_ko end,
        'startsAt',e.starts_at,'heroUrl',e.hero_url
      )end,
      'myPostCount',my_count,'totalPostCount',total_count,
      'photoCount',photo_count,'videoCount',video_count,
      'items','[]'::jsonb,'hasMore',false
    );
  end if;
  with rows as(
    select p.* from public.mobile_participation_posts p
    where p.context_id=c.id and p.status='valid'
      and not public.fan_web_blocked(p_app_user_id,p.app_user_id)
      and(p_after is null or(p.updated_at,p.id)<(p_after,p_after_id))
    order by p.updated_at desc,p.id desc
    limit least(greatest(p_limit,1),50)+1
  ),page as(
    select*from rows order by updated_at desc,id desc
    limit least(greatest(p_limit,1),50)
  )
  select jsonb_build_object(
    'serverNow',pg_catalog.clock_timestamp(),
    'pollAfterMs',2000,
    'access',jsonb_build_object(
      'allowed',true,'reason',null,'writeAllowed',write_allowed
    ),
    'context',jsonb_build_object(
      'id',c.id,'type',c.context_type,'policyVersion',c.policy_version,
      'opensAt',c.opens_at,'closesAt',c.closes_at,'albumKind',c.album_kind,
      'title',case p_locale when'en'then e.title_en else e.title_ko end
    ),
    'event',case when e.id is null then null else jsonb_build_object(
      'id',e.id,'title',case p_locale when'en'then e.title_en else e.title_ko end,
      'startsAt',e.starts_at,'heroUrl',e.hero_url
    )end,
    'myPostCount',my_count,'totalPostCount',total_count,
    'photoCount',photo_count,'videoCount',video_count,
    'items',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',p.id,
        'kind',p.kind,
        'body',p.body,
        'revision',p.revision,
        'author',(
          select jsonb_build_object(
            'nickname',coalesce(nullif(btrim(profile.nickname),''),'Fan'),
            'avatarUrl',public.public_fan_avatar_url(u.id)
          )
          from public.app_users u
          left join public.user_profiles profile on profile.app_user_id=u.id
          where u.id=p.app_user_id and u.status='active'
        ),
        'isMine',p.app_user_id=p_app_user_id,
        'createdAt',p.created_at,
        'updatedAt',p.updated_at,
        'assetIds',coalesce((
          select jsonb_agg(m.asset_id order by m.position)
          from public.mobile_participation_post_media m where m.post_id=p.id
        ),'[]'::jsonb),
        'assets',coalesce((
          select jsonb_agg(jsonb_build_object(
            'id',a.id,'kind',a.kind,'width',a.width,'height',a.height,
            'durationSeconds',a.duration_seconds
          )order by m.position)
          from public.mobile_participation_post_media m
          join public.mobile_media_assets a on a.id=m.asset_id
          where m.post_id=p.id and a.state='ready'
        ),'[]'::jsonb),
        'reactions',coalesce((
          select jsonb_object_agg(x.emoji,x.n)from(
            select emoji,count(*)n from public.mobile_participation_reactions
            where target_type='post'and target_id=p.id group by emoji
          )x
        ),'{}'::jsonb),
        'myReaction',(
          select emoji from public.mobile_participation_reactions
          where target_type='post'and target_id=p.id and app_user_id=p_app_user_id
        ),
        'comments',coalesce((
          select jsonb_agg(jsonb_build_object(
            'id',z.id,'body',z.body,'revision',z.revision,
            'author',(
              select jsonb_build_object(
                'nickname',coalesce(nullif(btrim(profile.nickname),''),'Fan'),
                'avatarUrl',public.public_fan_avatar_url(u.id)
              )
              from public.app_users u
              left join public.user_profiles profile on profile.app_user_id=u.id
              where u.id=z.app_user_id and u.status='active'
            ),
            'isMine',z.app_user_id=p_app_user_id,
            'createdAt',z.created_at,'updatedAt',z.updated_at,
            'reactions',coalesce((
              select jsonb_object_agg(y.emoji,y.n)from(
                select emoji,count(*)n from public.mobile_participation_reactions
                where target_type='comment'and target_id=z.id group by emoji
              )y
            ),'{}'::jsonb),
            'myReaction',(
              select emoji from public.mobile_participation_reactions
              where target_type='comment'and target_id=z.id and app_user_id=p_app_user_id
            )
          )order by z.created_at,z.id)
          from public.mobile_participation_comments z
          where z.post_id=p.id and z.status='valid'
            and not public.fan_web_blocked(p_app_user_id,z.app_user_id)
        ),'[]'::jsonb)
      )order by p.updated_at desc,p.id desc)from page p
    ),'[]'::jsonb),
    'hasMore',(select count(*)>least(greatest(p_limit,1),50)from rows)
  )into r;
  return r;
end
$$;

create function public.save_owned_mobile_participation_post_v2(
  p_app_user_id uuid,
  p_context_type text,
  p_context_id uuid,
  p_post_id uuid,
  p_kind text,
  p_body text,
  p_asset_ids uuid[],
  p_expected_revision integer,
  p_request_key uuid
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  p public.mobile_participation_posts%rowtype;
  q public.mobile_participation_post_requests%rowtype;
  ids uuid[]:=coalesce(p_asset_ids,'{}');
  h text;
  valid_count integer;
  new_id uuid:=coalesce(p_post_id,extensions.gen_random_uuid());
  response jsonb;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  h:=case when p_post_id is null then
    md5(jsonb_build_array(p_context_type,p_context_id,p_kind,btrim(coalesce(p_body,'')),ids)::text)
  else
    md5(jsonb_build_array('update',p_context_type,p_context_id,p_post_id,p_kind,p_expected_revision,btrim(coalesce(p_body,'')),ids)::text)
  end;
  select*into q from public.mobile_participation_post_requests
  where app_user_id=p_app_user_id and request_key=p_request_key;
  if found then
    if q.payload_hash<>h then raise exception'MOBILE_PARTICIPATION_CONFLICT';end if;
    return q.result||jsonb_build_object('replayed',true);
  end if;
  if p_kind not in('post','photo','video','question','memory')
    or length(btrim(coalesce(p_body,'')))>5000
    or cardinality(ids)>4
    or cardinality(ids)<>(select count(distinct x)from unnest(ids)x)
    or(btrim(coalesce(p_body,''))=''and cardinality(ids)=0)
    or not public.mobile_participation_context_access(p_app_user_id,p_context_id,true)
    or not exists(
      select 1 from public.mobile_participation_contexts
      where id=p_context_id and context_type=p_context_type
    )then raise exception'MOBILE_PARTICIPATION_FORBIDDEN';end if;
  perform 1 from public.mobile_media_assets where id=any(ids)order by id for update;
  select count(*)into valid_count from public.mobile_media_assets
  where id=any(ids)and app_user_id=p_app_user_id and purpose='participation'
    and state='ready'and storage_deleted_at is null
    and(attached_id is null or(attached_type='participation_post'and attached_id=new_id));
  if valid_count<>cardinality(ids)
    or(p_kind='photo'and exists(
      select 1 from public.mobile_media_assets where id=any(ids)and kind<>'image'
    ))
    or(p_kind='video'and exists(
      select 1 from public.mobile_media_assets where id=any(ids)and kind<>'video'
    ))then raise exception'MEDIA_INVALID_ASSET';end if;
  if p_post_id is null then
    insert into public.mobile_participation_posts(
      id,context_id,app_user_id,kind,body,request_key,payload_hash
    )values(
      new_id,p_context_id,p_app_user_id,p_kind,btrim(coalesce(p_body,'')),p_request_key,h
    )returning*into p;
  else
    select*into p from public.mobile_participation_posts
    where id=p_post_id and app_user_id=p_app_user_id
      and context_id=p_context_id and status='valid'for update;
    if not found then raise exception'MOBILE_PARTICIPATION_NOT_FOUND';end if;
    if p.revision<>p_expected_revision then raise exception'MOBILE_PARTICIPATION_CONFLICT';end if;
    update public.mobile_media_assets set
      state='cancelled',asset_version=asset_version+1,
      cleanup_requested_at=pg_catalog.clock_timestamp(),
      cleanup_retry_at=greatest(
        pg_catalog.clock_timestamp(),coalesce(storage_token_expires_at,upload_expires_at)+interval'5 minutes'
      ),updated_at=pg_catalog.clock_timestamp()
    where attached_type='participation_post'and attached_id=p.id
      and not(id=any(ids))and storage_deleted_at is null;
    update public.mobile_participation_posts set
      kind=p_kind,body=btrim(coalesce(p_body,'')),revision=revision+1,
      updated_at=pg_catalog.clock_timestamp()
    where id=p.id returning*into p;
    delete from public.mobile_participation_post_media where post_id=p.id;
  end if;
  insert into public.mobile_participation_post_media(post_id,asset_id,position)
  select p.id,x.id,(x.ord-1)::smallint from unnest(ids)with ordinality x(id,ord);
  update public.mobile_media_assets a set
    attached_type='participation_post',attached_id=p.id,
    attached_version=p.revision,position=(x.ord-1)::smallint,
    access_scope='participation',updated_at=pg_catalog.clock_timestamp()
  from unnest(ids)with ordinality x(id,ord)where a.id=x.id;
  response:=jsonb_build_object(
    'id',p.id,'revision',p.revision,'removed',false,'replayed',false
  );
  insert into public.mobile_participation_post_requests(
    app_user_id,request_key,operation,post_id,payload_hash,result
  )values(
    p_app_user_id,p_request_key,case when p_post_id is null then'create'else'update'end,
    p.id,h,response
  );
  return response;
end
$$;

create function public.remove_owned_mobile_participation_post_v2(
  p_app_user_id uuid,
  p_post_id uuid,
  p_expected_revision integer,
  p_request_key uuid
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  p public.mobile_participation_posts%rowtype;
  q public.mobile_participation_post_requests%rowtype;
  h text:=md5(jsonb_build_array('delete',p_post_id,p_expected_revision)::text);
  response jsonb;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  select*into q from public.mobile_participation_post_requests
  where app_user_id=p_app_user_id and request_key=p_request_key;
  if found then
    if q.payload_hash<>h then raise exception'MOBILE_PARTICIPATION_CONFLICT';end if;
    return q.result||jsonb_build_object('replayed',true);
  end if;
  select*into p from public.mobile_participation_posts
  where id=p_post_id and app_user_id=p_app_user_id and status='valid'for update;
  if not found then raise exception'MOBILE_PARTICIPATION_NOT_FOUND';end if;
  if p.revision<>p_expected_revision then raise exception'MOBILE_PARTICIPATION_CONFLICT';end if;
  update public.mobile_participation_posts set
    status='deleted',revision=revision+1,updated_at=pg_catalog.clock_timestamp()
  where id=p.id returning*into p;
  update public.mobile_media_assets set
    state='cancelled',asset_version=asset_version+1,
    cleanup_requested_at=pg_catalog.clock_timestamp(),
    cleanup_retry_at=greatest(
      pg_catalog.clock_timestamp(),coalesce(storage_token_expires_at,upload_expires_at)+interval'5 minutes'
    ),updated_at=pg_catalog.clock_timestamp()
  where attached_type='participation_post'and attached_id=p.id and storage_deleted_at is null;
  response:=jsonb_build_object(
    'id',p.id,'revision',p.revision,'removed',true,'replayed',false
  );
  insert into public.mobile_participation_post_requests(
    app_user_id,request_key,operation,post_id,payload_hash,result
  )values(p_app_user_id,p_request_key,'delete',p.id,h,response);
  return response;
end
$$;

create function public.read_owned_mobile_participation_post_request(
  p_app_user_id uuid,
  p_request_key uuid
) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare q public.mobile_participation_post_requests%rowtype;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  select*into q from public.mobile_participation_post_requests
  where app_user_id=p_app_user_id and request_key=p_request_key;
  if not found then return null;end if;
  return q.result||jsonb_build_object('operation',q.operation);
end
$$;

create function public.upsert_admin_mobile_participation_event_v2(
  p_actor_app_user_id uuid,
  p_actor_admin_allowlist_id uuid,
  p_event_id uuid,
  p_expected_revision integer,
  p_slug text,
  p_celebrity_id uuid,
  p_event_kind text,
  p_policy_version text,
  p_state text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_title_ko text,
  p_title_en text,
  p_summary_ko text,
  p_summary_en text,
  p_application_url text,
  p_hero_url text,
  p_venue_name_ko text,
  p_venue_name_en text,
  p_address_ko text,
  p_address_en text,
  p_directions_url text,
  p_featured_rank smallint,
  p_reason text,
  p_correlation_id uuid
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.mobile_participation_events%rowtype;
begin
  perform public.assert_active_admin(
    p_actor_app_user_id,p_actor_admin_allowlist_id,true
  );
  if length(btrim(coalesce(p_reason,'')))not between 10 and 500
    or p_starts_at>=p_ends_at
  then raise exception'MOBILE_PARTICIPATION_INVALID';end if;
  if p_event_id is null then
    insert into public.mobile_participation_events(
      slug,celebrity_id,event_kind,policy_version,state,starts_at,ends_at,
      title_ko,title_en,summary_ko,summary_en,application_url,hero_url,
      venue_name_ko,venue_name_en,address_ko,address_en,directions_url,featured_rank
    )values(
      p_slug,p_celebrity_id,p_event_kind,p_policy_version,p_state,p_starts_at,p_ends_at,
      p_title_ko,p_title_en,coalesce(p_summary_ko,''),coalesce(p_summary_en,''),
      p_application_url,p_hero_url,coalesce(p_venue_name_ko,''),coalesce(p_venue_name_en,''),
      coalesce(p_address_ko,''),coalesce(p_address_en,''),p_directions_url,p_featured_rank
    )returning*into e;
  else
    update public.mobile_participation_events set
      slug=p_slug,celebrity_id=p_celebrity_id,event_kind=p_event_kind,
      policy_version=p_policy_version,state=p_state,starts_at=p_starts_at,ends_at=p_ends_at,
      title_ko=p_title_ko,title_en=p_title_en,summary_ko=coalesce(p_summary_ko,''),
      summary_en=coalesce(p_summary_en,''),application_url=p_application_url,
      hero_url=p_hero_url,venue_name_ko=coalesce(p_venue_name_ko,''),
      venue_name_en=coalesce(p_venue_name_en,''),address_ko=coalesce(p_address_ko,''),
      address_en=coalesce(p_address_en,''),directions_url=p_directions_url,
      featured_rank=p_featured_rank,revision=revision+1,updated_at=pg_catalog.clock_timestamp()
    where id=p_event_id and revision=p_expected_revision returning*into e;
    if not found then raise exception'MOBILE_PARTICIPATION_CONFLICT';end if;
  end if;
  insert into public.mobile_participation_admin_audits(
    actor_app_user_id,actor_admin_allowlist_id,action,target_type,target_id,
    correlation_id,reason,detail
  )values(
    p_actor_app_user_id,p_actor_admin_allowlist_id,'event_upserted','event',e.id,
    p_correlation_id,btrim(p_reason),jsonb_build_object(
      'revision',e.revision,'state',e.state,'featuredRank',e.featured_rank
    )
  );
  return jsonb_build_object(
    'id',e.id,'revision',e.revision,'state',e.state,'policyVersion',e.policy_version
  );
end
$$;

revoke all on function
  public.mobile_participation_event_json_v2(uuid,uuid,public.content_locale),
  public.read_owned_mobile_participation_events_v2(uuid,public.content_locale,timestamptz,uuid,integer),
  public.read_owned_mobile_participation_event_v2(uuid,uuid,public.content_locale),
  public.read_owned_mobile_participation_context_v2(uuid,text,uuid,public.content_locale,timestamptz,uuid,integer),
  public.save_owned_mobile_participation_post_v2(uuid,text,uuid,uuid,text,text,uuid[],integer,uuid),
  public.remove_owned_mobile_participation_post_v2(uuid,uuid,integer,uuid),
  public.read_owned_mobile_participation_post_request(uuid,uuid),
  public.upsert_admin_mobile_participation_event_v2(uuid,uuid,uuid,integer,text,uuid,text,text,text,timestamptz,timestamptz,text,text,text,text,text,text,text,text,text,text,text,smallint,text,uuid)
from public,anon,authenticated,service_role;

grant execute on function
  public.read_owned_mobile_participation_events_v2(uuid,public.content_locale,timestamptz,uuid,integer),
  public.read_owned_mobile_participation_event_v2(uuid,uuid,public.content_locale),
  public.read_owned_mobile_participation_context_v2(uuid,text,uuid,public.content_locale,timestamptz,uuid,integer),
  public.save_owned_mobile_participation_post_v2(uuid,text,uuid,uuid,text,text,uuid[],integer,uuid),
  public.remove_owned_mobile_participation_post_v2(uuid,uuid,integer,uuid),
  public.read_owned_mobile_participation_post_request(uuid,uuid),
  public.upsert_admin_mobile_participation_event_v2(uuid,uuid,uuid,integer,text,uuid,text,text,text,timestamptz,timestamptz,text,text,text,text,text,text,text,text,text,text,text,smallint,text,uuid)
to service_role;

commit;
