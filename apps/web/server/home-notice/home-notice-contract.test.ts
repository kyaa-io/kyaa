import { describe, expect, it, vi } from "vitest";
import page from "./fixtures/read_public_home_notices.json";
import pageEn from "./fixtures/read_public_home_notices_en.json";
import empty from "./fixtures/read_public_home_notices_empty.json";
import detail from "./fixtures/read_public_home_notice.json";
import missing from "./fixtures/read_public_home_notice_missing.json";
import { createPublicHomeNoticesHandler } from "./home-notice-routes";
import { createHomeNoticeRepository, decodeHomeNoticeCursor } from "./home-notice-repository";

vi.mock("server-only", () => ({}));

/** Real SQL responses captured from the replay database by supabase/tests/home_notices.sh (HOME_NOTICE_FIXTURE_DIR). */
function repositoryReturning(data: unknown) {
  const rpc = vi.fn(async () => ({ data, error: null }));
  return { rpc, repository: createHomeNoticeRepository({ url: undefined, serviceRoleKey: undefined }, { rpc } as never) };
}

describe("home notices: real SQL responses through the route schemas", () => {
  it("parses a page with more rows and turns the last row into the next cursor", async () => {
    const { rpc, repository } = repositoryReturning(page);
    const result = await repository.listPublished("ko", { limit: 2 });
    expect(result.items.map(item => item.slug)).toEqual(["r8data-c", "r8data-d"]);
    expect(rpc).toHaveBeenCalledWith("read_public_home_notices", { p_locale: "ko", p_before_pinned: null, p_before: null, p_before_id: null, p_limit: 2 });
    const cursor = decodeHomeNoticeCursor(result.nextCursor!);
    expect(cursor).toEqual({ pinned: false, publishedAt: page.items[1]!.publishedAt, id: page.items[1]!.id });

    const next = repositoryReturning(empty);
    await next.repository.listPublished("ko", { limit: 2, cursor: result.nextCursor });
    expect(next.rpc).toHaveBeenCalledWith("read_public_home_notices", { p_locale: "ko", p_before_pinned: false, p_before: page.items[1]!.publishedAt, p_before_id: page.items[1]!.id, p_limit: 2 });
  });

  it("parses the English page, the empty page and the missing detail", async () => {
    const en = await repositoryReturning(pageEn).repository.listPublished("en", { limit: 20 });
    expect(en.nextCursor).toBeNull();
    expect(en.items.every(item => /^[A-Za-z ]+$/.test(item.title))).toBe(true);
    expect(await repositoryReturning(empty).repository.listPublished("ko", { limit: 5 })).toEqual({ items: [], nextCursor: null });
    expect(await repositoryReturning(missing).repository.findPublished("ko", "none")).toBeNull();
  });

  it("parses a detail and validates its body", async () => {
    const notice = await repositoryReturning(detail).repository.findPublished("ko", "r8data-d");
    expect(notice).toMatchObject({ slug: "r8data-d", category: "creator", title: "최신 D", pinned: false });
    expect(notice!.body.type).toBe("doc");
  });

  it("serves the public route with cache headers; an extra or repeated key is refused", async () => {
    const { repository } = repositoryReturning(page);
    const handler = createPublicHomeNoticesHandler(() => repository);
    const ok = await handler(new Request("https://kyaa.test/api/public/notices?locale=en"));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toMatch(/s-maxage=60/);
    expect(await ok.json()).toMatchObject({ items: [{ slug: "r8data-c" }, { slug: "r8data-d" }], nextCursor: expect.any(String) });
    for (const query of ["locale=ko&locale=en", "locale=ko&limit=5", "locale=ja", "cursor="]) {
      expect((await handler(new Request(`https://kyaa.test/api/public/notices?${query}`))).status, query).toBe(400);
    }
    expect((await handler(new Request("https://kyaa.test/api/public/notices?cursor=bm90LWEtY3Vyc29y"))).status).toBe(400);
    const failing = createPublicHomeNoticesHandler(() => ({ listPublished: async () => { throw new Error("down"); } }));
    expect((await failing(new Request("https://kyaa.test/api/public/notices"))).status).toBe(503);
  });
});
