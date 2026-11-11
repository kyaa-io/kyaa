import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AuthError } from "@/features/auth/domain/auth-errors";
import { createProofHandlers, proofRequestHash } from "./proofs";
import { containsPersonalInfo } from "./proof-pii";
import { PROOF_POST_BODY, proofPostBody } from "./proof-post-body";
import { APP_LOCALES } from "@/i18n/locales";
import type { DukjilDependencies } from "./routes";

const owner = "11111111-1111-4111-8111-111111111111", creator = "33333333-3333-4333-8333-333333333333", key = "44444444-4444-4444-8444-444444444444";
const upload = "55555555-5555-4555-8555-555555555555", sub = "66666666-6666-4666-8666-666666666666", post = "77777777-7777-4777-8777-777777777777";
const stream = vi.fn(async (_path: string) => new Response("webpbytes", { status: 200 }));
const readMissions = vi.fn();
const deps: DukjilDependencies & { stream: typeof stream; readMissions: typeof readMissions } = { stream, readMissions, authorize: vi.fn(async () => ({ appUserId: owner })), rpc: vi.fn(), resolveCreatorId: vi.fn(async (slug: string) => (slug === "kyaa-wave" ? creator : null)) };
const h = createProofHandlers(deps);
const send = (body: unknown, auth = true) => new Request("https://fixture.test/api/me/proofs", { method: "POST", headers: { ...(auth ? { authorization: "Bearer x" } : {}), "content-type": "application/json" }, body: JSON.stringify(body) });
const valid = { requestKey: key, creator: "kyaa-wave", proofType: "purchase", uploadId: upload, publishConsent: true, amountVisible: true, imagePhash: ["0123456789abcdef"] };
const dbResult = { id: sub, status: "pending", revision: 0, replayed: false };
beforeEach(() => { vi.clearAllMocks(); vi.mocked(deps.authorize).mockResolvedValue({ appUserId: owner }); });

