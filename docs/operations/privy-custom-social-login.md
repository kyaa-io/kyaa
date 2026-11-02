# 지역별 소셜 로그인 준비

2026-11-02 기준. 이번 준비 범위는 LINE·Facebook·Naver·Kakao·WeChat 다섯 가지이며 모두 기본 비활성 상태다. 제공자별 개발자 앱 설정·필요한 심사·실제 로그인 검증 후 활성화한다. Kakao·WeChat·Facebook·Naver는 Privy custom OAuth 유료 기능도 필요하다. LINE은 Privy 기본 제공 로그인 방식으로 별도 custom OAuth 유료 기능이 필요하지 않지만, 개발자 앱과 채널 설정을 마쳐야 한다.

## 지역별 검토 범위

아래 지역은 로그인 수단을 검토할 시장 범위이며 사용률 순위나 점유율을 뜻하지 않는다.

| 제공자 | 검토 지역/역할 | KYAA SDK ID | 서버·클라이언트 linked account type | 준비 조건 |
| --- | --- | --- | --- | --- |
| Google / Apple | 글로벌 기본 로그인 | 기존 `google` / `apple` | 기존 `google_oauth` / `apple_oauth` | 기존 구성 유지 |
| LINE | 일본·대만·태국 | `line` | `line_oauth` | 무료 기본 로그인, 운영 개발자 앱·지역별 채널 설정 검토 |
| Kakao | 한국 | `custom:kakao` | `custom:kakao` | Privy custom OAuth 유료 기능, 기존 앱 설정·검증 |
| Naver | 한국 | `custom:naver` | `custom:naver` | Privy custom OAuth 유료 기능, 개발자 앱·서비스 심사 |
| WeChat | 중국 | `custom:wechat` | `custom:wechat` | Privy custom OAuth 유료 기능, 기업 인증·웹 앱 승인·직접 연동 확인 |
| Facebook | 범용 로그인 후보 | `custom:facebook` | `custom:facebook` | Privy custom OAuth 유료 기능, 개발자 앱·운영 권한/심사 |

## 확인한 외부 상태

- Privy 앱 `cmru1m5cu00jp0cjor9oavwb9`의 custom OAuth 생성은 Scale 요금제 안내로 차단되어 있다. 결제·요금제 변경은 하지 않았다.
- Kakao 비즈 앱 `1568460`은 기존 앱이다. 로그인용 REST API 키에 `https://auth.privy.io/api/v1/oauth/callback`을 추가하고 저장된 값을 재조회했다. 기존 콜백은 보존했다. OpenID Connect를 켰다.
- WeChat Open Platform은 `biz@sallylab.io` 이메일 인증을 완료하고 한국 기업 등록 단계까지 진행했다. 관리자 신분증/여권/운전면허 번호와 휴대폰 인증이 남아 있다. 해외 기업 인증 화면에는 $99, 심사 1–5영업일이 표시된다. 사용자의 결제 전 대기 요청에 따라 관리자 인증·결제는 보류했다. 개발자 계정·웹 앱 승인·AppID/Secret 발급을 완료한 것으로 보지 않는다.
- LINE Business ID와 SallyLab provider `2005702371`을 만들었다. 일본용 웹 로그인 채널 `2012330382`는 Developing 상태다. 사업자 국가는 South Korea이며, 개인정보처리방침·이용약관과 Privy 콜백을 등록했다. Privy LINE 자격 증명 저장 성공을 확인했고 LINE 스위치는 꺼 두었다. 채널 공개·다지역 구성·실제 로그인은 미완료다.
- Naver 앱 `sX31vuRHY5YOhrttgILc`를 생성하고 PC 웹·Mobile 웹 서비스 URL `https://kyaa.io`와 Privy 콜백을 등록했다. 기본 이용자 식별자만 요청하며 추가 개인정보 항목은 선택하지 않았다. 개발 중 상태이며 서비스 검수는 미완료다.
- Facebook 기존 kyaa 앱은 Instagram/비즈니스용 구성이므로 보존했다. 일반 Facebook Login 용도로 `kyaa Login` 앱 `1580886560743605`를 생성하고 인증된 주식회사 셀리랩 비즈니스 포트폴리오에 연결했다. 연락처는 `biz@sallylab.io`이며 추가 email 권한은 요청하지 않았다. 앱은 미게시 상태이며 콜백·운영 필수 설정·검수·실제 로그인은 아직 완료하지 않았다.
- 비밀번호는 macOS Keychain에 보관하며 저장소·문서·공개 환경 변수에 넣지 않는다.

## 준비한 동작

