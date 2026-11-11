-- Notice reactions do not change B3 reward functions or their patch ledger.
begin;
set local lock_timeout='5s';
create table public.celebrity_notice_dislikes (
 notice_id uuid not null references public.celebrity_notices(id) on delete cascade,
 app_user_id uuid not null references public.app_users(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(notice_id,app_user_id)
);
create index celebrity_notice_dislikes_owner on public.celebrity_notice_dislikes(app_user_id);
alter table public.celebrity_notice_dislikes enable row level security;
alter table public.celebrity_notice_dislikes force row level security;
revoke all on public.celebrity_notice_dislikes from public,anon,authenticated,service_role;
do $$ begin
 if not (select rolsuper or rolbypassrls from pg_roles where rolname=current_user) then
 execute format('create policy notice_dislikes_owner on public.celebrity_notice_dislikes for all to %I using(true) with check(true)',current_user);
 end if;
end $$;
create function public.clear_opposite_notice_reaction() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='celebrity_notice_likes' then delete from public.celebrity_notice_dislikes where notice_id=new.notice_id and app_user_id=new.app_user_id;
 else delete from public.celebrity_notice_likes where notice_id=new.notice_id and app_user_id=new.app_user_id; end if;
 return new;
end $$;
create trigger clear_notice_dislike after insert on public.celebrity_notice_likes for each row execute function public.clear_opposite_notice_reaction();
create trigger clear_notice_like after insert on public.celebrity_notice_dislikes for each row execute function public.clear_opposite_notice_reaction();
create function public.scrub_notice_dislikes_on_deletion() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.status='active' and new.status='disabled' and exists(select 1 from public.account_deletion_requests where app_user_id=new.id and status='pending') then
 delete from public.celebrity_notice_dislikes where app_user_id=new.id;
 end if;
 return new;
end $$;
create trigger app_users_scrub_notice_dislikes after update of status on public.app_users for each row execute function public.scrub_notice_dislikes_on_deletion();
revoke all on function public.scrub_notice_dislikes_on_deletion() from public,anon,authenticated,service_role;
create function public.read_celebrity_notice_reaction(p_app_user_id uuid,p_slug text,p_notice_slug text,p_locale public.content_locale default 'ko')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare n jsonb; v_id uuid;
begin
 n:=public.read_fan_notice(p_app_user_id,p_slug,p_notice_slug,p_locale);
 if n is null then return null; end if;
 v_id:=(n->>'id')::uuid;
 return jsonb_build_object('likeCount',n->'likeCount','reaction',case when (n->>'liked')::boolean then 'like' when exists(select 1 from public.celebrity_notice_dislikes where notice_id=v_id and app_user_id=p_app_user_id) then 'dislike' else null end,'dislikeCount',null);
end $$;
create function public.set_celebrity_notice_reaction(p_app_user_id uuid,p_slug text,p_notice_slug text,p_locale public.content_locale,p_reaction text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare n jsonb; v_id uuid;
begin
 perform public.fan_web_lock_active_user(p_app_user_id);
 if p_reaction is null or p_reaction not in ('like','dislike','none') then raise exception 'FANPAGE_INVALID_REQUEST' using errcode='22023'; end if;
 n:=public.read_fan_notice(p_app_user_id,p_slug,p_notice_slug,p_locale);
 if n is null then raise exception 'FANPAGE_NOT_FOUND' using errcode='P0002'; end if;
 v_id:=(n->>'id')::uuid;
 perform public.set_celebrity_notice_liked(p_app_user_id,p_slug,p_notice_slug,p_reaction='like');
 if p_reaction='dislike' then
 insert into public.celebrity_notice_dislikes(notice_id,app_user_id) values(v_id,p_app_user_id) on conflict do nothing;
 else delete from public.celebrity_notice_dislikes where notice_id=v_id and app_user_id=p_app_user_id; end if;
 return public.read_celebrity_notice_reaction(p_app_user_id,p_slug,p_notice_slug,p_locale);
end $$;
revoke all on function public.clear_opposite_notice_reaction() from public,anon,authenticated,service_role;
revoke all on function public.read_celebrity_notice_reaction(uuid,text,text,public.content_locale),public.set_celebrity_notice_reaction(uuid,text,text,public.content_locale,text) from public,anon,authenticated;
grant execute on function public.read_celebrity_notice_reaction(uuid,text,text,public.content_locale),public.set_celebrity_notice_reaction(uuid,text,text,public.content_locale,text) to service_role;
commit;
notify pgrst,'reload schema';
