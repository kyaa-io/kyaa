-- The migration fills the gap, keeps active holders as members and leaves existing pages alone.
do $$ declare g public.group_pages%rowtype; n integer; begin
 select * into g from public.group_pages where celebrity_id='fa200000-0000-4000-8000-000000000001';
 if not found or g.id<>'fa200000-0000-4000-8000-000000000001' or g.kind<>'fan' or g.name<>'업그레이드' then raise exception 'backfill wrong %',to_jsonb(g); end if;
 select count(*) into n from public.group_memberships where page_id=g.id;
 if n<>1 or not exists(select 1 from public.group_memberships where page_id=g.id and app_user_id='fa210000-0000-4000-8000-000000000001' and role='member') then raise exception 'backfill membership wrong: %',n; end if;
 select * into g from public.group_pages where celebrity_id='fa200000-0000-4000-8000-000000000002';
 if g.id<>'fa220000-0000-4000-8000-000000000002' or g.status<>'hidden' or g.name<>'Operator name' then raise exception 'existing page changed %',to_jsonb(g); end if;
end $$;