describe("submit", () => {
  it("refuses to publish an SNS post on the proof board before reaching the database", async () => {
    expect((await h.submit(send({ ...valid, proofType: "sns_post", publishConsent: true }))).status).toBe(400);
    expect(deps.rpc).not.toHaveBeenCalled();
    vi.mocked(deps.rpc).mockResolvedValue(dbResult);
    expect((await h.submit(send({ ...valid, proofType: "sns_post", publishConsent: false, amountVisible: null }))).status).toBe(200);
    expect(vi.mocked(deps.rpc).mock.calls[0][1]).toMatchObject({ p_proof_type: "sns_post", p_publish_consent: false, p_post_body: null });
  });
  it("sends server-owned identity, the creator id and a request hash to the database", async () => {
    vi.mocked(deps.rpc).mockResolvedValue(dbResult);
    const res = await h.submit(send(valid));
    expect(res.status).toBe(200); expect(await res.json()).toEqual({ submissionId: sub, status: "pending", revision: 0, replayed: false });
    const [name, args] = vi.mocked(deps.rpc).mock.calls[0] as [string, Record<string, unknown>];
    expect(name).toBe("submit_certification_proof");
    expect(args).toMatchObject({ p_user: owner, p_celebrity: creator, p_proof_type: "purchase", p_upload_id: upload, p_publish_consent: true, p_amount_visible: true, p_idempotency_key: key, p_pii_detected: false, p_post_body: "인증했어요" });
    expect(args.p_request_hash).toMatch(/^[0-9a-f]{64}$/);
  });
  it("requires login and rejects an owner field smuggled into the body", async () => {
    vi.mocked(deps.authorize).mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED", 401, "x"));
    expect((await h.submit(send(valid, false))).status).toBe(401);
    vi.mocked(deps.authorize).mockResolvedValue({ appUserId: owner });
    expect((await h.submit(send({ ...valid, userId: "someone" }))).status).toBe(400);
    expect(deps.rpc).not.toHaveBeenCalled();
  });
  it("returns the first result again for a resend (replayed)", async () => {
    vi.mocked(deps.rpc).mockResolvedValue({ ...dbResult, replayed: true });
    expect((await (await h.submit(send(valid))).json()).replayed).toBe(true);
  });
  it("blocks personal information in the note: the flag reaches the database and the database error is a 422", async () => {
    vi.mocked(deps.rpc).mockRejectedValue(new Error("PROOF_PII_DETECTED"));
    const res = await h.submit(send({ ...valid, note: "연락은 010-1234-5678 로 주세요" }));
    expect(res.status).toBe(422); expect((await res.json()).error.code).toBe("PROOF_PII_DETECTED");
    expect(vi.mocked(deps.rpc).mock.calls[0][1]).toMatchObject({ p_pii_detected: true });
  });
  it.each([
    ["PROOF_MONTHLY_LIMIT", 429], ["UPLOAD_EXPIRED", 410], ["UPLOAD_INVALID", 422], ["IDEMPOTENCY_MISMATCH", 409], ["PASSPORT_REQUIRED", 403],
    ["PROOF_ALREADY_OPEN", 409], ["PROOF_ALREADY_APPROVED", 409], ["PROOF_MISSION_LEGACY", 409], ["PROOF_TYPE_MISMATCH", 409], ["PROOF_MISSION_UNAVAILABLE", 409], ["PROOF_STAMP_UNAVAILABLE", 409],
  ])("maps %s to %i", async (code, status) => {
    vi.mocked(deps.rpc).mockRejectedValue(new Error(code));
    const res = await h.submit(send(valid));
    expect(res.status).toBe(status); expect((await res.json()).error.code).toBe(code);
  });
  it("answers a second approved membership (unique index 23505) as already approved, not as an outage", async () => {
    vi.mocked(deps.rpc).mockRejectedValue(new Error('duplicate key value violates unique constraint "certification_membership_approved_once"'));
    const res = await h.submit(send(valid));
    expect(res.status).toBe(409); expect((await res.json()).error.code).toBe("PROOF_ALREADY_APPROVED");
  });
  it("keeps unknown database errors out of the response", async () => {
    vi.mocked(deps.rpc).mockRejectedValue(new Error("relation certification_submissions secret"));
    const res = await h.submit(send(valid));
    expect(res.status).toBe(503); expect(JSON.stringify(await res.json())).not.toContain("secret");
  });
  it("404s an unknown creator without calling the database", async () => {
    expect((await h.submit(send({ ...valid, creator: "nobody" }))).status).toBe(404);
    expect(deps.rpc).not.toHaveBeenCalled();
  });
  it("hashes every client decision", () => {
    const a = proofRequestHash({ x: 1, y: [1] }), b = proofRequestHash({ y: [1], x: 1 });
    expect(a).toBe(b); expect(proofRequestHash({ x: 1, y: [2] })).not.toBe(a);
  });
});

describe("post body", () => {
  it("uses the one-liner, else the default phrase in the body locale, Accept-Language or Korean", async () => {
    vi.mocked(deps.rpc).mockResolvedValue(dbResult);
    const bodyOf = () => (vi.mocked(deps.rpc).mock.calls.at(-1)![1] as Record<string, unknown>).p_post_body;
    await h.submit(send({ ...valid, note: "앨범 샀어요" })); expect(bodyOf()).toBe("앨범 샀어요");
    await h.submit(send({ ...valid, locale: "ja" })); expect(bodyOf()).toBe("認証しました");
    await h.submit(new Request("https://fixture.test/api/me/proofs", { method: "POST", headers: { authorization: "Bearer x", "accept-language": "fr-FR,fr;q=0.9" }, body: JSON.stringify(valid) })); expect(bodyOf()).toBe("Je suis vérifié !");
    await h.submit(send({ ...valid, publishConsent: false })); expect(bodyOf()).toBeNull();
  });
});

describe("resubmit", () => {
  const body = { expectedRevision: 1, uploadId: upload, imagePhash: ["0123456789abcdef"] };
  it("calls the resubmit function for the owner", async () => {
    vi.mocked(deps.rpc).mockResolvedValue({ ...dbResult, revision: 2 });
    const res = await h.resubmit(send(body), sub);
    expect(res.status).toBe(200); expect((await res.json()).revision).toBe(2);
    expect(deps.rpc).toHaveBeenCalledWith("resubmit_certification_proof", { p_user: owner, p_submission_id: sub, p_expected_revision: 1, p_upload_id: upload, p_image_phash: ["0123456789abcdef"], p_pii_detected: false, p_post_body: "인증했어요" });
  });
  it("maps a stale revision, a foreign submission and a bad id", async () => {
    vi.mocked(deps.rpc).mockRejectedValueOnce(new Error("REVISION_CONFLICT"));
    expect((await h.resubmit(send(body), sub)).status).toBe(409);
    vi.mocked(deps.rpc).mockRejectedValueOnce(new Error("PROOF_NOT_FOUND"));
    expect((await h.resubmit(send(body), sub)).status).toBe(404);
    vi.mocked(deps.rpc).mockClear();
    expect((await h.resubmit(send(body), "nope")).status).toBe(400);
    expect(deps.rpc).not.toHaveBeenCalled();
  });
});

