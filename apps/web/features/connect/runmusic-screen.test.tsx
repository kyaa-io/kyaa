import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";
import { RunmusicScreen, clearLegacyRunmusicCode } from "./runmusic-screen";
import { runmusicCopy } from "./runmusic-copy";

const { auth, session, locale } = vi.hoisted(() => ({
  auth: { ready: true, authenticated: true, user: { id: "owner" }, getAccessToken: vi.fn(async (): Promise<string | null> => "token") },
  session: { ready: true, ownerId: "owner" as string | null, generation: 0 }, locale: { value: "ko" },
}));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => auth }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => session }));
vi.mock("@/components/locale-provider", () => ({ usePageLocale: () => locale.value }));
vi.mock("@/components/fan-shell/focus-flow-frame", () => ({ FocusFlowFrame: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
const campaign = { slug: "runmusic-2026", published: true, entryOpensAt: "2026-10-20T00:00:00+09:00", entryClosesAt: "2026-10-24T23:59:00+09:00", resultsAt: "2026-10-24T23:59:00+09:00", prizes: [
  { code: "andong_yogurt_1l", label: "안동 요거트 1L", count: 15, imageUrl: "/images/runmusic/andong-yogurt-1l.png" },
  { code: "starbucks_10000", label: "스타벅스 1만원", count: 150, imageUrl: "/images/kyaa-wave/starbucks-10000-voucher.jpg" },
], drawn: false, resultsPublished: false };
const participation = { campaign, entered: false, liked: false, contact: { saved: false, masked: null }, result: "pending", prizeCode: null, receiptId: null, receivedAt: null };
const entered = { ...participation, entered: true, liked: true };
const fetchMock = vi.fn();
const t = runmusicCopy.ko;
afterEach(() => vi.useRealTimers());
beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-24T17:30:00+09:00"));
  auth.ready = true; auth.authenticated = true; auth.user = { id: "owner" }; auth.getAccessToken.mockReset().mockResolvedValue("token");
  session.ready = true; session.ownerId = "owner"; session.generation = 0; locale.value = "ko";
  window.history.replaceState(null, "", "/connect/runmusic?locale=ko"); sessionStorage.clear();
  fetchMock.mockReset().mockImplementation(async () => Response.json(participation)); vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { readText: vi.fn(async () => "pasted-id") } });
});
describe("RUN&MUSIC participation", () => {
  it("removes legacy QR secrets without retaining them and preserves other URL context", () => {
    sessionStorage.setItem("runmusic-checkin-code", "old-secret");
    window.history.replaceState(null, "", "/connect/runmusic?locale=ja#checkin=venue-secret-code&section=event");
    clearLegacyRunmusicCode();
    expect(window.location.hash).toBe("#section=event"); expect(window.location.search).toBe("?locale=ja");
    expect(sessionStorage.getItem("runmusic-checkin-code")).toBeNull();
  });
  it.each([false, true])("preserves the event path and locale through login (results=%s)", async resultsOnly => {
    auth.authenticated = false; session.ownerId = null; locale.value = "ja";
    fetchMock.mockImplementation(async () => Response.json(campaign)); render(<RunmusicScreen resultsOnly={resultsOnly} />);
    const link = await screen.findByRole("link", { name: resultsOnly ? runmusicCopy.ja.login : runmusicCopy.ja.enter });
    const url = new URL(link.getAttribute("href")!, "http://localhost");
    expect(url.searchParams.get("returnTo")).toBe(`/connect/runmusic${resultsOnly ? "/results" : ""}?locale=ja`);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(fetchMock.mock.calls[0][0]).toBe("/api/runmusic");
  });
  it.each([401, 403])("shows public entry and login when a restored identity is rejected (%s)", async status => {
    session.ownerId = null;
    fetchMock.mockImplementation(async (url: string) => url === "/api/me/runmusic"
      ? Response.json({ error: { code: "AUTHENTICATION_REQUIRED" } }, { status }) : Response.json(campaign));
    render(<RunmusicScreen />);
    const link = await screen.findByRole("link", { name: t.enter });
    expect(new URL(link.getAttribute("href")!, "http://localhost").searchParams.get("returnTo")).toBe("/connect/runmusic?locale=ko");
    expect(screen.getByRole("heading", { name: "안동 요거트 1L" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/me/runmusic", "/api/runmusic"]);
    expect(fetchMock.mock.calls[1][1].headers).toEqual({});
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
  });
  it("shows public entry when the SDK has no usable access token", async () => {
    auth.getAccessToken.mockResolvedValueOnce(null);
    fetchMock.mockResolvedValueOnce(Response.json(campaign)); render(<RunmusicScreen />);
    await screen.findByRole("link", { name: t.enter });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/runmusic"]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("shows public entry and login when token acquisition rejects", async () => {
    auth.getAccessToken.mockRejectedValueOnce(new Error("SDK unavailable"));
    fetchMock.mockResolvedValueOnce(Response.json(campaign)); render(<RunmusicScreen />);
    await screen.findByRole("link", { name: t.enter });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/runmusic"]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("falls back after a token deadline and ignores a late token", async () => {
    vi.useFakeTimers();
    let resolve!: (value: string) => void;
    auth.getAccessToken.mockReturnValueOnce(new Promise<string>(done => { resolve = done; }));
    fetchMock.mockResolvedValueOnce(Response.json(campaign)); render(<RunmusicScreen />);
    await act(async () => { await vi.advanceTimersByTimeAsync(20_001); });
    expect(screen.getByRole("link", { name: t.enter })).toBeInTheDocument();
    await act(async () => resolve("expired-token"));
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/runmusic"]);
  });
  it("shows public entry while authentication is preparing, then loads the restored owner", async () => {
    auth.ready = false; session.ready = false;
    fetchMock.mockImplementation(async (url: string) => Response.json(url === "/api/runmusic" ? campaign : participation));
    const { rerender } = render(<RunmusicScreen />);
    await screen.findByRole("link", { name: t.enter });
    expect(auth.getAccessToken).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "안동 요거트 1L" })).toBeInTheDocument();
    auth.ready = true; session.ready = true; rerender(<RunmusicScreen />);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
  it("keeps service failures recoverable instead of treating them as signed out", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: { code: "RUNMUSIC_UNAVAILABLE" } }, { status: 503 }));
    render(<RunmusicScreen />); await screen.findByRole("alert");
    expect(screen.queryByRole("link", { name: t.enter })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: t.retry }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
  it.each(["old-owner"])("only reads public information while the session owner differs (%s)", async ownerId => {
    session.ownerId = ownerId; fetchMock.mockResolvedValueOnce(Response.json(campaign)); render(<RunmusicScreen />);
    await screen.findByRole("link", { name: t.enter });
    expect(auth.getAccessToken).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/runmusic"]);
  });
  it.each([false, true])("restores an existing login on direct navigation (results=%s)", async resultsOnly => {
    session.ownerId = null;
    render(<RunmusicScreen resultsOnly={resultsOnly} />);
    if (resultsOnly) expect(await screen.findByRole("heading", { name: t.pending })).toBeInTheDocument();
    else expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/me/runmusic");
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe("Bearer token");
  });
  it("shows public information while a login transition is pending without an owner", async () => {
    session.ready = false; session.ownerId = null;
    fetchMock.mockResolvedValueOnce(Response.json(campaign)); render(<RunmusicScreen />);
    await screen.findByRole("link", { name: t.enter });
    expect(auth.getAccessToken).not.toHaveBeenCalled();
  });
  it.each([401, 403, "missing-token", "token-error"] as const)("offers login and retains the draft after submission auth failure (%s)", async failure => {
    fetchMock.mockResolvedValueOnce(Response.json({ ...participation, liked: true }));
    render(<RunmusicScreen />); const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(t.kakaoId), { target: { value: "entry-id" } });
    if (failure === "missing-token") auth.getAccessToken.mockResolvedValueOnce(null);
    else if (failure === "token-error") auth.getAccessToken.mockRejectedValueOnce(new Error("SDK unavailable"));
    else fetchMock.mockResolvedValueOnce(new Response("Unauthorized", { status: failure }));
    fireEvent.click(within(dialog).getByRole("button", { name: t.confirmEntry }));
    const link = await within(dialog).findByRole("link", { name: t.login });
    expect(new URL(link.getAttribute("href")!, "http://localhost").searchParams.get("returnTo")).toBe("/connect/runmusic?locale=ko");
    expect(within(dialog).getByRole("alert")).toHaveTextContent(t.authError);
    expect(within(dialog).getByLabelText(t.kakaoId)).toHaveValue("entry-id");
    expect(within(dialog).getByRole("button", { name: t.confirmEntry })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: t.close }));
    expect(screen.getByRole("link", { name: t.enter })).toBeInTheDocument();
  });
  it("keeps one dialog through completion and returns focus after acknowledgement", async () => {
    render(<RunmusicScreen />); const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: t.confirmEntry })).toBeDisabled();
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(0);
    fireEvent.change(within(dialog).getByLabelText(t.kakaoId), { target: { value: "entry-id" } });
    expect(within(dialog).queryByRole("button", { name: t.like })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: t.confirmEntry })).toBeEnabled();
    fetchMock.mockResolvedValueOnce(Response.json({ completed: true })).mockResolvedValueOnce(Response.json(entered));
    fireEvent.click(within(dialog).getByRole("button", { name: t.confirmEntry }));
    const title = await screen.findByRole("heading", { name: t.completionTitle });
    await waitFor(() => expect(title).toHaveFocus());
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === "POST").map(([url]) => url)).toEqual(["/api/celebrities/runmusic/reactions", "/api/me/runmusic"]);
    expect(fetchMock.mock.calls[1][1].body).toBeUndefined();
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toMatchObject({ action: "enter", kakaoId: "entry-id" });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(within(dialog).getByText(t.pending)).toBeInTheDocument();
    expect(within(dialog).getByText(t.resultsAt)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: t.acknowledge }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("heading", { name: t.entered })).toHaveFocus());
    expect(screen.getByLabelText(t.kakaoId)).toHaveValue("");
  });
  it.each([401, 503])("preserves the draft and stops entry when the like fails (%s)", async code => {
    render(<RunmusicScreen />); const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(t.kakaoId), { target: { value: "entry-id" } });
    fetchMock.mockResolvedValueOnce(new Response("Unavailable", { status: code }));
    fireEvent.click(within(dialog).getByRole("button", { name: t.confirmEntry }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(code === 401 ? t.authError : t.error);
    expect(within(dialog).getByLabelText(t.kakaoId)).toHaveValue("entry-id");
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === "POST").map(([url]) => url)).toEqual(["/api/celebrities/runmusic/reactions"]);
    expect(screen.queryByRole("heading", { name: t.completionTitle })).not.toBeInTheDocument();
  });
  it("retries the same entry after a successful like and an uncertain entry response", async () => {
    render(<RunmusicScreen />); const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(t.kakaoId), { target: { value: "entry-id" } });
    fetchMock.mockResolvedValueOnce(Response.json({ completed: true })).mockRejectedValueOnce(new TypeError("Network"));
    const button = within(dialog).getByRole("button", { name: t.confirmEntry }); fireEvent.click(button); fireEvent.click(button);
    await within(dialog).findByRole("alert"); expect(fetchMock).toHaveBeenCalledTimes(3);
    const first = JSON.parse(fetchMock.mock.calls[2][1].body);
    fetchMock.mockResolvedValueOnce(Response.json({ completed: true })).mockResolvedValueOnce(Response.json(entered));
    fireEvent.click(button); await screen.findByRole("heading", { name: t.completionTitle });
    expect(JSON.parse(fetchMock.mock.calls[4][1].body)).toEqual(first);
  });
  it("never enters for a replaced account when the first like response arrives late", async () => {
    const { rerender } = render(<RunmusicScreen />); const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(t.kakaoId), { target: { value: "entry-id" } });
    let resolve!: (value: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>(done => { resolve = done; }));
    fireEvent.click(within(dialog).getByRole("button", { name: t.confirmEntry }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    auth.user = { id: "other" }; session.ownerId = "other"; session.generation += 1;
    fetchMock.mockImplementation(async () => Response.json(entered)); rerender(<RunmusicScreen />);
    await act(async () => resolve(Response.json({ completed: true })));
    await screen.findByRole("heading", { name: t.entered });
    expect(fetchMock.mock.calls.filter(([url, options]) => url === "/api/me/runmusic" && options?.method === "POST")).toHaveLength(0);
  });
  it.each(APP_LOCALES)("describes the KakaoTalk ID lookup path beside the input for %s", async language => {
    locale.value = language; const copy = runmusicCopy[language];
    render(<RunmusicScreen />); const dialog = await screen.findByRole("dialog");
    expect(copy.enter).toBe(copy.confirmEntry);
    const input = within(dialog).getByLabelText(copy.kakaoId);
    expect(within(dialog).getByText(copy.kakaoIdHelpTitle, { exact: true })).toBeVisible();
    expect(within(dialog).getAllByRole("listitem").map(item => item.textContent)).toEqual(copy.kakaoIdHelp.split(" → "));
    expect(input).toHaveAccessibleDescription(`${copy.contactHelp} ${copy.kakaoIdHelp.split(" → ").join(" ")}`);
    expect(within(dialog).getByRole("img", { name: copy.kakaoIdHelpTitle })).toHaveAttribute("src", "/images/runmusic/kakao-id-guide.png");
    expect(within(within(dialog).getAllByRole("listitem")[3]).getByRole("img", { name: copy.kakaoIdHelp.split(" → ")[3] })).toHaveAttribute("src", "/images/runmusic/kakao-manage-guide.png");
    expect(within(dialog).getByRole("button", { name: copy.confirmEntry }).compareDocumentPosition(within(dialog).getByText(copy.kakaoIdHelpTitle, { exact: true })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it("does not reopen a dismissed automatic dialog after a like or rerender", async () => {
    const { rerender } = render(<RunmusicScreen />); fireEvent.click(await screen.findByRole("button", { name: t.close }));
    rerender(<RunmusicScreen />); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const action = screen.getByRole("button", { name: t.enter });
    expect(action).toHaveTextContent("응모하기");
    expect(action.compareDocumentPosition(screen.getByRole("region", { name: t.prizes })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(action); expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
  it("reuses an uncertain entry request key and blocks double clicks", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ ...participation, liked: true }));
    render(<RunmusicScreen />); const dialog = await screen.findByRole("dialog"); const button = within(dialog).getByRole("button", { name: t.confirmEntry });
    fireEvent.change(within(dialog).getByLabelText(t.kakaoId), { target: { value: "entry-id" } });
    fetchMock.mockRejectedValueOnce(new TypeError("Network")); fireEvent.click(button); fireEvent.click(button);
    await screen.findByRole("alert"); expect(fetchMock).toHaveBeenCalledTimes(2);
    const key = JSON.parse(fetchMock.mock.calls[1][1].body).requestKey;
    fetchMock.mockResolvedValueOnce(Response.json(entered)); fireEvent.click(button);
    await screen.findByRole("heading", { name: t.completionTitle });
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ action: "enter", requestKey: key, kakaoId: "entry-id" });
  });
  it("requires a valid contact before entry and preserves long pasted input", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ ...participation, liked: true }));
    render(<RunmusicScreen />); const dialog = await screen.findByRole("dialog");
    const input = within(dialog).getByLabelText(t.kakaoId), button = within(dialog).getByRole("button", { name: t.confirmEntry });
    expect(button).toBeDisabled();
    for (const value of ["   ", "bad\u0000id"]) {
      fireEvent.change(input, { target: { value } });
      expect(button).toBeDisabled(); expect(within(dialog).getByRole("alert")).toHaveTextContent(t.invalidId);
    }
    vi.mocked(navigator.clipboard.readText).mockResolvedValueOnce("a".repeat(101));
    fireEvent.click(within(dialog).getByRole("button", { name: t.paste }));
    await waitFor(() => expect(input).toHaveValue("a".repeat(101)));
    expect(button).toBeDisabled(); expect(input).toHaveAttribute("aria-invalid", "true");
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(0);
    fireEvent.change(input, { target: { value: "a".repeat(100) } }); expect(button).toBeEnabled();
  });
  it("validates pasted control characters before the input can strip them", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ ...participation, liked: true }));
    render(<RunmusicScreen />); const dialog = await screen.findByRole("dialog");
    fireEvent.paste(within(dialog).getByLabelText(t.kakaoId), { clipboardData: { getData: () => "bad\nid" } });
    expect(within(dialog).getByRole("alert")).toHaveTextContent(t.invalidId);
    expect(within(dialog).getByRole("button", { name: t.confirmEntry })).toBeDisabled();
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(0);
  });
  it("replaces the uncertain entry request key when the draft changes", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ ...participation, liked: true }));
    render(<RunmusicScreen />); const dialog = await screen.findByRole("dialog");
    const input = within(dialog).getByLabelText(t.kakaoId), button = within(dialog).getByRole("button", { name: t.confirmEntry });
    fireEvent.change(input, { target: { value: "first-id" } });
    fetchMock.mockRejectedValueOnce(new TypeError("Network")); fireEvent.click(button);
    await screen.findByRole("alert"); const first = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(input).toHaveValue("first-id");
    fireEvent.change(input, { target: { value: "second-id" } });
    fetchMock.mockResolvedValueOnce(Response.json(entered)); fireEvent.click(button);
    await screen.findByRole("heading", { name: t.completionTitle });
    const second = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(second.kakaoId).toBe("second-id"); expect(second.requestKey).not.toBe(first.requestKey);
  });
  it.each(APP_LOCALES)("offers participants a localized home link in %s", async value => {
    locale.value = value;
    fetchMock.mockResolvedValueOnce(Response.json(entered)); render(<RunmusicScreen />);
    expect(await screen.findByRole("link", { name: runmusicCopy[value].home })).toHaveAttribute("href", `/?locale=${value}`);
  });
  it("skips the dialog for existing participants and saves contact separately", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(entered)); render(<RunmusicScreen />);
    await screen.findByRole("heading", { name: t.entered }); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(0);
    fireEvent.change(screen.getByLabelText(t.kakaoId), { target: { value: " my-kakao " } });
    fetchMock.mockResolvedValueOnce(Response.json({ ...entered, contact: { saved: true, masked: "my***ao" } }));
    fireEvent.click(screen.getByRole("button", { name: t.save }));
    expect(await screen.findByRole("status")).toHaveTextContent(t.saved);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ action: "save_contact", kakaoId: "my-kakao" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText(t.kakaoId)).toHaveValue("");
  });
  it("does not celebrate or discard input when the response has not confirmed entry", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ ...participation, liked: true }));
    render(<RunmusicScreen />); const dialog = await screen.findByRole("dialog");
    expect(screen.queryByRole("link", { name: t.home })).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText(t.kakaoId), { target: { value: "entry-id" } });
    fetchMock.mockResolvedValueOnce(Response.json({ ...participation, liked: true }));
    fireEvent.click(within(dialog).getByRole("button", { name: t.confirmEntry }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(t.error);
    expect(within(dialog).getByLabelText(t.kakaoId)).toHaveValue("entry-id");
    expect(screen.queryByRole("heading", { name: t.completionTitle })).not.toBeInTheDocument();
  });
  it.each(["close", "escape"])("dismisses completion with %s without reopening it", async method => {
    fetchMock.mockResolvedValueOnce(Response.json({ ...participation, liked: true }));
    const { rerender } = render(<RunmusicScreen />); const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(t.kakaoId), { target: { value: "entry-id" } });
    fetchMock.mockResolvedValueOnce(Response.json(entered));
    fireEvent.click(within(dialog).getByRole("button", { name: t.confirmEntry }));
    await screen.findByRole("heading", { name: t.completionTitle });
    if (method === "close") fireEvent.click(within(dialog).getByRole("button", { name: t.close }));
    else fireEvent.keyDown(document, { key: "Escape" });
    rerender(<RunmusicScreen />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("heading", { name: t.entered })).toHaveFocus());
  });
  it.each([false, true])("does not carry completion to another account (response settled=%s)", async settled => {
    fetchMock.mockResolvedValueOnce(Response.json({ ...participation, liked: true }));
    const { rerender } = render(<RunmusicScreen />); const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(t.kakaoId), { target: { value: "entry-id" } });
    let resolve!: (value: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>(done => { resolve = done; }));
    fireEvent.click(within(dialog).getByRole("button", { name: t.confirmEntry }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    if (settled) {
      await act(async () => resolve(Response.json(entered)));
      await screen.findByRole("heading", { name: t.completionTitle });
    }
    auth.user = { id: "other" }; session.ownerId = "other"; session.generation += 1;
    fetchMock.mockImplementation(async () => Response.json(entered)); rerender(<RunmusicScreen />);
    if (!settled) await act(async () => resolve(Response.json(entered)));
    await screen.findByRole("heading", { name: t.entered });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: t.completionTitle })).not.toBeInTheDocument();
  });
  it("retains the contact draft and confirmed entry after a save failure", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(entered)); render(<RunmusicScreen />);
    await screen.findByRole("heading", { name: t.entered });
    fireEvent.change(screen.getByLabelText(t.kakaoId), { target: { value: "my-kakao" } });
    fetchMock.mockRejectedValueOnce(new TypeError("Network")); fireEvent.click(screen.getByRole("button", { name: t.save }));
    await screen.findByRole("alert"); expect(screen.getByLabelText(t.kakaoId)).toHaveValue("my-kakao");
    expect(screen.getByRole("heading", { name: t.entered })).toBeInTheDocument();
    expect(screen.queryByText(t.saved)).not.toBeInTheDocument();
  });
  it("reads the clipboard only on click and leaves a manual fallback", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(entered)); render(<RunmusicScreen />);
    const button = await screen.findByRole("button", { name: t.paste }); expect(navigator.clipboard.readText).not.toHaveBeenCalled();
    fireEvent.click(button); await waitFor(() => expect(screen.getByLabelText(t.kakaoId)).toHaveValue("pasted-id"));
    vi.mocked(navigator.clipboard.readText).mockRejectedValueOnce(new Error("Denied")); fireEvent.click(button);
    expect(await screen.findByRole("status")).toHaveTextContent(t.pasteFallback);
    expect(screen.getByLabelText(t.kakaoId)).toHaveValue("pasted-id");
  });
  it("discards a previous account's pending action and contact draft", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(entered)); const { rerender } = render(<RunmusicScreen />);
    await screen.findByLabelText(t.kakaoId); fireEvent.change(screen.getByLabelText(t.kakaoId), { target: { value: "private-draft" } });
    let resolve!: (value: string) => void; auth.getAccessToken.mockReturnValueOnce(new Promise<string>(done => { resolve = done; }));
    fireEvent.click(screen.getByRole("button", { name: t.save }));
    auth.user = { id: "other" }; session.ownerId = "other"; session.generation += 1;
    fetchMock.mockImplementation(async () => Response.json(entered)); rerender(<RunmusicScreen />);
    await act(async () => resolve("old-token")); await screen.findByLabelText(t.kakaoId);
    expect(screen.getByLabelText(t.kakaoId)).toHaveValue("");
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(0);
  });
  it("closes entry at the exact deadline without inventing a published result", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ ...participation, liked: true }));
    render(<RunmusicScreen />); const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(t.kakaoId), { target: { value: "entry-id" } });
    vi.spyOn(Date, "now").mockReturnValue(Date.parse(campaign.entryClosesAt));
    await waitFor(() => expect(within(dialog).getByRole("button", { name: t.confirmEntry })).toBeDisabled(), { timeout: 2000 });
    expect(await within(dialog).findByRole("status")).toHaveTextContent(t.closed);
  });
  it.each(["pending", "not_entered", "not_selected", "winner"] as const)("renders server-authoritative personal %s result", async result => {
    fetchMock.mockResolvedValueOnce(Response.json({ ...entered, result, campaign: { ...campaign, resultsPublished: result !== "pending", drawn: result !== "pending" }, ...(result === "winner" ? { prizeCode: "andong_yogurt_1l", receiptId: "10000000-0000-4000-8000-000000000001" } : {}) }));
    render(<RunmusicScreen resultsOnly />);
    expect(await screen.findByRole("heading", { name: result === "winner" ? t.win : result === "not_selected" ? t.lose : result === "not_entered" ? t.notEntered : t.pending })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    if (result === "winner") { expect(screen.getByText("10000000-0000-4000-8000-000000000001")).toBeInTheDocument(); expect(screen.getByText("안동 요거트 1L")).toBeInTheDocument(); }
    if (result === "not_selected") expect(screen.queryByLabelText(t.kakaoId)).not.toBeInTheDocument();
  });
  it("provides every service string in every supported locale", () => {
    for (const language of APP_LOCALES) {
      expect(Object.keys(runmusicCopy[language])).toEqual(Object.keys(t));
      for (const value of Object.values(runmusicCopy[language])) expect(typeof value === "string" && value.trim().length > 0).toBe(true);
    }
  });
  it("shows preparation after the scheduled time without inventing a result", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse(campaign.resultsAt));
    fetchMock.mockResolvedValueOnce(Response.json(entered));
    render(<RunmusicScreen resultsOnly />);
    expect(await screen.findByRole("heading", { name: t.processing })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: t.win })).not.toBeInTheDocument();
  });
  it.each(APP_LOCALES)("renders the public prize assets and original product names for %s", async language => {
    locale.value = language; auth.authenticated = false; session.ownerId = null; fetchMock.mockResolvedValueOnce(Response.json(campaign));
    render(<RunmusicScreen />); const action = await screen.findByRole("link", { name: runmusicCopy[language].enter });
    expect(action.compareDocumentPosition(screen.getByRole("region", { name: runmusicCopy[language].prizes })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(runmusicCopy[language].title);
    expect(screen.getByAltText("RUN&MUSIC")).toHaveAttribute("src", "/images/runmusic/official-brand.webp");
    expect(screen.getByRole("img", { name: "안동 요거트 1L" }).querySelector("image")).toHaveAttribute("href", "/images/runmusic/andong-yogurt-1l.png");
    expect(screen.getByAltText("스타벅스 1만원")).toHaveAttribute("src", "/images/kyaa-wave/starbucks-10000-voucher.jpg");
  });
});
