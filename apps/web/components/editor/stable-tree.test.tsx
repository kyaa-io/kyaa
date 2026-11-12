import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { RichBody } from "./rich-body";
import type { RichDocument } from "./rich-document";
import { NoticeBody } from "@/components/notice/notice-body";
import type { TiptapDocument } from "@/server/notice/notice-domain";

vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => ({ ready: true, authenticated: false, user: null, getAccessToken: async () => null }) }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => ({ ready: true, ownerId: null, generation: 1 }) }));
afterEach(() => { cleanup(); mounts.mockClear(); unmounts.mockClear(); });

const mounts = vi.fn(), unmounts = vi.fn();
function Media({ id }: { id: string }) { useEffect(() => { mounts(id); return () => unmounts(id); }, [id]); return <img data-media={id} src={`/media/${id}.webp`} alt="" />; }
const post = (text: string) => ({ type: "doc", content: [
  { type: "paragraph", content: [{ type: "text", text }, { type: "text", text: " link", marks: [{ type: "link", attrs: { href: "https://example.com/a" } }] }] },
  { type: "attachment", attrs: { assetId: "a1", kind: "image" } },
  { type: "youtube", attrs: { videoId: "dQw4w9WgXcQ" } },
  { type: "attachment", attrs: { assetId: "a2", kind: "video" } },
] }) as unknown as RichDocument;
const notice = (text: string) => ({ type: "doc", content: [
  { type: "paragraph", content: [{ type: "text", text, marks: [{ type: "bold" }] }, { type: "text", text: "공식 채널", marks: [{ type: "link", attrs: { href: "https://example.com/news" } }] }] },
  { type: "image", attrs: { src: "https://cdn.example.com/one.webp", alt: "one", width: 960, height: 640 } },
  { type: "paragraph", content: [{ type: "text", text: "끝" }] },
  { type: "image", attrs: { src: "https://cdn.example.com/two.webp", alt: "two", width: 960, height: 640 } },
] }) as unknown as TiptapDocument;

describe("a document drawn again keeps its media nodes", () => {
  it("post body: a re-read (new document object, new attachment renderer) remounts nothing", () => {
    // A new function each time, like the one the post card builds after every read of the post.
    const body = (text: string) => <RichBody document={post(text)} locale="ko" renderAttachment={item => <Media id={item.assetId} />} />;
    const view = render(body("first"));
    const media = [...view.container.querySelectorAll("[data-media]")], youtube = view.container.querySelector("[data-rich-youtube]"), paragraph = view.container.querySelector("p");
    expect(media).toHaveLength(2);
    view.rerender(body("first"));
    view.rerender(body("second"));
    [...view.container.querySelectorAll("[data-media]")].forEach((node, index) => expect(node).toBe(media[index]));
    expect(view.container.querySelector("[data-rich-youtube]")).toBe(youtube);
    expect(view.container.querySelector("p")).toBe(paragraph);
    expect(paragraph).toHaveTextContent("second link");
    expect(view.container.querySelector("a")).toHaveAttribute("href", "https://example.com/a");
    expect(mounts).toHaveBeenCalledTimes(2);
    expect(unmounts).not.toHaveBeenCalled();
  });

  it("notice body: changed text (a translation) and a re-read keep the same image nodes", () => {
    const view = render(<NoticeBody adminPreview document={notice("새로운 소식")} locale="ko" />);
    const images = [...view.container.querySelectorAll("img")];
    expect(images).toHaveLength(2);
    view.rerender(<NoticeBody adminPreview document={notice("새로운 소식")} locale="ko" />);
    view.rerender(<NoticeBody adminPreview document={notice("New update")} locale="ko" />);
    [...view.container.querySelectorAll("img")].forEach((node, index) => expect(node).toBe(images[index]));
    expect(view.container.querySelector("strong")).toHaveTextContent("New update");
    expect(view.container.querySelector("a")).toHaveAttribute("href", "https://example.com/news");
  });
});
