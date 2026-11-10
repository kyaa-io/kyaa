# LUCKY-GACHA-0836

브랜치: t3/lucky-gacha-0836. 기준: 08cb013e1bba62fd1e46a2ecfae59bdb96e94cac. 운영 반영은 감독 승인 후 별도다.

## 결과

- imagegen으로 기존 machine-idle.webp를 참조해 투명 1254×1254 PNG(원본)와 WebP(표시용)를 제작했다. 기존 원본은 보존했다. 카드 표시 높이 204/300px에서 3x에 필요한 해상도를 확보한다. 하트·핑크 기계·로고 위치·손잡이·배출구를 보존하며, 카드의 기존 응모권 장식은 제외했다.
- 준비 중인 실제 StanLucky 카드가 고해상도 정지 그림을 표시하고, 그림을 누르면 공통 FanDialog(lg)가 열린다. 팝업은 원본을 표시하다가 누르는 동안에만 기존 three.js 기계로 손잡이 회전·닫힌 캡슐 배출을 재생한다. 보상 공개, 응모 API, 차감 경로는 없다. 기존 Coming soon과 비활성 Enter를 유지한다.
- reduced-motion·GPU 0·데이터 절약·장면 실패에는 정지 그림과 150ms 짧은 반응을 사용한다. 실패 시 해당 페이지 세션은 정지 그림을 유지한다.
- 모달 중도 닫기/재열기 잠금, 이전 재생 Promise가 새 재생을 종료하는 경합, 투명 캔버스 밑 정지 그림의 겹침을 수정했다. 닫을 때 재생 번호를 바꾸고 취소하며, 이전 완료를 무시한다. 공통 엔진도 취소 뒤 다음 단계를 시작하지 않는다.

## 검증

- capsule-machine의 LuckyStage / MachineCanvas / CapsuleMachineBlock: 29 tests pass. 새 닫기/재열기 회귀는 수정 전 실패를 확인했다.
- group-benefits-screen: 별도 39 tests pass. 합계 68개이며 중복 파일 없음.
- npm run typecheck --workspace apps/web: pass (tsc). 빠른 tsgo보다 넓은 최종 타입 검사 결과를 사용했다.
- 변경 TSX/TS의 eslint --max-warnings=0: pass. design-lint --base HEAD: 새 위반 0 (재생 중 disabled 사유 count-only N11). copy-lint: 새 위반 0.
- deployment-notices.test.mjs: 36 tests pass.
- Hallmark sloplint: 기존/수정 CSS 모두 첫 줄 Hallmark stamp 없음 1건. 새 FAIL 0. 이 검사 통과로 포장하지 않는다.
- verify.mjs: 390/1440 실제 Chromium Metal 브라우저에서 키보드 열기, Escape/초점 복귀, 캡슐 재생 완료, 재생 중 닫기/재열기 및 재재생, 고해상도 원본 표시, 재생 중 원본 opacity 0(겹침 없음), reduced-motion 시 canvas 없음, 가로 넘침·POST·pageerror 0 확인. checks.json 참고.
- dispense-capture.mjs: 배출 순간의 닫힌 캡슐이 390/1440 화면 안에 남는 것을 직접 확인했다.

## 캡처 범위와 재현

`node work/lucky-gacha-0836/server.mjs` 후 `node work/lucky-gacha-0836/verify.mjs`를 실행한다. 실제 StanLucky 컴포넌트와 공통 스타일·모달·GPU·three.js를 렌더링하며 인증과 Next 전용 모듈만 기존 로컬 shim을 사용한다. 비회원 상태로 API에 쓰지 않는다. 운영·전체 페이지·실기기 캡처가 아니다.

before-390/1440은 위 기준 커밋의 실제 StanLucky/LuckyStage 소스를 같은 로컬 환경에서 렌더링했다. 초기 손작성 before fixture를 대체했다. after는 현재 실제 카드, modal은 원본 확대, playing/dispense는 3D 연출, reduced는 움직임 줄이기 화면이다. 모두 원본/실제 슬롯을 직접 확인했으며 로고·필수 내용 잘림·왜곡·의도치 않은 띠가 없다. release-notes/images/에는 공개 가능한 수정 후 카드/모달 4장을 연결했다.

독립 Claude 검토의 초기 차단점은 위 회귀로 수정·확인했다. 수정 후 독립 재승인이나 전체 화면 루브릭 점수로 보고하지 않는다. 최종 통합·운영 승인은 감독 범위다.

## 인계 상태

구현 커밋 `6eb7b661e60272805b45aa37aa81634e614890a8`을 만들었다. 수정 안내는 정확한 기준/구현 SHA로 `deployment-notices.mjs check` 검사를 통과했다(검사 문구만 출력, 발송·배포 아님).

`git push -u origin t3/lucky-gacha-0836`은 공유 `.git/hooks/pre-push`에서 `only main is pushed through the gate (refs/heads/t3/lucky-gacha-0836)`로 거절됐다. 해당 훅은 main만 영수증을 확인해 허용하고, 운영 브랜치는 감독 승인 SHA와 영수증을 요구한다. 훅을 우회하거나 main/운영으로 합치지 않았다. 감독이 이 로컬 브랜치 커밋을 통합 게이트로 인계할 수 있다. 원격 푸시·PR·dev 배포·운영 배포는 완료되지 않았다.
