# 모임 운영 전환 — 진행 기록

## 승인 범위
- 최신 Pen: 원본 checkout outputs/kyaa-fanpage-implementation-20261101/kyaa-fanpage.pen 및 최신 DESIGN.md. 흰 표면·핑크 활성·압축 UI.
- PC/모바일 웹과 관리자 전체 완성 뒤 일괄 전환. 모바일 앱 잠정 중단: 앱 화면·빌드·스토어·앱 전용 검증 제외.
- 기존 HOME/커뮤니티 및 creator /{slug}, /c/{slug} 호환 보존. 탐색 /pages/groups, 일반 페이지 /pages/groups/[pageId].
- 팬/취미 4탭 홈·게시판·비밀방·활동, 브랜드 홈·소식·행사·컬렉션. 회원·친구·랭킹/정보·설정은 헤더.
- 가입과 팬인증 별개. 모든 새 페이지는 신청→검토→승인 후 소유자 부여. 팬 비밀방 가입+팬인증+최소등급Gold 기본, 취미는가입회원.
- 글로벌 지갑: 100P/하트,100P/응모권,광고없음. 출석KST10P/연속7일마다20P,빠지면reset/월유지. 정책전환다음날부터 신규지급,소급없음.
- 캡슐 고정확률형: 1/10회,1회1응모권,중복허용,로그인회원/Kyaa관리자개설. 실제경품+꽝확률100%,시작후잠금,어느경품소진시중단. 10회는모든당첨재고>=10. 실제경품운영seed금지.
- 기존원장/보류/미완료/환불/취소/receipt/유료권리보존. 전역single-user-lock의legacy응모/환불/캡슐일관성. 기존request는원래정책으로복구.
- 개인친구/DM기존서버재사용, 전역pair단위친구쓰기·해제와friends-only권한회수. 비밀방별도.

## 작업 상태
- baseline origin/main e878be041, 별도 codex/groups-production-20261101 worktree.
- 사용자 원본 untracked 파일 보존. 앱중단Engram#6948 기록.
- core model/API, web, wallet 담당 분리하여 구현 시작. 모두 미완료.
- 남음: 실제200상태대응/기존팬페이지/MY/관리자/이벤트QR/컬렉션/소셜/캡슐/추첨확장, 전역원장이관, 모든검증, 독립검토, 운영전환.

## 완료 게이트
실제 데이터·권한·중복/동시거래·이관/복구SQL검증,12언어390/1440과ko/ja/vi/th360/768,200상태coverage, 독립검토. 기존Pen점수재사용금지. 전부완료전push/prod전환금지.
배포: expand schema 호환→dev완성검증→관련write fence/worker drain→권리대사/이관→DBcontract+정확한코드SHA→화면전환/fence해제. SQLchecksum/RDSidentity 별도증거. 새DB호환복구build만사용. AWS정확devrun승격예약·운영health SHA·자동공지확인. 실패시fence유지/receipt복구,원장삭제금지.

## 2026-11-02 진행 체크포인트
- core/model/API 020e0af08 커밋. 해당 커밋에 root작성 capsule route2개가 함께 포함됨; 되돌리지 않음. 나머지는 미커밋 통합 중.
- 지갑: 원장복사 없이 global projection/sequence, legacy writer 공통잠금, 초대 양방향 잠금, 기존 request/cancel권리보존. 410 migration replay+실제 wallet assertions+동시경쟁 통과. 운영활성화 default false/fenced 유지.
- 캡슐: root SQL/API+관리자UI, web agent 실제사용자UI. 410migration replay+12 capsule 데이터검사 및4 HTTP trust-boundary tests 통과. 실제재고/경품 seed없음.
- UI: 모임탐색/개설신청/페이지관리/4탭/게시글/비밀방·댓글·미디어 연결 진행. 전역server booleancontext로HOME/community/MY/footer nav연결. 개인친구/DM API및UI 추가.
- root 지갑페이지는 실제컴포넌트+loopbackauth/API Vitefixture에서1440 시각초기확인. 거대한 동일높이여백 제거, 중요행동핑크 강조 수정. 전체브라우저매트릭스 미완료.
- 새 일반모임 추첨은 기존LIVE/admin강제테이블에 가짜LIVE를 넣지 않고 page-scoped 저장모델로 확장; 기존 benefit_digest_uint256/동일sha256 weighted ranking 알고리즘과 기존ticketledger를재사용. 기존진행캠페인독립보존. 신규generic SQL/API/worker는 현재 미검증.
- 활동/행사/컬렉션 및미션 실제영속모델 추가 중. 과거 '빈상태UI'는 기능완료로계산하지 않음.
- 첫 tsc 통과 뒤새Next route생성으로3 TS2590 발생; 실제URL값보존하며conditionaltype확장축소수정. 후속통합검증필요.
- 실행 중: nextdev3127 (서버credential없음;publicauthID만), Vite3128(realcomponents+syntheticAPI), 독립localPGtests. 운영DB/배포/푸시 실행없음.

