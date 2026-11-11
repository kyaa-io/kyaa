import { describe, expect, it, vi } from "vitest";
import { buildSourceOnlyLocalizations } from "../notice/source-only-content";
import { createSnsIngestService, snsIngestRequestSchema, SnsIngestSourceError, type SnsIngestDeps } from "./service";
import { snsIngestSlug } from "./source-url";

const now = new Date("2026-11-10T12:00:00Z");
const celebrityId = "fa400000-0000-4000-8000-0000000000a1";
const runId = "fa400000-0000-4000-8000-0000000000d1";

type Notice = { id: string; slug: string; status: "draft" | "published"; revision: number; title: string; body: unknown; everPublished: boolean };

function fakeDatabase(options: { tamper?: (body: unknown) => unknown; account?: string | null } = {}) {
  const notices = new Map<string, Notice>();
  const media = new Map<string, string>();
  const finished: unknown[] = [];
  let sequence = 0;
  const rpc = vi.fn(async (name: string, args: Record<string, any>) => {
    switch (name) {
      case "sns_ingest_source_context":
        return options.account === null ? null : { celebrityId, accountUrl: options.account ?? "https://www.instagram.com/wena/" };
      case "sns_ingest_begin_run": return runId;
      case "sns_ingest_save_draft": {
        const existing = notices.get(args.p_slug);
        if (existing?.status === "published") return { status: "duplicate", noticeId: existing.id, revision: existing.revision };
        if (existing?.everPublished) return { status: "blocked", noticeId: existing.id, revision: existing.revision };
        for (const src of JSON.stringify(args.p_body).match(/\/api\/public\/notice-media\/[0-9a-f-]{36}/g) ?? []) {
          if (media.get(src.split("/").at(-1)!) !== existing?.id) throw new Error("SNS_INGEST_INVALID_MEDIA");
        }
        const notice: Notice = existing
          ? { ...existing, revision: existing.revision + 1, title: args.p_title, body: args.p_body }
          : { id: `fa400000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`, slug: args.p_slug, status: "draft", revision: 1, title: args.p_title, body: args.p_body, everPublished: false };
        notices.set(args.p_slug, notice);
        return { status: existing ? "restored" : "created", noticeId: notice.id, revision: notice.revision };
      }
      case "sns_ingest_register_video_thumbnail":
      case "sns_ingest_register_media": media.set(args.p_media_id, args.p_notice_id); return null;
      case "sns_ingest_read_draft": {
        const notice = [...notices.values()].find(item => item.id === args.p_notice_id)!;
        const body = options.tamper ? options.tamper(notice.body) : notice.body;
        return { revision: notice.revision, publicationStatus: notice.status, localizations: { ko: { title: notice.title, body }, en: { title: notice.title, body } } };
      }
      case "sns_ingest_publish": {
        const notice = [...notices.values()].find(item => item.id === args.p_notice_id)!;
        if (notice.status !== "draft" || notice.revision !== args.p_expected_revision) throw new Error("SNS_INGEST_NOTICE_NOT_WRITABLE");
        Object.assign(notice, { status: "published", revision: notice.revision + 1, everPublished: true });
        return null;
      }
      case "sns_ingest_finish_run": finished.push(args); return null;
      default: throw new Error(`unexpected ${name}`);
    }
  });
  const deps: SnsIngestDeps = {
    rpc,
    fetchImage: vi.fn(async () => new Uint8Array([1, 2, 3])),
    processImage: vi.fn(async () => ({ bytes: new Uint8Array([4]), thumbnail: new Uint8Array([5]), width: 1080, height: 1350, sha256: "a".repeat(64) })),
    upload: vi.fn(async () => undefined),
    now: () => now,
  };
  return { deps, notices, finished, rpc };
}

const post = (code: string, extra: Record<string, unknown> = {}) => ({
  sourceId: code, sourceUrl: `https://www.instagram.com/wena/p/${code}/`, sourcePublishedAt: "2026-11-09T09:00:00+09:00",
  text: "오늘 무대 고마워요 💜\n#wena", ...extra,
});
const request = (posts: unknown[], extra: Record<string, unknown> = {}) =>
  snsIngestRequestSchema.parse({ celebritySlug: "wena", platform: "instagram", posts, ...extra });

