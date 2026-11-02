import { runtimeEnvironment } from "../server/config/hosting";

export type CustomOAuthProvider = "custom:kakao" | "custom:wechat";
export interface CustomOAuthPolicy { kakaoLoginEnabled?: boolean; wechatLoginEnabled?: boolean }

export function readPrivyCustomOAuthPolicy(publicValues = true): CustomOAuthPolicy {
  const source = runtimeEnvironment();
  const prefix = publicValues ? "NEXT_PUBLIC_" : "";
  const enabled = source.AUTH_PROVIDER !== "cognito";
  return {
    kakaoLoginEnabled: enabled && source[`${prefix}PRIVY_KAKAO_LOGIN_ENABLED`] === "true",
    wechatLoginEnabled: enabled && source[`${prefix}PRIVY_WECHAT_LOGIN_ENABLED`] === "true",
  };
}

export function isEnabledCustomOAuthProvider(type: string, policy: CustomOAuthPolicy): type is CustomOAuthProvider {
  return (type === "custom:kakao" && policy.kakaoLoginEnabled === true)
    || (type === "custom:wechat" && policy.wechatLoginEnabled === true);
}
