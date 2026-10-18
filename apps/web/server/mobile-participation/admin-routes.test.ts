import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createParticipationAdminHandlers, type ParticipationAdminDependencies } from "./admin-routes";

const appUserId = "11111111-1111-4111-8111-111111111111";
const allowlistId = "22222222-2222-4222-8222-222222222222";
const celebrityId = "33333333-3333-4333-8333-333333333333";
const deps: ParticipationAdminDependencies = {
  authorize: vi.fn(async () => ({ email: "operator@example.test", role: "operator" as const, appUserId, allowlistId })),
  rpc: vi.fn(),
};
const api = createParticipationAdminHandlers(deps);
const request = (body: unknown) => new Request("https://byus.test/api/admin/participation/events", {
  method: "POST",
  headers: { authorization: "Bearer valid", "content-type": "application/json", "x-correlation-id": "44444444-4444-4444-8444-444444444444" },
  body: JSON.stringify(body),
});
const event = {
  id: null,
  expectedRevision: null,
  slug: "concert-one",
  celebrityId,
  kind: "concert",
  policyVersion: "concert-v1",
  state: "published",
  startsAt: "2026-10-12T10:00:00.000+09:00",
  endsAt: "2026-10-12T12:00:00.000+09:00",
  titleKo: "공연",
  titleEn: "Concert",
  summaryKo: "",
  summaryEn: "",
  applicationUrl: null,
  heroUrl: "/events/concert-one.webp",
  venueNameKo: "서울 공연장",
  venueNameEn: "Seoul Venue",
  addressKo: "서울시",
  addressEn: "Seoul",
  directionsUrl: "https://maps.example.test/concert-one",
  featuredRank: 1,
  reason: "새 공연 참여 정책을 게시합니다.",
};

beforeEach(() => vi.clearAllMocks());

