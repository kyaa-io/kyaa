begin;
create table public.group_membership_invitations(
 id uuid primary key,page_id uuid not null references public.group_pages(id),inviter_id uuid not null references public.app_users(id),
 recipient_email text not null check(length(recipient_email)<=254 and recipient_email=lower(btrim(recipient_email))and recipient_email~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 email_fingerprint text not null check(email_fingerprint~'^[a-f0-9]{64}$'),token_hash text not null unique check(token_hash~'^[a-f0-9]{64}$'),
 origin text not null check(origin in('https://dev.kyaa.io','https://kyaa.io')),locale text not null check(locale in('ko','en')),
 state text not null default'pending'check(state in('pending','accepted','declined','revoked','expired')),
 expires_at timestamptz not null,created_at timestamptz not null default clock_timestamp(),consumed_at timestamptz,
 recipient_app_user_id uuid references public.app_users(id),request_id uuid not null,input_hash text not null,
 decision_request_id uuid,decision_hash text,unique(inviter_id,request_id),unique(recipient_app_user_id,decision_request_id)
);
create unique index group_membership_invitation_pending on public.group_membership_invitations(page_id,email_fingerprint)where state='pending';
create table public.group_membership_invitation_consents(
 invitation_id uuid primary key references public.group_membership_invitations(id),app_user_id uuid not null references public.app_users(id),
 membership_version text not null,privacy_version text not null,consented_at timestamptz not null default clock_timestamp(),joined_at timestamptz not null
);
create table public.group_invitation_email_outbox(
 id uuid primary key default extensions.gen_random_uuid(),invitation_id uuid not null unique references public.group_membership_invitations(id),token_encrypted text,
 status text not null default'pending'check(status in('pending','claimed','sending','sent','failed','delivery_unknown','cancelled')),
 attempt_count integer not null default 0 check(attempt_count between 0 and 3),attempt_token uuid,lease_expires_at timestamptz,
 available_at timestamptz not null default clock_timestamp(),provider_message_id text,created_at timestamptz not null default clock_timestamp(),sent_at timestamptz,last_error text,
 check((status in('pending','claimed','sending')and token_encrypted is not null)or status in('sent','failed','delivery_unknown','cancelled'))
);
create index group_invitation_email_due on public.group_invitation_email_outbox(available_at,created_at)where status='pending';
create table public.group_invitation_delivery_test_sink(
 outbox_id uuid primary key references public.group_invitation_email_outbox(id),destination_fingerprint text not null,payload_hash text not null,created_at timestamptz not null default clock_timestamp()
);
do $$declare t text;begin foreach t in array array['group_membership_invitations','group_membership_invitation_consents','group_invitation_email_outbox','group_invitation_delivery_test_sink']loop execute format('alter table public.%I enable row level security',t);execute format('alter table public.%I force row level security',t);execute format('revoke all on table public.%I from public,anon,authenticated,service_role',t);end loop;end $$;
create function public.group_invitation_consent_immutable()returns trigger language plpgsql set search_path=''as $$begin raise exception 'GROUP_INVITATION_CONSENT_IMMUTABLE';end $$;
create trigger group_invitation_consent_immutable before update or delete on public.group_membership_invitation_consents for each row execute function public.group_invitation_consent_immutable();
create function public.group_invitation_staff(p_actor uuid,p_page uuid)returns boolean language sql stable security definer set search_path=''as $$
 select exists(select 1 from public.app_users u join public.group_memberships m on m.app_user_id=u.id join public.group_pages g on g.id=m.page_id where u.id=p_actor and u.status='active'and g.id=p_page and g.status='published'and m.role in('owner','manager')and public.group_scope_visible(p_actor,g.id))
$$;
create function public.group_membership_invitation_dispatch(p_operation text,p_actor uuid default null,p_page_id uuid default null,p_invitation_id uuid default null,p_input jsonb default'{}')returns jsonb language plpgsql security definer set search_path=''as $$
declare inv public.group_membership_invitations;email text;fingerprint text;logical_hash text;token text;req uuid;now_at timestamptz:=clock_timestamp();privacy_version text;decision text;membership jsonb;invitation_page uuid;begin
 if p_operation in('create','list','revoke')then
  if p_actor is null then raise exception 'GROUP_INVITATION_FORBIDDEN';end if;
  perform public.fan_web_lock_active_user(p_actor);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('groups-page:'||p_page_id::text,0));
  if not public.group_invitation_staff(p_actor,p_page_id)then raise exception 'GROUP_INVITATION_FORBIDDEN';end if;
 end if;
 if p_operation='create'then
  if jsonb_typeof(p_input)<>'object'or not(p_input ?& array['id','email','requestId','tokenHash','tokenEncrypted','origin','locale'])or exists(select 1 from jsonb_each(p_input)where jsonb_typeof(value)<>'string')or p_input-array['id','email','requestId','tokenHash','tokenEncrypted','origin','locale']<>'{}'::jsonb then raise exception 'GROUP_INVITATION_INVALID';end if;
  email:=lower(btrim(p_input->>'email'));req:=(p_input->>'requestId')::uuid;
  if email is null or length(email)>254 or email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'or email~'[[:cntrl:]]'or req is null or(p_input->>'tokenHash')!~'^[a-f0-9]{64}$'or(p_input->>'tokenEncrypted')!~'^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$'or length(p_input->>'tokenEncrypted')>512 or(p_input->>'origin')not in('https://dev.kyaa.io','https://kyaa.io')or(p_input->>'locale')not in('ko','en')then raise exception 'GROUP_INVITATION_INVALID';end if;
  logical_hash:=encode(extensions.digest(jsonb_build_object('pageId',p_page_id,'email',email,'locale',p_input->>'locale','origin',p_input->>'origin')::text,'sha256'),'hex');
  -- Bound create/idempotency/rate checks and same-address supersession in one short global queue lock.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('group-invitation:create',0));
  select *into inv from public.group_membership_invitations where inviter_id=p_actor and request_id=req;
  if found then if inv.input_hash<>logical_hash then raise exception 'GROUP_INVITATION_CONFLICT';end if;return jsonb_build_object('id',inv.id,'status',inv.state,'expiresAt',inv.expires_at,'deliveryStatus',(select status from public.group_invitation_email_outbox where invitation_id=inv.id));end if;
  fingerprint:=encode(extensions.digest(email,'sha256'),'hex');
  if(select count(*)from public.group_membership_invitations where inviter_id=p_actor and created_at>now_at-interval'1 hour')>=20 or(select count(*)from public.group_membership_invitations where page_id=p_page_id and created_at>now_at-interval'24 hours')>=100 or exists(select 1 from public.group_membership_invitations where page_id=p_page_id and email_fingerprint=fingerprint and created_at>now_at-interval'1 minute')then raise exception 'GROUP_INVITATION_RATE_LIMITED';end if;
  update public.group_membership_invitations set state='revoked',consumed_at=now_at where page_id=p_page_id and email_fingerprint=fingerprint and state='pending';
  update public.group_invitation_email_outbox o set status='cancelled',token_encrypted=null,lease_expires_at=null where o.invitation_id in(select id from public.group_membership_invitations where page_id=p_page_id and email_fingerprint=fingerprint and state='revoked')and o.status in('pending','claimed');
  insert into public.group_membership_invitations(id,page_id,inviter_id,recipient_email,email_fingerprint,token_hash,origin,locale,expires_at,request_id,input_hash)
  values((p_input->>'id')::uuid,p_page_id,p_actor,email,fingerprint,p_input->>'tokenHash',p_input->>'origin',p_input->>'locale',now_at+interval'7 days',req,logical_hash)returning *into inv;
  insert into public.group_invitation_email_outbox(invitation_id,token_encrypted)values(inv.id,p_input->>'tokenEncrypted');
  return jsonb_build_object('id',inv.id,'status','pending','expiresAt',inv.expires_at,'deliveryStatus','pending');
 elsif p_operation='list'then
  return jsonb_build_object('items',coalesce((select jsonb_agg(x order by x."createdAt" desc)from(select i.id,case when i.state='pending'and i.expires_at<=now_at then'expired'else i.state end as status,i.created_at as "createdAt",i.expires_at as "expiresAt",'***@'||split_part(i.recipient_email,'@',2)as "recipientLabel",o.status as "deliveryStatus"from public.group_membership_invitations i join public.group_invitation_email_outbox o on o.invitation_id=i.id where i.page_id=p_page_id order by i.created_at desc limit 50)x),'[]'::jsonb));
 elsif p_operation='revoke'then
  select *into inv from public.group_membership_invitations where id=p_invitation_id and page_id=p_page_id for update;
  if not found then raise exception 'GROUP_INVITATION_NOT_FOUND';end if;
  if inv.state not in('pending','revoked')then raise exception 'GROUP_INVITATION_CONFLICT';end if;
  update public.group_membership_invitations set state='revoked',consumed_at=coalesce(consumed_at,now_at)where id=inv.id;
  update public.group_invitation_email_outbox set status='cancelled',token_encrypted=null,lease_expires_at=null where invitation_id=inv.id and status in('pending','claimed');
  return jsonb_build_object('id',inv.id,'status','revoked');
 end if;
 if p_operation not in('preview','accept','decline')then raise exception 'GROUP_INVITATION_INVALID';end if;
 if p_input->>'tokenHash'is null or(p_input->>'tokenHash')!~'^[a-f0-9]{64}$'then raise exception 'GROUP_INVITATION_NOT_FOUND';end if;
 -- Match the common groups writer order: actor, page, then invitation row.
 -- The initial lookup discovers only the lock key; authorization is rechecked below.
 if p_actor is not null then perform public.fan_web_lock_active_user(p_actor);end if;
 if p_operation='preview'then select *into inv from public.group_membership_invitations where id=p_invitation_id and token_hash=p_input->>'tokenHash';
 else
  select page_id into invitation_page from public.group_membership_invitations where id=p_invitation_id and token_hash=p_input->>'tokenHash';
  if not found then raise exception 'GROUP_INVITATION_NOT_FOUND';end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('groups-page:'||invitation_page::text,0));
  select *into inv from public.group_membership_invitations where id=p_invitation_id and token_hash=p_input->>'tokenHash'for update;
 end if;
 if not found or inv.expires_at<=now_at or inv.state in('revoked','expired')or not public.group_invitation_staff(inv.inviter_id,inv.page_id)then raise exception 'GROUP_INVITATION_NOT_FOUND';end if;
 if p_actor is not null then
  if not exists(select 1 from public.app_users where id=p_actor and status='active'and verified_email=inv.recipient_email)then raise exception 'GROUP_INVITATION_NOT_FOUND';end if;
  privacy_version:=public.get_owned_account_onboarding(p_actor)->>'policyVersion';
 end if;
 if p_operation='preview'then return jsonb_build_object('id',inv.id,'status',inv.state,'pageId',inv.page_id,'pageName',(select name from public.group_pages where id=inv.page_id),'pageHref','/pages/groups/'||inv.page_id,'question',(select question from public.group_pages where id=inv.page_id),'loginRequired',p_actor is null,'membershipVersion','group-membership-v1','privacyVersion',privacy_version,'expiresAt',inv.expires_at);end if;
 if p_actor is null then raise exception 'GROUP_INVITATION_FORBIDDEN';end if;
 req:=(p_input->>'requestId')::uuid;decision:=p_operation;
 if req is null or jsonb_typeof(p_input)<>'object'or p_input-array['tokenHash','requestId','membershipConsent','privacyConsent','membershipVersion','privacyVersion','answer']<>'{}'::jsonb then raise exception 'GROUP_INVITATION_INVALID';end if;
 logical_hash:=encode(extensions.digest(jsonb_build_object('action',decision,'input',p_input-'requestId')::text,'sha256'),'hex');
 if inv.state in('accepted','declined')then
  if inv.recipient_app_user_id<>p_actor or inv.state<>(case when decision='accept'then'accepted'else'declined'end) or(inv.decision_request_id=req and inv.decision_hash<>logical_hash)then raise exception 'GROUP_INVITATION_CONFLICT';end if;
  return jsonb_build_object('id',inv.id,'status',inv.state,'pageId',inv.page_id);
 end if;
 if decision='accept'then
  if p_input->'membershipConsent'is distinct from'true'::jsonb or p_input->'privacyConsent'is distinct from'true'::jsonb or p_input->>'membershipVersion'is distinct from'group-membership-v1'or p_input->>'privacyVersion'is distinct from privacy_version then raise exception 'GROUP_INVITATION_CONSENT_REQUIRED';end if;
  membership:=public.groups_dispatch('join',p_actor,inv.page_id,null,jsonb_build_object('requestId',req,'answer',coalesce(p_input->>'answer','')));
  insert into public.group_membership_invitation_consents(invitation_id,app_user_id,membership_version,privacy_version,joined_at)values(inv.id,p_actor,'group-membership-v1',privacy_version,(membership->>'joinedAt')::timestamptz);
 end if;
 update public.group_membership_invitations set state=case when decision='accept'then'accepted'else'declined'end,recipient_app_user_id=p_actor,consumed_at=now_at,decision_request_id=req,decision_hash=logical_hash where id=inv.id;
 update public.group_invitation_email_outbox set status='cancelled',token_encrypted=null,lease_expires_at=null where invitation_id=inv.id and status in('pending','claimed');
 return jsonb_build_object('id',inv.id,'status',case when decision='accept'then'accepted'else'declined'end,'pageId',inv.page_id);
