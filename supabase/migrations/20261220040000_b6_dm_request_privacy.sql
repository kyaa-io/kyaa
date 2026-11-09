begin;
-- B6 (2026-11-09 plan v4): message requests keep a decline private, and the other person's state never shows in an error code.
-- 1. A decline only stamps declined_at. The row stays pending, so every answer the sender gets is the same as before the decline.
--    The person who declined no longer sees the conversation (list, messages, profile, button, notifications). Rows that were
--    'rejected' before this file stay as they are (no data migration).
-- 2. The pair lock checks only the person acting. A counterpart who is disabled, sanctioned or blocked gets SOCIAL_BLOCKED, the
--    same code as a block. Blocking and unblocking go ahead whatever state the counterpart is in.
-- 3. Reactions need an accepted conversation, like messages.
-- 4. kyaa wave: the sender of a declined request cannot reopen it from the wave chat. The person who declined can, by writing.
-- 5. The daily request limit counts a request log, so taking over or re-asking in the same row does not drop earlier requests.
-- 6. The blocks list can return closed accounts (no name or picture), so a block on a deleted account can be removed.
-- Every patched function keeps its original as <name>_before_b6 (no grants) for supabase/rollback/20261220040000_b6_dm_request_privacy.sql.

alter table public.social_dm_conversations add column declined_at timestamptz;

create table public.social_dm_request_log(
 id uuid primary key default extensions.gen_random_uuid(),
 sender_id uuid not null references public.app_users(id) on delete cascade,
 conversation_id uuid not null references public.social_dm_conversations(id) on delete cascade,
 message_id uuid not null unique references public.social_dm_messages(id) on delete cascade,
 counted boolean not null,
 created_at timestamptz not null default clock_timestamp()
);
create index social_dm_request_log_sender on public.social_dm_request_log(sender_id,created_at) where counted;
alter table public.social_dm_request_log enable row level security;
alter table public.social_dm_request_log force row level security;
revoke all on table public.social_dm_request_log from public,anon,authenticated,service_role;

-- Last 24 hours of first messages, with the formula the limit used until now.
insert into public.social_dm_request_log(sender_id,conversation_id,message_id,counted,created_at)
select cv.requester_id,cv.id,fm.id,true,fm.created_at from public.social_dm_conversations cv
 join public.social_dm_messages fm on fm.conversation_id=cv.id and fm.sender_id=cv.requester_id and fm.request_id=cv.request_id
 where fm.created_at>now()-interval '24 hours'
on conflict(message_id) do nothing;

