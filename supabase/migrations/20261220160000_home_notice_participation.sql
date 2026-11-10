-- Owner: C content / Sol, user-feedback-20261110. Reserved above integration migrations RANK-DATA-2 20261220140000 / 20261220150000.
-- Apply before the web release. No CMS body/publication changes, rewards or celebrity membership gates.
begin;
set local lock_timeout = '5s';

create table public.home_notice_comments (
  id uuid primary key default extensions.gen_random_uuid(),
  notice_id uuid not null references public.home_notices(id) on delete restrict,
  app_user_id uuid not null references public.app_users(id) on delete restrict,
  body text not null check (length(btrim(body)) between 1 and 1000),
  idempotency_key uuid not null,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (app_user_id, idempotency_key)
);
create index home_notice_comments_feed on public.home_notice_comments(notice_id,created_at desc,id desc) where deleted_at is null;
create index home_notice_comments_rate on public.home_notice_comments(app_user_id,created_at desc);
create trigger ugc_body_filter before insert or update on public.home_notice_comments
  for each row execute function public.guard_ugc_body();
create table public.home_notice_reactions (
  notice_id uuid not null references public.home_notices(id) on delete restrict,
  app_user_id uuid not null references public.app_users(id) on delete restrict,
  reaction text not null check (reaction in ('like','dislike')),
  updated_at timestamptz not null default now(),
  primary key (notice_id,app_user_id)
);
alter table public.home_notice_comments enable row level security;
alter table public.home_notice_comments force row level security;
alter table public.home_notice_reactions enable row level security;
alter table public.home_notice_reactions force row level security;
revoke all on public.home_notice_comments, public.home_notice_reactions from public,anon,authenticated,service_role;

create function public.read_home_notice_participation(p_slug text,p_app_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  if p_app_user_id is not null then perform public.fan_web_lock_active_user(p_app_user_id); end if;
  select id into v_id from public.home_notices where slug=p_slug and publication_status='published' and archived_at is null;
  if not found then return null; end if;
  return jsonb_build_object(
    'reaction',(select reaction from public.home_notice_reactions where notice_id=v_id and app_user_id=p_app_user_id),
    'likeCount',(select count(*) from public.home_notice_reactions r join public.app_users u on u.id=r.app_user_id and u.status='active' where r.notice_id=v_id and r.reaction='like'),
    'dislikeCount',null,
    'commentCount',(select count(*) from public.home_notice_comments c join public.app_users u on u.id=c.app_user_id and u.status='active'
      where c.notice_id=v_id and c.deleted_at is null and not public.fan_web_blocked(p_app_user_id,c.app_user_id)));
end $$;

create function public.read_home_notice_comments(p_slug text,p_app_user_id uuid,p_locale text,p_before timestamptz,p_before_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_result jsonb;
begin
  if p_app_user_id is not null then perform public.fan_web_lock_active_user(p_app_user_id); end if;
  if p_locale is null or p_locale not in ('ko','en') or (p_before is null)<>(p_before_id is null) then raise exception 'FAN_WEB_INVALID_INPUT'; end if;
  select id into v_id from public.home_notices where slug=p_slug and publication_status='published' and archived_at is null;
  if not found then return null; end if;
  with candidates as materialized (
    select c.* from public.home_notice_comments c join public.app_users u on u.id=c.app_user_id and u.status='active'
    where c.notice_id=v_id and c.deleted_at is null and not public.fan_web_blocked(p_app_user_id,c.app_user_id)
      and (p_before is null or (c.created_at,c.id)<(p_before,p_before_id))
    order by c.created_at desc,c.id desc limit 21
  ), page as (select * from candidates order by created_at desc,id desc limit 20)
  select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object(
    'id',c.id,'body',c.body,'revision',c.revision,'createdAt',c.created_at,'isOwner',coalesce(c.app_user_id=p_app_user_id,false),
    'author',jsonb_build_object('nickname',coalesce(nullif(btrim(p.nickname),''),case when p_locale='ko' then '팬' else 'Fan' end),
      'avatarUrl',public.public_fan_avatar_url(c.app_user_id))) order by c.created_at desc,c.id desc)
    from page c left join public.user_profiles p on p.app_user_id=c.app_user_id),'[]'::jsonb),
    'hasMore',(select count(*)>20 from candidates)) into v_result;
  return v_result;
end $$;

