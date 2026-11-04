import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
vi.mock("server-only", () => ({}));
vi.mock("@/server/data/client", () => ({ createClient: vi.fn() }));
import { NoticeRepository } from "./notice-repository";

function fixture() {
  const query = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(), range: vi.fn().mockResolvedValue({ error: null, data: [{
      id: "notice-1", slug: "welcome-byus", notice_kind: "welcome", pinned: true,
      published_at: "2026-09-11T00:00:00Z", celebrity_notice_localizations: [{ title: "환영해요" }],
    }] }),
  };
  const db = { from: vi.fn(() => query) } as unknown as SupabaseClient;
  return { query, repository: new NoticeRepository(db) };
}

describe("public notice ordering", () => {
  it("prioritizes standard notices before welcome notices before home pagination", async () => {
    const { repository, query } = fixture();
    const result = await repository.listPublic({ celebritySlug: "kara", locale: "ko", surface: "home", limit: 1 });
    expect(query.order.mock.calls).toEqual([
      ["notice_kind", { ascending: true }], ["pinned", { ascending: false }],
      ["published_at", { ascending: false }], ["id", { ascending: false }],
    ]);
    expect(query.order.mock.invocationCallOrder.at(-1)).toBeLessThan(query.range.mock.invocationCallOrder[0]!);
    expect(result.notices[0]?.kind).toBe("welcome");
    expect(query.eq).toHaveBeenCalledWith("celebrities.status", "published");
    expect(query.is).toHaveBeenCalledWith("celebrities.archived_at", null);
    expect(query.eq).toHaveBeenCalledWith("publication_status", "published");
    expect(query.is).toHaveBeenCalledWith("archived_at", null);
  });

  it("retains pinned-first ordering for the full notice list", async () => {
    const { repository, query } = fixture();
    await repository.listPublic({ celebritySlug: "kara", locale: "en" });
    expect(query.order.mock.calls).toEqual([
      ["pinned", { ascending: false }], ["published_at", { ascending: false }], ["id", { ascending: false }],
    ]);
    expect(query.eq).toHaveBeenCalledWith("celebrity_notice_localizations.locale", "en");
  });
});

describe("noticeBelongsToChannel", () => {
  function channelFixture(result: { data: unknown; error: { message: string } | null }) {
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue(result) };
    const db = { from: vi.fn(() => query) } as unknown as SupabaseClient;
    return { db, query, repository: new NoticeRepository(db) };
  }

  it("filters on both the notice id and the channel id", async () => {
    const { repository, query, db } = channelFixture({ data: { id: "n1" }, error: null });
    expect(await repository.noticeBelongsToChannel("n1", "c1")).toBe(true);
    expect(db.from).toHaveBeenCalledWith("celebrity_notices");
    expect(query.eq.mock.calls).toEqual([["id", "n1"], ["celebrity_id", "c1"]]);
  });

  it("is false when the notice belongs to another channel and throws on a storage error", async () => {
    expect(await channelFixture({ data: null, error: null }).repository.noticeBelongsToChannel("n1", "c2")).toBe(false);
    await expect(channelFixture({ data: null, error: { message: "boom" } }).repository.noticeBelongsToChannel("n1", "c1")).rejects.toThrow("boom");
  });
});
