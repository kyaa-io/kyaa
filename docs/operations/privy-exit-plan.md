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

## 전제 6 (수정, 감독 정정 00:28)
- 이전 전제: "새 회원 주소 = xpub에서 수신 주소만 파생, 웹은 비밀값 0개". **최종안이 아니다.** 사용자 00:1x 결정이 "회원 주소에서 tx가 일어나고 가스는 kyaa가 대납"이므로 주소는 **우리가 서명할 수 있어야** 한다.
- **기준안 = 회원별 AWS KMS 비대칭 키(`ECC_SECG_P256K1`, `SIGN_VERIFY`)로 만든 EOA.** 주소 = KMS `GetPublicKey`의 공개키 → keccak 하위 20바이트.
- HD 방식은 비교안으로만 둔다(2-1b 표). 채택하려면 서명 실행부·접근 권한·키 복구 경로가 기준안 이상임을 보여야 한다.
- 1차의 xpub 주소 발급(`address-issuer.ts`, `KYAA_WALLET_XPUB`, `kyaa_wallet_derivations`)은 **잠정**이다. 로그인에서 Privy를 빼는 작업은 계속하지만, 신규 주소를 최종 지갑으로 연결하는 것은 **2-1c 인수 기준(서명 가능성 시험) 통과 전 확정하지 않는다.**
  - dev: 잠정 주소로 신규 가입 시험 가능(테스트넷, 기록 0). 이 주소는 서명 불가 주소로 표시하고 인수 통과 후 KMS 주소로 교체.
  - 운영: 인수 통과 전에는 신규 가입 주소를 확정하지 않는다. 운영 전환 조건에 "2-1c 통과 + KMS 발급기 교체"를 넣는다(감독 판단: 그 전까지 운영 신규 가입을 막거나, 주소 없이 받고 나중에 발급).

---

# 1차: Privy 없이 로그인·세션 (구현 완료, 게이트·dev 확인 남음)

## 1-1. 설계 요약
- 회원 식별 키 `app_users.privy_user_id`는 유지. 기존 회원 `did:privy:…` 그대로, 새 회원 `kyaa:<uuid>`. 기존 API 74개 dependencies·`findUserByPrivyId`는 그대로.
- 로그인: Cognito Hosted UI(Google·Apple·카카오 선택) → `/api/auth/cognito/callback`에서 `kyaa_sign_in`.
  - `linked`: Google/Apple subject가 `live_privy_auth_accounts` 또는 `legacy_auth_inventory_accounts`의 한 회원과 정확히 일치.
  - `new`: subject·이메일 모두 없음 → 서버가 주소를 받아 `create_kyaa_member`. **주소 출처는 잠정(xpub), 최종은 회원별 KMS 키 — 전제 6.**
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
| 3 | 주소 파생(xpub, `m/44'/60'/0'/0/i`) | `apps/web/server/wallet/address-issuer.ts`(+test), env `KYAA_WALLET_XPUB` | **잠정**(전제 6). KMS 발급기로 교체 예정(2-2 K1·K2) |
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
| 1-10 | 잠정 xpub 주소는 서명 불가 → 그 주소로 받은 기록은 회원 주도 거래로 다룰 수 없음 | 운영 신규 가입 주소는 2-1c 통과 전 확정 금지(전제 6). dev 잠정 주소는 교체 대상 목록으로 관리 |

## 1-5. 되돌리기
- 앱: 이전 빌드(`16e26e19c` 계열)와 `AUTH_PROVIDER=privy`로 재배포. 웹에서 Privy SDK를 지웠으므로 설정만으로는 못 되돌린다.
- DB: 마이그레이션은 추가형(새 함수·표·시퀀스, 제약 확장 2개, 기존 함수 정규식 확장). 되돌리지 않고 둔다. 이전 빌드는 새 함수를 부르지 않는다.
- 전환 중 생긴 `kyaa:` 회원은 Privy 로그인으로 들어올 수 없다 → 되돌리기 전 `select count(*) from app_users where privy_user_id like 'kyaa:%'` 확인, 공지.
- 세션: 이전 빌드는 `__Host-kyaa-cognito` 세션을 정리 경로로만 다룬다(기존 retired 처리).

---

