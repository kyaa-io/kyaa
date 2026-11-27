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

  it("looks up shortcut permissions without synchronizing the login session", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ error: "FORBIDDEN" }, { status: 403 }));
    const { result } = renderHook(() => useOperatorChannels({ synchronizeSession: false }));
    await waitFor(() => expect(result.current.status).toBe("denied"));
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/operator/channels", expect.objectContaining({
      method: "GET",
      headers: { authorization: "Bearer privy-access-token" },
    }));
  });
});
