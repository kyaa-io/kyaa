// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const resource = vi.hoisted(() => ({ value: { loading: true, error: false, data: undefined as unknown } }));
vi.mock("./use-group-resource", () => ({ useGroupResource: () => resource.value }));
vi.mock("./group-page-context", () => ({ useOptionalGroupPage: () => null }));
vi.mock("./group-board", () => ({ parseGroupPosts: (value: unknown) => value }));

import { GroupHomeGallery } from "./group-home-panels";

const post = (id: string, assets: { id: string; kind: "image" | "video" }[]) => ({ id, title: `post ${id}`, visibility: "public", assets: assets.map((asset) => ({ ...asset, width: 240, height: 240 })) });

beforeEach(() => { resource.value = { loading: true, error: false, data: undefined }; });

// 모임 상세 CLS: the gallery used to appear above the board only after the posts arrived, then vanish when a thumbnail
// failed, moving the board twice. It now holds its place while loading and keeps a failed tile.
describe("GroupHomeGallery placement", () => {
  it("holds the gallery place while the posts are read", () => {
    render(<GroupHomeGallery pageId="p" locale="ko" />);
    const section = screen.getByRole("region");
    expect(section).toHaveAttribute("aria-busy", "true");
    expect(section.querySelectorAll("ul > li")).toHaveLength(4);
  });

  it("keeps a tile whose thumbnail fails instead of dropping the section", () => {
    resource.value = { loading: false, error: false, data: { items: [post("a", [{ id: "m1", kind: "image" }])] } };
    render(<GroupHomeGallery pageId="p" locale="ko" />);
    const image = document.querySelector("img")!;
    fireEvent.error(image);
    expect(screen.getByRole("region")).not.toHaveAttribute("aria-busy");
    expect(screen.getAllByRole("link", { name: "post a" })).toHaveLength(1);
    expect(document.querySelector("img")).toBeNull();
  });

  it("draws nothing when the posts hold no public media", () => {
    resource.value = { loading: false, error: false, data: { items: [post("a", [])] } };
    const { container } = render(<GroupHomeGallery pageId="p" locale="ko" />);
    expect(container).toBeEmptyDOMElement();
  });
});
