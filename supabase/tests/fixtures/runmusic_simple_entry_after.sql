do $$begin
 if not public.runmusic_entered('cd000000-0000-4000-8000-000000000001')
 or not public.runmusic_entered('cd000000-0000-4000-8000-000000000002') then raise exception 'legacy entry lost during upgrade';end if;
 if not exists(select 1 from public.runmusic_campaign where registration_closes_at='2026-10-24T00:00:00+09:00'
  and event_starts_at='2026-10-24T17:00:00+09:00' and event_ends_at='2026-10-24T19:00:00+09:00'
  and prize_count=100 and prize_label='스타벅스 1만원 상품권') then raise exception 'V1 settings changed during upgrade';end if;
 if not exists(select 1 from public.runmusic_campaign where draw_id='cd000000-0000-4000-8000-000000000003'
  and draw_request_key='cd000000-0000-4000-8000-000000000004' and draw_seed=repeat('ab',32)
  and drawn_at='2026-10-24T10:00:00Z' and results_published and not auto_publish_enabled) then raise exception 'existing draw changed during upgrade';end if;
 if not exists(select 1 from public.runmusic_draw_entries where draw_id='cd000000-0000-4000-8000-000000000003'
  and app_user_id='cd000000-0000-4000-8000-000000000002' and weight=8 and rank=1 and winner
  and mission_snapshot='[{"mission":"photo"}]'::jsonb and receipt_id='cd000000-0000-4000-8000-000000000005'
  and prize_code='starbucks_10000') then raise exception 'existing winner changed during upgrade';end if;
end$$;
-- Restore only this fixture so the following behavior tests start from baseline.
delete from public.runmusic_draw_entries where draw_id='cd000000-0000-4000-8000-000000000003';
update public.runmusic_campaign set draw_id=null,draw_request_key=null,draw_seed=null,drawn_at=null,results_published=false;
delete from public.runmusic_missions where app_user_id='cd000000-0000-4000-8000-000000000002';
delete from public.runmusic_registrations where app_user_id='cd000000-0000-4000-8000-000000000001';
