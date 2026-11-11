-- Rollback for 20261223120000_jjinfan_heart_total.sql: the reader answers without hearts again and the counter goes. Roll the web back first
-- (the new home gauge reads hearts; without them it shows 0).
begin;
set local lock_timeout = '5s';
create or replace function public.read_active_jjinfan_challenges(p_locale text default 'ko', p_limit integer default 10)
returns jsonb language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object('items', coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'slug', r.slug, 'name', r.name, 'imageUrl', r.image_url, 'title', r.title, 'description', r.description, 'endsOn', r.ends_on, 'count', r.n, 'target', 100
    ) order by r.updated_at desc, r.slug), '[]'::jsonb))
    from (select c.slug, c.image_url, j.title, j.description, j.ends_on, j.updated_at, coalesce(nl.name, nk.name, ne.name, c.slug) as name,
                 public.creator_jjinfan_count(c.id) as n
            from public.jjinfan_challenge_campaigns j
            join public.celebrities c on c.id = j.celebrity_id and c.status = 'published' and c.archived_at is null
            left join public.celebrity_localizations nl on nl.celebrity_id = c.id and nl.locale::text = p_locale
            left join public.celebrity_localizations nk on nk.celebrity_id = c.id and nk.locale::text = 'ko'
            left join public.celebrity_localizations ne on ne.celebrity_id = c.id and ne.locale::text = 'en'
           where public.jjinfan_campaign_open(j.enabled, j.ends_on) and public.platform_fan_heart_counted(c.id) and public.creator_listed(c.id)
           order by j.updated_at desc, c.slug
           limit least(greatest(coalesce(p_limit, 10), 1), 10)) r
$$;
drop function public.creator_heart_total(uuid);
commit;
