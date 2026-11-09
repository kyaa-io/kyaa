-- Group comments have no edit path, so there is no editedAt.
\set ON_ERROR_STOP on
do $$begin if current_database()<>'byus_clean'or inet_server_addr()is not null then raise exception 'Disposable Unixsocket byus_clean required';end if;end $$;
-- Synthetic data only. The first block rolls back; the last part runs the rollback file and applies the migration again.
begin;
do $$
declare
  p uuid := gen_random_uuid(); author uuid := gen_random_uuid(); reader uuid := gen_random_uuid();
  post_a uuid; post_b uuid; c uuid; r jsonb; t1 timestamptz;
  doc jsonb := '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"본문"}]}]}';
  doc2 jsonb := '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"본문","marks":[{"type":"bold"}]}]}]}';
begin
  insert into public.app_users(id, privy_user_id, verified_email) select x, 'did:privy:edt-' || x, x || '@example.test' from unnest(array[author, reader]) x;
  insert into public.group_pages(id, kind, name) values (p, 'hobby', 'edited page');
  insert into public.group_memberships(page_id, app_user_id, role) values (p, author, 'member'), (p, reader, 'member');

  -- a new post, with and without a rich document, is never marked (the create answer is untouched)
  r := public.groups_content_dispatch('post', author, p, null, jsonb_build_object('title', '제목', 'body', '본문', 'visibility', 'public', 'assetIds', '[]'::jsonb, 'requestId', gen_random_uuid()));
  post_a := (r->>'id')::uuid;
  r := public.groups_content_dispatch('post', author, p, null, jsonb_build_object('title', '제목2', 'body', '본문', 'visibility', 'public', 'assetIds', '[]'::jsonb, 'bodyDoc', doc, 'requestId', gen_random_uuid()));
  post_b := (r->>'id')::uuid;
  if (select edited_at from public.group_posts where id = post_b) is not null then raise exception 'creating a rich post must not mark it edited'; end if;

  -- list and detail carry editedAt null for an untouched post, in every shape the page reads
  r := public.groups_content_dispatch('posts', null, p, null, '{}'::jsonb);
  if jsonb_array_length(r->'items') <> 2 or exists (select 1 from jsonb_array_elements(r->'items') i where not i ? 'editedAt' or i->'editedAt' <> 'null'::jsonb) then raise exception 'list rows must carry editedAt null: %', r; end if;
  if not r ? 'nextCursor' then raise exception 'list shape: nextCursor lost'; end if;
  r := public.groups_content_dispatch('post-detail', reader, p, post_a, '{}'::jsonb);
  if r->'editedAt' <> 'null'::jsonb or r->>'id' <> post_a::text then raise exception 'detail must carry editedAt null: %', r; end if;
  -- viewing and a reader's detail read (which records a view) are not edits
  if (select edited_at from public.group_posts where id = post_a) is not null then raise exception 'a view must not mark edited'; end if;

  -- saving the same content again is not an edit
  r := public.groups_content_dispatch('post-edit', author, p, post_a, jsonb_build_object('title', '제목', 'body', '본문', 'visibility', 'public', 'requestId', gen_random_uuid()));
  if r->'editedAt' <> 'null'::jsonb then raise exception 'same content must not mark edited: %', r; end if;
  r := public.groups_content_dispatch('post-edit', author, p, post_b, jsonb_build_object('title', '제목2', 'body', '본문', 'visibility', 'public', 'bodyDoc', doc, 'requestId', gen_random_uuid()));
  if r->'editedAt' <> 'null'::jsonb then raise exception 'same rich content must not mark edited: %', r; end if;

  -- a real change is
  r := public.groups_content_dispatch('post-edit', author, p, post_a, jsonb_build_object('title', '제목', 'body', '고친 본문', 'visibility', 'public', 'requestId', gen_random_uuid()));
  if jsonb_typeof(r->'editedAt') <> 'string' then raise exception 'an edit must answer editedAt: %', r; end if;
  t1 := (select edited_at from public.group_posts where id = post_a);
  if t1 is null or t1 < now() - interval '1 minute' then raise exception 'edit time not recorded'; end if;
  r := public.groups_content_dispatch('post-detail', null, p, post_a, '{}'::jsonb);
  if r->>'editedAt' is null or (r->>'editedAt')::timestamptz <> t1 then raise exception 'detail must carry the stored edit time: %', r; end if;
  if not exists (select 1 from jsonb_array_elements(public.groups_content_dispatch('posts', null, p, null, '{}'::jsonb)->'items') i where i->>'id' = post_a::text and i->>'editedAt' is not null)
    or not exists (select 1 from jsonb_array_elements(public.groups_content_dispatch('posts', null, p, null, '{}'::jsonb)->'items') i where i->>'id' = post_b::text and i->'editedAt' = 'null'::jsonb) then raise exception 'list must mark only the edited post'; end if;
  -- changing only the rich document is an edit
  perform public.groups_content_dispatch('post-edit', author, p, post_b, jsonb_build_object('title', '제목2', 'body', '본문', 'visibility', 'public', 'bodyDoc', doc2, 'requestId', gen_random_uuid()));
  if (select edited_at from public.group_posts where id = post_b) is null then raise exception 'a document-only change must mark edited'; end if;
  -- nobody else can edit, and a refused edit leaves no mark
  begin
    perform public.groups_content_dispatch('post-edit', reader, p, post_a, jsonb_build_object('title', '남', 'body', '남의 수정', 'visibility', 'public', 'requestId', gen_random_uuid()));
    raise exception 'a stranger edit must be refused';
  exception when others then if sqlerrm not like '%GROUPS_FORBIDDEN%' then raise; end if; end;
  if (select edited_at from public.group_posts where id = post_a) <> t1 then raise exception 'a refused edit moved the edit time'; end if;

  -- comments have no edit path: their rows carry no editedAt
  c := gen_random_uuid();
  insert into public.group_comments(id, post_id, author_id, body, anonymous) values (c, post_a, reader, '댓글', false);
  r := public.groups_content_dispatch('comments', null, p, post_a, '{}'::jsonb);
  if jsonb_array_length(r->'items') <> 1 or r->'items'->0 ? 'editedAt' then raise exception 'comments must not carry editedAt: %', r; end if;
  -- other operations are untouched
  if public.groups_content_dispatch('presence', null, p, null, '{}'::jsonb) ? 'editedAt' then raise exception 'presence must not carry editedAt'; end if;
  -- the helper keeps order and tolerates rows that are not posts
  r := public.group_post_edited_items(jsonb_build_array(jsonb_build_object('id', post_b), jsonb_build_object('id', 'x'), jsonb_build_object('n', 1), jsonb_build_object('id', post_a)));
  if jsonb_array_length(r) <> 4 or r->0->>'id' <> post_b::text or r->3->>'id' <> post_a::text or r->1->'editedAt' <> 'null'::jsonb or r->2->'editedAt' <> 'null'::jsonb then raise exception 'helper order or tolerance: %', r; end if;
  if public.group_post_edited_items(null) <> '[]'::jsonb then raise exception 'empty list'; end if;
