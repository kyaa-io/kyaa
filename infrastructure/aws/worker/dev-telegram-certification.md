# DEV 텔레그램 인증 심사

DEV 워커와 DEV 웹의 기존 비밀 설정에 `TELEGRAM_DEV_CERTIFICATION_BOT_TOKEN`과
`TELEGRAM_DEV_CERTIFICATION_CHAT_ID`를 추가한다. DEV 웹에
`TELEGRAM_DEV_CERTIFICATION_WEBHOOK_SECRET`과
`TELEGRAM_DEV_CERTIFICATION_ADMIN_MAP`을 추가한다. 매핑은 Telegram 숫자 사용자 ID를
키로, 관리자 앱 사용자 UUID를 값으로 가지는 JSON 객체다.

DEV 전용 봇이 DEV 시험 방에만 참여하는지 확인한 뒤, Telegram `setWebhook`의
`url`을 `https://dev.kyaa.io/api/telegram/certification/webhook`으로 설정한다.
`secret_token`에는 DEV 웹과 같은 값을, `allowed_updates`에는
`["callback_query"]`를 전달한다. 명령 기록과 로그에 설정값이 남지 않게 한다.

DEV DB 소유자가 `dev_telegram_certification_target`에 시험 방을 등록하면 이후
접수부터 대기열이 생성된다. 시험에 합성 데이터를 사용한다. 중지하려면 DEV 대상 행을
제거한다. 운영에는 대상 행과 DEV 설정을 추가하지 않는다.

발송 전 확인자가 별도로 가린 JPEG에서 얼굴, 계정·이름·연락처·주소·QR과 메타데이터가
제거됐는지 확인한 경우에만, DEV DB 소유자가 해당 카드의
`dev_telegram_certification_media`에 JPEG와 확인자·확인 시각을 등록한다.
확인한 파일이 없다면 카드에 관리자 화면 링크가 표시된다. 시험 후 파생 파일을 제거한다.
DEV에서 동일 카드로 확인한 심사 보조 결과는 발송 전 `assist_hint`에
`possible_duplicate` 또는 `original_check`로 기록할 수 있다.

DEV 시험 방에서 덕후인증과 패스포트 증빙의 승인과 반려를 각각 확인한다. 유효하지 않은
비밀 토큰, 매핑되지 않은 사용자, 불일치 방·메시지, 중복 클릭, 웹 화면과의 경합,
메시지 수정 실패 뒤 재전송에서도 판정과 보상이 한 번만 적용되는지 확인한다.
Telegram 요청이 불명확하게 종료된 건은 방과 카드의 메시지 기록을 대조한다.
