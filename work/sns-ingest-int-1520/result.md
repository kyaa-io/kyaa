# SNS-INGEST-INT-1520

origin/main f9cd164b0에 mini 5df65a320 통합. 충돌 없음.
review-1157 필수 1: service.ts PHOTO_REVIEW_REQUIRED 반환과 사진 held 단위 시험 확인.
필수 2: sns_ingest_save_draft의 sns_ingest_posts 소유 확인으로 관리자 초안 blocked, SQL 시험의 artist_post/public 사례 확인.
새 실행: web 36 통과, DB 연동 1 건너뜀; worker 7 통과; collector 7 통과.
SQL 실행은 이번 작업에서 하지 않음. 앞선 리뷰의 로컬 SQL 성공은 보완 전 코드 근거라 현재 성공으로 전용하지 않음.
SNS_INGEST_SECRET 설정·운영 DB 접속·운영 배포 없음.
추가 route contract 1 통과: 비밀 미설정 503 및 의존성 미호출.
pre-commit: 필수 route contract 추가·미병합 안내 path 보완 후 통과(우회 없음).