-- Same keys and order as fan_web_lock_active_user, without its checks: for the person who is not acting.
create function public.social_lock_user_quiet(p_app_user_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if public.group_wallet_enabled() then
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('group-wallet:campaign-barrier',0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('group-wallet:owner:'||p_app_user_id,0));
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fan-web-user:'||p_app_user_id::text,0));
end $$;

-- Both people locked lowest id first, as social_lock_pair does, but only the actor is checked.
create function public.social_lock_pair_actor(p_actor uuid,p_other uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_actor is null or p_other is null then raise exception 'FAN_WEB_ACTIVE_ACCOUNT_REQUIRED' using errcode='42501'; end if;
 if p_other<p_actor then perform public.social_lock_user_quiet(p_other); end if;
 perform public.fan_web_lock_active_user(p_actor);
 if p_other>p_actor then perform public.social_lock_user_quiet(p_other); end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('social-pair:'||least(p_actor,p_other)::text||':'||greatest(p_actor,p_other)::text,0));
end $$;

create function public.social_dm_counterpart_open(p_app_user_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.app_users u where u.id=p_app_user_id and u.status='active') and public.social_profile_is_public(p_app_user_id)
$$;

create function public.social_lock_pair_for(p_actor uuid,p_other uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.social_lock_pair_actor(p_actor,p_other);
 if not public.social_dm_counterpart_open(p_other) then raise exception 'SOCIAL_BLOCKED'; end if;
end $$;

-- The person who declined sees no conversation. The sender sees no change.
create function public.social_dm_hidden_for(p_viewer uuid,p_conversation public.social_dm_conversations)
returns boolean language sql immutable set search_path='' as $$
 select coalesce(p_conversation.declined_at is not null and p_conversation.requester_id<>p_viewer,false)
$$;

create function public.social_dm_request_count(p_sender uuid)
returns bigint language sql stable security definer set search_path='' as $$
 select count(*) from public.social_dm_request_log l where l.sender_id=p_sender and l.counted and l.created_at>now()-interval '24 hours'
$$;

revoke all on function public.social_lock_user_quiet(uuid),public.social_lock_pair_actor(uuid,uuid),public.social_dm_counterpart_open(uuid),
 public.social_lock_pair_for(uuid,uuid),public.social_dm_hidden_for(uuid,public.social_dm_conversations),public.social_dm_request_count(uuid)
 from public,anon,authenticated,service_role;

-- Blocks, including accounts that are gone. A closed account shows no name or picture.
create function public.read_owned_social_blocks_closed(p_app_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform public.fan_web_lock_active_user(p_app_user_id);
 return jsonb_build_object('profiles',coalesce((select jsonb_agg(jsonb_build_object(
   'profileId',b.blocked_app_user_id,
   'closed',u.id is null,
   'nickname',case when u.id is null then null else coalesce(p.nickname,'Fan') end,
   'avatarUrl',case when u.id is null then null else public.public_fan_avatar_url(u.id) end,
   'blockedAt',b.created_at) order by b.created_at desc,b.blocked_app_user_id)
  from public.user_blocks b
  left join public.app_users u on u.id=b.blocked_app_user_id and u.status='active'
  left join public.user_profiles p on p.app_user_id=u.id
  where b.app_user_id=p_app_user_id),'[]'::jsonb));
end $$;
revoke all on function public.read_owned_social_blocks_closed(uuid) from public,anon,authenticated;
grant execute on function public.read_owned_social_blocks_closed(uuid) to service_role;

-- Owner access for the tables and helpers B6 adds (pattern of group_public_directory_owner_access/check).
-- FORCE RLS binds an owner that is neither superuser nor BYPASSRLS, so such an owner gets its own permissive policy per command.
create function public.b6_owner_function_names() returns text[] language sql immutable set search_path='' as $$
 select array['request_social_dm','resolve_social_dm','send_social_dm_message','send_social_dm_message_before_groups_text','send_social_dm_message_before_groups_media',
  'react_social_dm_message','block_social_profile','unblock_social_profile','read_owned_dm_conversations','read_social_dm_messages',
  'read_kyaa_wave_friend_messages','send_kyaa_wave_friend_message','assert_kyaa_wave_dm_pair','read_social_fan_profile','social_dm_request_state',
  'mobile_social_notification_path','evaluate_owned_kyaa_wave_missions','reconcile_wave_mission_evidence','read_admin_wave_stage_presentation',
  'read_owned_social_blocks_closed','social_lock_pair_for','social_lock_pair_actor','social_dm_request_count']::text[]
$$;
create function public.b6_owner_tables() returns table(table_name text,cmds text[]) language sql immutable set search_path='' as $$
 values('social_dm_request_log',array['select','insert'])
$$;
create function public.b6_owner_functions() returns text[] language sql immutable set search_path='' as $$
 select array['public.social_lock_user_quiet(uuid)','public.social_lock_pair_actor(uuid,uuid)','public.social_lock_pair_for(uuid,uuid)',
  'public.social_dm_counterpart_open(uuid)','public.social_dm_hidden_for(uuid,public.social_dm_conversations)','public.social_dm_request_count(uuid)',
  'public.social_profile_is_public(uuid)','public.fan_web_lock_active_user(uuid)','public.group_wallet_enabled()','public.fan_web_blocked(uuid,uuid)']::text[]
$$;
create function public.b6_owner_roles() returns table(role_oid oid,rolname name,rolsuper boolean,rolbypassrls boolean) language sql stable set search_path='' as $$
 select distinct o.oid,o.rolname,o.rolsuper,o.rolbypassrls from pg_catalog.pg_proc f join pg_catalog.pg_roles o on o.oid=f.proowner
 where f.pronamespace='public'::regnamespace and f.proname=any(public.b6_owner_function_names())
$$;
create function public.b6_owner_access() returns void language plpgsql set search_path='' as $$
declare r record;t record;cmd text;f text;c pg_catalog.pg_class;
begin
 for r in select * from public.b6_owner_roles() where not rolsuper and rolname not in('anon','authenticated','service_role','public') loop
  for t in select * from public.b6_owner_tables() loop
   select * into c from pg_catalog.pg_class where oid=('public.'||t.table_name)::regclass;
   foreach cmd in array t.cmds loop
    -- BYPASSRLS skips policies, never privileges, so the grant always goes out.
    execute format('grant %s on table public.%I to %I',cmd,t.table_name,r.rolname);
    if not r.rolbypassrls and not exists(select 1 from pg_catalog.pg_policy p where p.polrelid=c.oid and r.role_oid=any(p.polroles) and p.polpermissive
     and p.polcmd in(case cmd when 'select' then 'r' when 'insert' then 'a' when 'delete' then 'd' when 'update' then 'w' end,'*')) then
     execute format('create policy %I on public.%I for %s to %I %s','b6_owner_'||r.rolname||'_'||cmd,t.table_name,cmd,r.rolname,
      case cmd when 'insert' then 'with check(true)' when 'update' then 'using(true) with check(true)' else 'using(true)' end);
    end if;
   end loop;
  end loop;
  foreach f in array public.b6_owner_functions() loop execute format('grant execute on function %s to %I',f,r.rolname); end loop;
 end loop;
end $$;
create function public.b6_owner_check() returns void language plpgsql stable set search_path='' as $$
declare r record;t record;cmd text;f text;c pg_catalog.pg_class;gaps text[]:='{}';
begin
 for r in select * from public.b6_owner_roles() loop
  continue when r.rolsuper;
  if r.rolname in('anon','authenticated','service_role','public') then gaps:=gaps||format('%s may not own these functions',r.rolname); continue; end if;
  for t in select * from public.b6_owner_tables() loop
   select * into c from pg_catalog.pg_class where oid=('public.'||t.table_name)::regclass;
   foreach cmd in array t.cmds loop
    if not pg_catalog.has_table_privilege(r.role_oid,c.oid,cmd) then gaps:=gaps||format('%s lacks %s on %s',r.rolname,cmd,t.table_name); end if;
    if not r.rolbypassrls and not exists(select 1 from pg_catalog.pg_policy p where p.polrelid=c.oid and r.role_oid=any(p.polroles) and p.polpermissive
     and p.polcmd in(case cmd when 'select' then 'r' when 'insert' then 'a' when 'delete' then 'd' when 'update' then 'w' end,'*')) then
     gaps:=gaps||format('%s has no %s policy on %s',r.rolname,cmd,t.table_name);
    end if;
   end loop;
  end loop;
  if not pg_catalog.has_column_privilege(r.role_oid,'public.social_dm_conversations'::regclass,'declined_at','select')
   or not pg_catalog.has_column_privilege(r.role_oid,'public.social_dm_conversations'::regclass,'declined_at','update') then
   gaps:=gaps||format('%s cannot read or write social_dm_conversations.declined_at',r.rolname);
  end if;
  foreach f in array public.b6_owner_functions() loop
   if not pg_catalog.has_function_privilege(r.role_oid,f,'execute') then gaps:=gaps||format('%s cannot execute %s',r.rolname,f); end if;
  end loop;
 end loop;
 if cardinality(gaps)>0 then raise exception 'B6_OWNER_GAP: %',array_to_string(gaps,'; '); end if;
end $$;
revoke all on function public.b6_owner_function_names(),public.b6_owner_tables(),public.b6_owner_functions(),public.b6_owner_roles(),
 public.b6_owner_access(),public.b6_owner_check() from public,anon,authenticated,service_role;

-- One anchored text replacement; the anchor must appear exactly p_count times.
create function pg_temp.b6_patch(p_sig regprocedure,p_anchor text,p_replacement text,p_count integer default 1)
returns void language plpgsql as $$
declare def text:=pg_catalog.pg_get_functiondef(p_sig);n integer;
begin
 n:=(length(def)-length(replace(def,p_anchor,'')))/length(p_anchor);
 if n<>p_count then raise exception 'B6_DM_PRIVACY_UNPATCHED: % (% of %)',p_sig,n,p_count; end if;
 execute replace(def,p_anchor,p_replacement);
end $$;

-- Keep each original under <name>_before_b6 for the rollback.
do $snapshot$
declare sig regprocedure;def text;
begin
 foreach sig in array array[
  'public.request_social_dm(uuid,uuid,text,uuid)','public.resolve_social_dm(uuid,uuid,text,uuid)',
  'public.send_social_dm_message(uuid,uuid,text,uuid)','public.send_social_dm_message(uuid,uuid,text,uuid,uuid)',
  'public.send_social_dm_message_before_groups_text(uuid,uuid,text,uuid)','public.send_social_dm_message_before_groups_media(uuid,uuid,text,uuid,uuid)',
  'public.react_social_dm_message(uuid,uuid,text,uuid)','public.block_social_profile(uuid,uuid,uuid)','public.unblock_social_profile(uuid,uuid)',
  'public.read_owned_dm_conversations(uuid)','public.read_social_dm_messages(uuid,uuid,timestamptz,uuid,integer)',
  'public.read_kyaa_wave_friend_messages(uuid,uuid)','public.send_kyaa_wave_friend_message(uuid,uuid,text,uuid)','public.assert_kyaa_wave_dm_pair(uuid,uuid)',
  'public.read_social_fan_profile(uuid,uuid,text,public.content_locale,timestamptz,uuid,text,integer)','public.social_dm_request_state(uuid,uuid)',
  'public.mobile_social_notification_path(uuid,text,text,uuid)','public.evaluate_owned_kyaa_wave_missions(uuid)','public.reconcile_wave_mission_evidence()',
  'public.read_admin_wave_stage_presentation(uuid,uuid,text)']::regprocedure[] loop
  def:=pg_catalog.pg_get_functiondef(sig);
  def:=regexp_replace(def,'FUNCTION public\.([a-z_]+)\(','FUNCTION public.\1_before_b6(');
  if def=pg_catalog.pg_get_functiondef(sig) then raise exception 'B6_DM_PRIVACY_UNPATCHED: snapshot %',sig; end if;
  execute def;
 end loop;
end $snapshot$;
do $revoke$
declare f record;
begin
 for f in select p.oid::regprocedure sig from pg_catalog.pg_proc p where p.pronamespace='public'::regnamespace and p.proname like '%\_before\_b6' loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.sig);
 end loop;
end $revoke$;

-- Request: lock without the counterpart's state, the decliner takes the row over, the limit counts the log.
-- A block is checked before a retry is answered: the replay reads the row's current status ('rejected' after a block), so a
-- retry with the same request id would otherwise tell a block from a quiet decline (review 2026-11-09).
select pg_temp.b6_patch('public.request_social_dm(uuid,uuid,text,uuid)',
 'perform public.social_lock_pair(p_app_user_id,p_profile_id);',
 $a$perform public.social_lock_pair_for(p_app_user_id,p_profile_id);
  if public.fan_web_blocked(p_app_user_id,p_profile_id) then raise exception 'SOCIAL_BLOCKED'; end if;$a$);
select pg_temp.b6_patch('public.request_social_dm(uuid,uuid,text,uuid)',
 $a$if(select count(*)from public.social_dm_conversations cv join public.social_dm_messages fm on fm.conversation_id=cv.id and fm.sender_id=cv.requester_id and fm.request_id=cv.request_id where cv.requester_id=p_app_user_id and fm.created_at>now()-interval'24 hours')>=public.social_dm_request_daily_limit()then$a$,
 $a$if public.social_dm_request_count(p_app_user_id)>=public.social_dm_request_daily_limit()then$a$);
select pg_temp.b6_patch('public.request_social_dm(uuid,uuid,text,uuid)',
 $a$if found and d.status in('pending','accepted') then raise exception 'SOCIAL_CONFLICT'; end if;
  if found and d.retry_at>now() then raise exception 'SOCIAL_RATE_LIMITED'; end if;
  if found then update public.social_dm_conversations set requester_id=p_app_user_id,status='pending',request_id=p_request_id,payload_hash=h,updated_at=now(),retry_at=null where id=d.id returning * into d;$a$,
 $a$if found and d.status in('pending','accepted') and not public.social_dm_hidden_for(p_app_user_id,d) then raise exception 'SOCIAL_CONFLICT'; end if;
  if found and d.retry_at>now() and d.requester_id=p_app_user_id then raise exception 'SOCIAL_RATE_LIMITED'; end if;
  if found then update public.social_dm_conversations set requester_id=p_app_user_id,status='pending',request_id=p_request_id,payload_hash=h,updated_at=now(),retry_at=null,declined_at=case when d.requester_id=p_app_user_id then d.declined_at end where id=d.id returning * into d;$a$);
select pg_temp.b6_patch('public.request_social_dm(uuid,uuid,text,uuid)',
 $a$insert into public.social_dm_messages(conversation_id,sender_id,body,request_id,payload_hash) values(d.id,p_app_user_id,btrim(p_body),p_request_id,md5(btrim(p_body))) returning * into m;$a$,
 $a$insert into public.social_dm_messages(conversation_id,sender_id,body,request_id,payload_hash) values(d.id,p_app_user_id,btrim(p_body),p_request_id,md5(btrim(p_body))) returning * into m;
  insert into public.social_dm_request_log(sender_id,conversation_id,message_id,counted) values(p_app_user_id,d.id,m.id,not friends);$a$);

-- Resolve: a decline only stamps declined_at; the decliner cannot act on the row afterwards. As in the request, a block answers
-- before a stored retry does, so the same request id and a new one give the same code. (fan_web_blocked is symmetric; the
-- arguments are reversed only to keep this anchor apart from the later one.)
select pg_temp.b6_patch('public.resolve_social_dm(uuid,uuid,text,uuid)',
 $a$replay:=public.social_action_claim(p_app_user_id,p_request_id,operation,payload);$a$,
 $a$if public.fan_web_blocked(other_id,p_app_user_id) then raise exception 'SOCIAL_BLOCKED'; end if; replay:=public.social_action_claim(p_app_user_id,p_request_id,operation,payload);$a$);
select pg_temp.b6_patch('public.resolve_social_dm(uuid,uuid,text,uuid)',
 'perform public.social_lock_pair(p_app_user_id,other_id);','perform public.social_lock_pair_for(p_app_user_id,other_id);');
select pg_temp.b6_patch('public.resolve_social_dm(uuid,uuid,text,uuid)',
 $a$if public.fan_web_blocked(p_app_user_id,other_id) then raise exception 'SOCIAL_BLOCKED'; end if;$a$,
 $a$if public.fan_web_blocked(p_app_user_id,other_id) then raise exception 'SOCIAL_BLOCKED'; end if; if public.social_dm_hidden_for(p_app_user_id,d) then raise exception 'SOCIAL_NOT_FOUND'; end if;$a$);
select pg_temp.b6_patch('public.resolve_social_dm(uuid,uuid,text,uuid)',
 $a$update public.social_dm_conversations set status='rejected',updated_at=now(),retry_at=now()+interval '24 hours' where id=d.id;$a$,
 $a$update public.social_dm_conversations set declined_at=now() where id=d.id;$a$);

-- Messages and reactions.
select pg_temp.b6_patch('public.send_social_dm_message(uuid,uuid,text,uuid)',
 'perform public.social_lock_pair(p_app_user_id,other_id);','perform public.social_lock_pair_for(p_app_user_id,other_id);');
select pg_temp.b6_patch('public.send_social_dm_message(uuid,uuid,text,uuid,uuid)',
 'perform public.social_lock_pair(p_app_user_id,other_id);','perform public.social_lock_pair_for(p_app_user_id,other_id);');
select pg_temp.b6_patch('public.send_social_dm_message_before_groups_text(uuid,uuid,text,uuid)',
 $a$perform public.social_lock_pair(p_app_user_id,other_id); select * into d from public.social_dm_conversations where id=p_conversation_id for update; if public.fan_web_blocked(p_app_user_id,other_id) then raise exception 'SOCIAL_BLOCKED'; end if;$a$,
 $a$perform public.social_lock_pair_for(p_app_user_id,other_id); select * into d from public.social_dm_conversations where id=p_conversation_id for update; if public.fan_web_blocked(p_app_user_id,other_id) then raise exception 'SOCIAL_BLOCKED'; end if; if public.social_dm_hidden_for(p_app_user_id,d) then raise exception 'SOCIAL_NOT_FOUND'; end if;$a$);
select pg_temp.b6_patch('public.send_social_dm_message_before_groups_media(uuid,uuid,text,uuid,uuid)',
 $a$perform public.social_lock_pair(p_app_user_id,other_id);select*into d from public.social_dm_conversations where id=p_conversation_id for update;if public.fan_web_blocked(p_app_user_id,other_id)then raise exception'SOCIAL_BLOCKED';end if;$a$,
 $a$perform public.social_lock_pair_for(p_app_user_id,other_id);select*into d from public.social_dm_conversations where id=p_conversation_id for update;if public.fan_web_blocked(p_app_user_id,other_id)then raise exception'SOCIAL_BLOCKED';end if;if public.social_dm_hidden_for(p_app_user_id,d)then raise exception'SOCIAL_NOT_FOUND';end if;$a$);
select pg_temp.b6_patch('public.react_social_dm_message(uuid,uuid,text,uuid)',
 $a$replay:=public.social_action_claim(p_app_user_id,p_request_id,operation,payload);$a$,
 $a$if public.fan_web_blocked(d.user_high_id,d.user_low_id) then raise exception 'SOCIAL_BLOCKED'; end if; replay:=public.social_action_claim(p_app_user_id,p_request_id,operation,payload);$a$);
select pg_temp.b6_patch('public.react_social_dm_message(uuid,uuid,text,uuid)',
 'perform public.social_lock_pair(d.user_low_id,d.user_high_id);',
 'perform public.social_lock_pair_for(p_app_user_id,case when d.user_low_id=p_app_user_id then d.user_high_id else d.user_low_id end);');
select pg_temp.b6_patch('public.react_social_dm_message(uuid,uuid,text,uuid)',
 $a$if public.fan_web_blocked(d.user_low_id,d.user_high_id) then raise exception 'SOCIAL_BLOCKED'; end if;$a$,
 $a$if public.fan_web_blocked(d.user_low_id,d.user_high_id) then raise exception 'SOCIAL_BLOCKED'; end if; if d.status<>'accepted' then raise exception 'SOCIAL_FORBIDDEN'; end if;$a$);

-- Block and unblock work whatever state the other account is in.
select pg_temp.b6_patch('public.block_social_profile(uuid,uuid,uuid)',
 'perform public.social_lock_pair(p_app_user_id,p_profile_id);','perform public.social_lock_pair_actor(p_app_user_id,p_profile_id);');
select pg_temp.b6_patch('public.unblock_social_profile(uuid,uuid)',
 'perform public.social_lock_pair(p_app_user_id,p_profile_id);','perform public.social_lock_pair_actor(p_app_user_id,p_profile_id);');

-- Readers: the decliner has no conversation; a sanctioned counterpart drops out like a blocked one.
select pg_temp.b6_patch('public.read_owned_dm_conversations(uuid)',
 'where p_app_user_id in(d.user_low_id,d.user_high_id) and not public.fan_web_blocked(p_app_user_id,o.id)',
 'where p_app_user_id in(d.user_low_id,d.user_high_id) and not public.fan_web_blocked(p_app_user_id,o.id) and not public.social_dm_hidden_for(p_app_user_id,d) and public.social_dm_counterpart_open(o.id)');
select pg_temp.b6_patch('public.read_social_dm_messages(uuid,uuid,timestamptz,uuid,integer)',
 $a$if public.fan_web_blocked(d.user_low_id,d.user_high_id)then raise exception'SOCIAL_BLOCKED';end if;$a$,
 $a$if public.social_dm_hidden_for(p_app_user_id,d)then raise exception'SOCIAL_NOT_FOUND';end if;if public.fan_web_blocked(d.user_low_id,d.user_high_id)or not public.social_dm_counterpart_open(case when d.user_low_id=p_app_user_id then d.user_high_id else d.user_low_id end)then raise exception'SOCIAL_BLOCKED';end if;$a$);
select pg_temp.b6_patch('public.read_social_fan_profile(uuid,uuid,text,public.content_locale,timestamptz,uuid,text,integer)',
 'select * into d from public.social_dm_conversations where user_low_id=least(p_app_user_id,p_profile_id) and user_high_id=greatest(p_app_user_id,p_profile_id);',
 'select * into d from public.social_dm_conversations where user_low_id=least(p_app_user_id,p_profile_id) and user_high_id=greatest(p_app_user_id,p_profile_id); if public.social_dm_hidden_for(p_app_user_id,d) then d:=null; end if;');
select pg_temp.b6_patch('public.social_dm_request_state(uuid,uuid)',
 'select * into d from public.social_dm_conversations where user_low_id=least(p_viewer,p_target) and user_high_id=greatest(p_viewer,p_target);',
 'select * into d from public.social_dm_conversations where user_low_id=least(p_viewer,p_target) and user_high_id=greatest(p_viewer,p_target); if public.social_dm_hidden_for(p_viewer,d) then d:=null; end if;');
select pg_temp.b6_patch('public.social_dm_request_state(uuid,uuid)',
 $a$if coalesce(d.retry_at,'-infinity'::timestamptz)>now() then return 'retry_later';end if;$a$,
 $a$if d.requester_id=p_viewer and coalesce(d.retry_at,'-infinity'::timestamptz)>now() then return 'retry_later';end if;$a$);
select pg_temp.b6_patch('public.social_dm_request_state(uuid,uuid)',
 $a$(select count(*)from public.social_dm_conversations cv join public.social_dm_messages fm on fm.conversation_id=cv.id and fm.sender_id=cv.requester_id and fm.request_id=cv.request_id where cv.requester_id=p_viewer and fm.created_at>now()-interval'24 hours')>=public.social_dm_request_daily_limit()$a$,
 $a$public.social_dm_request_count(p_viewer)>=public.social_dm_request_daily_limit()$a$);
-- Notifications follow the reader: checked when written and again when listed or counted.
select pg_temp.b6_patch('public.mobile_social_notification_path(uuid,text,text,uuid)',
 $a$and d.status in ('pending','accepted')$a$,
 $a$and d.status in ('pending','accepted') and not public.social_dm_hidden_for(p_owner,d) and public.social_dm_counterpart_open(m.sender_id)$a$);

-- kyaa wave chat. Order: lock, block or closed counterpart (one code), participants, wave friendship. Blocking ends the
-- friendship, so the block check has to come before the friendship check.
create or replace function public.assert_kyaa_wave_dm_pair(p_app_user_id uuid,p_profile_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.social_lock_pair_actor(p_app_user_id,p_profile_id);
 if public.fan_web_blocked(p_app_user_id,p_profile_id) or not public.social_dm_counterpart_open(p_profile_id) then raise exception 'SOCIAL_BLOCKED'; end if;
 perform 1 from public.kyaa_wave_participants where event_key='kyaa-wave-2026' and app_user_id=p_app_user_id for share;
 if not found then raise exception 'FAN_WEB_FORBIDDEN'; end if;
 perform 1 from public.kyaa_wave_participants where event_key='kyaa-wave-2026' and app_user_id=p_profile_id for share;
 if not found then raise exception 'SOCIAL_NOT_FOUND'; end if;
 if not exists(select 1 from public.social_friendships f join public.celebrities c on c.id=f.celebrity_id and c.slug='kyaa-wave-fanpage' and c.status='published' and c.archived_at is null
 where f.user_low_id=least(p_app_user_id,p_profile_id) and f.user_high_id=greatest(p_app_user_id,p_profile_id) and f.status='accepted') then raise exception 'SOCIAL_FORBIDDEN'; end if;
end $$;
select pg_temp.b6_patch('public.read_kyaa_wave_friend_messages(uuid,uuid)',
 'select id into conversation from public.social_dm_conversations where user_low_id=least(p_app_user_id,p_profile_id) and user_high_id=greatest(p_app_user_id,p_profile_id);',
 'select d.id into conversation from public.social_dm_conversations d where d.user_low_id=least(p_app_user_id,p_profile_id) and d.user_high_id=greatest(p_app_user_id,p_profile_id) and not public.social_dm_hidden_for(p_app_user_id,d);');
select pg_temp.b6_patch('public.send_kyaa_wave_friend_message(uuid,uuid,text,uuid)',
 'perform public.social_lock_pair(p_app_user_id,p_profile_id);','perform public.social_lock_pair_for(p_app_user_id,p_profile_id);');
-- D6: the sender of a declined request cannot open it here. The message is kept (it stays theirs) and the answer looks pending.
-- The person who declined opens it by writing, which also clears the decline.
select pg_temp.b6_patch('public.send_kyaa_wave_friend_message(uuid,uuid,text,uuid)',
 $a$  update public.social_dm_conversations set status='accepted',retry_at=null where id=conversation and status<>'accepted';
  result:=public.send_social_dm_message(p_app_user_id,conversation,p_body,p_request_id);$a$,
 $a$  if exists(select 1 from public.social_dm_conversations d where d.id=conversation and d.requester_id=p_app_user_id and d.declined_at is not null) then
   insert into public.social_dm_messages(conversation_id,sender_id,body,request_id,payload_hash) values(conversation,p_app_user_id,btrim(p_body),p_request_id,md5(btrim(p_body)))
    returning jsonb_build_object('id',conversation,'status','pending','firstMessageId',id,'retryAt',null,'replayed',false) into result;
  else
   update public.social_dm_conversations set status='accepted',retry_at=null,declined_at=null where id=conversation and (status<>'accepted' or declined_at is not null);
   result:=public.send_social_dm_message(p_app_user_id,conversation,p_body,p_request_id);
  end if;$a$);

-- Wave missions count a declined conversation the way they counted a rejected one.
select pg_temp.b6_patch('public.evaluate_owned_kyaa_wave_missions(uuid)',
 $a$d.status in('cancelled','rejected')$a$,$a$(d.status in('cancelled','rejected') or d.declined_at is not null)$a$);
select pg_temp.b6_patch('public.reconcile_wave_mission_evidence()',
 $a$d.status in('cancelled','rejected')$a$,$a$(d.status in('cancelled','rejected') or d.declined_at is not null)$a$);
select pg_temp.b6_patch('public.read_admin_wave_stage_presentation(uuid,uuid,text)',
 $a$d.status in('cancelled','rejected')$a$,$a$(d.status in('cancelled','rejected') or d.declined_at is not null)$a$);

-- Only the two kyaa wave chat functions call the pair check.
do $calls$
begin
 if (select count(*) from pg_catalog.pg_proc p where p.pronamespace='public'::regnamespace and p.prosrc like '%assert_kyaa_wave_dm_pair(%'
   and p.proname not like '%\_before\_b6') <> 2 then raise exception 'B6_DM_PRIVACY_UNPATCHED: assert_kyaa_wave_dm_pair callers'; end if;
end $calls$;

select public.b6_owner_access();
select public.b6_owner_check();
commit;
