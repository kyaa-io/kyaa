-- UTC 하루 1회(한국 09:00 이후). 하루 최대 500건은 함수가 지킨다(같은 날 다시 돌려도 더 넣지 않음).
select public.run_community_stamp_recovery('MANIFEST_HASH', 500);
