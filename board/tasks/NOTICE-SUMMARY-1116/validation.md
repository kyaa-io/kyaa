# 준비 검증

- 실제 GitHub 조회는 GET만 사용. check 쓰기·Telegram 전송·push 없음.
- source receipt 132654457213의 summary 원문 해시와 전송된 12묶음 대조 완료.
- 성공 status 시각 2026-11-15T01:17:31Z로 원래 22묶음을 재구성. 12묶음 해시 일치.
- 57c922b24a2d74028a038b28466560fd667be108 → f37b0ac1 대상의 안내 파일 183개 및 파일별 해시 검증 완료.
- 기존 1113 시험 포함 관련 시험 52개 통과: `node --test scripts/send-deployment-summary.test.mjs scripts/deployment-notices.test.mjs`
- plan-summary는 가짜 GitHub와 가짜 운영 확인으로 실행. 쓰기 호출 없음. 실제 운영 현재 버전은 확인하지 않았음.
- plan hash: `39738ff43f4925d87b20d0a1a5726fa1ff9cff78a06d2aaf7736f76af7470eec`
- 실행 시 NOTICE_SUMMARY_MANIFEST=deployment-notice-summary-1116.json, NOTICE_DEPLOYMENT_ID=7814872136. 사용자 승인 뒤 감독이 실행. 그 전에 운영 대상이 바뀌면 다시 준비해야 함.
