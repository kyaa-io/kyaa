begin;
alter table public.home_gallery_curation
  add column home_selected boolean not null default false,
  add column home_hidden boolean not null default false,
  add column home_rank integer check (home_rank > 0),
  add column home_editor text;
alter table public.home_shortform
  add column home_selected boolean not null default false,
  add column home_hidden boolean not null default false,
  add column home_rank integer check (home_rank > 0),
  add column home_editor text,
  add column home_edited_at timestamptz;

-- The migration role owns the definer functions. FORCE RLS also applies to table owners.
create policy home_media_editor_insert on public.home_gallery_curation for insert to current_user with check (true);
create policy home_media_editor_update on public.home_gallery_curation for update to current_user using (true) with check (true);
create policy home_media_editor_short_update on public.home_shortform for update to current_user using (true) with check (true);

create function public.home_media_photo_candidates(p_locale public.content_locale,p_include_groups boolean)
returns table(at timestamptz,id text,item jsonb) language sql stable security definer set search_path='' as $$

        select n.display_published_at at, n.id::text || ':' || i.ord id, jsonb_build_object(
            'id', n.id::text || ':' || i.ord, 'source', 'official_sns',
            'image', jsonb_build_object('url', i.value->'attrs'->>'src', 'width', (i.value->'attrs'->>'width')::numeric::integer, 'height', (i.value->'attrs'->>'height')::numeric::integer),
            'alt', i.value->'attrs'->>'alt', 'creator', public.home_creator_json(n.celebrity_id, p_locale),
            'sourceHref', '/c/' || c.slug || '/notices/' || n.slug) item
          from public.celebrity_notices n
          join public.celebrities c on c.id = n.celebrity_id
          join public.celebrity_notice_localizations ko on ko.notice_id = n.id and ko.locale = 'ko'
          cross join lateral jsonb_path_query(ko.body_json, 'strict $.** ? (@.type == "image")') with ordinality i(value, ord)
          where n.publication_status = 'published' and n.archived_at is null and n.visibility = 'public'
            and public.home_gallery_creator_public(n.celebrity_id)
            and public.home_gallery_source_shape(n.id) is not null
            and (i.value->'attrs'->>'src' ~ '^https://[^/?#@[:space:][:cntrl:]]+/[^[:space:][:cntrl:]]*$'
              or public.home_gallery_public_content_asset(i.value->'attrs'->>'src'))
            and case when jsonb_typeof(i.value->'attrs'->'width') = 'number' and jsonb_typeof(i.value->'attrs'->'height') = 'number'
                     then (i.value->'attrs'->>'width')::numeric * 10 between (i.value->'attrs'->>'height')::numeric * 4 and (i.value->'attrs'->>'height')::numeric * 25
                     else false end
        union all
        select p.created_at, 'fan:' || p.id || ':' || a.id, jsonb_build_object(
          'id', 'fan:' || p.id || ':' || a.id, 'source', 'fan_post',
          'image', jsonb_build_object('url', '/api/content-assets/' || a.id, 'width', a.width, 'height', a.height),
          'alt', case when p_locale = 'ko' then '팬 게시물 사진' else 'Fan post photo' end,
          'creator', public.home_creator_json(c.id, p_locale),
          'sourceHref', '/c/' || c.slug || '/community/' || p.id)
        from public.content_assets a
        join public.fan_posts p on p.id = a.post_id
        join public.celebrities c on c.id = p.celebrity_id
        where p.visibility = 'public' and p.deleted_at is null and p.hidden_at is null
          and p.category <> 'proof' and c.slug <> 'kyaa-wave-fanpage'
          and public.home_gallery_creator_public(c.id)
          and a.mime_type = 'image/webp' and a.uploaded_at is not null
          and a.deleted_at is null and a.cleanup_requested_at is null and a.storage_deleted_at is null
          and public.home_gallery_public_content_asset('/api/content-assets/' || a.id)
          and not exists (select 1 from public.content_reports r where r.target_type = 'fan_post' and r.target_id = p.id)
        union all
        select p.created_at, 'group:' || p.id || ':' || a.id, jsonb_build_object(
          'id', 'group:' || p.id || ':' || a.id, 'source', 'group_post',
          'image', jsonb_build_object('url', '/api/groups/media/' || a.id || case when a.kind = 'video' then '?variant=thumbnail' else '' end, 'width', a.width, 'height', a.height),
          'alt', case when p_locale = 'ko' then '팬페이지 게시물 사진' else 'Fan page post photo' end,
          'creator', jsonb_build_object('slug', coalesce(c.slug, g.id::text), 'name', public.group_page_name(g.id, p_locale::text)),
          'sourceHref', '/pages/groups/' || g.id || '?tab=board&post=' || p.id)
        from public.mobile_media_assets a
        join public.group_posts p on p.id = a.attached_id and a.attached_type = 'group_post'
        join public.group_pages g on g.id = p.page_id
        left join public.celebrities c on c.id = g.celebrity_id
        where p_include_groups and g.kind = 'fan' and g.listed and g.status = 'published'
          and c.slug is distinct from 'kyaa-wave-fanpage'
          and p.category <> 'notice' and p.visibility = 'public' and p.removed_at is null
          and exists (select 1 from public.app_users u where u.id = p.author_id and u.status = 'active')
          and (a.kind = 'image' or (a.kind = 'video' and a.thumbnail_path is not null and public.authorize_group_media_read(null, a.id, 'thumbnail')->>'storagePath' is not null)) and a.width > 0 and a.height > 0 and a.state = 'ready'
          and a.cleanup_requested_at is null and a.storage_deleted_at is null
          and public.authorize_group_media_read(null, a.id, 'original') is not null
          and not exists (select 1 from public.group_reports r where r.target_type = 'post' and r.target_id = p.id)
      $$;
