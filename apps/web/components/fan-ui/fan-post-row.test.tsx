import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FanPostRow } from "./fan-post-row";

vi.mock("next/link", () => ({ default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => <a href={href} className={className}>{children}</a> }));
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
    expect(c.querySelector("[data-page-image]")).not.toBeNull();
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
