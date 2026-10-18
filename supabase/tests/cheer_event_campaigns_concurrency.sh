#!/usr/bin/env bash
set -euo pipefail
bash "$(dirname "$0")/creator_raffle_campaigns_concurrency.sh"
# All writes target the disposable clean-chain database supplied by the caller.
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
do $$
declare creator uuid; live_id uuid:='ce000000-0000-4000-8000-000000000010'; template jsonb;
begin
 insert into public.app_users(id,privy_user_id,verified_email,status) values
 ('ce000000-0000-4000-8000-000000000001','did:privy:cheer-lock-admin','cheer-lock-admin@example.test','active'),
 ('ce000000-0000-4000-8000-000000000002','did:privy:cheer-lock-fan','cheer-lock-fan@example.test','active'),
 ('ce000000-0000-4000-8000-000000000003','did:privy:cheer-lock-fan2','cheer-lock-fan2@example.test','active');
 insert into public.admin_allowlist(id,email,role,active) values('ce000000-0000-4000-8000-000000000004','cheer-lock-admin@example.test','admin',true);
 select c.id into creator from public.celebrities c join public.celebrity_localizations l on l.celebrity_id=c.id and l.locale='ko' where c.status='published' and c.archived_at is null order by c.id limit 1;
 select to_jsonb(l) into template from public.live_events l limit 1;
 insert into public.live_events select * from jsonb_populate_record(null::public.live_events,template||jsonb_build_object(
 'id',live_id,'celebrity_id',creator,'slug','cheer-lock-live','publication_status','published','published_at',statement_timestamp(),'archived_at',null,
 'starts_at',statement_timestamp()+interval '1 day','ends_at',statement_timestamp()+interval '2 days',
 'reservation_opens_at',statement_timestamp()-interval '1 day','reservation_closes_at',statement_timestamp()+interval '1 day'));
 insert into public.live_event_localizations(live_event_id,locale,title,summary,hero_alt) values(live_id,'ko','Cheer LIVE','Cheer LIVE summary','Cheer hero'),(live_id,'en','Cheer LIVE','Cheer LIVE summary','Cheer hero');
 select to_jsonb(b) into template from public.benefits b limit 1;
 insert into public.benefits select * from jsonb_populate_record(null::public.benefits,template||jsonb_build_object(
 'id','ce000000-0000-4000-8000-000000000020','delivery_type','text','celebrity_id',creator,'slug','cheer-lock-prize','publication_status','published','published_at',statement_timestamp(),'archived_at',null,
 'claim_opens_at',statement_timestamp()-interval '1 day','claim_closes_at',statement_timestamp()+interval '2 days'));
 insert into public.benefit_delivery_vault(benefit_id,delivery_type,secret_value) values('ce000000-0000-4000-8000-000000000020','text','Disposable test fixture');
 insert into public.benefit_localizations(benefit_id,locale,title,summary,eligibility_label,delivery_label) values('ce000000-0000-4000-8000-000000000020','ko','Cheer gift','Summary','Fans','Digital'),('ce000000-0000-4000-8000-000000000020','en','Cheer gift','Summary','Fans','Digital');
 insert into public.live_benefit_campaigns(id,live_event_id,entry_source,status,entry_opens_at,entry_closes_at,actor_app_user_id,actor_admin_allowlist_id,published_at)
 values('ce000000-0000-4000-8000-000000000030',live_id,'cheer','published',statement_timestamp()-interval '1 hour',statement_timestamp()+interval '1 hour','ce000000-0000-4000-8000-000000000001','ce000000-0000-4000-8000-000000000004',statement_timestamp());
 insert into public.live_benefit_campaign_items(campaign_id,benefit_id,priority,winner_quantity,fulfillment_method) values('ce000000-0000-4000-8000-000000000030','ce000000-0000-4000-8000-000000000020',1,10,'digital');
end $$;
SQL
CREATOR_SLUG="$(psql -X -Atq -c "select c.slug from public.live_events l join public.celebrities c on c.id=l.celebrity_id where l.slug='cheer-lock-live'")"

wait_sleep() {
  local ready=false
  for _ in {1..50}; do
    if [[ "$(psql -X -Atq -c "select exists(select 1 from pg_stat_activity where application_name='$1' and wait_event='PgSleep')")" == t ]]; then ready=true; break; fi
    sleep 0.1
  done
  [[ "$ready" == true ]] || { echo "holder did not reach checkpoint: $1" >&2; return 1; }
}
PGAPPNAME=cheer_unique_holder psql -X -v ON_ERROR_STOP=1 -q --set=slug="$CREATOR_SLUG" <<'SQL' &
begin;
select public.post_celebrity_cheer('ce000000-0000-4000-8000-000000000002',:'slug','First!',gen_random_uuid(),'ko');
select pg_sleep(2);
commit;
SQL
HOLDER=$!
wait_sleep cheer_unique_holder
psql -X -v ON_ERROR_STOP=1 -q --set=slug="$CREATOR_SLUG" <<'SQL'
select public.post_celebrity_cheer('ce000000-0000-4000-8000-000000000002',:'slug','Second!',gen_random_uuid(),'ko');
do $$ begin if (select count(*) from public.benefit_cheer_entries where campaign_id='ce000000-0000-4000-8000-000000000030')<>1 then raise exception 'concurrent duplicate cheer entry'; end if; end $$;
SQL
wait "$HOLDER"

