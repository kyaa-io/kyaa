# Privy 중단 · Cognito 전환 실행 절차 (PRIVY-EXIT-0005)

2026-11-12 사용자 결정: Privy를 쓰지 않는다. 로그인은 Cognito(서울), 새 회원 지갑 주소는 kyaa 서버가 발급한다. 기존 Privy 지갑 주소는 그대로 보관해 지난 기록을 계속 보여 준다.

이 문서는 운영자(감독)가 실행한다. 작업자는 내보내기·백필·AWS 생성·DB 적용을 실행하지 않았다.

## 무엇이 바뀌나

| 항목 | 전 | 후 |
|---|---|---|
| 웹 로그인 | Privy(Google·Apple) | Cognito Hosted UI(Google·Apple, 카카오는 설정 시) |
| API 인증 | 요청마다 Privy API 조회 | Cognito JWT 로컬 검증(JWKS 캐시) + DB 1회 조회 |
| 세션 | Privy SDK 세션 | `__Host-kyaa-cognito` 쿠키, DB 암호화 세션, 최대 30일 |
| 회원 키 | `did:privy:…` | 기존 회원은 그대로, 새 회원 `kyaa:<uuid>` |
| 새 회원 지갑 | Privy 임베디드 지갑 | xpub에서 파생한 주소(`m/44'/60'/0'/0/i`) |
| 기존 회원 연결 | — | Google/Apple subject가 정확히 같을 때만. 이메일만 같으면 연결하지 않고 막는다(`email_in_use`) |

## 지갑 주소 (1차는 잠정, 최종은 2차 signer)

- 확정 방식(사용자 결정 11/12 00:5x)은 (B) HD 시드 1개 + 서명 전용 실행부(signer)다. 시드는 KMS 키 1개로 봉투 암호화하고, 복호화는 signer만 하며, 회원마다 강화 파생 `m/44'/60'/0'/i'` 키로 서명한다. (A) 회원별 KMS 키는 비용 때문에 기각됐다.
- **1차 신규 가입 주소는 잠정이고 서명할 수 없다.** dev만 쓰는 버리는 xpub로 만든다: `apps/web`에서 `node scripts/dev-throwaway-xpub.mjs` → `KYAA_WALLET_XPUB=…`. 시드는 저장하지 않고 폐기한다. AWS 리소스를 만들지 않는다.
- **운영에는 잠정 xpub을 넣을 수 없다**: 배포 설정과 서버 설정이 모두 거부한다. 운영 신규 가입 주소는 K4(signer 발급기 교체) 전까지 확정하지 않는다.
- **평문 시드 경로는 삭제했다**(`wallet-issuance.json`, `wallet-master-generate.mjs`). 이 둘은 시드를 Secrets Manager에 평문으로 넣고 운영자가 읽을 수 있는 구조여서 (B)와 반대였다. KMS 키·시드 암호문 생성은 dev에서도 K2(봉투 암호화로 새로 작성) 뒤에만 한다.
- 잠정 주소 교체(K4) 순서와, 잠정 주소로 이미 나간 테스트넷 기록의 처리: `docs/operations/privy-exit-plan.md` 전제 6-2. 기록은 옮기거나 다시 발행하지 않고, 과거 주소로 함께 표시한다.
- `user_wallets.provider`는 모든 회원 지갑에서 `privy`로 둔다. 기록·도장 함수 약 30개가 이 값으로 회원 지갑을 고른다. 서버 발급 여부는 `kyaa_wallet_derivations`(잠정)·`member_keys`(K4 이후)로 구분한다.

## 2차 예정: 회원 주소 거래와 가스 대납

사용자 추가 지시(11/12)에 따라 회원 주소에서 실제 거래가 일어나고 가스는 kyaa가 낸다. GIWA Sepolia에서 EIP-7702 위임이 동작함을 확인했다(`apps/web/scripts/giwa-7702-probe.mjs`). 구조는 회원 EOA → `Simple7702Account` 위임, EntryPoint v0.8, 우리 페이마스터, 우리 relayer 번들링이다. 회원 키 서명은 분리된 signer만 한다. signer는 웹 정책을 믿지 않고 체인 ID(91342, 0 거부)·위임 대상(Simple7702Account)·EntryPoint·(대상, 선택자) 허용 목록·`sender` 일치·회원 Cognito 토큰을 스스로 검사한다. 상세는 `docs/operations/privy-exit-plan.md` 2-0, 2-1c.

## 감독에게 필요한 값과 승인