# 2차: 회원별 KMS 키 주소 + 회원 주소 거래 + 가스 대납 (계획만)

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
2. 회원 키 = **회원별 KMS 비대칭 키(기준안)**. 발급·서명은 2-1a, HD 비교는 2-1b, 인수 기준은 2-1c.
3. 대납 = eth-infinitism v0.8 `VerifyingPaymaster`. 정책 서버가 UserOp마다 페이마스터 서명(회원·대상·선택자·`validUntil` 2분). relayer가 `handleOps` 제출.
4. 기존 Privy 회원 = Privy 키로 서명 불가 → kyaa 주소를 새로 발급해 앞으로의 거래·기록은 새 주소, Privy 주소는 과거 기록 표시.
5. 기록 경로: P2-a 컨트랙트 그대로, relayer(`WRITER_ROLE`)가 새 회원 주소로 기록 + 회원 주도 거래는 4337. P2-b(선택) ActionHub v3 `submitWithVoucher`(EIP-712 발급자 서명) — 기록 거래의 `msg.sender`를 회원으로.
6. 남용 방지: 회원별·전체 하루 가스/건수 한도, 허용 (컨트랙트, 선택자) 목록, active 회원만, 페이마스터 예치금 하루치만, 소비 속도 경보, 감사 로그 `sponsored_operations`.

## 2-1a. 기준안: 회원별 KMS 키 EOA
- **발급**: signer 서비스가 `CreateKey(KeySpec=ECC_SECG_P256K1, KeyUsage=SIGN_VERIFY, Tags={app_user_id, environment})` → `GetPublicKey`(DER SPKI) → 비압축 공개키 → keccak256 하위 20바이트 = 주소. DB `member_keys(app_user_id unique, chain_id, kms_key_arn unique, address unique, created_at, status)` 저장. 별칭은 쓰지 않는다(별칭 수 한도 회피, ARN으로 참조).
- **서명 실행부**: 분리된 signer Lambda 1개(웹·worker는 키 ID를 모르고 "의도(intent)"만 보낸다).
  1. 입력 = 서버가 만든 서명 의도 `{appUserId, kind: userop|authorization, chainId, nonce, target, selector, calldataHash, validUntil}` + 정책 서버 HMAC(또는 내부 IAM 호출만 허용).
  2. signer가 DB에서 `appUserId → kms_key_arn, address`를 읽고, 의도로부터 **직접** 다이제스트를 계산(UserOp v0.8 `getUserOpHash` / 7702 `keccak(0x05 ‖ rlp([chainId, address, nonce]))`). 호출자가 준 해시는 서명하지 않는다.
  3. `kms:Sign(KeyId, MessageType=DIGEST, SigningAlgorithm=ECDSA_SHA_256, Message=digest)` → DER(r,s) → low-s 정규화 → v(27/28) 복원 시도로 **복원 주소 = DB 주소**인 v 선택. 둘 다 아니면 실패.
- **접근 권한(이중)**:
  - IAM: signer 역할만 `kms:Sign`·`kms:GetPublicKey`, 조건 `aws:ResourceTag/environment` 일치. `kms:CreateKey`는 발급 역할만, `kms:ScheduleKeyDeletion`·`kms:DisableKey`는 명시 거부(break-glass 역할만).
  - 회원 단위: signer가 요청마다 `sts:AssumeRole`에 세션 태그 `app_user_id`를 붙여 서명 → 키 정책 조건 `aws:ResourceTag/app_user_id == aws:PrincipalTag/app_user_id`. 코드 버그로 다른 회원 키 ID를 넣어도 KMS가 거부(2-1c-②).
- **키 복구 경로**: KMS 키는 내보낼 수 없다. 대신 ① 삭제 금지(정책 거부 + 삭제 예약 7–30일 대기·취소 가능) ② 다중 리전 키(`MultiRegion=true`, 비대칭 지원) 복제본 1개를 다른 리전에 두어 리전 장애·실수 대비(복제본 키당 월 $1 추가) ③ 키를 잃으면 그 회원 주소로는 다시 서명 불가 → 새 키·새 주소 발급, 과거 주소는 기록 표시용 보관(Privy 주소와 같은 처리).
- **비용**: 키당 월 $1(복제 시 $2), 서명 1만 건 약 $0.15 [secp256k1 행 확인 필요]. 회원 1천 명 월 $1,000, 1만 명 월 $10,000. 줄이는 방법: 키를 첫 서명이 필요할 때 만든다(기록 수신만 하는 회원은 키 없음 → 그동안 수신 주소가 필요하면 주소도 그때 발급). 계정·리전당 KMS 키 수 한도 [확인 필요, 증설 요청 가능].
- **속도 한도**: 비대칭 Sign 요청의 계정 공유 초당 한도 [확인 필요] → signer에서 큐·재시도.

