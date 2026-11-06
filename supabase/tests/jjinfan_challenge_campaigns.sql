-- 찐팬 100명 게이지 settings: off by default, only an administrator writes, the public read carries the wording only while on.
insert into public.app_users(id,privy_user_id,verified_email) values
 ('fb110000-0000-4000-8000-000000000001','did:privy:jjgauge-admin','jjgauge-admin@example.test'),
 ('fb110000-0000-4000-8000-000000000002','did:privy:jjgauge-viewer','jjgauge-viewer@example.test');
insert into public.admin_allowlist(id,email,role) values
 ('fb110000-0000-4000-8000-000000000003','jjgauge-admin@example.test','admin'),
 ('fb110000-0000-4000-8000-000000000004','jjgauge-viewer@example.test','viewer');
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values
 ('fb100000-0000-4000-8000-000000000001','jjgauge-on','published','/images/x.png',now(),array['singer']::text[],'singer');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values
 ('fb100000-0000-4000-8000-000000000001','ko','게이지','게이지 소개','게이지 사진'),
 ('fb100000-0000-4000-8000-000000000001','en','Gauge','About gauge','Gauge photo');

do $$
declare r jsonb; admin_user constant uuid:='fb110000-0000-4000-8000-000000000001'; admin_list constant uuid:='fb110000-0000-4000-8000-000000000003';
 viewer_user constant uuid:='fb110000-0000-4000-8000-000000000002'; viewer_list constant uuid:='fb110000-0000-4000-8000-000000000004'; c constant uuid:='fb100000-0000-4000-8000-000000000001'; corr constant uuid:='fb110000-0000-4000-8000-0000000000aa'; n integer; refused boolean;
begin
 r:=public.read_jjinfan_challenge(c);
 if (r->>'target')<>'100' or (r->>'count')<>'0' or jsonb_typeof(r->'campaign')<>'null' then raise exception 'default read %',r; end if;

 r:=public.list_jjinfan_challenge_campaigns(viewer_user,viewer_list);
 if not exists(select 1 from jsonb_array_elements(r->'items') e where e->>'celebrityId'=c::text and (e->>'enabled')::boolean=false and e->>'name'='게이지') then raise exception 'list %',r; end if;

 refused:=false; begin perform public.set_jjinfan_challenge_campaign(viewer_user,viewer_list,corr,c,true,'제목','설명'); exception when others then refused:=true; end;
 if not refused then raise exception 'viewer wrote a campaign'; end if;
 refused:=false; begin perform public.set_jjinfan_challenge_campaign(admin_user,admin_list,corr,c,true,'   ','설명'); exception when others then refused:=sqlerrm='JJINFAN_CAMPAIGN_INVALID'; end;
 if not refused then raise exception 'enabled without a title'; end if;
 refused:=false; begin perform public.set_jjinfan_challenge_campaign(admin_user,admin_list,corr,c,false,repeat('가',81),''); exception when others then refused:=sqlerrm='JJINFAN_CAMPAIGN_INVALID'; end;
 if not refused then raise exception 'overlong title'; end if;
 refused:=false; begin perform public.set_jjinfan_challenge_campaign(admin_user,admin_list,corr,gen_random_uuid(),false,'',''); exception when others then refused:=sqlerrm='CREATOR_NOT_FOUND'; end;
 if not refused then raise exception 'unknown creator'; end if;

 -- A saved draft that is off stays on the server.
 perform public.set_jjinfan_challenge_campaign(admin_user,admin_list,corr,c,false,'초안 제목','초안 설명');
 r:=public.read_jjinfan_challenge(c);
 if jsonb_typeof(r->'campaign')<>'null' then raise exception 'draft leaked %',r; end if;

 perform public.set_jjinfan_challenge_campaign(admin_user,admin_list,corr,c,true,' 공개 제목 ','공개 설명');
 r:=public.read_jjinfan_challenge(c);
 if r->'campaign'->>'title'<>'공개 제목' or r->'campaign'->>'description'<>'공개 설명' or (r->>'target')<>'100' then raise exception 'on read %',r; end if;

 select count(*) into n from public.audit_logs where action='jjinfan_campaign.updated' and entity_id=c::text;
 if n<>2 then raise exception 'audit rows %',n; end if;

 perform public.set_jjinfan_challenge_campaign(admin_user,admin_list,corr,c,false,'공개 제목','공개 설명');
 if jsonb_typeof(public.read_jjinfan_challenge(c)->'campaign')<>'null' then raise exception 'off still reads'; end if;

 foreach r in array array['"anon"'::jsonb,'"authenticated"'::jsonb] loop
  if has_function_privilege(r#>>'{}','public.set_jjinfan_challenge_campaign(uuid,uuid,uuid,uuid,boolean,text,text)','execute') or has_function_privilege(r#>>'{}','public.list_jjinfan_challenge_campaigns(uuid,uuid)','execute') or has_table_privilege(r#>>'{}','public.jjinfan_challenge_campaigns','select') then raise exception 'public grant for %',r; end if;
 end loop;
 if has_table_privilege('service_role','public.jjinfan_challenge_campaigns','select') then raise exception 'service role reads the table directly'; end if;
end $$;
