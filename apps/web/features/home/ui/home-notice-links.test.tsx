import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import linked from "@/server/home-notice/fixtures/read_public_home_notices_linked.json";
import { homeNoticePageSchema } from "@/features/home/domain/home-notice";
import { HomeNoticeListScreen } from "./home-notice-pages";
import { HomeNotices } from "./home-placeholder-blocks";

// Real read_public_home_notices rows (supabase/tests/home_notice_links.sh): r8-linked has a listed fan page, r8-plain has none.
const rows = homeNoticePageSchema.parse(linked).items;

describe("home notice linked fan page", () => {
  it("opens the linked fan page from the home row, and the notice detail without a link", () => {
    render(<HomeNotices locale="ko" notices={rows} />);
    expect(screen.getAllByRole("link").map(link => link.getAttribute("href"))).toEqual(["/r8data-linked?locale=ko", "/notices/r8-plain?locale=ko", "/notices?locale=ko"]);
  });
  it("does the same on /notices", () => {
    render(<HomeNoticeListScreen locale="en" items={rows} nextCursor={null} />);
    expect(screen.getAllByRole("link").map(link => link.getAttribute("href"))).toEqual(["/?locale=en", "/r8data-linked?locale=en", "/notices/r8-plain?locale=en"]);
  });
  it("refuses a link that is not a creator handle", () => {
    expect(homeNoticePageSchema.safeParse({ items: [{ ...rows[0]!, linkHref: "https://evil.example/x" }], hasMore: false }).success).toBe(false);
    expect(homeNoticePageSchema.safeParse({ items: [{ ...rows[0]!, linkHref: "//evil.example" }], hasMore: false }).success).toBe(false);
  });
});