## 2-1b. 비교안: HD 시드
| 항목 | 회원별 KMS 키(기준) | HD 시드(비교) |
|---|---|---|
| 키 생성 | `CreateKey` 회원당 1회 | 시드 1개, 회원은 인덱스 |
| 서명 실행부 | KMS 내부(HSM), 개인키가 메모리에 나오지 않음 | signer Lambda가 시드를 복호화해 메모리에서 회원 키 파생·서명 |
| 접근 권한 | IAM + 키 정책 + 회원 태그 조건 → 회원 단위 거부를 AWS가 보장 | 시크릿 읽기 권한 1개 = 전 회원 키. 회원 단위 거부는 signer 코드만이 보장 |
| 유출 범위 | 회원 1명(그것도 서명 API 호출권만, 키는 못 가져감) | 시드 유출 = 전 회원 영구 유출(EOA 키 회수 불가, 7702로도 못 막음) |
| 키 복구 | 내보내기 불가. 삭제 금지·다중 리전 복제·분실 시 새 주소 | 시드 백업(오프라인 봉인 사본 + 시크릿) → 언제든 재파생. 회원에게 키 전달 가능 |
| 감사 | CloudTrail에 키별 Sign 기록 | Lambda 자체 로그만 |
| 비용(1만 명) | 월 약 $10,000 | 월 약 $2 |
| 판단 | 사용자 결정 "우리가 서명·대납"에 맞고 보안 경계가 AWS에 있음 → **기준** | 비용은 압도적이나 단일 실패점. 테스트넷 한정·비용 압박 시에만 재검토 |

## 2-1c. 주소 발급 인수 기준 (서명 가능성 시험) — 통과 전 신규 주소 최종 연결 금지
테스트넷·로컬에서 시험 계정으로, 체인 거래 없이 `ecrecover`/viem `recoverAddress`와 EntryPoint v0.8 `getUserOpHash`(GIWA `eth_call`)로 검증한다. AWS 실키 시험은 감독이 dev 키를 만든 뒤.
1. **발급 주소 = 서명자 주소**: 새 키로 임의 다이제스트 20개에 KMS 서명 → 매번 복원 주소 = `GetPublicKey`로 계산한 주소 = DB 저장 주소. 7702 authorization 서명도 복원 주소 일치. low-s, v 결정 실패 0건.
2. **다른 회원의 서명 요청 거부**: 회원 A 세션의 의도에 회원 B의 `appUserId`/키를 넣으면 (a) 정책 서버 거부 (b) signer가 DB 매핑 불일치로 거부 (c) 코드를 우회해 B 키 ARN으로 직접 `kms:Sign`해도 세션 태그 조건으로 KMS `AccessDenied`. 세 층 각각 시험.
3. **바뀐 내용의 서명 거부**: A에게 받은 서명을 (a) chainId 91342→다른 값 (b) nonce +1 (c) callData·target·selector·value·paymasterAndData 한 바이트 변경으로 바꾼 UserOp/authorization에 붙이면 복원 주소 ≠ A 주소, EntryPoint `eth_call` 시뮬레이션은 `AA24 signature error`. 또 signer는 의도에 없는 필드가 들어간 요청을 서명하지 않는다(호출자 제공 해시 서명 금지).
4. 추가: 같은 nonce 재사용 요청 거부(signer가 사용 nonce 기록), `validUntil` 지난 의도 거부, 정지·탈퇴 회원 거부.
- 통과 산출물: 시험 로그, 복원 주소 표, 실패 케이스별 오류 코드. 이 묶음이 통과해야 `create_kyaa_member`의 주소 출처를 KMS로 바꾸고 운영 신규 가입 주소를 확정한다.

