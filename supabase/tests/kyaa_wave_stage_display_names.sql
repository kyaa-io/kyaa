-- Run with wave_stage_upgrade_before.sql before 20261129024000_wave_stage_rewards.sql.
do $$ begin if current_database()<>'byus_clean' or inet_server_addr() is not null then raise exception 'Disposable local database required'; end if; end $$;
begin;
insert into public.kyaa_wave_participants(app_user_id,name_encrypted)
select md5('wave-stage-fixture:'||i::text)::uuid,'v1.'||repeat('a',16)||'.'||repeat('b',22)||'.fixture' from generate_series(1,11)i;
do $$
declare actor uuid:='92900000-0000-4000-8000-000000000001'; admin_id uuid:='92900000-0000-4000-8000-000000000002'; result jsonb; refs jsonb; names jsonb; request_id uuid:=gen_random_uuid();
begin
 result:=public.execute_admin_wave_stage_draw(actor,admin_id,request_id,request_id,5,5);
 select jsonb_agg(jsonb_build_object('kind','stage','id',x->>'__waveNameReference')) into refs from jsonb_array_elements(result#>'{stage,draw,winners}')x;
 assert jsonb_array_length(refs)=21,'existing stage winner count preserved';
 names:=public.read_kyaa_wave_display_names(actor,refs,admin_id);
 assert jsonb_array_length(names)=21,'stage names resolve only after existing admin authorization';
 assert not exists(select 1 from jsonb_array_elements(names)x left join public.benefit_draw_winners w on w.id=(x->>'id')::uuid where w.app_user_id::text is distinct from x->>'appUserId'),'stable stage reference matches the original author';
 assert public.read_kyaa_wave_display_names(actor,'[{"kind":"stage","id":"92900000-0000-4000-8000-000000000099"}]',admin_id)='[]'::jsonb,'foreign stage identity excluded';
 assert public.read_kyaa_wave_display_names(md5('wave-stage-fixture:1')::uuid,refs)='[]'::jsonb,'ordinary checked-in account cannot resolve admin stage identities';
end $$;
rollback;
