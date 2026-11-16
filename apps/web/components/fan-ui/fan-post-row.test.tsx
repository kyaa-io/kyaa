import { readFileSync } from "node:fs";
import { join } from "node:path";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FanPostRow } from "./fan-post-row";

vi.mock("next/link", () => ({ default: ({ href, children, className, title }: { href: string; children: React.ReactNode; className?: string; title?: string }) => <a href={href} className={className} title={title}>{children}</a> }));
afterEach(cleanup);
const row = (props: Partial<React.ComponentProps<typeof FanPostRow>>) => render(<FanPostRow href="/p" locale="ko" title="글" {...props} />).container;

describe("post row thumbnail", () => {
  it("shows the photo when it loads", () => {
    const c = row({ thumbnail: "/api/content-assets/a?size=thumbnail", pageImage: <span data-testid="page-image" /> });
    expect(c.querySelector("img")).not.toBeNull();
    expect(c.querySelector('[data-testid="page-image"]')).toBeNull();
  });
  it("shows the page image, not the document icon, when the post has no photo", () => {
    const c = row({ pageImage: <span data-testid="page-image" /> });
    expect(c.querySelector('[data-testid="page-image"]')).not.toBeNull();
    expect(c.querySelector("svg")).toBeNull();
    expect(c.querySelector('[data-thumb="page"]')).not.toBeNull();
  });
  it("puts the kyaa logo on a notice and the writer's picture on a post without a photo, ringed for the page's artist", () => {
    const notice = row({ notice: true, avatar: "/images/avatars/star-pink.webp", pageImage: <span data-testid="page-image" /> });
    expect(notice.querySelector("img")?.getAttribute("src")).toBe("/kyaa-app-icon-192.png");
    expect(notice.querySelector('[data-testid="page-image"]')).toBeNull();
    const fan = row({ avatar: "/images/avatars/heart-pink.webp", pageImage: <span data-testid="page-image" /> });
    expect(fan.querySelector("img")?.getAttribute("src")).toBe("/images/avatars/heart-pink.webp");
    expect(fan.querySelector("[data-artist-avatar]")).toBeNull();
    expect(row({ avatar: "/images/avatars/heart-pink.webp", avatarArtist: true }).querySelector('[data-thumb="avatar"] img[data-artist-avatar]')).not.toBeNull();
    const photo = row({ thumbnail: "/api/content-assets/a?size=thumbnail", avatar: "/images/avatars/heart-pink.webp" });
    expect(photo.querySelector("img")?.getAttribute("src")).toBe("/api/content-assets/a?size=thumbnail");
  });
  it("falls back to the page image when the photo cannot be loaded (for example a 503)", () => {
    const c = row({ thumbnail: "/api/content-assets/a?size=thumbnail", pageImage: <span data-testid="page-image" /> });
    fireEvent.error(c.querySelector("img")!);
    expect(c.querySelector("img")).toBeNull();
    expect(c.querySelector('[data-testid="page-image"]')).not.toBeNull();
  });
  it("keeps the document icon only when the page has no image either, and draws link-only and emoji-only titles as they are", () => {
    for (const title of ["https://example.test/video/1?x=1", "❤️"]) {
      const c = row({ title });
      expect(c.querySelector("svg")).not.toBeNull();
      expect(c.querySelector("a")).toHaveTextContent(title);
    }
  });
});

describe("post row info line alignment", () => {
  const css = readFileSync(join(__dirname, "fan-post-row.module.css"), "utf8");
  const [mobile, wide] = css.split("@media (min-width: 48rem)");
  it("starts the info line at the left edge of the title column on phones, notice rows included", () => {
    expect(mobile).toMatch(/\.meta \{[^}]*justify-content: flex-start;[^}]*text-align: left;/);
    expect(mobile).not.toMatch(/data-notice\][^{]*\.meta/);
  });
  it("narrows the four columns only for the compact variant (모임 Hot 목록): 88·112·48·56, gap 8", () => {
    expect(css).toMatch(/\[data-columns="compact"\] \.source \{ width: 88px; \}/);
    expect(css).toMatch(/\[data-columns="compact"\] \.authorCell \{ width: 112px; \}/);
    expect(css).toMatch(/\[data-columns="compact"\] \.time \{ width: 48px; \}/);
    expect(css).toMatch(/\[data-columns="compact"\] \.number \{ width: 56px; \}/);
    const { container } = render(<FanPostRow locale="ko" href="/x" title="t" columns="compact" />);
    expect(container.querySelector("[data-fan-post-row]")).toHaveAttribute("data-columns", "compact");
  });
  it("keeps the info line right-aligned in the one-line layout from 768px", () => {
    expect(wide).toMatch(/\.meta \{ justify-content: flex-end; text-align: right;/);
  });
  it("gives the page and author names fixed 132px columns that start at the same x on every row, with the full name in a tooltip", () => {
    expect(wide).toMatch(/\.source \{ flex: none; width: 132px;/);
    expect(wide).toMatch(/\.authorCell \{ flex: none; width: 132px; justify-content: flex-start;/);
    row({ source: { label: "아주 긴 팬페이지 이름", href: "/x" }, author: "긴작성자이름" });
    expect(screen.getByText("아주 긴 팬페이지 이름")).toHaveAttribute("title", "아주 긴 팬페이지 이름");
    expect(screen.getByText("긴작성자이름")).toHaveAttribute("title", "긴작성자이름");
  });
});
