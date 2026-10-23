import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { runtimeEnvironment, isAwsHosting } from "./hosting";
import { parsePublicEnv } from "./env";
import { publicRuntimeConfig } from "./public-runtime-config";

afterEach(() => vi.unstubAllEnvs());
const aws = {
  HOSTING_PROVIDER: "aws", APP_ENV: "dev", APP_URL: "https://dev.example.com",
  PRIVY_APP_ID: "runtime-id", BYUS_DATA_ENVIRONMENT: "development",
  PRIVY_APP_ENVIRONMENT: "development", PRIVY_TEST_ACCOUNT_LOGIN_ENABLED: "true",
};
describe("hosting runtime configuration", () => {
  it("preserves the Vercel default and replaces build values only on AWS", () => {
    const legacy = { NEXT_PUBLIC_PRIVY_APP_ID: "legacy" };
    expect(isAwsHosting(legacy)).toBe(false);
    expect(runtimeEnvironment(legacy)).toBe(legacy);
    expect(parsePublicEnv({ ...aws, NEXT_PUBLIC_PRIVY_APP_ID: "build-id" }).NEXT_PUBLIC_PRIVY_APP_ID).toBe("runtime-id");
  });
  it.each(["staging", "prod", undefined])("rejects test login outside dev (%s)", (APP_ENV) => {
    expect(() => parsePublicEnv({ ...aws, APP_ENV })).toThrow();
  });
  it("rejects unknown hosting modes", () => {
    expect(() => parsePublicEnv({ ...aws, HOSTING_PROVIDER: "other" })).toThrow(/HOSTING_PROVIDER/);
  });
  it("allows only explicit public fields and changes values at runtime", () => {
    for (const [key, value] of Object.entries(aws)) vi.stubEnv(key, value);
    vi.stubEnv("PRIVY_APP_SECRET", "never-public");
    vi.stubEnv("WEB_PUSH_VAPID_PUBLIC_KEY", "vapid");
    expect(publicRuntimeConfig()).toEqual({ authProvider: "privy", privyAppId: "runtime-id", appleLoginEnabled: false, testAccountLoginEnabled: true, webPushVapidPublicKey: "vapid" });
    vi.stubEnv("PRIVY_APP_ID", "promoted-id");
    vi.stubEnv("APP_ENV", "prod");
    expect(publicRuntimeConfig()).toMatchObject({ privyAppId: "promoted-id", testAccountLoginEnabled: false });
  });
});
