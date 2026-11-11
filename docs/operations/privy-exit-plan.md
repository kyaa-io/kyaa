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

## 전제 6 (확정, 사용자 결정 11/12 00:5x)
- 필수 조건: 발급 주소로 우리 서버가 안전하게 서명할 수 있어야 한다(사용자 00:1x "회원 주소에서 tx, 가스는 kyaa 대납").
- **확정 방식 = (B) HD 시드 1개 + 서명 전용 실행부.** 시드는 KMS 키 1개로 봉투 암호화하고, 복호화 권한은 서명 실행부(signer)에만 준다. 회원마다 **강화 파생** 키로 서명한다(2-1b).
- **(A) 회원별 KMS 비대칭 키는 기각(비용)**: 키당 월 $1이라 1만 명이면 월 약 $10,000(2-1a, 2-1d에 비교 기록만 남김).
- 인수 기준 3개(2-1c)는 그대로다: ① 발급 주소 = 서명 복원 주소 ② 다른 회원 서명 요청 거부 ③ chainId·nonce·호출 내용 변조 서명 거부. 통과 전 신규 주소를 최종 지갑으로 연결하지 않는다.
- 1차(로그인에서 Privy 제거, 목표 05:00)는 지갑 방식과 무관하게 계속 진행한다. 1차의 비강화 xpub 주소 발급(`address-issuer.ts`, `KYAA_WALLET_XPUB`, `kyaa_wallet_derivations`)은 **잠정**이다. 강화 파생에서는 xpub로 주소를 만들 수 없으므로 signer `issueAddress`로 교체한다(K4).
  - dev: 잠정 주소로 신규 가입 시험 가능(테스트넷, 기록 0). 서명 불가 주소로 표시하고 K4에서 교체.
  - 운영: 운영 전환 조건 = "2-1c 통과 + K4 발급기 교체". 그 전에는 신규 가입 주소를 확정하지 않는다(감독 판단: 신규 가입 보류, 또는 주소 없이 받고 나중에 발급).

# 1차: Privy 없이 로그인·세션 (구현 완료, 게이트·dev 확인 남음)

## 1-1. 설계 요약
- 회원 식별 키 `app_users.privy_user_id`는 유지. 기존 회원 `did:privy:…` 그대로, 새 회원 `kyaa:<uuid>`. 기존 API 74개 dependencies·`findUserByPrivyId`는 그대로.
- 로그인: Cognito Hosted UI(Google·Apple·카카오 선택) → `/api/auth/cognito/callback`에서 `kyaa_sign_in`.
  - `linked`: Google/Apple subject가 `live_privy_auth_accounts` 또는 `legacy_auth_inventory_accounts`의 한 회원과 정확히 일치.
  - `new`: subject·이메일 모두 없음 → 서버가 주소를 받아 `create_kyaa_member`. **주소 출처는 잠정(비강화 xpub). 최종은 (B) signer 강화 파생 — 전제 6.**
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
| 3 | 주소 파생(xpub, `m/44'/60'/0'/0/i`) | `apps/web/server/wallet/address-issuer.ts`(+test), env `KYAA_WALLET_XPUB` | **잠정**(전제 6). signer `issueAddress`(강화 파생)로 교체 예정(2-2 K1~K4) |
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
2. dev 적용 뒤 실제 브라우저(감독 승인 후, 집계는 1-3a 방법별 표로): 기존 회원 Google·Apple 재로그인(같은 MY·도장·지갑), 신규 Google 가입(주소 1개·`kyaa_wallet_derivations` 행·환영 도장), 같은 이메일 다른 계정 → `email_in_use` 문구, 정지 → "이용이 중지된 계정이에요.", 로그아웃, 탈퇴 → 재로그인 `inactive`, 관리자 Google 로그인, 네트워크 탭 `auth.privy.io` 0건, 390·1440 로그인 화면 캡처(배포 안내 이미지).
3. 비로그인·로그인 상태로 `useByUsAuth().login()`을 쓰는 화면 6곳(`fanpage-request-form`, `cheer-event-photocard`, `schedule-*`, `participation-requests`, `certification-detail-screen`, `app/s/raffle`, `admin/signup-event/exports`)이 `/login?returnTo=` 로 가는지.

