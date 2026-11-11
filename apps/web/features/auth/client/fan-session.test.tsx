import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearFanSession, FAN_SESSION_BEARER, readFanSessionHint, renewFanSession, withPrivyDeadline } from "./fan-session";

const hint = (pid = "did:privy:user-1", at = Date.now()) => localStorage.setItem("kyaa:fan-session", JSON.stringify({ pid, exp: Date.now() + 3600_000, at }));
const fetcher = vi.fn(async () => new Response(null, { status: 204 }));

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe("withPrivyDeadline", () => {
  it("answers with the cookie sentinel when Privy is slower than two seconds and a session exists", async () => {
    vi.useFakeTimers();
    hint();
    const token = withPrivyDeadline(() => new Promise(() => {}), "did:privy:user-1");
    await vi.advanceTimersByTimeAsync(2000);
    await expect(token).resolves.toBe(FAN_SESSION_BEARER);
  });

  it("waits for Privy as before without a session, or for a different user", async () => {
    vi.useFakeTimers();
    let release!: (value: string) => void;
    const slow = () => new Promise<string>((resolve) => { release = resolve; });
    const first = withPrivyDeadline(slow, "did:privy:user-1");
    await vi.advanceTimersByTimeAsync(5000);
    release("late-token");
    await expect(first).resolves.toBe("late-token");
    hint("did:privy:someone-else");
    const second = withPrivyDeadline(slow, "did:privy:user-1");
    await vi.advanceTimersByTimeAsync(5000);
    release("late-token-2");
    await expect(second).resolves.toBe("late-token-2");
  });

  it("returns Privy's token when it is on time", async () => {
    hint();
    await expect(withPrivyDeadline(async () => "privy-token", "did:privy:user-1")).resolves.toBe("privy-token");
  });
});

describe("renewFanSession", () => {
  it("renews at most every ten minutes and never with the sentinel or an email token", async () => {
    hint("did:privy:user-1", Date.now() - 60_000);
    renewFanSession("privy-token", "did:privy:user-1");
    renewFanSession(FAN_SESSION_BEARER, "did:privy:user-1");
    renewFanSession("kyaa-email:x", "did:privy:user-1");
    expect(fetcher).not.toHaveBeenCalled();
    hint("did:privy:user-1", Date.now() - 11 * 60_000);
    renewFanSession("privy-token", "did:privy:user-1");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("drops the session hint when the server refuses", async () => {
    hint("did:privy:user-1", 0);
    fetcher.mockResolvedValueOnce(new Response(null, { status: 403 }));
    renewFanSession("privy-token", "did:privy:user-1");
    await vi.waitFor(() => expect(readFanSessionHint()).toBeNull());
  });
});

