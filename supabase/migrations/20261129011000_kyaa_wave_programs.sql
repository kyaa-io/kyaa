begin;

alter table public.fan_posts add column program_notice_id uuid references public.celebrity_notices(id) on delete restrict;
create index fan_posts_program_feed on public.fan_posts(program_notice_id,created_at desc,id desc) where deleted_at is null and hidden_at is null;

-- This ledger intentionally has no reward, mint, points or ticket producer.
create table public.fan_program_stamps (
 app_user_id uuid not null references public.app_users(id) on delete restrict,
 program_notice_id uuid not null references public.celebrity_notices(id) on delete restrict,
 earned_at timestamptz not null default clock_timestamp(),
 primary key(app_user_id,program_notice_id)
);
alter table public.fan_program_stamps enable row level security;
alter table public.fan_program_stamps force row level security;
revoke all on public.fan_program_stamps from public,anon,authenticated,service_role;

create function public.fan_program_notice(p_slug text,p_program text) returns uuid
language sql stable security definer set search_path='' as $$
 select n.id from public.celebrity_notices n join public.celebrities c on c.id=n.celebrity_id
 where p_slug='kyaa-wave-fanpage' and c.slug=p_slug
 and p_program in('live-insight','wave-quiz','community-starts') and n.slug=p_program
 and c.status='published' and c.archived_at is null
 and n.publication_status='published' and n.archived_at is null and n.visibility='public';
$$;

create function public.guard_fan_program_post() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and old.program_notice_id is not null and new.program_notice_id is distinct from old.program_notice_id then
  raise exception 'FAN_WEB_CONFLICT';
 end if;
 if new.program_notice_id is not null then
  if new.visibility<>'public' then raise exception 'FAN_WEB_INVALID_INPUT'; end if;
  -- Ordinary edits preserve the binding even when an admin has unpublished its notice.
  if tg_op='INSERT' or new.program_notice_id is distinct from old.program_notice_id or new.celebrity_id is distinct from old.celebrity_id then
   if not exists(select 1 from public.celebrity_notices n where n.id=new.program_notice_id and n.celebrity_id=new.celebrity_id
    and n.id=public.fan_program_notice('kyaa-wave-fanpage',n.slug)) then raise exception 'FAN_WEB_NOT_FOUND'; end if;
  end if;
 end if;
 return new;
end $$;
create trigger fan_program_binding before insert or update on public.fan_posts for each row execute function public.guard_fan_program_post();

-- Guard the original recursive resolver so all feeds, detail, assets and replies inherit notice visibility.
do $$
declare signature regprocedure:='public.fan_web_content_target_before_mobile_content(uuid,text,uuid,public.content_locale)'::regprocedure;
 definition text:=pg_catalog.pg_get_functiondef(signature);
 needle text:='owner_id:=row_record.app_user_id; creator_id:=row_record.celebrity_id; source_body:=row_record.body; source_revision:=row_record.revision;';
begin
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'FAN_PROGRAM_VISIBILITY_GUARD_SHAPE_CHANGED'; end if;
 execute replace(definition,needle,$guard$
 if row_record.program_notice_id is not null and not exists(
  select 1 from public.celebrity_notices n where n.id=row_record.program_notice_id and n.celebrity_id=row_record.celebrity_id
   and n.id=public.fan_program_notice('kyaa-wave-fanpage',n.slug)
   and public.fan_web_content_target(p_app_user_id,'notice',n.id,p_locale) is not null
 ) then return null; end if;
 $guard$||needle);
end $$;

