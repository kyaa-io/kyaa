# DEV-TRAIN-2 통합 결과

상태: BLOCKED — 필수 검사 실패. 푸시하지 않음.

기준: origin/main 3d88d2d3253ca4e4f56ed34b218683232462369d

포함 (--no-ff):
- 6b7d167a92fb2c3339b877bee6309189e081714c
- 16b218d73cd21d8a1c4c2111e47000ddead12eb3
- e58d813f13effda842a96a6a4b90ed1d6f4e57b8
- 09bd38d80cbc3094d4e265745b757c72f50bb036
- 27e6ce1010d8410725b75265df27be3f71851f5e
- 31fbe506d4a905d419b28226cd975f2382b7d2f4
- 83546653cd4cfdd8568e8818bf254efed0dc7c5a
- 0bfca7b36117fd643696db09a674945ec8ad6e2c
- a619e09aed86406d69c46345fa6526bae0d9a1e8
- cd3b4d91f665ee89976a8da4fdd0805847e4a3fa
- bab8e6c8fe6c495949837c81bf4f29e54d76de42
- 82500d358d4517a52bd889f8278f87dc0043ff6b
- 0067541884f60ff7f2793c54f3bf2bc3821df331

제외: 88a1f3f7f 폐기 열차, 3042081b0 이전판(최신 D-A 27e6ce101 선택). 이미 main 포함: 요청 줄기 중 없음.

충돌 처리: DESIGN.md 양쪽 기록 보존. fan-icons.ts export 합집합. notice-comments는 보조 문구 제거와 EarnBadgeCorner 모두 유지. my-screen은 TierGuideInfo 유지·tierHelp 제거. selected-bias는 hover prefetch Link 유지. 006754188의 rich-post-body는 사진 재마운트 방지 구현 유지; 나머지 충돌 구간은 통합 main 쪽 유지. 해당 커밋의 제목 번역 제거 비충돌 변경은 들어 있어 추가 검토 필요. 기존 release-notes 수정 없음.

검사:
- notices-check: node scripts/deployment-notices.mjs check <full base> <full head> 성공 (최초 symbolic ref 호출 INVALID_COMMIT 후 full SHA로 재실행).
- design-lint: 성공, no new violations.
- apps/web tsc --noEmit: 실패. hover-prefetch-link의 LinkProps에 children 등이 빠져 다수 호출부 오류. 원인 줄기 0bfca7b36의 공통 Link 타입 확인 필요.
- 관련 vitest: 실행 시도했으나 공유 node_modules/rolldown/dist/shared/parse-DPCdsGgB.mjs 누락으로 시작 실패.

원본 로그: work/train2/{notices,design,types,vitest}.log. 운영 DB 접근·main/release 푸시 없음. 필수 검사 통과 및 마지막 번역 충돌 재검토 전 mini gate 투입 금지.