end $$;

create function public.maintain_group_invitation_email()returns void language plpgsql security definer set search_path=''as $$begin
 update public.group_membership_invitations set state='expired',consumed_at=clock_timestamp()where state='pending'and expires_at<=clock_timestamp();
 update public.group_invitation_email_outbox set status='delivery_unknown',token_encrypted=null,last_error='DELIVERY_UNKNOWN',lease_expires_at=null where status='sending'and lease_expires_at<=clock_timestamp();
 update public.group_invitation_email_outbox o set status='cancelled',token_encrypted=null,lease_expires_at=null where status in('pending','claimed')and exists(select 1 from public.group_membership_invitations i where i.id=o.invitation_id and(i.state<>'pending'or i.expires_at<=clock_timestamp()or not public.group_invitation_staff(i.inviter_id,i.page_id)));
 update public.group_invitation_email_outbox set status='pending',attempt_token=null,lease_expires_at=null where status='claimed'and lease_expires_at<=clock_timestamp();
end $$;
create function public.claim_group_invitation_email(p_environment text)returns jsonb language plpgsql security definer set search_path=''as $$
declare job public.group_invitation_email_outbox;i public.group_membership_invitations;begin
 if p_environment not in('dev','prod')then raise exception 'GROUP_INVITATION_INVALID';end if;
 perform public.maintain_group_invitation_email();
 select o.*into job from public.group_invitation_email_outbox o join public.group_membership_invitations inv on inv.id=o.invitation_id where o.status='pending'and o.available_at<=clock_timestamp()and inv.origin=case when p_environment='dev'then'https://dev.kyaa.io'else'https://kyaa.io'end and inv.state='pending'and inv.expires_at>clock_timestamp()order by o.created_at for update of o skip locked limit 1;
 if not found then return null;end if;
 update public.group_invitation_email_outbox set status='claimed',attempt_token=extensions.gen_random_uuid(),lease_expires_at=clock_timestamp()+interval'60 seconds'where id=job.id returning *into job;
 select *into i from public.group_membership_invitations where id=job.invitation_id;
 return jsonb_build_object('id',job.id,'invitationId',i.id,'pageId',i.page_id,'attemptToken',job.attempt_token,'email',i.recipient_email,'tokenEncrypted',job.token_encrypted,'tokenHash',i.token_hash,'origin',i.origin,'locale',i.locale,'pageName',(select name from public.group_pages where id=i.page_id));
