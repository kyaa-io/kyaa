-- Read-only catalog and drain observations. This does not certify deployment/source completeness.
begin isolation level repeatable read read only;
set local statement_timeout='120s';
with legacy_names(name)as(select unnest(array[
 'apply_owned_mobile_vote_verified','award_fan_ticket_activity','award_mobile_content_first_clip','award_mobile_fan_activity','award_mobile_fan_activity_before_live_participation','award_mobile_fan_activity_v1',
 'create_mobile_content_fan_clip','create_mobile_content_fan_clip_before_stamp','draw_owned_mobile_benefit','draw_owned_mobile_benefit_before_free_source',
 'enter_owned_benefit','enter_owned_benefit_before_creator_fan_gate','enter_owned_benefit_before_free_source','enter_owned_benefit_v2','enter_owned_benefit_v2_before_creator_fan_gate','enter_owned_benefit_without_fulfillment_policy',
 'evaluate_owned_live_journey','evaluate_owned_live_journey_before_reward_source','evaluate_owned_live_journey_fw_37e4ff18','exchange_owned_mobile_fan_economy','live_participation_award','request_mobile_fan_reward_correction','send_owned_mobile_fan_support',
 'submit_owned_live_mission','submit_owned_live_mission_before_fan_web','submit_owned_live_mission_before_reward_source','submit_owned_live_participation','submit_owned_mobile_free_lucky','vote_owned_mobile_fan_gift'])),
 expected(name,guard)as(
 select name,'group_wallet_legacy_lock'from legacy_names
 union all select name,'group_wallet_invitation_lock'from unnest(array['submit_owned_quiz_attempt','submit_owned_quiz_attempt_fw_f5930695','redeem_community_stamp_invite'])name
 union all values('fan_web_lock_active_user','group-wallet:campaign-barrier'),('post_benefit_entry_refund','group_wallet_refund_lock'),('cancel_admin_benefit_campaign','group_wallet_refund_lock'),('post_fan_ticket_entry','group_wallet_lock'),('mobile_fan_economy_post','group_wallet_lock')
), catalog as materialized(
 select p.oid,p.proname,p.oid::regprocedure::text signature,pg_get_functiondef(p.oid)definition from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f'
), checked as(
 select e.name,e.guard,c.signature,c.oid,position(e.guard in c.definition)>0 guarded,encode(extensions.digest(c.definition,'sha256'),'hex')sha256 from expected e left join catalog c on c.proname=e.name
), writers as(
 select signature,encode(extensions.digest(definition,'sha256'),'hex')sha256 from catalog where definition ~* 'insert[[:space:]]+into[[:space:]]+public[.](fan_ticket_ledger|mobile_fan_economy_ledger|mobile_store_paid_ticket_ledger)'
)
select jsonb_build_object('schemaVersion',1,'observedAt',statement_timestamp(),'release',(select to_jsonb(r)from public.group_wallet_release r where singleton),
 'manualSourceAndDeploymentReviewRequired',true,'canObserveAllSessions',(select rolsuper from pg_roles where rolname=current_user)or pg_has_role(current_user,'pg_read_all_stats','MEMBER'),
 'lockAudit',jsonb_build_object('unguardedPresentRoutines',(select count(*)from checked where signature is not null and guarded is not true),'absentLegacyNames',coalesce((select jsonb_agg(name order by name)from checked where signature is null),'[]'),'routines',coalesce((select jsonb_agg(jsonb_build_object('signature',signature,'guard',guard,'guardFound',guarded,'sha256',sha256)order by signature)from checked where signature is not null),'[]')),
 'directLedgerWriters',coalesce((select jsonb_agg(to_jsonb(w)order by signature)from writers w),'[]'),
 'privateMintAclLeaks',(select count(*)from catalog where proname in('group_wallet_post','group_wallet_refund','group_wallet_invitation_lock','group_wallet_legacy_lock')and(has_function_privilege('anon',oid,'EXECUTE')or has_function_privilege('authenticated',oid,'EXECUTE')or has_function_privilege('service_role',oid,'EXECUTE'))),
 'activeApplicationTransactions',coalesce((select jsonb_agg(jsonb_build_object('pid',pid,'role',usename,'applicationName',application_name,'state',state,'transactionAgeSeconds',extract(epoch from(clock_timestamp()-xact_start)),'queryAgeSeconds',extract(epoch from(clock_timestamp()-query_start)),'waitEventType',wait_event_type)order by xact_start)from pg_stat_activity where datname=current_database()and pid<>pg_backend_pid()and backend_type='client backend'and xact_start is not null),'[]'),
 'advisoryLocks',(select count(*)from pg_locks where locktype='advisory'and pid<>pg_backend_pid()),
 'unpublishedOrMutableGateEvidence',not exists(select 1 from public.group_wallet_release where singleton and legacy_writers_verified and migration_evidence_sha256~'^[0-9a-f]{64}$'and rewards_start_on is not null));
commit;
