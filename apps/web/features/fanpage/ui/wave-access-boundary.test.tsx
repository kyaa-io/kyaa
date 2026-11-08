import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";
const state = vi.hoisted(() => ({ ready: true, authenticated: false, status: "ready", sessionReady: true, path: "/kyaa-wave-fanpage", replace: vi.fn(), query: "locale=ko&tab=friends", participation: null as null | { id: string; createdAt: string; displayName?: string } }));
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => state }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => ({ ready: state.sessionReady }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: state.replace }), usePathname: () => state.path, useSearchParams: () => new URLSearchParams(state.query) }));
vi.mock("@/components/fan-shell/fan-app-shell", () => ({ FanAppFrame: ({ children }: { children: React.ReactNode }) => <>{children}</>, FanContentContainer: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock("./use-fanpage-resource", () => ({ useFanpageResource: () => ({ state: { status: state.status, data: { participation: state.participation } }, retry: vi.fn() }) }));
import { WaveAccessBoundary, useWaveParticipantName } from "./wave-access-boundary";
afterEach(cleanup);
beforeEach(() => { state.ready = true; state.authenticated = false; state.status = "ready"; state.participation = null; state.sessionReady = true; state.path = "/kyaa-wave-fanpage"; state.query = "locale=ko&tab=friends"; state.replace.mockClear(); });
const mount = () => render(<WaveAccessBoundary locale="ko"><div>PRIVATE CONTENT</div></WaveAccessBoundary>);
describe("Wave entry boundary", () => {
  it.each(APP_LOCALES)("keeps guest content unmounted in %s", locale => {
    render(<WaveAccessBoundary locale={locale}><div>PRIVATE CONTENT</div></WaveAccessBoundary>);
    expect(screen.queryByText("PRIVATE CONTENT")).toBeNull();
    const login = new URL(screen.getByRole("link").getAttribute("href")!, "https://kyaa.test");
    expect(login.pathname).toBe("/login");
    const checkin = new URL(login.searchParams.get("returnTo")!, login.origin);
    expect(checkin.pathname).toBe("/connect/kyaa-wave/participate");
    expect(checkin.searchParams.get("returnTo")).toBe("/kyaa-wave-fanpage?locale=ko&tab=friends");
    expect(state.replace).toHaveBeenCalledWith(login.pathname + login.search);
  });
  it("requires check-in after authentication", () => {
    state.authenticated = true; mount();
    expect(screen.queryByText("PRIVATE CONTENT")).toBeNull();
    expect(screen.getByRole("link").getAttribute("href")).toContain("/connect/kyaa-wave/participate?");
    expect(state.replace).toHaveBeenCalledWith(screen.getByRole("link").getAttribute("href"));
  });
  it.each(["loading", "error"])("fails closed while %s", status => {
    state.authenticated = true; state.status = status; mount();
    expect(screen.queryByText("PRIVATE CONTENT")).toBeNull();
    expect(screen.getByRole(status === "error" ? "alert" : "status")).toBeTruthy();
  });
  it("removes content when the current owner loses access", () => {
    state.authenticated = true; state.participation = { id: "receipt", createdAt: "2026-10-22T00:00:00Z" };
    const view = mount(); expect(screen.getByText("PRIVATE CONTENT")).toBeTruthy();
    state.status = "loading";
    view.rerender(<WaveAccessBoundary locale="ko"><div>PRIVATE CONTENT</div></WaveAccessBoundary>);
    expect(screen.queryByText("PRIVATE CONTENT")).toBeNull();
  });
});

it("waits for session restoration before redirecting", () => {
  state.sessionReady = false; mount(); expect(state.replace).not.toHaveBeenCalled();
});
it("preserves a QR code through login and removes it from the final fanpage URL", () => {
  state.query = "locale=ko&code=ABCD2345"; mount();
  const login = new URL(state.replace.mock.calls[0][0], "https://kyaa.test");
  const checkin = new URL(login.searchParams.get("returnTo")!, login.origin);
  expect(checkin.searchParams.get("code")).toBe("ABCD2345");
  expect(checkin.searchParams.get("returnTo")).toBe("/kyaa-wave-fanpage?locale=ko");
});

it("provides the check-in name only inside an authorized Wave boundary", () => {
  function Viewer() { return <span>{useWaveParticipantName() ?? "NO WAVE NAME"}</span>; }
  state.authenticated = true;
  state.participation = { id: "receipt", createdAt: "2026-10-22T00:00:00Z", displayName: "김보석" };
  const view = render(<WaveAccessBoundary locale="ko"><Viewer /></WaveAccessBoundary>);
  expect(screen.getByText("김보석")).toBeInTheDocument();
  state.status = "loading";
  view.rerender(<WaveAccessBoundary locale="ko"><Viewer /></WaveAccessBoundary>);
  expect(screen.queryByText("김보석")).not.toBeInTheDocument();
  view.rerender(<Viewer />);
  expect(screen.getByText("NO WAVE NAME")).toBeInTheDocument();
});

it.each([
  ["/login", "returnTo=%2Fconnect%2Fkyaa-wave%2Fparticipate%3Flocale%3Dko%26returnTo%3D%252Fkyaa-wave-fanpage"],
  ["/benefits/abc", "locale=ko"],
])("does not redirect again while %s is open as an overlay over the page", (path, query) => {
  state.path = path; state.query = query; mount();
  expect(state.replace).not.toHaveBeenCalled();
});

it("never wraps the login address into its own return path", () => {
  state.path = "/login"; state.query = "returnTo=%2Fkyaa-wave-fanpage"; mount();
  expect(new URL(screen.getByRole("link").getAttribute("href")!, "https://kyaa.test").searchParams.get("returnTo")).not.toContain("login");
});

it("sends a guest to login once and returns to the page it left", () => {
  state.query = ""; mount();
  const login = new URL(state.replace.mock.calls[0][0], "https://kyaa.test");
  const checkin = new URL(login.searchParams.get("returnTo")!, login.origin);
  expect(state.replace).toHaveBeenCalledTimes(1);
  // login → check-in → page is the only chain: two return paths in all, and /login is never one of them.
  expect(decodeURIComponent(decodeURIComponent(login.search)).match(/returnTo=/g)).toHaveLength(2);
  expect(decodeURIComponent(decodeURIComponent(login.search))).not.toMatch(/returnTo=[^&]*login/);
  expect(login.searchParams.getAll("returnTo")).toHaveLength(1);
  expect(checkin.pathname).toBe("/connect/kyaa-wave/participate");
  expect(checkin.searchParams.get("returnTo")).toBe("/kyaa-wave-fanpage");
});
