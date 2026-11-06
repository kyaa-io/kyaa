begin;
-- 2026-11-07 user decision Q2: a fan can ask to talk to a friend or to someone who joined the same page. The other person accepts first, and turning messages off closes it.
-- Replaces the old "same visible favorite and both passports" path. Friends keep starting directly: they already accepted each other.
-- Messages are open by default now. Rows that already hold a setting keep it, including 'friends'.
-- Blocks, sanctions, disabled accounts and the daily limits from 20261211430000 are unchanged.
-- read_social_fan_profile keeps its JSON shape, so the deployed web keeps working. The reason lives in read_social_profile_reach.

-- Anonymous and unpublished pages do not count: a yes would tell the viewer who joined them.
create function public.social_dm_share_visible_page(p_a uuid,p_b uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.group_memberships ma
  join public.group_memberships mb on mb.page_id=ma.page_id and mb.app_user_id=p_b
  join public.group_pages p on p.id=ma.page_id
  left join public.celebrities c on c.id=p.celebrity_id
  where ma.app_user_id=p_a and p.status='published' and not p.anonymous
   and(p.celebrity_id is null or(c.status='published' and c.archived_at is null)))
$$;
revoke all on function public.social_dm_share_visible_page(uuid,uuid)from public,anon,authenticated,service_role;