## 1-3a. 로그인 방법별 인수 기준 (감독 00:56) — 방법마다 따로 센다
- 방법별로 통과·실패·미검증을 따로 기록한다. **소셜 신규 가입 성공을 이메일 이전 완료로 합산하지 않는다.** 확인하지 못한 방법은 "미검증"으로 보고한다.
- 공통 통과 조건: 실제 dev 로그인 화면에서 시작해 로그인 → 서버 세션 생성 → 보호 API(예: `GET /api/me/profile` 또는 MY 화면이 부르는 API)가 200 → 새로고침 후에도 로그인 유지 → 로그아웃 후 보호 API 401. 네트워크 탭에 `auth.privy.io` 0건.

| # | 방법 | 통과 조건(추가) | 현재 상태 | 막힌 이유·필요한 일 |
|---|---|---|---|---|
| L1 | **기존 이메일 회원**(Cognito 이메일 풀, 이전 Supabase 이메일 회원 포함) | 실제 웹 로그인 화면에서 이메일·비밀번호 입력 → 원래 회원 UUID 유지(`supabase:`/`did:privy` 키 그대로) → 보호 API 200. 틀린 비밀번호 거부, 이메일만으로 다른 계정 연결 안 됨 | **미검증 — 현재 불가** | 웹에 이메일 로그인 화면이 없다(위험 1-6). 이메일 풀은 앱 계약(`/api/auth/email/*`, 토큰을 본문으로 반환)만 있다. 필요: L1 작업(아래) |
| L2 | **Google 신규 가입** | 처음 쓰는 Google 계정 → `kyaa_sign_in` `new` → 회원 1명·주소 1개 생성 → 보호 API 200. 주소는 전제 6에 따라 잠정(서명 인수 2-1c 전 최종 연결 금지) | 미검증(코드·단위·SQL 시험만 통과) | dev 배포·`AUTH_PROVIDER=cognito`·마이그레이션 적용 필요 |
| L3 | **Apple** (기존 Apple 회원 연결 + 신규 가입 각각) | 기존: 원래 UUID·`did:privy`·지갑 유지. 신규: L2와 같음. Apple 이메일 가리기(릴레이 주소) 계정 포함 | 미검증 | Cognito Apple 팀 ID = `7RFN3TFR5K` 확인 필요(위험 1-2). 다르면 기존 회원 연결 불가 |
| L4 | **기존 Google 회원 연결** | Privy 시절 Google 회원 → 같은 Google 계정 로그인 → `linked` → 원래 UUID·`did:privy`·지갑·도장·MY 그대로 → 보호 API 200. subject가 기록되지 않은 회원은 백필 후 연결(백필 전에는 `email_in_use` 안내가 정상) | 미검증(합성 DB 드라이런만 통과) | dev 배포 + (최근 미로그인 회원이면) Privy 내보내기·백필 |

- 보조(별도 집계): 카카오(설정 시), 관리자 Google 로그인, 정지 회원 거부, 탈퇴 후 재로그인 거부.

