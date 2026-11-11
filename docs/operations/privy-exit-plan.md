# PRIVY-EXIT-0005 계획서

- 작성: 2026-11-12 01:3x, 담당 변경 전 마지막 작업자(Opus). 다음 담당: Astra/Fable.
- 작업 위치: worktree `t3-privy-exit-0005`, 브랜치 `t3/privy-exit-0005`, 기준 `16e26e19c`(origin/main).
- 사용자 결정: Privy 완전 중단(11/12 00:0x), 우리 서버가 주소 발급, 회원 주소에서 실제 거래·가스는 kyaa 대납(00:1x).
- 하지 않는 것: main 푸시, 운영 DB 적용, AWS 리소스 생성, Privy 내보내기·백필 실행, 테스트넷 자금 수령. 모두 감독 승인.
- 운영 실행 절차: `docs/operations/privy-exit-runbook.md`.

## 0. 현재 상태

| 커밋 | 내용 | 상태 |
|---|---|---|
| `aafbdcd15` | 1차-A 서버·DB·클라이언트: Cognito 로그인, Privy 호출 제거 | 완료 |
| `d3ca01ec8` | 1차-B 주소 발급(xpub)·백필 도구·카카오 경로·runbook | 완료 |
| `5a4a6bf2b` | 로그인 오류 문구 원문·경로 시험 | 완료 |
| `6bafac940` | 1차-C 웹에서 Privy SDK 제거, CSP 정리, 배포 안내 | 완료 |
| `9a4f03db3` | 2차 근거: GIWA 7702 확인 스크립트, runbook 메모 | 완료 |
| (이 문서 커밋) | 계획서 | — |

게이트: 1차 전체 = `9a4f03db3`까지(1차만 = `5a4a6bf2b`). 게이트는 아직 돌리지 않았다(`kyaa-t3 gate-remote 16e26e19c <sha>`).

---

# 1차: Privy 없이 로그인·세션 (구현 완료, 게이트·dev 확인 남음)

## 1-1. 설계 요약
- 회원 식별 키 `app_users.privy_user_id`는 유지. 기존 회원 `did:privy:…` 그대로, 새 회원 `kyaa:<uuid>`. 기존 API 74개 dependencies·`findUserByPrivyId`는 그대로.
- 로그인: Cognito Hosted UI(Google·Apple·카카오 선택) → `/api/auth/cognito/callback`에서 `kyaa_sign_in`.
  - `linked`: Google/Apple subject가 `live_privy_auth_accounts` 또는 `legacy_auth_inventory_accounts`의 한 회원과 정확히 일치.
  - `new`: subject·이메일 모두 없음 → 서버가 주소 파생 후 `create_kyaa_member`.
  - `blocked`(`email_in_use`·`inactive`·`ambiguous`·`wallet_missing`): 세션 없이 `/login?authError=…`. 이메일만으로 병합하지 않는다.
- 세션: `__Host-kyaa-cognito` 쿠키 + DB 암호화 세션, 최대 30일(Cognito refresh token 수명).
- 요청 인증: `kyaa-cognito:` Bearer → JWKS 캐시 로컬 검증 + `resolve_kyaa_identity` 1회. `privy.users()._get` 없음.
- 웹 클라이언트: `AuthRoot`(CognitoAuthProvider) 하나, Privy SDK 없음. `useByUsAuth`는 서버 세션만 읽음.
- Privy Bearer 검증 경로는 앱(Flutter) 이전까지 서버에 남음(요청마다 Privy 조회 — 위험 1-5).

