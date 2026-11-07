import { describe, expect, it } from "vitest";

import { formatFanCount, formatLocalizedFanCount } from "./fan-count";

describe("formatFanCount", () => {
  it("uses one shared compact English fan-count contract", () => {
    expect(formatFanCount(6_800_000)).toBe("6.8M Fans");
    expect(formatFanCount(0)).toBe("0 Fans");
  });
  it("writes the home card count like the group list: 팬 N in Korean, Fans N elsewhere", () => {
    expect(formatLocalizedFanCount("ko", 0)).toBe("팬 0");
    expect(formatLocalizedFanCount("ko", 1_280_000)).toBe("팬 128만");
    expect(formatLocalizedFanCount("en", 6_800_000)).toBe("Fans 6.8M");
    expect(formatLocalizedFanCount("ko", 0)).not.toContain("Fans");
  });
});