end $$;
create function public.begin_group_invitation_email_send(p_id uuid,p_token uuid)returns boolean language plpgsql security definer set search_path=''as $$begin
 update public.group_invitation_email_outbox o set status='sending',attempt_count=attempt_count+1,lease_expires_at=clock_timestamp()+interval'60 seconds'where o.id=p_id and o.attempt_token=p_token and o.status='claimed'and o.lease_expires_at>clock_timestamp()and exists(select 1 from public.group_membership_invitations i where i.id=o.invitation_id and i.state='pending'and i.expires_at>clock_timestamp()and public.group_invitation_staff(i.inviter_id,i.page_id));
 return found;
end $$;
create function public.finish_group_invitation_email_send(p_id uuid,p_token uuid,p_outcome text,p_provider_id text default null)returns boolean language plpgsql security definer set search_path=''as $$begin
 if p_outcome not in('sent','throttled','rejected','unknown')or(p_outcome='sent'and(nullif(btrim(p_provider_id),'')is null or length(p_provider_id)>200))then raise exception 'GROUP_INVITATION_INVALID';end if;
 update public.group_invitation_email_outbox set status=case when p_outcome='sent'then'sent'when p_outcome='throttled'and attempt_count<3 then'pending'when p_outcome='unknown'then'delivery_unknown'else'failed'end,
 token_encrypted=case when p_outcome='throttled'and attempt_count<3 then token_encrypted else null end,
 available_at=case when p_outcome='throttled'then clock_timestamp()+interval'5 minutes'else available_at end,provider_message_id=case when p_outcome='sent'then p_provider_id else null end,
 sent_at=case when p_outcome='sent'then clock_timestamp()else null end,last_error=case when p_outcome='throttled'then'THROTTLED'when p_outcome='rejected'then'REJECTED'when p_outcome='unknown'then'DELIVERY_UNKNOWN'else null end,lease_expires_at=null
 where id=p_id and attempt_token=p_token and status='sending';return found;