revoke all on function public.home_media_photo_candidates(public.content_locale,boolean) from public,anon,authenticated,service_role;
create or replace function public.read_home_gallery_mix(
  p_locale public.content_locale, p_include_groups boolean, p_limit integer default 12,
  p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_rows jsonb;
begin
  if p_locale is null or p_limit is null or p_limit not between 1 and 24 or p_offset is null or p_offset not between 0 and 10000 then
    raise exception 'invalid home gallery page' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('item', x.item || case when x.at <= statement_timestamp() and x.at > statement_timestamp() - interval '48 hours' then '{"isNew":true}'::jsonb else '{}'::jsonb end, 'rank', x.sort_rank, 'at', x.at, 'id', x.id) order by x.position), '[]'::jsonb) into v_rows from (
    select k.*, row_number() over (order by case when cut = 1 and source_pos <= case when fan then 3 else 10 end then 0 else 1 end, sort_rank, at desc, id) position from (
      select cuts.*, row_number() over (partition by fan, cut order by sort_rank, at desc, id) source_pos from (
      select eligible.*, row_number() over (partition by item->>'sourceHref' order by sort_rank, at desc, id) cut, item->>'source' <> 'official_sns' fan from (
      select u.at, u.id, u.item, coalesce(selection.home_rank,selection.rank,2147483647) sort_rank from public.home_media_photo_candidates(p_locale,p_include_groups) u join public.home_gallery_curation selection on selection.photo_id = u.id and selection.home_selected and not selection.hidden and not selection.home_hidden
      ) eligible
      ) cuts where cut = 1
    ) k
    order by position offset p_offset limit p_limit + 1) x;
  return jsonb_build_object(
    'items', coalesce((select jsonb_agg(e.value->'item' order by e.ordinality) from jsonb_array_elements(v_rows) with ordinality e where e.ordinality <= p_limit), '[]'::jsonb),
    'hasMore', jsonb_array_length(v_rows) > p_limit,
    'last', (select jsonb_build_object('rank', e.value->'rank', 'at', e.value->'at', 'id', e.value->'id')
               from jsonb_array_elements(v_rows) with ordinality e where e.ordinality = least(p_limit, jsonb_array_length(v_rows))));