describe("my proofs", () => {
  it("lists only the caller's rows and needs the creator", async () => {
    const item = { submissionId: sub, proofType: "purchase", status: "changes_requested", revision: 1, reason: "다시", publishConsent: true, amountVisible: true, submittedAt: "2026-11-06T00:00:00Z", reviewedAt: "2026-11-06T01:00:00Z" };
    vi.mocked(deps.rpc).mockResolvedValue([item]);
    const res = await h.mine(new Request("https://fixture.test/api/me/proofs?creator=kyaa-wave", { headers: { authorization: "Bearer x" } }));
    expect(await res.json()).toEqual({ items: [item] });
    expect(deps.rpc).toHaveBeenCalledWith("list_my_certification_proofs", { p_user: owner, p_celebrity: creator });
    expect((await h.mine(new Request("https://fixture.test/api/me/proofs", { headers: { authorization: "Bearer x" } }))).status).toBe(400);
  });
});

describe("public proof board", () => {
  const url = (q = "category=proof") => new Request(`https://fixture.test/api/pages/kyaa-wave/posts?${q}`);
  const row = { postId: post, authorId: owner, body: "인증했어요", createdAt: "2026-11-06T00:00:00.123456+00:00", submissionId: sub, proofType: "purchase", amountVisible: true, imageObjectPath: "owner-secret/folder/proof.webp", jjinfanRank: 7 };
  const imageUrl = `/api/pages/kyaa-wave/posts/${post}/image?t=${encodeURIComponent(row.createdAt)}`;
  it("works without login and exposes no author, submission or image identifier", async () => {
    vi.mocked(deps.rpc).mockResolvedValue([row]);
    const res = await h.board(url(), "kyaa-wave");
    const text = await res.text();
    expect(res.status).toBe(200); expect(deps.authorize).not.toHaveBeenCalled();
    for (const secret of [owner, sub, "authorId", "submissionId", "publishConsent", "imagePhash", "uploadId", "objectPath", "imageObjectPath", "owner-secret", "certification-proofs", "token=", "/storage/"]) expect(text).not.toContain(secret);
    expect(JSON.parse(text)).toEqual({ items: [{ postId: post, body: "인증했어요", createdAt: row.createdAt, proofType: "purchase", amountVisible: true, imageUrl, jjinfanRank: 7, awardedPoints: null }], nextBefore: null });
    expect(res.headers.get("cache-control")).toContain("public");
    expect(deps.rpc).toHaveBeenCalledWith("read_proof_board", { p_celebrity: creator, p_limit: 20, p_before: null, p_viewer: null });
    expect(res.headers.get("vary")).toBe("Authorization");
  });
  it("returns the historical award without substituting today's policy", async () => {
    vi.mocked(deps.rpc).mockResolvedValue([{ ...row, awardedPoints: 37 }]);
    expect((await (await h.board(url(), "kyaa-wave")).json()).items[0].awardedPoints).toBe(37);
  });
  it("only asks the database for the consented board and pages with nextBefore", async () => {
    vi.mocked(deps.rpc).mockResolvedValue([row, { ...row, postId: sub, createdAt: "2026-11-05T00:00:00Z" }]);
    const res = await h.board(url("category=proof&limit=2"), creator);
    expect((await res.json()).nextBefore).toBe("2026-11-05T00:00:00Z");
    expect(deps.rpc).toHaveBeenCalledWith("read_proof_board", { p_celebrity: creator, p_limit: 2, p_before: null, p_viewer: null });
  });
  it("passes the verified session user as the viewer and answers privately", async () => {
    vi.mocked(deps.rpc).mockResolvedValue([row]);
    const res = await h.board(new Request("https://fixture.test/api/pages/kyaa-wave/posts?category=proof", { headers: { authorization: "Bearer x" } }), "kyaa-wave");
    expect(res.status).toBe(200);
    expect(deps.rpc).toHaveBeenCalledWith("read_proof_board", { p_celebrity: creator, p_limit: 20, p_before: null, p_viewer: owner });
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.text()).not.toContain("authorId");
  });
  it("reads an invalid token as anonymous and never trusts a viewer query value", async () => {
    vi.mocked(deps.authorize).mockRejectedValueOnce(new AuthError("AUTHENTICATION_REQUIRED", 401, "x"));
    vi.mocked(deps.rpc).mockResolvedValue([row]);
    const res = await h.board(new Request(`https://fixture.test/api/pages/kyaa-wave/posts?category=proof&viewer=${sub}`, { headers: { authorization: "Bearer bad" } }), "kyaa-wave");
    expect(res.status).toBe(200);
    expect(deps.rpc).toHaveBeenCalledWith("read_proof_board", { p_celebrity: creator, p_limit: 20, p_before: null, p_viewer: null });
  });
  it("rejects other categories and a limit over 50", async () => {
    expect((await h.board(url("category=general"), "kyaa-wave")).status).toBe(400);
    expect((await h.board(url("category=proof&limit=51"), "kyaa-wave")).status).toBe(400);
    expect((await h.board(url(""), "kyaa-wave")).status).toBe(400);
    expect(deps.rpc).not.toHaveBeenCalled();
  });
});

