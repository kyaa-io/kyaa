import { afterEach, describe, expect, it, vi } from "vitest";
import { isEnabledCustomOAuthProvider, readPrivyCustomOAuthPolicy } from "./privy-custom-oauth-policy";

afterEach(() => vi.unstubAllEnvs());
describe("custom OAuth policy", () => {
  it("defaults off and rejects arbitrary providers", () => {
    expect(readPrivyCustomOAuthPolicy()).toEqual({ kakaoLoginEnabled: false, wechatLoginEnabled: false });
    expect(isEnabledCustomOAuthProvider("custom:other", { kakaoLoginEnabled: true, wechatLoginEnabled: true })).toBe(false);
  });
  it("maps AWS runtime flags without build-time public values", () => {
    vi.stubEnv("HOSTING_PROVIDER", "aws"); vi.stubEnv("PRIVY_KAKAO_LOGIN_ENABLED", "true");
    expect(readPrivyCustomOAuthPolicy().kakaoLoginEnabled).toBe(true);
    vi.stubEnv("AUTH_PROVIDER", "cognito");
    expect(readPrivyCustomOAuthPolicy().kakaoLoginEnabled).toBe(false);
  });
});
