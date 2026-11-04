-- Synthetic-only assertions; run exclusively against a new isolated cluster.
insert into public.group_pages values
 ('00000000-0000-4000-8000-000000000001','fan','10000000-0000-4000-8000-000000000001',now()-interval '2 days','fan',true),
 ('00000000-0000-4000-8000-000000000002','hobby',null,now()-interval '1 day','hobby',true),
 ('00000000-0000-4000-8000-000000000003','brand',null,now()-interval '3 days','brand',true),
 ('00000000-0000-4000-8000-000000000004','fan',null,now(),'hidden',false);
insert into public.app_users values('20000000-0000-4000-8000-000000000001','active'),('20000000-0000-4000-8000-000000000002','active'),('20000000-0000-4000-8000-000000000003','disabled');
insert into public.group_visits values
 ('00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',(now() at time zone 'Asia/Seoul')::date),
 ('00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',(now() at time zone 'Asia/Seoul')::date),
 ('00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003',(now() at time zone 'Asia/Seoul')::date),
 ('00000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001',(now() at time zone 'Asia/Seoul')::date);
insert into public.group_artist_bindings values('00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002');
insert into public.group_posts values
 ('30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002',now(),'public',null),
 ('30000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002',now(),'members',null),
 ('30000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002',now(),'public',now()),
 ('30000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000002',(((now() at time zone 'Asia/Seoul')::date)::timestamp at time zone 'Asia/Seoul')-interval '1 second','public',null);
insert into public.fan_posts values('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',now(),'public',null,null),('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',now(),'members',null,null);
insert into public.fan_lounge_messages values('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',now(),null,null);
do $$declare r jsonb;begin
 r:=public.groups_dispatch('directory',null,null,null,'{"sort":"today","limit":3}',null);
 if r->>'totalCount'<>'3' or r->'nextCursor'<>'null'::jsonb or r#>>'{items,0,id}'<>'00000000-0000-4000-8000-000000000001' or r#>>'{items,1,id}'<>'00000000-0000-4000-8000-000000000002' then raise exception 'unexpected ranking %',r;end if;
 if public.groups_dispatch('directory',null,null,null,'{"sort":"popular"}',null)->>'legacySort'<>'popular' then raise exception 'popular delegation';end if;
 if public.groups_dispatch('directory',null,null,null,'{"sort":"recent"}',null)->>'legacySort'<>'recent' then raise exception 'recent delegation';end if;
 begin perform public.groups_dispatch('directory',null,null,null,'{"sort":"today","cursor":"00000000-0000-4000-8000-000000000001"}',null);raise exception 'cursor accepted';exception when raise_exception then if sqlerrm<>'GROUPS_INVALID_REQUEST' then raise;end if;end;
end $$;
-- Duplicate heartbeat cannot create a second daily visitor; KST boundaries and future rows do not alter the first ranking.
insert into public.group_visits values ('00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',(now() at time zone 'Asia/Seoul')::date) on conflict do nothing;
insert into public.group_posts values ('30000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000002',(((now() at time zone 'Asia/Seoul')::date+1)::timestamp at time zone 'Asia/Seoul'),'public',null);
insert into public.fan_posts values ('40000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001',now(),'public',null,now());
do $$declare r jsonb;begin
 r:=public.groups_dispatch('directory',null,null,null,'{"sort":"today","limit":2}',null);
 if jsonb_array_length(r->'items')<>2 or r->>'totalCount'<>'3' or r->'nextCursor'<>'null'::jsonb or r#>>'{items,0,id}'<>'00000000-0000-4000-8000-000000000001' then raise exception 'boundary or duplicate %',r;end if;
end $$;
-- Exact KST midnight is included; the member-only/hidden fan posts must not break the resulting tie.
insert into public.group_posts values ('30000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000002',(((now() at time zone 'Asia/Seoul')::date)::timestamp at time zone 'Asia/Seoul'),'public',null);
do $$declare r jsonb;begin
 r:=public.groups_dispatch('directory',null,null,null,'{"sort":"today","limit":3}',null);
 if r#>>'{items,0,id}'<>'00000000-0000-4000-8000-000000000002' then raise exception 'midnight or private/hidden eligibility %',r;end if;
end $$;
-- Duplicate public fan mapping must not double attribute the creator's fan content.
insert into public.group_pages values ('00000000-0000-4000-8000-000000000005','fan','10000000-0000-4000-8000-000000000001',now()-interval '4 days','duplicate',true);
do $$declare r jsonb;begin
 r:=public.groups_dispatch('directory',null,null,null,'{"sort":"today","limit":4}',null);
 if r#>>'{items,0,id}'<>'00000000-0000-4000-8000-000000000002' then raise exception 'duplicate creator association %',r;end if;
 if r#>>'{items,2,id}'<>'00000000-0000-4000-8000-000000000003' or r#>>'{items,3,id}'<>'00000000-0000-4000-8000-000000000005' then raise exception 'zero activity tie %',r;end if;
end $$;
analyze public.group_visits; analyze public.group_posts; analyze public.fan_posts; analyze public.fan_lounge_messages;
explain (analyze,buffers) select count(*) from public.group_visits where day=(statement_timestamp() at time zone 'Asia/Seoul')::date and page_id='00000000-0000-4000-8000-000000000001';
explain (analyze,buffers) select count(*) from public.group_posts where page_id='00000000-0000-4000-8000-000000000002' and visibility='public' and removed_at is null and created_at>=((statement_timestamp() at time zone 'Asia/Seoul')::date::timestamp at time zone 'Asia/Seoul') and created_at<((statement_timestamp() at time zone 'Asia/Seoul')::date::timestamp at time zone 'Asia/Seoul')+interval '1 day';
explain (analyze,buffers) select public.groups_dispatch('directory',null,null,null,'{"sort":"today","limit":3}',null);
