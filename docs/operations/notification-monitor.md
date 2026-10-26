# 알림 운영 감시

`byus-prod-notification-monitor`는 기존 KYAA-ALERT 방으로만 알립니다.
회원에게 메일·카카오를 보내거나 큐를 재실행하지 않습니다.

- 운영 알림 채널 6개의 비활성·복구·지표 수신 중단 경보를 기존 운영 SNS 주제에서 받습니다. 다른 인프라 경보는 필터링합니다.
- 워커의 기존 TEXT 로그에서 개인정보 없는 `notification_delivery` 이벤트를 구독합니다. 감시 시작 후 채널별 첫 접수·결과 불명, 카카오 첫 전달 완료·실패를 각각 한 번 알립니다.
- 이메일 `accepted`는 SES 접수이며 수신함 도착 증거가 아닙니다. 카카오 `delivered`는 제공자 조회에서 전달 완료를 확인하고 DB에 기록한 상태입니다. 이벤트가 없으면 정상 발송 검증을 완료한 것으로 보지 않습니다.
- `ses_account_selected=primary/primary_ready`를 처음 관측하면 신규 SES 선택을 알립니다. 선택과 실제 회원 메일 수신을 구분합니다.
- 2026-10-27 21:00 Asia/Seoul에 신규 SES 준비 상태와 최근 24시간 발송 상태 기록 수를 한 번 확인해 알립니다. AWS Support 사례 답변을 읽는 기능은 없습니다. 준비 조건이 충족되지 않으면 기존 SES를 유지합니다.

한 통보가 실패해도 같은 로그 묶음의 다른 채널 결과는 계속 처리합니다. 예약 시 SES 또는 로그 조회가 실패하면 확인 실패·판정 보류로 보고하며 0건으로 표시하지 않습니다.

통보 전 DynamoDB에 시도를 저장합니다. 응답 불명확·저장 실패·재전달이 있어도 같은 시도를 자동 재발송하지 않습니다. 확인된 Telegram `message_id`는 영수증에, 결과 불명확은 `unknown` 또는 `attempted`로 남습니다. 경보 키는 이름·상태 변경 시각·상태를 사용하므로 이후 재발은 새 경보입니다. 방의 사람에게 읽혔는지는 측정하지 않습니다.

모니터 전용 `byus/monitor/prod`에는 기존 Telegram token/chat 두 필드만 복사합니다. DB·Solapi 비밀이나 SES 발송 권한은 부여하지 않습니다. Telegram token을 교체하면 아래 배포 명령으로 전용 비밀도 동기화합니다. 기존 작업 비밀과 수신처는 변경하지 않습니다.

```sh
python3 scripts/notification-monitor-test.py
python3 scripts/deploy-aws-notification-monitor.py --profile jewel-sallylab --out /absolute/path/to/private/work
# 위 명령은 수신처 조회와 템플릿 생성만 합니다. 실제 반영:
python3 scripts/deploy-aws-notification-monitor.py --profile jewel-sallylab --out /absolute/path/to/private/work --deploy
```

CloudFormation은 별도 모니터·최소 권한·구독·예약을 소유합니다. 배포 스크립트가 기존 수동 경보의 설정과 다른 통보 경로를 보존하면서 운영 SNS를 추가합니다. 기존 notification 배포 스크립트도 여섯 경보의 통보 연결을 유지합니다.

CloudFormation이 아직 `ActionAfterCompletion`을 지원하지 않아 배포 직후 같은 예약의 전체 설정을 보존하며 `DELETE`를 설정합니다. 일회 예약은 실행 후 자동 삭제됩니다. 예정 시각 이후의 배포에서 자동 삭제 설정을 위해 예약을 재생성하지 않습니다.

운영 확인은 여섯 경보의 세 action, 확정된 Lambda/SNS 구독, 로그 구독 필터, 전용 secret ARN, 예약의 시간대·한 번 실행·재시도 0·자동 삭제를 확인합니다. 통보 시험은 별도 `byus-notification-worker-prod-monitor-test` 경보만 사용하며 실제 채널 모드나 회원 데이터를 바꾸지 않습니다. 결과 불명 통보는 방과 영수증을 대조하기 전 다시 보내지 않습니다.
