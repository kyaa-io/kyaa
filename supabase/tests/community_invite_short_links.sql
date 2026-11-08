-- 261107-2 E3 checks for 20261216032000 (applied). One transaction, rolled back.
begin;
do $$
declare fan uuid; page uuid; a jsonb; b jsonb; c jsonb; r jsonb; code text;
begin
  select u.id into fan from public.app_users u where u.status = 'active' order by u.created_at limit 1;
  select id into page from public.group_pages limit 1;
  a := public.create_community_invite_short_link(fan, '/pages/groups/' || page);
  b := public.create_community_invite_short_link(fan, '/pages/groups/' || page);
  c := public.create_community_invite_short_link(fan, '/');
  select ic.code into code from public.community_stamp_invite_codes ic where ic.app_user_id = fan;
  raise notice 'slug % (again %), home %, length %', a ->> 'slug', b ->> 'slug', c ->> 'slug', length(a ->> 'slug');
  if a ->> 'slug' <> b ->> 'slug' or a ->> 'slug' = c ->> 'slug' or length(a ->> 'slug') <> 7 then raise exception 'one address per destination failed'; end if;
  r := public.resolve_community_invite_short_link(a ->> 'slug');
  if r ->> 'code' <> code or r ->> 'destination' <> '/pages/groups/' || page then raise exception 'resolve failed %', r; end if;
  begin perform public.create_community_invite_short_link(fan, 'https://evil.example/'); raise exception 'outside destination accepted';
  exception when sqlstate '22023' then null; end;
  begin perform public.create_community_invite_short_link(fan, '/my/invitations?code=x'); raise exception 'query destination accepted';
  exception when sqlstate '22023' then null; end;
  -- revoked: no longer resolves; the owner gets a fresh address for the same destination
  update public.community_invite_short_links set revoked_at = now() where slug = a ->> 'slug';
  begin perform public.resolve_community_invite_short_link(a ->> 'slug'); raise exception 'revoked address resolved';
  exception when sqlstate 'P0002' then null; end;
  b := public.create_community_invite_short_link(fan, '/pages/groups/' || page);
  if b ->> 'slug' = a ->> 'slug' then raise exception 'revoked address reused'; end if;
  -- inactive inviter: like the code, the address stops resolving
  update public.app_users set status = 'disabled' where id = fan;
  begin perform public.resolve_community_invite_short_link(b ->> 'slug'); raise exception 'inactive inviter resolved';
  exception when sqlstate 'P0002' then null; end;
  begin perform public.resolve_community_invite_short_link('ABCDEFG'); raise exception 'bad slug resolved';
  exception when sqlstate 'P0002' then null; end;
  if has_function_privilege('anon', 'public.resolve_community_invite_short_link(text)', 'execute') or has_function_privilege('authenticated', 'public.create_community_invite_short_link(uuid,text)', 'execute')
    then raise exception 'public roles can call the functions'; end if;
  raise notice 'RESULT invite short link checks passed';
end $$;
rollback;
