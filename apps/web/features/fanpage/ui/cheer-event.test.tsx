import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CheerEventBanner, CheerEventDetail, CheerEventFeedback, CheerEventModal, cheerEventHref, cheerEventStorageKey, localEventDay, useCheerEvent, type CheerEvent } from "./cheer-event";
import { APP_LOCALES } from "@/i18n/locales";
import { cheerEventCopy } from "../domain/cheer-event-copy";
let ready = true, authenticated = true;
const getAccessToken = vi.fn(async () => "token");
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => ({ ready, authenticated, user: authenticated ? { id: "owner" } : null, getAccessToken }) }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => ({ ready, ownerId: authenticated ? "owner" : null, generation: 0 }) }));
const event: CheerEvent = {
  campaignId: "d7000000-0000-4000-8000-000000000001", creatorSlug: "changha", liveEventId: "d7000000-0000-4000-8000-000000000002", liveSlug: "changha-wave", liveStartsAt: "2026-10-22T10:45:00Z", reservationOpensAt: "2026-10-18T00:00:00Z", reservationClosesAt: "2026-10-22T10:45:00Z", reservationAvailable: true, entryOpensAt: "2026-10-18T00:00:00Z", entryClosesAt: "2026-10-22T10:00:00Z", status: "open", participation: null,
  photocard: { collectionId: "d7000000-0000-4000-8000-000000000005", title: "Photocard", eligible: null, assets: [] },
  prizes: [{ benefitId: "d7000000-0000-4000-8000-000000000003", title: "Changha", kind: "coffee_chat", imageUrl: null, winnerQuantity: 20 }, { benefitId: "d7000000-0000-4000-8000-000000000004", title: "Eliena", kind: "hotel_coffee", imageUrl: "/images/kyaa-wave/eliena-cafe-01.jpg", winnerQuantity: 5 }],
};
const props = { event, slug: "changha", name: "창하", locale: "ko" as const };
beforeEach(() => { ready = true; authenticated = true; localStorage.clear(); vi.stubGlobal("fetch", vi.fn(async () => Response.json({ total: 0, comments: [], nextCursor: null }))); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("campaign modal", () => {
  it("starts unchecked, traps focus, closes on Escape and does not immediately reopen", async () => {
    const view = render(<CheerEventModal {...props} enabled />);
    const dialog = await screen.findByRole("dialog");
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    const close = screen.getAllByRole("button", { name: "닫기" })[0];
    await waitFor(() => expect(close).toHaveFocus());
    const last = screen.getAllByRole("button", { name: "닫기" })[1];
    last.focus(); fireEvent.keyDown(document, { key: "Tab" }); expect(close).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(dialog).not.toBeInTheDocument();
    fireEvent.focus(window); view.rerender(<CheerEventModal {...props} enabled />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(localStorage.getItem(cheerEventStorageKey(event.campaignId, props.slug))).toBeNull();
  });
  it.each(["Escape", "close", "cta"])("persists checked dismissal via %s for this creator and campaign only", async method => {
    const view = render(<CheerEventModal {...props} enabled />);
    await screen.findByRole("dialog"); fireEvent.click(screen.getByRole("checkbox"));
    if (method === "Escape") fireEvent.keyDown(document, { key: "Escape" });
    else if (method === "cta") { const cta = screen.getByRole("link", { name: /응원댓글 남기기/ }); expect(cta).toHaveAttribute("href", cheerEventHref(props.slug, "ko")); fireEvent.click(cta); }
    else fireEvent.click(screen.getAllByRole("button", { name: "닫기" })[0]);
    expect(localStorage.getItem(cheerEventStorageKey(event.campaignId, "changha"))).toBe("hidden");
    view.unmount();
    const hidden = render(<CheerEventModal {...props} enabled />); expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); hidden.unmount();
    const otherCreator = render(<CheerEventModal {...props} slug="wena" name="위나" event={{ ...event, creatorSlug: "wena" }} enabled />);
    expect(await screen.findByRole("dialog", { name: "위나 팬페이지 이벤트" })).toBeInTheDocument(); otherCreator.unmount();
    render(<CheerEventModal {...props} event={{ ...event, campaignId: "different" }} enabled />); expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
  it("uses the device's calendar date and permits redisplay after local midnight", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 18, 23, 59));
    expect(localEventDay()).toBe("2026-10-18");
    render(<CheerEventModal {...props} enabled />); await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("checkbox")); fireEvent.keyDown(document, { key: "Escape" });
    const oldKey = cheerEventStorageKey(event.campaignId, "changha");
    vi.setSystemTime(new Date(2026, 9, 19, 0, 1)); fireEvent.focus(window);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(cheerEventStorageKey(event.campaignId, "changha")).not.toBe(oldKey);
  });
  it("can dismiss and navigate when storage access throws", async () => {
    vi.spyOn(localStorage, "getItem").mockImplementation(() => { throw new Error("denied"); });
    vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new Error("denied"); });
    render(<CheerEventModal {...props} enabled />); await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("link", { name: /응원댓글 남기기/ }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("waits for auth and for other dialogs or active text input to finish", async () => {
    ready = false;
    const other = document.createElement("div"); other.setAttribute("role", "dialog"); document.body.append(other);
    const view = render(<CheerEventModal {...props} enabled />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    ready = true; view.rerender(<CheerEventModal {...props} enabled />); expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    const input = document.createElement("input"); document.body.append(input); input.focus(); other.remove();
    await act(async () => {}); expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    input.blur(); input.remove(); fireEvent.focus(window);
    expect(await screen.findByRole("checkbox")).not.toBeChecked();
  });
  it("does not promote on the event tab, upcoming or closed campaigns", () => {
    const view = render(<CheerEventModal {...props} enabled={false} />); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    for (const status of ["upcoming", "closed"] as const) { view.rerender(<CheerEventModal {...props} event={{ ...event, status }} enabled />); expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); }
  });
});

it("has complete UI copy for every app language, without unresolved keys", () => {
  for (const locale of APP_LOCALES) {
    const copy = cheerEventCopy(locale);
    for (const value of Object.values(copy)) expect(value?.trim()).toBeTruthy();
    const view = render(<CheerEventBanner {...props} locale={locale} />);
    expect(screen.getAllByRole("article")).toHaveLength(3); expect(screen.getByRole("link")).toHaveAttribute("href", cheerEventHref(props.slug, locale)); view.unmount();
  }
});
it("uses the real LIVE destination, account-only entry rules and server participation", async () => {
  render(<CheerEventDetail {...props} event={{ ...event, participation: { entered: true, enteredAt: event.entryOpensAt, reserved: true, weight: 2 } }} onPosted={vi.fn()} />);
  expect(screen.getByRole("link", { name: /LIVE 예약 완료/ })).toHaveAttribute("href", "/live/changha-wave?locale=ko");
  expect(screen.getByText(/이벤트 참여가 확인됐어요/)).toHaveAttribute("role", "status");
  await screen.findByText("첫 응원을 남겨 주세요.");
  expect(screen.getAllByText(/응모권은 사용하지 않아요/).length).toBeGreaterThan(0);
});
it("keeps guests on the event return route and closes only event submission", async () => {
  authenticated = false;
  const view = render(<CheerEventDetail {...props} onPosted={vi.fn()} />);
  const login = await screen.findByRole("link", { name: "로그인하고 응원 남기기" });
  expect(login.getAttribute("href")).toContain(encodeURIComponent(cheerEventHref(props.slug, "ko")));
  authenticated = true; view.rerender(<CheerEventDetail {...props} event={{ ...event, status: "closed" }} onPosted={vi.fn()} />);
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument(); expect(screen.getByText("참여가 마감됐어요")).toBeInTheDocument();
});
it("invalidates only after the existing cheer POST succeeds, without optimistic participation", async () => {
  let success = false; const onPosted = vi.fn();
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => init?.method === "POST" ? Response.json(success ? { id: "cheer", replayed: false } : {}, { status: success ? 200 : 503 }) : Response.json({ total: 0, comments: [], nextCursor: null })));
  render(<CheerEventDetail {...props} onPosted={onPosted} />);
  const input = await screen.findByRole("textbox"); fireEvent.change(input, { target: { value: "응원해요!" } });
  fireEvent.click(screen.getByRole("button", { name: /응원 보내기/ })); await screen.findByRole("alert"); expect(onPosted).not.toHaveBeenCalled();
  success = true; fireEvent.click(screen.getByRole("button", { name: /응원 보내기/ })); await waitFor(() => expect(onPosted).toHaveBeenCalledTimes(1));
  expect(screen.queryByText("이벤트 참여가 확인됐어요")).not.toBeInTheDocument();
});
it("drops confirmed participation on refresh failure while preserving the comment form", async () => {
  const fetcher = vi.fn(async () => Response.json({ event: { ...event, participation: { entered: true, enteredAt: event.entryOpensAt, reserved: false, weight: 1 } } }));
  vi.stubGlobal("fetch", fetcher);
  const { result } = renderHook(() => useCheerEvent("changha", "ko"));
  await waitFor(() => expect(result.current.event?.participation?.entered).toBe(true));
  fetcher.mockImplementation(async () => Response.json({}, { status: 503 })); act(() => result.current.refresh());
  await waitFor(() => expect(result.current.event?.participation).toBeNull());
  expect(result.current.event?.campaignId).toBe(event.campaignId);
});

