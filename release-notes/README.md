# 운영 변경 안내

작업할 때 한국어 안내를 작성하면 현재 AWS 운영 배포 성공 후 Sally_Bug_Report 방에 OMCODEX 봇이 자동 게시합니다. AI API·별도 요약 비용은 없습니다.

새 파일 `release-notes/YYYY-MM-DD-short-name.json`을 변경과 함께 커밋합니다.

```json
{
  "changes": ["알림 목록의 점을 굵은 제목과 같은 높이에 맞췄어요."],
  "path": "/notifications",
  "images": ["release-notes/images/2026-09-29-notifications-after.png"]
}
```

- `changes`: 비개발자가 이해할 한국어 1~5문장, 문장당 6~240자. 바뀐 동작과 사용자에게 미치는 영향을 구체적으로 씁니다. 기술 용어·커밋 번호·추측·계획·민감 정보·외부 링크는 넣지 않습니다.
- `path`: 확인할 kyaa 경로. `/`, `/notifications`처럼 영문·숫자·하이픈·밑줄·슬래시만 사용합니다.
- `images`: 화면 변경을 확인할 실제 브라우저 캡처. `release-notes/images/` 아래 소문자·숫자·하이픈으로 된 PNG 파일을 같은 커밋에 넣습니다. 화면과 무관한 변경이면 이 항목을 생략합니다. 배포 전체에서 최대 10장, 한 장당 5 MB 이하이며 CI가 파일 존재·PNG 헤더·크기를 확인합니다. 이미지는 공개 저장소에 올라가므로 회원 정보·비밀 값이 없는지 직접 검수합니다.
- 수정 후 관련 부분이 잘 보이는 캡처를 기본으로 합니다. 전후 비교가 필요하면 순서와 차이를 문구로 설명합니다. 예시 데이터·로컬 검증 화면은 그 사실을 안내에 쓰고 운영 캡처라고 표현하지 않습니다. 화면으로 확인할 수 없는 변경에 무관한 이미지를 붙이지 않습니다.
- 파일 이름은 소문자·숫자·하이픈으로 만듭니다. 이미 게시한 안내는 수정·삭제하지 않고 새 파일을 추가합니다.
- main push/PR 검사가 실행 코드 변경의 안내 누락·형식 오류를 잡습니다. 문서·테스트만 바꾼 경우와 이미 안내한 코드의 재배포는 새 안내 없이 건너뜁니다. 기존 배포 파이프라인의 보호 규칙은 변경하지 않습니다.
- 전송 문구는 여러 작업의 안내를 합칩니다. 글은 합계 3,900자 이내로 정리합니다. 이미지를 붙일 때는 사진당 1,024자 이내이며, 긴 안내는 줄과 링크를 자르지 않고 한 앨범 안의 사진별 캡션으로 나눕니다. 사진 수로 담을 수 없는 안내는 전송 전에 거부합니다. 한 장은 사진 메시지, 여러 장은 앨범으로 문구와 함께 한 번만 전송합니다. 이미지 주소는 실제 배포 커밋에 고정하므로 이후 main 변경으로 다른 화면이 섞이지 않습니다. 제한은 [Telegram Bot API](https://core.telegram.org/bots/api#sendphoto)를 따릅니다.

첫 첨부 예시 `2026-09-29-notification-alignment-example.png`는 앞서 배포한 알림 점 정렬 수정의 브라우저 검증 캡처입니다. 실제 알림 컴포넌트에 예시 데이터를 넣은 로컬 화면이며 운영 회원 데이터가 아닙니다.

## 전송 기준과 복구

현재 운영은 `.github/workflows/aws-platform.yml`에서 AWS 배포와 `kyaa.io`의 실제 반영 버전이 일치하는지 확인한 뒤 같은 실행 안에서 안내를 전송합니다. GitHub에 저장된 배포·성공 상태를 다시 읽고, 기존 전송 기록으로 중복을 막습니다. `GITHUB_TOKEN`으로 만든 배포 상태는 다른 워크플로를 시작하지 않으므로 별도 이벤트에 의존하지 않습니다.

`.github/workflows/deployment-notices.yml`의 Vercel `Production` 배포 `success` 이벤트 경로는 이전 환경과 kyaa wave의 호환을 위해 유지합니다. 고정 저장소·Vercel 발신자·현재 배포 상태·main 포함 여부를 검증하고, `https://kyaa.io`의 인증된 전송 경로만 호출합니다. 봇 키는 기존 Vercel 앱에 그대로 두고, GitHub에는 기존 operator secret만 설정합니다. 기존 버그 접수 웹훅·반응 기능은 변경하지 않습니다.

마지막 전송 성공 receipt 이후의 새 안내를 모읍니다. AWS 알림 전환의 최초 기준은 2026-10-26 실제 운영 반영을 확인한 배포 `7329076955` / `a9c8a1dafd4aa33420ed22f65d315450801ac534`입니다. 이 시점 전의 Vercel 안내를 소급 전송하거나 발송 성공 기록을 만들어 넣지 않습니다. 이후에는 AWS의 실제 전송 성공 receipt부터 이어갑니다.

기존 Vercel 첫 안내의 기준은 도입 전 배포 `6712694578` / `401f25159028791b0d680df3c56c1b7e6a354714`로 고정하며 과거 안내를 소급 전송하지 않습니다. 실패·미완료 배포는 게시하지 않습니다. 동일 이벤트/작업 재실행은 성공 receipt가 있으면 건너뛰고, 뒤늦은 과거 이벤트는 더 최신 알림이 있으면 건너뜁니다. 빠른 연속 배포에서 대기 작업이 합쳐지면 마지막 전송 이후의 안내를 다음 알림에 모읍니다.

GitHub check `Telegram deployment notice`에 배포 ID, 메시지 ID와 전송 결과를 기록합니다. 전역 concurrency와 전송 전 예약으로 CI의 자동 전송 시도를 한 번으로 제한합니다. Telegram API에는 idempotency key가 없고 내부 전송 경로도 단독 중복 방지 저장소는 아니므로, **결과 불명 POST를 직접 다시 보내면 안 됩니다.**

- `success`: 전송 완료. 재실행해도 보내지 않습니다.
- `failure`: 메시지가 거절된 것이 확인된 상태. 원인을 고친 후 해당 Actions 실행을 재실행할 수 있습니다. 다음 성공 배포에도 아직 전송되지 않은 안내가 포함됩니다.
- `action_required` 또는 오래된 `in_progress`: 전송됐을 수도 있습니다. 후속 자동 알림도 멈춥니다. 방에서 실제 메시지를 확인한 운영자가 receipt를 `success`(메시지 ID 포함) 또는 `failure`(미전송을 확인한 경우만)로 정리한 다음 해당 실행을 재실행합니다. 확인 없이 삭제·실패 처리하지 않습니다.

검증: `node --test scripts/deployment-notices.test.mjs`, `node scripts/deployment-notices.mjs check <base-sha> <head-sha>`, `npm run test:web -- server/telegram`.

참고: [GitHub 배포 이벤트](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#deployment_status), [Check runs](https://docs.github.com/en/rest/checks/runs), [Telegram sendMessage](https://core.telegram.org/bots/api#sendmessage).


## kyaa wave 홈페이지 배포 안내

- `kyaawave.com`도 같은 Bug Report 방(-5187701508)에 운영 배포 성공 뒤 자동 안내한다. 수동으로 같은 안내를 다시 보내지 않는다.
- 별도 Vercel 프로젝트 `sallylab/kyaawave`는 같은 저장소의 `codex/kyaawave-homepage-20261018` 브랜치, `sites/kyaa-wave` 루트를 사용한다. 해당 브랜치에 새 변경 안내와 공개 가능한 화면 캡처를 함께 커밋하고 푸시한다. Git 연동 운영 배포 성공 이벤트가 기존 안내 workflow를 실행한다.
- 안내 제목은 `kyaa wave`, 확인 링크는 `https://kyaawave.com`을 사용한다. 본 서비스의 안내 및 전송 기준과 섞지 않는다. 전송 기록은 GitHub check `Telegram deployment notice · kyaa wave`로 구분하며 동일한 전역 직렬화·예약·결과 불명 보호를 유지한다. 대기열은 `queue: max`로 설정해 다른 사이트의 배포가 대기 안내를 덮어쓰지 않게 한다.
- 첫 홈페이지 안내 기준은 DHL 사진 교체 직전 커밋 `ccefa65a22fd7ec464247350c480aeb1b6d57a85`이다. 이전 홈페이지 안내는 소급 발송하지 않는다. 이후에는 마지막 홈페이지 전송 성공 기록 이후의 변경만 모은다.
- 기존 CLI 단독 배포는 GitHub 성공 이벤트를 만들지 않으므로 일반 변경은 위 Git 연동 경로로 배포한다. 수동 운영 복구가 필요하면 성공 배포와 GitHub 전송 기록을 먼저 대조하고, 결과가 불명확하면 재전송하지 않는다.

GitHub 배포 환경이 프로젝트 수에 따라 `Production`, `Production – kyaa`, `Production – kyaawave`로 표시되는 경우를 모두 지원한다. 전송 기준 검색은 이 이름의 전환 전후 이력을 함께 확인하며 사이트별 check로 구분한다.