-- One answer for the button and the request. Keep the order: a reason must not reveal more than the one before it.
create function public.social_dm_request_state(p_viewer uuid,p_target uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare d public.social_dm_conversations;policy text;is_friend boolean;
begin
 if p_viewer=p_target then return 'self';end if;
 if public.fan_web_blocked(p_viewer,p_target)
  or not exists(select 1 from public.app_users u where u.id=p_target and u.status='active')
  or not public.social_profile_is_public(p_target) then return 'blocked';end if;
 select * into d from public.social_dm_conversations where user_low_id=least(p_viewer,p_target) and user_high_id=greatest(p_viewer,p_target);
 if d.status='pending' then return case when d.requester_id=p_viewer then 'pending' else 'incoming' end;end if;
 policy:=coalesce((select s.dm_policy from public.social_profile_settings s where s.app_user_id=p_target),'requests');
 if policy='none' then return 'recipient_off';end if;
 is_friend:=exists(select 1 from public.social_friendships f where f.user_low_id=least(p_viewer,p_target) and f.user_high_id=greatest(p_viewer,p_target) and f.status='accepted');
 if d.status='accepted' and (is_friend or policy='requests') then return 'open';end if;
 if not is_friend then
  if policy='friends' then return 'friends_only';end if;
  if not public.social_dm_share_visible_page(p_viewer,p_target) then return 'not_eligible';end if;
 end if;
 if coalesce(d.retry_at,'-infinity'::timestamptz)>now() then return 'retry_later';end if;
 if d.status='accepted' then return 'open';end if;
 if not is_friend and (select count(*)from public.social_dm_conversations cv join public.social_dm_messages fm on fm.conversation_id=cv.id and fm.sender_id=cv.requester_id and fm.request_id=cv.request_id where cv.requester_id=p_viewer and fm.created_at>now()-interval'24 hours')>=public.social_dm_request_daily_limit() then return 'limit';end if;
 return 'available';
end $$;
revoke all on function public.social_dm_request_state(uuid,uuid)from public,anon,authenticated,service_role;

-- The artist mark is already public on posts. Anonymous and unpublished pages are left out, as they are there.
create function public.read_social_profile_reach(p_app_user_id uuid,p_profile_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare state text;
begin
 perform public.fan_web_lock_active_user(p_app_user_id);
 state:=public.social_dm_request_state(p_app_user_id,p_profile_id);
 return jsonb_build_object('dmState',state,'artist',state<>'blocked' and exists(select 1 from public.group_artist_bindings b join public.group_pages p on p.id=b.page_id where b.app_user_id=p_profile_id and p.status='published' and not p.anonymous));
end $$;
revoke all on function public.read_social_profile_reach(uuid,uuid)from public,anon,authenticated;
grant execute on function public.read_social_profile_reach(uuid,uuid)to service_role;

alter table public.social_profile_settings alter column dm_policy set default 'requests';

do $patch$
declare f record;def text;patched text;anchor text;n integer:=0;
begin
 -- Who gets the default: everyone with no saved setting, in every function that reads it.
 -- Not when ending a friendship: someone who never chose an open inbox still loses the conversation when they unfriend, so an unfriended person cannot keep messaging.
 for f in select p.oid,p.oid::regprocedure::text sig from pg_catalog.pg_proc p
  where p.pronamespace='public'::regnamespace and p.proname !~ 'resolve_(social|kyaa_wave)_friend' and p.prosrc ~ $r$select dm_policy from public\.social_profile_settings where app_user_id=[a-z_]+\),'friends'\)$r$ loop
  def:=pg_catalog.pg_get_functiondef(f.oid);
  execute regexp_replace(def,$r$(select dm_policy from public\.social_profile_settings where app_user_id=[a-z_]+\),)'friends'\)$r$,$r$\1'requests')$r$,'g');
  n:=n+1;
 end loop;
 if n<5 then raise exception 'SOCIAL_DM_Q2_UNPATCHED: default %',n;end if;

 def:=pg_catalog.pg_get_functiondef('public.request_social_dm(uuid,uuid,text,uuid)'::regprocedure);
 anchor:=$a$if not friends and (policy<>'requests' or not public.social_profile_is_public(p_profile_id) or not exists(select 1 from public.social_favorite_visibility mine join public.social_favorite_visibility theirs on theirs.celebrity_id=mine.celebrity_id and theirs.app_user_id=p_profile_id and theirs.visible join public.fan_passports mp on mp.app_user_id=p_app_user_id and mp.celebrity_id=mine.celebrity_id and mp.business_status='issued' join public.fan_passports tp on tp.app_user_id=p_profile_id and tp.celebrity_id=mine.celebrity_id and tp.business_status='issued' where mine.app_user_id=p_app_user_id and mine.visible)) then raise exception 'SOCIAL_FORBIDDEN'; end if;$a$;
 if position(anchor in def)=0 then raise exception 'SOCIAL_DM_Q2_UNPATCHED: request_social_dm';end if;
 execute replace(def,anchor,$a$if policy='none' or not public.social_profile_is_public(p_profile_id) or (not friends and (policy<>'requests' or not public.social_dm_share_visible_page(p_app_user_id,p_profile_id))) then raise exception 'SOCIAL_FORBIDDEN'; end if;$a$);

 def:=pg_catalog.pg_get_functiondef('public.read_social_fan_profile(uuid,uuid,text,public.content_locale,timestamptz,uuid,text,integer)'::regprocedure);
 anchor:=$a$'canRequestDm',coalesce(p_app_user_id<>p_profile_id and policy<>'none' and (policy='requests' or f.status='accepted') and (d.id is null or d.status in ('rejected','cancelled') and coalesce(d.retry_at,'-infinity'::timestamptz)<=now()),false)$a$;
 if position(anchor in def)=0 then raise exception 'SOCIAL_DM_Q2_UNPATCHED: read_social_fan_profile';end if;
 execute replace(def,anchor,$a$'canRequestDm',public.social_dm_request_state(p_app_user_id,p_profile_id)='available'$a$);

 -- The composer follows the rule send_social_dm_message already applies, so nobody types a message that cannot go.
 def:=pg_catalog.pg_get_functiondef('public.read_owned_dm_conversations(uuid)'::regprocedure);
 anchor:=$a$'canSend',d.status='accepted' or exists(select 1 from public.social_friendships f where f.user_low_id=d.user_low_id and f.user_high_id=d.user_high_id and f.status='accepted')$a$;
 if position(anchor in def)=0 then raise exception 'SOCIAL_DM_Q2_UNPATCHED: read_owned_dm_conversations';end if;
 execute replace(def,anchor,$a$'canSend',coalesce((select s.dm_policy from public.social_profile_settings s where s.app_user_id=o.id),'requests')<>'none' and (exists(select 1 from public.social_friendships f where f.user_low_id=d.user_low_id and f.user_high_id=d.user_high_id and f.status='accepted') or d.status='accepted' and coalesce((select s.dm_policy from public.social_profile_settings s where s.app_user_id=o.id),'requests')='requests')$a$);

 for f in select distinct o.rolname from pg_catalog.pg_proc p join pg_catalog.pg_roles o on o.oid=p.proowner
  where p.oid in('public.request_social_dm(uuid,uuid,text,uuid)'::regprocedure,'public.read_social_fan_profile(uuid,uuid,text,public.content_locale,timestamptz,uuid,text,integer)'::regprocedure) and not o.rolsuper loop
  execute format('grant execute on function public.social_dm_share_visible_page(uuid,uuid),public.social_dm_request_state(uuid,uuid) to %I',f.rolname);
 end loop;
end $patch$;
commit;
