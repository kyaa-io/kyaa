# 패스포트 도장·팬 등급 그림

2026-10-18 채널 제보 #422–430에 따라 금속·에나멜 표현 대신 단색 잉크 도장으로 통일한다. 후속 의견의 실제로 찍은 듯한 선 윤곽은 원본 SVG의 재현 가능한 작은 잉크 끊김으로 표현한다. 그림 안의 브랜드 문구와 기능 이름을 구분하고, 이름·날짜·획득·잠금·점수·등급 단계는 기존 현지화 UI와 접근성 이름에서 읽는다.

- 스탬프 14종: `apps/web/public/images/stamps/ink-v1/`. 원형 소인과 우표 테두리 안에 활동을 나타내는 그림을 둔다. `CommunityStampArtwork`, `StampArtwork`, 공유 패스포트 진입 화면이 같은 경로를 사용한다. 팬 인증의 날짜·점수는 동적 텍스트로 유지한다.
- 팬 등급 11종: `apps/web/public/images/passport/tiers/ink-v1/`. 원·팔각형·소인·방패·마름모로 다섯 등급을 구분하고 작은 점의 개수로 기존 세부 단계를 나타낸다. `FanTierBadge`는 기존 검증된 stage key를 사용한다. 점수 기준·등급 정책·보유 기록을 바꾸지 않는다.
- 앱은 `../kyaa/assets/images/{stamps,tiers}/ink-v1/`에 웹과 같은 PNG를 보관한다. `pubspec.yaml`의 두 하위 디렉터리 등록과 실제 번들 로드를 확인한다. 펼친 책의 비율과 3칸/9칸, 미획득 상태·복구 경로를 보존한다.
- 큰 유니콘 안내 그림은 이번 버전에서 생략하고 해당 활동의 도장·행사 원본·중립 상태 아이콘으로 대체한다. 원본 캐릭터·로고·기존 발급 자산은 보존한다. 새 카피바라 캐릭터는 이번 작업에 포함하지 않는다.
- SVG 원본과 PNG 표시 파일을 함께 보관한다. 기존 `community-stamps`, `opal-heart`, 발급·민팅용 파일은 덮어쓰지 않는다. 표시 이미지의 변경을 이미 발급된 기록·소유권의 변경으로 취급하지 않는다.

## 참고한 화면

[채널에서 공유한 Pinterest 검색](https://kr.pinterest.com/search/pins/?q=fancy%20stamp&rs=typed)과 [Japan souvenir stamp](https://kr.pinterest.com/pin/136656169934231040/)의 단색 소인·우표 테두리를 참고했다. [Mobbin의 업적 화면 모음](https://mobbin.com/search/apps/ios?content_type=screens&sort=trending&filter=screenPatterns.Achievements+%26+Awards)에서 Tripadvisor의 수집물·획득 상태 구분과 [Nike Run Club의 업적 화면](https://mobbin.com/screens/02079ed3-aef7-4514-9016-61fe887b5f4d)을 실제 화면으로 확인했다. 외부 그림을 복사하지 않고 기하와 아이콘을 새로 그렸다.

Figma의 2026 Redesign Components 페이지에 [스탬프 14종](https://www.figma.com/design/C54S48SHACtJmHD3GfK6KV?node-id=632-1922)과 [등급 11종](https://www.figma.com/design/C54S48SHACtJmHD3GfK6KV?node-id=633-259792)을 동기화했다. 보존된 v4.7 화면은 수정하지 않았다.

## 검수 범위

원본의 투명 배경·정사각형 비율·웹/앱 파일 일치와 실제 390px·1440px 화면을 함께 확인한다. 기능 문구는 11개 언어에서 유지하고, 앱은 작은 화면·글자 확대와 실제 시뮬레이터 캡처를 확인한다. 예시 데이터의 로컬 화면과 실제 운영·실계정 검증을 구분한다. 이번 검증 명령·화면·한계는 `work/stamp-design-20261018/`와 앱의 `docs/ink-stamps-20261018.md`에 기록한다.

## 실제 도장 표현 재작업

사용자의 후속 지적에 따라 얇은 선 위주의 첫 구현을 다시 그렸다. 중심 그림은 굵은 잉크 면과 투명한 음각으로 만들고, 외곽의 흔들림·미세 기울기·불규칙한 종이 결·잉크 압력 차이를 반영했다. 14개 활동 그림과 11개 등급 별을 새로 그렸으며, 기존 단계·획득·잠금·점수·현지화 영역은 유지한다. 동적 팬 인증 날짜·점수는 이미지로 굳히지 않는다.

새 Aside 조사 원본·적용 이유는 `work/stamp-redraw-20261018/benchmark.md`, 생성기는 같은 폴더 `redraw.mjs`에 있다. 이전안은 `before/`와 기존 outputs에 보존하고, 사용자 비교 시안은 `outputs/kyaa-stamp-redraw-20261018/`에 둔다.

## 배포 자산 압축

원본 SVG/512px PNG는 `docs/design/assets/ink-v1/`에 보존한다. `node scripts/prepare-ink-collectibles.mjs`는 모든 표시 파일을 무손실 WebP로 내보내고 디코딩된 RGBA 바이트의 완전 일치와 개별 용량 감소를 검사한다. 25종 합계 1,208,475→672,382 bytes(44.4% 감소). 동적 인증 테두리는 302,813 bytes SVG 대신 같은512px렌더와 픽셀이 일치하는18,416 bytes WebP를 쓴다. 런타임에는 WebP만 배포하고 원본은 UI요청경로 밖에 둔다. Next Image의 추가 손실 변환을 피하도록 해당 표시 이미지에만 unoptimized를 적용한다. 기존 발급 원본·데이터·단계·현지화는 그대로 유지한다.
