do $$declare snapshot public.live_participation_upgrade_snapshot%rowtype;reward jsonb;begin
 select * into strict snapshot from public.live_participation_upgrade_snapshot;
 if public.get_fan_ticket_balance(snapshot.owner_id,'ad100000-0000-4000-8000-000000000001')<>snapshot.ticket_balance then raise exception 'Upgrade changed existing ticket balance: before %, after %',snapshot.ticket_balance,public.get_fan_ticket_balance(snapshot.owner_id,'ad100000-0000-4000-8000-000000000001');end if;
 reward:=public.read_owned_mobile_fan_reward(snapshot.owner_id,snapshot.source_id);
 if reward->>'asset'<>'legacy_free_draw'or reward->>'amount'<>'2'then raise exception 'Upgrade changed existing native fanReward';end if;
 if not exists(select 1 from public.certification_submissions where id=snapshot.source_id and status='approved')or(select sum(points)from public.fan_score_ledger where manual_submission_id=snapshot.source_id)<>3 then raise exception 'Upgrade lost existing approval/score';end if;
 if exists(select 1 from public.mobile_fan_earning_cutovers where celebrity_id='ad100000-0000-4000-8000-000000000001')then raise exception 'Upgrade activated general earning';end if;
 if not has_function_privilege('service_role','public.submit_owned_live_mission(uuid,uuid,uuid,jsonb,uuid,text,text)','EXECUTE')or has_function_privilege('authenticated','public.submit_owned_live_participation(uuid,text,uuid,uuid,jsonb,uuid,text,text)','EXECUTE')then raise exception 'Upgrade changed trusted RPC permissions';end if;
end $$;