it("restores focus to the element active before the modal", async () => {
  const trigger = document.createElement("button"); trigger.textContent = "Fan page"; document.body.append(trigger); trigger.focus();
  render(<CheerEventModal {...props} enabled />); await screen.findByRole("dialog");
  fireEvent.keyDown(document, { key: "Escape" });
  await waitFor(() => expect(trigger).toHaveFocus()); trigger.remove();
});
it("does not promote a successful response for a different creator", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ event: { ...event, creatorSlug: "wena" } })));
  const { result } = renderHook(() => useCheerEvent("changha", "ko"));
  await act(async () => {}); expect(result.current.event).toBeNull();
});

it("labels the promotional deadline and stops reservation incentives when reservations are closed", async () => {
  const view = render(<CheerEventBanner {...props} />);
  expect(screen.getByText(/참여 마감 예정/)).toBeInTheDocument();
  view.rerender(<CheerEventDetail {...props} event={{...event, reservationAvailable: false}} onPosted={vi.fn()} />);
  expect(screen.queryByRole("link", {name:/LIVE 예약하기/})).not.toBeInTheDocument();
  expect(screen.getByRole("link", {name:"LIVE 확인하기"})).toHaveAttribute("href","/live/changha-wave?locale=ko");
  expect(screen.getAllByText(/현장 추첨 시 예정보다 일찍/).length).toBeGreaterThan(0);
  await screen.findByText("첫 응원을 남겨 주세요.");
});

