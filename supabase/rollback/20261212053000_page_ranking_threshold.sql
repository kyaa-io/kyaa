-- Rollback for 20261212053000_page_ranking_threshold.sql. Run before the rollback of 20261212052000. The web may stay: without the key it shows the list.
begin;
set local lock_timeout='5s';
do $patch$
declare def text;anchor text;
begin
 def:=pg_catalog.pg_get_functiondef('public.read_group_public_ranking(uuid,uuid)'::regprocedure);
 anchor:=$a$if raw->'available'='false'::jsonb then return$a$;
 if position(anchor in def)=0 then raise exception 'PAGE_RANKING_ROLLBACK: %',left(anchor,40);end if;
 def:=replace(def,anchor,$a$if not coalesce((public.read_celebrity_fan_leaderboard((select c.slug from public.celebrities c where c.id=g.celebrity_id),null,'ko','all')->>'available')::boolean,false)then return$a$);
 execute def;
 def:=pg_catalog.pg_get_functiondef('public.read_page_ranking(uuid,text,text,uuid,timestamptz)'::regprocedure);
 anchor:=$a$'me', public.ranking_my_rank(p_kind, p_celebrity, p_period, p_at, snap.rows, p_viewer)) || case when closed then pg_catalog.jsonb_build_object('available', false) else '{}'::jsonb end;$a$;
 if position(anchor in def)=0 then raise exception 'PAGE_RANKING_ROLLBACK: %',left(anchor,40);end if;
 def:=replace(def,anchor,$a$'me', public.ranking_my_rank(p_kind, p_celebrity, p_period, p_at, snap.rows, p_viewer));$a$);
 anchor:=$a$'computedAt', case when closed then null else snap.computed_at end, 'rows', items,$a$;
 if position(anchor in def)=0 then raise exception 'PAGE_RANKING_ROLLBACK: %',left(anchor,40);end if;
 def:=replace(def,anchor,$a$'computedAt', snap.computed_at, 'rows', items,$a$);
 anchor:=$a$case when coalesce(g.anonymous, false) or closed then '[]'::jsonb else coalesce(snap.rows, '[]'::jsonb) end$a$;
 if position(anchor in def)=0 then raise exception 'PAGE_RANKING_ROLLBACK: %',left(anchor,40);end if;
 def:=replace(def,anchor,$a$case when coalesce(g.anonymous, false) then '[]'::jsonb else coalesce(snap.rows, '[]'::jsonb) end$a$);
 anchor:=$a$select * into snap from public.ranking_snapshots where kind = p_kind and scope_id = p_celebrity and period = p_period and period_start = w.period_start;
  -- The member rule: 100 active fans. Asked after the anonymous check, so an anonymous page tells nothing about its fan count.
  closed := not coalesce(g.anonymous, false) and not coalesce((public.read_celebrity_fan_leaderboard(v_slug, null, 'ko', 'all') ->> 'available')::boolean, false);$a$;
 if position(anchor in def)=0 then raise exception 'PAGE_RANKING_ROLLBACK: %',left(anchor,40);end if;
 def:=replace(def,anchor,$a$select * into snap from public.ranking_snapshots where kind = p_kind and scope_id = p_celebrity and period = p_period and period_start = w.period_start;$a$);
 anchor:=$a$declare w record; snap public.ranking_snapshots; items jsonb; v_slug text; g public.group_pages; closed boolean;$a$;
 if position(anchor in def)=0 then raise exception 'PAGE_RANKING_ROLLBACK: %',left(anchor,40);end if;
 def:=replace(def,anchor,$a$declare w record; snap public.ranking_snapshots; items jsonb; v_slug text; g public.group_pages;$a$);
 execute def;
end $patch$;
commit;
