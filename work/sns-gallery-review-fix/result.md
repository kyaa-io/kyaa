# SNS-REVIEW-1920 수정

84812056e의 GATE-READY를 철회한다. 이전 안전성 설명은 잘못됐다. 22002000 적용만으로 secret 유무와 관계없이 mobile-media 상한이 200MiB에서 50MiB로 회귀하고, 재수집이 검수 편집과 사진을 훼손할 수 있었다.

## 수정
- 기존 발급 migration 세 파일은 바꾸지 않았다. dev/운영 적용 여부는 DB 조회 금지 범위에서 미확인이다. 이 상태에서도 기존 hash를 보존하는 22003000 전진 repair를 추가했다. 현재 함수의 크기 비교만 교체하며 owner/ACL/security definer/search_path를 유지한다. 기존 171000의 mobile-media 200MiB 예외를 복원한다. 나머지 bucket 제한과 SNS 8MiB·등록 경로/해시 검사는 유지한다.
- 22004000: 이전 run이 만든 모든 미공개 초안은 held로 반환한다. 검수대기·중단된 실패 초안을 모두 보존하며 자동 다운로드 재시도는 하지 않는다. 같은 run의 이미지 본문 저장도 machine_revision이 일치해야 한다. 기존 초안의 machine_revision은 NULL로 두어 덮어쓰지 않는다. 신규 slug 생성은 transaction advisory lock으로 직렬화한다.
- 서비스는 held를 ALREADY_HELD로 즉시 반환하고 5건 처리 예산에서 제외한다. 원문 생성/저장 계약은 변경하지 않았다.
- sns_ingest.sql의 실패 원인은 공개 미디어가 원본·썸네일 양쪽 S3 ready를 요구하는 변경에 fixture가 맞지 않았기 때문이다. 객체 없음/한쪽 ready/양쪽 ready를 시험한다.
- CI API 범위에 SNS 시험 추가. economy-2에 실제 clean migration replay + SNS SQL + 실제 서비스 8회 재전송/검수 편집/사진 2건 불변/다운로드 2회·업로드 4회 불변 + 별도 두 DB connection 동시 claim 시험을 연결했다. workflow 계약 수치·목록도 갱신했다.

## 검증
- 폐기 전용 새 PostgreSQL cluster에 전체 migration 518개 순차 적용 후 SNS SQL·실제 서비스·동시 claim 실행. dev/운영/공유 DB를 사용하지 않는다.
- 별도 썸네일 isolated DB 시험: 50MiB 초과·100MiB·200MiB는 예약 권한 검사까지 도달, 200MiB+1 거절, 다른 bucket 50MiB 유지, 함수 권한/owner/config 보존, 등록 경로·해시·공개/삭제 경계.
- SNS 단위/route: 35 통과, 실제 DB 시험 1개는 일반 실행에서 skip 후 위 isolated 실행에서 통과. secret 미설정 503 포함.
- tsc exit 0. workflow 계약 12개, backfill planner 3개 통과.

## 적용 한계
운영 적용 상태는 확인하지 않았으며 secret 설정·dev/운영 DB 적용·배포·gate·push를 하지 않았다. 원래 22002000만 따로 적용하면 여전히 회귀하므로 후속 repair를 포함한 전체 묶음이 필요하다. 기존 IMAGE_FAILED·READBACK_MISMATCH 초안도 자동 재시도하지 않고 검수 대상으로 보존한다. 실제 원격 CI와 실화면은 실행하지 않았다.