PGAPPNAME=cheer_cutoff_holder psql -X -v ON_ERROR_STOP=1 -q <<'SQL' &
begin;
update public.live_benefit_campaigns set entry_closes_at=clock_timestamp()+interval '1 second' where id='ce000000-0000-4000-8000-000000000030';
select pg_sleep(2);
commit;
SQL
HOLDER=$!
wait_sleep cheer_cutoff_holder
psql -X -v ON_ERROR_STOP=1 -q --set=slug="$CREATOR_SLUG" <<'SQL'
select public.post_celebrity_cheer('ce000000-0000-4000-8000-000000000003',:'slug','Too late!',gen_random_uuid(),'ko');
do $$ begin if exists(select 1 from public.benefit_cheer_entries where app_user_id='ce000000-0000-4000-8000-000000000003') then raise exception 'lock wait bypassed wall-clock cutoff'; end if; end $$;
SQL
wait "$HOLDER"
echo 'cheer concurrent uniqueness and wall-clock cutoff passed'
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
do $$
declare owner_id uuid:='ce000000-0000-4000-8000-000000000002'; creator uuid; quiz uuid:=gen_random_uuid(); attempt uuid:=gen_random_uuid(); pass uuid:=gen_random_uuid(); passport uuid:=gen_random_uuid(); job uuid:=gen_random_uuid(); campaign_revision integer;
begin
 select celebrity_id into creator from public.live_events where id='ce000000-0000-4000-8000-000000000010';
 insert into public.celebrity_quizzes(id,celebrity_id,version,status,published_at) values(quiz,creator,998,'draft',null);
 insert into public.quiz_attempts(id,app_user_id,celebrity_id,quiz_id,quiz_version,idempotency_key,status,score,submitted_at) values(attempt,owner_id,creator,quiz,998,gen_random_uuid(),'passed',3,now());
 insert into public.quiz_passes(id,app_user_id,celebrity_id,winning_attempt_id) values(pass,owner_id,creator,attempt);
 insert into public.user_wallets(app_user_id,chain_id,address,provider,wallet_type) values(owner_id,91342,'0xf100000000000000000000000000000000000001','privy','embedded');
 insert into public.blockchain_jobs(id,entity_type,entity_id,operation_key,payload_version,payload)
 values(job,'passport',passport,'byus:passport:v1:'||owner_id||':'||(select slug from public.celebrities where id=creator),1,jsonb_build_object('recipient','0xf100000000000000000000000000000000000001','celebritySlug',(select slug from public.celebrities where id=creator),'passportId','0x'||repeat('1',64)));
 insert into public.fan_passports(id,app_user_id,celebrity_id,quiz_pass_id,blockchain_job_id) values(passport,owner_id,creator,pass,job);

 select revision into campaign_revision from public.live_benefit_campaigns where id='ce000000-0000-4000-8000-000000000030';
 perform public.configure_admin_raffle_fulfillment_policy('ce000000-0000-4000-8000-000000000001','ce000000-0000-4000-8000-000000000004',gen_random_uuid(),'ce000000-0000-4000-8000-000000000030','ce000000-0000-4000-8000-000000000020',campaign_revision,
 jsonb_build_object('version','cheer-lock-digital-v1','method','digital','shippingCountry',null,'requiresShippingAcknowledgment',false,'recipientWindowDays',7,'pickupEndsOn',null,'pickupVenue',jsonb_build_object('ko','','en',''),'pickupInstructions',jsonb_build_object('ko','','en','')));
 update public.live_benefit_campaigns set entry_closes_at=clock_timestamp()+interval '1 second' where id='ce000000-0000-4000-8000-000000000030';
end $$;
SQL
PGAPPNAME=cheer_booking_holder psql -X -v ON_ERROR_STOP=1 -q <<'SQL' &
begin;
select public.reserve_owned_live_event('ce000000-0000-4000-8000-000000000002','ce000000-0000-4000-8000-000000000010',gen_random_uuid(),'ce000000-0000-4000-8000-000000000040','byus:stamp:v1:ce000000-0000-4000-8000-000000000040','0x7777777777777777777777777777777777777777777777777777777777777777');
select pg_sleep(2);
commit;
SQL
HOLDER=$!
wait_sleep cheer_booking_holder
sleep 1.1
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
select public.execute_admin_benefit_draw('ce000000-0000-4000-8000-000000000001','ce000000-0000-4000-8000-000000000004',gen_random_uuid(),'ce000000-0000-4000-8000-000000000030',gen_random_uuid(),clock_timestamp());
do $$ begin
 if not exists(select 1 from public.benefit_draw_candidates where campaign_id='ce000000-0000-4000-8000-000000000030' and app_user_id='ce000000-0000-4000-8000-000000000002' and weight=2) then raise exception 'draw missed concurrent committed reservation'; end if;
 if (public.read_admin_cheer_event_participants('ce000000-0000-4000-8000-000000000001','ce000000-0000-4000-8000-000000000004','ce000000-0000-4000-8000-000000000030')->>'totalWeight')::integer<>2 then raise exception 'post-draw preview differs from snapshot'; end if;
end $$;
SQL
wait "$HOLDER"
echo 'cheer booking/draw serialization passed'
