import { render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LocaleProvider } from "@/components/locale-provider";
import { useByUsSession } from "@/components/byus-session-provider";
import { useByUsAuth } from "./cognito-auth";
import { AuthRoot } from "./auth-root";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/login" }));
const context = { returnTo: "/live/kara-nualeaf", locale: "ko" as const, intent: "reserve", entity: null, authIntent: null };
const fetchMock = vi.fn();

function Monitor() {
  const session = useByUsSession();
  return <output data-testid="session">{JSON.stringify({ ready: session.ready, pending: session.pending, ownerId: session.ownerId, error: session.error })}</output>;
}
function SignedInStarter() {
  const auth = useByUsAuth(), session = useByUsSession();
  const ownerId = auth.ready && auth.authenticated ? auth.user?.id ?? null : null;
  useEffect(() => { if (ownerId) session.beginTransition({ ownerId, ...context }); }, [ownerId]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

beforeEach(() => { window.history.replaceState({}, "", "/login"); fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => vi.unstubAllGlobals());

it("signs in and synchronizes from kyaa's own session only, with no third-party request", async () => {
  fetchMock.mockImplementation(async (url: string) => String(url) === "/api/auth/cognito/session"
    ? Response.json({ authenticated: true, walletLinked: true, userId: "did:privy:member", accessToken: "kyaa-cognito:access", expiresAt: Date.now() + 600_000 })
    : Response.json({ profile: { completed: true } }));
  render(<LocaleProvider initialLocale="ko"><AuthRoot><Monitor /><SignedInStarter /></AuthRoot></LocaleProvider>);
  await waitFor(() => expect(JSON.parse(screen.getByTestId("session").textContent!)).toMatchObject({ ready: true, pending: false, ownerId: "did:privy:member", error: null }));
  const urls = fetchMock.mock.calls.map(([url]) => String(url));
  expect(urls).toEqual(["/api/auth/cognito/session", "/api/auth/session"]);
  expect(fetchMock.mock.calls[1]![1]).toMatchObject({ method: "POST", headers: expect.objectContaining({ authorization: "Bearer kyaa-cognito:access" }) });
});

it("stays signed out when the server has no session", async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
  render(<LocaleProvider initialLocale="ko"><AuthRoot><Monitor /><SignedInStarter /></AuthRoot></LocaleProvider>);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  expect(JSON.parse(screen.getByTestId("session").textContent!)).toMatchObject({ ownerId: null, pending: false });
});
