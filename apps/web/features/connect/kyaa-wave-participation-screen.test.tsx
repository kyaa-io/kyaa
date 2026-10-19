import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";
import { participationCopy } from "./kyaa-wave-participation-copy";
import { KyaaWaveParticipationScreen } from "./kyaa-wave-participation-screen";

const { auth, session, navigation } = vi.hoisted(() => ({
  auth: { ready: true, authenticated: true, user: { id: "owner" }, getAccessToken: vi.fn(async () => "token") },
  session: { ready: true, ownerId: "owner" as string | null, generation: 0 },
  navigation: { params: new URLSearchParams("code=ABCD2345&locale=ko"), replace: vi.fn() },
}));
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => auth }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => session }));
vi.mock("@/components/locale-provider", () => ({ usePageLocale: () => navigation.params.get("locale") ?? "ko" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => navigation.params, useRouter: () => navigation }));
vi.mock("@/components/fan-shell/focus-flow-frame", () => ({ FocusFlowFrame: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
const fetchMock = vi.fn();
const receipt = { id: "10000000-0000-4000-8000-000000000001", createdAt: "2026-10-22T10:00:00Z" };
const t = participationCopy.ko;
const ready = async () => { await screen.findByRole("heading", { name: t.confirm }); fireEvent.click(screen.getByRole("button", { name: t.start })); };
const enterName = (name = "김참여") => fireEvent.change(screen.getByLabelText(t.name), { target: { value: name } });
beforeEach(() => {
  auth.ready = true; auth.authenticated = true; auth.user = { id: "owner" }; auth.getAccessToken.mockReset().mockResolvedValue("token");
  session.ready = true; session.ownerId = "owner"; session.generation = 0;
  navigation.params = new URLSearchParams("code=ABCD2345&locale=ko"); navigation.replace.mockClear();
  fetchMock.mockReset().mockImplementation(async () => Response.json({ participation: null })); vi.stubGlobal("fetch", fetchMock);
});

describe("kyaa wave participation", () => {
  it("keeps a separate confirmation step and saves the private name only in the POST", async () => {
    render(<KyaaWaveParticipationScreen />);
    await screen.findByRole("heading", { name: t.confirm });
    expect(screen.queryByLabelText(t.name)).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: t.start }));
    expect(screen.getByText(t.privacy)).toBeInTheDocument(); enterName();
    fetchMock.mockResolvedValueOnce(Response.json({ participation: receipt }));
    fireEvent.click(screen.getByRole("button", { name: t.save }));
    await screen.findByRole("heading", { name: t.done });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "POST", body: JSON.stringify({ code: "ABCD2345", name: "김참여" }) });
    expect(fetchMock.mock.calls[1][1].headers["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(screen.getByRole("link", { name: t.home })).toHaveAttribute("href", "/?locale=ko");
    expect(screen.queryByDisplayValue("김참여")).not.toBeInTheDocument();
  });
  it("shows an existing receipt without needing a code or name", async () => {
    navigation.params = new URLSearchParams("locale=ko");
    fetchMock.mockResolvedValueOnce(Response.json({ participation: receipt }));
    render(<KyaaWaveParticipationScreen />);
    await screen.findByRole("heading", { name: t.done });
    expect(screen.queryByLabelText(t.name)).not.toBeInTheDocument(); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("waits while the session belongs to another SDK account", async () => {
    session.ownerId = "previous-owner";
    const { rerender } = render(<KyaaWaveParticipationScreen />);
    expect(screen.getByRole("status")).toHaveTextContent(t.loading); expect(fetchMock).not.toHaveBeenCalled(); expect(navigation.replace).not.toHaveBeenCalled();
    session.ownerId = "owner"; rerender(<KyaaWaveParticipationScreen />);
    await screen.findByRole("heading", { name: t.confirm });
  });
  it("reads a directly revisited signed-in session without an active owner transition", async () => {
    session.ownerId = null;
    render(<KyaaWaveParticipationScreen />);
    await screen.findByRole("heading", { name: t.confirm });
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(navigation.replace).not.toHaveBeenCalled();
  });
  it("waits for SDK readiness even when an authenticated user and no session owner exist", async () => {
    auth.ready = false; session.ownerId = null;
    const { rerender } = render(<KyaaWaveParticipationScreen />);
    expect(screen.getByRole("status")).toHaveTextContent(t.loading); expect(fetchMock).not.toHaveBeenCalled();
    auth.ready = true; rerender(<KyaaWaveParticipationScreen />);
    await screen.findByRole("heading", { name: t.confirm });
  });
  it("preserves QR code and locale through the existing login route", async () => {
    auth.authenticated = false; session.ownerId = null; navigation.params = new URLSearchParams("code=abcd-2345&locale=ja");
    render(<KyaaWaveParticipationScreen />);
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledTimes(1));
    const url = new URL(navigation.replace.mock.calls[0][0], "https://byus.local");
    expect(url.pathname).toBe("/login"); expect(url.searchParams.get("locale")).toBe("ja");
    expect(url.searchParams.get("returnTo")).toBe("/connect/kyaa-wave/participate?code=ABCD2345&locale=ja"); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("accepts a manual code before the same login branch", async () => {
    auth.authenticated = false; session.ownerId = null; navigation.params = new URLSearchParams("locale=ko");
    render(<KyaaWaveParticipationScreen />);
    expect(navigation.replace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: t.login })); expect(screen.getByRole("alert")).toHaveTextContent(t.invalidCode);
    fireEvent.change(screen.getByLabelText(t.code), { target: { value: "abcd-2345" } });
    fireEvent.click(screen.getByRole("button", { name: t.login })); expect(navigation.replace).toHaveBeenCalledTimes(1);
  });
  it("preserves a name after invalid code and uses a new key when the payload changes", async () => {
    render(<KyaaWaveParticipationScreen />); await ready(); enterName();
    fetchMock.mockResolvedValueOnce(Response.json({ error: { code: "PARTICIPATION_CODE_INVALID" } }, { status: 400 }));
    fireEvent.click(screen.getByRole("button", { name: t.save }));
    await screen.findByRole("alert"); expect(screen.getByLabelText(t.name)).toHaveValue("김참여"); expect(screen.getByLabelText(t.code)).toHaveAttribute("aria-invalid", "true");
    const key = fetchMock.mock.calls[1][1].headers["Idempotency-Key"];
    fireEvent.change(screen.getByLabelText(t.code), { target: { value: "ABCD2346" } }); fetchMock.mockResolvedValueOnce(Response.json({ participation: receipt }));
    fireEvent.click(screen.getByRole("button", { name: t.save })); await screen.findByRole("heading", { name: t.done });
    expect(fetchMock.mock.calls[2][1].headers["Idempotency-Key"]).not.toBe(key);
  });
  it("reuses the key on an unchanged network retry and blocks duplicate clicks", async () => {
    render(<KyaaWaveParticipationScreen />); await ready(); enterName();
    fetchMock.mockRejectedValueOnce(new TypeError("network")); const button = screen.getByRole("button", { name: t.save });
    fireEvent.click(button); fireEvent.click(button); await screen.findByRole("alert");
    expect(fetchMock).toHaveBeenCalledTimes(2); const key = fetchMock.mock.calls[1][1].headers["Idempotency-Key"];
    expect(screen.getByLabelText(t.name)).toHaveValue("김참여");
    fetchMock.mockResolvedValueOnce(Response.json({ participation: receipt })); fireEvent.click(screen.getByRole("button", { name: t.save }));
    await screen.findByRole("heading", { name: t.done }); expect(fetchMock.mock.calls[2][1].headers["Idempotency-Key"]).toBe(key);
  });
  it("does not send an old account submission after its token promise resolves", async () => {
    const { rerender } = render(<KyaaWaveParticipationScreen />); await ready(); enterName();
    let resolveToken!: (value: string) => void;
    auth.getAccessToken.mockReturnValueOnce(new Promise<string>(resolve => { resolveToken = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: t.save }));
    await waitFor(() => expect(auth.getAccessToken).toHaveBeenCalledTimes(2));
    auth.user = { id: "other" }; session.ownerId = "other"; session.generation++; rerender(<KyaaWaveParticipationScreen />);
    await screen.findByRole("heading", { name: t.confirm });
    await act(async () => resolveToken("old-token"));
    expect(fetchMock.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: t.start })); expect(screen.getByLabelText(t.name)).toHaveValue("");
  });
  it("ignores a late receipt from a previous account", async () => {
    let finish!: (value: Response) => void; fetchMock.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const { rerender } = render(<KyaaWaveParticipationScreen />); await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    auth.user = { id: "other" }; session.ownerId = "other"; session.generation++; rerender(<KyaaWaveParticipationScreen />);
    await screen.findByRole("heading", { name: t.confirm }); await act(async () => finish(Response.json({ participation: receipt })));
    expect(screen.queryByRole("heading", { name: t.done })).not.toBeInTheDocument();
  });
  it.each([
    ["PARTICIPATION_CLOSED", 410, t.closed],
    ["PARTICIPATION_RATE_LIMITED", 429, t.limited],
    ["PARTICIPATION_UNAVAILABLE", 503, t.unavailable],
  ])("shows a recoverable %s error without clearing the name", async (code, status, message) => {
    render(<KyaaWaveParticipationScreen />); await ready(); enterName();
    fetchMock.mockResolvedValueOnce(Response.json({ error: { code } }, { status: Number(status) }));
    fireEvent.click(screen.getByRole("button", { name: t.save }));
    expect(await screen.findByRole("alert")).toHaveTextContent(String(message));
    expect(screen.getByLabelText(t.name)).toHaveValue("김참여"); expect(screen.getByRole("button", { name: t.save })).toBeEnabled();
  });
  it("waits for SDK readiness before taking the guest login branch", async () => {
    auth.ready = false; auth.authenticated = false; session.ownerId = null;
    const { rerender } = render(<KyaaWaveParticipationScreen />);
    expect(navigation.replace).not.toHaveBeenCalled(); expect(screen.getByRole("status")).toHaveTextContent(t.loading);
    auth.ready = true; rerender(<KyaaWaveParticipationScreen />);
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledTimes(1));
  });
  it("rejects an empty name accessibly without sending a mutation", async () => {
    render(<KyaaWaveParticipationScreen />); await ready();
    fireEvent.click(screen.getByRole("button", { name: t.save }));
    expect(screen.getByRole("alert")).toHaveTextContent(t.invalidName);
    expect(screen.getByLabelText(t.name)).toHaveAttribute("aria-invalid", "true"); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("has complete copy for all supported locales", () => {
    for (const locale of APP_LOCALES) {
      expect(Object.keys(participationCopy[locale])).toHaveLength(24);
      for (const value of Object.values(participationCopy[locale])) expect(typeof value === "string" && value.trim().length > 0).toBe(true);
    }
  });
});