## 2026-11-02 00:30 추가 진행 (아직 미완료)
- 원본205보드=197 UI/상태+8system 실제PencilCLI 확인; docs/design/groups-production-coverage.json에 전부매핑. 기존180메타맵누락25개 발견. 매핑만으로통과하지않음.
- 추가누락보완: 페이지별알림/관리별도route, 회원·친구·랭킹,1단계댓글답글/첨부, 캡슐4단계모션/skip/reducedmotion, 공식행사보완·주최자지원자료별도제출심사, 사진업로드계약(마지막은작업중).
- Root: 플랫폼 admin 신청/신고/행사심사/지원자료/미션보상/아티스트bind/revoke/캡슐전달UI. root관련10 UI/APItests 통과, CSS/formpadding/checkbox/charcoalheader 실제1440확인. 최신지갑선택색을승인 #D11B62/#AD1457/#FFF0F6 및primarySpectrum으로정렬,DESIGN.md 범위기록.
- runtime배포allowlist KYAA_GROUPS_ENABLED(booleanonly) 추가 및26deployconfigtests 통과. 실제AWS설정변경없음.
- SQLcore+capsule 통합회귀통과. raffle당첨웹알림 sameDO clock_timestamp/now차이는fixture due시각보정후통과. 현재WAVE공유fixture추가해raffle gate재실행중.
- 독립security중간82/100: WAVE공통gate, inactiveownertransfer, closedroompreview를지적하여소스+회귀보완. QRinactive attendee/supportSQLalias은walletagent090에서수정검증중. 운영대사/fence/drain/recoverybuild/최종SHA는아직미실시.
- crossfeature 실제2session Lock대기/legacy↔capsule경쟁/환불inactive/paidrights snapshot/다중creatorKST출석통과. 이후capsule adminactorbind강화,fixture양쪽email일치확인함.
- coreagent완료후새사진업로드gap으로재개. walletagent080/090, web보완 계속. securityreviewer완료했다가최종diff/근거받아재검토예정.
- Next3127/Vite3128 부모서버보존. Aside tab EC745ECC1D57C8494A9E3FD75A7242D3. attach직후문서잠시빈상태면snapshot→700ms→snapshot후캡처,fullPagefalse. 운영미반영.

### 2026-11-02 00:44 통합 검증 체크포인트
- 63개 파일/477 tests 통합 통과. 변경 후 월별출석6 UI tests, wallet route9, support-admin4 통과. wallet12locale×390/1440 실제calendar행정렬/nooverflow 통과.
- 보안 독립 재검토 코드차단0/90점(운영·복구빌드10점미실시). UI 1차72점: 실제4결함수정재검수종료; creator/social/detail/capsule/MY 대표상태증거추가중이며 원본205 coverage최신화와동일루브릭2인검토진행중.
- Nextproduction compile7.8s통과, TypeScript진행중. local ffmpeg누락 install해결, ffprobe첫실행시간초과후재실행정상. Node25현재검증중이며 cacheNode24.22.1경로확인: /Users/jewel/.npm/_npx/387698761821791d/node_modules/node/bin/node.
- 운영읽기전용접속확인: prod RDSdb-CQM4L5NQYWC4FFO7D27DR26TCU/byus_admin/10.40.2.210:5432/PG170009. groups미설치, migrationledger없음. preflightsnapshot읽기전용저장; fence아님/대사완료아님. 운영스키마·원장변경0. dev RDS stopped→starting(배포검증용).
- root SSM prod터널 session71448, ID jewel-sallylab-cli-492dp5n3yx2ah92i892vbq46vi, local15433. rootNextdev44166은build위해종료, Vite3128유지. 타작업프로세스보존.

### 2026-11-02 01:10 통합 체크포인트
- Node24.22.1 production build(TypeScript 포함) exit0. 이후 모바일 게시글/댓글 폭 CSS만 추가 보정 중으로 최종 번들 재생성 예정. 변경 TS/TSX/MJS248개 scoped ESLint exit0, release/deploy 계약59 tests 통과.
- 실제 Next3127의 검색·분류·정렬→상세→게시판→뒤로가기에서 stale search를 발견하고 URL query를 단일 원천으로 수정했다. 동일 경로 Link의 조건 초기화까지 actual Next + API fixture 검증 통과. 표적13tests 통과.
- 모바일200%text directory/apply/MY390 실제넘침/행동글자잘림0. MYactualpassport/도장, LIVE 닫기·Escape·초점복귀 완료. UI 독립평가2=88/100, 확인한 차단0. 평가1은 상세댓글/비밀방 상태 마지막 검수 중. 모든205상태를 각각 봤다는 의미가 아님.
- dev RDS 실제13개 신규group SQL적용, 전후 fingerprints/assets/paidVotes 동일. disabled/fenced 유지. 파일checksum과 현source일치. prod는 여전히읽기전용; 신규스키마/원장전환/배포없음.
- clean replay 출력 migrationsApplied는public table수여서 앞선 기록의 숫자를migration건수로해석하지않는다. 실제이번dev신규migration파일13개는manifest로확인했다.
- 배포안내4캡처 직접 확인:예시데이터인 실제구성, 민감값없음. 원본205보드coverage는매핑과개별검증을구분한다. Native앱은여전히제외.
- UI후속: 두평가89/88은검증공백으로기본완료목표미달이다. 고유분기 최소fixture/행동검증을추가하고같은고정루브릭으로재검토한다. 새기능확장·전체조합무조건반복은하지않는다. 운영전환은아직실행하지않음.
