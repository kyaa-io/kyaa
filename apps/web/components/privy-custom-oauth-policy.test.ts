import { afterEach, describe, expect, it, vi } from "vitest";
import { isEnabledCustomOAuthProvider, isEnabledRegionalSocialAccount, readPrivyCustomOAuthPolicy, REGIONAL_SOCIAL_PROVIDER_IDS, REGIONAL_SOCIAL_PROVIDERS } from "./privy-custom-oauth-policy";

afterEach(() => vi.unstubAllEnvs());
describe("custom OAuth policy", () => {
  it("defaults off and rejects arbitrary providers", () => {
    expect(readPrivyCustomOAuthPolicy()).toEqual({ kakaoLoginEnabled: false, wechatLoginEnabled: false, lineLoginEnabled: false, facebookLoginEnabled: false, naverLoginEnabled: false });
    expect(isEnabledCustomOAuthProvider("custom:other", { kakaoLoginEnabled: true, wechatLoginEnabled: true })).toBe(false);
  });
  it("maps AWS runtime flags without build-time public values", () => {
    vi.stubEnv("HOSTING_PROVIDER", "aws"); vi.stubEnv("PRIVY_KAKAO_LOGIN_ENABLED", "true");
    expect(readPrivyCustomOAuthPolicy().kakaoLoginEnabled).toBe(true);
    vi.stubEnv("AUTH_PROVIDER", "cognito");
    expect(readPrivyCustomOAuthPolicy().kakaoLoginEnabled).toBe(false);
  });
});


it.each(REGIONAL_SOCIAL_PROVIDER_IDS)("maps only enabled %s SDK and linked account identifiers", (provider) => {
  const entry = REGIONAL_SOCIAL_PROVIDERS[provider];
  const policy = { [entry.policyKey]: true };
  expect(isEnabledCustomOAuthProvider(provider, policy)).toBe(true);
  expect(isEnabledRegionalSocialAccount(entry.accountType, policy)).toBe(true);
  expect(isEnabledCustomOAuthProvider(provider, {})).toBe(false);
  expect(isEnabledRegionalSocialAccount(entry.accountType, {})).toBe(false);
  if (provider === "line") {
    expect(isEnabledRegionalSocialAccount("custom:line", policy)).toBe(false);
    expect(isEnabledRegionalSocialAccount("line", policy)).toBe(false);
  }
});

it("keeps all requested methods off under Cognito even when every flag is on", () => {
  for (const entry of Object.values(REGIONAL_SOCIAL_PROVIDERS)) {
    vi.stubEnv(`NEXT_PUBLIC_PRIVY_${entry.flag}_LOGIN_ENABLED`, "true");
    vi.stubEnv(`PRIVY_${entry.flag}_LOGIN_ENABLED`, "true");
  }
  vi.stubEnv("AUTH_PROVIDER", "cognito");
  expect(Object.values(readPrivyCustomOAuthPolicy()).every((enabled) => !enabled)).toBe(true);
  expect(Object.values(readPrivyCustomOAuthPolicy(false)).every((enabled) => !enabled)).toBe(true);
});
