begin;

-- 방장 패스: kyaa 관리자가 연락한 방장에게 보내는 1회용 링크. 원문 토큰은 어디에도 저장하지 않고 sha256 해시만 둔다.
-- 패스로 낸 모임 신청은 운영 경험 증빙 없이, 제출 즉시 기존 승인 경로로 승인된다.
create table public.group_leader_passes (
 id uuid primary key default extensions.gen_random_uuid(),
 token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
 label text not null check (length(btrim(label)) between 1 and 100),
 created_by uuid not null references public.app_users(id),
 created_admin_id uuid not null references public.admin_allowlist(id),
 expires_at timestamptz not null,
 used_at timestamptz,
 used_by uuid references public.app_users(id),
 page_id uuid references public.group_pages(id),
 request_id uuid,
 revoked_at timestamptz,
 created_at timestamptz not null default now(),
 check ((used_at is null) = (used_by is null))
);
alter table public.group_leader_passes enable row level security;
alter table public.group_leader_passes force row level security;
revoke all on public.group_leader_passes from public,anon,authenticated,service_role;

create function public.group_leader_pass_issue(p_actor uuid,p_admin_id uuid,p_label text,p_days integer,p_token_hash text)returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.group_leader_passes;
begin
 begin perform public.assert_active_admin(p_actor,p_admin_id,true);exception when others then raise exception 'GROUPS_FORBIDDEN';end;
 if p_days is null or p_days not between 1 and 30 or p_token_hash is null or p_token_hash!~'^[0-9a-f]{64}$' or length(btrim(coalesce(p_label,''))) not between 1 and 100 then raise exception 'GROUPS_INVALID_REQUEST';end if;
 insert into public.group_leader_passes(token_hash,label,created_by,created_admin_id,expires_at)
  values(p_token_hash,btrim(p_label),p_actor,p_admin_id,now()+make_interval(days=>p_days))returning * into p;
 insert into public.audit_logs(actor_app_user_id,actor_admin_allowlist_id,action,entity_type,entity_id,before_after_summary)
  values(p_actor,p_admin_id,'groups.leader_pass.issue','group_leader_pass',p.id::text,jsonb_build_object('label',p.label,'expiresAt',p.expires_at));
 return jsonb_build_object('id',p.id,'label',p.label,'expiresAt',p.expires_at);
end $$;

create function public.group_leader_pass_list(p_actor uuid,p_admin_id uuid)returns jsonb language plpgsql security definer set search_path='' as $$
begin
 begin perform public.assert_active_admin(p_actor,p_admin_id,false);exception when others then raise exception 'GROUPS_FORBIDDEN';end;
 return jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'label',x.label,
   'status',case when x.used_at is not null then 'used' when x.revoked_at is not null then 'revoked' when x.expires_at<=now() then 'expired' else 'active' end,
   'createdAt',x.created_at,'expiresAt',x.expires_at,'usedAt',x.used_at,'pageId',x.page_id,'pageName',g.name)order by x.created_at desc)
  from (select * from public.group_leader_passes order by created_at desc limit 50)x left join public.group_pages g on g.id=x.page_id),'[]'::jsonb));
end $$;

create function public.group_leader_pass_revoke(p_actor uuid,p_admin_id uuid,p_id uuid)returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.group_leader_passes;
begin
 begin perform public.assert_active_admin(p_actor,p_admin_id,true);exception when others then raise exception 'GROUPS_FORBIDDEN';end;
 select * into p from public.group_leader_passes where id=p_id for update;
 if not found then raise exception 'GROUPS_NOT_FOUND';end if;
 if p.used_at is not null or p.revoked_at is not null then raise exception 'GROUPS_CONFLICT';end if;
 update public.group_leader_passes set revoked_at=now() where id=p.id;
 insert into public.audit_logs(actor_app_user_id,actor_admin_allowlist_id,action,entity_type,entity_id,before_after_summary)
  values(p_actor,p_admin_id,'groups.leader_pass.revoke','group_leader_pass',p.id::text,jsonb_build_object('label',p.label));
 return jsonb_build_object('id',p.id,'status','revoked');
end $$;

-- 신청 화면이 패스를 읽는다: 쓸 수 있으면 {valid:true,label}, 아니면 {valid:false}. 이유(없음·사용됨·만료·취소)는 구분해 알려 주지 않는다.
create function public.group_leader_pass_check(p_actor uuid,p_token_hash text)returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.group_leader_passes;
begin
 if not exists(select 1 from public.app_users where id=p_actor and status='active')then raise exception 'GROUPS_FORBIDDEN';end if;
 select * into p from public.group_leader_passes where token_hash=p_token_hash;
 if not found or p.used_at is not null or p.revoked_at is not null or p.expires_at<=now() then return jsonb_build_object('valid',false);end if;
 return jsonb_build_object('valid',true,'label',p.label);