end $$;

-- privileges: the wrapper is for service_role only, the renamed function and the helper for nobody
do $$
begin
  if has_function_privilege('anon', 'public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)', 'execute') then raise exception 'wrapper must not be callable by anon/authenticated'; end if;
  if not has_function_privilege('service_role', 'public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)', 'execute') then raise exception 'service_role must run the wrapper'; end if;
  if has_function_privilege('service_role', 'public.groups_content_dispatch_before_edited_at(text,uuid,uuid,uuid,jsonb,uuid)', 'execute')
    or has_function_privilege('anon', 'public.groups_content_dispatch_before_edited_at(text,uuid,uuid,uuid,jsonb,uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.groups_content_dispatch_before_edited_at(text,uuid,uuid,uuid,jsonb,uuid)', 'execute') then raise exception 'renamed dispatcher must be private'; end if;
  if has_function_privilege('anon', 'public.group_post_edited_items(jsonb)', 'execute') or has_function_privilege('authenticated', 'public.group_post_edited_items(jsonb)', 'execute')
    or has_function_privilege('service_role', 'public.group_post_edited_items(jsonb)', 'execute') then raise exception 'helper must be private'; end if;
  -- the function owner can read and write what the wrapper and the helper use
  if not has_table_privilege((select proowner from pg_proc where oid = 'public.group_post_edited_items(jsonb)'::regprocedure), 'public.group_posts', 'select') then raise exception 'owner lacks select on group_posts'; end if;
  if not has_table_privilege((select proowner from pg_proc where oid = 'public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure), 'public.group_posts', 'update') then raise exception 'owner lacks update on group_posts'; end if;
  if not (select prosecdef from pg_proc where oid = 'public.group_post_edited_items(jsonb)'::regprocedure) or not (select prosecdef from pg_proc where oid = 'public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure) then raise exception 'both must stay security definer'; end if;
  -- no public, anon or authenticated column or table grant opened by the new column
  if has_column_privilege('anon', 'public.group_posts', 'edited_at', 'select') or has_column_privilege('authenticated', 'public.group_posts', 'edited_at', 'select') then raise exception 'edited_at must not be readable by anon/authenticated'; end if;
end $$;
rollback;

-- Rollback, then apply again: the chain must survive both directions.
\ir ../rollback/20261220080000_group_post_edited_at.sql
do $$
begin
  if to_regprocedure('public.groups_content_dispatch_before_edited_at(text,uuid,uuid,uuid,jsonb,uuid)') is not null or to_regprocedure('public.group_post_edited_items(jsonb)') is not null then raise exception 'rollback left functions behind'; end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'group_posts' and column_name = 'edited_at') then raise exception 'rollback left the column behind'; end if;
  if not has_function_privilege('service_role', 'public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)', 'execute') then raise exception 'rollback lost the service_role grant'; end if;
  if pg_get_functiondef('public.groups_content_dispatch(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure) like '%group_post_edited_items%' then raise exception 'rollback left the wrapper'; end if;
end $$;
\ir ../migrations/20261220080000_group_post_edited_at.sql
do $$
begin
  if to_regprocedure('public.group_post_edited_items(jsonb)') is null then raise exception 'migration did not apply again'; end if;
  if public.groups_content_dispatch('presence', null, gen_random_uuid(), null, '{}'::jsonb) is null and false then raise exception 'unreachable'; end if;
end $$;