## 2-2. 작업 목록과 파일
| 단계 | 작업 | 파일(예정) | 시험 | 승인 |
|---|---|---|---|---|
| S0 | 7702·EntryPoint 근거 | `apps/web/scripts/giwa-7702-probe.mjs` | 재실행 가능 | 완료 |
| S1 | 테스트넷 실거래 1건(위임 + `handleOps` 1건, 페이마스터 없이 시험 예치) | `contracts/script/Sponsor7702Smoke.s.sol` 또는 `scripts/aa/smoke.mjs` | 탐색기에서 tx·회원 주소 code=`0xef0100…` 확인 | faucet ETH 수령 = 감독 |
| S2 | 페이마스터 배포 | `contracts/lib`에 eth-infinitism v0.8 고정 버전, `contracts/script/DeployVerifyingPaymaster.s.sol`, 예치·인출 runbook | Foundry 포크 시험: 서명 유효·만료·다른 회원·허용 외 선택자 거부 | 배포 = 감독 |
| K1 | KMS 발급기·서명기 코드(AWS 호출은 포트로 분리, 시험은 로컬 secp256k1 가짜 KMS: DER 서명·SPKI 공개키를 같은 형식으로 반환) | `apps/worker/src/aa/kms-member-key.ts`(CreateKey·GetPublicKey→주소, Sign→DER→low-s→v 복원), `apps/worker/src/aa/signer.ts`(의도→다이제스트 직접 계산), 마이그레이션 `member_keys`·`signer_nonces` | 2-1c 1·3·4를 가짜 KMS로 전부, 2(b) DB 매핑 거부 | 코드만 |
| K2 | KMS 인프라 코드 | `infrastructure/aws/platform/member-keys.json`: signer·issuer 역할, 세션 태그 조건 키 정책 템플릿, 삭제·비활성 거부, 다중 리전 옵션, CloudTrail 경보. 1차 `wallet-issuance.json`(시드)은 비교안용으로 보류 표시 | cfn 렌더 시험(기존 `aws-platform-deploy.test.mjs` 방식) | AWS 생성 = 감독 |
| K3 | dev 실키 인수 | 감독이 dev 키 2개 생성 후 2-1c 전체(2(c) 포함)를 실제 KMS로 | 시험 로그 첨부 | 감독 |
| K4 | 1차 발급기 교체 | `create_kyaa_member` 주소 출처를 `member_keys`로, `address-issuer.ts`·`KYAA_WALLET_XPUB` 제거 또는 비교안으로 이동, dev 잠정 주소 교체 | 신규 가입 시 `member_keys` 1행·주소 일치 | K3 통과 후 |
| S3 | 정책 서버 | `apps/web/server/aa/sponsor-policy.ts`(의도 생성·한도·허용 목록·HMAC) | 한도 초과·정지 회원·허용 외 선택자 거부 | |
| S4 | DB | `supabase/migrations/<새>_member_accounts.sql`: `member_accounts`, `sponsored_operations`, 한도 RPC | SQL 시험(롤백): 하루 한도 경계, 동시성 | 운영 적용 = 감독 |
| S5 | 기존 회원 새 주소 발급 | 첫 로그인 때 `member_accounts` 행 생성(`kyaa_sign_in` 확장) | 기존·신규 회원 각각 1개 주소 | |
| S6 | 기록 수신 주소 전환(P2-a) | `provider='privy'`로 지갑을 고르는 SQL 함수 약 30개 → "활성 member_account 우선" 마이그레이션, `apps/worker` 기록 경로 | 함수별 회귀 SQL 시험, 하네스 | 별도 게이트 |
| S7 | 회원 주도 거래 1종 | 예: 도장 전송/수령 UserOp 경로(web → 정책 → signer → relayer) | e2e(테스트넷), 한도·감사 로그 | |
| S8(선택) | ActionHub v3 바우처 | `contracts/src/ByUsActionHub.sol` 업그레이드 | Foundry + 외부 감사 | 사용자 결정 |

