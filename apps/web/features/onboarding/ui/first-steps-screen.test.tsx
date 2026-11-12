import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { firstStepsProgress, type FirstStepsFacts } from "../domain/first-steps";
import type { FirstStepsView } from "./use-first-steps";

const state = vi.hoisted(() => ({ view: { status: "guest" } as FirstStepsView, slam: vi.fn(async () => {}) }));
vi.mock("./use-first-steps", () => ({ useFirstSteps: () => state.view }));
vi.mock("@/features/dukjil/ui/stamp-slam", () => ({ playStampSlam: state.slam }));

import { FirstStepsScreen } from "./first-steps-screen";
import { FirstStepsHomeBanner } from "./first-steps-home-banner";
import { firstStepsHomeBanner } from "@/features/home/domain/first-steps-home-banner";

const member = (facts: FirstStepsFacts, streak = 0): FirstStepsView => ({ status: "member", facts, progress: firstStepsProgress(facts), streak });
const elina = { slug: "elina", name: "엘리나" };

describe("FirstStepsScreen", () => {
  beforeEach(() => { state.slam.mockClear(); window.sessionStorage.clear(); });

  it("shows three steps and a sign-in action to guests", () => {
    state.view = { status: "guest" };
    render(<FirstStepsScreen locale="ko" />);
    expect(screen.getByRole("heading", { level: 1, name: "첫 걸음" })).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0");
    expect(screen.getByRole("link", { name: "로그인" }).getAttribute("href")).toBe("/login?returnTo=%2Fonboarding%3Flocale%3Dko&locale=ko");
    expect(screen.getByRole("link", { name: /모임 가입/ }).getAttribute("href")).toBe("/pages/groups?locale=ko");
  });

  it("leads a member to the next step and marks finished ones", () => {
    state.view = member({ joinedPages: [elina], passports: [], attended: false });
    render(<FirstStepsScreen locale="ko" />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("1");
    expect(screen.getByRole("link", { name: "팬 인증하기" }).getAttribute("href")).toBe("/c/elina/verify?locale=ko");
    expect(document.querySelector('[data-mission="first-step-join"]')?.getAttribute("data-done")).toBe("true");
    expect(screen.getByText("엘리나")).toBeTruthy();
    expect(state.slam).not.toHaveBeenCalled();
  });

  it("stamps once when all three are done", () => {
    state.view = member({ joinedPages: [elina], passports: [elina], attended: true }, 2);
    const { unmount } = render(<FirstStepsScreen locale="ko" />);
    expect(screen.getByRole("link", { name: "덕질하러 가기" }).getAttribute("href")).toBe("/benefits?locale=ko");
    expect(screen.getByText("연속 2일")).toBeTruthy();
    expect(state.slam).toHaveBeenCalledTimes(1);
    unmount();
    render(<FirstStepsScreen locale="ko" />);
    expect(state.slam).toHaveBeenCalledTimes(1);
  });
});

describe("FirstStepsHomeBanner", () => {
  it("lists the steps for guests and shows progress to members", () => {
    state.view = { status: "guest" };
    const { unmount } = render(<FirstStepsHomeBanner banner={firstStepsHomeBanner("ko")} locale="ko" />);
    expect(screen.getByText("모임 가입 · 팬 패스포트 받기 · 첫 출석")).toBeTruthy();
    expect(screen.getByRole("link", { name: /시작하기/ }).getAttribute("href")).toBe("/onboarding?locale=ko");
    unmount();
    state.view = member({ joinedPages: [elina], passports: [], attended: false });
    render(<FirstStepsHomeBanner banner={firstStepsHomeBanner("ko")} locale="ko" />);
    expect(screen.getByText("1/3 · 팬 패스포트 받기")).toBeTruthy();
    expect(screen.getByRole("link", { name: /이어서 하기/ })).toBeTruthy();
  });
});