### L1 작업(웹 이메일 로그인) — 1차에 추가
| 작업 | 파일(예정) | 시험 |
|---|---|---|
| 이메일 로그인 폼(로그인 화면에 "이메일로 계속하기") | `components/login-page.tsx`, 새 `components/email-login-form.tsx`, 문구 11개 언어 | 화면 시험: 입력 검증, 오류 문구, 중복 제출 방지 |
| 웹용 이메일 세션: 기존 `/api/auth/email/login`(Cognito 이메일 풀 + 이전 Lambda)을 호출하되 토큰을 브라우저에 주지 않고 서버 쿠키 세션으로 | 새 `app/api/auth/email/web-login/route.ts`, `server/auth/cognito/email-session.ts` 재사용, `browser-session.ts`에 `kind: email` 세션 | 틀린 비밀번호 401, 정지·탈퇴 거부, 쿠키 HttpOnly·`__Host-`, 토큰 비노출 |
| 웹 세션 응답에 이메일 회원 반영 | `server/auth/cognito/browser-routes.ts`(`session`이 이메일 세션도 `userId`·`kyaa-email:` 토큰 반환) | 이메일 회원 `useByUsAuth` 로그인, 보호 API 200 |
| 로그아웃 | 기존 `/api/auth/email/logout` 연동 | 로그아웃 후 401 |
- 이 작업은 계획만 있고 구현되지 않았다. 구현 전에는 L1을 "미검증 — 현재 불가"로 보고한다.

## 1-4. 위험
| # | 위험 | 대응 |
|---|---|---|
| 1-1 | 최근 로그인하지 않은 기존 회원은 subject가 없어 `email_in_use`로 막힘 | 운영 전환 전 Privy 내보내기·백필(runbook) 필수 |
| 1-2 | Apple subject는 팀 단위. Cognito Apple 팀 ID가 `7RFN3TFR5K`와 다르면 기존 Apple 회원 연결 불가 | 감독이 `describe-identity-provider`로 팀 ID 확인(작업자 가드로 미확인) |
| 1-3 | 전환 직후 모든 회원 1회 재로그인 | 배포 안내 문구에 포함 |
| 1-4 | 로그인 화면 캡처 없음 | dev 확인 때 추가 |
| 1-5 | 앱(Flutter)의 Privy 토큰 경로는 요청마다 Privy 조회 → Privy 장애 영향 남음. 앱용 Cognito 응답에서 `walletToken` 제거 | 앱 이전 과제. `t3/privy-offpath-2355`의 Privy JWKS 로컬 검증 재사용 검토 |
| 1-6 | 웹 이메일 로그인 화면 없음(이메일 풀은 앱 계약만) → 인수 L1 불가 | 1-3a의 L1 작업을 1차에 추가. 소셜 성공을 이메일 이전 완료로 합산 금지 |
| 1-7 | 첫 로그인 Google 프로필 사진 가져오기 꺼짐 | Cognito ID 토큰 `picture` 서버 처리로 별도 과제 |
| 1-8 | 개인정보처리방침에 Privy 위탁 문구 남음 | 사용자 결정(법률) |
| 1-9 | 카카오 `email_verified` 제공 여부 미확인 | dev에서 실제 앱으로 확인 |
| 1-10 | 잠정 xpub 주소는 서명 불가 → 그 주소로 받은 기록은 회원 주도 거래로 다룰 수 없음 | 운영 신규 가입 주소는 2-1c 통과 전 확정 금지(전제 6). dev 잠정 주소는 교체 대상 목록으로 관리 |

## 1-5. 되돌리기
- 앱: 이전 빌드(`16e26e19c` 계열)와 `AUTH_PROVIDER=privy`로 재배포. 웹에서 Privy SDK를 지웠으므로 설정만으로는 못 되돌린다.
- DB: 마이그레이션은 추가형(새 함수·표·시퀀스, 제약 확장 2개, 기존 함수 정규식 확장). 되돌리지 않고 둔다. 이전 빌드는 새 함수를 부르지 않는다.
- 전환 중 생긴 `kyaa:` 회원은 Privy 로그인으로 들어올 수 없다 → 되돌리기 전 `select count(*) from app_users where privy_user_id like 'kyaa:%'` 확인, 공지.
- 세션: 이전 빌드는 `__Host-kyaa-cognito` 세션을 정리 경로로만 다룬다(기존 retired 처리).

---

