import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { FanActivityGuide } from "./fan-activity-guide";
import { HomeNoticeDetailScreen } from "./home-notice-pages";
import { APP_LOCALES } from "@/i18n/locales";

vi.mock("@/components/notice/notice-body", () => ({ NoticeBody: () => <div>원문 본문</div> }));

it("explains the actual steps and links to the existing screens", () => {
  render(<FanActivityGuide locale="ko" />);
  for (const title of ["최애 찾기", "퀴즈로 팬 인증", "팬 패스포트 확인", "LIVE와 혜택 참여"]) expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /최애 찾기/ })).toHaveAttribute("href", "/celebrities?locale=ko");
  expect(screen.getByRole("link", { name: /패스포트 보기/ })).toHaveAttribute("href", "/passports?locale=ko");
  expect(screen.getByRole("link", { name: /LIVE 일정 보기/ })).toHaveAttribute("href", "/live?locale=ko");
  expect(screen.getByRole("link", { name: /혜택 보기/ })).toHaveAttribute("href", "/benefits?locale=ko");
  expect(screen.getByText(/조건과 기간/)).toBeInTheDocument();
});

it.each(APP_LOCALES)("renders four steps and locale-aware links in %s", locale => {
  const { container, unmount } = render(<FanActivityGuide locale={locale} />);
  expect(container.querySelectorAll("ol > li")).toHaveLength(4);
  expect(container.querySelectorAll(`a[href*="locale=${locale}"]`)).toHaveLength(4);
  unmount();
});

it("shows the guide on the special notice, the body on other notices, and no reactions or comments on either", () => {
  const notice = { id: "00000000-0000-4000-8000-000000000001", slug: "service-guide", title: "팬 활동을 시작하는 방법", category: "update" as const, pinned: false, publishedAt: "2026-11-10T00:00:00Z", body: { type: "doc" as const, content: [] } };
  const others = [{ ...notice, id: "00000000-0000-4000-8000-000000000002", slug: "other-one", title: "다른 공지" }];
  const { rerender } = render(<HomeNoticeDetailScreen locale="ko" notice={notice} others={others} />);
  expect(screen.getByRole("heading", { name: "퀴즈로 팬 인증" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /다른 공지/ })).toHaveAttribute("href", "/notices/other-one?locale=ko");
  expect(screen.getByRole("link", { name: /최근 공지사항/ })).toHaveAttribute("href", "/notices?locale=ko");
  rerender(<HomeNoticeDetailScreen locale="ko" notice={{ ...notice, slug: "another-notice" }} others={[]} />);
  expect(screen.getByText("원문 본문")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /최근 공지사항/ })).not.toBeInTheDocument();
  expect(document.querySelector("[data-home-notice-participation]")).toBeNull();
});
