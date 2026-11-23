-- Synthetic-only; execute solely in an isolated cluster after the migrations.
begin;
create or replace function pg_temp.expect_error(p_sql text,p_marker text)
returns void language plpgsql as $$ begin execute p_sql; raise exception 'expected:%',p_marker;
exception when others then if sqlerrm='expected:'||p_marker or position(p_marker in sqlerrm)=0 then raise; end if; end $$;
do $$
declare
  admin_id uuid:=extensions.gen_random_uuid(); allow_id uuid:=extensions.gen_random_uuid();
  opr_id uuid:=extensions.gen_random_uuid(); opr_allow uuid:=extensions.gen_random_uuid();
  old_admin uuid:=extensions.gen_random_uuid(); old_allow uuid:=extensions.gen_random_uuid();
  member uuid:=extensions.gen_random_uuid(); newbie uuid:=extensions.gen_random_uuid(); stranger uuid:=extensions.gen_random_uuid();
  late uuid:=extensions.gen_random_uuid(); cancelled_user uuid:=extensions.gen_random_uuid(); orphan uuid:=extensions.gen_random_uuid(); mover uuid:=extensions.gen_random_uuid();
  chan_a uuid:=extensions.gen_random_uuid(); chan_b uuid:=extensions.gen_random_uuid(); chan_c uuid:=extensions.gen_random_uuid();
  corr uuid:=extensions.gen_random_uuid(); res jsonb; inv_a uuid; inv_b uuid; inv_cancel uuid; inv_late uuid; inv_orphan uuid; job jsonb; items jsonb;
