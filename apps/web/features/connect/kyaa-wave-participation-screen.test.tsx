import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";
import { participationCopy, participationScannerCopy } from "./kyaa-wave-participation-copy";
import { KyaaWaveParticipationScreen } from "./kyaa-wave-participation-screen";

const { auth, session, navigation } = vi.hoisted(() => ({
  auth: { ready: true, authenticated: true, user: { id: "owner" }, getAccessToken: vi.fn(async () => "token") },
  session: { ready: true, ownerId: "owner" as string | null, generation: 0 },
  navigation: { params: new URLSearchParams("code=ABCD23&locale=ko"), replace: vi.fn() },
}));
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => auth }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => session }));
vi.mock("@/components/locale-provider", () => ({ usePageLocale: () => navigation.params.get("locale") ?? "ko" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => navigation.params, useRouter: () => navigation }));
vi.mock("@/components/fan-shell/focus-flow-frame", () => ({ FocusFlowFrame: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("./kyaa-wave-participation-scanner", () => ({ ParticipationScanner: ({ onScan }: { onScan: (code: string) => void }) => <button type="button" onClick={() => onScan("ABC234")}>decode-test-qr</button> }));
const fetchMock = vi.fn();
const receipt = { id: "10000000-0000-4000-8000-000000000001", createdAt: "2026-10-22T10:00:00Z" };
const t = participationCopy.ko;
const ready = async () => { await screen.findByRole("heading", { name: t.nameTitle }); };
const enterName = (name = "김참여") => fireEvent.change(screen.getByLabelText(t.name), { target: { value: name } });
beforeEach(() => {
  auth.ready = true; auth.authenticated = true; auth.user = { id: "owner" }; auth.getAccessToken.mockReset().mockResolvedValue("token");
  session.ready = true; session.ownerId = "owner"; session.generation = 0;
  navigation.params = new URLSearchParams("code=ABCD23&locale=ko"); navigation.replace.mockClear();
  fetchMock.mockReset().mockImplementation(async () => Response.json({ participation: null })); vi.stubGlobal("fetch", fetchMock);
});

describe("kyaa wave participation", () => {
  it("fills a scanned code, closes scanning and focuses the code field", async () => {
    render(<KyaaWaveParticipationScreen />); await ready();
    fireEvent.click(screen.getByRole("button", { name: participationScannerCopy.ko.scan }));
    fireEvent.click(screen.getByRole("button", { name: "decode-test-qr" }));
    expect(screen.getByLabelText(t.code)).toHaveValue("ABC234");
    expect(screen.getByLabelText(t.code)).toHaveFocus();
    expect(screen.queryByRole("button", { name: "decode-test-qr" })).not.toBeInTheDocument();
  });
  it("can close scanning and replace a legacy code with manual input", async () => {
    navigation.params = new URLSearchParams("code=ABCD2345&locale=ko");
    render(<KyaaWaveParticipationScreen />); await ready();
    fireEvent.click(screen.getByRole("button", { name: participationScannerCopy.ko.scan }));
    fireEvent.click(screen.getByRole("button", { name: participationScannerCopy.ko.close }));
    expect(screen.queryByRole("button", { name: "decode-test-qr" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: participationScannerCopy.ko.manual }));
    const input = screen.getByLabelText(t.code);
    expect(input).toHaveValue(""); expect(input).not.toHaveAttribute("readonly"); expect(input).toHaveFocus();
  });
  it.each(APP_LOCALES)("provides scanner copy in %s", locale => {
    expect(Object.values(participationScannerCopy[locale]).every(value => typeof value === "string" && value.length > 0)).toBe(true);
  });
  it("normalizes manual input to uppercase six characters without hyphens", async () => {
    navigation.params = new URLSearchParams("locale=ko");
    render(<KyaaWaveParticipationScreen />); await ready();
    const input = screen.getByLabelText(t.code);
    expect(input).toHaveAttribute("maxlength", "6");
    fireEvent.change(input, { target: { value: "ab-cd2345" } });
    expect(input).toHaveValue("ABCD23");
  });
  it("preserves legacy printed QR codes and lets users switch to manual input", async () => {
    navigation.params = new URLSearchParams("code=ABCD2345&locale=ko");
    render(<KyaaWaveParticipationScreen />); await ready(); enterName();
    expect(screen.getByLabelText(t.code)).toHaveValue("ABCD2345");
    expect(screen.getByLabelText(t.code)).toHaveAttribute("readonly");
    fetchMock.mockResolvedValueOnce(Response.json({ participation: receipt }));
    fireEvent.click(screen.getByRole("button", { name: t.save }));
    await screen.findByRole("heading", { name: t.done });
    expect(fetchMock.mock.calls[1][1].body).toBe(JSON.stringify({code:"ABCD2345",name:"김참여"}));
  });
  it("opens the name and code form after login and saves the private name only in the POST", async () => {
    render(<KyaaWaveParticipationScreen />);
    await screen.findByRole("heading", { name: t.nameTitle });
    expect(screen.getByLabelText(t.name)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText(t.privacy)).toBeInTheDocument(); enterName();
    fetchMock.mockResolvedValueOnce(Response.json({ participation: receipt }));
    fireEvent.click(screen.getByRole("button", { name: t.save }));
    await screen.findByRole("heading", { name: t.done });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "POST", body: JSON.stringify({ code: "ABCD23", name: "김참여" }) });
    expect(fetchMock.mock.calls[1][1].headers["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(screen.getByRole("link", { name: "홈" })).toHaveAttribute("href", "/kyaa-wave-fanpage?locale=ko");
    expect(navigation.replace).toHaveBeenCalledWith("/kyaa-wave-fanpage?locale=ko");
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
    await screen.findByRole("heading", { name: t.nameTitle });
  });
  it("reads a directly revisited signed-in session without an active owner transition", async () => {
    session.ownerId = null;
    render(<KyaaWaveParticipationScreen />);
    await screen.findByRole("heading", { name: t.nameTitle });
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(navigation.replace).not.toHaveBeenCalled();
  });
  it("waits for SDK readiness even when an authenticated user and no session owner exist", async () => {
    auth.ready = false; session.ownerId = null;
    const { rerender } = render(<KyaaWaveParticipationScreen />);
    expect(screen.getByRole("status")).toHaveTextContent(t.loading); expect(fetchMock).not.toHaveBeenCalled();
    auth.ready = true; rerender(<KyaaWaveParticipationScreen />);
    await screen.findByRole("heading", { name: t.nameTitle });
  });
  it("preserves QR code and locale through the existing login route", async () => {
    auth.authenticated = false; session.ownerId = null; navigation.params = new URLSearchParams("code=abcd-2345&locale=ja");
    render(<KyaaWaveParticipationScreen />);
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledTimes(1));
    const url = new URL(navigation.replace.mock.calls[0][0], "https://byus.local");
    expect(url.pathname).toBe("/login"); expect(url.searchParams.get("locale")).toBe("ja");
    const checkin = new URL(url.searchParams.get("returnTo")!, url.origin);
    expect(checkin.pathname).toBe("/connect/kyaa-wave/participate"); expect(checkin.searchParams.get("code")).toBe("ABCD2345"); expect(checkin.searchParams.get("returnTo")).toBe("/kyaa-wave-fanpage?locale=ja"); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("asks for login before accepting a manual code", async () => {
    auth.authenticated = false; session.ownerId = null; navigation.params = new URLSearchParams("locale=ko");
    render(<KyaaWaveParticipationScreen />);
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledTimes(1));
    expect(screen.queryByLabelText(t.code)).toBeNull(); expect(fetchMock).not.toHaveBeenCalled();
    const login = new URL(navigation.replace.mock.calls[0][0], "https://kyaa.test");
    expect(login.pathname).toBe("/login");
    expect(new URL(login.searchParams.get("returnTo")!, login.origin).pathname).toBe("/connect/kyaa-wave/participate");
  });
  it("requires both a name and manually entered code after login", async () => {
    navigation.params = new URLSearchParams("locale=ko");
    render(<KyaaWaveParticipationScreen />); await ready(); enterName();
    fireEvent.click(screen.getByRole("button", { name: t.save }));
    expect(screen.getByRole("alert")).toHaveTextContent(t.invalidCode); expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText(t.code), { target: { value: "abcd-23" } });
    fetchMock.mockResolvedValueOnce(Response.json({ participation: receipt }));
    fireEvent.click(screen.getByRole("button", { name: t.save }));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/kyaa-wave-fanpage?locale=ko"));
    expect(fetchMock.mock.calls[1][1].body).toBe(JSON.stringify({code:"ABCD23",name:"김참여"}));
  });
  it("preserves a name after invalid code and uses a new key when the payload changes", async () => {
    render(<KyaaWaveParticipationScreen />); await ready(); enterName();
    fetchMock.mockResolvedValueOnce(Response.json({ error: { code: "PARTICIPATION_CODE_INVALID" } }, { status: 400 }));
    fireEvent.click(screen.getByRole("button", { name: t.save }));
    await screen.findByRole("alert"); expect(screen.getByLabelText(t.name)).toHaveValue("김참여"); expect(screen.getByLabelText(t.code)).toHaveAttribute("aria-invalid", "true");
    const key = fetchMock.mock.calls[1][1].headers["Idempotency-Key"];
    fireEvent.change(screen.getByLabelText(t.code), { target: { value: "ABCD24" } }); fetchMock.mockResolvedValueOnce(Response.json({ participation: receipt }));
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
    await screen.findByRole("heading", { name: t.nameTitle });
    await act(async () => resolveToken("old-token"));
    expect(fetchMock.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(0);
    expect(screen.getByLabelText(t.name)).toHaveValue("");
  });
  it("ignores a late receipt from a previous account", async () => {
    let finish!: (value: Response) => void; fetchMock.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const { rerender } = render(<KyaaWaveParticipationScreen />); await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    auth.user = { id: "other" }; session.ownerId = "other"; session.generation++; rerender(<KyaaWaveParticipationScreen />);
    await screen.findByRole("heading", { name: t.nameTitle }); await act(async () => finish(Response.json({ participation: receipt })));
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

it.each(["/kyaa-wave-fanpage?locale=ko&tab=friends", "https://evil.example/path", "//evil.example/path"])("returns only to a safe local destination: %s", async destination => {
  navigation.params.set("returnTo", destination);
  fetchMock.mockResolvedValueOnce(Response.json({ participation: receipt }));
  render(<KyaaWaveParticipationScreen />);
  await screen.findByRole("heading", { name: t.done });
  expect(screen.getByRole("link")).toHaveAttribute("href", destination.startsWith("/kyaa-wave-fanpage") ? destination : "/kyaa-wave-fanpage?locale=ko");
});
