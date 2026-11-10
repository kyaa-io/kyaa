import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import page from "@/server/home-notice/fixtures/read_public_home_notices_en.json";
import type { HomeNoticeSummary } from "@/features/home/domain/home-notice";
import { HomeNoticeListScreen } from "./home-notice-pages";
import { HomeNotices, formatHomeNoticeDate } from "./home-placeholder-blocks";

// Real SQL rows (supabase/tests/home_notices.sh): Pinned C, Latest D, Notice A.
const rows = page.items as HomeNoticeSummary[];
const five = [...rows, { ...rows[2]!, id: "d0000000-0000-4000-8000-000000000004", slug: "r8data-x", title: "A very long notice title that has to stay on one line in the home row" }, { ...rows[2]!, id: "d0000000-0000-4000-8000-000000000005", slug: "r8data-y" }];

function rowsOf(container: HTMLElement) {
  return [...container.querySelectorAll('[data-home-block="notices"] li')].map(li => li.getAttribute("data-row"));
}

describe("home notices block", () => {
  it("shows the full Seoul calendar date", () => {
    expect(formatHomeNoticeDate("2026-11-09T16:00:00Z", "ko")).toBe("2026.11.10");
  });
  it("says 아직 공지 없음 only for a read that found nothing; a failed or loading read has no empty rows", () => {
    const { container, unmount } = render(<HomeNotices locale="ko" notices={[]} />);
    expect(rowsOf(container)).toEqual([]);
    expect(screen.getByText("아직 공지 없음")).toBeInTheDocument();
    unmount();
    for (const state of ["error", "loading"] as const) {
      const view = render(<HomeNotices locale="ko" notices={state} />);
      expect(rowsOf(view.container)).toEqual([]);
      expect(view.container.querySelector(`[data-home-state="${state}"]`)).not.toBeNull();
      expect(screen.queryByText("아직 공지 없음")).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it("shows only available rows for 1-4 notices and links each row to its page", () => {
    const { container } = render(<HomeNotices locale="en" notices={rows} />);
    expect(rowsOf(container)).toEqual(["notice", "notice", "notice"]);
    const first = screen.getByRole("link", { name: /Pinned C/ });
    expect(first).toHaveAttribute("href", "/notices/r8data-c?locale=en");
    expect(within(first).getByText("Update")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View all/ })).toHaveAttribute("href", "/notices?locale=en");
  });

  it("shows five rows and the view-all link once there are five", () => {
    const { container } = render(<HomeNotices locale="ko" notices={five} />);
    expect(rowsOf(container)).toEqual(Array(5).fill("notice"));
    expect(screen.getByRole("link", { name: /전체 보기/ })).toHaveAttribute("href", "/notices?locale=ko");
  });
});

describe("/notices list", () => {
  it("shows one empty row without data and a more link with a cursor", () => {
    const { unmount } = render(<HomeNoticeListScreen locale="ko" items={[]} nextCursor={null} />);
    expect(screen.getByRole("heading", { level: 1, name: "공지사항" })).toBeInTheDocument();
    expect(screen.getByText("아직 공지 없음")).toBeInTheDocument();
    unmount();
    render(<HomeNoticeListScreen locale="ja" items={rows} nextCursor={null} pageCount={2} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByRole("link", { name: "次へ" })).toHaveAttribute("href", "/notices?locale=ja&page=2");
  });
});
