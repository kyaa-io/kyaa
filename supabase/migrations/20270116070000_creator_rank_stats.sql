-- Home creator ranking, opened row (대표 2026-11-26 22:17): passports issued, stamps issued all time and 찐팬 인증 (approved proofs) per creator,
-- in place of 찐팬 hearts and the 찐팬 head count. Read only; the ranking functions stay as they are and the route reads this beside them.
-- passports: fan_passports of the creator. stamps: community stamps of the creator that were not revoked (the stamps the mission book holds).
-- proofs: the 'proof' stamps among them, issued once per approved certification submission (record_dukjil_action('proof'), 20261210220000).
create function public.read_creator_rank_stats(p_slugs text[])
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(c.slug, jsonb_build_object(
      'passports', (select count(*) from public.fan_passports p where p.celebrity_id = c.id),
      'stamps', coalesce(s.stamps, 0),
      'proofs', coalesce(s.proofs, 0))), '{}'::jsonb)
    from public.celebrities c
    left join (
      select x.celebrity_id, count(*) as stamps, count(*) filter (where x.kind = 'proof') as proofs
        from public.community_stamps x
       where x.revoked_at is null
         and x.celebrity_id in (select y.id from public.celebrities y where y.slug = any (p_slugs))
       group by x.celebrity_id
    ) s on s.celebrity_id = c.id
   where c.slug = any (p_slugs) and c.status = 'published' and c.archived_at is null;
$$;

revoke all on function public.read_creator_rank_stats(text[]) from public, anon, authenticated;
grant execute on function public.read_creator_rank_stats(text[]) to service_role;
