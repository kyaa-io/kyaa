-- Synthetic-only; execute solely in an isolated cluster after the migrations.
insert into public.app_users(id,privy_user_id,verified_email,status) values
 ('20000000-0000-4000-8000-000000000011','did:privy:stats-owner','stats-owner@example.test','active'),
 ('20000000-0000-4000-8000-000000000012','did:privy:stats-member','stats-member@example.test','active'),
 ('20000000-0000-4000-8000-000000000013','did:privy:stats-disabled','stats-disabled@example.test','disabled');
insert into public.group_pages(id,kind,name) values ('00000000-0000-4000-8000-000000000011','hobby','stats-one');
insert into public.group_memberships(page_id,app_user_id,role,joined_at) values
 ('00000000-0000-4000-8000-000000000011','20000000-0000-4000-8000-000000000011','owner',now()),
 ('00000000-0000-4000-8000-000000000011','20000000-0000-4000-8000-000000000012','member',now()),
 ('00000000-0000-4000-8000-000000000011','20000000-0000-4000-8000-000000000013','member',now());
do $$declare r jsonb;begin
 r:=public.read_group_operator_stats('20000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000011',7);
 if (r->>'members')::int<>2 or (r->>'joinedInPeriod')::int<>2 then raise exception 'inactive account counted %',r;end if;
end $$;