describe("sns ingest service", () => {
  it("stores a video cover without changing the original body or bypassing image review", async () => {
    const { deps, notices, rpc } = fakeDatabase();
    const result = await createSnsIngestService(deps).ingest(request([post("DQabc123xyz", { videoThumbnail: { url: "https://scontent.cdninstagram.com/cover.jpg" } })]), "c");
    expect(result.items[0]).toMatchObject({ status: "held", reason: "PHOTO_REVIEW_REQUIRED" });
    expect(rpc.mock.calls.some(([name]) => name === "sns_ingest_publish")).toBe(false);
    expect(deps.fetchImage).toHaveBeenCalledWith(new URL("https://scontent.cdninstagram.com/cover.jpg"));
    expect(deps.upload).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledWith("sns_ingest_register_video_thumbnail", expect.objectContaining({ p_source_host: "scontent.cdninstagram.com" }));
    expect(JSON.stringify([...notices.values()][0]?.body)).not.toContain("notice-media");
    expect(rpc.mock.invocationCallOrder[rpc.mock.calls.findIndex(([name]) => name === "sns_ingest_register_video_thumbnail")]).toBeLessThan(vi.mocked(deps.upload).mock.invocationCallOrder[0]!);
  });
  it("rejects an untrusted video cover before any download or draft write", async () => {
    const { deps, notices } = fakeDatabase();
    const result = await createSnsIngestService(deps).ingest(request([post("DQabc123xyz", { videoThumbnail: { url: "https://169.254.169.254/cover" } })]), "c");
    expect(result.items[0]?.reason).toBe("IMAGE_HOST_NOT_ALLOWED");
    expect(deps.fetchImage).not.toHaveBeenCalled();
    expect(notices.size).toBe(0);
  });
  it("holds a failed video-cover upload instead of publishing a broken cover", async () => {
    const { deps } = fakeDatabase();
    vi.mocked(deps.upload).mockRejectedValue(new Error("unavailable"));
    const result = await createSnsIngestService(deps).ingest(request([post("DQabc123xyz", { videoThumbnail: { url: "https://scontent.cdninstagram.com/cover.jpg" } })]), "c");
    expect(result.items[0]).toMatchObject({ status: "held", reason: "IMAGE_FAILED" });
  });

  it("holds photos for human review with original caption and stored images", async () => {
    const { deps, notices, rpc } = fakeDatabase();
    const result = await createSnsIngestService(deps).ingest(request([post("DQabc123xyz", { images: [{ url: "https://scontent.cdninstagram.com/a.jpg" }] })]), "c");
    expect(result.items).toEqual([expect.objectContaining({ status: "held", reason: "PHOTO_REVIEW_REQUIRED", slug: snsIngestSlug("instagram", "DQabc123xyz") })]);
    const notice = [...notices.values()][0]!;
    expect(notice.status).toBe("draft");
    expect(rpc.mock.calls.some(([name]) => name === "sns_ingest_publish")).toBe(false);
    expect(notice.title).toBe("오늘 무대 고마워요 💜");
    const mediaId = JSON.stringify(notice.body).match(/notice-media\/([0-9a-f-]{36})/)![1];
    expect(notice.body).toEqual(buildSourceOnlyLocalizations({
      source: { url: "https://www.instagram.com/wena/p/DQabc123xyz/", title: "", text: "오늘 무대 고마워요 💜\n#wena" },
      images: [{ src: `/api/public/notice-media/${mediaId}`, width: 1080, height: 1350 }],
    }).ko.body);
    expect(deps.upload).toHaveBeenCalledWith(`sns-ingest/${notice.id}/${mediaId}.webp`, expect.any(Uint8Array));
  });

  it("refuses caller-written titles, bodies and alt text", () => {
    expect(() => request([post("DQabc123xyz", { localizations: { ko: { title: "요약" } } })])).toThrow();
    expect(() => request([post("DQabc123xyz", { images: [{ url: "https://scontent.cdninstagram.com/a.jpg", alt: "무대 사진" }] })])).toThrow();
  });

  it("rejects an unregistered creator account and another account's post", async () => {
    await expect(createSnsIngestService(fakeDatabase({ account: null }).deps).ingest(request([post("DQabc123xyz")]), "c")).rejects.toBeInstanceOf(SnsIngestSourceError);
    const { deps, notices } = fakeDatabase();
    const result = await createSnsIngestService(deps).ingest(request([
      post("DQabc123xyz", { sourceUrl: "https://www.instagram.com/someone/p/DQabc123xyz/" }),
      post("DQabc123xyz", { sourceId: "OTHER12345" }),
      post("DQabc123xyz", { images: [{ url: "https://evil.example/a.jpg" }] }),
    ]), "c");
    expect(result.items.map(item => item.reason)).toEqual(["SOURCE_ACCOUNT_MISMATCH", "SOURCE_ACCOUNT_MISMATCH", "IMAGE_HOST_NOT_ALLOWED"]);
    expect(notices.size).toBe(0);
    expect(deps.fetchImage).not.toHaveBeenCalled();
  });

  it("does not create or change anything for a duplicate slug", async () => {
    const { deps, notices } = fakeDatabase();
    const service = createSnsIngestService(deps);
    await service.ingest(request([post("DQabc123xyz")]), "c");
    const before = structuredClone([...notices.values()]);
    const again = await service.ingest(request([post("DQabc123xyz", { text: "바뀐 캡션" }), post("DQabc123xyz")]), "c");
    expect(again.items.map(item => item.status)).toEqual(["duplicate", "duplicate"]);
    expect([...notices.values()]).toEqual(before);
  });

  it("keeps the post private when the stored copy differs from the original", async () => {
    const { deps, notices, rpc } = fakeDatabase({ tamper: body => JSON.parse(JSON.stringify(body).replace("고마워요", "감사합니다")) });
    const result = await createSnsIngestService(deps).ingest(request([post("DQabc123xyz")]), "c");
    expect(result.items[0]).toMatchObject({ status: "held", reason: "READBACK_MISMATCH" });
    expect([...notices.values()][0]!.status).toBe("draft");
    expect(rpc.mock.calls.some(([name]) => name === "sns_ingest_publish")).toBe(false);
  });

  it("keeps the draft private when an image cannot be stored", async () => {
    const { deps, notices } = fakeDatabase();
    deps.fetchImage = vi.fn(async () => { throw new Error("SNS_INGEST_IMAGE_UNAVAILABLE"); });
    const result = await createSnsIngestService(deps).ingest(request([post("DQabc123xyz", { images: [{ url: "https://scontent.cdninstagram.com/a.jpg" }] })]), "c");
    expect(result.items[0]).toMatchObject({ status: "held", reason: "IMAGE_FAILED" });
    expect([...notices.values()][0]!.status).toBe("draft");
  });

  it("does not rewrite a post that was ever published", async () => {
    const { deps, notices } = fakeDatabase();
    notices.set(snsIngestSlug("instagram", "DQabc123xyz"), { id: "fa400000-0000-4000-8000-0000000000e1", slug: "x", status: "draft", revision: 3, title: "원래", body: {}, everPublished: true });
    const result = await createSnsIngestService(deps).ingest(request([post("DQabc123xyz")]), "c");
    expect(result.items[0]!.status).toBe("blocked");
    expect([...notices.values()][0]!.title).toBe("원래");
  });

  it("publishes at most five per run, skips posts older than 30 days and records the run", async () => {
    const { deps, finished } = fakeDatabase();
    const posts = Array.from({ length: 7 }, (_, index) => post(`DQcode${index}xx`));
    posts.push(post("DQoldxxxxx", { sourcePublishedAt: "2026-10-01T00:00:00Z" }));
    const result = await createSnsIngestService(deps).ingest(request(posts), "c");
    expect(result.items.map(item => item.status)).toEqual(["published", "published", "published", "published", "published", "deferred", "deferred", "skipped"]);
    expect(finished).toEqual([expect.objectContaining({ p_succeeded: true, p_items: result.items })]);
  });

  it("records a collector failure without posts as an unsuccessful run", async () => {
    const { deps, finished } = fakeDatabase();
    expect(() => request([post("DQabc123xyz")], { collectorError: "BLOCKED_LOGIN" })).toThrow();
    await createSnsIngestService(deps).ingest(request([], { collectorError: "BLOCKED_LOGIN" }), "c");
    expect(finished).toEqual([expect.objectContaining({ p_succeeded: false, p_items: [] })]);
  });

  it("titles a caption-less photo post with the registered account only", async () => {
    const { deps, notices } = fakeDatabase();
    const result = await createSnsIngestService(deps).ingest(request([post("DQabc123xyz", { text: "", images: [{ url: "https://scontent.cdninstagram.com/a.jpg" }] })]), "c");
    expect(result.items[0]).toMatchObject({ status: "held", reason: "PHOTO_REVIEW_REQUIRED" });
    expect([...notices.values()][0]!.title).toBe("@wena");
    expect(() => request([post("DQabc123xyz", { title: "새 제목" })])).toThrow();
  });

  it("holds a caption-less post with no original text", async () => {
    const { deps, notices } = fakeDatabase();
    const result = await createSnsIngestService(deps).ingest(request([post("DQabc123xyz", { text: "  " })]), "c");
    expect(result.items[0]).toMatchObject({ status: "rejected", reason: "SOURCE_TEXT_MISSING" });
    expect(notices.size).toBe(0);
  });
});