begin
  insert into public.app_users(id,privy_user_id,verified_email) values
    (admin_id,'did:privy:oi-admin','oi-admin@example.test'),(opr_id,'did:privy:oi-opr','oi-opr@example.test'),
    (old_admin,'did:privy:oi-old','oi-old@example.test'),(member,'did:privy:oi-member','oi-member@example.test');
  insert into public.admin_allowlist(id,email,role,active) values
    (allow_id,'oi-admin@example.test','admin',true),(opr_allow,'oi-opr@example.test','operator',true),(old_allow,'oi-old@example.test','admin',true);
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values
    (chan_a,'oi-channel-a','published','/images/qa.webp',now(),'{creator}','creator'),
    (chan_b,'oi-channel-b','published','/images/qa.webp',now(),'{creator}','creator'),
    (chan_c,'oi-channel-c','published','/images/qa.webp',now(),'{creator}','creator');
  insert into public.celebrity_localizations(celebrity_id,locale,name,summary,image_alt) values
    (chan_a,'ko','오아이 채널','요약','이미지'),(chan_a,'en','OI Channel','Summary','Image');

  -- only a full admin may invite, cancel or list
  perform pg_temp.expect_error(format('select public.invite_channel_operator(%L,%L,%L,%L,%L,%L,%L)',opr_id,opr_allow,corr,chan_a,'x@example.test','ko','https://dev.kyaa.io'),'full admin required');
  perform pg_temp.expect_error(format('select public.list_channel_operator_invitations(%L,%L,%L)',opr_id,opr_allow,chan_a),'full admin required');

  -- an existing member is granted directly, no invitation stored
  res:=public.invite_channel_operator(admin_id,allow_id,corr,chan_a,' OI-Member@Example.test ','ko','https://dev.kyaa.io');
  if res->>'kind'<>'granted' or not exists(select 1 from public.channel_operators where celebrity_id=chan_a and app_user_id=member and status='active') then raise exception 'member not granted directly: %',res; end if;
  if exists(select 1 from public.channel_operator_invitations where recipient_email='oi-member@example.test') then raise exception 'member invitation stored'; end if;

  -- a non-member gets a normalized pending invitation for 14 days
  res:=public.invite_channel_operator(admin_id,allow_id,corr,chan_a,'  New.Person@Example.TEST ','ko','https://dev.kyaa.io');
  inv_a:=(res->>'id')::uuid;
  if res->>'kind'<>'invited' or res->>'status'<>'pending' then raise exception 'invite failed: %',res; end if;
  if not exists(select 1 from public.channel_operator_invitations where id=inv_a and recipient_email='new.person@example.test' and mail_status='pending'
    and expires_at between clock_timestamp()+interval '13 days 23 hours' and clock_timestamp()+interval '14 days 1 minute') then raise exception 'invitation shape wrong'; end if;
  if not exists(select 1 from public.audit_logs where entity_id=inv_a::text and action='channel_operator_invitation.created' and actor_admin_allowlist_id=allow_id
    and before_after_summary->>'recipientEmailSha256'=encode(extensions.digest('new.person@example.test','sha256'),'hex') and not (before_after_summary::text like '%new.person%')) then raise exception 'invite audit missing or leaks email'; end if;

  -- same email and channel is refused while pending; another channel is allowed
  perform pg_temp.expect_error(format('select public.invite_channel_operator(%L,%L,%L,%L,%L,%L,%L)',admin_id,allow_id,corr,chan_a,'NEW.person@example.test','en','https://dev.kyaa.io'),'operator invitation exists');
  inv_b:=(public.invite_channel_operator(admin_id,allow_id,corr,chan_b,'new.person@example.test','en','https://dev.kyaa.io')->>'id')::uuid;
  perform pg_temp.expect_error(format('select public.invite_channel_operator(%L,%L,%L,%L,%L,%L,%L)',admin_id,allow_id,corr,chan_a,'not-an-email','ko','https://dev.kyaa.io'),'operator invitation invalid');

  -- mail queue: claim per origin once, then finish
  if public.claim_channel_operator_invitation_email('https://kyaa.io') is not null then raise exception 'prod claimed a dev invitation'; end if;
  job:=public.claim_channel_operator_invitation_email('https://dev.kyaa.io');
  if (job->>'id')::uuid<>inv_a or job->>'channelName'<>'오아이 채널' or job->>'email'<>'new.person@example.test' or job ? 'token' then raise exception 'claim wrong: %',job; end if;
  if not public.finish_channel_operator_invitation_email(inv_a,'sent','ses-message-1') then raise exception 'finish failed'; end if;
  if public.finish_channel_operator_invitation_email(inv_a,'sent','ses-message-2') then raise exception 'finish replayed'; end if;
  job:=public.claim_channel_operator_invitation_email('https://dev.kyaa.io');
  if (job->>'id')::uuid<>inv_b or job->>'channelName'<>'oi-channel-b' then raise exception 'second claim wrong: %',job; end if;
  perform public.finish_channel_operator_invitation_email(inv_b,'failed');

  -- signing up with a different email grants nothing
  insert into public.app_users(id,privy_user_id,verified_email) values (stranger,'did:privy:oi-stranger','someone.else@example.test');
  if exists(select 1 from public.channel_operators where app_user_id=stranger) then raise exception 'stranger granted'; end if;

  -- signing up with the invited email accepts both channel invitations, nothing else
  insert into public.app_users(id,privy_user_id,verified_email) values (newbie,'did:privy:oi-newbie','new.person@example.test');
  if (select count(*) from public.channel_operators where app_user_id=newbie and status='active' and celebrity_id in(chan_a,chan_b))<>2
    or exists(select 1 from public.channel_operators where app_user_id=newbie and celebrity_id=chan_c) then raise exception 'auto accept grants wrong'; end if;
  if (select count(*) from public.channel_operator_invitations where id in(inv_a,inv_b) and status='accepted' and accepted_app_user_id=newbie and channel_operator_id is not null)<>2 then raise exception 'invitation not accepted'; end if;
  if (select count(*) from public.audit_logs where action='channel_operator.granted' and before_after_summary->>'invitationId' in(inv_a::text,inv_b::text) and actor_admin_allowlist_id=allow_id)<>2
    or (select count(*) from public.audit_logs where action='channel_operator_invitation.accepted' and entity_id in(inv_a::text,inv_b::text) and actor_app_user_id=newbie)<>2 then raise exception 'accept audit missing'; end if;
  -- the new operator passes the channel gate on the invited channel only
  perform public.assert_channel_operator(newbie,chan_a);
  perform pg_temp.expect_error(format('select public.assert_channel_operator(%L,%L)',newbie,chan_c),'active channel operator required');

  -- cancel: a cancelled invitation grants nothing and replays; accepted cannot be cancelled
  inv_cancel:=(public.invite_channel_operator(admin_id,allow_id,corr,chan_a,'cancel.me@example.test','ko','https://dev.kyaa.io')->>'id')::uuid;
  perform pg_temp.expect_error(format('select public.cancel_channel_operator_invitation(%L,%L,%L,%L,%L)',admin_id,allow_id,corr,chan_b,inv_cancel),'operator invitation not found');
  res:=public.cancel_channel_operator_invitation(admin_id,allow_id,corr,chan_a,inv_cancel);
  if res->>'status'<>'cancelled' or (res->>'replayed')::boolean then raise exception 'cancel failed: %',res; end if;
  if not (public.cancel_channel_operator_invitation(admin_id,allow_id,corr,chan_a,inv_cancel)->>'replayed')::boolean then raise exception 'cancel not replayed'; end if;
  if (select mail_status from public.channel_operator_invitations where id=inv_cancel)<>'cancelled' then raise exception 'cancelled mail still queued'; end if;
  if not exists(select 1 from public.audit_logs where entity_id=inv_cancel::text and action='channel_operator_invitation.cancelled') then raise exception 'cancel audit missing'; end if;
  perform pg_temp.expect_error(format('select public.cancel_channel_operator_invitation(%L,%L,%L,%L,%L)',admin_id,allow_id,corr,chan_a,inv_a),'operator invitation not pending');
  insert into public.app_users(id,privy_user_id,verified_email) values (cancelled_user,'did:privy:oi-cancelled','cancel.me@example.test');
  if exists(select 1 from public.channel_operators where app_user_id=cancelled_user) then raise exception 'cancelled invitation granted'; end if;

  -- expiry: an expired invitation is listed as expired, grants nothing, and can be re-sent
  inv_late:=(public.invite_channel_operator(admin_id,allow_id,corr,chan_a,'late@example.test','ko','https://dev.kyaa.io')->>'id')::uuid;
  update public.channel_operator_invitations set expires_at=clock_timestamp()-interval '1 second' where id=inv_late;
  items:=public.list_channel_operator_invitations(admin_id,allow_id,chan_a)->'items';
  if (select x->>'status' from jsonb_array_elements(items) x where x->>'id'=inv_late::text)<>'expired' then raise exception 'expired not listed'; end if;
  if (select x->>'status' from jsonb_array_elements(items) x where x->>'id'=inv_a::text)<>'accepted' then raise exception 'accepted not listed'; end if;
  if public.claim_channel_operator_invitation_email('https://dev.kyaa.io') is not null then raise exception 'expired mail claimed'; end if;
  perform pg_temp.expect_error(format('select public.cancel_channel_operator_invitation(%L,%L,%L,%L,%L)',admin_id,allow_id,corr,chan_a,inv_late),'operator invitation not pending');
  insert into public.app_users(id,privy_user_id,verified_email) values (late,'did:privy:oi-late','late@example.test');
  if exists(select 1 from public.channel_operators where app_user_id=late) then raise exception 'expired invitation granted'; end if;

  -- an invitation from an admin who lost full-admin rights grants nothing
  inv_orphan:=(public.invite_channel_operator(old_admin,old_allow,corr,chan_c,'orphan@example.test','ko','http://localhost:3000')->>'id')::uuid;
  update public.admin_allowlist set active=false where id=old_allow;
  insert into public.app_users(id,privy_user_id,verified_email) values (orphan,'did:privy:oi-orphan','orphan@example.test');
  if exists(select 1 from public.channel_operators where app_user_id=orphan) or (select status from public.channel_operator_invitations where id=inv_orphan)<>'pending' then raise exception 'revoked admin invitation granted'; end if;

  -- an existing account that reaches the invited email is accepted as well
  perform public.invite_channel_operator(admin_id,allow_id,corr,chan_c,'mover@example.test','en','https://dev.kyaa.io');
  insert into public.app_users(id,privy_user_id,verified_email) values (mover,'did:privy:oi-mover','mover-old@example.test');
  update public.app_users set verified_email='mover@example.test' where id=mover;
  if not exists(select 1 from public.channel_operators where app_user_id=mover and celebrity_id=chan_c and status='active') then raise exception 'email change not accepted'; end if;

  -- client roles cannot reach the table or functions
  if has_table_privilege('authenticated','public.channel_operator_invitations','select') or has_table_privilege('service_role','public.channel_operator_invitations','select') then raise exception 'table exposed'; end if;
  if has_function_privilege('authenticated','public.invite_channel_operator(uuid,uuid,uuid,uuid,text,text,text)','execute')
    or has_function_privilege('anon','public.list_channel_operator_invitations(uuid,uuid,uuid)','execute')
    or has_function_privilege('service_role','public.accept_channel_operator_invitations(uuid)','execute')
    or not has_function_privilege('service_role','public.invite_channel_operator(uuid,uuid,uuid,uuid,text,text,text)','execute') then raise exception 'function acl wrong'; end if;
end $$;
rollback;
