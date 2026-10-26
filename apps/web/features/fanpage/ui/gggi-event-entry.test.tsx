import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";
import { gggiCopy } from "@/i18n/catalogs/features__fanpage__gggi";
import { FAN_ACTIVITY_UPDATED } from "@/components/fan-ui/fan-activity-updates";
import { GggiEventEntry } from "./gggi-event-entry";

const state = vi.hoisted(() => ({
  auth: { ready: true, authenticated: true, user: { id: "owner-a" } as { id: string } | null, getAccessToken: vi.fn(async () => "token") },
  session: { ready: true, ownerId: null as string | null, generation: 0 },
}));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => state.auth }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => state.session }));

let liked: boolean;
let enteredAt: string | null;
let eventStatus: "draft" | "open" | "closed";
const at = "2026-10-26T06:00:00Z";
const status = () => ({ eventKey: "gggi-goods-2026", status: eventStatus, participation: state.auth.authenticated ? { liked, enteredAt } : null });
const api = vi.fn<typeof fetch>();
beforeEach(() => {
  liked = true; enteredAt = null; eventStatus = "open";
  state.auth.ready = true; state.auth.authenticated = true; state.auth.user = { id: "owner-a" };
  state.auth.getAccessToken.mockResolvedValue("token");
  state.session.ready = true; state.session.ownerId = null; state.session.generation = 0;
  api.mockReset().mockImplementation(async (_input, init) => {
    if (init?.method === "POST") enteredAt ??= at;
    return Response.json(status());
  });
  vi.stubGlobal("fetch", api);
});

describe("GGGI automatic event entry", () => {
  beforeEach(() => {
    localStorage.setItem("gggi-event-dismissed-day", new Date().toLocaleDateString("en-CA"));
  });
  it.each(APP_LOCALES)("shows automatic-entry guidance in %s without guest submission", async locale => {
    state.auth.authenticated = false; state.auth.user = null;
    render(<GggiEventEntry locale={locale} />);
    const t = gggiCopy[locale];
    expect(screen.getByRole("heading", { name: t.eventTitle })).toBeVisible();
    expect(screen.getByText(t.entryHelp)).toBeVisible();
    const link = await screen.findByRole("link", { name: t.login });
    expect(new URL(link.getAttribute("href")!, "https://kyaa.test").searchParams.get("returnTo")).toBe(`/gggi?locale=${locale}#gggi-event`);
    expect(api.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
    expect(state.auth.getAccessToken).not.toHaveBeenCalled();
  });
  it("automatically enters after a like and confirms only after the POST", async () => {
    liked = false;
    render(<GggiEventEntry locale="ko" />);
    expect(await screen.findByRole("link", { name: gggiCopy.ko.likeToEnter })).toHaveAttribute("href", "#first-reaction");
    expect(api.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
    liked = true;
    act(() => { window.dispatchEvent(new CustomEvent(FAN_ACTIVITY_UPDATED, { detail: { ownerId: "owner-a" } })); });
    expect(await screen.findByRole("dialog", { name: gggiCopy.ko.entered })).toBeVisible();
    fireEvent.click(screen.getAllByRole("button", { name: gggiCopy.ko.close }).at(-1)!);
    expect(screen.getByRole("status")).toHaveTextContent(gggiCopy.ko.entered);
    expect(api.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: gggiCopy.ko.enter })).not.toBeInTheDocument();
  });
  it("suppresses automatic modals for existing entrants even without today's dismissal", async () => {
    localStorage.clear(); enteredAt = at;
    render(<GggiEventEntry locale="ko" />);
    expect(await screen.findByText(gggiCopy.ko.entered)).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
  });
  it("dismisses promotion for today and allows it on the next day", async () => {
    liked = false; localStorage.clear();
    const view = render(<GggiEventEntry locale="ko" />);
    expect(await screen.findByRole("dialog", { name: gggiCopy.ko.eventTitle })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: gggiCopy.ko.dismissToday }));
    view.unmount();
    const again = render(<GggiEventEntry locale="ko" />);
    await screen.findByRole("link", { name: gggiCopy.ko.likeToEnter });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    again.unmount(); localStorage.setItem("gggi-event-dismissed-day", "2000-01-01");
    render(<GggiEventEntry locale="ko" />);
    expect(await screen.findByRole("dialog")).toBeVisible();
  });
  it.each([false, true])("reconciles failed automatic entry on retry (committed=%s)", async committed => {
    let failed = false;
    api.mockImplementation(async (_input, init) => {
      if (init?.method === "POST") {
        if (!failed) { failed = true; if (committed) enteredAt = at; throw new TypeError("Network failed"); }
        enteredAt = at;
      }
      return Response.json(status());
    });
    render(<GggiEventEntry locale="ko" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(gggiCopy.ko.error);
    expect(screen.queryByText(gggiCopy.ko.entered)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: gggiCopy.ko.retry }));
    await waitFor(() => expect(enteredAt).toBe(at));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(api.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(committed ? 1 : 2);
  });
  it.each(["draft", "closed"] as const)("does not submit or automatically open in %s state", async value => {
    localStorage.clear(); eventStatus = value;
    render(<GggiEventEntry locale="ko" />);
    expect(await screen.findByText(value === "draft" ? gggiCopy.ko.notOpen : gggiCopy.ko.closed)).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
  });
  it("requires login again for rejected authentication", async () => {
    api.mockResolvedValue(Response.json({ error: { code: "AUTHENTICATION_REQUIRED" } }, { status: 401 }));
    render(<GggiEventEntry locale="ko" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(gggiCopy.ko.authError);
    expect(screen.getByRole("link", { name: gggiCopy.ko.login })).toBeVisible();
  });
  it("does not duplicate automatic submissions while a write is pending", async () => {
    let finish!: () => void;
    api.mockImplementation(async (_input, init) => {
      if (init?.method === "POST") await new Promise<void>(resolve => { finish = () => { enteredAt = at; resolve(); }; });
      return Response.json(status());
    });
    render(<GggiEventEntry locale="ko" />);
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    act(() => {
      window.dispatchEvent(new CustomEvent(FAN_ACTIVITY_UPDATED, { detail: { ownerId: "owner-a" } }));
      window.dispatchEvent(new Event("focus"));
    });
    expect(screen.getByRole("status")).toHaveTextContent(gggiCopy.ko.submitting);
    expect(api.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    await act(async () => { finish(); });
    expect(await screen.findByRole("dialog", { name: gggiCopy.ko.entered })).toBeVisible();
  });
  it("rejects responses missing authenticated owner state", async () => {
    api.mockResolvedValue(Response.json({ ...status(), participation: null }));
    render(<GggiEventEntry locale="ko" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(gggiCopy.ko.error);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("waits for session ownership and clears old completion on account changes", async () => {
    state.session.ready = false;
    const view = render(<GggiEventEntry locale="ko" />);
    expect(api).not.toHaveBeenCalled();
    state.session.ready = true; enteredAt = at;
    view.rerender(<GggiEventEntry locale="ko" />);
    expect(await screen.findByText(gggiCopy.ko.entered)).toBeVisible();
    state.auth.user = { id: "owner-b" }; enteredAt = null; liked = false;
    view.rerender(<GggiEventEntry locale="ko" />);
    expect(screen.queryByText(gggiCopy.ko.entered)).not.toBeInTheDocument();
    expect(await screen.findByRole("link", { name: gggiCopy.ko.likeToEnter })).toBeVisible();
  });
});