## 1-2. 작업 목록과 파일
| # | 작업 | 파일 | 상태 |
|---|---|---|---|
| 1 | 로그인·회원 연결 RPC, 세션 동기화가 `kyaa:` 키 허용, 카카오 issuer 허용, `kyaa_wallet_derivations` | `supabase/migrations/20261224000000_kyaa_native_auth.sql`, `supabase/tests/kyaa_native_auth.sql` | 완료(미적용) |
| 2 | 로그인 분류·회원 생성 서비스 | `apps/web/server/auth/cognito/kyaa-identity.ts`(+ `.test.ts`, `.contract.test.ts`) | 완료 |
| 3 | 주소 파생(xpub, `m/44'/60'/0'/0/i`) | `apps/web/server/wallet/address-issuer.ts`(+test), env `KYAA_WALLET_XPUB` | 완료 |
| 4 | 콜백·세션 라우트, 30일 세션 | `server/auth/cognito/browser-routes.ts`, `browser-session.ts` | 완료 |
| 5 | 검증기 Cognito 경로에서 Privy 제거 | `server/auth/privy-node-verifier.ts`, `server/auth/cognito/access.ts` | 완료 |
| 6 | 앱용 Cognito 핸드오프·탈퇴 정리 | `server/auth/cognito/native-bridge.ts`, `deletion.ts`, `server/profile/account-deletion-dependencies.ts` | 완료 |
| 7 | Privy 지갑 연결 단계 폐지 | 삭제: `cognito/wallet-link.ts`, `enrollment.ts`, `app/api/auth/cognito/wallet-link/*`, `features/auth/client/cognito-wallet-link.tsx`; `/auth/cognito/link`는 `/login`으로 | 완료 |
| 8 | 클라이언트 인증 | `features/auth/client/cognito-auth.tsx`, `auth-root.tsx`, `auth-fallback.ts`, `open-login-page.ts`; 삭제: `privy-backend*`, `privy-root*`, `privy-mirrors`, `privy-provider-*`, `island-test/`, `components/privy-provider.tsx`, `vitest.island.config.ts`, next.config alias | 완료 |
| 9 | 세션 공급자·로그인 화면·관리자 로그인 | `components/byus-session-provider.tsx`, `login-page.tsx`, `admin/admin-login.tsx`, `avatar-session-bridge.tsx`; 삭제: `custom-oauth-*` | 완료 |
| 10 | 로그인 오류 문구(11개 언어) | `i18n/catalogs/components__login-page.ts`, `i18n/source-messages.json` | 완료 |
| 11 | CSP | `apps/web/security-headers.ts` | 완료 |
| 12 | 패키지 | `apps/web/package.json`, `package-lock.json`(`@privy-io/react-auth` 제거, 474 항목) | 완료 |
| 13 | 시험 이식 | 시험 124개 `vi.mock` → `auth-fallback`, e2e 하네스 30개 alias `/^.*\/auth-fallback$/` | 완료 |
| 14 | 카카오 OIDC 준비 | `server/auth/cognito/verifier.ts`, `browser-routes.ts`, `server/config/public-runtime-config.ts`, `infrastructure/aws/platform/environment.json`(`KakaoProviderSecretArn`), `scripts/aws-platform-deploy.mjs` | 완료(기본 꺼짐) |
| 15 | 기존 회원 백필 도구 | `scripts/privy-exit/export-privy-users.mjs`, `import-backfill.mjs`, `apps/web/server/auth/cognito/backfill.mjs`(`kyaa:` 허용) | 완료(미실행) |
| 16 | 배포 안내 | `release-notes/2026-11-12-privy-exit-cognito-login.json` | 캡처 없음(1-4) |

## 1-3. 시험
완료:
- SQL(롤백 트랜잭션, 로컬 DB): 기존 회원 연결·DID·지갑 유지, 이메일 충돌 차단, 신규 생성, 카카오, 정지 거부, 중복 subject 거부, 세션 동기화 `kyaa:` 허용 → `supabase/tests/kyaa_native_auth.sql` 통과.
- 실제 SQL 응답 → 라우트 스키마 계약 시험(`kyaa-identity.contract.test.ts`).
- 합성 백필 드라이런: 내보내기 형식 → backfill → 가져오기 → `kyaa_sign_in` linked(DID 유지).
- 웹 전체 vitest: 53 실패 = 기준 커밋 `16e26e19c`의 22파일·53건과 동일(신규 0). `benefit-recipient-screen` 1건은 전체 실행 부하 때만 실패, 단독 3회 통과.
- 로컬 하네스: `community-stamps-local/passport-run.mjs` 32조합 통과. `banner-local/admin-run.mjs`는 기준 커밋도 같은 실패.
- `tsc --noEmit`, 변경 파일 eslint, `scripts/aws-platform-deploy.test.mjs`(30), `scripts/privy-exit/privy-exit.test.mjs`(4) 통과.

남은 것(다음 담당):
1. 게이트: `kyaa-t3 gate-remote 16e26e19c 9a4f03db3`. `next build`는 아직 안 돌림.
2. dev 적용 뒤 실제 브라우저(감독 승인 후): 기존 회원 Google·Apple 재로그인(같은 MY·도장·지갑), 신규 Google 가입(주소 1개·`kyaa_wallet_derivations` 행·환영 도장), 같은 이메일 다른 계정 → `email_in_use` 문구, 정지 → "이용이 중지된 계정이에요.", 로그아웃, 탈퇴 → 재로그인 `inactive`, 관리자 Google 로그인, 네트워크 탭 `auth.privy.io` 0건, 390·1440 로그인 화면 캡처(배포 안내 이미지).
3. 비로그인·로그인 상태로 `useByUsAuth().login()`을 쓰는 화면 6곳(`fanpage-request-form`, `cheer-event-photocard`, `schedule-*`, `participation-requests`, `certification-detail-screen`, `app/s/raffle`, `admin/signup-event/exports`)이 `/login?returnTo=` 로 가는지.

