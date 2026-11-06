-- Every published creator reaches the directory by itself, and the existing visibility rules still decide who sees it.
-- Statements commit one by one on purpose: page creation runs when the publishing transaction commits.
insert into public.app_users(id,privy_user_id,verified_email) values
 ('fa110000-0000-4000-8000-000000000001','did:privy:dirsync-fan','dirsync-fan@example.test'),
 ('fa110000-0000-4000-8000-000000000002','did:privy:dirsync-wave','dirsync-wave@example.test');
insert into public.admin_allowlist(id,email,role) values('fa110000-0000-4000-8000-000000000003','dirsync-admin@example.test','admin');
insert into public.group_pages(id,kind,name) values('fa120000-0000-4000-8000-000000000001','hobby','Dirsync hobby');

-- A draft creator has no page.
insert into public.celebrities(id,slug,status,image_url,roles,primary_role) values('fa100000-0000-4000-8000-000000000001','dirsync-fan-a','draft','/images/dirsync-a.jpg','{creator}','singer');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values
 ('fa100000-0000-4000-8000-000000000001','ko','디어싱크','디어싱크 소개','디어싱크 사진'),
 ('fa100000-0000-4000-8000-000000000001','en','Dirsync','About Dirsync','Dirsync photo');
do $$ begin
 if exists(select 1 from public.group_pages where celebrity_id='fa100000-0000-4000-8000-000000000001') then raise exception 'draft creator got a page'; end if;
end $$;

-- Publishing creates the page with the same shape as the original backfill.
update public.celebrities set status='published' where id='fa100000-0000-4000-8000-000000000001';
do $$ declare g public.group_pages%rowtype; n integer; begin
 select * into g from public.group_pages where celebrity_id='fa100000-0000-4000-8000-000000000001';
 if not found then raise exception 'published creator has no page'; end if;
 if g.id<>'fa100000-0000-4000-8000-000000000001' or g.kind<>'fan' or g.name<>'디어싱크' or g.description<>'디어싱크 소개' or g.image_url<>'/images/dirsync-a.jpg' or g.status<>'published' or g.anonymous then raise exception 'unexpected page shape %',to_jsonb(g); end if;
 select count(*) into n from public.group_rooms where page_id=g.id and default_key is not null;
 if n<>3 then raise exception 'default rooms missing: %',n; end if;
end $$;

-- Localizations written after the creator row in the same transaction still name the page; brands stay brands.
begin;
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values('fa100000-0000-4000-8000-000000000002','dirsync-brand-b','published','/images/dirsync-b.jpg',now(),'{brand}','brand');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values
 ('fa100000-0000-4000-8000-000000000002','ko','브랜드 비','브랜드 소개','브랜드 사진'),
 ('fa100000-0000-4000-8000-000000000002','en','Brand B','About Brand B','Brand photo');
commit;
do $$ declare g public.group_pages%rowtype; begin
 select * into g from public.group_pages where celebrity_id='fa100000-0000-4000-8000-000000000002';
 if not found or g.kind<>'brand' or g.name<>'브랜드 비' then raise exception 'brand page wrong %',to_jsonb(g); end if;
end $$;

-- An archived row never gets a page.
begin;
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role,archived_at,archived_by_admin_allowlist_id,archive_reason) values('fa100000-0000-4000-8000-000000000003','dirsync-archived-c','published','/images/dirsync-c.jpg',now(),'{creator}','creator',now(),'fa110000-0000-4000-8000-000000000003','dirsync archived fixture');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values
 ('fa100000-0000-4000-8000-000000000003','ko','보관','보관 소개','보관 사진'),
 ('fa100000-0000-4000-8000-000000000003','en','Archived','About archived','Archived photo');
commit;
do $$ begin
 if exists(select 1 from public.group_pages where celebrity_id='fa100000-0000-4000-8000-000000000003') then raise exception 'archived creator got a page'; end if;
end $$;

-- Directory filters: the all tab holds every kind, fan and nonfan stay exclusive, search follows the language.
do $$ declare r jsonb; names text[]; begin
 r:=public.groups_dispatch('directory',p_input=>'{"type":"all","sort":"recent","limit":50}');
 select array_agg(x->>'name') into names from jsonb_array_elements(r->'items') x;
 if not names @> array['디어싱크','브랜드 비','Dirsync hobby'] then raise exception 'all tab misses a kind: %',names; end if;
 if names && array['보관'] then raise exception 'archived page listed: %',names; end if;
 r:=public.groups_dispatch('directory',p_input=>'{"type":"fan","sort":"recent","limit":50}');
 select array_agg(x->>'name') into names from jsonb_array_elements(r->'items') x;
 if not names @> array['디어싱크'] or names && array['브랜드 비','Dirsync hobby'] then raise exception 'fan tab wrong: %',names; end if;
 r:=public.groups_dispatch('directory',p_input=>'{"type":"nonfan","sort":"recent","limit":50}');
 select array_agg(x->>'name') into names from jsonb_array_elements(r->'items') x;
 if names @> array['디어싱크'] or not names @> array['브랜드 비','Dirsync hobby'] then raise exception 'nonfan filter wrong: %',names; end if;
 r:=public.groups_dispatch('directory',p_input=>'{"search":"디어싱크","locale":"ko","limit":50}');
 if (r->>'totalCount')::int<>1 or r->'items'->0->>'name'<>'디어싱크' then raise exception 'ko search wrong: %',r; end if;
 r:=public.groups_dispatch('directory',p_input=>'{"search":"Dirsync","type":"fan","locale":"en","limit":50}');
 if (r->>'totalCount')::int<>1 or r->'items'->0->>'name'<>'Dirsync' then raise exception 'en search wrong: %',r; end if;
 r:=public.groups_dispatch('resolve',p_input=>'{"slug":"dirsync-fan-a"}');
 if coalesce(r->>'id',r->'page'->>'id')<>'fa100000-0000-4000-8000-000000000001' then raise exception 'resolve wrong: %',r; end if;
