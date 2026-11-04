-- Synthetic-only; execute solely in an isolated cluster.
insert into public.app_users values ('20000000-0000-4000-8000-000000000001','active'),('20000000-0000-4000-8000-000000000002','active'),('20000000-0000-4000-8000-000000000003','disabled');
insert into public.group_pages values
 ('00000000-0000-4000-8000-000000000001','hobby',null,now(),'one',true),('00000000-0000-4000-8000-000000000002','fan',null,now(),'two',true),('00000000-0000-4000-8000-000000000003','brand',null,now(),'three',true),('00000000-0000-4000-8000-000000000004','hobby',null,now(),'four',true),('00000000-0000-4000-8000-000000000005','hobby',null,now(),'hidden',false);
insert into public.group_memberships select id,'20000000-0000-4000-8000-000000000001'::uuid from public.group_pages;
insert into public.group_memberships values ('00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002');
insert into public.group_presence values
 ('00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','2026-11-03T01:00:00Z'),
 ('00000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','2026-11-03T01:00:00Z'),
 ('00000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002','2026-11-03T23:00:00Z');
do $$declare a uuid:='20000000-0000-4000-8000-000000000001'; b uuid:='20000000-0000-4000-8000-000000000002';r jsonb;c jsonb;begin
 r:=public.groups_dispatch('directory',a,null,null,'{"sort":"visited","mine":"joined","limit":1}',null);
 if r->>'totalCount'<>'4' or r#>>'{items,0,id}'<>'00000000-0000-4000-8000-000000000001' or r#>>'{items,0,lastSeenAt}' is null then raise exception 'first/tie/scope %',r;end if;
 c:=r->'nextCursor';
 r:=public.groups_dispatch('directory',a,null,null,jsonb_build_object('sort','visited','mine','joined','limit',1,'cursor',c),null);
 if r#>>'{items,0,id}'<>'00000000-0000-4000-8000-000000000002' then raise exception 'tie cursor %',r;end if;
 c:=r->'nextCursor';
 r:=public.groups_dispatch('directory',a,null,null,jsonb_build_object('sort','visited','mine','joined','limit',1,'cursor',c),null);
 if r#>>'{items,0,id}'<>'00000000-0000-4000-8000-000000000003' or r#>'{items,0,lastSeenAt}'<>'null'::jsonb then raise exception 'null transition/privacy %',r;end if;
 c:=r->'nextCursor';
 r:=public.groups_dispatch('directory',a,null,null,jsonb_build_object('sort','visited','mine','joined','limit',1,'cursor',c),null);
 if r#>>'{items,0,id}'<>'00000000-0000-4000-8000-000000000004' or r->'nextCursor'<>'null'::jsonb then raise exception 'null cursor/end %',r;end if;
 begin perform public.groups_dispatch('directory',b,null,null,jsonb_build_object('sort','visited','mine','joined','cursor',c),null);raise exception 'owner mismatch accepted';exception when raise_exception then if sqlerrm<>'GROUPS_INVALID_REQUEST' then raise;end if;end;
 begin perform public.groups_dispatch('directory',null,null,null,'{"sort":"visited","mine":"joined"}',null);raise exception 'guest accepted';exception when raise_exception then if sqlerrm<>'GROUPS_FORBIDDEN' then raise;end if;end;
 if public.groups_dispatch('directory',a,null,null,'{"sort":"recent"}',null)->>'legacySort'<>'recent' then raise exception 'recent not delegated';end if;
 if public.groups_dispatch('directory',a,null,null,'{"sort":"today","limit":1}',null)->>'totalCount'<>'4' then raise exception 'today not delegated';end if;
end $$;
