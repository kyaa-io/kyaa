# DEV-TRAIN-2 통합 결과

상태: NEED-PUSH — 필수 빠른 검사 완료(제목 번역의 기존 실패 6개 별도). 푸시하지 않음.

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

충돌 처리: DESIGN.md 양쪽 기록 보존. fan-icons.ts export 합집합. notice-comments는 보조 문구 제거와 EarnBadgeCorner 모두 유지. my-screen은 TierGuideInfo 유지·tierHelp 제거. selected-bias는 hover prefetch Link 유지. 006754188의 rich-post-body는 사진 재마운트 방지 구현 유지; 나머지 충돌 구간은 통합 main 쪽 유지. 해당 커밋의 제목 번역 제거 비충돌 변경은 유지. post-card 제목 번역 동작은 main 통합 쪽을 유지했으며 관련 기존 실패 6개는 아래에 분리. 기존 release-notes 수정 없음.

초기 검사(아래 후속 처리에서 해소):
- notices-check: node scripts/deployment-notices.mjs check <full base> <full head> 성공 (최초 symbolic ref 호출 INVALID_COMMIT 후 full SHA로 재실행).
- design-lint: 성공, no new violations.
- apps/web tsc --noEmit: 실패. hover-prefetch-link의 LinkProps에 children 등이 빠져 다수 호출부 오류. 원인 줄기 0bfca7b36의 공통 Link 타입 확인 필요.
- 관련 vitest: 실행 시도했으나 공유 node_modules/rolldown/dist/shared/parse-DPCdsGgB.mjs 누락으로 시작 실패.

원본 로그: work/train2/{notices,design,types,vitest}.log. 운영 DB 접근·main/release 푸시 없음. 초기 차단은 아래 후속 처리에서 해소.

## 감독 후속 처리

- 공유 node_modules 심볼릭 링크만 제거하고 현재 worktree에서 `npm ci --ignore-scripts` 성공. 공유 디렉터리는 변경하지 않음.
- 원본 0bfca7b36을 git archive로 분리 추출하고 이번에 설치한 의존성으로 `npm run typecheck` 실행: exit 2. 원본에서도 LinkProps의 children/onFocus 누락 재현. 통합 충돌로 생긴 오류가 아님. 원본 추출본은 검사 후 정리했고 original-types.log 보존.
- 공통 hover-prefetch-link의 타입에 AnchorHTMLAttributes(Omit으로 Next LinkProps 우선)와 RefAttributes를 결합. 기존 링크 자식·DOM 속성·ref와 Next 링크 계약을 함께 보존. 실행 로직 변경 없음.
- 번역 diff 재검토: PostDetailHeader의 translation은 menu와 함께 상단에 표시. 공지에도 동일 헤더 적용. 006754188의 상세 폭 CSS 반영. rich-post-body는 분기마다 RichBody를 교체하는 구버전 대신 동일 RichBody + textHidden 유지하여 사진·영상 재마운트 방지. 83546653c의 stable-tree.tsx/rich-body.tsx/content-asset.tsx와 통합 HEAD 사이 차이 없음. 원문 데이터 변경 없음.
- 관련 Vitest 6파일 35개 통과. 전체 관련 7파일 실행은 35개 통과·제목 번역 6개 실패. `post-card-title-translation.test.tsx`의 6개는 감독이 운영 기준 58d95e2f에서도 실패한다고 확인한 기존 실패로 분류(이번 작업에서 해당 운영 기준을 다시 실행하지 않음).
- 로그: work/train2/npm-ci.log, original-types.log, types.log, vitest.log, vitest-related.log. diff 근거: translation-review.diff, media-preservation.diff.

최종 검사: `npm run typecheck` exit 0; 관련 Vitest 6파일 35개 통과; notices-check exit 0; design-lint exit 0(no new violations). 전체 빌드·mini gate·실브라우저·운영 DB 검증은 이 통합 작업에서 수행하지 않음. 기존 제목 번역 실패 6개는 남아 있음.