## 2-3. 위험
| # | 위험 | 대응 |
|---|---|---|
| 2-1 | (기준안) KMS 키 분실·삭제 = 그 회원 주소 서명 영구 불가 | 삭제 거부 정책, 다중 리전 복제, 분실 시 새 주소 |
| 2-1' | (기준안) 회원 수에 비례하는 비용(1만 명 월 약 $10,000) | 지연 생성(첫 서명 때), 비용 경보, 사용자에게 비용 보고 |
| 2-1'' | (비교안 HD) 시드 1개 유출 = 전 회원 키 | 채택 시에만 해당 |
| 2-2 | `VerifyingPaymaster`는 샘플, 감사 범위 [확인 필요] | 고정 커밋 사용, 대안 Candide/Pimlico 감사 페이마스터 |
| 2-3 | 자체 번들링 운영(nonce·재시도·가스 추정) | 우리 UserOp만 처리, relayer 단일 nonce 큐 |
| 2-4 | SQL 함수 약 30개 변경 | S6 별도 과제·게이트 |
| 2-5 | GIWA 메인넷 미출시, 가스·L1 요금 미정 | 하루 전체 한도로 상한 |
| 2-6 | 기존 Privy 주소 기록은 이전하지 않음 | 표시 연결, 재발행은 사용자 결정 |
| 2-7 | 7702 위임 후 다른 위임으로 덮어쓰기(키 보유자) | 키는 signer만 보유 |

## 2-4. 되돌리기
- K4 전: 1차 잠정 xpub 주소 그대로(신규 가입 주소 확정 안 함). K4 후 문제 시: `create_kyaa_member` 주소 출처를 이전 구현으로 되돌리는 배포 + 이미 만든 KMS 키는 비활성화하지 않고 보관(주소 기록 보존).
- 정책 서버 플래그로 대납 즉시 중지, 페이마스터 예치금 인출.
- 기록 수신 전환(S6)은 함수 단위 마이그레이션 → 이전 정의로 되돌리는 down 마이그레이션 동봉.
- 위임은 온체인 상태라 되돌리지 않는다(회원 주소는 그대로 기록 수신 가능).

## 2-5. 비용 추정 [추정]
- 테스트넷: UserOp 1건 ≈ 150–200k gas × 0.001 gwei ≈ 2×10⁻⁷ ETH, faucet이라 실비 0.
- 같은 단가 가정 메인넷: 1만 명 × 하루 5건 ≈ 0.01 ETH/일 + L1 데이터 요금(미정).
- 기준안 KMS: 회원당 월 $1(다중 리전 복제 시 $2) + 서명 1만 건 약 $0.15. 1천 명 월 약 $1,000, 1만 명 월 약 $10,000. 지연 생성으로 "실제 거래한 회원 수"에 비례하게 줄일 수 있다.
- 비교안 HD: 시크릿 월 $0.40 + KMS 대칭키 월 $1.
- 공통: Lambda 서명 비용 무시 가능, 페이마스터 배포 가스 1회.

## 출처 (2차)
- GIWA RPC 측정: `apps/web/scripts/giwa-7702-probe.mjs`, `eth_getBlockByNumber`/`eth_getCode`/`eth_gasPrice` (2026-11-12, 신뢰도 높음)
- OP Stack Isthmus = Pectra(7702 포함): https://docs.optimism.io/op-stack/protocol/hardforks/isthmus , https://optimism.io/blog/optimism-brings-ethereum-s-pectra-upgrade-to-the-superchain , https://gov.optimism.io/t/upgrade-proposal-15-isthmus-hard-fork/9804 (공식, 높음)
- EntryPoint v0.8·Simple7702Account: https://erc4337.substack.com/p/entrypoint-v08-released , https://docs.candide.dev/wallet/abstractionkit/simple-7702-account-v08/ (감사 언급은 제3자 문서, 중간), https://goto.etherscan.com/address/0xe6cae83bde06e4c305530e199d7217f42808555b (검증 소스, 높음)
- Pimlico 지원 체인(GIWA 없음): https://docs.pimlico.io/bundler/reference/supported-chains , https://docs.pimlico.io/paymaster/verifying-paymaster/reference/supported-chains (공식, 높음)
- Alchemy 지원 체인(GIWA 없음): https://www.alchemy.com/docs/wallets/supported-chains , https://www.alchemy.com/support/what-are-the-supported-chain-for-account-kit (공식, 높음)
- KMS 요금: https://aws.amazon.com/kms/pricing/ (키당 월 $1, 비대칭 서명 1만 건 약 $0.15 — secp256k1 행은 [확인 필요])
- EIP-7702 개요: https://ethereum.org/roadmap/pectra/7702
