import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";
import { RunmusicScreen, restoreRunmusicCode, RUNMUSIC_CODE_STORAGE } from "./runmusic-screen";
import { runmusicCopy } from "./runmusic-copy";

const { auth, session, locale } = vi.hoisted(() => ({
  auth: { ready: true, authenticated: true, user: { id: "owner" }, getAccessToken: vi.fn(async () => "token") },
  session: { ready: true, ownerId: "owner" as string | null, generation: 0 }, locale: { value: "ko" },
}));
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => auth }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => session }));
vi.mock("@/components/locale-provider", () => ({ usePageLocale: () => locale.value }));
vi.mock("@/components/fan-shell/focus-flow-frame", () => ({ FocusFlowFrame: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
const campaign = { slug: "runmusic-2026", published: true, registrationOpensAt: "2026-10-20T00:00:00+09:00", registrationClosesAt: "2026-10-24T00:00:00+09:00", eventStartsAt: "2026-10-24T17:00:00+09:00", eventEndsAt: "2026-10-24T19:00:00+09:00", prizeCount: 100, prizeLabel: "스타벅스 1만원", drawn: false, resultsPublished: false };
const participation = { campaign, registered: false, missions: [] as string[], multiplier: 1, tickets: 0, result: "pending", receiptId: null, receivedAt: null };
const fetchMock = vi.fn();
const t = runmusicCopy.ko;
beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-24T17:30:00+09:00"));
  auth.ready = true; auth.authenticated = true; auth.user = { id: "owner" }; auth.getAccessToken.mockReset().mockResolvedValue("token");
  session.ready = true; session.ownerId = "owner"; session.generation = 0; locale.value = "ko";
  window.history.replaceState(null, "", "/connect/runmusic?locale=ko"); sessionStorage.clear();
  fetchMock.mockReset().mockImplementation(async () => Response.json(participation)); vi.stubGlobal("fetch", fetchMock);
});
describe("RUN&MUSIC participation", () => {
  it("removes the check-in secret from the URL and keeps it only in session storage", () => {
    window.history.replaceState(null, "", "/connect/runmusic?locale=ja#checkin=venue-secret-code");
    expect(restoreRunmusicCode()).toBe("venue-secret-code");
    expect(window.location.hash).toBe(""); expect(window.location.search).toBe("?locale=ja");
    expect(sessionStorage.getItem(RUNMUSIC_CODE_STORAGE)).toBe("venue-secret-code");
    expect(restoreRunmusicCode()).toBe("venue-secret-code");
  });
  it("rejects an overlong fragment code while removing the fragment", () => {
    window.history.replaceState(null, "", `/connect/runmusic#checkin=${"a".repeat(129)}`);
    expect(restoreRunmusicCode()).toBe(""); expect(window.location.hash).toBe("");
    expect(sessionStorage.getItem(RUNMUSIC_CODE_STORAGE)).toBeNull();
  });
  it("preserves the return route and locale without putting the secret in login URLs", async () => {
    auth.authenticated = false; session.ownerId = null; locale.value = "ja";
    window.history.replaceState(null, "", "/connect/runmusic?locale=ja#checkin=venue-secret-code");
    fetchMock.mockResolvedValue(Response.json(campaign)); render(<RunmusicScreen />);
    const link = await screen.findByRole("link", { name: runmusicCopy.ja.login });
    const url = new URL(link.getAttribute("href")!, "http://localhost");
    expect(url.searchParams.get("returnTo")).toBe("/connect/runmusic?locale=ja");
    expect(url.href).not.toContain("venue-secret"); expect(sessionStorage.getItem(RUNMUSIC_CODE_STORAGE)).toBe("venue-secret-code");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/runmusic");
  });
  it("waits for restoration of the current account before requesting private participation", () => {
    session.ownerId = "old-owner"; render(<RunmusicScreen />);
    expect(screen.getByRole("status")).toHaveTextContent(t.loading); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("allows on-site check-in without pre-registration and unlocks day missions only after check-in", async () => {
    render(<RunmusicScreen />); await screen.findByRole("button", { name: t.checkin });
    expect(screen.getByRole("button", { name: t.checkin })).toBeEnabled();
    expect(screen.getByRole("button", { name: t.cheer })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: t.checkin }));
    fireEvent.change(screen.getByLabelText(t.code), { target: { value: "venue-secret-code" } });
    fetchMock.mockResolvedValueOnce(Response.json({ ...participation, missions: ["checkin"], tickets: 1 }));
    fireEvent.click(screen.getByRole("button", { name: t.submit }));
    await waitFor(() => expect(screen.getByRole("button", { name: t.cheer })).toBeEnabled());
    const sent = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(sent).toMatchObject({ action: "checkin", code: "venue-secret-code" }); expect(sent.requestKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(sessionStorage.getItem(RUNMUSIC_CODE_STORAGE)).toBeNull();
  });
  it("reuses the mutation request key after an uncertain network failure", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-21T17:30:00+09:00"));
    render(<RunmusicScreen />); await screen.findByRole("button", { name: t.register });
    fetchMock.mockRejectedValueOnce(new TypeError("Network"));
    fireEvent.click(screen.getByRole("button", { name: t.register }));
    await screen.findByRole("alert");
    const key = JSON.parse(fetchMock.mock.calls[1][1].body).requestKey;
    fetchMock.mockResolvedValueOnce(Response.json({ ...participation, registered: true }));
    fireEvent.click(screen.getByRole("button", { name: t.register }));
    await screen.findByRole("button", { name: t.registered });
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).requestKey).toBe(key);
  });
  it("keeps a failed check-in code and explains invalid server codes", async () => {
    sessionStorage.setItem(RUNMUSIC_CODE_STORAGE, "venue-secret-code"); render(<RunmusicScreen />);
    fireEvent.click(await screen.findByRole("button", { name: t.checkin }));
    fetchMock.mockResolvedValueOnce(Response.json({ error: { code: "RUNMUSIC_INVALID_CODE" } }, { status: 400 }));
    fireEvent.click(screen.getByRole("button", { name: t.submit }));
    expect(await screen.findByRole("alert")).toHaveTextContent(t.invalidCode);
    expect(screen.getByLabelText(t.code)).toHaveValue("venue-secret-code"); expect(sessionStorage.getItem(RUNMUSIC_CODE_STORAGE)).toBe("venue-secret-code");
  });
  it("does not submit a previous account action after its pending token resolves", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-21T17:30:00+09:00"));
    const { rerender } = render(<RunmusicScreen />); await screen.findByRole("button", { name: t.register });
    let resolve!: (value: string) => void; auth.getAccessToken.mockReturnValueOnce(new Promise<string>(done => { resolve = done; }));
    fireEvent.click(screen.getByRole("button", { name: t.register }));
    auth.user = { id: "other" }; session.ownerId = "other"; session.generation += 1; rerender(<RunmusicScreen />);
    resolve("old-token"); await screen.findByRole("button", { name: t.register });
    await waitFor(() => expect(fetchMock.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(0));
  });
  it("uses the existing asset upload and reuses the uploaded photo after a submission retry", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ ...participation, missions: ["checkin"], tickets: 1 }));
    render(<RunmusicScreen />); fireEvent.click(await screen.findByRole("button", { name: t.photo }));
    const photo = new File(["image"], "venue.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText(t.photo), { target: { files: [photo] } });
    fetchMock.mockResolvedValueOnce(Response.json({ asset: { id: "10000000-0000-4000-8000-000000000001", width: 800, height: 600 } }));
    fetchMock.mockRejectedValueOnce(new TypeError("network")); fireEvent.submit(screen.getByRole("button", { name: t.submit }).closest("form")!);
    await screen.findByRole("alert");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/content-assets");
    expect(fetchMock.mock.calls[1][1].body.get("celebritySlug")).toBe("runmusic");
    const payload = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(payload).toMatchObject({ action: "photo", assetIds: ["10000000-0000-4000-8000-000000000001"] });
    fetchMock.mockResolvedValueOnce(Response.json({ ...participation, missions: ["checkin", "photo"], tickets: 2 }));
    fireEvent.submit(screen.getByRole("button", { name: t.submit }).closest("form")!);
    await waitFor(() => expect(screen.queryByRole("button", { name: t.submit })).not.toBeInTheDocument());
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/content-assets")).toHaveLength(1);
    expect(JSON.parse(fetchMock.mock.calls[3][1].body).requestKey).toBe(payload.requestKey);
  });
  it("rejects unsupported photos before an upload or mission mutation", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ ...participation, missions: ["checkin"], tickets: 1 }));
    render(<RunmusicScreen />); fireEvent.click(await screen.findByRole("button", { name: t.photo }));
    fireEvent.change(screen.getByLabelText(t.photo), { target: { files: [new File(["text"], "test.txt", { type: "text/plain" })] } });
    fireEvent.submit(screen.getByRole("button", { name: t.submit }).closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent(t.photoHelp); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("shows a winner receipt without claiming the prize was automatically sent", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ ...participation, result: "winner", receiptId: "10000000-0000-4000-8000-000000000001", campaign: { ...campaign, drawn: true, resultsPublished: true } }));
    render(<RunmusicScreen />); expect(await screen.findByText(t.win)).toBeInTheDocument();
    expect(screen.getByText("10000000-0000-4000-8000-000000000001")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t.checkin })).toBeDisabled();
  });
  it("provides every service string in every supported locale", () => {
    for (const language of APP_LOCALES) {
      expect(Object.keys(runmusicCopy[language])).toEqual(Object.keys(t));
      for (const value of Object.values(runmusicCopy[language])) expect(typeof value === "string" && value.trim().length > 0).toBe(true);
    }
  });
  it.each(APP_LOCALES)("renders public participation and original source assets for %s", async language => {
    locale.value = language; auth.authenticated = false; session.ownerId = null; fetchMock.mockResolvedValueOnce(Response.json(campaign));
    render(<RunmusicScreen />); await screen.findByRole("link", { name: runmusicCopy[language].login });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(runmusicCopy[language].title);
    expect(screen.getByAltText("RUN&MUSIC")).toHaveAttribute("src", "/images/runmusic/official-brand.webp");
    expect(screen.getByText(runmusicCopy[language].notice, { selector: "summary" })).toBeInTheDocument();
  });
});
