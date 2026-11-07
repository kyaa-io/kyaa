// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EarnBadge, EarnRemaining } from "@/features/dukjil/ui/earn-badge";
import { FanCollapsible, FanCollapsibleTrigger } from "./fan-collapsible";
import { FanDialog, FanSheet } from "./fan-dialog";
import { FanMenu } from "./fan-menu";
import { FanCount } from "./fan-count-chip";
import { FanGauge, FanNumber } from "./fan-number";
import { FanTabs } from "./fan-tabs";
import { FanToastProvider, showFanToast, closeFanToast } from "./fan-toast";
import { FanTooltip } from "./fan-tooltip";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: vi.fn() }), usePathname: () => "/" }));

const media = (matches: (query: string) => boolean) => vi.stubGlobal("matchMedia", (query: string) => ({ matches: matches(query), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }));

beforeEach(() => media(() => false));
afterEach(() => { vi.unstubAllGlobals(); sessionStorage.clear(); });

describe("FanDialog / FanSheet", () => {
  it("renders title, close, and at most two footer actions with primary last", () => {
    const close = vi.fn();
    const confirm = vi.fn();
    media((query) => query.includes("min-width: 64rem"));
    render(<FanDialog open onOpenChange={close} title="교환할까요?" closeLabel="닫기" primary={{ label: "교환", onClick: confirm }} secondary={{ label: "취소", onClick: close }}>본문</FanDialog>);
    const dialog = screen.getByRole("dialog", { name: "교환할까요?" });
    const buttons = Array.from(dialog.querySelectorAll("footer button")).map((button) => button.textContent);
    expect(buttons).toEqual(["취소", "교환"]);
    fireEvent.click(screen.getByRole("button", { name: "교환" }));
    expect(confirm).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(close).toHaveBeenCalledWith(false);
  });

  it("uses alertdialog for alert and keeps the dialog open while the primary is loading", () => {
    const close = vi.fn();
    render(<FanDialog open alert onOpenChange={close} title="삭제할까요?" closeLabel="닫기" primary={{ label: "삭제", onClick: vi.fn(), variant: "danger", loading: true }} />);
    expect(screen.getByRole("alertdialog", { name: "삭제할까요?" }).getAttribute("aria-busy")).toBe("true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(close).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "닫기" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("turns into a bottom sheet under 1024 when responsive", () => {
    render(<FanDialog open responsive onOpenChange={vi.fn()} title="언어" closeLabel="닫기">목록</FanDialog>);
    expect(screen.getByRole("dialog", { name: "언어" }).getAttribute("data-variant")).toBe("bottom-sheet");
  });

  it("sheet becomes a right drawer at 1024+", () => {
    media((query) => query.includes("min-width: 64rem"));
    render(<FanSheet open onOpenChange={vi.fn()} title="필터" closeLabel="닫기">x</FanSheet>);
    expect(screen.getByRole("dialog", { name: "필터" }).getAttribute("data-variant")).toBe("drawer");
  });

  it("renders nothing when closed", () => {
    render(<FanDialog open={false} onOpenChange={vi.fn()} title="x" closeLabel="닫기" />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("FanMenu", () => {
  it("opens from its trigger and runs the item and radio callbacks", async () => {
    const report = vi.fn();
    const pick = vi.fn();
    render(<FanMenu label="게시글 메뉴" trigger={<button type="button" aria-label="더 보기">⋯</button>}>
      <FanMenu.Item onSelect={report}>신고</FanMenu.Item>
      <FanMenu.Separator />
      <FanMenu.Radio value="a" onValueChange={pick} items={[{ value: "a", label: "엘리나" }, { value: "b", label: "하루" }]} />
    </FanMenu>);
    const trigger = screen.getByRole("button", { name: "더 보기" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    const menu = await screen.findByRole("menu");
    expect(menu.getAttribute("aria-label")).toBe("게시글 메뉴");
    fireEvent.click(screen.getByRole("menuitemradio", { name: "하루" }));
    expect(pick).toHaveBeenCalledWith("b");
    fireEvent.click(screen.getByRole("menuitem", { name: "신고" }));
    expect(report).toHaveBeenCalledOnce();
  });
});

describe("FanTooltip", () => {
  it("draws no tooltip wrapper on touch devices", () => {
    render(<FanTooltip content="알림"><button type="button" aria-label="알림">!</button></FanTooltip>);
    expect(screen.getByRole("button", { name: "알림" })).toBeTruthy();
    expect(document.querySelector("[data-fan-tooltip]")).toBeNull();
  });
});

describe("FanCollapsible", () => {
  const list = (props: { defaultOpen?: boolean; persistKey?: string; onLoad?: () => void } = {}) => <FanCollapsible defaultOpen={props.defaultOpen} persistKey={props.persistKey} trigger={({ triggerProps }) => <FanCollapsibleTrigger label="완료한 미션" meta="3개 · +60P" {...triggerProps} />}>
    <p>미션 행</p>
  </FanCollapsible>;

  it("starts closed (data-state=closed, inert) and opens on click without remounting", () => {
    const { container } = render(list());
    const root = container.querySelector("[data-fan-collapsible]")!;
    const button = screen.getByRole("button", { name: /완료한 미션/ });
    expect(root.getAttribute("data-state")).toBe("closed");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    const panel = document.getElementById(button.getAttribute("aria-controls")!)!;
    expect(panel.hasAttribute("inert")).toBe(true);
    const row = screen.getByText("미션 행");
    fireEvent.click(button);
    expect(root.getAttribute("data-state")).toBe("open");
    expect(panel.hasAttribute("inert")).toBe(false);
    expect(screen.getByText("미션 행")).toBe(row);
  });

  it("defaultOpen renders open and persistKey keeps the choice for the session", () => {
    const first = render(list({ defaultOpen: true, persistKey: "missions-done" }));
    expect(first.container.querySelector("[data-fan-collapsible]")!.getAttribute("data-state")).toBe("open");
    fireEvent.click(screen.getByRole("button", { name: /완료한 미션/ }));
    first.unmount();
    const second = render(list({ defaultOpen: true, persistKey: "missions-done" }));
    expect(second.container.querySelector("[data-fan-collapsible]")!.getAttribute("data-state")).toBe("closed");
  });
});

describe("FanNumber / FanGauge", () => {
  it("formats with the locale, unit once, and reserves digit width", () => {
    const { container } = render(<FanNumber value={12345} unit="P" size="xl" locale="ko" />);
    const number = container.querySelector("[data-number-role='asset']")!;
    expect(number.textContent).toBe("12,345P");
    expect((container.querySelector("[style]") as HTMLElement).style.minWidth).toBe("6ch");
  });

  it("counts up only when the value changes, and pulses once", async () => {
    let now = 0;
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { frames.push(cb); return frames.length; });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const { container, rerender } = render(<FanNumber value={10} locale="en" countUp pulseOnChange />);
    expect(container.textContent).toBe("10");
    expect(frames).toHaveLength(0);
    rerender(<FanNumber value={30} locale="en" countUp pulseOnChange />);
    expect(container.querySelector("[data-pulse='true']")).not.toBeNull();
    now = 200;
    act(() => frames.shift()!(200));
    const mid = Number(container.querySelector("[aria-hidden='true']")!.textContent);
    expect(mid).toBeGreaterThan(10);
    expect(mid).toBeLessThan(30);
    now = 400;
    act(() => frames.shift()!(400));
    expect(container.textContent).toBe("30");
    await waitFor(() => expect(container.querySelector("[data-pulse='true']")).toBeNull(), { timeout: 1000 });
  });

  it("jumps straight to the value under reduced motion", () => {
    media((query) => query.includes("reduce"));
    const { container, rerender } = render(<FanNumber value={1} locale="en" countUp pulseOnChange />);
    rerender(<FanNumber value={9} locale="en" countUp pulseOnChange />);
    expect(container.textContent).toBe("9");
    expect(container.querySelector("[data-pulse]")).toBeNull();
  });

  it("gauge exposes progressbar values and the text sits outside the bar", () => {
    render(<FanGauge value={4} max={6} label="오늘의 미션" valueText="4/6" />);
    const bar = screen.getByRole("progressbar", { name: "오늘의 미션" });
    expect(bar.getAttribute("aria-valuenow")).toBe("4");
    expect(bar.getAttribute("aria-valuemax")).toBe("6");
    expect(bar.textContent).toBe("");
    expect(bar.parentElement!.textContent).toBe("4/6");
  });
});

describe("EarnBadge S4", () => {
  it("shows the amount only; no ×N in the badge", () => {
    const { container } = render(<EarnBadge variant="inline" locale="ko" points={20} remaining={3} />);
    expect(container.textContent).not.toMatch(/×/);
    expect(container.querySelector("[aria-hidden='true']:not(img)")!.textContent).toBe("+20P");
  });

  it("does not draw a today badge for 0", () => {
    const { container } = render(<EarnBadge variant="inline" locale="ko" points={0} today />);
    expect(container.innerHTML).toBe("");
  });

  it("EarnRemaining reads as one phrase in ko and en, and hides 0", () => {
    const { container, rerender } = render(<EarnRemaining locale="ko" remaining={3} />);
    expect(container.textContent).toBe("오늘 3번 남음");
    rerender(<EarnRemaining locale="en" remaining={3} />);
    expect(container.textContent).toBe("3 left today");
    rerender(<EarnRemaining locale="ko" limit={5} />);
    expect(container.textContent).toBe("5명까지");
    rerender(<EarnRemaining locale="ko" remaining={0} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("FanTabs segment / panels / count", () => {
  it("segment keeps button tabs pressed immediately", () => {
    const onSelect = vi.fn();
    render(<FanTabs variant="segment" label="랭킹" current="fans" items={[{ key: "fans", label: "팬" }, { key: "creators", label: "크리에이터", onSelect }]} />);
    const nav = screen.getByRole("navigation", { name: "랭킹" });
    expect(nav.getAttribute("data-fan-tabs")).toBe("segment");
    fireEvent.click(screen.getByRole("button", { name: "크리에이터" }));
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("panels use tablist semantics and switch with the arrow key", async () => {
    render(<FanTabs panels variant="segment" label="인증" current="open" items={[{ key: "open", label: "진행 중", count: 2, panel: <p>진행 목록</p> }, { key: "done", label: "완료", panel: <p>완료 목록</p> }]} />);
    expect(screen.getByRole("tablist", { name: "인증" })).toBeTruthy();
    const first = screen.getByRole("tab", { name: /진행 중/ });
    expect(first.getAttribute("aria-selected")).toBe("true");
    expect(first.textContent).toBe("진행 중2");
    expect(screen.getByRole("tabpanel").textContent).toBe("진행 목록");
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    await waitFor(() => expect(screen.getByRole("tab", { name: "완료" }).getAttribute("aria-selected")).toBe("true"));
    expect(screen.getByRole("tabpanel").textContent).toBe("완료 목록");
  });

  it("FanCount hides 0 and caps at 99+", () => {
    const { container, rerender } = render(<FanCount value={0} />);
    expect(container.innerHTML).toBe("");
    rerender(<FanCount value={120} />);
    expect(container.textContent).toBe("99+");
  });
});

describe("FanToast", () => {
  it("shows a toast once per title and closes it", async () => {
    render(<FanToastProvider />);
    act(() => { showFanToast({ title: "댓글을 저장하지 못했어요", tone: "error" }); });
    act(() => { showFanToast({ title: "댓글을 저장하지 못했어요", tone: "error", action: { label: "다시 시도", onClick: vi.fn() } }); });
    const viewport = () => document.querySelector("[data-fan-toast-viewport]")!;
    await waitFor(() => expect(viewport().textContent).toContain("댓글을 저장하지 못했어요"));
    expect(viewport().querySelectorAll("[data-tone='error']")).toHaveLength(1);
    expect(viewport().textContent).toContain("다시 시도");
    act(() => closeFanToast());
    await waitFor(() => expect(viewport().querySelectorAll("[data-tone]")).toHaveLength(0));
  });
});
