import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ko from "@/features/chemi/i18n/locales/ko/chemi.json";
import { APP_LOCALES } from "@/i18n/locales";
import { getGrowthCopy } from "./copy";
import { ChemiGrowth, type GrowthState } from "./growth";
import { getRoomLines } from "./room-lines";

const auth = vi.hoisted(() => ({ ready: true, authenticated: true, getAccessToken: async () => "token", login: vi.fn() }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => auth }));

const state: GrowthState = {
  fresh: [],
  full: ["star"],
  minis: [
    { character: "changha", exp: 490, level: 7, today: ["fortune"], album: [{ slot: 1, date: "2026-11-08" }, { slot: 2, date: "2026-11-14" }] },
    { character: "elina", exp: 90, level: 3, today: [], album: [{ slot: 1, date: "2026-11-12" }] },
    { character: "yuna", exp: 30, level: 1, today: [], album: [] },
  ],
};
const respond = (body: unknown, ok = true) => vi.fn(async () => ({ ok, status: ok ? 200 : 503, json: async () => body }));
const show = () => render(<ChemiGrowth locale="ko" home={ko.home} matchAvailable />);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  auth.authenticated = true;
});

it("shows the raised mini, its level and today's remaining contents", async () => {
  vi.stubGlobal("fetch", respond(state));
  show();
  expect(await screen.findByText("창하 친밀 Lv")).toBeTruthy();
  expect(screen.getByRole("progressbar").getAttribute("aria-valuetext")).toBe("490/640");
  expect(screen.getByText("신인 · 친밀 160 남음")).toBeTruthy();
  expect(screen.getByText("2 / 6")).toBeTruthy();
  expect(screen.getByText("받음")).toBeTruthy();
  // 받을 친밀·받은 표시는 입구 목록과 같은 알약(AffinityBadge)이다.
  expect(screen.getAllByRole("img", { name: /^친밀 \+\d+/ }).length).toBeGreaterThan(0);
  expect(screen.getByText("오늘 다 받음")).toBeTruthy();
  expect(screen.getByRole("link", { name: "최애 사주 보기" }).getAttribute("href")).toBe("/chemi/saju?locale=ko");
  // 최애 런도 하루 친밀을 준다(chemi_run_finish).
  expect(screen.getByRole("link", { name: /최애 런/ }).getAttribute("href")).toBe("/chemi/games/run?locale=ko");
});

it("starts raising a creator that is not raised yet", async () => {
  const adopted = { ...state, minis: state.minis.map((mini) => mini.character === "yuna" ? { ...mini, album: [{ slot: 1, date: "2026-11-21" }] } : mini) };
  const fetcher = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => state })
    .mockResolvedValueOnce({ ok: true, json: async () => adopted });
  vi.stubGlobal("fetch", fetcher);
  show();
  fireEvent.click(await screen.findByRole("button", { name: "유나" }));
  expect(screen.getByText("내 첫 번째 팬, 어디 없나?")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "유나 키우기" }));
  await waitFor(() => expect(screen.getByText("1 / 6")).toBeTruthy());
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ action: "adopt", character: "yuna" });
});

it("shows a signed-out visitor the room without values", () => {
  auth.authenticated = false;
  const fetcher = respond(state);
  vi.stubGlobal("fetch", fetcher);
  show();
  expect(screen.getByText("예시 화면")).toBeTruthy();
  expect(screen.getByRole("button", { name: "로그인하고 키우기" })).toBeTruthy();
  expect(screen.queryByRole("progressbar")).toBeNull();
  expect(screen.queryByText(/친밀 \+/)).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});

it("offers a retry when loading fails", async () => {
  vi.stubGlobal("fetch", respond({}, false));
  show();
  expect(await screen.findByText(/불러오지 못했습니다/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
});

it("has every key in every language", () => {
  const keys = Object.keys(getGrowthCopy("ko"));
  for (const locale of APP_LOCALES) {
    const copy = getGrowthCopy(locale);
    expect(Object.keys(copy)).toEqual(keys);
    for (const value of Object.values(copy)) expect(value).not.toBe("");
    for (const key of ["mini", "closeness", "adopt"] as const) expect(copy[key]).toContain("{name}");
    expect(copy.gain).toContain("{n}");
  }
});

it("changes the mini's line on tap, pets on a long press and gets dizzy on rapid taps", async () => {
  vi.stubGlobal("fetch", respond(state));
  show();
  const mini = await screen.findByRole("button", { name: "미니 창하" });
  vi.useFakeTimers();
  const tapLines: readonly string[] = getRoomLines("ko", "changha").tap;
  fireEvent.click(mini);
  expect(tapLines).toContain(mini.closest("[data-mode]")!.parentElement!.querySelector("p")!.textContent);
  act(() => vi.advanceTimersByTime(3000));
  fireEvent.pointerDown(mini, { button: 0 });
  act(() => vi.advanceTimersByTime(500));
  expect(screen.getByText("헤헤, 좀 더 해 줘.")).toBeTruthy();
  fireEvent.pointerUp(mini);
  // 쓰다듬기 뒤 손을 뗄 때 오는 click 은 톡 치기로 세지 않는다.
  fireEvent.click(mini);
  expect(screen.getByText("헤헤, 좀 더 해 줘.")).toBeTruthy();
  for (let index = 0; index < 4; index += 1) fireEvent.click(mini);
  expect(screen.getByText("어지러워… 살살 눌러 줘.")).toBeTruthy();
});

it("keeps Elina's half-formal tone in Korean", async () => {
  vi.stubGlobal("fetch", respond(state));
  show();
  fireEvent.click(await screen.findByRole("button", { name: /^엘리나/ }));
  expect(screen.getByText("여기가 제 방이에요? 오늘부터 연습할게요.")).toBeTruthy();
});

it("has every room line in every language", () => {
  for (const locale of APP_LOCALES) {
    const lines = getRoomLines(locale, "changha");
    expect(lines.tap).toHaveLength(3);
    for (const value of [...lines.tap, lines.pet, lines.dizzy, lines.cat, lines.tea, lines.lamp]) expect(value).not.toBe("");
  }
});

it("shows the room for the mini's stage and fades in a newly reached stage once", async () => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  vi.stubGlobal("fetch", respond({ ...state, fresh: [{ character: "changha", slot: 2 }] }));
  const { container } = show();
  const rooms = () => [...container.querySelectorAll<HTMLImageElement>("img[data-room-stage]")].map((img) => img.dataset.roomStage);
  await waitFor(() => expect(rooms()).toEqual(["kid"]));
  const room = container.querySelector<HTMLImageElement>("img[data-room-stage]")!;
  expect(room.getAttribute("srcset")).toContain("/chemi/grow/room-changha-kid-1280.webp 1280w");
  expect(room).toHaveAttribute("data-entering");
  fireEvent.click(screen.getByRole("button", { name: /^엘리나/ }));
  await waitFor(() => expect(rooms()).toEqual(["baby"]));
});
