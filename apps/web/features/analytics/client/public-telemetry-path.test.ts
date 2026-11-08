import { describe, expect, it } from "vitest";
import { isPublicTelemetryPath } from "./public-telemetry-path";

describe("public telemetry path boundary", () => {
  it.each(["/kyaa-wave-fanpage", "/kyaa-wave-fanpage/programs/live-insight", "/c/kyaa-wave-fanpage", "/c/kyaa-wave-fanpage/notices/hello", "/c/kyaa-wave-fanpage/leaderboard", "/c/kyaa-wave-fanpage/raffles/gift"])("excludes private WAVE route %s even with the creator page prop", (pathname) => {
    expect(isPublicTelemetryPath(pathname, "kyaa-wave-fanpage")).toBe(false);
  });
  it("allows a root handle only when supplied by the published creator page", () => {
    expect(isPublicTelemetryPath("/ifewknow")).toBe(false);
    expect(isPublicTelemetryPath("/ifewknow", "ifewknow")).toBe(true);
    expect(isPublicTelemetryPath("/login", "login")).toBe(false);
  });
  it.each(["/", "/celebrities", "/c/elina", "/c/elina/raffles/gift-1", "/c/elina/notices/hello", "/c/elina/leaderboard", "/live/calendar", "/benefits/gift", "/pages/us-fanmeetings"])("allows %s", (path) => {
    expect(isPublicTelemetryPath(path)).toBe(true);
  });
  it.each(["/admin", "/admin/fans", "/my", "/my/rewards/private/recipient", "/login", "/settings/kakao/callback", "/passports/user", "/stamps/user", "/notifications", "/onboarding/profile", "/c/elina/verify", "/c/elina/certifications/id", "/live/elina/missions", "/live/elina/survey", "/live/elina-rehearsal", "/c/test-creator", "/s/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "/unknown", "/c/elina%2Fmy"])("rejects %s", (path) => {
    expect(isPublicTelemetryPath(path)).toBe(false);
  });
});
