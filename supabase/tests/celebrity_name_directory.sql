\set ON_ERROR_STOP on
do $$begin if current_database()<>'byus_clean' or inet_server_addr()is not null then raise exception 'Disposable local database required';end if;end$$;
begin;
do $$
declare iu uuid:=gen_random_uuid();ive uuid:=gen_random_uuid();same uuid:=gen_random_uuid();en_only uuid:=gen_random_uuid();star uuid:=gen_random_uuid();hidden uuid:=gen_random_uuid();res jsonb;bad text;
begin
 delete from public.celebrity_name_terms;delete from public.celebrity_name_entries;
 insert into public.celebrity_name_entries(id,source,source_id,name_ko,name_en,category,popularity)values
  (iu,'wikidata','Q1','아이유','IU','singer',90),(ive,'wikidata','Q2','아이브','IVE','idol',80),(same,'wikidata','Q3','아이유','IU','actor',1),(en_only,'musicbrainz','m4',null,'Aimer',null,0);
 insert into public.celebrity_name_terms values(iu,public.celebrity_name_key('아이유')),(iu,public.celebrity_name_key('IU')),(iu,public.celebrity_name_key('이지은')),(ive,public.celebrity_name_key('아이브')),(ive,public.celebrity_name_key('IVE')),(same,public.celebrity_name_key('아이유')),(en_only,public.celebrity_name_key('Aimer'));

 if public.celebrity_name_key(' I·U ')<>'iu' or public.celebrity_name_key('A%_b')<>'ab' or public.celebrity_name_key(normalize('아이유',NFD))<>'아이유' then raise exception 'key not normalized';end if;

 res:=public.celebrity_name_suggest('아이',8,'ko');
 if res#>>'{items,0,name}'<>'아이유' or res#>>'{items,0,secondaryName}'<>'IU' or res#>>'{items,0,category}'<>'singer' or res#>'{items,0,page}'<>'null'::jsonb then raise exception 'prefix order wrong: %',res;end if;
 if jsonb_array_length(res->'items')<>3 then raise exception 'same name in another category should stay separate: %',res;end if;
 if(public.celebrity_name_suggest('이지',8,'ko')#>>'{items,0,name}')<>'아이유' then raise exception 'alias not matched';end if;
 if(public.celebrity_name_suggest('iu',8,'en')#>>'{items,0,name}')<>'IU' or(public.celebrity_name_suggest('iu',8,'en')#>>'{items,0,secondaryName}')<>'아이유' then raise exception 'language order wrong';end if;
 if(public.celebrity_name_suggest('aim',8,'ko')#>>'{items,0,name}')<>'Aimer' or(public.celebrity_name_suggest('aim',8,'ko')#>>'{items,0,secondaryName}')is not null then raise exception 'english-only entry wrong';end if;
 if jsonb_array_length(public.celebrity_name_suggest('아이',1,'ko')->'items')<>1 or jsonb_array_length(public.celebrity_name_suggest('아이',0,'ko')->'items')<>1 then raise exception 'limit not bounded';end if;
 foreach bad in array array['','   ','%','_','%%%','!!!',null]loop
  if jsonb_array_length(public.celebrity_name_suggest(bad,8,'ko')->'items')<>0 then raise exception 'wildcard or blank listed rows: %',bad;end if;
 end loop;
 if jsonb_array_length(public.celebrity_name_suggest('아%',8,'ko')->'items')<>3 then raise exception 'percent must be ignored, not treated as a pattern';end if;
 if jsonb_array_length(public.celebrity_name_suggest('없는이름',8,'ko')->'items')<>0 then raise exception 'unknown name listed';end if;

 -- A published fan page comes first with its address and replaces the same dictionary name. Hidden and gated pages stay out.
 insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)values(star,'iu-page','published','/x.png',now(),array['artist']::public.celebrity_role[],'singer'),(hidden,'iu-hidden','published','/x.png',now(),array['artist']::public.celebrity_role[],'singer');
 insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt)values(star,'ko','아이유','소개','사진'),(star,'en','IU','Intro','Photo'),(hidden,'ko','아이유 숨김','소개','사진');
 insert into public.group_pages(id,kind,celebrity_id,name,description,status)values(star,'fan',star,'아이유','소개','published'),(hidden,'fan',hidden,'아이유 숨김','소개','hidden')
  on conflict(id) do update set status=excluded.status;
 res:=public.celebrity_name_suggest('아이',8,'ko');
 if res#>>'{items,0,page,slug}'<>'iu-page' or res#>>'{items,0,name}'<>'아이유' then raise exception 'published page not first: %',res;end if;
 if exists(select 1 from jsonb_array_elements(res->'items')x where x->>'name'='아이유 숨김')then raise exception 'hidden page listed: %',res;end if;
 if(select count(*)from jsonb_array_elements(res->'items')x where x->>'name'='아이유')<>1 then raise exception 'dictionary name repeats a published page: %',res;end if;

 begin
  insert into public.celebrity_name_entries(source,source_id,name_en,license)values('musicbrainz','nc','Tagged','CC-BY-NC-SA-3.0');raise exception 'non-CC0 row accepted';
 exception when check_violation then null;end;
 begin
  insert into public.celebrity_name_entries(source,source_id)values('wikidata','empty');raise exception 'nameless row accepted';
 exception when check_violation then null;end;
end$$;
do $$begin
 if has_table_privilege('service_role','public.celebrity_name_entries','SELECT')or has_table_privilege('anon','public.celebrity_name_terms','SELECT')or has_table_privilege('authenticated','public.celebrity_name_entries','INSERT')then raise exception 'dictionary table exposed';end if;
 if has_function_privilege('anon','public.celebrity_name_suggest(text,integer,text)','EXECUTE')or has_function_privilege('authenticated','public.celebrity_name_suggest(text,integer,text)','EXECUTE')then raise exception 'suggest exposed to client roles';end if;
 if not has_function_privilege('service_role','public.celebrity_name_suggest(text,integer,text)','EXECUTE')then raise exception 'service role cannot suggest';end if;
 if not(select relrowsecurity from pg_class where oid='public.celebrity_name_entries'::regclass)or not(select relrowsecurity from pg_class where oid='public.celebrity_name_terms'::regclass)then raise exception 'row security off';end if;
end$$;
rollback;
