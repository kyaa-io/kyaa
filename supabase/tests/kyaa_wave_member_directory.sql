-- Synthetic participants only; never run on a hosted database.
do $$begin
 if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'Disposable local database required';end if;
end$$;
begin;
create or replace function pg_temp.expect_member_error(statement text,expected text) returns void language plpgsql as $$
begin
 begin execute statement;exception when others then if sqlerrm=expected then return;else raise;end if;end;
 raise exception 'Expected member directory error %',expected;
end$$;
insert into public.app_users(id,privy_user_id,verified_email)
select ('a7d39100-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'did:privy:wave-member-'||i,'wave-member-'||i||'@example.test' from generate_series(1,62)i;
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role)
values('a7d39100-0000-4000-8000-000000000090','kyaa-wave-fanpage','published','/wave-test.webp',now(),'{brand}','brand');
insert into public.kyaa_wave_participants(app_user_id,name_encrypted,name_fingerprint)
select ('a7d39100-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'v1.'||repeat('a',16)||'.'||repeat('b',22)||'.fixture',md5('wave-member:'||i)||md5('wave-member:'||i) from generate_series(1,61)i;
insert into public.user_profiles(app_user_id,nickname,nickname_normalized)values('a7d39100-0000-4000-8000-000000000007','ProfileSeven','profileseven');
insert into public.user_blocks(app_user_id,blocked_app_user_id)values
 ('a7d39100-0000-4000-8000-000000000001','a7d39100-0000-4000-8000-000000000002'),
 ('a7d39100-0000-4000-8000-000000000003','a7d39100-0000-4000-8000-000000000001');
update public.app_users set status='disabled'where id='a7d39100-0000-4000-8000-000000000004';
insert into public.admin_allowlist(id,email,role)values('a7d39100-0000-4000-8000-000000000091','wave-member-admin@example.test','admin');
insert into public.content_reports(id,app_user_id,celebrity_id,target_type,target_id,target_revision,target_app_user_id,reason,idempotency_key)
values('a7d39100-0000-4000-8000-000000000092','a7d39100-0000-4000-8000-000000000001','a7d39100-0000-4000-8000-000000000090','fan_post',extensions.gen_random_uuid(),1,'a7d39100-0000-4000-8000-000000000005','Synthetic moderation report',extensions.gen_random_uuid());
insert into public.app_user_moderation_restrictions(app_user_id,report_id,reason,actor_admin_id)
values('a7d39100-0000-4000-8000-000000000005','a7d39100-0000-4000-8000-000000000092','Synthetic restriction for ACL','a7d39100-0000-4000-8000-000000000091');
do $$declare
 owner uuid:='a7d39100-0000-4000-8000-000000000001';signature text:='public.read_owned_kyaa_wave_members(uuid,public.content_locale,uuid)';
 first_page jsonb;second_page jsonb;invalid_cursor uuid;i integer;
begin
 assert not has_function_privilege('anon',signature,'EXECUTE')and not has_function_privilege('authenticated',signature,'EXECUTE'),'client role cannot choose an owner';
 assert has_function_privilege('service_role',signature,'EXECUTE'),'server grant';
 assert(select prosecdef from pg_proc where oid=signature::regprocedure),'security definer';
 first_page:=public.read_owned_kyaa_wave_members(owner,'ko');
 assert jsonb_array_length(first_page->'members')=50,'bounded first page';
 assert first_page->>'nextCursor'='a7d39100-0000-4000-8000-000000000055','cursor is last displayed profile';
 assert first_page->'members'->0->>'profileId'='a7d39100-0000-4000-8000-000000000006','self/blocks/disabled/moderated excluded';
 assert first_page->'members'->0->>'nickname'='팬','participants without profile are included';
 assert first_page->'members'->1->>'nickname'='ProfileSeven','existing nickname projection input';
 assert not first_page::text like '%@example.test%'and not first_page::text like '%v1.%'and not first_page::text like '%nameEncrypted%','no contact or ciphertext';
 assert(select count(*)from jsonb_object_keys(first_page))=2,'only page contract';
 assert not exists(select 1 from jsonb_array_elements(first_page->'members')m where(select count(*)from jsonb_object_keys(m))<>3),'only public identity fields';
 second_page:=public.read_owned_kyaa_wave_members(owner,'en',(first_page->>'nextCursor')::uuid);
 assert jsonb_array_length(second_page->'members')=6 and second_page->'nextCursor'='null'::jsonb,'last page';
 assert second_page->'members'->0->>'nickname'='Fan','content locale fallback';
 assert not exists(select 1 from jsonb_array_elements(first_page->'members')a join jsonb_array_elements(second_page->'members')b on a->>'profileId'=b->>'profileId'),'no duplicate pages';
 foreach i in array array[1,2,3,4,5,62,99]loop
  invalid_cursor:=('a7d39100-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
  perform pg_temp.expect_member_error(format('select public.read_owned_kyaa_wave_members(%L,''ko'',%L)',owner,invalid_cursor),'SOCIAL_NOT_FOUND');
 end loop;
 perform pg_temp.expect_member_error(format('select public.read_owned_kyaa_wave_members(%L,null)',owner),'FAN_WEB_INVALID_INPUT');
 perform pg_temp.expect_member_error('select public.read_owned_kyaa_wave_members(''a7d39100-0000-4000-8000-000000000062'',''ko'')','FAN_WEB_FORBIDDEN');
 perform pg_temp.expect_member_error('select public.read_owned_kyaa_wave_members(''a7d39100-0000-4000-8000-000000000004'',''ko'')','FAN_WEB_ACTIVE_ACCOUNT_REQUIRED');
 perform pg_temp.expect_member_error('select public.read_owned_kyaa_wave_members(''a7d39100-0000-4000-8000-000000000005'',''ko'')','FAN_WEB_ACTIVE_ACCOUNT_REQUIRED');
 update public.app_user_moderation_restrictions set revoked_at=now()where app_user_id='a7d39100-0000-4000-8000-000000000005';
 assert public.read_owned_kyaa_wave_members(owner,'ko')->'members'->0->>'profileId'='a7d39100-0000-4000-8000-000000000005','revoked restrictions do not hide participants';
 update public.celebrities set status='draft'where slug='kyaa-wave-fanpage';
 perform pg_temp.expect_member_error(format('select public.read_owned_kyaa_wave_members(%L,''ko'')',owner),'FAN_WEB_FORBIDDEN');
end$$;
rollback;
-- An archived fixture tests the read boundary without changing lifecycle guards.
begin;
insert into public.app_users(id,privy_user_id,verified_email)values('a7d39100-0000-4000-8000-000000000001','did:privy:wave-archived-member','wave-archived-member@example.test');
insert into public.admin_allowlist(id,email,role)values('a7d39100-0000-4000-8000-000000000091','wave-archived-admin@example.test','admin');
insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role,archived_at,archived_by_admin_allowlist_id,archive_reason)
values('a7d39100-0000-4000-8000-000000000090','kyaa-wave-fanpage','published','/wave-test.webp',now(),'{brand}','brand',now(),'a7d39100-0000-4000-8000-000000000091','Synthetic archived read boundary');
insert into public.kyaa_wave_participants(app_user_id,name_encrypted,name_fingerprint)
values('a7d39100-0000-4000-8000-000000000001','v1.'||repeat('a',16)||'.'||repeat('b',22)||'.fixture',repeat('a',64));
do $$begin
 begin
  perform public.read_owned_kyaa_wave_members('a7d39100-0000-4000-8000-000000000001','ko');
  raise exception 'ARCHIVED_MEMBER_DIRECTORY_LEAKED';
 exception when others then if sqlerrm<>'FAN_WEB_FORBIDDEN'then raise;end if;end;
end$$;
rollback;
\echo 'WAVE_MEMBER_DIRECTORY_PASS roles, eligibility, blocked/moderated exclusions, profile-less participants, private fields and keyset pagination'
