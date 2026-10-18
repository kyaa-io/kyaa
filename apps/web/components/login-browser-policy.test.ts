import { describe, expect, it } from "vitest";
import { requiresGoogleBrowserHandoff } from "./login-browser-policy";

describe("Google browser policy", () => {
  it.each(["Instagram 350.0", "KAKAOTALK 11.0", "[FBAN/FBIOS;FBAV/500.0]", "Mozilla/5.0 Line/15.0", "instagram"]) ("requires handoff for %s", (agent) => {
    expect(requiresGoogleBrowserHandoff(agent)).toBe(true);
  });
  it.each(["", "Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36", "Mozilla/5.0 Firefox/130.0", "Mozilla/5.0 Edg/130.0"]) ("keeps normal OAuth for %s", (agent) => {
    expect(requiresGoogleBrowserHandoff(agent)).toBe(false);
  });
});