create function public.save_fan_program_post(p_app_user_id uuid,p_slug text,p_program text,p_body text,p_visibility text,p_asset_ids uuid[],p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare notice_id uuid; existing public.fan_posts%rowtype; result jsonb; v_post_id uuid;
begin
 perform public.fan_web_lock_active_user(p_app_user_id);
 if p_visibility is distinct from 'public' or p_idempotency_key is null then raise exception 'FAN_WEB_INVALID_INPUT'; end if;
 notice_id:=public.fan_program_notice(p_slug,p_program);
 if notice_id is null then raise exception 'FAN_WEB_NOT_FOUND'; end if;
 perform 1 from public.celebrity_notices where id=notice_id for share;
 if public.fan_program_notice(p_slug,p_program) is distinct from notice_id then raise exception 'FAN_WEB_NOT_FOUND'; end if;
 select * into existing from public.fan_posts where app_user_id=p_app_user_id and idempotency_key=p_idempotency_key;
 if found and existing.program_notice_id is distinct from notice_id then raise exception 'FAN_WEB_CONFLICT'; end if;
 result:=public.save_fan_post(p_app_user_id,p_slug,null,p_body,p_visibility,p_asset_ids,null,p_idempotency_key);
 if (result->>'replayed')::boolean then return result; end if;
 v_post_id:=(result->>'id')::uuid;
 update public.fan_posts set program_notice_id=notice_id where id=v_post_id;
 if exists(select 1 from public.content_assets a where a.post_id=v_post_id and a.uploaded_at is not null and a.deleted_at is null and a.cleanup_requested_at is null)
 or exists(select 1 from public.mobile_media_assets a where a.attached_type='fan_post' and a.attached_id=v_post_id and a.kind='image' and a.state='ready' and a.storage_deleted_at is null) then
  insert into public.fan_program_stamps(app_user_id,program_notice_id) values(p_app_user_id,notice_id) on conflict do nothing;
 end if;
 return result;
end $$;

create function public.award_fan_program_comment_stamp() returns trigger language plpgsql security definer set search_path='' as $$
declare notice_id uuid; target_type text;
begin
 if tg_table_name='celebrity_notice_comments' then
  notice_id:=new.notice_id; target_type:='notice_comment';
  if new.parent_id is not null and not exists(select 1 from public.celebrity_notice_comments p where p.id=new.parent_id and p.notice_id=new.notice_id and p.removed_at is null
   and public.fan_web_content_visible(null,'notice_comment',p.id)) then return new; end if;
 else
  select p.program_notice_id into notice_id from public.fan_posts p where p.id=new.post_id and p.visibility='public';
  target_type:='fan_post_comment';
 end if;
 if not exists(select 1 from public.celebrity_notices n where n.id=notice_id and n.id=public.fan_program_notice('kyaa-wave-fanpage',n.slug)) then return new; end if;
 perform public.fan_web_lock_active_user(new.app_user_id);
 if not public.fan_web_content_visible(null,target_type,new.id) then return new; end if;
 insert into public.fan_program_stamps(app_user_id,program_notice_id) values(new.app_user_id,notice_id) on conflict do nothing;
 return new;
end $$;
create trigger fan_program_comment_stamp after insert on public.celebrity_notice_comments for each row execute function public.award_fan_program_comment_stamp();
create trigger fan_program_comment_stamp after insert on public.fan_post_comments for each row execute function public.award_fan_program_comment_stamp();

create function public.read_fan_program_posts(p_app_user_id uuid,p_slug text,p_program text,p_before timestamptz default null,p_before_id uuid default null,p_limit integer default 20,p_locale public.content_locale default 'ko')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare notice_id uuid; result jsonb;
begin
 if p_limit is null or p_limit not between 1 and 50 or (p_before is null)<>(p_before_id is null) or p_locale is null then raise exception 'FAN_WEB_INVALID_INPUT'; end if;
 notice_id:=public.fan_program_notice(p_slug,p_program);
 if notice_id is null or not public.fan_web_content_visible(p_app_user_id,'notice',notice_id) then raise exception 'FAN_WEB_NOT_FOUND'; end if;
 with candidates as materialized(
  select p.id,p.created_at from public.fan_posts p where p.program_notice_id=notice_id
   and public.fan_web_content_visible(p_app_user_id,'fan_post',p.id)
   and (p_before is null or (p.created_at,p.id)<(p_before,p_before_id))
  order by p.created_at desc,p.id desc limit p_limit+1
 ), page as(select * from candidates order by created_at desc,id desc limit p_limit)
 select jsonb_build_object('items',coalesce((select jsonb_agg(public.fan_web_post_json(p_app_user_id,id,p_locale) order by created_at desc,id desc) from page),'[]'::jsonb),
  'hasMore',(select count(*)>p_limit from candidates)) into result;
 return result;
end $$;

create function public.read_owned_fan_program_stamps(p_app_user_id uuid,p_slug text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform public.fan_web_lock_active_user(p_app_user_id);
 if p_slug is distinct from 'kyaa-wave-fanpage' or not exists(select 1 from public.celebrities where slug=p_slug and status='published' and archived_at is null) then raise exception 'FAN_WEB_NOT_FOUND'; end if;
 return jsonb_build_object('stamps',coalesce((select jsonb_agg(jsonb_build_object('program',n.slug,'earnedAt',s.earned_at) order by s.earned_at,n.slug)
 from public.fan_program_stamps s join public.celebrity_notices n on n.id=s.program_notice_id
 where s.app_user_id=p_app_user_id and n.id=public.fan_program_notice(p_slug,n.slug)),'[]'::jsonb));
end $$;

revoke all on function public.fan_program_notice(text,text),public.guard_fan_program_post(),public.award_fan_program_comment_stamp(),public.save_fan_program_post(uuid,text,text,text,text,uuid[],uuid),public.read_fan_program_posts(uuid,text,text,timestamptz,uuid,integer,public.content_locale),public.read_owned_fan_program_stamps(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.save_fan_program_post(uuid,text,text,text,text,uuid[],uuid),public.read_fan_program_posts(uuid,text,text,timestamptz,uuid,integer,public.content_locale),public.read_owned_fan_program_stamps(uuid,text) to service_role;
commit;