## 1-4. 위험
| # | 위험 | 대응 |
|---|---|---|
| 1-1 | 최근 로그인하지 않은 기존 회원은 subject가 없어 `email_in_use`로 막힘 | 운영 전환 전 Privy 내보내기·백필(runbook) 필수 |
| 1-2 | Apple subject는 팀 단위. Cognito Apple 팀 ID가 `7RFN3TFR5K`와 다르면 기존 Apple 회원 연결 불가 | 감독이 `describe-identity-provider`로 팀 ID 확인(작업자 가드로 미확인) |
| 1-3 | 전환 직후 모든 회원 1회 재로그인 | 배포 안내 문구에 포함 |
| 1-4 | 로그인 화면 캡처 없음 | dev 확인 때 추가 |
| 1-5 | 앱(Flutter)의 Privy 토큰 경로는 요청마다 Privy 조회 → Privy 장애 영향 남음. 앱용 Cognito 응답에서 `walletToken` 제거 | 앱 이전 과제. `t3/privy-offpath-2355`의 Privy JWKS 로컬 검증 재사용 검토 |
| 1-6 | 웹 이메일 로그인 화면 없음(이메일 풀은 앱 계약만) | 별도 과제 |
| 1-7 | 첫 로그인 Google 프로필 사진 가져오기 꺼짐 | Cognito ID 토큰 `picture` 서버 처리로 별도 과제 |
| 1-8 | 개인정보처리방침에 Privy 위탁 문구 남음 | 사용자 결정(법률) |
| 1-9 | 카카오 `email_verified` 제공 여부 미확인 | dev에서 실제 앱으로 확인 |

## 1-5. 되돌리기
- 앱: 이전 빌드(`16e26e19c` 계열)와 `AUTH_PROVIDER=privy`로 재배포. 웹에서 Privy SDK를 지웠으므로 설정만으로는 못 되돌린다.
- DB: 마이그레이션은 추가형(새 함수·표·시퀀스, 제약 확장 2개, 기존 함수 정규식 확장). 되돌리지 않고 둔다. 이전 빌드는 새 함수를 부르지 않는다.
- 전환 중 생긴 `kyaa:` 회원은 Privy 로그인으로 들어올 수 없다 → 되돌리기 전 `select count(*) from app_users where privy_user_id like 'kyaa:%'` 확인, 공지.
- 세션: 이전 빌드는 `__Host-kyaa-cognito` 세션을 정리 경로로만 다룬다(기존 retired 처리).

---

# 2차: KMS 봉인 주소 키 + 회원 주소 거래 + 가스 대납 (계획만)