end $$;
create function public.record_group_invitation_email_test_sink(p_id uuid,p_token uuid,p_payload_hash text)returns text language plpgsql security definer set search_path=''as $$begin
 if p_payload_hash!~'^[a-f0-9]{64}$'or not exists(select 1 from public.group_invitation_email_outbox o join public.group_membership_invitations i on i.id=o.invitation_id where o.id=p_id and o.attempt_token=p_token and o.status='sending'and i.origin='https://dev.kyaa.io')then raise exception 'GROUP_INVITATION_FORBIDDEN';end if;
 insert into public.group_invitation_delivery_test_sink(outbox_id,destination_fingerprint,payload_hash)select o.id,i.email_fingerprint,p_payload_hash from public.group_invitation_email_outbox o join public.group_membership_invitations i on i.id=o.invitation_id where o.id=p_id on conflict(outbox_id)do nothing;
 return'test-sink:'||p_id;
end $$;
revoke all on function public.group_invitation_consent_immutable(),public.group_invitation_staff(uuid,uuid),public.group_membership_invitation_dispatch(text,uuid,uuid,uuid,jsonb),public.maintain_group_invitation_email(),public.claim_group_invitation_email(text),public.begin_group_invitation_email_send(uuid,uuid),public.finish_group_invitation_email_send(uuid,uuid,text,text),public.record_group_invitation_email_test_sink(uuid,uuid,text)from public,anon,authenticated,service_role;
grant execute on function public.group_membership_invitation_dispatch(text,uuid,uuid,uuid,jsonb),public.maintain_group_invitation_email(),public.claim_group_invitation_email(text),public.begin_group_invitation_email_send(uuid,uuid),public.finish_group_invitation_email_send(uuid,uuid,text,text),public.record_group_invitation_email_test_sink(uuid,uuid,text)to service_role;
commit;
