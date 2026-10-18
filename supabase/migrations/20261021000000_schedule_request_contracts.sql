alter table public.schedule_suggestions add column is_online boolean not null default false;

create or replace function public.fan_web_suggestion_json(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',s.id,'celebritySlug',case when c.status='published' and c.archived_at is null then c.slug else null end,
    'kind',s.kind,'title',s.title,'description',s.description,'startsAt',s.starts_at,'endsAt',s.ends_at,'timeZone',s.time_zone,
    'isOnline',s.is_online,'location',s.location,'participationInstructions',s.participation_instructions,'sourceUrl',s.source_url,'locale',s.locale,
    'status',s.status,'revision',s.revision,'reviewReason',s.review_reason,'reviewedAt',s.reviewed_at,
    'scheduleId',s.schedule_id,'scheduleHref',case when public.fan_web_schedule_json(s.schedule_id,null,s.locale) is not null then '/live/calendar/schedules/'||s.schedule_id::text else null end,'createdAt',s.created_at)
  from public.schedule_suggestions s join public.celebrities c on c.id=s.celebrity_id where s.id=p_id;
$$;

create or replace function public.fan_web_submit_schedule_suggestion(p_app_user_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_creator uuid; v_hash text:=encode(extensions.digest((p_payload-'idempotencyKey')::text,'sha256'),'hex'); r public.schedule_suggestions%rowtype;
begin
  perform public.fan_web_lock_active_user(p_app_user_id);
  select * into r from public.schedule_suggestions where app_user_id=p_app_user_id and idempotency_key=(p_payload->>'idempotencyKey')::uuid;
  if found then
    if r.request_hash<>v_hash then raise exception 'FAN_WEB_IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('item',public.fan_web_suggestion_json(r.id),'replayed',true);
  end if;
  if (select count(*) from public.schedule_suggestions where app_user_id=p_app_user_id and created_at>clock_timestamp()-interval '24 hours')>=5 then raise exception 'FAN_WEB_RATE_LIMIT'; end if;
  select id into v_creator from public.celebrities where slug=p_payload->>'celebritySlug' and status='published' and archived_at is null;
  if v_creator is null then raise exception 'FAN_WEB_NOT_FOUND'; end if;
  insert into public.schedule_suggestions(app_user_id,celebrity_id,kind,title,description,starts_at,ends_at,time_zone,is_online,location,participation_instructions,source_url,locale,idempotency_key,request_hash)
    values(p_app_user_id,v_creator,p_payload->>'kind',btrim(p_payload->>'title'),coalesce(p_payload->>'description',''),(p_payload->>'startsAt')::timestamptz,(p_payload->>'endsAt')::timestamptz,p_payload->>'timeZone',coalesce((p_payload->>'isOnline')::boolean,false),coalesce(p_payload->>'location',''),coalesce(p_payload->>'participationInstructions',''),p_payload->>'sourceUrl',(p_payload->>'locale')::public.content_locale,(p_payload->>'idempotencyKey')::uuid,v_hash) returning id into v_id;
  return jsonb_build_object('item',public.fan_web_suggestion_json(v_id),'replayed',false);
end $$;

create or replace function public.fan_web_check_fanpage_request(p_name text,p_official_social_url text,p_locale public.content_locale)
returns jsonb language sql stable security definer set search_path='' as $$
  with matches as (
    select c.id,jsonb_build_object('slug',c.slug,'name',l.name,'imageUrl',c.image_url,'href','/'||c.slug) item,
      exists(select 1 from public.celebrity_social_links x where x.celebrity_id=c.id and x.active and public.fan_web_social_profile_key(x.url)=public.fan_web_social_profile_key(p_official_social_url)) social_match,
      lower(btrim(l.name))=lower(btrim(p_name)) name_match,c.display_order
    from public.celebrities c join public.celebrity_localizations l on l.celebrity_id=c.id and l.locale=p_locale
    where c.status='published' and c.archived_at is null
  ), existing as (
    select item from matches where social_match order by display_order,id limit 1
  ), possible as (
    select item,display_order,id from matches where name_match and not social_match order by display_order,id
    limit (5-(select count(*) from existing))
  ), possible_json as (
    select coalesce(jsonb_agg(item order by display_order,id),'[]'::jsonb) items from possible
  )
  select jsonb_build_object('existingFanpage',coalesce((select item from existing),'null'::jsonb),'possibleMatches',possible_json.items,
    'artists',coalesce((select jsonb_build_array(item) from existing),'[]'::jsonb)||possible_json.items)
  from possible_json;
$$;