# 2차: 서명 가능한 회원 주소 + 회원 주소 거래 + 가스 대납 (계획만)

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
2. 회원 키 = **(B) HD 시드 1개(KMS 봉투 암호화) + 서명 전용 실행부 + 회원별 강화 파생 — 확정(사용자 00:5x)**. 서명 구조 2-0, 기각안 (A) 2-1a, 확정안 (B) 2-1b, 인수 기준 2-1c, 비교 기록 2-1d.
3. 대납 = eth-infinitism v0.8 `VerifyingPaymaster`. 정책 서버가 UserOp마다 페이마스터 서명(회원·대상·선택자·`validUntil` 2분). relayer가 `handleOps` 제출.
4. 기존 Privy 회원 = Privy 키로 서명 불가 → kyaa 주소를 새로 발급해 앞으로의 거래·기록은 새 주소, Privy 주소는 과거 기록 표시.
5. 기록 경로: P2-a 컨트랙트 그대로, relayer(`WRITER_ROLE`)가 새 회원 주소로 기록 + 회원 주도 거래는 4337. P2-b(선택) ActionHub v3 `submitWithVoucher`(EIP-712 발급자 서명) — 기록 거래의 `msg.sender`를 회원으로.
6. 남용 방지: 회원별·전체 하루 가스/건수 한도, 허용 (컨트랙트, 선택자) 목록, active 회원만, 페이마스터 예치금 하루치만, 소비 속도 경보, 감사 로그 `sponsored_operations`.

## 2-0. 서명 구조
- 서명 실행부는 분리된 signer(Lambda 1개)뿐이다. 웹·worker는 키·시드·키 ID를 모르고 **서명 의도**만 보낸다: `{appUserId, kind: userop|authorization, chainId, nonce, target, selector, calldataHash, value, paymasterAndDataHash, validUntil}` + 정책 서버 HMAC(내부 IAM 호출만 허용).
- signer가 DB에서 `appUserId → 키 참조·주소`를 읽고 의도로부터 **직접** 다이제스트를 계산한다(UserOp v0.8 `getUserOpHash`, 7702 `keccak(0x05 ‖ rlp([chainId, delegate, nonce]))`). 호출자가 준 해시는 서명하지 않는다.
- 서명은 low-s로 정규화하고, v는 복원 주소 = DB 주소가 되는 값으로 정한다. 둘 다 아니면 실패.
- signer는 사용한 (회원, nonce)를 기록하고, `validUntil` 지난 의도·정지·탈퇴 회원을 거부하며, 서명 감사 로그(`signer_audit`)를 남긴다.

## 2-1a. (A) 회원별 KMS 비대칭 키 — 기각(비용, 사용자 결정 00:5x)
- 내용: 회원마다 `ECC_SECG_P256K1` KMS 키를 만들어 `kms:Sign`으로 서명하는 방식. 개인키가 HSM 밖으로 나오지 않고, IAM 세션 태그로 회원 단위 거부를 AWS가 보장한다.
- 기각 사유: 키당 월 $1 → 1천 명 월 약 $1,000, 1만 명 월 약 $10,000, 5만 명 월 약 $50,000(다중 리전이면 2배). 회원 수에 비례하는 새 AWS 비용.
- 재검토 조건: 메인넷·실자산이 생겨 (B)의 단일 실패점(시드)이 감당할 수 없는 위험이 될 때. 그때도 사용자 승인 필요.