it("shows event loading, recoverable errors and unverified participation distinctly from no campaign", () => {
 const refresh=vi.fn();
 const view=render(<CheerEventFeedback status="loading" refresh={refresh} locale="ko" />);
 expect(screen.getByRole("status")).toHaveTextContent("이벤트를 불러오고 있어요");
 view.rerender(<CheerEventFeedback status="error" refresh={refresh} locale="ko" />);
 expect(screen.getByRole("alert")).toHaveTextContent("이벤트를 불러오지 못했어요");
 fireEvent.click(screen.getByRole("button",{name:"다시 확인"})); expect(refresh).toHaveBeenCalledOnce();
 view.rerender(<CheerEventFeedback status="ready" refreshFailed refresh={refresh} locale="ko" />);
 expect(screen.getByRole("alert")).toHaveTextContent("참여·예약 상태를 확인하지 못했어요");
 view.rerender(<CheerEventFeedback status="ready" refresh={refresh} locale="ko" />);
 expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("expires the reservation incentive at the actual reservation cutoff without a page reload", async () => {
 vi.useFakeTimers();vi.setSystemTime(new Date("2026-10-22T10:44:59.950Z"));
 vi.stubGlobal("fetch",vi.fn(async()=>Response.json({event})));
 const {result}=renderHook(()=>useCheerEvent("changha","ko",event));
 expect(result.current.event?.reservationAvailable).toBe(true);
 await act(async()=>{await vi.advanceTimersByTimeAsync(100);});
 expect(result.current.event?.reservationAvailable).toBe(false);
});

it("resynchronizes time when a response arrives after reservations have opened", async () => {
 vi.useFakeTimers();vi.setSystemTime(new Date("2026-10-17T23:59:59.950Z"));
 let resolve!: (response:Response)=>void;
 vi.stubGlobal("fetch",vi.fn(()=>new Promise<Response>(done=>{resolve=done;})));
 const {result}=renderHook(()=>useCheerEvent("changha","ko"));
 await act(async()=>{await vi.advanceTimersByTimeAsync(100);});
 await act(async()=>resolve(Response.json({event})));
 await act(async()=>{await vi.advanceTimersByTimeAsync(1);});
 expect(result.current.event?.reservationAvailable).toBe(true);
});

it("renders server campaign content immediately without sharing any owner confirmation", async () => {
 let resolve!: (value:Response)=>void;
 vi.stubGlobal("fetch",vi.fn(()=>new Promise<Response>(done=>{resolve=done;})));
 const {result}=renderHook(()=>useCheerEvent("changha","ko",{...event,participation:{entered:true,enteredAt:event.entryOpensAt,reserved:true,weight:2}}));
 expect(result.current.event?.campaignId).toBe(event.campaignId);
 expect(result.current.event?.participation).toBeNull();
 expect(result.current.status).toBe("ready");
 await waitFor(()=>expect(fetch).toHaveBeenCalled());
 await act(async()=>resolve(Response.json({event:null})));
 expect(result.current.event).toBeNull();
});

it("shows creator-specific rewards by kind even when reordered", () => {
 const view=render(<CheerEventBanner {...props} event={{...event,prizes:[...event.prizes].reverse()}} />);
 expect(screen.getByText("창하 팬 커피챗")).toBeInTheDocument();expect(screen.getByText("20명 추첨")).toBeInTheDocument();expect(screen.getByText("응원댓글 참여자 전원")).toBeInTheDocument();
 expect(screen.getAllByRole("article")).toHaveLength(3);
 view.rerender(<CheerEventBanner {...props} slug="wena" name="We;Na" event={{...event,creatorSlug:"wena",prizes:event.prizes.filter(prize=>prize.kind==="hotel_coffee")}} />);
 expect(screen.getAllByRole("article")).toHaveLength(2);expect(screen.queryByText("창하 팬 커피챗")).not.toBeInTheDocument();
});
it("keeps eligible photocards pending without public substitute images or an active viewer",async()=>{
 render(<CheerEventDetail {...props} event={{...event,photocard:{...event.photocard!,eligible:true}}} onPosted={vi.fn()} />);
 expect(screen.getByText("포토카드 준비 중")).toHaveAttribute("role","status");expect(screen.queryByRole("button",{name:"포토카드 보기"})).not.toBeInTheDocument();
 expect(screen.queryByRole("dialog")).not.toBeInTheDocument();await screen.findByText("첫 응원을 남겨 주세요.");
});

it("keeps a standard campaign's original gift without a photocard benefit", () => {
 render(<CheerEventBanner {...props} event={{...event,photocard:null,prizes:[{...event.prizes[1],kind:null,title:"Original gift"}]}} />);
 expect(screen.getAllByRole("article")).toHaveLength(1);expect(screen.getByRole("heading",{name:"Original gift"})).toBeInTheDocument();
 expect(screen.queryByText("미공개 디지털 포토카드")).not.toBeInTheDocument();expect(screen.queryByText("응원댓글 참여자 전원")).not.toBeInTheDocument();
 expect(decodeURIComponent(screen.getByRole("presentation").getAttribute("src")!)).toContain("/images/kyaa-wave/eliena-cafe-01.jpg");
});
