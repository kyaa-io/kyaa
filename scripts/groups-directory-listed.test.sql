\set ON_ERROR_STOP on
-- group_pages.listed=false leaves a page out of the directory (recent, popular, today) and the creator ranking,
-- keeps it in the member's own lists and keeps it reachable by link. Runs in a transaction and rolls back.
begin;
do $$declare v_page uuid; v_creator uuid; v_slug text; v_member uuid; r jsonb;begin
 select g.id,g.celebrity_id,c.slug into v_page,v_creator,v_slug from public.group_pages g join public.celebrities c on c.id=g.celebrity_id
  where g.kind='fan' and g.listed and public.group_scope_visible(null,g.id) order by g.created_at limit 1;
 if v_page is null then raise exception 'LISTED_TEST_NO_PAGE';end if;
 select m.app_user_id into v_member from public.group_memberships m join public.app_users u on u.id=m.app_user_id and u.status='active' where m.page_id=v_page limit 1;
 r:=public.groups_dispatch('directory',p_input=>'{"sort":"recent","limit":50}');
 if not exists(select 1 from jsonb_array_elements(r->'items') i where (i->>'id')::uuid=v_page) then raise exception 'LISTED_TEST_BASELINE_MISSING';end if;
 update public.group_pages set listed=false where id=v_page;
 foreach v_slug in array array['recent','popular','today'] loop
  r:=public.groups_dispatch('directory',p_input=>jsonb_build_object('sort',v_slug,'limit',50));
  if exists(select 1 from jsonb_array_elements(r->'items') i where (i->>'id')::uuid=v_page) then raise exception 'LISTED_TEST_STILL_IN_DIRECTORY %',v_slug;end if;
  if (r->>'totalCount')::int<>(select count(*) from jsonb_array_elements(r->'items')) and v_slug<>'popular' and (r->>'nextCursor') is null then raise exception 'LISTED_TEST_COUNT %',v_slug;end if;
 end loop;
 if public.creator_listed(v_creator) then raise exception 'LISTED_TEST_CREATOR_LISTED';end if;
 r:=public.read_creator_ranking('all');
 if exists(select 1 from jsonb_array_elements(r->'rows') x where (x->>'subjectId')::uuid=v_creator) then raise exception 'LISTED_TEST_IN_RANKING';end if;
 if exists(select 1 from public.ranking_scores('creator_hearts',null,'-infinity','infinity') s where s.subject_id=v_creator) then raise exception 'LISTED_TEST_IN_SCORES';end if;
 if v_member is not null then
  r:=public.groups_dispatch('directory',p_actor=>v_member,p_input=>'{"mine":"joined","limit":50}');
  if not exists(select 1 from jsonb_array_elements(r->'items') i where (i->>'id')::uuid=v_page) then raise exception 'LISTED_TEST_MISSING_FROM_JOINED';end if;
 end if;
 if not public.group_scope_visible(null,v_page) then raise exception 'LISTED_TEST_LINK_CLOSED';end if;
end $$;
rollback;
\echo groups-directory-listed ok
