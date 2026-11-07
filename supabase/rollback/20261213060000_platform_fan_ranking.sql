-- Rollback for 20261213060000_platform_fan_ranking.sql. Roll the web back first: the new web reads /api/rankings/fans and ?metric=fans, which then answer 503.
-- Access granted to function owners stays, as in the earlier ranking migrations.
begin;
set local lock_timeout='5s';
drop function public.read_platform_fan_ranking(text, uuid, integer, timestamptz);
drop function public.read_creator_fan_ranking(text, integer);
do $patch$
declare def text; anchor text;
begin
  def := pg_catalog.pg_get_functiondef('public.refresh_ranking_snapshots(timestamptz)'::regprocedure);
  anchor := $a$array['creator_hearts', 'fan_contribution', 'dukjil', 'fan_hearts']$a$;
  if position(anchor in def) = 0 then raise exception 'PLATFORM_FAN_RANKING_ROLLBACK: refresh_ranking_snapshots'; end if;
  execute replace(def, anchor, $a$array['creator_hearts', 'fan_contribution', 'dukjil']$a$);

  def := pg_catalog.pg_get_functiondef('public.ranking_scores(text,uuid,timestamptz,timestamptz)'::regprocedure);
  anchor := $a$  union all
  select '00000000-0000-0000-0000-000000000000'::uuid, l.app_user_id, count(*)::bigint, max(l.created_at)
    from public.creator_heart_ledger l
    join public.app_users u on u.id = l.app_user_id and u.status = 'active'
   where p_kind = 'fan_hearts' and l.source_type = 'passport_page_claim' and l.created_at >= p_from and l.created_at < p_to
     and public.platform_fan_heart_counted(l.celebrity_id)
   group by l.app_user_id
$a$;
  if position(anchor in def) = 0 then raise exception 'PLATFORM_FAN_RANKING_ROLLBACK: ranking_scores'; end if;
  execute replace(def, anchor, '');
end $patch$;
drop function public.platform_fan_heart_counted(uuid);
drop function public.platform_fan_ranking_owner_check(), public.platform_fan_ranking_owner_access(), public.platform_fan_ranking_owner_functions(),
  public.platform_fan_ranking_owner_tables(), public.platform_fan_ranking_owner_roles();
delete from public.ranking_snapshots where kind = 'fan_hearts';
alter table public.ranking_snapshots drop constraint ranking_snapshots_creator_scope;
alter table public.ranking_snapshots add constraint ranking_snapshots_creator_scope check ((kind = 'creator_hearts') = (scope_id = '00000000-0000-0000-0000-000000000000'::uuid));
alter table public.ranking_snapshots drop constraint ranking_snapshots_kind_check;
alter table public.ranking_snapshots add constraint ranking_snapshots_kind_check check (kind in ('creator_hearts', 'fan_contribution', 'dukjil'));
commit;