- 설치 SDK의 `PrivyProvider.config.loginMethods` 내장 모달 목록은 `custom:*`를 지원하지 않으므로 목록에 강제 캐스팅하지 않는다. KYAA의 headless 로그인 버튼과 `initOAuth`/`useLinkWithOAuth`만 사용한다.
- Google/Apple과 동일한 로그인 상태·중복 실행 방지·복귀 경로로 `custom:kakao`, `custom:wechat`, `line`, `custom:facebook`, `custom:naver`를 시작한다. Google·Apple·Kakao·WeChat의 기존 위치를 보존하고, LINE·Facebook·Naver는 활성화된 항목이 있을 때만 **다른 방법으로 로그인** 영역에 표시한다. 이 영역은 기본 접힘이며 키보드로 열고 닫을 수 있다.
- 로그인 제공자의 이메일 속성은 회원 이메일로 신뢰하지 않는다. 이메일이 필요한 신규 사용자는 로그인한 동일 Privy 사용자에 이메일 OTP를 **연결**한 뒤 가입을 계속한다. Privy 일반 이메일 로그인이나 이메일 일치에 따른 계정 병합은 하지 않는다.
- 기존 회원은 원래 Google/Apple로 로그인한 뒤 **설정 → 계정**에서 다섯 제공자를 연결한다. SDK `line`의 연결 완료는 `line_oauth` 계정을 검사한다. 기존 `kyaa.custom-oauth-link` sessionStorage 키를 유지한다. 콜백에서 같은 Privy DID와 기존 임베디드 EVM 지갑 주소를 확인한다. 다른 회원에 이미 연결된 계정은 연결 실패로 처리한다.
- 알림용 Kakao 연결과 로그인 계정 연결은 별개다. 로그인 연결만으로 알림 수신 동의나 알림 전화번호를 변경하지 않는다.
- 임의의 `custom:*` 계정, 확인되지 않은 subject/verified_at, LINE 또는 custom profile의 이메일만 있는 계정은 서버 회원 세션을 만들지 못한다.
- 기존 Google/Apple용 Cognito 이전 inventory는 확장하지 않는다. 다섯 지역별 제공자의 Cognito 전환은 별도 작업이며 `AUTH_PROVIDER=cognito`에서는 모두 노출하지 않는다.

## Kakao 제공자 설정

Privy custom OAuth 생성 시 이름을 **kakao**로 고정한다. 생성 후 주요 필드를 바꿀 수 없고 이용자가 생기면 삭제할 수 없으므로 저장 전에 확인한다.

| 항목 | 값 |
| --- | --- |
| SDK provider | `custom:kakao` |
| Callback | `https://auth.privy.io/api/v1/oauth/callback` |
| Authorization | `https://kauth.kakao.com/oauth/authorize` |
| Token | `https://kauth.kakao.com/oauth/token` |
| JWKS | `https://kauth.kakao.com/.well-known/jwks.json` |
| Userinfo | `https://kapi.kakao.com/v1/oidc/userinfo` |
| Scope | `openid` |
| PKCE | S256 |
| User source | ID Token, 식별자 `sub` |
| Client credentials | Kakao 앱의 기존 REST API 키 및 **카카오 로그인** 클라이언트 시크릿; 비즈니스 인증 시크릿과 구분 |
| Token endpoint auth | Kakao discovery 기준 `client_secret_post`; Privy 설정/실제 토큰 교환 결과 확인 필요 |

카카오의 이메일 동의를 요구하지 않는 구성이다. 신규 회원 이메일은 KYAA의 연결 OTP로 확인한다. 이름·사진을 추가로 수집하려면 실제 필요한 동의 항목과 Privy 매핑을 별도 확인한다.

## WeChat 제공자 설정

1. 관리자 본인 확인 → 한국 기업 인증 → 웹 앱 생성·승인 → AppID/Secret·callback domain을 확보한다.
2. Privy의 custom OAuth 이름은 **wechat**, SDK ID는 `custom:wechat`로 고정한다.
3. WeChat은 일반 OAuth와 token 교환 매개변수/호출 방식에 차이가 있으므로, 승인된 웹 앱으로 Privy가 직접 연동되는지 확인한다. `appid`/`secret`을 사용하는 endpoint에 표준 `client_id`/`client_secret` 설정만 넣고 작동한다고 가정하지 않는다.
4. 직접 연동이 지원되지 않으면 OAuth broker가 추가로 필요하다. 호환성을 확인하기 전 가짜 endpoint나 자체 JWT bridge를 배포하지 않는다.

## LINE 제공자 설정

- SDK `line`은 native OAuth다. 이름을 `custom:line`으로 바꾸지 않는다. 서버 응답과 SDK `linkedAccounts`의 계정 타입은 `line_oauth`다.
- LINE Developers에서 운영용 provider 및 LINE Login 채널을 준비하고, Privy 대시보드의 LINE 설정에 채널 ID/secret과 콜백을 등록한다. 운영 지역·법인/사업자 정보·채널 제한을 확인한다. 무료 로그인 기능이어도 운영 개발자 앱은 필요하다.
- LINE 프로필의 email 필드는 회원 이메일로 신뢰하지 않는다. 같은 Privy 사용자에 OTP로 연결된 email `address`와 양수·유한 `verified_at`이 있어야 회원 세션을 만든다.
- 로그인 제공자 연결과 알림용 LINE 메시징 채널은 구분한다. 메시징·친구추가 기능은 이번 범위에 없다.

## Facebook / Naver 제공자 설정

