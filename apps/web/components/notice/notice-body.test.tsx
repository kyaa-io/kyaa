import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NoticeBody } from "./notice-body";

vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => ({ ready: true, authenticated: false, user: null }) }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => ({ ready: true, ownerId: null, generation: 1 }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("NoticeBody", () => {
  it("renders approved Tiptap JSON without HTML injection and announces external links", () => {
    render(
      <NoticeBody
        locale="ko"
        document={{
          type: "doc",
          content: [{
            type: "paragraph",
            content: [{
              type: "text",
              text: "공식 채널",
              marks: [{ type: "link", attrs: { href: "https://example.com/news" } }],
            }],
          }],
        }}
      />,
    );

    expect(screen.getByRole("link", { name: "공식 채널, 새 창" })).toHaveAttribute(
      "href",
      "https://example.com/news",
    );
    expect(screen.getByRole("link")).toHaveAttribute("target", "_blank");
  });
  it("translates text runs in one batch while preserving media, links and formatting", async () => {
    const fetcher = vi.fn().mockImplementation(async () => Response.json({ translatedTexts: ["News", "Read the announcement"], cached: false }));
    vi.stubGlobal("fetch", fetcher);
    const document = { type: "doc" as const, content: [
      { type: "paragraph", content: [{ type: "text", text: "새로운 소식", marks: [{ type: "bold" }] }] },
      { type: "paragraph", content: [{ type: "text", text: "공지 읽기", marks: [{ type: "link", attrs: { href: "https://example.com/news" } }] }] },
      { type: "image", attrs: { src: "https://example.com/image.png", alt: "Photo" } },
    ] };
    render(<NoticeBody document={document} locale="en" />);
    expect(screen.getByRole("img", { name: "Photo" })).toBeInTheDocument();
    await screen.findByText("News");
    expect(screen.getByText("News").closest("strong")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Read the announcement, opens in a new window" })).toHaveAttribute("href", "https://example.com/news");
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ texts: ["새로운 소식", "공지 읽기"], targetLocale: "en" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Show original" }));
    expect(screen.getByText("새로운 소식")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Photo" })).toBeInTheDocument();
    expect(document.content[0].content![0].text).toBe("새로운 소식");
  });
});