## 2-1b. (B) HD 시드 + 서명 전용 실행부 — 확정
- **시드 보관**: 32바이트 시드를 KMS 대칭키로 **봉투 암호화**(`GenerateDataKey` 데이터키로 AES-GCM, 암호문만 Secrets Manager/S3). KMS 키 정책상 `kms:Decrypt`는 **signer 역할만**, 암호화 컨텍스트 `purpose=member-wallet-seed, environment` 필수. 운영자·웹·worker는 복호화 권한이 없다. 시드 생성은 1회성 운영 절차(생성 직후 메모리 폐기).
- **서명 실행부**: signer가 콜드 스타트 때 데이터키를 복호화해 시드를 메모리에만 두고, 요청마다 회원 키를 파생해 서명한 뒤 키 버퍼를 지운다. Lambda 동시 실행 상한, VPC 엔드포인트만, 로그에 키 비출력.
- **파생 방식(강화 파생 검토)**:
  - 비강화 `m/44'/60'/0'/0/i`(1차 잠정, 폐기 예정): 웹이 xpub로 주소를 만들 수 있다. 하지만 **xpub + 자식 개인키 1개가 새면 시드 전체가 복원된다.**
  - **강화 `m/44'/60'/0'/i'`(확정)**: 자식 키 유출이 다른 회원으로 번지지 않는다. 대신 xpub로 주소를 만들 수 없어 **주소 발급도 signer가 한다**(웹은 `issueAddress(appUserId)` 호출만). 인덱스는 DB 시퀀스, `member_keys(scheme='hd', key_ref=index)`.
- **접근 권한**: 회원 단위 거부는 signer 코드(DB 매핑·의도 HMAC)가 보장한다. AWS가 회원 단위로 막아 주지 않는다(A와의 차이).
- **키 복구**: 시드 암호문 + KMS 키가 있으면 어느 회원 키든 재파생할 수 있다. 오프라인 봉인 사본 1부 권장(복구 절차·2인 확인). 회원 요청 시 개별 키 전달 가능(강화 파생이면 그 키로 다른 회원이 노출되지 않는다).
- **비용**: KMS 대칭키 월 $1 + 시크릿 월 $0.40 + 복호화 요청 소량(콜드 스타트당 1회). 회원 수와 무관.

## 2-1c. 인수 기준 (서명 가능성 시험, 변경 없음) — 통과 전 신규 주소 최종 연결 금지
체인 거래 없이 `recoverAddress`(viem)와 GIWA EntryPoint v0.8 `getUserOpHash`·검증 시뮬레이션 `eth_call`로 확인한다. 1단계는 로컬(실제 HD 강화 파생 + 로컬 봉투 암호화 대역), 2단계는 감독이 dev KMS 키·시드 암호문을 만든 뒤 실제 KMS 복호화로.
1. **발급 주소 = 서명 복원 주소**: 새 회원 키로 임의 다이제스트 20개와 7702 authorization 1개를 서명 → 매번 복원 주소 = 발급 때 저장한 주소. low-s·v 결정 실패 0건.
2. **다른 회원의 서명 요청 거부**: 회원 A 세션에서 회원 B를 가리키는 의도 → (a) 정책 서버 거부 (b) signer DB 매핑 불일치 거부 (c) signer 외 역할(웹·worker·운영자 역할)이 시드 암호문 복호화 시도 → KMS `AccessDenied`(암호화 컨텍스트 불일치도 거부).
3. **변조 서명 거부**: A의 서명을 chainId(91342→다른 값), nonce(+1), callData·target·selector·value·paymasterAndData 1바이트 변경 UserOp/authorization에 붙이면 복원 주소 ≠ A이고 EntryPoint 시뮬레이션은 `AA24 signature error`. signer는 의도에 없는 필드·호출자 제공 해시를 서명하지 않는다.
4. 공통 추가: 같은 nonce 재사용 거부, `validUntil` 만료 거부, 정지·탈퇴 회원 거부, 감사 로그 1건씩 기록.
- 통과 산출물: 시험 로그, 복원 주소 표, 실패 케이스별 오류 코드.