| # | 할 일 | 값 / 명령 | 비고 |
|---|---|---|---|
| 1 | Cognito Apple 팀 ID 확인 | `aws cognito-idp describe-identity-provider --user-pool-id <pool> --provider-name SignInWithApple --query 'IdentityProvider.ProviderDetails.{team:team_id,client:client_id}'` | Privy용 Apple 알림 설정은 팀 `7RFN3TFR5K`, 서비스 ID `kr.byus.web`(`apple-lifecycle.ts`). Apple `sub`는 팀 단위라 팀 ID가 같으면 기존 회원 subject가 같다. 다르면 Apple 회원은 백필로도 연결되지 않는다. 작업자 가드가 기본 프로필 읽기를 막아 확인하지 못했다. 풀: dev `ap-northeast-2_8KvygeHtY`·`ap-northeast-2_KPXkxE2l4`, staging `ap-northeast-2_ByIT6OHGz`, prod `ap-northeast-2_ucahQDtFW` |
| 2 | (K2 이후에만) 지갑 KMS 키·시드 암호문 생성 | K2에서 봉투 암호화로 새로 작성할 템플릿·스크립트 | **지금은 실행할 것이 없다.** 평문판은 삭제됨. dev도 같음 |
| 3 | dev 잠정 xpub | `apps/web`에서 `node scripts/dev-throwaway-xpub.mjs` | dev 전용, 시드 저장 없음, 운영 거부 |
| 4 | DB 마이그레이션 | `supabase/migrations/20261224000000_kyaa_native_auth.sql` | 추가형. `sync_privy_identity_with_provider_accounts`의 키 형식만 `kyaa:` 허용으로 넓힌다. 적용 뒤 PostgREST 스키마 캐시 재적재 |
| 5 | 실행 설정 | `AUTH_PROVIDER=cognito`, dev만 `KYAA_WALLET_XPUB=<3번 값>`, `COGNITO_USER_POOL_ID`·`COGNITO_CLIENT_ID`·`COGNITO_DOMAIN`·`COGNITO_REDIRECT_URI`·`COGNITO_LOGOUT_URI`·`AUTH_COOKIE_SECRET` 확인 | `scripts/aws-platform-deploy.mjs`가 `KYAA_WALLET_XPUB`(xpub 형식)와 `COGNITO_KAKAO_ENABLED`를 받는다 |
| 6 | Privy 내보내기·백필 | 아래 절차 | 운영 전환 전에 반드시 |
| 7 | 카카오(선택) | 아래 절차 | 꺼진 상태가 기본 |

## 기존 회원 연결(백필)

Google/Apple subject를 이미 아는 회원은 백필 없이 연결된다. 2026-11-30 마이그레이션 이후 Privy 세션 동기화가 `live_privy_auth_accounts`에 기록했기 때문이다. 그 뒤로 로그인하지 않은 회원은 Privy 내보내기가 있어야 연결된다. 없으면 `email_in_use`로 막힌다.

1. 내보내기(운영자 PC, 저장소 밖 경로):
   ```bash
   PRIVY_APP_ID=… PRIVY_APP_SECRET=… node scripts/privy-exit/export-privy-users.mjs ~/private/privy-users.json
   ```
2. 회원 목록(같은 환경 DB, 읽기 전용):
   ```sql
   \copy (select json_agg(json_build_object('id',id,'privy_user_id',privy_user_id,'status',status)) from public.app_users) to '~/private/owners.json'
   ```
3. 입력 합치기: `{"users": <privy-users.json의 users>, "owners": <owners.json>}` → `~/private/input.json`
4. 준비(네트워크·DB 없음): `node apps/web/server/auth/cognito/backfill.mjs ~/private/input.json ~/private/backfill.json`
5. 드라이런: `node scripts/privy-exit/import-backfill.mjs ~/private/backfill.json` → 회원 수, subject 수, 묶음 수 확인
6. 적용: `POSTGREST_URL=… POSTGREST_SERVICE_TOKEN=… node scripts/privy-exit/import-backfill.mjs ~/private/backfill.json --apply --run-id <드라이런의 suggestedRunId>`
   - 같은 run-id로 다시 돌려도 중복 행은 생기지 않는다.
   - `--complete`는 모든 활성 회원이 포함됐을 때만 성공한다. 연결에는 필요 없다.
7. 개인 식별자 파일 3개를 지운다.

로컬 합성 드라이런(2026-11-12): Privy 사용자 2명(앱 회원 1명, 앱 회원 아님 1명) → backfill → 가져오기(롤백 트랜잭션) → `kyaa_sign_in`이 가져온 Google subject로 기존 회원(`did:privy` 유지)에 `linked`, 앱 회원이 아닌 Privy 사용자는 `new`.

## dev 확인 순서

