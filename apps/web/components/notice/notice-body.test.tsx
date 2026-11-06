import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NoticeBody, NoticeTitle, NoticeTranslation, NoticeTranslationControl } from "./notice-body";
import { TranslatedText } from "@/features/content-safety/ui/use-automatic-translation";

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
  const doc = { type: "doc" as const, content: [{ type: "paragraph", content: [{ type: "text", text: "본문 원문" }] }] };
  const shared = (title: string) => <NoticeTranslation title={title} document={doc} locale="en"><NoticeTitle locale="en" /><NoticeTranslationControl locale="en" /><NoticeBody document={doc} locale="en" /></NoticeTranslation>;
  it("translates title and body with one request and one toggle, and restores both originals", async () => {
    const fetcher = vi.fn().mockImplementation(async () => Response.json({ translatedTexts: ["Original title en", "Body en"], cached: false }));
    vi.stubGlobal("fetch", fetcher);
    render(shared("제목 원문"));
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Original title en");
    expect(screen.getByText("Body en")).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetcher.mock.calls[0][1].body).texts).toEqual(["제목 원문", "본문 원문"]);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Show original" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("제목 원문");
    expect(screen.getByText("본문 원문")).toBeInTheDocument();
    expect(doc.content[0].content![0].text).toBe("본문 원문");
  });
  it("keeps the original title and body when translation fails", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ error: { code: "TRANSLATION_FAILED" } }, { status: 500 }));
    vi.stubGlobal("fetch", fetcher);
    render(shared("실패 제목"));
    // An automatic attempt that fails stays silent: the original is shown and no error appears until the reader presses the button.
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    const translate = await screen.findByRole("button", { name: "Translate" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("실패 제목");
    expect(screen.getByText("본문 원문")).toBeInTheDocument();
    fireEvent.click(translate);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("실패 제목");
    expect(screen.getByText("본문 원문")).toBeInTheDocument();
  });
  it("shows a standalone title control after the heading and falls back to the original on failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ translatedText: "Live title" })));
    const { unmount } = render(<TranslatedText as="h1" text="라이브 제목" locale="en" controls="after" />);
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Live title");
    expect(screen.getByRole("heading", { level: 1 }).querySelector("button")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show original" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("라이브 제목");
    unmount();
    const failing = vi.fn().mockRejectedValue(new Error("network"));
    vi.stubGlobal("fetch", failing);
    render(<TranslatedText as="h1" text="실패하는 라이브 제목" locale="en" controls="after" />);
    await waitFor(() => expect(failing).toHaveBeenCalledTimes(1));
    const retry = await screen.findByRole("button", { name: "Translate" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("실패하는 라이브 제목");
    fireEvent.click(retry);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("실패하는 라이브 제목");
  });
});
