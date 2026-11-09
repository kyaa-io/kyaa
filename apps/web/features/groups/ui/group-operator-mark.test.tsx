// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";
import { fanUiText } from "@/components/fan-ui/fan-ui-copy";

const base = { profileId: "55555555-5555-4555-8555-555555555555", avatarUrl: null, anonymous: false, createdAt: "2026-11-07T00:00:00Z", canDelete: false, parentId: null, assets: [] };
const items = [
  { ...base, id: "11111111-1111-4111-8111-111111111111", body: "운영자 댓글", nickname: "방장", operator: true },
  { ...base, id: "22222222-2222-4222-8222-222222222222", body: "아티스트 겸 운영자", nickname: "별", artist: true, operator: true },
  { ...base, id: "33333333-3333-4333-8333-333333333333", body: "팬 댓글", nickname: "하늘", operator: false },
];
vi.mock("./use-group-resource", () => ({ useGroupResource: () => ({ data: { items, nextCursor: null }, error: false, loading: false, authenticated: true, ownerKey: "me", retry: vi.fn(), request: vi.fn() }) }));
vi.mock("@/features/content-safety/ui/use-wave-media-upload", () => ({ useWaveMediaUpload: () => ({ items: [], busy: false, ready: true, invalid: false, add: vi.fn(), retry: vi.fn(), remove: vi.fn(), markUsed: vi.fn() }) }));
vi.mock("@/features/dukjil/ui/earn-badge", () => ({ EarnBadgeCorner: ({ children }: { children: React.ReactNode }) => children, EarnActionBadge: () => null }));

import { GroupOperatorMark } from "./group-operator-mark";
import { GroupPostComments } from "./group-post-comments";

afterEach(cleanup);

describe("GroupOperatorMark", () => {
  it("is a plain neutral tag with the operator wording", () => {
    const { container } = render(<GroupOperatorMark locale="ko" />);
    expect(screen.getByText("운영자")).toHaveAttribute("data-fan-tag", "neutral");
    expect(container.querySelector("svg")).toBeNull();
  });

  it("has a short wording in all 12 languages, different from the artist tag", () => {
    for (const locale of APP_LOCALES) {
      const text = fanUiText(locale, "operatorTag");
      expect(text.trim().length, locale).toBeGreaterThan(0);
      expect(text, locale).not.toBe(fanUiText(locale, "artistTag"));
      expect(text.length, locale).toBeLessThanOrEqual(12);
    }
  });

  it("marks operator comments, and an artist who is also an operator shows only the artist tag", () => {
    render(<GroupPostComments pageId="66666666-6666-4666-8666-666666666666" postId="77777777-7777-4777-8777-777777777777" locale="ko" canWrite />);
    const rowOf = (name: string) => screen.getByText(name).closest("div")!;
    expect(within(rowOf("방장")).getByText("운영자")).toHaveAttribute("data-fan-tag", "neutral");
    expect(within(rowOf("별")).getByText("인증 아티스트")).toBeTruthy();
    expect(within(rowOf("별")).queryByText("운영자")).toBeNull();
    expect(within(rowOf("하늘")).queryByText("운영자")).toBeNull();
  });
});
