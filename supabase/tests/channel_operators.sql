-- Synthetic-only; execute solely in an isolated cluster after the migrations.
begin;
create or replace function pg_temp.expect_error(p_sql text,p_marker text)
returns void language plpgsql as $$ begin execute p_sql; raise exception 'expected:%',p_marker;
exception when others then if sqlerrm='expected:'||p_marker or position(p_marker in sqlerrm)=0 then raise; end if; end $$;
do $$
declare
  admin_id uuid:=extensions.gen_random_uuid(); allow_id uuid:=extensions.gen_random_uuid();
  viewer_id uuid:=extensions.gen_random_uuid(); viewer_allow uuid:=extensions.gen_random_uuid();
  op_a uuid:=extensions.gen_random_uuid(); op_b uuid:=extensions.gen_random_uuid(); plain uuid:=extensions.gen_random_uuid(); off_user uuid:=extensions.gen_random_uuid();
  chan_a uuid:=extensions.gen_random_uuid(); chan_b uuid:=extensions.gen_random_uuid();
  grant_a uuid; corr uuid:=extensions.gen_random_uuid();
  doc jsonb:='{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"본문"}]}]}';
  notice_a uuid; notice_b uuid; sched_a uuid; sched_b uuid; input jsonb; res jsonb;
begin
  insert into public.app_users(id,privy_user_id,verified_email) values
    (admin_id,'did:privy:co-admin','co-admin@example.test'),(viewer_id,'did:privy:co-viewer','co-viewer@example.test'),
    (op_a,'did:privy:co-op-a','co-op-a@example.test'),(op_b,'did:privy:co-op-b','co-op-b@example.test'),(plain,'did:privy:co-plain','co-plain@example.test');
  insert into public.app_users(id,privy_user_id,verified_email,status) values (off_user,'did:privy:co-off','co-off@example.test','disabled');
  insert into public.admin_allowlist(id,email,role,active) values (allow_id,'co-admin@example.test','operator',true),(viewer_allow,'co-viewer@example.test','viewer',true);
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values
    (chan_a,'co-channel-a','published','/images/qa.webp',now(),'{creator}','creator'),(chan_b,'co-channel-b','published','/images/qa.webp',now(),'{creator}','creator');
  insert into public.channel_operators(celebrity_id,app_user_id,granted_by_admin_allowlist_id) values (chan_a,op_a,allow_id),(chan_b,op_b,allow_id),(chan_a,off_user,allow_id);
  insert into public.channel_operators(celebrity_id,app_user_id,granted_by_admin_allowlist_id,status,revoked_at,revoked_by_admin_allowlist_id)
    values (chan_a,plain,allow_id,'revoked',now(),allow_id);

  -- duplicate active grant is rejected
  perform pg_temp.expect_error(format('insert into public.channel_operators(celebrity_id,app_user_id,granted_by_admin_allowlist_id) values(%L,%L,%L)',chan_a,op_a,allow_id),'channel_operators_active_pair');

  -- own-channel operator writes a notice; archive is attributed to the operator
  notice_a:=public.save_admin_celebrity_notice(op_a,null,corr,null,null,chan_a,'co-a-note',false,'A 공지',doc,'A notice',doc,'notice','public');
  if (select count(*) from public.celebrity_notices where id=notice_a and celebrity_id=chan_a)<>1 then raise exception 'operator notice not stored'; end if;
  if not exists(select 1 from public.audit_logs where entity_id=notice_a::text and actor_admin_allowlist_id is null and (before_after_summary->>'viaChannelOperator')::boolean) then raise exception 'operator audit missing'; end if;
  notice_a:=public.save_admin_celebrity_notice(op_a,null,corr,notice_a,(select revision from public.celebrity_notices where id=notice_a),chan_a,'co-a-note',true,'A 공지 수정',doc,'A notice edited',doc,'notice','public');

  -- other channel, general user, revoked, disabled user: all rejected
  notice_b:=public.save_admin_celebrity_notice(admin_id,allow_id,corr,null,null,chan_b,'co-b-note',false,'B 공지',doc,'B notice',doc,'notice','public');
  perform pg_temp.expect_error(format('select public.save_admin_celebrity_notice(%L,null,%L,null,null,%L,%L,false,%L,%L::jsonb,%L,%L::jsonb,%L,%L)',op_a,corr,chan_b,'co-x','x',doc,'x',doc,'notice','public'),'active channel operator required');
  perform pg_temp.expect_error(format('select public.save_admin_celebrity_notice(%L,null,%L,null,null,%L,%L,false,%L,%L::jsonb,%L,%L::jsonb,%L,%L)',plain,corr,chan_a,'co-y','y',doc,'y',doc,'notice','public'),'active channel operator required');
  perform pg_temp.expect_error(format('select public.save_admin_celebrity_notice(%L,null,%L,null,null,%L,%L,false,%L,%L::jsonb,%L,%L::jsonb,%L,%L)',off_user,corr,chan_a,'co-z','z',doc,'z',doc,'notice','public'),'');
  -- hijack: edit another channel's notice, or move own notice into another channel
  perform pg_temp.expect_error(format('select public.save_admin_celebrity_notice(%L,null,%L,%L,0,%L,%L,false,%L,%L::jsonb,%L,%L::jsonb,%L,%L)',op_a,corr,notice_b,chan_a,'co-h','h',doc,'h',doc,'notice','public'),'active channel operator required');
  perform pg_temp.expect_error(format('select public.save_admin_celebrity_notice(%L,null,%L,%L,1,%L,%L,false,%L,%L::jsonb,%L,%L::jsonb,%L,%L)',op_a,corr,notice_a,chan_b,'co-m','m',doc,'m',doc,'notice','public'),'active channel operator required');
  -- state change on another channel's notice
  perform pg_temp.expect_error(format('select public.set_admin_celebrity_notice_state(%L,null,%L,%L,0,%L,%L)',op_a,corr,notice_b,'archive','archive reason long enough'),'active channel operator required');
  -- viewer-role admin cannot write (existing admin rule kept)
  perform pg_temp.expect_error(format('select public.save_admin_celebrity_notice(%L,%L,%L,null,null,%L,%L,false,%L,%L::jsonb,%L,%L::jsonb,%L,%L)',viewer_id,viewer_allow,corr,chan_a,'co-v','v',doc,'v',doc,'notice','public'),'');
  -- operator archives own notice
  perform public.set_admin_celebrity_notice_state(op_a,null,corr,notice_a,(select revision from public.celebrity_notices where id=notice_a),'archive','archive reason long enough');
  if not exists(select 1 from public.celebrity_notices where id=notice_a and archived_at is not null and archived_by_app_user_id=op_a and archived_by_admin_allowlist_id is null) then raise exception 'operator archive not recorded'; end if;
  -- asset reservation follows the same gate
  perform pg_temp.expect_error(format('select public.reserve_admin_content_asset(%L,null,%L,1000,10,10,%L)',op_a,chan_b,repeat('a',64)),'active channel operator required');
  res:=public.reserve_admin_content_asset(op_a,null,chan_a,1000,10,10,repeat('a',64));
  if res->>'id' is null then raise exception 'operator asset reservation failed'; end if;

  -- schedules
  input:=jsonb_build_object('celebrityId',chan_a,'kind','concert','title',jsonb_build_object('ko','A 공연','en','A show'),'description',jsonb_build_object('ko','소개','en','Details'),
    'startsAt',clock_timestamp()+interval '2 days','endsAt',clock_timestamp()+interval '2 days 1 hour','timeZone','Asia/Seoul','location','Seoul','participationInstructions','','officialSourceUrl','https://example.test/a','status','published');
  res:=public.fan_web_admin_save_schedule(op_a,null,corr,null,0,corr,input); sched_a:=(res#>>'{item,id}')::uuid;
  if (public.fan_web_admin_save_schedule(op_a,null,corr,null,0,corr,input))->>'replayed'<>'true' then raise exception 'operator schedule idempotency failed'; end if;
  perform pg_temp.expect_error(format('select public.fan_web_admin_save_schedule(%L,null,%L,null,0,%L,%L::jsonb)',op_b,corr,extensions.gen_random_uuid(),input),'active channel operator required');
  res:=public.fan_web_admin_save_schedule(admin_id,allow_id,corr,null,0,extensions.gen_random_uuid(),jsonb_set(input,'{celebrityId}',to_jsonb(chan_b::text))); sched_b:=(res#>>'{item,id}')::uuid;
  perform pg_temp.expect_error(format('select public.fan_web_admin_save_schedule(%L,null,%L,%L,1,%L,%L::jsonb)',op_a,corr,sched_b,extensions.gen_random_uuid(),jsonb_set(input,'{celebrityId}',to_jsonb(chan_b::text))),'active channel operator required');

  -- listing: operator is limited to the requested own channel
  res:=public.fan_web_admin_list_schedules(op_a,null,corr,null,null,null,20,chan_a);
  if jsonb_array_length(res->'items')<>1 or res#>>'{items,0,id}'<>sched_a::text then raise exception 'operator list leaked %',res; end if;
  perform pg_temp.expect_error(format('select public.fan_web_admin_list_schedules(%L,null,%L,null,null,null,20,%L)',op_a,corr,chan_b),'active channel operator required');
  perform pg_temp.expect_error(format('select public.fan_web_admin_list_schedules(%L,null,%L,null,null,null,20,null)',op_a,corr),'active channel operator required');
  -- full admin sees every channel and can filter
  if jsonb_array_length(public.fan_web_admin_list_schedules(admin_id,allow_id,corr,null,null,null,50,null)->'items')<2 then raise exception 'admin list lost channels'; end if;
  if jsonb_array_length(public.fan_web_admin_list_schedules(admin_id,allow_id,corr,null,null,null,50,chan_b)->'items')<>1 then raise exception 'admin channel filter failed'; end if;

  -- revoking removes access immediately
  update public.channel_operators set status='revoked',revoked_at=now(),revoked_by_admin_allowlist_id=allow_id where celebrity_id=chan_a and app_user_id=op_a and status='active';
  perform pg_temp.expect_error(format('select public.fan_web_admin_list_schedules(%L,null,%L,null,null,null,20,%L)',op_a,corr,chan_a),'active channel operator required');

  -- direct table and helper access stays closed to client roles
  if has_table_privilege('authenticated','public.channel_operators','select') or has_table_privilege('anon','public.channel_operators','select') then raise exception 'channel_operators exposed'; end if;
  if has_function_privilege('authenticated','public.assert_channel_writer(uuid,uuid,uuid)','execute') or has_function_privilege('service_role','public.assert_channel_writer(uuid,uuid,uuid)','execute') then raise exception 'assert fn exposed'; end if;
  if not has_function_privilege('service_role','public.fan_web_admin_list_schedules(uuid,uuid,uuid,text,timestamptz,uuid,integer,uuid)','execute') or has_function_privilege('authenticated','public.fan_web_admin_list_schedules(uuid,uuid,uuid,text,timestamptz,uuid,integer,uuid)','execute') then raise exception 'list schedules acl wrong'; end if;
end $$;
-- Grant / revoke / asset boundary / draft delete (full admin only, idempotent, audited).
do $$
declare
  fa uuid:=extensions.gen_random_uuid(); fa_allow uuid:=extensions.gen_random_uuid();
  opr uuid:=extensions.gen_random_uuid(); opr_allow uuid:=extensions.gen_random_uuid();
  vw uuid:=extensions.gen_random_uuid(); vw_allow uuid:=extensions.gen_random_uuid();
  tgt uuid:=extensions.gen_random_uuid(); off_t uuid:=extensions.gen_random_uuid();
  c1 uuid:=extensions.gen_random_uuid(); c2 uuid:=extensions.gen_random_uuid();
  a1 uuid:=extensions.gen_random_uuid(); a2 uuid:=extensions.gen_random_uuid();
  a3 uuid:=extensions.gen_random_uuid(); a4 uuid:=extensions.gen_random_uuid(); a5 uuid:=extensions.gen_random_uuid();
  dup1 uuid:=extensions.gen_random_uuid(); dup2 uuid:=extensions.gen_random_uuid(); n2 uuid; post2 uuid:=extensions.gen_random_uuid();
  doc jsonb:='{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"본문"}]}]}';
  corr uuid:=extensions.gen_random_uuid(); g jsonb; g2 jsonb; r jsonb; r2 jsonb; gid uuid;
begin
  insert into public.app_users(id,privy_user_id,verified_email) values
    (fa,'did:privy:gr-fa','gr-fa@example.test'),(opr,'did:privy:gr-opr','gr-opr@example.test'),
    (vw,'did:privy:gr-vw','gr-vw@example.test'),(tgt,'did:privy:gr-tgt','gr-tgt@example.test');
  insert into public.app_users(id,privy_user_id,verified_email,status) values (off_t,'did:privy:gr-off','gr-off@example.test','disabled');
  insert into public.admin_allowlist(id,email,role,active) values
    (fa_allow,'gr-fa@example.test','admin',true),(opr_allow,'gr-opr@example.test','operator',true),(vw_allow,'gr-vw@example.test','viewer',true);
  insert into public.celebrities(id,slug,status,image_url,roles,primary_role) values (c1,'gr-draft','draft','/images/qa.webp','{creator}','creator');
  insert into public.celebrities(id,slug,status,image_url,published_at,roles,primary_role) values (c2,'gr-pub','published','/images/qa.webp',now(),'{creator}','creator');

  -- grant: full admin only
  perform pg_temp.expect_error(format('select public.grant_channel_operator(%L,%L,%L,%L,%L)',opr,opr_allow,corr,c1,'gr-tgt@example.test'),'full admin required');
  perform pg_temp.expect_error(format('select public.grant_channel_operator(%L,%L,%L,%L,%L)',vw,vw_allow,corr,c1,'gr-tgt@example.test'),'viewer is read-only');
  perform pg_temp.expect_error(format('select public.grant_channel_operator(%L,null,%L,%L,%L)',tgt,corr,c1,'gr-tgt@example.test'),'full admin required');
  perform pg_temp.expect_error(format('select public.grant_channel_operator(%L,%L,%L,%L,%L)',fa,fa_allow,corr,c1,'nobody@example.test'),'operator candidate not found');
  perform pg_temp.expect_error(format('select public.grant_channel_operator(%L,%L,%L,%L,%L)',fa,fa_allow,corr,c1,'gr-off@example.test'),'operator candidate not found');
  perform pg_temp.expect_error(format('select public.grant_channel_operator(%L,%L,%L,%L,%L)',fa,fa_allow,corr,extensions.gen_random_uuid(),'gr-tgt@example.test'),'channel not found');
  -- two active accounts with the same email: refused with a fixed message that names no candidate
  insert into public.app_users(id,privy_user_id,verified_email) values (dup1,'did:privy:gr-dup1','gr-dup@example.test'),(dup2,'did:privy:gr-dup2','gr-dup@example.test');
  perform pg_temp.expect_error(format('select public.grant_channel_operator(%L,%L,%L,%L,%L)',fa,fa_allow,corr,c1,'gr-dup@example.test'),'operator candidate ambiguous');
  begin perform public.grant_channel_operator(fa,fa_allow,corr,c1,'gr-dup@example.test'); exception when others then
    if sqlerrm like '%'||dup1::text||'%' or sqlerrm like '%'||dup2::text||'%' or sqlerrm like '%gr-dup%' then raise exception 'ambiguous error leaks candidate: %',sqlerrm; end if; end;
  -- a disabled twin does not make the email ambiguous
  insert into public.app_users(id,privy_user_id,verified_email,status) values (extensions.gen_random_uuid(),'did:privy:gr-dup3','gr-tgt@example.test','disabled');
  if exists(select 1 from public.channel_operators where app_user_id in (tgt,dup1,dup2)) then raise exception 'refused grants wrote rows'; end if;

  g:=public.grant_channel_operator(fa,fa_allow,corr,c1,' GR-TGT@example.test ');
  gid:=(g->>'id')::uuid;
  if g->>'replayed'<>'false' or g->>'status'<>'active' then raise exception 'grant result %',g; end if;
  g2:=public.grant_channel_operator(fa,fa_allow,extensions.gen_random_uuid(),c1,'gr-tgt@example.test');
  if g2->>'replayed'<>'true' or (g2->>'id')::uuid<>gid then raise exception 'grant not idempotent %',g2; end if;
  if (select count(*) from public.audit_logs where action='channel_operator.granted' and entity_id=gid::text)<>1 then raise exception 'grant audit count'; end if;
  if exists(select 1 from public.audit_logs where entity_id=gid::text and before_after_summary::text like '%@%') then raise exception 'audit holds an email'; end if;
  if (select count(*) from public.channel_operators where app_user_id=tgt and status='active')<>1 then raise exception 'duplicate active grant'; end if;
  if jsonb_array_length(public.list_channel_operators(fa,fa_allow,c1)->'items')<>1 then raise exception 'list wrong'; end if;
  if jsonb_array_length(public.list_channel_operators(vw,vw_allow,c1)->'items')<>1 then raise exception 'viewer admin read wrong'; end if;
  perform pg_temp.expect_error(format('select public.list_channel_operators(%L,null,%L)',tgt,c1),'active admin required');

  -- viewer allowlist role with an active channel grant: operator access on that channel only
  insert into public.channel_operators(celebrity_id,app_user_id,granted_by_admin_allowlist_id) values (c1,vw,fa_allow);
  perform public.assert_channel_writer(vw,null,c1);
  perform pg_temp.expect_error(format('select public.assert_channel_writer(%L,null,%L)',vw,c2),'active channel operator required');
  perform pg_temp.expect_error(format('select public.assert_channel_writer(%L,%L,%L)',vw,vw_allow,c1),'viewer is read-only');
  perform pg_temp.expect_error(format('select public.grant_channel_operator(%L,%L,%L,%L,%L)',vw,vw_allow,corr,c1,'gr-tgt@example.test'),'viewer is read-only');

  -- asset boundary: the asset must belong to the authenticated channel
  insert into public.content_assets(id,app_user_id,celebrity_id,storage_path,byte_size,width,height,sha256,uploaded_at) values
    (a1,tgt,c1,'gr/c1/a1.webp',10,10,10,repeat('a',64),now()),(a2,tgt,c2,'gr/c2/a2.webp',10,10,10,repeat('b',64),now());
  if public.read_channel_content_asset(tgt,null,c1,a1)->>'storagePath'<>'gr/c1/a1.webp' then raise exception 'own asset unreadable'; end if;
  if public.read_channel_content_asset(tgt,null,c1,a2) is not null then raise exception 'other channel asset leaked'; end if;
  perform pg_temp.expect_error(format('select public.read_channel_content_asset(%L,null,%L,%L)',tgt,c2,a2),'active channel operator required');

  -- asset scope: notice-linked or the caller's own unlinked upload only
  insert into public.channel_operators(celebrity_id,app_user_id,granted_by_admin_allowlist_id) values (c2,opr,fa_allow);
  n2:=public.save_admin_celebrity_notice(fa,fa_allow,corr,null,null,c2,'gr-note',false,'공지',doc,'Notice',doc,'notice','public');
  insert into public.fan_posts(id,celebrity_id,app_user_id,body,idempotency_key,create_request_hash) values (post2,c2,tgt,'팬 게시물',extensions.gen_random_uuid(),repeat('c',64));
  insert into public.content_assets(id,app_user_id,celebrity_id,storage_path,byte_size,width,height,sha256,uploaded_at,notice_id) values
    (a3,tgt,c2,'gr/c2/a3.webp',10,10,10,repeat('d',64),now(),n2);
  insert into public.content_assets(id,app_user_id,celebrity_id,storage_path,byte_size,width,height,sha256,uploaded_at,post_id,position) values
    (a4,tgt,c2,'gr/c2/a4.webp',10,10,10,repeat('e',64),now(),post2,0);
  insert into public.content_assets(id,app_user_id,celebrity_id,storage_path,byte_size,width,height,sha256,uploaded_at) values
    (a5,opr,c2,'gr/c2/a5.webp',10,10,10,repeat('f',64),now());
  if public.read_channel_content_asset(opr,null,c2,a3)->>'storagePath'<>'gr/c2/a3.webp' then raise exception 'notice-linked asset unreadable'; end if;
  if public.read_channel_content_asset(opr,null,c2,a5)->>'storagePath'<>'gr/c2/a5.webp' then raise exception 'own unlinked asset unreadable'; end if;
  if public.read_channel_content_asset(opr,null,c2,a4) is not null then raise exception 'fan post asset leaked'; end if;
  if public.read_channel_content_asset(opr,null,c2,a2) is not null then raise exception 'other member unlinked asset leaked'; end if;
  if public.read_channel_content_asset(tgt,null,c1,a1)->>'storagePath'<>'gr/c1/a1.webp' then raise exception 'uploader own asset lost'; end if;
  if has_function_privilege('authenticated','public.read_channel_content_asset(uuid,uuid,uuid,uuid)','execute') or not has_function_privilege('service_role','public.read_channel_content_asset(uuid,uuid,uuid,uuid)','execute') then raise exception 'asset fn acl'; end if;

  -- draft channel delete: an active grant blocks, revoked rows are cleaned, audit history remains
  delete from public.content_assets where celebrity_id=c1;
  -- the lifecycle trigger accepts deletes only from the postgres owner; a local cluster owned by another superuser needs the same owner
  if not exists(select 1 from pg_roles where rolname='postgres') then create role postgres superuser; end if;
  alter function public.hard_delete_admin_content(text,uuid,uuid,text,uuid) owner to postgres;
  perform pg_temp.expect_error(format('select public.hard_delete_admin_content(%L,%L,%L,%L,%L)','celebrity',c1,fa_allow,'draft delete with grant',corr),'active channel operators must be revoked');
  perform pg_temp.expect_error(format('select public.revoke_channel_operator(%L,%L,%L,%L,%L)',opr,opr_allow,corr,c1,gid),'full admin required');
  -- a grant addressed through another channel is refused and stays active
  perform pg_temp.expect_error(format('select public.revoke_channel_operator(%L,%L,%L,%L,%L)',fa,fa_allow,corr,c2,gid),'grant not found');
  if not exists(select 1 from public.channel_operators where id=gid and status='active') then raise exception 'cross-channel revoke changed the grant'; end if;
  r:=public.revoke_channel_operator(fa,fa_allow,corr,c1,gid);
  r2:=public.revoke_channel_operator(fa,fa_allow,extensions.gen_random_uuid(),c1,gid);
  if r->>'status'<>'revoked' or r->>'replayed'<>'false' or r2->>'replayed'<>'true' then raise exception 'revoke result % %',r,r2; end if;
  if (select count(*) from public.audit_logs where action='channel_operator.revoked' and entity_id=gid::text)<>1 then raise exception 'revoke audit count'; end if;
  if not exists(select 1 from public.channel_operators where id=gid and status='revoked' and revoked_by_admin_allowlist_id=fa_allow) then raise exception 'revoked row missing'; end if;
  perform pg_temp.expect_error(format('select public.assert_channel_operator(%L,%L)',tgt,c1),'active channel operator required');
  perform pg_temp.expect_error(format('select public.revoke_channel_operator(%L,%L,%L,%L,%L)',fa,fa_allow,corr,c1,extensions.gen_random_uuid()),'grant not found');
  perform pg_temp.expect_error(format('select public.hard_delete_admin_content(%L,%L,%L,%L,%L)','celebrity',c1,fa_allow,'draft delete with vw grant',corr),'active channel operators must be revoked');
  update public.channel_operators set status='revoked',revoked_at=now(),revoked_by_admin_allowlist_id=fa_allow where celebrity_id=c1 and status='active';
  perform public.hard_delete_admin_content('celebrity',c1,fa_allow,'draft delete after revoke',corr);
  if exists(select 1 from public.celebrities where id=c1) or exists(select 1 from public.channel_operators where celebrity_id=c1) then raise exception 'draft delete left rows'; end if;
  if (select count(*) from public.audit_logs where entity_id=gid::text and action in ('channel_operator.granted','channel_operator.revoked'))<>2 then raise exception 'grant history lost'; end if;
  update public.channel_operators set status='revoked',revoked_at=now(),revoked_by_admin_allowlist_id=fa_allow where celebrity_id=c2 and status='active';
  -- a published channel still cannot be deleted
  perform pg_temp.expect_error(format('select public.hard_delete_admin_content(%L,%L,%L,%L,%L)','celebrity',c2,fa_allow,'published delete attempt',corr),'published or referenced content must be archived');
end $$;
rollback;
