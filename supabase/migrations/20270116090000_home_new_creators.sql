begin;
set local lock_timeout = '5s';

-- Use the existing immutable first-publication record. NULL settings inherit
-- the default, including for installations where Aya has not been created yet.
alter table public.celebrities add column exclude_from_new_creators boolean;

do $$
declare
  definition text;
  anchor text;
begin
  definition := pg_get_functiondef('public.read_admin_celebrity_cms(uuid,uuid)'::regprocedure);
  anchor := 'item||jsonb_build_object(''onchainRegistration''';
  if cardinality(string_to_array(definition, anchor)) <> 2 then
    raise exception 'ADMIN_NEW_CREATORS_READ_SHAPE_CHANGED';
  end if;
  execute replace(definition, anchor, $patch$item || jsonb_build_object(
    'excludeFromNewCreators', (select coalesce(c.exclude_from_new_creators, c.slug = 'aya')
      from public.celebrities c where c.id = (item->>'id')::uuid)
  ) || jsonb_build_object('onchainRegistration'$patch$);

  definition := pg_get_functiondef('public.save_admin_celebrity(uuid,uuid,uuid,jsonb)'::regprocedure);
  anchor := 'select public.read_admin_celebrity_cms(p_actor, target)->0 into result;';
  if cardinality(string_to_array(definition, anchor)) <> 2 then
    raise exception 'ADMIN_NEW_CREATORS_SAVE_SHAPE_CHANGED';
  end if;
  execute replace(definition, anchor, $patch$
    if p_payload ? 'excludeFromNewCreators' then
      if jsonb_typeof(p_payload->'excludeFromNewCreators') is distinct from 'boolean' then
        raise exception 'invalid new creator exclusion';
      end if;
      update public.celebrities set exclude_from_new_creators = (p_payload->>'excludeFromNewCreators')::boolean
        where id = target and exclude_from_new_creators is distinct from (p_payload->>'excludeFromNewCreators')::boolean;
    end if;
    select public.read_admin_celebrity_cms(p_actor, target)->0 into result;
  $patch$);
end $$;

create function public.read_home_new_creators(p_locale text, p_top_slugs text[])
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('slug', candidate.slug, 'name', candidate.name, 'imageUrl', candidate.image_url)
    order by candidate.ever_published_at desc, candidate.id), '[]'::jsonb)
  from (
    select c.id, c.slug, g.image_url, c.ever_published_at,
      coalesce(nullif(btrim(nl.name), ''), nullif(btrim(nk.name), ''), nullif(btrim(ne.name), ''), c.slug) as name
    from public.celebrities c
    join public.group_pages g on g.celebrity_id = c.id and g.kind = 'fan'
    left join public.celebrity_localizations nl on nl.celebrity_id = c.id and nl.locale::text = p_locale
    left join public.celebrity_localizations nk on nk.celebrity_id = c.id and nk.locale::text = 'ko'
    left join public.celebrity_localizations ne on ne.celebrity_id = c.id and ne.locale::text = 'en'
    where c.status = 'published' and c.archived_at is null
      and g.status = 'published' and g.listed and not g.anonymous
      and c.slug <> 'kyaa-wave-fanpage' and c.primary_role is distinct from 'brand'
      -- Production bases before page verification treat existing pages as verified.
      and coalesce(to_jsonb(c)->>'verification', 'verified') = 'verified'
      and not coalesce(c.exclude_from_new_creators, c.slug = 'aya')
      and c.ever_published_at >= (((now() at time zone 'Asia/Seoul')::date - 13)::timestamp at time zone 'Asia/Seoul')
      and c.ever_published_at <= now()
      and not (c.slug = any(coalesce(p_top_slugs, array[]::text[])))
    order by c.ever_published_at desc, c.id
    limit 2
  ) candidate
$$;

revoke all on function public.read_home_new_creators(text,text[]) from public, anon, authenticated;
grant execute on function public.read_home_new_creators(text,text[]) to service_role;
notify pgrst, 'reload schema';
commit;