## 2-1d. 비교 기록 (결정: B 채택, A 기각 — 사용자 00:5x)
| 항목 | (A) 회원별 KMS 비대칭 키 | (B) HD 시드 + 서명 전용 실행부(강화 파생) |
|---|---|---|
| 필수 조건(서버가 안전하게 서명) | 충족: KMS가 서명, 키는 밖으로 안 나옴 | 충족: signer만 시드 복호화, 메모리에서 서명 |
| 월 비용(1천 / 1만 / 5만 명) [추정] | 약 $1,000 / $10,000 / $50,000(다중 리전 시 2배). 지연 생성하면 "거래한 회원 수" 비례 | 약 $2 / $2 / $2(+ Lambda, 무시 가능) |
| 장애 범위: 서명부 침해 | signer 역할 탈취 = 서명 API 남용(키는 못 가져감). 세션 태그로 회원 단위 제한, CloudTrail로 추적·역할 즉시 차단 | signer 메모리·데이터키 탈취 = **전 회원 키 영구 유출**(EOA 키는 회수 불가, 7702로도 못 막음) |
| 장애 범위: 키 1개 유출 | 해당 없음(키 비노출) | 강화 파생이면 그 회원 1명. 비강화면 xpub와 합쳐 전 회원 |
| 장애 범위: AWS 장애 | KMS 리전 장애 시 서명 중단(다중 리전 복제로 완화) | 복호화는 콜드 스타트 때만 → 실행 중 signer는 계속 서명 |
| 키 복구 | 내보내기 불가. 키를 잃으면 그 주소 영구 서명 불가 → 새 주소. 삭제 금지·복제로 예방 | 시드 암호문 + KMS 키(또는 오프라인 사본)로 전 회원 재파생. 회원에게 개별 키 전달 가능 |
| 접근 통제 단위 | AWS가 회원 단위로 강제(IAM 조건) | signer 코드가 회원 단위로 강제 |
| 감사 | CloudTrail에 키별 Sign 기록 | signer 자체 감사 로그 |
| 구현량 | CreateKey·GetPublicKey·DER 처리·세션 태그 | 봉투 암호화·파생·메모리 위생·복구 절차 |
| 인수 기준 2-1c | 1·2(a,b,c)·3·4 | 1·2(a,b,복호화 거부)·3·4 |
| 확인 필요 | secp256k1 Sign 요금 행, 키 수 한도, Sign 초당 한도 | Lambda 메모리 덤프·로그 노출 차단 점검 |

결정: **(B) 채택.** (A)는 비용으로 기각. 메인넷·실자산 전에 R-B1(시드 단일 실패점)을 다시 점검한다.

