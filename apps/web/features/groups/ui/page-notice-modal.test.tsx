import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageNoticeModal } from "./page-notice-modal";

const props = { locale: "ko" as const, storageKey: "raffle-results:elina:1", title: "래플 결과가 발표됐어요", description: "응모한 선물의 당첨 여부를 확인해 보세요.", actionLabel: "내 결과 확인", actionHref: "/my/raffles?locale=ko" };
beforeEach(() => { window.localStorage.clear(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 10, 7, 12, 0, 0)); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("page notice modal", () => {
  it("opens once with the action and closes without remembering when the box is not checked", async () => {
    render(<PageNoticeModal {...props} />);
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("래플 결과가 발표됐어요");
    expect(screen.getByRole("link", { name: "내 결과 확인" })).toHaveAttribute("href", "/my/raffles?locale=ko");
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(window.localStorage.getItem("kyaa:page-notice:raffle-results:elina:1")).toBeNull();
  });
  it("does not open again today after 오늘 다시 열지 않기, and opens again the next day", async () => {
    const first = render(<PageNoticeModal {...props} />);
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("checkbox", { name: "오늘 다시 열지 않기" }));
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(window.localStorage.getItem("kyaa:page-notice:raffle-results:elina:1")).toBe("2026-11-07");
    first.unmount();
    render(<PageNoticeModal {...props} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole("dialog")).toBeNull();
    cleanup();
    vi.setSystemTime(new Date(2026, 10, 8, 9, 0, 0));
    render(<PageNoticeModal {...props} />);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
  it("does not open while disabled or while another dialog is open", async () => {
    const view = render(<PageNoticeModal {...props} enabled={false} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole("dialog")).toBeNull();
    view.unmount();
    document.body.insertAdjacentHTML("beforeend", '<div role="dialog" aria-label="다른 대화상자"></div>');
    render(<PageNoticeModal {...props} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.queryByText("래플 결과가 발표됐어요")).toBeNull();
  });
});