### 확인한 사실 (2026-11-12 01:2x, 공개 RPC 읽기 전용, 자금·전송 없음)
| 항목 | 결과 | 근거 |
|---|---|---|
| 체인 | `eth_chainId`=0x164ce(91342), 노드 `op-reth/v2.8.1` | https://sepolia-rpc.giwa.io |
| Prague/Isthmus 활성 | 최신 블록 헤더에 `requestsHash` 존재 | `eth_getBlockByNumber latest` |
| **EIP-7702 동작** | 무작위 EOA가 `Simple7702Account`에 위임하는 authorization을 넣고 `eth_estimateGas`/`eth_call` → 위임 코드가 실행돼 `not from self or EntryPoint`로 되돌림. 위임 없이 같은 호출은 일반 EOA로 23,406 gas. 회원 자신이 호출하면 성공 | `apps/web/scripts/giwa-7702-probe.mjs` (재실행 가능) |
| 위임 대상 | eth-infinitism `Simple7702Account` `0xe6Cae83BdE06E4c305530e199D7217f42808555B` 배포됨, 코드 해시가 Ethereum Sepolia와 동일 | `eth_getCode` 비교 |
| EntryPoint v0.8 | `0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108` 배포됨. Ethereum Sepolia와 35바이트만 다름 = chainId 상수(91342↔11155111)와 EIP-712 도메인 분리자 → 정식 결정적 배포본 | 바이트 비교 |
| EntryPoint v0.7 | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` 배포됨, Sepolia와 동일 | `eth_getCode` |
| 가스 단가 | baseFee 280 wei, gasPrice ≈ 0.001 gwei (테스트넷) | `eth_gasPrice` |
| 외부 번들러 | Pimlico 번들러·verifying paymaster 지원 목록에 GIWA 없음, Alchemy 목록에도 없음(요청 시 추가 가능 안내) | 아래 출처 |

→ **1순위안(7702) 채택 가능.** 단, `Simple7702Account`는 자기 자신 또는 EntryPoint 호출만 받는다(측정으로 확인). 그래서 "relayer가 위임 계정의 execute를 직접 호출"은 이 감사 계정으로는 불가하고, **7702 + ERC-4337 v0.8 EntryPoint + 우리 페이마스터 + 우리 relayer가 번들러 역할**로 간다. 외부 번들러가 없으므로 자체 번들링(공개 mempool 불필요: 우리 UserOp만 우리 relayer가 `handleOps`로 제출).


결론: 1순위안(7702) 가능. 단 `Simple7702Account`는 자기 자신·EntryPoint 호출만 받으므로 **7702 위임 + ERC-4337 v0.8 EntryPoint + 우리 VerifyingPaymaster + 우리 relayer가 번들러**. 2순위(4337 v0.7 단독)는 필요 없음.

## 2-1. 설계
1. 회원 계정 = 회원 EOA가 `Simple7702Account`(`0xe6Cae83B…555B`)에 위임. 첫 대납 거래(type-4 `handleOps`)에 authorization 포함.
2. 회원 키 = **HD 시드 1개를 KMS 대칭키로 봉인한 Secrets Manager 값**(`wallet-issuance.json`, 1차에서 작성). 웹은 xpub만, **signer Lambda만** 시드를 열고 그 회원 키를 메모리에서 파생해 UserOp 해시·7702 authorization에 서명. 1차 주소(`m/44'/60'/0'/0/i`)와 그대로 호환.
   - 대안: 회원별 KMS `ECC_SECG_P256K1` 키(키당 월 $1 → 1만 명 월 약 $10,000, 서명 1만 건 약 $0.15). 유출 범위 회원 1명. 실자산 생기면 재검토(사용자 결정).
3. 대납 = eth-infinitism v0.8 `VerifyingPaymaster`. 정책 서버가 UserOp마다 페이마스터 서명(회원·대상·선택자·`validUntil` 2분). relayer가 `handleOps` 제출.
4. 기존 Privy 회원 = Privy 키로 서명 불가 → kyaa 주소를 새로 발급해 앞으로의 거래·기록은 새 주소, Privy 주소는 과거 기록 표시.
5. 기록 경로: P2-a 컨트랙트 그대로, relayer(`WRITER_ROLE`)가 새 회원 주소로 기록 + 회원 주도 거래는 4337. P2-b(선택) ActionHub v3 `submitWithVoucher`(EIP-712 발급자 서명) — 기록 거래의 `msg.sender`를 회원으로.
6. 남용 방지: 회원별·전체 하루 가스/건수 한도, 허용 (컨트랙트, 선택자) 목록, active 회원만, 페이마스터 예치금 하루치만, 소비 속도 경보, 감사 로그 `sponsored_operations`.

## 2-2. 작업 목록과 파일
| 단계 | 작업 | 파일(예정) | 시험 | 승인 |
|---|---|---|---|---|
| S0 | 7702·EntryPoint 근거 | `apps/web/scripts/giwa-7702-probe.mjs` | 재실행 가능 | 완료 |
| S1 | 테스트넷 실거래 1건(위임 + `handleOps` 1건, 페이마스터 없이 시험 예치) | `contracts/script/Sponsor7702Smoke.s.sol` 또는 `scripts/aa/smoke.mjs` | 탐색기에서 tx·회원 주소 code=`0xef0100…` 확인 | faucet ETH 수령 = 감독 |
| S2 | 페이마스터 배포 | `contracts/lib`에 eth-infinitism v0.8 고정 버전, `contracts/script/DeployVerifyingPaymaster.s.sol`, 예치·인출 runbook | Foundry 포크 시험: 서명 유효·만료·다른 회원·허용 외 선택자 거부 | 배포 = 감독 |
| S3 | signer Lambda + 정책 서버 | `infrastructure/aws/platform/wallet-signer.json`(Lambda·IAM: 시드 시크릿 읽기는 signer 역할만, `wallet-issuance.json` OperatorRole 정책 갱신), `apps/worker/src/aa/signer.ts`, `apps/web/server/aa/sponsor-policy.ts` | 단위: 파생 키 주소 = xpub 주소, 한도 초과 거부, 정지 회원 거부, 허용 목록 | AWS 생성 = 감독 |
| S4 | DB | `supabase/migrations/<새>_member_accounts.sql`: `member_accounts`, `sponsored_operations`, 한도 RPC | SQL 시험(롤백): 하루 한도 경계, 동시성 | 운영 적용 = 감독 |
| S5 | 기존 회원 새 주소 발급 | 첫 로그인 때 `member_accounts` 행 생성(`kyaa_sign_in` 확장) | 기존·신규 회원 각각 1개 주소 | |
| S6 | 기록 수신 주소 전환(P2-a) | `provider='privy'`로 지갑을 고르는 SQL 함수 약 30개 → "활성 member_account 우선" 마이그레이션, `apps/worker` 기록 경로 | 함수별 회귀 SQL 시험, 하네스 | 별도 게이트 |
| S7 | 회원 주도 거래 1종 | 예: 도장 전송/수령 UserOp 경로(web → 정책 → signer → relayer) | e2e(테스트넷), 한도·감사 로그 | |
| S8(선택) | ActionHub v3 바우처 | `contracts/src/ByUsActionHub.sol` 업그레이드 | Foundry + 외부 감사 | 사용자 결정 |