end $$;

-- A page an operator hid stays hidden when its creator is published again; unpublishing removes it from the list.
update public.group_pages set status='hidden' where id='fa100000-0000-4000-8000-000000000001';
update public.celebrities set status='draft' where id='fa100000-0000-4000-8000-000000000001';
update public.celebrities set status='published' where id='fa100000-0000-4000-8000-000000000001';
do $$ declare r jsonb; begin
 if (select status from public.group_pages where id='fa100000-0000-4000-8000-000000000001')<>'hidden' then raise exception 'republishing revealed a hidden page'; end if;
 r:=public.groups_dispatch('directory',p_input=>'{"search":"디어싱크","limit":50}');
 if (r->>'totalCount')::int<>0 then raise exception 'hidden page listed: %',r; end if;
end $$;
update public.group_pages set status='published' where id='fa100000-0000-4000-8000-000000000001';
update public.celebrities set status='draft' where id='fa100000-0000-4000-8000-000000000001';
do $$ declare r jsonb; begin
 r:=public.groups_dispatch('directory',p_input=>'{"search":"디어싱크","limit":50}');
 if (r->>'totalCount')::int<>0 then raise exception 'draft creator listed: %',r; end if;
end $$;

-- The event page stays limited to checked-in members, whoever published it.
begin;
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values('fa100000-0000-4000-8000-000000000004','kyaa-wave-fanpage','published','/images/dirsync-w.jpg',now(),'{brand}','brand');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values
 ('fa100000-0000-4000-8000-000000000004','ko','Dirsync Wave','행사','행사 사진'),
 ('fa100000-0000-4000-8000-000000000004','en','Dirsync Wave','Event','Event photo');
commit;
do $$ declare r jsonb; begin
 if not exists(select 1 from public.group_pages where celebrity_id='fa100000-0000-4000-8000-000000000004') then raise exception 'event page not created'; end if;
 r:=public.groups_dispatch('directory',p_input=>'{"search":"Dirsync Wave","limit":50}');
 if (r->>'totalCount')::int<>0 then raise exception 'event page visible to guests: %',r; end if;
 r:=public.groups_dispatch('directory','fa110000-0000-4000-8000-000000000001',p_input=>'{"search":"Dirsync Wave","limit":50}');
 if (r->>'totalCount')::int<>0 then raise exception 'event page visible to a member who did not check in: %',r; end if;
end $$;
insert into public.kyaa_wave_participants(app_user_id,name_encrypted,name_fingerprint) values('fa110000-0000-4000-8000-000000000002','v1.AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAA.AAAA',md5('dirsync')||md5('dirsync'));
do $$ declare r jsonb; begin
 r:=public.groups_dispatch('directory','fa110000-0000-4000-8000-000000000002',p_input=>'{"search":"Dirsync Wave","limit":50}');
 if (r->>'totalCount')::int<>1 then raise exception 'event page missing for a checked-in member: %',r; end if;
end $$;

-- New functions are internal only.
do $$ declare fn regprocedure; role_name text; begin
 fn:=to_regprocedure('public.group_page_ensure_for_celebrity(uuid)');
 if fn is null then raise exception 'ensure function missing'; end if;
 foreach role_name in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(role_name,fn,'EXECUTE') then raise exception '% can run the ensure function',role_name; end if;
 end loop;
end $$;

-- A summary written by SQL may end in spaces. Its own check measures it trimmed, the page check does not, so publishing must trim.
insert into public.celebrities(id,slug,status,image_url,roles,primary_role) values
 ('fa100000-0000-4000-8000-000000000041','dirsync-trim-long','draft','/images/dirsync-trim.jpg','{creator}','singer'),
 ('fa100000-0000-4000-8000-000000000042','dirsync-trim-short','draft','/images/dirsync-trim.jpg','{creator}','singer');
insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values
 ('fa100000-0000-4000-8000-000000000041','ko','긴 소개',repeat('가',1000)||'  ','사진'),
 ('fa100000-0000-4000-8000-000000000041','en','Long','About','Photo'),
 ('fa100000-0000-4000-8000-000000000042','ko','짧은 소개','  앞뒤 공백 소개  ','사진'),
 ('fa100000-0000-4000-8000-000000000042','en','Short','About','Photo');
update public.celebrities set status='published' where id in ('fa100000-0000-4000-8000-000000000041','fa100000-0000-4000-8000-000000000042');
do $$ begin
 if (select description from public.group_pages where celebrity_id='fa100000-0000-4000-8000-000000000041') is distinct from repeat('가',1000) then raise exception 'long summary page is wrong'; end if;
 if (select description from public.group_pages where celebrity_id='fa100000-0000-4000-8000-000000000042') is distinct from '앞뒤 공백 소개' then raise exception 'short summary page is wrong'; end if;
 if (select summary from public.celebrity_localizations where celebrity_id='fa100000-0000-4000-8000-000000000041' and locale='ko') is distinct from repeat('가',1000)||'  ' then raise exception 'the source summary must stay as written'; end if;
end $$;
