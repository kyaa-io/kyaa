-- Disposable fixture only; no provider calls or real recipients.
do $$ begin if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'local only'; end if; end $$;
begin;
do $$
<<fixture>>
declare
  owner_id uuid:=alert_safety_test.owner('ko',true); outsider uuid:=alert_safety_test.owner('en');
  actor uuid:=extensions.gen_random_uuid(); admin_id uuid:=extensions.gen_random_uuid();
  campaign_id uuid:=extensions.gen_random_uuid(); other_campaign uuid:=extensions.gen_random_uuid();
  draw_id uuid:=extensions.gen_random_uuid(); other_draw uuid:=extensions.gen_random_uuid();
  candidate_id uuid:=extensions.gen_random_uuid(); winner_id uuid:=extensions.gen_random_uuid();
  other_candidate uuid:=extensions.gen_random_uuid(); other_winner uuid:=extensions.gen_random_uuid();
  benefit_id uuid; creator_id uuid; winner_notification uuid; spoof uuid; live_notification uuid;
  cutoff timestamptz; j jsonb; role_name text; n uuid; old_n uuid; k text; source text;
begin
  perform alert_safety_test.assert(not exists(select 1 from public.benefit_draw_email_releases),'migration releases nothing');
  select b.id,b.celebrity_id into strict benefit_id,creator_id from public.benefits b
    where b.publication_status='published' and b.archived_at is null limit 1;
  insert into public.app_users(id,privy_user_id,verified_email)
    values(actor,'did:privy:raffle-email-admin', 'raffle-email-admin@example.invalid');
  insert into public.admin_allowlist(id,email,role,active) values(admin_id,'raffle-email-admin@example.invalid','admin',true);
  insert into public.live_benefit_campaigns(id,celebrity_id,status,entry_opens_at,entry_closes_at,actor_app_user_id,actor_admin_allowlist_id,published_at)
    values(campaign_id,creator_id,'published',now()-interval '2 days',now()-interval '1 day',actor,admin_id,now()),
      (other_campaign,creator_id,'published',now()-interval '2 days',now()-interval '1 day',actor,admin_id,now());
  insert into public.live_benefit_campaign_items(campaign_id,benefit_id,priority,winner_quantity,fulfillment_method)
    values(campaign_id,benefit_id,1,1,'digital'),(other_campaign,benefit_id,1,1,'digital');
  insert into public.benefit_draws(id,campaign_id,idempotency_key,algorithm,seed_hash,actor_app_user_id,actor_admin_allowlist_id,correlation_id)
    values(draw_id,campaign_id,extensions.gen_random_uuid(),'sha256-weighted-rank-v1',repeat('a',64),actor,admin_id,extensions.gen_random_uuid()),
      (other_draw,other_campaign,extensions.gen_random_uuid(),'sha256-weighted-rank-v1',repeat('b',64),actor,admin_id,extensions.gen_random_uuid());
  insert into public.benefit_draw_candidates(id,draw_id,campaign_id,benefit_id,app_user_id,weight,digest,uniform_value,rank_value,result)
    values(candidate_id,draw_id,campaign_id,benefit_id,owner_id,1,repeat('a',64),0.5,1,'won'),
      (other_candidate,other_draw,other_campaign,benefit_id,owner_id,1,repeat('b',64),0.5,1,'won');
  insert into public.benefit_draw_winners(id,draw_id,campaign_id,benefit_id,app_user_id,candidate_id)
    values(winner_id,draw_id,campaign_id,benefit_id,owner_id,candidate_id),
      (other_winner,other_draw,other_campaign,benefit_id,owner_id,other_candidate);
  begin
    insert into public.benefit_draw_email_releases(draw_id,reason) values(other_draw,'unpublished fixture');
    raise exception 'unpublished draw released';
  exception when foreign_key_violation then null; end;
  insert into public.benefit_draw_publications(draw_id,campaign_id,actor_app_user_id,actor_admin_allowlist_id,correlation_id)
    values(draw_id,campaign_id,actor,admin_id,extensions.gen_random_uuid()),
      (other_draw,other_campaign,actor,admin_id,extensions.gen_random_uuid());

  update public.benefits set claim_opens_at=now()-interval '1 day',claim_closes_at=now()+interval '1 day' where id=fixture.benefit_id;
  insert into public.benefit_fulfillments(winner_id,method,status) values(winner_id,'physical_shipping','information_required');
  perform public.configure_fan_notification_delivery('email','enabled');
  update public.fan_notification_delivery_control set activated_at=now()-interval '2 days',
    allowed_kinds=array['recipient_information_required','benefit_available'],benefit_email_activated_at=clock_timestamp() where channel='email';
  select benefit_email_activated_at into cutoff from public.fan_notification_delivery_control where channel='email';
  foreach k in array array['benefit_available','recipient_information_required'] loop
    source:=case when k='benefit_available' then 'available:'||extensions.gen_random_uuid() else 'recipient_information_required:'||winner_id::text||':1' end;
    -- The fulfillment trigger may already have inserted the recipient notification.
    select id into n from public.fan_notifications where app_user_id=owner_id and source_key=source;
    if n is null then
      insert into public.fan_notifications(app_user_id,kind,source_key,benefit_id,scheduled_for,created_at)
      values(owner_id,k::public.notification_kind,source,benefit_id,now(),cutoff) returning id into n;
    end if;
    update public.fan_notifications set created_at=cutoff where id=n;
    perform alert_safety_test.assert(not public.fan_notification_is_released(n,'email'),'cutoff equality blocks old '||k);
    perform alert_safety_test.assert(not exists(select 1 from public.claim_email_notification_deliveries_safely('new-kind-test',100,120) q where q.notification_id=n),'old kind never claimed');
    update public.fan_notifications set created_at=clock_timestamp() where id=n;
    perform alert_safety_test.assert(public.fan_notification_is_released(n,'email'),'new kind released');
    perform alert_safety_test.assert(exists(select 1 from public.claim_email_notification_deliveries_safely('new-kind-test',100,120) q where q.notification_id=n),'new kind claimed: '||k);
  end loop;
  perform public.mobile_register_owned_installation(owner_id,extensions.gen_random_uuid(),'ios','synthetic-token','authorized','1','en',0,extensions.gen_random_uuid());
  n:=alert_safety_test.notification(owner_id);
  perform alert_safety_test.assert(not exists(select 1 from public.mobile_push_delivery_outbox where notification_id=n),'disabled app does not enqueue');
  begin perform public.mobile_claim_push_deliveries('disabled-test',10,120); raise exception 'disabled claim succeeded';
  exception when others then if sqlerrm<>'MOBILE_PUSH_DISABLED' then raise; end if; end;
  update public.mobile_push_control set enabled=true;
  n:=alert_safety_test.notification(owner_id,'live_reserved');
  perform alert_safety_test.assert(exists(select 1 from public.mobile_push_delivery_outbox where notification_id=n),'one switch restores enqueue');
end $$;
rollback;
select 'Future benefit emails and disabled mobile push PASS' as result;
