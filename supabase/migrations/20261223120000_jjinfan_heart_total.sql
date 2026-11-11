-- 찐팬 100 게이지는 찐팬 인원수가 아니라 하트 총수/100이다(대표 2026-11-11 원문: "하트가 100개 채워지면 하트 하나당 1000원").
-- creator_heart_total = 한 크리에이터 페이지에 쌓인 하트 전부: 패스포트 쪽 받기(creator_heart_ledger passport_page_claim) + 하트 전환(fan_heart_conversions),
-- 활성 회원분만. passport_hearts·creator_jjinfan_count와 같은 원천이라 한 사람의 하트가 두 번 세어지거나 빠지지 않는다. 인원수(count)는 그대로 두고
-- read_active_jjinfan_challenges 항목에 hearts 하나만 더한다. 웹과 DB는 어느 쪽이 먼저 나가도 된다: 옛 웹은 hearts를 무시하고, 새 웹은 hearts 없는 답을 읽기 실패로 보고 0을 보인다.
--
-- Rollback: supabase/rollback/20261223120000_jjinfan_heart_total.sql
begin;
set local lock_timeout = '5s';

create function public.creator_heart_total(p_celebrity uuid)
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce(sum(x.n), 0)::bigint
    from (select l.app_user_id, l.amount::bigint as n from public.creator_heart_ledger l where l.celebrity_id = p_celebrity and l.source_type = 'passport_page_claim'
          union all
          select c.app_user_id, c.hearts::bigint from public.fan_heart_conversions c where c.celebrity_id = p_celebrity) x
    join public.app_users u on u.id = x.app_user_id and u.status = 'active'
$$;
revoke all on function public.creator_heart_total(uuid) from public, anon, authenticated, service_role;

create or replace function public.read_active_jjinfan_challenges(p_locale text default 'ko', p_limit integer default 10)
returns jsonb language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object('items', coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'slug', r.slug, 'name', r.name, 'imageUrl', r.image_url, 'title', r.title, 'description', r.description, 'endsOn', r.ends_on, 'count', r.n, 'hearts', r.h, 'target', 100
    ) order by r.updated_at desc, r.slug), '[]'::jsonb))
    from (select c.slug, c.image_url, j.title, j.description, j.ends_on, j.updated_at, coalesce(nl.name, nk.name, ne.name, c.slug) as name,
                 public.creator_jjinfan_count(c.id) as n, public.creator_heart_total(c.id) as h
            from public.jjinfan_challenge_campaigns j
            join public.celebrities c on c.id = j.celebrity_id and c.status = 'published' and c.archived_at is null
            left join public.celebrity_localizations nl on nl.celebrity_id = c.id and nl.locale::text = p_locale
            left join public.celebrity_localizations nk on nk.celebrity_id = c.id and nk.locale::text = 'ko'
            left join public.celebrity_localizations ne on ne.celebrity_id = c.id and ne.locale::text = 'en'
           where public.jjinfan_campaign_open(j.enabled, j.ends_on) and public.platform_fan_heart_counted(c.id) and public.creator_listed(c.id)
           order by j.updated_at desc, c.slug
           limit least(greatest(coalesce(p_limit, 10), 1), 10)) r
$$;

-- The reader's owner may differ from the role applying this (dev: postgres): it needs execute on the new counter, as 20261215020000 did for the count.
do $owner$
declare reader name;
begin
  select pg_catalog.pg_get_userbyid(proowner) into reader from pg_catalog.pg_proc where oid = 'public.read_active_jjinfan_challenges(text,integer)'::regprocedure;
  if reader <> current_user and not exists (select 1 from pg_catalog.pg_roles where rolname = reader and rolsuper) then
    execute format('grant execute on function public.creator_heart_total(uuid) to %I', reader);
  end if;
end $owner$;
commit;