describe("mobile participation admin routes", () => {
  it("preserves an omitted interior image for legacy callers and rejects unsafe image addresses", async () => {
    const body = { celebrityId, slug: "legacy-space", policyVersion: "v1", state: "published", opensAt: event.startsAt, closesAt: event.endsAt,
      benefitId: null, titleKo: "공간", titleEn: "Space", imageUrl: null, reason: "기존 공간의 운영 정보를 수정합니다." };
    vi.mocked(deps.rpc).mockResolvedValue({ id: celebrityId, revision: 1 });
    expect((await api.upsertSpace(request(body))).status).toBe(201);
    expect(deps.rpc).toHaveBeenCalledWith("upsert_admin_mobile_participation_space", expect.not.objectContaining({ p_interior_image_url: expect.anything() }));
    vi.mocked(deps.rpc).mockClear();
    expect((await api.upsertSpace(request({ ...body, interiorImageUrl: "//outside.test/image.jpg" }))).status).toBe(400);
    expect(deps.rpc).not.toHaveBeenCalled();
    expect((await api.upsertSpace(request({ ...body, interiorImageUrl: null }))).status).toBe(201);
    expect(deps.rpc).toHaveBeenCalledWith("upsert_admin_mobile_participation_space_v2", expect.objectContaining({ p_interior_image_url: null }));
  });
  it("registers an unseeded commemorative card campaign through the admin boundary", async () => {
    vi.mocked(deps.rpc).mockResolvedValue({ id: celebrityId, revision: 1, state: "draft" });
    const response = await api.upsertCommemorativeCard(request({
      id: null, expectedRevision: null, sourceEventId: celebrityId, slug: "kara-card-2026", policyVersion: "card-v1",
      state: "draft", opensAt: "2026-10-12T00:00:00.000Z", closesAt: "2026-10-13T00:00:00.000Z",
      titleKo: "KARA 기념 카드", titleEn: "KARA commemorative card", subtitleKo: "ByUs Day 2026", subtitleEn: "ByUs Day 2026",
      captionKo: "KARA 공식 기념 카드", captionEn: "Official KARA commemorative card", selectionLabelKo: "받을 멤버 카드", selectionLabelEn: "Member card",
      imageUrl: "/images/cards/kara-2026.jpg", members: [{ key: "gyuri", nameKo: "규리", nameEn: "Gyuri" }], shareAllowed: true,
      reason: "Create the development card campaign",
    }));
    expect(response.status).toBe(201);
    expect(deps.rpc).toHaveBeenCalledWith("upsert_admin_mobile_commemorative_card", expect.objectContaining({
      p_source_event_id: celebrityId, p_member_options: [{ key: "gyuri", nameKo: "규리", nameEn: "Gyuri" }], p_share_allowed: true,
    }));
  });

  it("writes actor identity, policy version, reason, and correlation id to the admin RPC", async () => {
    vi.mocked(deps.rpc).mockResolvedValue({ id: celebrityId, revision: 1 });
    const response = await api.upsertEvent(request(event));

    expect(response.status).toBe(201);
    expect(deps.rpc).toHaveBeenCalledWith("upsert_admin_mobile_participation_event_v2", expect.objectContaining({
      p_actor_app_user_id: appUserId,
      p_actor_admin_allowlist_id: allowlistId,
      p_policy_version: "concert-v1",
      p_hero_url: "/events/concert-one.webp",
      p_venue_name_en: "Seoul Venue",
      p_featured_rank: 1,
      p_reason: "새 공연 참여 정책을 게시합니다.",
      p_correlation_id: "44444444-4444-4444-8444-444444444444",
    }));
  });

  it("keeps viewer sessions read-only", async () => {
    vi.mocked(deps.authorize).mockResolvedValueOnce({ email: "viewer@example.test", role: "viewer", appUserId, allowlistId });
    const response = await api.upsertEvent(request(event));

    expect(response.status).toBe(403);
    expect(deps.rpc).not.toHaveBeenCalled();
  });

  it("registers official activity sources and resolves staff scans through staff auth", async () => {
    vi.mocked(deps.rpc).mockResolvedValueOnce({ id: celebrityId, revision: 1 });
    const source = await api.upsertActivitySource(request({ id: null, expectedRevision: null, sourceKind: "video", playbackUrl: "https://media.byus.test/video.webm", durationMs: 120000, state: "active", reason: "공식 활동 영상을 등록합니다." }));
    expect(source.status).toBe(201);
    expect(deps.rpc).toHaveBeenNthCalledWith(1, "upsert_admin_mobile_participation_activity_source", expect.objectContaining({ p_source_kind: "video", p_duration_ms: 120000 }));

    vi.mocked(deps.rpc).mockResolvedValueOnce({ requestId: celebrityId, status: "resolved", staffConfirmationRequired: true });
    const scan = await api.resolveStaffQr(request({ rawCode: "byus_pickup_code", requestKey: celebrityId }));
    expect(scan.status).toBe(200);
    expect(deps.rpc).toHaveBeenNthCalledWith(2, "resolve_admin_mobile_participation_qr", expect.objectContaining({ p_raw_code: "byus_pickup_code", p_request_key: celebrityId }));
  });

  it("passes the allowlisted destination and optional benefit binding when issuing a QR", async () => {
    vi.mocked(deps.rpc).mockResolvedValueOnce({ id: celebrityId, purpose: "space" });
    const response = await api.issueQr(request({
      purpose: "space", targetType: "fan_place", targetId: celebrityId, ownerAppUserId: null,
      benefitId: allowlistId, destinationPath: `/participation/spaces/${celebrityId}`,
      policyVersion: "space-v1", expiresAt: "2026-10-13T12:00:00.000+09:00",
      oneTime: false, staffConfirmationRequired: false, reason: "현장 방문 QR을 발급합니다.",
    }));
    expect(response.status).toBe(201);
    expect(deps.rpc).toHaveBeenCalledWith("issue_admin_mobile_participation_qr", expect.objectContaining({
      p_benefit_id: allowlistId,
      p_destination_path: `/participation/spaces/${celebrityId}`,
    }));
  });

  it("publishes a localized operating space with its benefit binding", async () => {
    vi.mocked(deps.rpc).mockResolvedValueOnce({ id: celebrityId, revision: 1, state: "published" });
    const response = await api.upsertSpace(request({
      id: null,
      expectedRevision: null,
      celebrityId,
      slug: "fan-space",
      policyVersion: "space-v1",
      state: "published",
      opensAt: "2026-10-12T10:00:00.000+09:00",
      closesAt: "2026-10-12T18:00:00.000+09:00",
      benefitId: allowlistId,
      titleKo: "팬 공간",
      titleEn: "Fan space",
      summaryKo: "현장 참여 공간",
      summaryEn: "On-site participation space",
      imageUrl: "/fan-space.webp",
      interiorImageUrl: "/fan-space-interior.webp",
      addressKo: "서울",
      addressEn: "Seoul",
      reason: "운영 공간과 혜택을 게시합니다.",
    }));

    expect(response.status).toBe(201);
    expect(deps.rpc).toHaveBeenCalledWith("upsert_admin_mobile_participation_space_v2", expect.objectContaining({
      p_interior_image_url: "/fan-space-interior.webp",
      p_actor_app_user_id: appUserId,
      p_actor_admin_allowlist_id: allowlistId,
      p_policy_version: "space-v1",
      p_benefit_id: allowlistId,
      p_title_en: "Fan space",
      p_correlation_id: "44444444-4444-4444-8444-444444444444",
    }));
  });
});