1. 4번 마이그레이션 적용 → 3번 dev 잠정 xpub(2번은 K2 전이라 하지 않음) → 5번 설정 → 배포.
2. 브라우저(실제 dev 도메인):
   - 기존 회원 Google 로그인 → 같은 MY·도장·지갑 주소 표시
   - 기존 회원 Apple 로그인(1번 확인 뒤)
   - 새 Google 계정 가입 → 잠정 주소 발급(`kyaa_wallet_derivations` 행 1개, `user_wallets.address` 일치), 환영 도장. 이 주소는 서명 불가이며 K4에서 교체한다
   - 로그인 중 취소·실패 → 로그인 화면에 "로그인을 마치지 못했어요." (JSON 화면이 아님)
   - 같은 이메일, 다른 Google 계정 → 로그인 화면에 `email_in_use` 문구, 세션 없음
   - 정지(`app_users.status='disabled'`) 계정 → "이용이 중지된 계정이에요."
   - 로그아웃 → 쿠키 삭제, Cognito 로그아웃, 새로고침 뒤 비로그인. **그리고 로그아웃 전에 받아 둔 `kyaa-cognito:` Bearer 접근 토큰을 보호 API(예: `GET /api/me/profile`)에 다시 보내면 401이어야 한다**(쿠키 삭제만으로는 통과 아님). 확인할 DB 상태: `cognito_browser_sessions`에서 그 세션 행이 지워지고, `revoked_cognito_token_families`에 그 토큰의 `origin_jti`·`jti`가 들어감. 같은 로그인에서 갱신된 토큰도 401(같은 `origin_jti`). 다시 로그인하면 새 토큰은 정상. 앱 Cognito 핸드오프 로그아웃(`/api/auth/cognito/native/logout`)도 같은 기준
   - 탈퇴 → 계정 삭제 접수, 같은 계정 재로그인 시 `inactive`
   - Privy 차단 상태 확인: 브라우저에서 `auth.privy.io` 요청이 0건
   - 관리자 로그인(Google) → 관리자 화면
   - 집계는 로그인 방법별(L1~L4, 앱 A1~A4)로 따로 한다. 웹 이메일 로그인(L1)은 화면이 없어 "미검증 — 현재 불가"이며 소셜 성공으로 대신하지 않는다.
3. 운영은 감독 승인 뒤, `docs/operations/privy-exit-plan.md` 1-6 운영 전환 조건(C1~C5: 앱 충돌 방침, 앱 토큰 확인, 신규 가입 주소 확정 금지 포함)을 모두 충족한 다음에. 전환 직후 일부 회원은 한 번 다시 로그인한다.

## 카카오 로그인 준비

- 코드: Cognito 풀에 이름이 `Kakao`인 OIDC 공급자가 있으면 `identities`의 `Kakao`를 `https://kauth.kakao.com` subject로 기록한다. `/api/auth/cognito/start?provider=kakao`는 `COGNITO_KAKAO_ENABLED=true`일 때만 열린다. 로그인 화면은 같은 값일 때만 카카오 버튼을 보인다.
- 인프라: `environment.json`의 `KakaoProviderSecretArn`(JSON `client_id`, `client_secret`)를 넣으면 공급자를 만들고 웹·앱 클라이언트에 붙인다. 발급자 `https://kauth.kakao.com`, 범위 `openid account_email`.
- 감독에게 필요한 값:
  1. 카카오 디벨로퍼스 앱의 REST API 키(`client_id`)와 Client Secret(활성화)
  2. 카카오 로그인 → OpenID Connect 활성화
  3. 동의 항목: 카카오계정(이메일) 필수 동의(비즈 앱 전환 필요)
  4. Redirect URI: `https://<Cognito 도메인>/oauth2/idpresponse` (환경별)
  5. 위 값을 담은 Secrets Manager 시크릿 ARN(환경별)
- 확인 필요: 카카오 ID 토큰/사용자 정보의 `email_verified` 제공 여부. 없으면 Cognito가 이메일을 미확인으로 두어 로그인이 `provider_required`로 막힌다. 실제 앱으로 dev에서 먼저 확인한다.
- 카카오 회원은 Privy에 없었으므로 모두 새 회원이다(같은 이메일 회원이 있으면 `email_in_use`).

## 남는 것과 되돌리기

- Privy Bearer 토큰 검증 경로는 앱(Flutter)이 바뀔 때까지 서버에 남는다. 웹은 쓰지 않는다. 웹에서 가입한 회원은 같은 Google/Apple 계정으로 앱(Privy)에 들어오면 세션 동기화가 충돌로 실패한다(병합 없음). 처리 방침은 운영 전환 조건 C3.
- `AUTH_COOKIE_SECRET` 하나로 30일 세션을 암호화하고 키 식별자가 없다. 키를 바꾸면 모든 웹 회원이 다시 로그인한다.
- 되돌리기: `AUTH_PROVIDER=privy`로 이전 빌드를 배포한다. 마이그레이션은 추가형이라 되돌리지 않는다. 전환 기간에 생긴 `kyaa:` 회원은 Privy 로그인으로 들어올 수 없으므로 되돌리기 전에 수를 확인한다.
- Privy 계약 해지는 병행 기간 뒤 사용자 확인으로 한다.
