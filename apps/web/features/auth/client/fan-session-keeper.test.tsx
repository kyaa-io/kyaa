// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FanSessionKeeper } from "./fan-session-keeper";
import { clearFanSession, readFanSessionHint } from "./fan-session";

const fetcher = vi.fn();
afterEach(async () => { fetcher.mockResolvedValue(new Response(null, { status: 204 })); await clearFanSession(); vi.unstubAllGlobals(); vi.clearAllMocks(); localStorage.clear(); });

describe("FanSessionKeeper", () => {
  it("exchanges once after login sync when the first response arrives late", async () => {
    const ownerId = "did:privy:new";
    let finish!: (response: Response) => void;
    const first = new Promise<Response>((resolve) => { finish = resolve; });
    vi.stubGlobal("fetch", fetcher);
    fetcher.mockReturnValueOnce(first).mockResolvedValueOnce(Response.json({
      session: true, exp: Date.now() + 60000, authenticatedAt: Date.now(),
    }));
    const { unmount } = render(<FanSessionKeeper ownerId={ownerId} getPrivyAccessToken={async () => "privy"} />);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    window.dispatchEvent(new Event("kyaa:login-synchronized"));
    finish(Response.json({ session: false }));
    await vi.waitFor(() => expect(readFanSessionHint()?.pid).toBe(ownerId));
    expect(fetcher).toHaveBeenCalledTimes(2);
    unmount();
  });

  it("signs out once when the server says the account is unavailable, and sends no second request", async () => {
    vi.stubGlobal("fetch", fetcher);
    fetcher.mockImplementation(async () => Response.json({ error: { code: "FAN_ACCOUNT_UNAVAILABLE" } }, { status: 403 }));
    const signOut = vi.fn(async () => undefined);
    render(<FanSessionKeeper ownerId="did:privy:gone" getPrivyAccessToken={async () => "privy"} onAccountUnavailable={signOut} />);
    await vi.waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("does not sign out on a 503", async () => {
    vi.stubGlobal("fetch", fetcher);
    fetcher.mockImplementation(async () => new Response(null, { status: 503 }));
    const signOut = vi.fn(async () => undefined);
    render(<FanSessionKeeper ownerId="did:privy:ok" getPrivyAccessToken={async () => "privy"} onAccountUnavailable={signOut} />);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(signOut).not.toHaveBeenCalled();
  });
});