end $$;
revoke all on function public.read_home_gallery_mix(public.content_locale,boolean,integer,integer) from public,anon,authenticated;
grant execute on function public.read_home_gallery_mix(public.content_locale,boolean,integer,integer) to service_role;
create function public.read_curated_home_shortform_page(p_locale public.content_locale, p_offset integer default 0, p_limit integer default 12)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if p_locale is null or p_offset is null or p_offset < 0 or p_limit is null or p_limit not between 1 and 12 then
    raise exception 'invalid home shorts page' using errcode = '22023';
  end if;
  return (select jsonb_build_object('items', coalesce(jsonb_agg(x.item order by x.home_rank nulls last, x.published_at desc, x.video_id) filter (where x.row_no <= p_limit), '[]'::jsonb), 'hasMore', count(*) > p_limit)
    from (select s.home_rank, s.published_at, s.video_id, row_number() over (order by s.home_rank nulls last, s.published_at desc, s.video_id) as row_no,
      jsonb_build_object('id', s.id, 'platform', s.platform, 'videoId', s.video_id, 'title', s.title,
        'creator', public.home_creator_json(s.celebrity_id, p_locale), 'href', s.href) as item
      from (select * from public.home_shortform where home_selected and not home_hidden and public.home_gallery_creator_public(celebrity_id) and unavailable_at is null and public.home_shortform_visible(source_notice_id)
        order by home_rank nulls last, published_at desc, video_id offset p_offset limit p_limit + 1) s) x);
end $$;
revoke all on function public.read_curated_home_shortform_page(public.content_locale,integer,integer) from public,anon,authenticated;
grant execute on function public.read_curated_home_shortform_page(public.content_locale,integer,integer) to service_role;
create function public.admin_home_media_candidates(p_kind text,p_groups boolean)
returns setof jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if p_kind='photo' then
    return query select p.item || jsonb_build_object('selected',coalesce(c.home_selected,false),'hidden',coalesce(c.home_hidden,false),
      'legacy',coalesce(c.rank>0 and not c.home_hidden,false),'rank',coalesce(c.home_rank,c.rank))
      from public.home_media_photo_candidates('ko',p_groups) p left join public.home_gallery_curation c on c.photo_id=p.id
      where not coalesce(c.hidden,false)
      order by coalesce(c.home_rank,c.rank) nulls last,p.at desc,p.id;
  else
    return query select jsonb_build_object('id',s.id,'title',s.title,'sourceHref',s.href,'thumbnail',public.read_public_video_thumbnails(array[s.href])->s.href,'platform',s.platform,'videoId',s.video_id,
      'creator',public.home_creator_json(s.celebrity_id,'ko'),'selected',s.home_selected,'hidden',s.home_hidden,
      'legacy',s.source_notice_id is null and s.collected_at is null and not s.home_hidden,'rank',s.home_rank)
      from public.home_shortform s where public.home_gallery_creator_public(s.celebrity_id)
        and s.unavailable_at is null and public.home_shortform_visible(s.source_notice_id)
      order by s.home_rank nulls last,s.published_at desc,s.id;
  end if;
end $$;
create function public.admin_edit_home_media(p_kind text,p_action text,p_ids text[],p_editor text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_kind not in ('photo','video') or p_action not in ('select','remove','hide','rank') or cardinality(p_ids) not between 1 and 1000 then
    raise exception 'invalid home media change';
  end if;
  if p_kind='photo' then
    insert into public.home_gallery_curation(photo_id,home_selected,home_hidden,home_rank,reason,home_editor)
    select id,p_action='select',p_action='hide',case when p_action='rank' then pos::integer end,'홈 편성',p_editor
    from unnest(p_ids) with ordinality entries(id,pos)
    on conflict(photo_id) do update set home_selected=case when p_action='rank' then home_gallery_curation.home_selected else excluded.home_selected end,
      home_hidden=case when p_action='rank' then home_gallery_curation.home_hidden else excluded.home_hidden end,
      home_rank=case when p_action='rank' then excluded.home_rank else home_gallery_curation.home_rank end,
      home_editor=p_editor,updated_at=now();
  else
    update public.home_shortform s set home_selected=case when p_action='rank' then s.home_selected else p_action='select' end,
      home_hidden=case when p_action='rank' then s.home_hidden else p_action='hide' end,
      home_rank=case when p_action='rank' then entries.pos::integer else s.home_rank end,home_editor=p_editor,home_edited_at=now()
      from unnest(p_ids) with ordinality entries(id,pos) where s.id=entries.id::uuid;
  end if;
end $$;
revoke all on function public.admin_edit_home_media(text,text,text[],text),public.admin_home_media_candidates(text,boolean) from public,anon,authenticated;
grant execute on function public.admin_edit_home_media(text,text,text[],text),public.admin_home_media_candidates(text,boolean) to service_role;
notify pgrst,'reload schema';
commit;
