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

describe("GGGI explicit event entry", () => {
  it.each(APP_LOCALES)("shows prize previews and a login return link in %s without submitting", async locale => {
    state.auth.authenticated = false; state.auth.user = null;
    render(<GggiEventEntry locale={locale} />);
    const t = gggiCopy[locale];
    expect(screen.getByRole("heading", { name: t.eventTitle })).toBeVisible();
    expect(screen.getByText(t.comingSoon)).toBeVisible();
    const link = await screen.findByRole("link", { name: t.login });
    const url = new URL(link.getAttribute("href")!, "https://kyaa.test");
    expect(url.searchParams.get("returnTo")).toBe(`/gggi?locale=${locale}#gggi-event`);
    expect(api.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
    expect(state.auth.getAccessToken).not.toHaveBeenCalled();
  });

  it("requires a like, refreshes after a like, and submits only on the separate button", async () => {
    liked = false;
    render(<GggiEventEntry locale="ko" />);
    expect(await screen.findByRole("button", { name: "응모하기" })).toBeDisabled();
    liked = true;
    act(() => { window.dispatchEvent(new CustomEvent(FAN_ACTIVITY_UPDATED, { detail: { ownerId: "owner-a" } })); });
    await waitFor(() => expect(screen.getByRole("button", { name: "응모하기" })).toBeEnabled());
    expect(api.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "응모하기" }));
    expect(await screen.findByText("응모가 완료됐어요")).toBeVisible();
    expect(api.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "응모하기" })).not.toBeInTheDocument();
  });

  it("restores an existing entry from the server even after closing", async () => {
    enteredAt = at; eventStatus = "closed";
    const view = render(<GggiEventEntry locale="ko" />);
    expect(await screen.findByText("응모가 완료됐어요")).toBeVisible();
    view.unmount();
    render(<GggiEventEntry locale="ko" />);
    expect(await screen.findByText("응모가 완료됐어요")).toBeVisible();
    expect(api.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
  });

  it.each([false, true])("reconciles a failed POST before offering another entry (committed=%s)", async committed => {
    api.mockImplementation(async (_input, init) => {
      if (init?.method === "POST") { if (committed) enteredAt = at; throw new TypeError("Network failed"); }
      return Response.json(status());
    });
    render(<GggiEventEntry locale="ko" />);
    fireEvent.click(await screen.findByRole("button", { name: "응모하기" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(gggiCopy.ko.error);
    expect(screen.queryByText("응모가 완료됐어요")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 확인" }));
    if (committed) expect(await screen.findByText("응모가 완료됐어요")).toBeVisible();
    else expect(await screen.findByRole("button", { name: "응모하기" })).toBeEnabled();
    expect(api.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it("prevents repeated clicks while a submission is in flight", async () => {
    let finish!: () => void;
    api.mockImplementation(async (_input, init) => {
      if (init?.method === "POST") await new Promise<void>(resolve => { finish = () => { enteredAt = at; resolve(); }; });
      return Response.json(status());
    });
    render(<GggiEventEntry locale="ko" />);
    const button = await screen.findByRole("button", { name: "응모하기" });
    fireEvent.click(button); fireEvent.click(button);
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    expect(screen.getByRole("button", { name: "응모 접수 중…" })).toBeDisabled();
    await act(async () => { finish(); });
    expect(await screen.findByText("응모가 완료됐어요")).toBeVisible();
    expect(api.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it.each(["draft", "closed"] as const)("does not offer entry in %s state", async value => {
    eventStatus = value;
    render(<GggiEventEntry locale="ko" />);
    expect(await screen.findByText(value === "draft" ? gggiCopy.ko.notOpen : gggiCopy.ko.closed)).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("requires login again for rejected authentication", async () => {
    api.mockResolvedValue(Response.json({ error: { code: "AUTHENTICATION_REQUIRED" } }, { status: 401 }));
    render(<GggiEventEntry locale="ko" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(gggiCopy.ko.authError);
    expect(screen.getByRole("link", { name: gggiCopy.ko.login })).toBeVisible();
  });

  it("rejects an authenticated response missing owned state", async () => {
    api.mockResolvedValue(Response.json({ ...status(), participation: null }));
    render(<GggiEventEntry locale="ko" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(gggiCopy.ko.error);
    expect(screen.queryByRole("button", { name: "응모하기" })).not.toBeInTheDocument();
  });

  it("waits for the app session and clears old ownership on account changes", async () => {
    state.session.ready = false;
    const view = render(<GggiEventEntry locale="ko" />);
    expect(screen.getByRole("status")).toHaveTextContent(gggiCopy.ko.checking);
    expect(api).not.toHaveBeenCalled();
    state.session.ready = true; enteredAt = at;
    view.rerender(<GggiEventEntry locale="ko" />);
    expect(await screen.findByText("응모가 완료됐어요")).toBeVisible();
    state.auth.user = { id: "owner-b" }; enteredAt = null;
    view.rerender(<GggiEventEntry locale="ko" />);
    expect(screen.queryByText("응모가 완료됐어요")).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "응모하기" })).toBeEnabled();
  });
});
