# Kakao / WeChat 로그인 준비

2026-11-02 기준. 코드는 기본 비활성 상태다. Privy 유료 custom OAuth 기능, 제공자 등록, 실제 로그인 검증 후 제공자별로 활성화한다. 결제만으로 두 로그인이 모두 사용 가능한 상태는 아니다.

## 확인한 외부 상태

- Privy 앱 `cmru1m5cu00jp0cjor9oavwb9`의 custom OAuth 생성은 Scale 요금제 안내로 차단되어 있다. 결제·요금제 변경은 하지 않았다.
- Kakao 비즈 앱 `1568460`은 기존 앱이다. 로그인용 REST API 키에 `https://auth.privy.io/api/v1/oauth/callback`을 추가하고 저장된 값을 재조회했다. 기존 콜백은 보존했다. OpenID Connect를 켰다.
- WeChat Open Platform은 `biz@sallylab.io` 이메일 인증을 완료하고 한국 기업 등록 단계까지 진행했다. 관리자 신분증/여권/운전면허 번호와 휴대폰 인증이 남아 있다. 해외 기업 인증 화면에는 $99, 심사 1–5영업일이 표시된다. 사용자의 결제 전 대기 요청에 따라 관리자 인증·결제는 보류했다. 개발자 계정·웹 앱 승인·AppID/Secret 발급을 완료한 것으로 보지 않는다.
- 비밀번호는 macOS Keychain에 보관하며 저장소·문서·공개 환경 변수에 넣지 않는다.

## 준비한 동작

- 설치 SDK의 `PrivyProvider.config.loginMethods` 내장 모달 목록은 `custom:*`를 지원하지 않으므로 목록에 강제 캐스팅하지 않는다. KYAA의 headless 로그인 버튼과 `initOAuth`/`useLinkWithOAuth`만 사용한다.
- Google/Apple과 동일한 로그인 상태·중복 실행 방지·복귀 경로로 `custom:kakao`, `custom:wechat`를 시작한다.
- 로그인 제공자의 이메일 속성은 회원 이메일로 신뢰하지 않는다. 이메일이 필요한 신규 사용자는 로그인한 동일 Privy 사용자에 이메일 OTP를 **연결**한 뒤 가입을 계속한다. Privy 일반 이메일 로그인이나 이메일 일치에 따른 계정 병합은 하지 않는다.
- 기존 회원은 원래 Google/Apple로 로그인한 뒤 **설정 → 계정**에서 Kakao/WeChat을 연결한다. 콜백에서 같은 Privy DID와 기존 임베디드 EVM 지갑 주소를 확인한다. 다른 회원에 이미 연결된 계정은 연결 실패로 처리한다.
- 알림용 Kakao 연결과 로그인 계정 연결은 별개다. 로그인 연결만으로 알림 수신 동의나 알림 전화번호를 변경하지 않는다.
- 임의의 `custom:*` 계정, 확인되지 않은 subject/verified_at, custom profile의 이메일만 있는 계정은 서버 회원 세션을 만들지 못한다.
- 기존 Google/Apple용 Cognito 이전 inventory는 확장하지 않는다. custom 계정의 Cognito 전환은 별도 작업이며 `AUTH_PROVIDER=cognito`에서는 custom 로그인을 노출하지 않는다.

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

## 활성화와 검증

제공자별 서버·공개 플래그를 함께 설정한다. 기존 환경에 값이 없으면 false다. AWS는 서버 플래그를 공개 런타임 설정에 매핑한다.

```dotenv
PRIVY_KAKAO_LOGIN_ENABLED=true
NEXT_PUBLIC_PRIVY_KAKAO_LOGIN_ENABLED=true
PRIVY_WECHAT_LOGIN_ENABLED=false
NEXT_PUBLIC_PRIVY_WECHAT_LOGIN_ENABLED=false
```

1. Privy custom OAuth 등록과 이메일 OTP 연결 사용 가능 여부를 확인한다. 현재 대시보드 Email login은 꺼져 있으며, `useLinkEmail`이 지원되는 설치 SDK와 별개로 이 설정 상태에서 실제 OTP 발송·연결이 가능한지는 미검증이다. 연결에 필요한 설정을 확인하되 일반 이메일 로그인 전체를 임의로 켜지 않는다. 테스트 계정 기능을 켜는 것으로 대체하지 않는다.
2. 제공자 한 개만 활성화한 검증 환경에서 신규 로그인 → 이메일 OTP → 회원 세션 → 지갑 생성 → 원래 returnTo 복귀를 확인한다.
3. 기존 회원은 원래 로그인 → 설정에서 provider 연결 → 동일 DID/지갑 확인 → 로그아웃 → 새 제공자로 재로그인을 확인한다. 기존 계정과 같은 이메일을 입력했을 때 자동 병합되지 않고 충돌이 안내되는지도 확인한다.
4. 거절·취소·만료된 OTP·계정 연결 충돌·다른 DID 응답·로그아웃 중 응답·모바일/데스크톱을 확인한다.
5. 실제 제공자 응답의 custom linked account shape 및 OTP email의 서버 `address`/`verified_at`을 비밀 값 없이 확인한 뒤 운영에서 활성화한다.

**비상 차단:** 서버·공개 플래그를 모두 false로 바꾸면 로그인 버튼뿐 아니라 해당 custom-only 사용자의 서버 세션/API 인증도 차단한다. 기존 custom 사용자가 생긴 뒤 이를 단순한 버튼 숨김 롤백으로 취급하지 않는다. 기존 Google/Apple 연결이 있으면 해당 경로를 사용할 수 있다. 계정·지갑 데이터를 삭제하거나 이메일을 기준으로 복구하지 않는다.

## 검증의 한계

로컬 모의 응답 테스트와 타입 검사로 준비 코드를 검증한다. 유료 Privy 기능·승인된 WeChat 앱이 없으므로 실제 제공자 end-to-end 로그인, 실제 OTP 연결 및 운영 활성화는 아직 검증하지 않았다.

공식 자료: [Privy custom OAuth](https://docs.privy.io/authentication/user-authentication/login-methods/custom-oauth), [Kakao OpenID discovery](https://kauth.kakao.com/.well-known/openid-configuration), [WeChat Open Platform](https://open.weixin.qq.com/).