- Privy custom OAuth 이름을 각각 **facebook**, **naver**로 고정한다. SDK ID는 `custom:facebook`, `custom:naver`다. 제공자 profile email은 회원 이메일로 바로 채택하지 않는다.
- 각 개발자 콘솔에서 운영용 앱·서비스 URL·개인정보처리방침·유효 콜백을 등록하고, 운영 공개/필요 권한 심사를 마친다. 테스트 사용자에게만 작동하는 상태를 운영 준비 완료로 보지 않는다.
- Facebook의 운영 모드·Facebook Login 설정과 Naver의 서비스 심사 상태를 확인한다. Privy 유료 기능 해제 후 실제 authorization/token/profile 교환을 시험한다.
- profile 식별자 응답 구조와 Privy 사용자 식별자 매핑, secret 전달 방식은 실제 제공자·Privy 설정에서 확인한다. 특히 중첩된 Naver profile ID가 정확히 매핑되는지 검증하기 전 활성화하지 않는다.
- 제공자 설정값·실제 응답으로 직접 연동이 검증되기 전 자체 broker를 추가하거나 성공을 가정하지 않는다.

## 활성화와 검증

제공자별 서버·공개 플래그를 함께 설정한다. 기존 환경에 값이 없으면 false다. AWS는 서버 플래그를 공개 런타임 설정에 매핑한다.

```dotenv
PRIVY_KAKAO_LOGIN_ENABLED=true
NEXT_PUBLIC_PRIVY_KAKAO_LOGIN_ENABLED=true
PRIVY_WECHAT_LOGIN_ENABLED=false
NEXT_PUBLIC_PRIVY_WECHAT_LOGIN_ENABLED=false
PRIVY_LINE_LOGIN_ENABLED=false
NEXT_PUBLIC_PRIVY_LINE_LOGIN_ENABLED=false
PRIVY_FACEBOOK_LOGIN_ENABLED=false
NEXT_PUBLIC_PRIVY_FACEBOOK_LOGIN_ENABLED=false
PRIVY_NAVER_LOGIN_ENABLED=false
NEXT_PUBLIC_PRIVY_NAVER_LOGIN_ENABLED=false
```

1. Privy custom OAuth 등록과 이메일 OTP 연결 사용 가능 여부를 확인한다. 현재 대시보드 Email login은 꺼져 있으며, `useLinkEmail`이 지원되는 설치 SDK와 별개로 이 설정 상태에서 실제 OTP 발송·연결이 가능한지는 미검증이다. 연결에 필요한 설정을 확인하되 일반 이메일 로그인 전체를 임의로 켜지 않는다. 테스트 계정 기능을 켜는 것으로 대체하지 않는다.
2. 제공자 한 개만 활성화한 검증 환경에서 신규 로그인 → 이메일 OTP → 회원 세션 → 지갑 생성 → 원래 returnTo 복귀를 확인한다.
3. 기존 회원은 원래 로그인 → 설정에서 provider 연결 → 동일 DID/지갑 확인 → 로그아웃 → 새 제공자로 재로그인을 확인한다. 기존 계정과 같은 이메일을 입력했을 때 자동 병합되지 않고 충돌이 안내되는지도 확인한다.
4. 거절·취소·만료된 OTP·계정 연결 충돌·다른 DID 응답·로그아웃 중 응답·모바일/데스크톱을 확인한다.
5. 실제 제공자 응답의 custom linked account shape 및 OTP email의 서버 `address`/`verified_at`을 비밀 값 없이 확인한 뒤 운영에서 활성화한다.

**비상 차단:** 서버·공개 플래그를 모두 false로 바꾸면 로그인 버튼뿐 아니라 해당 지역별 제공자만 사용하는 회원의 서버 세션/API 인증도 차단한다. 기존 회원이 생긴 뒤 이를 단순한 버튼 숨김 롤백으로 취급하지 않는다. 기존 Google/Apple 연결이 있으면 해당 경로를 사용할 수 있다. 계정·지갑 데이터를 삭제하거나 이메일을 기준으로 복구하지 않는다.

## 검증의 한계

로컬 모의 응답 테스트와 타입 검사로 준비 코드를 검증한다. 제공자별 운영 앱 설정·필요한 심사 및 유료 custom OAuth 설정이 완료되지 않아 실제 다섯 제공자의 end-to-end 로그인, 실제 OTP 연결 및 운영 활성화는 아직 검증하지 않았다. 모의 응답 검사와 실제 제공자 로그인 검증을 구분한다.

공식 자료: [Privy custom OAuth](https://docs.privy.io/authentication/user-authentication/login-methods/custom-oauth), [Kakao OpenID discovery](https://kauth.kakao.com/.well-known/openid-configuration), [WeChat Open Platform](https://open.weixin.qq.com/), [Privy LINE 로그인](https://docs.privy.io/authentication/user-authentication/login-methods/line), [LINE Login](https://developers.line.biz/en/docs/line-login/), [Facebook Login](https://developers.facebook.com/docs/facebook-login/), [네이버 로그인](https://developers.naver.com/docs/login/overview/overview.md).
