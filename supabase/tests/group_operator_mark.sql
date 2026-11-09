-- Synthetic data only. Run on a disposable/local migrated DB; everything rolls back.
begin;
do $$
declare
  p uuid := gen_random_uuid(); q uuid := gen_random_uuid();
  own uuid := gen_random_uuid(); mgr uuid := gen_random_uuid(); mem uuid := gen_random_uuid(); stray uuid := gen_random_uuid();
  post_o uuid := gen_random_uuid(); post_oa uuid := gen_random_uuid(); post_m uuid := gen_random_uuid(); post_f uuid := gen_random_uuid();
  c_o uuid := gen_random_uuid(); c_ma uuid := gen_random_uuid(); c_f uuid := gen_random_uuid();
  r jsonb; items jsonb;
begin
  insert into public.app_users(id, privy_user_id, verified_email) values
    (own, 'did:privy:opm-' || own, own || '@example.test'), (mgr, 'did:privy:opm-' || mgr, mgr || '@example.test'),
    (mem, 'did:privy:opm-' || mem, mem || '@example.test'), (stray, 'did:privy:opm-' || stray, stray || '@example.test');
  insert into public.group_pages(id, kind, name) values (p, 'hobby', 'operator mark page'), (q, 'hobby', 'other page');
  insert into public.group_memberships(page_id, app_user_id, role) values (p, own, 'owner'), (p, mgr, 'manager'), (p, mem, 'member'), (q, mem, 'owner');
  -- stray is owner of the OTHER page only: the role is per page
  insert into public.group_memberships(page_id, app_user_id, role) values (q, stray, 'manager');
  insert into public.group_posts(id, page_id, author_id, title, body, visibility, anonymous) values
    (post_o, p, own, 'owner post', 'b', 'public', false), (post_oa, p, own, 'owner anonymous', 'b', 'public', true),
    (post_m, p, mgr, 'manager post', 'b', 'public', false), (post_f, p, mem, 'member post', 'b', 'public', false);
  insert into public.group_comments(id, post_id, author_id, body, anonymous) values
    (c_o, post_f, own, 'owner comment', false), (c_ma, post_f, mgr, 'manager anonymous comment', true), (c_f, post_f, mem, 'member comment', false);

  -- helper: item list in, same order and fields out, operator added
  items := jsonb_build_array(
    jsonb_build_object('id', 1, 'profileId', own, 'anonymous', false),
    jsonb_build_object('id', 2, 'profileId', own, 'anonymous', true),
    jsonb_build_object('id', 3, 'profileId', mgr, 'anonymous', false),
    jsonb_build_object('id', 4, 'profileId', mem, 'anonymous', false),
    jsonb_build_object('id', 5, 'profileId', null, 'anonymous', true),
    jsonb_build_object('id', 6, 'profileId', stray, 'anonymous', false),
    jsonb_build_object('id', 7, 'profileId', 'not-a-uuid', 'anonymous', false));
  r := public.group_operator_mark_items(p, items);
  if jsonb_array_length(r) <> 7 then raise exception 'item count changed'; end if;
  if (r->0->>'operator')::boolean is not true then raise exception 'owner must be marked'; end if;
  if (r->1->>'operator')::boolean is not false then raise exception 'anonymous owner must not be marked'; end if;
  if (r->2->>'operator')::boolean is not true then raise exception 'manager must be marked'; end if;
  if (r->3->>'operator')::boolean is not false then raise exception 'member must not be marked'; end if;
  if (r->4->>'operator')::boolean is not false then raise exception 'null profile must not be marked'; end if;
  if (r->5->>'operator')::boolean is not false then raise exception 'operator of another page must not be marked'; end if;
  if (r->6->>'operator')::boolean is not false then raise exception 'malformed id must not be marked'; end if;
  if (r->0->>'id')<>'1' or (r->6->>'id')<>'7' then raise exception 'order changed'; end if;
  if public.group_operator_mark_items(p, '[]'::jsonb) <> '[]'::jsonb or public.group_operator_mark_items(p, null) <> '[]'::jsonb then raise exception 'empty list'; end if;
  if (public.group_operator_mark_items(q, items)->0->>'operator')::boolean is not false then raise exception 'role is per page'; end if;

  -- the dispatcher: a signed-out reader gets only the public flag
  r := public.groups_content_dispatch('posts', null, p, null, '{}'::jsonb);
  if not exists (select 1 from jsonb_array_elements(r->'items') i where i->>'id' = post_o::text and (i->>'operator')::boolean) then raise exception 'owner post not marked in list'; end if;
  if not exists (select 1 from jsonb_array_elements(r->'items') i where i->>'id' = post_m::text and (i->>'operator')::boolean) then raise exception 'manager post not marked in list'; end if;
  if exists (select 1 from jsonb_array_elements(r->'items') i where i->>'id' = post_oa::text and (i->>'operator')::boolean) then raise exception 'anonymous owner post marked in list'; end if;
  if exists (select 1 from jsonb_array_elements(r->'items') i where i->>'id' = post_f::text and (i->>'operator')::boolean) then raise exception 'member post marked in list'; end if;
  -- only the public yes/no is added: no membership detail rides along
  if exists (select 1 from jsonb_array_elements(r->'items') i, jsonb_object_keys(i) k where k in ('role','joinedAt','answer','membership','tier')) then raise exception 'membership detail leaked into a list row'; end if;
  if r->'nextCursor' is null then raise exception 'list shape: nextCursor lost'; end if;

  r := public.groups_content_dispatch('post-detail', null, p, post_o, '{}'::jsonb);
  if (r->>'operator')::boolean is not true or r->>'id' <> post_o::text then raise exception 'owner post detail not marked'; end if;
  r := public.groups_content_dispatch('post-detail', null, p, post_f, '{}'::jsonb);
  if (r->>'operator')::boolean is not false then raise exception 'member post detail marked'; end if;
  r := public.groups_content_dispatch('post-detail', null, p, post_oa, '{}'::jsonb);
  if (r->>'operator')::boolean is not false then raise exception 'anonymous owner detail marked'; end if;

  r := public.groups_content_dispatch('comments', null, p, post_f, '{}'::jsonb);
  if not exists (select 1 from jsonb_array_elements(r->'items') i where i->>'id' = c_o::text and (i->>'operator')::boolean) then raise exception 'owner comment not marked'; end if;
  if exists (select 1 from jsonb_array_elements(r->'items') i where i->>'id' = c_ma::text and (i->>'operator')::boolean) then raise exception 'anonymous manager comment marked'; end if;
  if exists (select 1 from jsonb_array_elements(r->'items') i where i->>'id' = c_f::text and (i->>'operator')::boolean) then raise exception 'member comment marked'; end if;
  -- the wrapper answers the same operations the same way, with a signed-in reader too
  r := public.groups_content_dispatch('comments', mem, p, post_f, '{}'::jsonb);
  if not exists (select 1 from jsonb_array_elements(r->'items') i where i->>'id' = c_o::text and (i->>'operator')::boolean) then raise exception 'owner comment not marked for a member'; end if;
  -- other operations are not touched
  r := public.groups_content_dispatch('presence', null, p, null, '{}'::jsonb);
  if r ? 'operator' then raise exception 'presence must not carry operator'; end if;
