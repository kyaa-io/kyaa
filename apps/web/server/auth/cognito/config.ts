import "server-only";
import { loadServerEnv } from "../../config/env";

export function cognitoConfig() {
  const env = loadServerEnv();
  if (env.AUTH_PROVIDER !== "cognito") throw new Error("Cognito authentication is disabled");
  return configuredCognito(env);
}

// Cleanup keeps old browser sessions revocable after social login switches to Privy.
export function cognitoCleanupConfig() {
  return configuredCognito(loadServerEnv());
}

function configuredCognito(env: ReturnType<typeof loadServerEnv>) {
  const pool = env.COGNITO_USER_POOL_ID!;
  return {
    issuer: `https://cognito-idp.${pool.split("_")[0]}.amazonaws.com/${pool}`,
    clientId: env.COGNITO_CLIENT_ID!, domain: env.COGNITO_DOMAIN!,
    redirectUri: env.COGNITO_REDIRECT_URI!, logoutUri: env.COGNITO_LOGOUT_URI!,
    origin: new URL(env.NEXT_PUBLIC_APP_URL).origin, cookieSecret: env.AUTH_COOKIE_SECRET!,
  };
}
export type CognitoConfig = ReturnType<typeof cognitoConfig>;

export function emailCognitoConfig() {
  const env=loadServerEnv();
  if(env.EMAIL_AUTH_PROVIDER!=="cognito" || !env.COGNITO_EMAIL_USER_POOL_ID || !env.COGNITO_EMAIL_CLIENT_ID)throw new Error("Cognito email authentication is disabled");
  const base=configuredCognito(env),pool=env.COGNITO_EMAIL_USER_POOL_ID;
  return {...base,issuer:`https://cognito-idp.${pool.split("_")[0]}.amazonaws.com/${pool}`,clientId:env.COGNITO_EMAIL_CLIENT_ID,region:pool.split("_")[0],userPoolId:pool};
}
