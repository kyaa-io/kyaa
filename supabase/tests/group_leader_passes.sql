-- Local disposable-database contract test for 방 링크 and 방장 패스. All fixtures are rolled back.
-- Run as the migration owner: PGOPTIONS='-c role=byus_admin' psql -X -v ON_ERROR_STOP=1 -d <db> -f supabase/tests/group_leader_passes.sql
begin;

do $$
declare
 admin_user uuid := pg_catalog.gen_random_uuid();
 admin_row uuid;
 leader uuid := pg_catalog.gen_random_uuid();
 other uuid := pg_catalog.gen_random_uuid();
 h1 text := repeat('a',64); h2 text := repeat('b',64); h3 text := repeat('c',64); h4 text := repeat('d',64);
 req1 uuid := pg_catalog.gen_random_uuid(); req2 uuid := pg_catalog.gen_random_uuid();
 opened jsonb; replay jsonb; page uuid; failed text;
begin
 insert into public.app_users(id,privy_user_id,verified_email,preferred_locale) values
  (admin_user,'did:privy:t-admin-'||admin_user,'t-admin-'||admin_user||'@example.invalid','ko'),
  (leader,'did:privy:t-leader-'||leader,'t-leader-'||leader||'@example.invalid','ko'),
  (other,'did:privy:t-other-'||other,'t-other-'||other||'@example.invalid','ko');
 insert into public.admin_allowlist(email,role) values ('t-admin-'||admin_user||'@example.invalid','admin') returning id into admin_row;

 -- 발급: 라벨·기간·해시 형식 검사, 일반 회원은 발급 못 함
 perform public.group_leader_pass_issue(admin_user,admin_row,'오픈채팅 시험방',7,h1);
 begin perform public.group_leader_pass_issue(leader,admin_row,'x',7,h2); failed:='none'; exception when others then failed:=sqlerrm; end;
 if failed<>'GROUPS_FORBIDDEN' then raise exception 'non-admin issue must be forbidden, got %',failed; end if;
 begin perform public.group_leader_pass_issue(admin_user,admin_row,'x',31,h2); failed:='none'; exception when others then failed:=sqlerrm; end;
 if failed<>'GROUPS_INVALID_REQUEST' then raise exception 'days over 30 must be invalid, got %',failed; end if;
 begin perform public.group_leader_pass_issue(admin_user,admin_row,'x',7,'not-a-hash'); failed:='none'; exception when others then failed:=sqlerrm; end;
 if failed<>'GROUPS_INVALID_REQUEST' then raise exception 'bad hash must be invalid, got %',failed; end if;

 -- 확인: 쓸 수 있으면 valid, 모르는 해시는 valid=false(이유는 알리지 않음)
 if not (public.group_leader_pass_check(leader,h1)->>'valid')::boolean then raise exception 'fresh pass must be valid'; end if;
 if (public.group_leader_pass_check(leader,h4)->>'valid')::boolean then raise exception 'unknown pass must be invalid'; end if;

 -- 열기: 신청이 즉시 승인되고 방장이 소유자가 되며 방 링크가 페이지로 간다
 opened:=public.group_application_submit_with_pass(leader,h1,jsonb_build_object('name','패스 시험 모임','description','','externalLinks',jsonb_build_array(jsonb_build_object('kind','kakao-openchat','url','https://open.kakao.com/o/abc')),'requestId',req1));
 page:=(opened->>'pageId')::uuid;
 if page is null then raise exception 'open must return a page id'; end if;
 if not exists(select 1 from public.group_pages where id=page and kind='hobby' and description='' and external_links->0->>'kind'='kakao-openchat') then raise exception 'page must carry the room link and an empty intro'; end if;
 if not exists(select 1 from public.group_memberships where page_id=page and app_user_id=leader and role='owner') then raise exception 'leader must own the page'; end if;
 if not exists(select 1 from public.group_applications where page_id=page and status='approved' and reason='leader-pass' and qualification is null) then raise exception 'application must be approved without an operating experience proof'; end if;

 -- 같은 요청의 재전송은 같은 모임, 쓴 패스는 더 이상 valid 아님
 replay:=public.group_application_submit_with_pass(leader,h1,jsonb_build_object('name','패스 시험 모임','requestId',req1));
 if replay->>'pageId'<>page::text then raise exception 'replay must return the same page'; end if;
 if (public.group_leader_pass_check(leader,h1)->>'valid')::boolean then raise exception 'used pass must be invalid'; end if;

 -- 재사용: 다른 요청·다른 사람 모두 거절, 모임은 하나뿐
 begin perform public.group_application_submit_with_pass(leader,h1,jsonb_build_object('name','두번째','requestId',req2)); failed:='none'; exception when others then failed:=sqlerrm; end;
 if failed<>'GROUPS_CONFLICT' then raise exception 'second use by the same user must conflict, got %',failed; end if;
 begin perform public.group_application_submit_with_pass(other,h1,jsonb_build_object('name','다른 사람','requestId',req2)); failed:='none'; exception when others then failed:=sqlerrm; end;
 if failed<>'GROUPS_CONFLICT' then raise exception 'use by another user must conflict, got %',failed; end if;
 if (select count(*) from public.group_applications where applicant_id in (leader,other))<>1 then raise exception 'a pass must open exactly one group'; end if;

 -- 취소와 만료
 perform public.group_leader_pass_issue(admin_user,admin_row,'취소할 패스',7,h2);
 perform public.group_leader_pass_revoke(admin_user,admin_row,(select id from public.group_leader_passes where token_hash=h2));
 begin perform public.group_application_submit_with_pass(other,h2,jsonb_build_object('name','취소됨','requestId',req2)); failed:='none'; exception when others then failed:=sqlerrm; end;
 if failed<>'GROUPS_CONFLICT' then raise exception 'revoked pass must conflict, got %',failed; end if;
 perform public.group_leader_pass_issue(admin_user,admin_row,'만료 패스',1,h3);
 update public.group_leader_passes set expires_at=now()-interval '1 minute' where token_hash=h3;
 begin perform public.group_application_submit_with_pass(other,h3,jsonb_build_object('name','만료됨','requestId',req2)); failed:='none'; exception when others then failed:=sqlerrm; end;
 if failed<>'GROUPS_CONFLICT' then raise exception 'expired pass must conflict, got %',failed; end if;
 if (public.group_leader_pass_check(other,h3)->>'valid')::boolean then raise exception 'expired pass must be invalid'; end if;

 -- 목록 상태, 원문 토큰 없음(해시만 저장)
 if (select jsonb_agg(i->>'status' order by array_position(array[h1,h2,h3],p.token_hash)) from jsonb_array_elements(public.group_leader_pass_list(admin_user,admin_row)->'items') i join public.group_leader_passes p on p.id=(i->>'id')::uuid where p.token_hash in (h1,h2,h3))<>'["used","revoked","expired"]'::jsonb then raise exception 'list statuses unexpected'; end if;
 if exists(select 1 from public.group_leader_passes where token_hash !~ '^[0-9a-f]{64}$') then raise exception 'only hashes may be stored'; end if;

 -- 방 링크 제약: 허용 밖 종류·http·4개는 표 자체가 거절
 begin update public.group_pages set external_links='[{"kind":"evil","url":"https://x.com/a"}]'::jsonb where id=page; failed:='none'; exception when check_violation then failed:='check'; end;
 if failed<>'check' then raise exception 'unknown room kind must violate the check'; end if;
 begin update public.group_pages set external_links='[{"kind":"x","url":"http://x.com/a"}]'::jsonb where id=page; failed:='none'; exception when check_violation then failed:='check'; end;
 if failed<>'check' then raise exception 'http room link must violate the check'; end if;
 begin update public.group_pages set external_links=(select jsonb_agg(jsonb_build_object('kind','x','url','https://x.com/'||g)) from generate_series(1,4) g) where id=page; failed:='none'; exception when check_violation then failed:='check'; end;
 if failed<>'check' then raise exception 'four room links must violate the check'; end if;

 -- 설정 저장: 소유자는 방 링크를 바꾸고 응답·상세 JSON에 반영된다
 perform public.groups_dispatch('settings',leader,page,null,jsonb_build_object('name','패스 시험 모임','description','','question',null,'anonymous',false,'externalLinks',jsonb_build_array(jsonb_build_object('kind','band','url','https://band.us/band/1')),'requestId',pg_catalog.gen_random_uuid()),null);
 if public.group_page_json(page)->'externalLinks'->0->>'kind'<>'band' then raise exception 'settings must replace the room links'; end if;
end $$;

rollback;
