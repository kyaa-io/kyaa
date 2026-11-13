begin;

-- 방 링크(오픈채팅·카페·디스코드·X·밴드): 모임 머리의 아이콘 줄에 붙는다. 종류는 서버가 호스트로 판별해 저장한다.
-- 원소: {"kind":"kakao-openchat|naver-cafe|discord|x|band","url":"https://..."}, 최대 3개.
create function public.group_external_links_valid(p jsonb) returns boolean language sql immutable set search_path='' as $$
 select case when jsonb_typeof(p)<>'array' or jsonb_array_length(p)>3 then false
  else not exists(select 1 from jsonb_array_elements(p) e where case when jsonb_typeof(e)<>'object' then true
   else not (e ? 'kind' and e ? 'url') or (e-'kind'-'url')<>'{}'::jsonb
    or jsonb_typeof(e->'kind')<>'string' or jsonb_typeof(e->'url')<>'string'
    or (e->>'kind') not in ('kakao-openchat','naver-cafe','discord','x','band')
    or length(e->>'url')>2048 or (e->>'url')!~'^https://[^/@[:space:]]+([/?#]|$)' end) end
$$;

alter table public.group_pages add column external_links jsonb not null default '[]'::jsonb
 check (public.group_external_links_valid(external_links));
alter table public.group_applications add column external_links jsonb not null default '[]'::jsonb
 check (public.group_external_links_valid(external_links));

-- 공개 상세·목록·해석이 모두 이 JSON을 쓴다.
create or replace function public.group_page_json(p_id uuid, p_locale text default null) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',g.id,'kind',g.kind,'celebrityId',g.celebrity_id,'slug',c.slug,'name',public.group_page_name(g.id,p_locale),'description',g.description,
 'imageUrl',g.image_url,'question',g.question,'anonymous',g.anonymous,'memberCount',(select count(*) from public.group_memberships m join public.app_users u on u.id=m.app_user_id and u.status='active' where m.page_id=g.id),
 'externalLinks',g.external_links)
 from public.group_pages g left join public.celebrities c on c.id=g.celebrity_id where g.id=p_id
$$;

-- 승인되면 신청의 방 링크가 페이지로 옮겨 간다. 이미 링크가 있는 페이지(기존 팬페이지)는 덮어쓰지 않는다.
create function public.group_application_copy_external_links() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='approved' and new.page_id is not null and new.external_links<>'[]'::jsonb
  and (old.status is distinct from 'approved' or old.page_id is distinct from new.page_id) then
  update public.group_pages set external_links=new.external_links where id=new.page_id and external_links='[]'::jsonb;
 end if;
 return new;
end $$;
create trigger group_application_copy_external_links after update of status,page_id on public.group_applications
 for each row execute function public.group_application_copy_external_links();

-- 신청·재신청·설정 저장이 externalLinks를 함께 받는다. 기존 디스패처 위에 얹고, 같은 트랜잭션에서 저장한다.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid)'::regprocedure);
 if position('FUNCTION public.groups_dispatch(' in definition)=0 then raise exception 'GROUP_EXTERNAL_LINKS_FUNCTION_SHAPE';end if;
 execute replace(definition,'FUNCTION public.groups_dispatch(','FUNCTION public.groups_dispatch_before_external_links(');
end $$;
create or replace function public.groups_dispatch(p_operation text,p_actor uuid default null,p_page_id uuid default null,p_item_id uuid default null,p_input jsonb default '{}',p_admin_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;links jsonb;replay boolean;
begin
 if p_operation not in ('apply','revise','settings') or not (p_input ? 'externalLinks') then
  return public.groups_dispatch_before_external_links(p_operation,p_actor,p_page_id,p_item_id,p_input,p_admin_id);
 end if;
 links:=p_input->'externalLinks';
 if not public.group_external_links_valid(links) then raise exception 'GROUPS_INVALID_REQUEST';end if;
 select exists(select 1 from public.group_action_receipts where actor_id=p_actor and request_id=(p_input->>'requestId')::uuid) into replay;
 result:=public.groups_dispatch_before_external_links(p_operation,p_actor,p_page_id,p_item_id,p_input,p_admin_id);
 if replay then return result;end if;
 if p_operation='settings' then
  update public.group_pages set external_links=links where id=p_page_id;
  result:=result||jsonb_build_object('externalLinks',links);
  update public.group_action_receipts set response=result where actor_id=p_actor and request_id=(p_input->>'requestId')::uuid and operation='settings';
 else
  update public.group_applications set external_links=links where id=(result->>'id')::uuid and applicant_id=p_actor;
 end if;
 return result;
end $$;

revoke all on function public.groups_dispatch_before_external_links(text,uuid,uuid,uuid,jsonb,uuid),public.group_application_copy_external_links() from public,anon,authenticated;
revoke all on function public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.groups_dispatch(text,uuid,uuid,uuid,jsonb,uuid),public.groups_dispatch_before_external_links(text,uuid,uuid,uuid,jsonb,uuid) to service_role;

commit;