describe("proof missions", () => {
  const m1 = "88888888-8888-4888-8888-888888888888", m2 = "99999999-9999-4999-8999-999999999999";
  const list = () => h.missions(new Request("https://fixture.test/api/me/proofs/missions?creator=kyaa-wave", { headers: { authorization: "Bearer x" } }));
  const rows = (over = {}) => ({ missions: [{ id: m1, proofType: "membership", platform: "Weverse", closesAt: "2026-12-01T00:00:00Z" }, { id: m2, proofType: "purchase", platform: null, closesAt: "2026-12-02T00:00:00Z" }], openMissionIds: [], approvedMissionIds: [], monthCount: 0, ...over });
  it("lists submittable missions for the creator without member data", async () => {
    readMissions.mockResolvedValue(rows());
    const res = await list();
    expect(res.status).toBe(200); expect(res.headers.get("cache-control")).toContain("no-store");
    const body = await res.json();
    expect(body.items).toEqual([
      { missionId: m1, proofType: "membership", platform: "Weverse", submittable: true, unavailableReason: null, closesAt: "2026-12-01T00:00:00Z" },
      { missionId: m2, proofType: "purchase", platform: null, submittable: true, unavailableReason: null, closesAt: "2026-12-02T00:00:00Z" },
    ]);
    expect(JSON.stringify(body)).not.toContain(owner); expect(readMissions).toHaveBeenCalledWith(creator, owner);
  });
  it("marks an open submission and the monthly limit as not submittable", async () => {
    readMissions.mockResolvedValue(rows({ openMissionIds: [m1] }));
    expect((await (await list()).json()).items.map((i: { unavailableReason: string | null }) => i.unavailableReason)).toEqual(["PROOF_ALREADY_OPEN", null]);
    readMissions.mockResolvedValue(rows({ approvedMissionIds: [m1], openMissionIds: [m1] }));
    expect((await (await list()).json()).items.map((i: { submittable: boolean; unavailableReason: string | null }) => [i.submittable, i.unavailableReason])).toEqual([[false, "PROOF_ALREADY_APPROVED"], [true, null]]);
    readMissions.mockResolvedValue(rows({ monthCount: 2 }));
    expect((await (await list()).json()).items.every((i: { submittable: boolean; unavailableReason: string }) => !i.submittable && i.unavailableReason === "PROOF_MONTHLY_LIMIT")).toBe(true);
  });
  it("keeps an SNS post (slot 07) submittable at the monthly proof limit (BUGS-261110 B6)", async () => {
    const m3 = "77777777-7777-4777-8777-777777777777";
    readMissions.mockResolvedValue(rows({ monthCount: 2, missions: [...rows().missions, { id: m3, proofType: "sns_post", platform: "instagram", closesAt: "2026-12-03T00:00:00Z" }] }));
    expect((await (await list()).json()).items.map((i: { proofType: string; unavailableReason: string | null }) => [i.proofType, i.unavailableReason]))
      .toEqual([["membership", "PROOF_MONTHLY_LIMIT"], ["purchase", "PROOF_MONTHLY_LIMIT"], ["sns_post", null]]);
  });
  it("needs login and the creator, and returns an empty list when there is no mission", async () => {
    vi.mocked(deps.authorize).mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED", 401, "x"));
    expect((await list()).status).toBe(401);
    vi.mocked(deps.authorize).mockResolvedValue({ appUserId: owner });
    expect((await h.missions(new Request("https://fixture.test/api/me/proofs/missions", { headers: { authorization: "Bearer x" } }))).status).toBe(400);
    readMissions.mockResolvedValue(rows({ missions: [] }));
    expect(await (await list()).json()).toEqual({ items: [] });
  });
});

