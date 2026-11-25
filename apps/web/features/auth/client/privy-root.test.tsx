import { act, render } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { ByUsAuth } from "./auth-fallback";
const sdk = vi.hoisted(() => ({ ready: true, authenticated: true, user: { id: "did:privy:fan", linkedAccounts: [] }, getAccessToken: vi.fn(async () => "privy"), logout: vi.fn(async () => {}) }));
vi.mock("@/components/locale-provider", () => ({ useAppLocale: () => ({ locale: "ko" }) }));
const oauth = vi.hoisted(() => ({ callbacks: undefined as { onError(code: string): void } | undefined }));
vi.mock("./privy-backend.island", () => ({ AuthBootProvider: ({ children }: { children: ReactNode }) => children, usePrivy: () => sdk, useUser: () => ({ refreshUser: vi.fn() }), useCreateWallet: () => ({ createWallet: vi.fn() }), useLogin: () => ({ login: vi.fn() }), useLoginWithOAuth: (callbacks: typeof oauth.callbacks) => { oauth.callbacks = callbacks; return { initOAuth: vi.fn(), loading: false }; } }));
vi.mock("@/features/auth/client/privy-provider-boundary", () => ({ IslandPrivyProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock("./privy-mirrors", () => ({ PrivyMirrors: () => null }));
vi.mock("./privy-avatar-session-bridge", () => ({ PrivyAvatarSessionBridge: ({ children }: { children: ReactNode }) => children }));
vi.mock("./fan-session-keeper", () => ({ FanSessionKeeper: () => null }));
import Root from "./privy-root.island";
import { useByUsAuth } from "./cognito-auth";
import { usePrivyBridge } from "./privy-bridge";
let bridge: ReturnType<typeof usePrivyBridge>;
let auth: ByUsAuth;
function Consumer() { auth = useByUsAuth(); bridge = usePrivyBridge(); return null; }
const mount = () => render(<Root appId="app" appleLoginEnabled={false} testAccountLoginEnabled={false}><Consumer /></Root>);
const hint = (pid = sdk.user.id) => localStorage.setItem("kyaa:fan-session", JSON.stringify({ pid, exp: Date.now() + 3600_000, at: Date.now() }));
beforeEach(() => { localStorage.clear(); sdk.getAccessToken.mockClear(); });
it("preserves the original getter when there is no session hint", () => { mount(); expect(auth.getAccessToken).toBe(sdk.getAccessToken); expect(auth.getPrivyAccessToken).toBe(sdk.getAccessToken); });
it("returns the cookie marker immediately without asking Privy", async () => { hint(); mount(); await expect(auth.getAccessToken()).resolves.toBe("kyaa-session"); expect(sdk.getAccessToken).not.toHaveBeenCalled(); await expect(auth.getPrivyAccessToken()).resolves.toBe("privy"); });
it("ignores another account's hint", () => { hint("did:privy:someone-else"); mount(); expect(auth.getAccessToken).toBe(sdk.getAccessToken); });
it("updates the getter after the keeper issues a hint", async () => { mount(); act(() => { hint(); window.dispatchEvent(new Event("kyaa:fan-session-changed")); }); await expect(auth.getAccessToken()).resolves.toBe("kyaa-session"); expect(sdk.getAccessToken).not.toHaveBeenCalled(); });

it("distinguishes explicit login cancellation from provider failures", () => {
  mount();
  const onError = vi.fn();
  const unsubscribe = bridge!.subscribeOAuth({ onComplete: vi.fn(), onError });
  oauth.callbacks!.onError("exited_auth_flow");
  oauth.callbacks!.onError("oauth_user_denied");
  oauth.callbacks!.onError("oauth_unexpected");
  expect(onError.mock.calls).toEqual([["cancelled"], ["cancelled"], ["provider_error"]]);
  unsubscribe();
});

it("reports email sign-in only when the Privy app has it switched on, and treats a failed lookup as off", async () => {
  const answers: Record<string, Response | Error> = { "on-app": Response.json({ email_auth: true }), "off-app": Response.json({ email_auth: false }), "down-app": new Error("offline"), "denied-app": new Response(null, { status: 403 }) };
  const fetchMock = vi.fn(async (url: string) => { const answer = answers[new URL(url).pathname.split("/").at(-1)!]!; if (answer instanceof Error) throw answer; return answer; });
  vi.stubGlobal("fetch", fetchMock);
  try {
    const results: Record<string, boolean> = {};
    for (const appId of Object.keys(answers)) {
      render(<Root appId={appId} appleLoginEnabled={false} testAccountLoginEnabled={false}><Consumer /></Root>);
      results[appId] = await bridge!.emailLoginAvailable();
      await bridge!.emailLoginAvailable();
    }
    expect(results).toEqual({ "on-app": true, "off-app": false, "down-app": false, "denied-app": false });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock).toHaveBeenCalledWith("https://auth.privy.io/api/v1/apps/on-app", { headers: { "privy-app-id": "on-app" } });
  } finally { vi.unstubAllGlobals(); }
});
