import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOperatorChannels } from "./use-operator-channels";

const getAccessToken = vi.fn();
const getPrivyAccessToken = vi.fn();

vi.mock("@/features/auth/client/auth-fallback", () => ({
  usePrivy: () => ({ ready: true, authenticated: true, user: { id: "operator-1" }, getAccessToken, getPrivyAccessToken }),
}));

describe("useOperatorChannels", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    getAccessToken.mockResolvedValue("kyaa-session");
    getPrivyAccessToken.mockResolvedValue("privy-access-token");
  });

  it("asks the operator gate with a Privy token, never the own-session sentinel", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json({ kind: "operator", role: "operator", celebrities: [] }));
    const { result } = renderHook(() => useOperatorChannels());
    await waitFor(() => expect(result.current.status).toBe("authorized"));
    expect(fetchMock.mock.calls.map((call) => (call[1] as RequestInit).headers)).toEqual([{ authorization: "Bearer privy-access-token" }, { authorization: "Bearer privy-access-token" }]);
    expect(getAccessToken).not.toHaveBeenCalled();
  });
});
