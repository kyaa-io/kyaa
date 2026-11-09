import { describe, expect, it } from "vitest";
import config from "../../../next.config";

// The island build swaps both path names together; one without the other would put the page outside PrivyProvider
// while its hooks still expect the direct tree (plan-b §7.3).
describe("island aliases", () => {
  it("point both backend path names at the island files", () => {
    expect(config.turbopack?.resolveAlias).toEqual(expect.objectContaining({
      "@/features/auth/client/privy-backend": "./features/auth/client/privy-backend.island.tsx",
      "@/features/auth/client/privy-root": "./features/auth/client/privy-root.island.tsx",
    }));
    expect(Object.keys(config.turbopack?.resolveAlias ?? {}).filter(key => key.includes("privy-"))).toHaveLength(2);
  });
});