## 2-3. 위험
| # | 위험 | 대응 |
|---|---|---|
| 2-1 | 시드 1개 유출 = 전 회원 키. 7702로도 EOA 키 회수 불가 | signer만 접근, 감사 로그, 테스트넷 동안 허용, 메인넷 전 재검토 |
| 2-2 | `VerifyingPaymaster`는 샘플, 감사 범위 [확인 필요] | 고정 커밋 사용, 대안 Candide/Pimlico 감사 페이마스터 |
| 2-3 | 자체 번들링 운영(nonce·재시도·가스 추정) | 우리 UserOp만 처리, relayer 단일 nonce 큐 |
| 2-4 | SQL 함수 약 30개 변경 | S6 별도 과제·게이트 |
| 2-5 | GIWA 메인넷 미출시, 가스·L1 요금 미정 | 하루 전체 한도로 상한 |
| 2-6 | 기존 Privy 주소 기록은 이전하지 않음 | 표시 연결, 재발행은 사용자 결정 |
| 2-7 | 7702 위임 후 다른 위임으로 덮어쓰기(키 보유자) | 키는 signer만 보유 |

## 2-4. 되돌리기
- 정책 서버 플래그로 대납 즉시 중지, 페이마스터 예치금 인출.
- 기록 수신 전환(S6)은 함수 단위 마이그레이션 → 이전 정의로 되돌리는 down 마이그레이션 동봉.
- 위임은 온체인 상태라 되돌리지 않는다(회원 주소는 그대로 기록 수신 가능).

## 2-5. 비용 추정 [추정]
- 테스트넷: UserOp 1건 ≈ 150–200k gas × 0.001 gwei ≈ 2×10⁻⁷ ETH, faucet이라 실비 0.
- 같은 단가 가정 메인넷: 1만 명 × 하루 5건 ≈ 0.01 ETH/일 + L1 데이터 요금(미정).
- 고정비: KMS 키 1개 월 $1, 시크릿 월 $0.40, Lambda 서명 무시 가능, 페이마스터 배포 가스 1회.

## 출처 (2차)
- GIWA RPC 측정: `apps/web/scripts/giwa-7702-probe.mjs`, `eth_getBlockByNumber`/`eth_getCode`/`eth_gasPrice` (2026-11-12, 신뢰도 높음)
- OP Stack Isthmus = Pectra(7702 포함): https://docs.optimism.io/op-stack/protocol/hardforks/isthmus , https://optimism.io/blog/optimism-brings-ethereum-s-pectra-upgrade-to-the-superchain , https://gov.optimism.io/t/upgrade-proposal-15-isthmus-hard-fork/9804 (공식, 높음)
- EntryPoint v0.8·Simple7702Account: https://erc4337.substack.com/p/entrypoint-v08-released , https://docs.candide.dev/wallet/abstractionkit/simple-7702-account-v08/ (감사 언급은 제3자 문서, 중간), https://goto.etherscan.com/address/0xe6cae83bde06e4c305530e199d7217f42808555b (검증 소스, 높음)
- Pimlico 지원 체인(GIWA 없음): https://docs.pimlico.io/bundler/reference/supported-chains , https://docs.pimlico.io/paymaster/verifying-paymaster/reference/supported-chains (공식, 높음)
- Alchemy 지원 체인(GIWA 없음): https://www.alchemy.com/docs/wallets/supported-chains , https://www.alchemy.com/support/what-are-the-supported-chain-for-account-kit (공식, 높음)
- KMS 요금: https://aws.amazon.com/kms/pricing/ (키당 월 $1, 비대칭 서명 1만 건 약 $0.15 — secp256k1 행은 [확인 필요])
- EIP-7702 개요: https://ethereum.org/roadmap/pectra/7702
