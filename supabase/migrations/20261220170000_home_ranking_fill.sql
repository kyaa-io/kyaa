-- Fill the home heart rankings with eligible zero-score entries when fewer than ten have activity.
do $$
declare def text; updated text;
begin
  select pg_catalog.pg_get_functiondef('public.refresh_home_rankings(timestamptz)'::regprocedure) into def;
  updated := replace(def, '  get diagnostics fans = row_count;', $patch$
  get diagnostics fans = row_count;
  insert into public.home_ranking_daily(kind, day, subject_id, rank, score, hearts, tier, favorite_celebrity_id, achieved_at, computed_at, jjinfan_count)
  select 'fan_hearts', d, u.id, fans + row_number() over (order by u.created_at, u.id), 0, 0, null, null, u.created_at, p_now, 0
    from public.app_users u join public.user_profiles p on p.app_user_id = u.id
   where u.status = 'active'
     and not exists (select 1 from public.home_ranking_daily r where r.day = d and r.kind = 'fan_hearts' and r.subject_id = u.id)
     and not exists (select 1 from public.app_user_moderation_restrictions mr where mr.app_user_id = u.id and mr.revoked_at is null)
   order by u.created_at, u.id limit greatest(0, 10 - fans);
  get diagnostics points = row_count;
  fans := fans + points;
$patch$);
  if updated = def then raise exception 'home fan ranking definition changed'; end if;
  def := updated;
  updated := replace(def, '  get diagnostics creator_hearts = row_count;', $patch$
  get diagnostics creator_hearts = row_count;
  insert into public.home_ranking_daily(kind, day, subject_id, rank, score, hearts, achieved_at, computed_at)
  select 'creator_hearts', d, c.id, creator_hearts + row_number() over (order by c.created_at, c.id), 0, 0, c.created_at, p_now
    from public.celebrities c
   where public.platform_fan_heart_counted(c.id) and public.creator_listed(c.id)
     and exists (select 1 from public.group_pages g where g.celebrity_id = c.id and g.kind = 'fan')
     and not exists (select 1 from public.home_ranking_daily r where r.day = d and r.kind = 'creator_hearts' and r.subject_id = c.id)
   order by c.created_at, c.id limit greatest(0, 10 - creator_hearts);
  select count(*) into creator_hearts from public.home_ranking_daily r where r.kind = 'creator_hearts' and r.day = d;
$patch$);
  if updated = def then raise exception 'home creator ranking definition changed'; end if;
  execute updated;
end $$;
