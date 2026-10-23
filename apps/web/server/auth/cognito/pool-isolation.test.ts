import{expect,it,vi}from"vitest";
vi.mock("server-only",()=>({}));
vi.mock("../../config/env",()=>({loadServerEnv:()=>({AUTH_PROVIDER:"cognito",EMAIL_AUTH_PROVIDER:"cognito",COGNITO_USER_POOL_ID:"ap-northeast-2_social",COGNITO_CLIENT_ID:"social-client",COGNITO_EMAIL_USER_POOL_ID:"ap-northeast-2_email",COGNITO_EMAIL_CLIENT_ID:"email-client",COGNITO_DOMAIN:"https://social.auth.ap-northeast-2.amazoncognito.com",COGNITO_REDIRECT_URI:"https://kyaa.io/api/auth/cognito/callback",COGNITO_LOGOUT_URI:"https://kyaa.io/login",NEXT_PUBLIC_APP_URL:"https://kyaa.io",AUTH_COOKIE_SECRET:Buffer.alloc(32,7).toString("base64")})}));
import{cognitoConfig,emailCognitoConfig}from"./config";
import{seal,unseal}from"./browser-session";
it("keeps social browser/native cookie sessions on their issuer when email uses its own pool",()=>{
 const social=cognitoConfig(),email=emailCognitoConfig();
 expect(email.issuer).toBe("https://cognito-idp.ap-northeast-2.amazonaws.com/ap-northeast-2_email");
 expect(email.clientId).toBe("email-client");
 expect(cognitoConfig().issuer).toBe("https://cognito-idp.ap-northeast-2.amazonaws.com/ap-northeast-2_social");
 expect(cognitoConfig().clientId).toBe("social-client");
 const browserSession={subject:"social-owner",accessToken:"social-access",idToken:"social-id",refreshToken:"secret-refresh"};
 expect(unseal(seal(browserSession,social.cookieSecret),cognitoConfig().cookieSecret)).toEqual(browserSession);
 expect(social.redirectUri).toBe("https://kyaa.io/api/auth/cognito/callback");
 expect(email.issuer).not.toBe(social.issuer);
});