end $$;

-- privileges: the wrapper is for service_role only, the renamed function and the helper for nobody
do $$
begin
  if has_function_privilege('anon', 'public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)', 'execute') then raise exception 'wrapper must not be callable by anon/authenticated'; end if;
  if not has_function_privilege('service_role', 'public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)', 'execute') then raise exception 'service_role must run the wrapper'; end if;
  if has_function_privilege('service_role', 'public.groups_content_dispatch_before_operator_mark(text,uuid,uuid,uuid,jsonb,uuid)', 'execute')
    or has_function_privilege('anon', 'public.groups_content_dispatch_before_operator_mark(text,uuid,uuid,uuid,jsonb,uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.groups_content_dispatch_before_operator_mark(text,uuid,uuid,uuid,jsonb,uuid)', 'execute') then raise exception 'renamed dispatcher must be private'; end if;
  if has_function_privilege('anon', 'public.group_operator_mark_items(uuid,jsonb)', 'execute') or has_function_privilege('authenticated', 'public.group_operator_mark_items(uuid,jsonb)', 'execute')
    or has_function_privilege('service_role', 'public.group_operator_mark_items(uuid,jsonb)', 'execute') then raise exception 'helper must be private'; end if;
  -- the function owner can read what the helper reads
  if not has_table_privilege((select proowner from pg_proc where oid = 'public.group_operator_mark_items(uuid,jsonb)'::regprocedure), 'public.group_memberships', 'select') then raise exception 'owner lacks select on group_memberships'; end if;
  if not (select prosecdef from pg_proc where oid = 'public.group_operator_mark_items(uuid,jsonb)'::regprocedure) or not (select prosecdef from pg_proc where oid = 'public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure) then raise exception 'both must stay security definer'; end if;
end $$;
rollback;