## 2-2. 작업 목록과 파일
| 단계 | 작업 | 파일(예정) | 시험 | 승인 |
|---|---|---|---|---|
| S0 | 7702·EntryPoint 근거 | `apps/web/scripts/giwa-7702-probe.mjs` | 재실행 가능 | 완료 |
| S1 | 테스트넷 실거래 1건(위임 + `handleOps` 1건, 페이마스터 없이 시험 예치) | `contracts/script/Sponsor7702Smoke.s.sol` 또는 `scripts/aa/smoke.mjs` | 탐색기에서 tx·회원 주소 code=`0xef0100…` 확인 | faucet ETH 수령 = 감독 |
| S2 | 페이마스터 배포 | `contracts/lib`에 eth-infinitism v0.8 고정 버전, `contracts/script/DeployVerifyingPaymaster.s.sol`, 예치·인출 runbook | Foundry 포크 시험: 서명 유효·만료·다른 회원·허용 외 선택자 거부 | 배포 = 감독 |
| K0 | 방식 결정 | (B) 확정, (A) 기각(비용) | — | 완료(사용자 00:5x) |
| K1 | signer 코드 | `apps/worker/src/aa/signer.ts`(의도→다이제스트 직접 계산, low-s·v, nonce·만료·회원 상태, 감사 로그), `apps/worker/src/aa/hd-member-key.ts`(강화 `m/44'/60'/0'/i'` 파생, `issueAddress`, 키 버퍼 소거), `apps/worker/src/aa/seed-envelope.ts`(KMS `Decrypt` 포트 + 암호화 컨텍스트), 마이그레이션 `member_keys(scheme='hd', key_ref=index)`·`signer_nonces`·`signer_audit` | 2-1c 1·2(a,b)·3·4 로컬 전부 | 코드만 |
| K2 | 인프라 코드 | `infrastructure/aws/platform/wallet-issuance.json` 개정: Secrets Manager 직접 보관 → KMS `GenerateDataKey` 봉투 암호문, 키 정책 `kms:Decrypt`는 signer 역할만 + 암호화 컨텍스트 `purpose=member-wallet-seed, environment`, 운영자 역할은 `Encrypt`·`GenerateDataKey`만(시드 생성 1회), 키 삭제·비활성 거부. signer Lambda(`wallet-signer.json`: VPC 엔드포인트, 동시 실행 상한, 로그 제한). `scripts/privy-exit/wallet-master-generate.mjs` 개정(봉투 암호화, xpub 출력 제거) | cfn 렌더 시험, 생성 스크립트 단위 시험 | AWS 생성 = 감독 |
| K3 | dev 실자원 인수 | 감독이 dev KMS 키·시드 암호문 생성 후 2-1c 전체(2(c) 복호화 거부 포함)를 실제 KMS로 | 시험 로그 첨부 | 감독 |
| K4 | 1차 발급기 교체 | `create_kyaa_member` 주소 출처를 signer `issueAddress`로, `address-issuer.ts`·`KYAA_WALLET_XPUB` 제거, dev 잠정 주소 교체 | 신규 가입 시 `member_keys` 1행·서명 복원 주소 일치 | K3 통과 후 |
| S3 | 정책 서버 | `apps/web/server/aa/sponsor-policy.ts`(의도 생성·한도·허용 목록·HMAC) | 한도 초과·정지 회원·허용 외 선택자 거부 | |
| S4 | DB | `supabase/migrations/<새>_member_accounts.sql`: `member_accounts`, `sponsored_operations`, 한도 RPC | SQL 시험(롤백): 하루 한도 경계, 동시성 | 운영 적용 = 감독 |
| S5 | 기존 회원 새 주소 발급 | 첫 로그인 때 `member_accounts` 행 생성(`kyaa_sign_in` 확장) | 기존·신규 회원 각각 1개 주소 | |
| S6 | 기록 수신 주소 전환(P2-a) | `provider='privy'`로 지갑을 고르는 SQL 함수 약 30개 → "활성 member_account 우선" 마이그레이션, `apps/worker` 기록 경로 | 함수별 회귀 SQL 시험, 하네스 | 별도 게이트 |
| S7 | 회원 주도 거래 1종 | 예: 도장 전송/수령 UserOp 경로(web → 정책 → signer → relayer) | e2e(테스트넷), 한도·감사 로그 | |
| S8(선택) | ActionHub v3 바우처 | `contracts/src/ByUsActionHub.sol` 업그레이드 | Foundry + 외부 감사 | 사용자 결정 |

## 2-3. 위험
| # | 위험 | 대응 |
|---|---|---|
| R-B1 | signer 침해(메모리·데이터키) = 전 회원 키 영구 유출 | 복호화 권한 signer만, 강화 파생(자식 키 유출은 1명), 메모리 위생, CloudTrail `Decrypt` 경보, 실자산 전 재검토 |
| R-B2 | KMS 키 삭제·시드 암호문 분실 = 전 회원 서명 불가 | 키 삭제·비활성 거부, 오프라인 봉인 사본 1부(2인 확인), 암호문 버전 보관 |
| R-0 | 잠정 xpub 주소로 운영 신규 가입 | 운영 전환 조건에 "2-1c 통과 + K4" 포함(전제 6) |
| 2-2 | `VerifyingPaymaster`는 샘플, 감사 범위 [확인 필요] | 고정 커밋 사용, 대안 Candide/Pimlico 감사 페이마스터 |
| 2-3 | 자체 번들링 운영(nonce·재시도·가스 추정) | 우리 UserOp만 처리, relayer 단일 nonce 큐 |
| 2-4 | SQL 함수 약 30개 변경 | S6 별도 과제·게이트 |
| 2-5 | GIWA 메인넷 미출시, 가스·L1 요금 미정 | 하루 전체 한도로 상한 |
| 2-6 | 기존 Privy 주소 기록은 이전하지 않음 | 표시 연결, 재발행은 사용자 결정 |
| 2-7 | 7702 위임 후 다른 위임으로 덮어쓰기(키 보유자) | 키는 signer만 보유 |