create function public.post_home_notice_comment(p_slug text,p_app_user_id uuid,p_body text,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_comment_id uuid; v_existing public.home_notice_comments; v_body text:=btrim(p_body);
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  if p_idempotency_key is null or v_body is null or length(v_body) not between 1 and 1000 then raise exception 'FAN_WEB_INVALID_INPUT'; end if;
  select id into v_id from public.home_notices where slug=p_slug and publication_status='published' and archived_at is null for share;
  if not found then raise exception 'FAN_WEB_NOT_FOUND'; end if;
  select * into v_existing from public.home_notice_comments where app_user_id=p_app_user_id and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.notice_id<>v_id or v_existing.body<>v_body then raise exception 'FAN_WEB_CONFLICT'; end if;
    return jsonb_build_object('id',v_existing.id,'revision',v_existing.revision,'replayed',true);
  end if;
  if (select count(*) from public.home_notice_comments where app_user_id=p_app_user_id and created_at>clock_timestamp()-interval '1 minute')>=10 then raise exception 'FAN_WEB_RATE_LIMITED'; end if;
  insert into public.home_notice_comments(notice_id,app_user_id,body,idempotency_key) values(v_id,p_app_user_id,v_body,p_idempotency_key) returning id into v_comment_id;
  return jsonb_build_object('id',v_comment_id,'revision',1,'replayed',false);
end $$;

create function public.remove_home_notice_comment(p_comment_id uuid,p_app_user_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_notice_id uuid;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  select notice_id into v_notice_id from public.home_notice_comments where id=p_comment_id and app_user_id=p_app_user_id and deleted_at is null;
  if not found then raise exception 'FAN_WEB_NOT_FOUND'; end if;
  perform 1 from public.home_notices where id=v_notice_id and publication_status='published' and archived_at is null for share;
  if not found then raise exception 'FAN_WEB_NOT_FOUND'; end if;
  update public.home_notice_comments set deleted_at=clock_timestamp(),updated_at=clock_timestamp(),revision=revision+1
    where id=p_comment_id and app_user_id=p_app_user_id and deleted_at is null;
end $$;

create function public.set_home_notice_reaction(p_slug text,p_app_user_id uuid,p_reaction text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_previous text;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  if p_reaction is null or p_reaction not in ('like','dislike','none') then raise exception 'FAN_WEB_INVALID_INPUT'; end if;
  select id into v_id from public.home_notices where slug=p_slug and publication_status='published' and archived_at is null for share;
  if not found then raise exception 'FAN_WEB_NOT_FOUND'; end if;
  select reaction into v_previous from public.home_notice_reactions where notice_id=v_id and app_user_id=p_app_user_id;
  if v_previous is distinct from nullif(p_reaction,'none') then
    if (select count(*) from public.content_write_events where app_user_id=p_app_user_id and kind='like' and created_at>clock_timestamp()-interval '1 minute')>=30 then raise exception 'FAN_WEB_RATE_LIMITED'; end if;
    if p_reaction='none' then
      delete from public.home_notice_reactions where notice_id=v_id and app_user_id=p_app_user_id;
    else
      insert into public.home_notice_reactions(notice_id,app_user_id,reaction) values(v_id,p_app_user_id,p_reaction)
        on conflict(notice_id,app_user_id) do update set reaction=excluded.reaction,updated_at=clock_timestamp();
    end if;
    insert into public.content_write_events(app_user_id,kind) values(p_app_user_id,'like');
  end if;
  return public.read_home_notice_participation(p_slug,p_app_user_id);
end $$;

create function public.scrub_home_notice_participation_on_deletion()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.status='active' and new.status='disabled' and exists(select 1 from public.account_deletion_requests where app_user_id=new.id and status='pending') then
    update public.home_notice_comments set body='[deleted]',deleted_at=coalesce(deleted_at,clock_timestamp()),updated_at=clock_timestamp(),revision=revision+1 where app_user_id=new.id;
    delete from public.home_notice_reactions where app_user_id=new.id;
  end if;
  return new;
end $$;
create trigger app_users_scrub_home_notice_participation after update of status on public.app_users for each row execute function public.scrub_home_notice_participation_on_deletion();

revoke all on function public.read_home_notice_participation(text,uuid),public.read_home_notice_comments(text,uuid,text,timestamptz,uuid),
  public.post_home_notice_comment(text,uuid,text,uuid),public.remove_home_notice_comment(uuid,uuid),public.set_home_notice_reaction(text,uuid,text),
  public.scrub_home_notice_participation_on_deletion() from public,anon,authenticated,service_role;
grant execute on function public.read_home_notice_participation(text,uuid),public.read_home_notice_comments(text,uuid,text,timestamptz,uuid),
  public.post_home_notice_comment(text,uuid,text,uuid),public.remove_home_notice_comment(uuid,uuid),public.set_home_notice_reaction(text,uuid,text) to service_role;

-- A non-superuser migration owner still needs table ACLs and FORCE RLS policies (home_n1 / post_dislikes precedent).
do $access$
declare me name:=current_user; t record; helper regprocedure; definition text;
  avatar_edge text:=$edge$('public.read_home_notice_comments(text,uuid,text,timestamptz,uuid)','public.public_fan_avatar_url(uuid)')$edge$;
begin
  if me in ('anon','authenticated','service_role') then raise exception 'Unsafe home notice participation owner'; end if;
  for t in select * from (values
    ('home_notice_comments','select,insert,update'),('home_notice_reactions','select,insert,update,delete'),
    ('home_notices','select'),('app_users','select'),('user_profiles','select'),
    ('content_write_events','select,insert'),('account_deletion_requests','select')) as permissions(tname,privileges) loop
    execute format('grant %s on public.%I to %I',t.privileges,t.tname,me);
    execute format('create policy %I on public.%I for all to %I using (true) with check (true)','home_participation_owner_'||me,t.tname,me);
  end loop;
  grant usage on sequence public.content_write_events_id_seq to current_user;
  foreach helper in array array['public.fan_web_lock_active_user(uuid)'::regprocedure,'public.fan_web_blocked(uuid,uuid)'::regprocedure,'public.public_fan_avatar_url(uuid)'::regprocedure] loop
    execute format('grant execute on function %s to %I',helper,me);
  end loop;
  -- Keep this caller in the existing owner-aware helper registry for later owner transitions.
  definition:=pg_catalog.pg_get_functiondef('public.list_facts_wrapper_access()'::regprocedure);
  if position(avatar_edge in definition)=0 then
    if (length(definition)-length(replace(definition,'from (values','')))/length('from (values')<>1 then
      raise exception 'HOME_NOTICE_AVATAR_REGISTRY_SHAPE';
    end if;
    execute replace(definition,'from (values','from (values'||chr(10)||'   '||avatar_edge||',');
  end if;
  perform public.list_facts_wrapper_access();
end $access$;
notify pgrst, 'reload schema';
commit;
