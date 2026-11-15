# SNS-GALLERY-INT-1920 · 원문 리비전 후속

## 판정 범위
로컬 통합 후보의 must-fix 수정 및 필수 검사 완료. 원격 push-gate 실행·독립 재검토 통과·DB 적용·배포 완료를 뜻하지 않는다. 기존 84812056e의 무해/GATE-READY 주장은 철회된 상태이며 이 후속 수정과 새 검증으로 대체한다.

## M1
005f5ef1f에 포함된 22003000 repair를 유지한다. 현재 reserve_s3_storage_object 본문에서 크기 비교 하나만 수정하므로 ACL·owner·security definer·search_path와 나머지 예약 검사를 보존한다. 22002000을 포함해 기존 발급 migration은 수정하지 않았다. 적용 여부 확인을 위한 dev/운영 DB 조회도 하지 않았으며 이미 적용된 파일 hash를 바꿀 필요가 없는 전진 repair 방식이다.

회귀 시험을 실제 성공까지 강화했다. 전체 chain에서 활성 사용자의 fan_post 영상 100MiB를 reserve_owned_mobile_media → reserve_s3_mobile_upload로 예약하고 S3 메타데이터 크기 104857600을 확인한다. 별도 isolated DB에서도 bucket이 50MiB인 상태로 등록된 mobile-media 100MiB 예약 성공을 확인한다. 미등록 100/200MiB는 권한 검사에서 거절, 200MiB+1 및 다른 bucket의 50MiB 초과는 크기 검사에서 거절한다. 함수 권한·owner·config 보존과 기존 SNS 경로·해시·ready/삭제 검사도 유지한다.

## M2
새 22005000이 private/RLS 원문 리비전 표와 service_role 전용 기록 RPC를 추가한다. DB가 수집 원문 JSONB(원문 ID·URL·게시 시각·전체 캡션·사진 및 표지 URL)의 SHA-256을 계산해 최신 원문 해시와 비교한다. 같으면 ALREADY_HELD로 끝내고, 다르면 원문 리비전을 추가해 SOURCE_UPDATED로 검수를 기다린다. 검수자의 제목·본문·미디어·공지 revision은 두 경우 모두 변경하지 않는다. 원문 리비전은 CMS 편집본과 분리해 저장하며 과거 원문을 덮어쓰지 않는다. 새 원문에 있는 URL도 이 단계에서는 다운로드하지 않는다.

초기 수집에서도 같은 URL의 사진·영상 표지는 한 번만 다운로드·업로드하고 각 용도 메타데이터에서 재사용한다. 기존 미공개 초안·중단된 실패 초안을 재수집해도 미디어를 다시 등록하지 않는다. ALREADY_HELD와 SOURCE_UPDATED는 새 글 처리 5건 한도를 소비하지 않는다. 생성 및 원문 기록 동시 요청은 notice 잠금으로 직렬화한다.

## 새 검증
- 전체 519개 migration을 새 폐기 전용 PostgreSQL cluster에 replay: exit 0.
- 수정 sns_ingest.sql 통과: 양쪽 S3 ready 요구에 맞춘 fixture, 100MiB 실제 예약, 크기·권한·공개 상태 경계, 새 원문 RPC/표 권한 포함.
- 실제 서비스+SQL 재현: 사진 2장 최초 처리; 검수자 제목·본문 수정; 동일 원문 8회 재전송에서 해시/원문 리비전 1개·사진 2개·검수 편집 불변; 바뀐 원문 8회 재전송에서 원문 리비전 2개 및 두 원문 전문 보존, 검수 편집 불변. 전체 다운로드 2회·업로드 4회로 추가 호출 없음.
- 서로 다른 두 DB 연결 동시 claim: created 1개/held 1개. 동일 원문 동시 기록: recorded 1개/unchanged 1개.
- SNS unit/route 36개 통과, 일반 실행의 DB 시험 1개는 skip 후 위 실제 DB 실행에서 통과. secret 미설정 503 유지.
- tsc exit 0, 썸네일 isolated storage 시험 exit 0, CI workflow 계약 12개+백필 planner 3개 통과.
- 이전 동일 UI 코드의 UI gate 범위 101 files/1426 tests와 기존 API 범위(1648 tests 및 SDK source-scan timeout 6 tests 재실행 통과)는 재사용했다. 이번 변경은 SNS 서비스/SQL과 해당 시험·문서다.
- 필수 pre-commit과 안내 검사는 commit/검증 로그 참조. push-gate 실행 없음.

## 적용 영향·남은 범위
- 22003000: 기존 171000의 mobile-media 200MiB 상한 복원. 원래 22002000만 단독 적용하면 회귀하므로 후속 repair 포함 필요.
- 22004000: 검수 초안의 기계 revision 추적 및 이전 run/검수 편집 보존, 신규 slug 생성 직렬화.
- 22005000: 비공개 원문 리비전 저장. 서비스 변경 전에 적용 필요. 기존 초안의 과거 수집 원문은 추측 복원하지 않고 다음 관찰부터 기록한다.
- 원문 변경은 별도 보관만 하며 CMS 편집본 자동 병합·자동 재공개·검수 화면 추가는 하지 않는다. 중단/IMAGE_FAILED 초안도 사람 검수 대상으로 보존한다.
- SNS_INGEST_SECRET 설정, dev/운영 DB 적용, 배포, gate 실행, main/후보 push 모두 하지 않았다. 실제 원격 CI·운영 적용 상태·실화면은 확인하지 않았다.