## 2-4. 되돌리기
- K4 전: 1차 잠정 xpub 주소 그대로(운영 신규 가입 주소 확정 안 함). K4 후 문제 시: `create_kyaa_member` 주소 출처를 이전 구현으로 되돌리는 배포. 이미 발급한 인덱스·주소는 지우지 않고 보관(주소 기록 보존, 시드로 재파생 가능).
- 정책 서버 플래그로 대납 즉시 중지, 페이마스터 예치금 인출.
- 기록 수신 전환(S6)은 함수 단위 마이그레이션 → 이전 정의로 되돌리는 down 마이그레이션 동봉.
- 위임은 온체인 상태라 되돌리지 않는다(회원 주소는 그대로 기록 수신 가능).

## 2-5. 비용 추정 [추정]
- 테스트넷: UserOp 1건 ≈ 150–200k gas × 0.001 gwei ≈ 2×10⁻⁷ ETH, faucet이라 실비 0.
- 같은 단가 가정 메인넷: 1만 명 × 하루 5건 ≈ 0.01 ETH/일 + L1 데이터 요금(미정).
- 확정 (B): KMS 대칭키 1개 월 $1 + 시드 암호문 보관(시크릿 월 $0.40 또는 S3 소액) + 복호화 요청 소량. 회원 수와 무관.
- 기각 (A) 참고: 1만 명 월 약 $10,000.
- 공통: Lambda 서명 비용 무시 가능, 페이마스터 배포 가스 1회.

## 출처 (2차)
- GIWA RPC 측정: `apps/web/scripts/giwa-7702-probe.mjs`, `eth_getBlockByNumber`/`eth_getCode`/`eth_gasPrice` (2026-11-12, 신뢰도 높음)
- OP Stack Isthmus = Pectra(7702 포함): https://docs.optimism.io/op-stack/protocol/hardforks/isthmus , https://optimism.io/blog/optimism-brings-ethereum-s-pectra-upgrade-to-the-superchain , https://gov.optimism.io/t/upgrade-proposal-15-isthmus-hard-fork/9804 (공식, 높음)
- EntryPoint v0.8·Simple7702Account: https://erc4337.substack.com/p/entrypoint-v08-released , https://docs.candide.dev/wallet/abstractionkit/simple-7702-account-v08/ (감사 언급은 제3자 문서, 중간), https://goto.etherscan.com/address/0xe6cae83bde06e4c305530e199d7217f42808555b (검증 소스, 높음)
- Pimlico 지원 체인(GIWA 없음): https://docs.pimlico.io/bundler/reference/supported-chains , https://docs.pimlico.io/paymaster/verifying-paymaster/reference/supported-chains (공식, 높음)
- Alchemy 지원 체인(GIWA 없음): https://www.alchemy.com/docs/wallets/supported-chains , https://www.alchemy.com/support/what-are-the-supported-chain-for-account-kit (공식, 높음)
- KMS 요금: https://aws.amazon.com/kms/pricing/ (키당 월 $1, 비대칭 서명 1만 건 약 $0.15 — secp256k1 행은 [확인 필요])
- EIP-7702 개요: https://ethereum.org/roadmap/pectra/7702
