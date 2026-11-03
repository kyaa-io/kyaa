begin;
-- Creators without a group retain their existing public-content and Wave gates.
create or replace function public.require_group_content_member(p_actor uuid,p_celebrity uuid)
returns void language plpgsql security definer set search_path='' as $$
declare page uuid;
begin
 select id into page from public.group_pages where celebrity_id=p_celebrity;
 if page is null then return;end if;
 perform pg_advisory_xact_lock(hashtextextended('groups-page:'||page::text,0));
 if not public.fan_web_is_page_member(p_actor,p_celebrity)then raise exception 'FAN_WEB_FORBIDDEN' using errcode='42501';end if;
end $$;
commit;