end $$;

-- 패스로 열기: 신청을 넣고 기존 승인 경로(관리자 승인과 같은 함수)를 같은 트랜잭션에서 호출한 뒤 패스를 쓴 것으로 표시한다.
-- 같은 요청의 재전송은 같은 pageId를 돌려주고, 다른 요청·다른 사람의 재사용은 거절한다. 한 패스로는 모임 하나만 연다.
create function public.group_application_submit_with_pass(p_actor uuid,p_token_hash text,p_input jsonb)returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.group_leader_passes;req uuid;v_name text;v_desc text;apply_input jsonb;applied jsonb;app_id uuid;reviewed jsonb;v_page uuid;
begin
 if not exists(select 1 from public.app_users where id=p_actor and status='active')then raise exception 'GROUPS_FORBIDDEN';end if;
 if p_token_hash is null or p_token_hash!~'^[0-9a-f]{64}$' then raise exception 'GROUPS_NOT_FOUND';end if;
 req:=(p_input->>'requestId')::uuid;
 v_name:=btrim(coalesce(p_input->>'name',''));v_desc:=btrim(coalesce(p_input->>'description',''));
 if req is null or length(v_name) not between 1 and 100 or length(v_desc)>1000 then raise exception 'GROUPS_INVALID_REQUEST';end if;
 perform pg_advisory_xact_lock(hashtextextended('leader-pass:'||p_token_hash,0));
 select * into p from public.group_leader_passes where token_hash=p_token_hash for update;
 if not found then raise exception 'GROUPS_NOT_FOUND';end if;
 if p.used_at is not null then
  if p.used_by=p_actor and p.request_id=req and p.page_id is not null then return jsonb_build_object('pageId',p.page_id);end if;
  raise exception 'GROUPS_CONFLICT';
 end if;
 if p.revoked_at is not null or p.expires_at<=now() then raise exception 'GROUPS_CONFLICT';end if;
 -- 신청 표의 소개는 비울 수 없어 이름으로 채우고, 페이지 소개는 입력한 그대로(비어 있을 수 있음) 다시 쓴다.
 apply_input:=jsonb_build_object('kind','hobby','name',v_name,'description',coalesce(nullif(v_desc,''),v_name),'requestId',req);
 if p_input->>'imageAssetId' is not null then apply_input:=apply_input||jsonb_build_object('imageAssetId',p_input->>'imageAssetId');end if;
 if p_input?'externalLinks' then apply_input:=apply_input||jsonb_build_object('externalLinks',p_input->'externalLinks');end if;
 applied:=public.groups_dispatch('apply',p_actor,null,null,apply_input,null);
 app_id:=(applied->>'id')::uuid;
 reviewed:=public.groups_content_dispatch('review',p.created_by,null,app_id,jsonb_build_object('action','approve','reason','leader-pass','requestId',extensions.gen_random_uuid()),p.created_admin_id);
 v_page:=(reviewed->>'pageId')::uuid;
 if v_page is null then raise exception 'GROUPS_CONFLICT';end if;
 update public.group_pages set description=v_desc where id=v_page;
 update public.group_leader_passes set used_at=now(),used_by=p_actor,page_id=v_page,request_id=req where id=p.id;
 insert into public.audit_logs(actor_app_user_id,actor_admin_allowlist_id,action,entity_type,entity_id,before_after_summary)
  values(p_actor,p.created_admin_id,'groups.leader_pass.use','group_leader_pass',p.id::text,jsonb_build_object('pageId',v_page,'applicationId',app_id));
 return jsonb_build_object('pageId',v_page,'applicationId',app_id);
end $$;

revoke all on function public.group_leader_pass_issue(uuid,uuid,text,integer,text),public.group_leader_pass_list(uuid,uuid),public.group_leader_pass_revoke(uuid,uuid,uuid),public.group_leader_pass_check(uuid,text),public.group_application_submit_with_pass(uuid,text,jsonb)from public,anon,authenticated;
grant execute on function public.group_leader_pass_issue(uuid,uuid,text,integer,text),public.group_leader_pass_list(uuid,uuid),public.group_leader_pass_revoke(uuid,uuid,uuid),public.group_leader_pass_check(uuid,text),public.group_application_submit_with_pass(uuid,text,jsonb)to service_role;

commit;
