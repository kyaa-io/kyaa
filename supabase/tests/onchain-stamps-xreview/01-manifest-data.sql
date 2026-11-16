-- manifest 고정. CUTOFF_TO는 migration 적용 시각 이후의 고정 시각(예: 적용 완료 + 1분)으로 채운다. 같은 값으로 다시 돌리면 같은 hash(멱등).
-- 결과 JSON(manifestHash·itemCount·counts)을 영수증에 남기고 hash를 다음 단계에 쓴다.
select public.build_community_stamp_recovery_manifest(timestamptz '2026-11-11 00:00:00+09', timestamptz 'CUTOFF_TO', 500);
