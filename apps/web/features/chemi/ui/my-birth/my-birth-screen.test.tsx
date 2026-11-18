import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import koCatalog from "@/features/chemi/i18n/locales/ko/chemi.json";
import type { ChemiProfileResponse } from "@/features/chemi/domain/contracts/profile";

const resource = vi.hoisted(() => ({ state: { status: "loading" } as unknown, retry: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ back: vi.fn(), push: vi.fn() }) }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => ({ ready: true, authenticated: true, user: { id: "u" }, getAccessToken: async () => "t" }) }));
vi.mock("@/components/fan-ui/use-owned-fan-resource", () => ({ useOwnedFanResource: () => resource }));
vi.mock("@/components/fan-ui/fan-toast", () => ({ showFanToast: vi.fn() }));
import { MyBirthScreen, type MyBirthUses } from "./my-birth-screen";

const copy = koCatalog.myBirth;
const uses: MyBirthUses = [
  { id: "saju", name: "최애 사주", href: null, image: "/chemi/my-saju-512.webp" },
  { id: "fortune", name: "오늘의 운세", href: "/chemi/fortune?locale=ko", image: "/chemi/my-fortune-512.webp" },
];
const summary = { readingDays: 34, askThreads: 6, partners: 2, orders: 0, askPassesLeft: 0, sajuReading: true, fortuneToday: true, starToday: false };
const profile = (over: Partial<ChemiProfileResponse> = {}): ChemiProfileResponse => ({
  birth: { birthDate: "1995-05-05", calendar: "solar", birthTime: "14:30", timePrecision: "exact", gender: "female", birthPlace: "서울특별시", ageBand: "adult", editableFrom: null },
  consent: { version: "chemi-birth-v1", at: "2026-11-16T15:00:00.000Z" },
  partners: [
    { id: "b3e1c2d4-0000-4000-8000-000000000002", nickname: "민지", birthDate: "1997-03-12", calendar: "solar", birthTime: null, timePrecision: "unknown", gender: "female", source: "saju", lastUsedAt: "2026-11-01T00:00:00Z" },
  ],
  partnerLimit: 10,
  birthMark: { stem: "을", branch: "해", animal: "돼지", element: "wood" },
  summary,
  ...over,
});
const draw = (launch = false) => render(<MyBirthScreen locale="ko" copy={copy} uses={uses} launch={launch} />);
beforeEach(() => { resource.state = { status: "ready", data: profile() }; });

describe("MY 내 생일 정보", () => {
  it("shows the card with the birth mark, values, partners, consent date and the used-by tiles with their state", () => {
    draw();
    expect(screen.getByRole("heading", { level: 1, name: "내 생일 정보" })).toBeTruthy();
    expect(screen.getByText("을해년 · 돼지띠")).toBeTruthy();
    expect(screen.getByText("1995.05.05 · 양력")).toBeTruthy();
    expect(screen.getByText("오후 2:30")).toBeTruthy();
    expect(screen.getByText("서울특별시")).toBeTruthy();
    expect(screen.getByText("1997.03.12")).toBeTruthy();
    expect(screen.getByText("시간 모름")).toBeTruthy();
    expect(screen.getByText("1/10")).toBeTruthy();
    expect(screen.getByText("2026.11.17 동의함")).toBeTruthy();
    expect(screen.getByText("풀이 있음")).toBeTruthy();
    expect(screen.getByText("오늘 결과 있음")).toBeTruthy();
    expect(screen.getByRole("link", { name: /오늘의 운세/ }).getAttribute("href")).toBe("/chemi/fortune?locale=ko");
    expect(screen.getByRole("button", { name: "고치기" })).toBeTruthy();
  });

  it("replaces the edit button with the unlock date inside the 30 days and offers to fill what was left empty", () => {
    resource.state = { status: "ready", data: profile({ birth: { ...profile().birth!, birthTime: null, timePrecision: "unknown", birthPlace: null, editableFrom: "2026-12-17T15:00:00.000Z" } }) };
    draw();
    expect(screen.getByText("12월 18일부터 고치기")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "고치기" })).toBeNull();
    expect(screen.getByRole("button", { name: "태어난 시간 넣기" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "태어난 곳 넣기" })).toBeTruthy();
  });

  it("shows only the entry button before anything is saved and hides partners, consent and the wipe", () => {
    resource.state = { status: "ready", data: profile({ birth: null, consent: null, partners: [], birthMark: null }) };
    draw();
    expect(screen.getAllByText("입력 전")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "입력하기" })).toBeTruthy();
    expect(screen.queryByText("궁합 상대")).toBeNull();
    expect(screen.queryByRole("button", { name: "생일 정보 모두 지우기" })).toBeNull();
  });

  it("keeps the production mix without the partner card", () => {
    draw(true);
    expect(screen.queryByText("궁합 상대")).toBeNull();
    expect(screen.getByRole("button", { name: "생일 정보 모두 지우기" })).toBeTruthy();
  });

  it("lists what the wipe removes with counts, and what stays", () => {
    resource.state = { status: "ready", data: profile({ summary: { ...summary, orders: 6, askPassesLeft: 11 } }) };
    draw();
    fireEvent.click(screen.getByRole("button", { name: "생일 정보 모두 지우기" }));
    const dialog = screen.getByRole("alertdialog");
    for (const text of ["생일 원본·출생 정보", "34일치", "6개", "2명", "구매 내역", "6건", "질문 11개", "되돌릴 수 없어요."]) expect(within(dialog).getByText(text)).toBeTruthy();
  });

  it("shows one failure line with a retry in the card when the read fails, and a login prompt for a guest", () => {
    resource.state = { status: "error", kind: "network" };
    const { unmount } = draw();
    expect(screen.getByText("불러오지 못했습니다.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(resource.retry).toHaveBeenCalled();
    unmount();
    resource.state = { status: "error", kind: "auth" };
    draw();
    expect(screen.getByRole("link", { name: "로그인" })).toBeTruthy();
  });
});