describe("proof public cache", () => {
  it("has no stale-while-revalidate on the board or the image", async () => {
    vi.mocked(deps.rpc).mockResolvedValue([{ postId: "77777777-7777-4777-8777-777777777777", body: "b", createdAt: "2026-11-01T00:00:00Z", proofType: "membership", amountVisible: null, imageObjectPath: "p/x.webp", jjinfanRank: null }]);
    const board = await h.board(new Request("https://fixture.test/api/pages/kyaa-wave/posts?category=proof"), "kyaa-wave");
    expect(board.headers.get("cache-control")).toBe("public, max-age=60");
    const img = await h.image(new Request("https://fixture.test/x?t=2026-11-01T00:00:00Z"), "kyaa-wave", "77777777-7777-4777-8777-777777777777");
    expect(img.headers.get("cache-control")).not.toContain("stale-while-revalidate");
  });
});

describe("proof board image", () => {
  const row = { postId: post, body: "x", createdAt: "2026-11-06T00:00:00.123456+00:00", proofType: "purchase", amountVisible: null, imageObjectPath: "owner-secret/proof.webp", jjinfanRank: null };
  const get = (t = row.createdAt, id = post) => h.image(new Request(`https://fixture.test/x?t=${encodeURIComponent(t)}`), "kyaa-wave", id);
  it("streams the object the board names, with no path in the response", async () => {
    vi.mocked(deps.rpc).mockResolvedValue([row]);
    const res = await get();
    expect(res.status).toBe(200); expect(await res.text()).toBe("webpbytes");
    expect(res.headers.get("content-type")).toBe("image/webp"); expect(JSON.stringify([...res.headers])).not.toContain("owner-secret");
    expect(stream).toHaveBeenCalledWith("owner-secret/proof.webp");
    expect(vi.mocked(deps.rpc).mock.calls[0][1]).toMatchObject({ p_celebrity: creator, p_limit: 5, p_before: "2026-11-06T00:00:00.124Z" });
  });
  it("404s when the board no longer lists the post (consent withdrawn, hidden, unapproved) or it has no image", async () => {
    vi.mocked(deps.rpc).mockResolvedValue([]);
    expect((await get()).status).toBe(404);
    vi.mocked(deps.rpc).mockResolvedValue([{ ...row, imageObjectPath: null }]);
    expect((await get()).status).toBe(404);
    expect(stream).not.toHaveBeenCalled();
  });
  it("rejects a bad post id or time", async () => {
    expect((await get(row.createdAt, "nope")).status).toBe(400);
    expect((await get("not-a-date")).status).toBe(400);
  });
  it("never serves an object other than the requested post's", async () => {
    vi.mocked(deps.rpc).mockResolvedValue([{ ...row, postId: sub }]);
    expect((await get()).status).toBe(404); expect(stream).not.toHaveBeenCalled();
  });
});

describe("personal information check", () => {
  it.each(["010-1234-5678", "01012345678", "문의 test@example.com", "900101-1234567", "4111 1111 1111 1111", "계좌 110-123-456789"])("blocks %s", (text) => expect(containsPersonalInfo(text)).toBe(true));
  it.each(["앨범 샀어요", "2026년 11월 6일 3만원", "굿즈 2개 구매", "", null])("allows %s", (text) => expect(containsPersonalInfo(text as string | null)).toBe(false));
});

describe("proof post body", () => {
  it("has all 12 languages and falls back to Korean", () => {
    for (const locale of APP_LOCALES) expect(PROOF_POST_BODY[locale].length).toBeGreaterThan(0);
    expect(proofPostBody("ja")).toBe("認証しました"); expect(proofPostBody("xx")).toBe("인증했어요"); expect(proofPostBody(null)).toBe("인증했어요");
  });
});
