# 로컬 시험 데이터 정리

- 운영과 원본 로컬 `byus`는 수정하지 않았다.
- 로컬 127.0.0.1:55433의 별도 복제 DB `activity_1116`에만 migration과 시험 데이터를 넣었다.
- SQL 테스트의 회원·채널·알림·메일 계획 및 기존 로컬 당첨/라이브 임시 변경은 각 트랜잭션 ROLLBACK.
- route 통합의 `did:privy:activity-<무작위 UUID>` 회원, `@example.invalid` 채널, `activity:<UUID>` 알림 및 append-only 이벤트는 시험 후 복제 DB 전체 삭제로 정리했다. 초기 실패 실행의 같은 패턴 행도 함께 삭제했다.
- `/tmp/activity-db.dump` 로컬 복제 파일은 제거했다. DB/키/원본 회원 데이터를 저장소에 추가하지 않았다.
- 로컬 화면 서버 33116과 이번 preview 탭은 종료했다. 기존 3000/3128/33001과 다른 작업은 유지했다.
