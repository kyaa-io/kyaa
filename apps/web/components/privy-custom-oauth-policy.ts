import { runtimeEnvironment } from "../server/config/hosting";

export const REGIONAL_SOCIAL_PROVIDERS = {
  "custom:kakao": { accountType: "custom:kakao", flag: "KAKAO", policyKey: "kakaoLoginEnabled", analytics: "kakao", secondary: false },
  "custom:wechat": { accountType: "custom:wechat", flag: "WECHAT", policyKey: "wechatLoginEnabled", analytics: "wechat", secondary: false },
  line: { accountType: "line_oauth", flag: "LINE", policyKey: "lineLoginEnabled", analytics: "line", secondary: true },
  "custom:facebook": { accountType: "custom:facebook", flag: "FACEBOOK", policyKey: "facebookLoginEnabled", analytics: "facebook", secondary: true },
  "custom:naver": { accountType: "custom:naver", flag: "NAVER", policyKey: "naverLoginEnabled", analytics: "naver", secondary: true },
} as const;

export type CustomOAuthProvider = keyof typeof REGIONAL_SOCIAL_PROVIDERS;
export const REGIONAL_SOCIAL_PROVIDER_IDS = Object.keys(REGIONAL_SOCIAL_PROVIDERS) as CustomOAuthProvider[];
export type CustomOAuthPolicy = Partial<Record<(typeof REGIONAL_SOCIAL_PROVIDERS)[CustomOAuthProvider]["policyKey"], boolean>>;

export function readPrivyCustomOAuthPolicy(publicValues = true): CustomOAuthPolicy {
  const source = runtimeEnvironment();
  const prefix = publicValues ? "NEXT_PUBLIC_" : "";
  const enabled = source.AUTH_PROVIDER !== "cognito";
  return Object.fromEntries(REGIONAL_SOCIAL_PROVIDER_IDS.map((provider) => {
    const entry = REGIONAL_SOCIAL_PROVIDERS[provider];
    return [entry.policyKey, enabled && source[`${prefix}PRIVY_${entry.flag}_LOGIN_ENABLED`] === "true"];
  }));
}

export function isEnabledCustomOAuthProvider(provider: string, policy: CustomOAuthPolicy): provider is CustomOAuthProvider {
  return REGIONAL_SOCIAL_PROVIDER_IDS.some((id) => id === provider && policy[REGIONAL_SOCIAL_PROVIDERS[id].policyKey] === true);
}

export function isEnabledRegionalSocialAccount(accountType: string, policy: CustomOAuthPolicy): boolean {
  return REGIONAL_SOCIAL_PROVIDER_IDS.some((id) => REGIONAL_SOCIAL_PROVIDERS[id].accountType === accountType && policy[REGIONAL_SOCIAL_PROVIDERS[id].policyKey] === true);
}
