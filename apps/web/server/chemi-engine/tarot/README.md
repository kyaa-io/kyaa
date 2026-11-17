# W1-TAROT 서버 엔진

`drawMemberTarot` 입력은 인증된 회원 번호, 서버가 정한 한국 날짜(YYYY-MM-DD), 덱 버전과 주입된 소금값이다. 회원 번호·날짜·덱 버전의 JSON 배열을 HMAC-SHA256으로 처리한다. 정·역은 독립적인 1비트 추첨이며 카드 번호는 0~77, 3장은 반환 순서대로 서로 다르다. 같은 입력은 같은 결과다. 캐릭터는 시드에 포함하지 않는다.

비밀 저장소 이름은 `CHEMI_TAROT_SALT`(32자 이상)이다. 실제 값이나 환경 직접 조회는 이 영역에 넣지 않는다. 공용 `server/chemi/env.ts` 담당자가 값을 읽어 주입한다. 값이 없거나 짧으면 `CHEMI_CONTENT_OFF`로 닫힌다.

비회원 `drawGuestTarot`는 한 장만 반환하고 저장·식별·캐시를 하지 않는다. 로그인 후 기존 카드 우선 처리, 배열·주제별 결과 저장과 이용권 처리는 W1-REWARD 소유다. 본 엔진은 DB·API·UI를 만들지 않는다.

검증: 격리된 /tmp/chemi-tarot-check에서 Vitest 6개 통과(재현·중복 방지·입력 변경·비밀 누락·입력 검증·7,800건 정역 분포·비회원 반환). 격리 TypeScript 검사 통과. 저장소 의존성이 없어 저장소 Vitest는 시작 실패했고 `kyaa-cds-typecheck`는 PATH에 없다. DB 변경 없음. 06-0/06-1은 제공 order.json에는 있으나 해당 HTML id 원문은 pack/sheets에서 찾지 못했다. 감독 통합 검사와 원문 대조가 남아 있으므로 작업 전체 수용 완료로 간주하지 않는다.
