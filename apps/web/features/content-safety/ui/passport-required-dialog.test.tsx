import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PassportRequiredDialog } from "./passport-required-dialog";
vi.mock("@/features/groups/ui/group-page-context", () => ({ useOptionalGroupPage: () => ({ celebrity: { name: "엘리나" } }) }));
afterEach(cleanup);
it("opens with the artist title and a link to that artist's entry quiz", () => {
  render(<PassportRequiredDialog failure="passport" slug="elina" locale="ko" onClose={vi.fn()} />);
  expect(screen.getByRole("dialog", { name: "엘리나 패스포트가 필요해요" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "패스포트 만들러 가기" }).getAttribute("href")).toMatch(/^\/c\/elina\/verify\?locale=ko/);
  expect(screen.getByRole("button", { name: "닫기" })).toBeTruthy();
});
it("stays closed for other failures", () => {
  render(<PassportRequiredDialog failure={null} slug="elina" locale="ko" onClose={vi.fn()} />);
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("is the one helper used by reaction, comment and write", async () => {
  const { readFileSync } = await import("node:fs");
  for (const f of ["features/fan-posts/ui/post-card.tsx", "features/fan-posts/ui/fan-post-detail.tsx", "features/fan-posts/ui/post-composer.tsx"])
    expect(readFileSync(f, "utf8")).toContain("<PassportRequiredDialog");
});
