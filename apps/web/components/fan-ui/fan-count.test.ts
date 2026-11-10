import { describe, expect, it } from "vitest";

import { formatFanCount } from "./fan-count";

describe("formatFanCount", () => {
  it("writes Korean role text for ko and keeps the compact English form elsewhere", () => {
    expect(formatFanCount(28_200_000, "ko")).toBe("팬 2820만명");
    expect(formatFanCount(17_300, "ko")).toBe("팬 1.7만명");
    expect(formatFanCount(4_200, "ko")).toBe("팬 4.2천명");
    expect(formatFanCount(6_800_000, "en")).toBe("6.8M Fans");
    expect(formatFanCount(6_800_000)).toBe("6.8M Fans");
  });
  it("shows nothing for zero or invalid counts", () => {
    expect(formatFanCount(0, "ko")).toBeNull();
    expect(formatFanCount(0, "en")).toBeNull();
    expect(formatFanCount(-1, "ko")).toBeNull();
    expect(formatFanCount(Number.NaN, "ko")).toBeNull();
  });
});
