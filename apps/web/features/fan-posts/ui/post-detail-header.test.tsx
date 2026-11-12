import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { PostDetailHeader } from "./post-detail-header";

afterEach(cleanup);

it("draws a notice head without an author: kicker, title, then the date beside the switch and the menu", () => {
  const { container } = render(<PostDetailHeader kicker="공지 · 전체 공개" renderTitle={className => <h1 className={className}>제목</h1>} createdAt="2026-11-11T05:20:00+09:00" locale="ko"
    translation={<button type="button">원문 보기</button>} menu={<button type="button">더보기</button>} />);
  const header = container.querySelector("[data-post-detail-header]")!;
  expect([...header.children].map(node => node.tagName)).toEqual(["SPAN", "H1", "DIV"]);
  const row = header.querySelector("[data-no-author]")!;
  expect(row).toBeInTheDocument();
  expect(row.querySelector("img")).toBeNull();
  expect(row.querySelector("time")).toHaveTextContent("2026. 11. 11. 05:20");
  expect(row).toContainElement(screen.getByRole("button", { name: "원문 보기" }));
  expect(row).toContainElement(screen.getByRole("button", { name: "더보기" }));
  expect(row.textContent).not.toMatch(/좋아요|댓글|조회/);
});

it("keeps the author row and the counts for a post", () => {
  const { container } = render(<PostDetailHeader title="글" author="팬" createdAt="2026-11-11T05:20:00+09:00" viewCount={3} likeCount={3} commentCount={4} locale="ko" />);
  expect(container.querySelector("[data-no-author]")).toBeNull();
  expect(container.querySelector("img")).toBeInTheDocument();
  expect(container).toHaveTextContent("조회 3");
});

it("omits an incomparable historical view count without changing likes", () => {
 const {container} = render(<PostDetailHeader title="글" createdAt="2026-10-01T00:00:00Z" viewCount={2} likeCount={3} locale="ko" />);
 expect(container).not.toHaveTextContent("조회");
 expect(container).toHaveTextContent("추천 3");
});
