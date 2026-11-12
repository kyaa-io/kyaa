import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { SlotPostBody, TranslatedRichPostBody } from "./rich-post-body";
import type { RichDocument } from "@/components/editor/rich-document";

const document = { type: "doc", content: [
  { type: "paragraph", content: [{ type: "text", text: "Original first" }] },
  { type: "attachment", attrs: { assetId: "a1", kind: "image" } },
  { type: "paragraph", content: [{ type: "text", text: "Original second" }] },
  { type: "attachment", attrs: { assetId: "a2", kind: "video" } },
] } as unknown as RichDocument;
const mounts = vi.fn(), unmounts = vi.fn();
function Media({ id }: { id: string }) { useEffect(() => { mounts(id); return () => unmounts(id); }, [id]); return <img data-media={id} src={`/media/${id}.webp`} alt="" />; }
const renderAttachment = (item: { assetId: string }) => <Media id={item.assetId} />;
afterEach(() => { cleanup(); mounts.mockClear(); unmounts.mockClear(); });

const shown = (showing: boolean) => ({ showing, texts: ["번역된 본문"] as readonly string[] });

describe("switching between the translation and the original keeps the post's media", () => {
  it("keeps the same photo and video nodes (guest body translation)", () => {
    const body = (showing: boolean) => <TranslatedRichPostBody document={document} translation={shown(showing)} observeElement={() => undefined} locale="ko" renderAttachment={renderAttachment} />;
    const view = render(body(false));
    const before = [...view.container.querySelectorAll("[data-media]")];
    expect(before).toHaveLength(2);
    expect(view.container.textContent).toContain("Original first");
    view.rerender(body(true));
    const during = [...view.container.querySelectorAll("[data-media]")];
    expect(during).toHaveLength(2);
    during.forEach((node, index) => expect(node).toBe(before[index]));
    expect(view.container.querySelector("p[lang]")).toHaveTextContent("번역된 본문");
    expect(view.container.querySelector("[data-rich-body]")).toHaveAttribute("data-text-hidden");
    view.rerender(body(false));
    const after = [...view.container.querySelectorAll("[data-media]")];
    after.forEach((node, index) => expect(node).toBe(before[index]));
    expect(view.container.querySelector("[data-rich-body]")).not.toHaveAttribute("data-text-hidden");
    expect(mounts).toHaveBeenCalledTimes(2);
    expect(unmounts).not.toHaveBeenCalled();
  });

  it("keeps the same nodes for the signed-in slot translation too", () => {
    const props = { document, plainText: "", observeElement: () => undefined, locale: "ko" as const, renderAttachment };
    const slot = (showing: boolean) => <SlotPostBody {...props} translated="번역된 본문" translation={{ eligible: true, showing, busy: false, error: "", toggle: () => undefined }} />;
    const view = render(slot(false));
    const before = [...view.container.querySelectorAll("[data-media]")];
    expect(before).toHaveLength(2);
    view.rerender(slot(true));
    [...view.container.querySelectorAll("[data-media]")].forEach((node, index) => expect(node).toBe(before[index]));
    expect(view.container.querySelector("p[lang]")).toHaveTextContent("번역된 본문");
    view.rerender(slot(false));
    [...view.container.querySelectorAll("[data-media]")].forEach((node, index) => expect(node).toBe(before[index]));
    expect(mounts).toHaveBeenCalledTimes(2);
    expect(unmounts).not.toHaveBeenCalled();
  });
});
