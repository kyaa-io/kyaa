import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { GroupBoard } from "./group-board";

const row = (n: number, extra: Record<string, unknown>) => ({ id: `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`, pageId: "20000000-0000-4000-8000-000000000001", title: `Story ${n}`, body: "Original body", visibility: "public", anonymous: false, profileId: `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`, nickname: `Writer${n}`, avatarUrl: null, createdAt: "2026-11-01T10:00:00Z", category: "free", ...extra });
vi.mock("./use-group-resource", () => ({ useGroupResource: (url: string | null, parse: (value: unknown) => unknown) => {
  const common = { ownerKey: "viewer", authenticated: true, error: false, loading: false, retry: vi.fn(), request: vi.fn() };
  if (!url) return common;
  return { ...common, data: parse({ items: [row(1, { operator: true, editedAt: "2026-11-02T10:00:00Z" }), row(2, { artist: true, operator: true }), row(3, { operator: false })], nextCursor: null }) };
} }));
vi.mock("@/features/content-safety/ui/use-wave-media-upload", () => ({ useWaveMediaUpload: () => ({ items: [], busy: false, ready: true }) }));
const detail = { page: { id: "20000000-0000-4000-8000-000000000001", kind: "hobby" as const, celebrityId: null, slug: null, name: "Running", description: "Run together", imageUrl: null, question: null, memberCount: 84 }, membership: null, bookmarked: false };

afterEach(cleanup);

it("names the operator on a board row, keeps the artist wording first, and leaves other rows plain", () => {
  const view = render(<GroupBoard detail={detail} locale="ko" preview />);
  const author = (n: number) => view.container.querySelectorAll("[data-fan-post-row]")[n - 1]!.querySelector("[class*=authorCell]")!.textContent;
  expect(author(1)).toBe("Writer1 · 운영자");
  expect(view.container.querySelector("[data-fan-post-row] [data-edited-mark]")).toHaveTextContent("수정됨");
  expect(author(2)).toBe("Writer2 · 인증 아티스트");
  expect(author(3)).toBe("Writer3");
  expect(screen.queryAllByText(/운영자/)).toHaveLength(1);
});
