\set ON_ERROR_STOP on
\ir seed-groups-pencil-dev.test.sql
begin;
-- Keep migration bootstrap pages outside this fixture assertion.
update public.group_pages set status='hidden' where id::text not like 'f1630000-%';
do $$declare first_page jsonb;second_page jsonb;result jsonb; restricted_creator uuid; restricted_page uuid; role_name text; expected integer;begin
 first_page:=public.groups_dispatch('directory',p_input=>' {"sort":"recent","limit":8}'::jsonb);
 if (first_page->>'totalCount')::int<>14 or jsonb_array_length(first_page->'items')<>8 then raise exception 'Directory first-page count differs: %',first_page;end if;
 second_page:=public.groups_dispatch('directory',p_input=>jsonb_build_object('sort','recent','limit',8,'cursor',first_page->>'nextCursor'));
 if (second_page->>'totalCount')::int<>14 or jsonb_array_length(second_page->'items')<>6 or second_page->>'nextCursor' is not null then raise exception 'Directory second-page count differs';end if;
 if exists(select 1 from jsonb_array_elements(first_page->'items') a join jsonb_array_elements(second_page->'items') b on a->>'id'=b->>'id') then raise exception 'Directory pages overlap';end if;
 result:=public.groups_dispatch('directory',p_actor=>'f1610000-0000-4000-8000-000000000002',p_input=>'{"mine":"joined"}');
 if (result->>'totalCount')::int<>4 then raise exception 'Joined count differs';end if;
 result:=public.groups_dispatch('directory',p_input=>'{"type":"fan"}');
 if (result->>'totalCount')::int<>2 then raise exception 'Type filter count differs';end if;
 foreach role_name in array array['idol','singer','actor','creator','show_host'] loop
  select count(*) into expected from public.group_pages gp join public.celebrities c on c.id=gp.celebrity_id where gp.kind='fan' and public.group_scope_visible(null,gp.id) and c.primary_role::text=role_name;
  result:=public.groups_dispatch('directory',p_input=>jsonb_build_object('type','fan','artistRole',role_name,'limit',1));
  if (result->>'totalCount')::int<>expected or jsonb_array_length(result->'items')<>least(expected,1) then raise exception 'Artist role count or pagination differs: %',role_name;end if;
 end loop;
 result:=public.groups_dispatch('directory',p_input=>'{"search":"no-match-123456789"}');
 if (result->>'totalCount')::int<>0 or jsonb_array_length(result->'items')<>0 then raise exception 'Search filter count differs';end if;
 select id into restricted_creator from public.celebrities where slug='kyaa-wave-fanpage';
 if restricted_creator is null then
  insert into public.celebrities(id,slug,status,roles,primary_role,image_url,published_at) values('f1800000-0000-4000-8000-000000000001','kyaa-wave-fanpage','published','{creator}','creator','/images/groups/nchive-pencil.jpg',now()) returning id into restricted_creator;
 end if;
 select id into restricted_page from public.group_pages where celebrity_id=restricted_creator;
 if restricted_page is null then
  insert into public.group_pages(id,kind,celebrity_id,name,status) values('f1800000-0000-4000-8000-000000000002','fan',restricted_creator,'Restricted fixture','published') returning id into restricted_page;
 end if;
 update public.group_pages set status='published',created_at=now()+interval '1 day' where id=restricted_page;
 result:=public.groups_dispatch('directory',p_input=>'{"sort":"recent","limit":8}');
 if (result->>'totalCount')::int<>14 or jsonb_array_length(result->'items')<>8 or exists(select 1 from jsonb_array_elements(result->'items') p where p->>'id'=restricted_page::text) then raise exception 'Attendance-only page leaked or consumed a slot';end if;
 update public.group_pages set status='hidden' where id='f1630000-0000-4000-8000-000000000001';
 result:=public.groups_dispatch('directory',p_input=>'{"sort":"recent","limit":8}');
 if (result->>'totalCount')::int<>13 or jsonb_array_length(result->'items')<>8 or exists(select 1 from jsonb_array_elements(result->'items') p where p->>'id'='f1630000-0000-4000-8000-000000000001') then raise exception 'Hidden page leaked or consumed visible slot';end if;
 begin
  perform public.groups_dispatch('directory',p_input=>'{"mine":"joined"}');
  raise exception 'Anonymous private directory accepted';
 exception when raise_exception then if sqlerrm<>'GROUPS_FORBIDDEN' then raise;end if;end;
 begin
  perform public.groups_dispatch('directory',p_actor=>'f1610000-0000-4000-8000-999999999999');
  raise exception 'Unknown actor accepted';
 exception when raise_exception then if sqlerrm<>'GROUPS_FORBIDDEN' then raise;end if;end;
 if has_function_privilege('anon','public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid)','EXECUTE') or has_function_privilege('authenticated','public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid)','EXECUTE') then raise exception 'Directory RPC exposed to client role';end if;
end $$;
rollback;
