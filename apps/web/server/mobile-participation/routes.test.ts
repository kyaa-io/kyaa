import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createMobileParticipationHandlers, type MobileParticipationDependencies } from "./routes";

const owner = "11111111-1111-4111-8111-111111111111";
const contextId = "22222222-2222-4222-8222-222222222222";
const postId = "33333333-3333-4333-8333-333333333333";
const requestKey = "44444444-4444-4444-8444-444444444444";
const deps: MobileParticipationDependencies = {
  authorize: vi.fn(async () => ({ appUserId: owner })),
  rpc: vi.fn(),
};
const api = createMobileParticipationHandlers(deps);
const request = (path: string, init?: RequestInit) => new Request(`https://byus.test${path}`, {
  headers: { authorization: "Bearer valid", "content-type": "application/json" },
  ...init,
});

beforeEach(() => vi.clearAllMocks());

describe("mobile participation routes", () => {
  it("claims one event card with an immutable policy and exposes an owner-only share payload", async () => {
    vi.mocked(deps.rpc)
      .mockResolvedValueOnce({ id: contextId, ownership: { memberKey: "gyuri" }, claimedAlready: false })
      .mockResolvedValueOnce({ id: contextId, member: "규리" });
    const claimed = await api.commemorativeCard(request(`/api/me/participation/cards/${contextId}?locale=ko`, {
      method: "POST",
      body: JSON.stringify({ memberKey: "gyuri", requestKey, expectedPolicyVersion: "card-v1" }),
    }), contextId);
    expect(claimed.status).toBe(201);
    expect(deps.rpc).toHaveBeenNthCalledWith(1, "claim_owned_mobile_commemorative_card", {
      p_app_user_id: owner, p_card_id: contextId, p_member_key: "gyuri", p_request_key: requestKey,
      p_expected_policy_version: "card-v1", p_locale: "ko",
    });

    const shared = await api.commemorativeCardShare(request(`/api/me/participation/cards/${contextId}/share?locale=ko`), contextId);
    expect(shared.status).toBe(200);
    expect(deps.rpc).toHaveBeenNthCalledWith(2, "read_owned_mobile_commemorative_card_share", {
      p_app_user_id: owner, p_card_id: contextId, p_locale: "ko",
    });
  });

  it("builds an opaque cursor from the last event and rejects duplicate query values", async () => {
    vi.mocked(deps.rpc).mockResolvedValue({
      configured: true,
      hasMore: true,
      items: [{ id: contextId, startsAt: "2026-10-12T01:00:00.000Z" }],
    });
    const response = await api.events(request("/api/me/participation/events?locale=en&limit=1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(JSON.parse(Buffer.from(body.nextCursor, "base64url").toString("utf8"))).toEqual({
      at: "2026-10-12T01:00:00.000Z",
      id: contextId,
    });
    expect(deps.rpc).toHaveBeenCalledWith("read_owned_mobile_participation_events_v2", {
      p_app_user_id: owner,
      p_locale: "en",
      p_after: null,
      p_after_id: null,
      p_limit: 1,
    });

    const invalid = await api.events(request("/api/me/participation/events?locale=ko&locale=en"));
    expect(invalid.status).toBe(400);
    expect(deps.rpc).toHaveBeenCalledTimes(1);
  });

  it("uses the path post id for optimistic updates", async () => {
    vi.mocked(deps.rpc).mockResolvedValue({ id: postId, revision: 2 });
    const response = await api.savePost(request(`/api/me/participation/posts/${postId}`, {
      method: "PATCH",
      body: JSON.stringify({
        contextType: "album",
        contextId,
        postId: null,
        kind: "memory",
        body: "공연 기록",
        assetIds: [],
        expectedRevision: 1,
        requestKey,
      }),
    }), postId);

    expect(response.status).toBe(200);
    expect(deps.rpc).toHaveBeenCalledWith("save_owned_mobile_participation_post_v2", expect.objectContaining({
      p_app_user_id: owner,
      p_post_id: postId,
      p_expected_revision: 1,
      p_request_key: requestKey,
    }));
  });

  it("routes an official answer to its source question", async () => {
    vi.mocked(deps.rpc).mockResolvedValue({ id: postId, answerToId: contextId, replayed: false });
    const response = await api.answerQuestion(request(`/api/me/participation/posts/${contextId}/answer`, {
      method: "POST", body: JSON.stringify({ body: "무대에서 답할게요.", requestKey }),
    }), contextId);

    expect(response.status).toBe(201);
    expect(deps.rpc).toHaveBeenCalledWith("answer_owned_mobile_participation_question", {
      p_app_user_id: owner, p_question_id: contextId, p_body: "무대에서 답할게요.", p_request_key: requestKey,
    });
  });

  it("deletes with an idempotency key and recovers the recorded result", async () => {
    vi.mocked(deps.rpc).mockResolvedValueOnce({ id: postId, revision: 3, removed: true, replayed: false });
    const removed = await api.removePost(request(`/api/me/participation/posts/${postId}`, {
      method: "DELETE",
      body: JSON.stringify({ expectedRevision: 2, requestKey }),
    }), postId);
    expect(removed.status).toBe(200);
    expect(deps.rpc).toHaveBeenNthCalledWith(1, "remove_owned_mobile_participation_post_v2", {
      p_app_user_id: owner, p_post_id: postId, p_expected_revision: 2, p_request_key: requestKey,
    });

    vi.mocked(deps.rpc).mockResolvedValueOnce({ id: postId, revision: 3, removed: true, operation: "delete" });
    const recovered = await api.postRequest(request(`/api/me/participation/posts/requests/${requestKey}`), requestKey);
    expect(recovered.status).toBe(200);
    expect(deps.rpc).toHaveBeenNthCalledWith(2, "read_owned_mobile_participation_post_request", {
      p_app_user_id: owner, p_request_key: requestKey,
    });
  });

  it("passes the immutable policy version with vote submissions", async () => {
    vi.mocked(deps.rpc).mockResolvedValue({ revision: 1 });
    const response = await api.vote(request(`/api/me/participation/votes/${contextId}`, {
      method: "POST",
      body: JSON.stringify({ optionIds: [postId], requestKey, expectedPolicyVersion: "vote-v2" }),
    }), contextId);

    expect(response.status).toBe(200);
    expect(deps.rpc).toHaveBeenCalledWith("submit_owned_mobile_participation_vote", expect.objectContaining({
      p_app_user_id: owner,
      p_vote_id: contextId,
      p_option_ids: [postId],
      p_expected_policy_version: "vote-v2",
    }));
  });

  it("reads a localized published space for the authenticated owner", async () => {
    vi.mocked(deps.rpc).mockResolvedValue({ space: { id: contextId, title: "Fan space" }, visit: { completed: true } });
    const response = await api.space(request(`/api/me/participation/spaces/${contextId}?locale=en`), contextId);

    expect(response.status).toBe(200);
    expect(deps.rpc).toHaveBeenCalledWith("read_owned_mobile_participation_space", {
      p_app_user_id: owner,
      p_space_id: contextId,
      p_locale: "en",
    });
  });

  it("uses playback evidence for activity heartbeats and resolves live slugs to context ids", async () => {
    vi.mocked(deps.rpc).mockResolvedValueOnce({ id: contextId, contextType: "live" });
    const context = await api.liveContext(request("/api/me/participation/live/show-1/context"), "show-1");
    expect(context.status).toBe(200);
    expect(deps.rpc).toHaveBeenNthCalledWith(1, "read_owned_mobile_participation_live_context", { p_app_user_id: owner, p_live_slug: "show-1" });

    vi.mocked(deps.rpc).mockResolvedValueOnce({ id: contextId, version: 3, watchedSeconds: 4, creditedSeconds: 2 });
    const heartbeat = await api.heartbeat(request(`/api/me/participation/activity-sessions/${contextId}/heartbeat`, {
      method: "POST", body: JSON.stringify({ expectedVersion: 2, foreground: true, playing: true, positionMs: 4200, clientMonotonicMs: 9100 }),
    }), contextId);
    expect(heartbeat.status).toBe(200);
    expect(deps.rpc).toHaveBeenNthCalledWith(2, "heartbeat_owned_mobile_participation_activity", {
      p_app_user_id: owner, p_session_id: contextId, p_expected_version: 2, p_foreground: true,
      p_playing: true, p_position_ms: 4200, p_client_monotonic_ms: 9100,
    });
  });

  it("maps stale policy and QR throttling errors without leaking database details", async () => {
    vi.mocked(deps.rpc).mockRejectedValueOnce(new Error("MOBILE_PARTICIPATION_POLICY_CHANGED private"));
    const stale = await api.vote(request(`/api/me/participation/votes/${contextId}`, {
      method: "POST",
      body: JSON.stringify({ optionIds: [postId], requestKey, expectedPolicyVersion: "old" }),
    }), contextId);
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({ error: { code: "POLICY_CHANGED" } });

    vi.mocked(deps.rpc).mockRejectedValueOnce(new Error("MOBILE_PARTICIPATION_QR_RATE_LIMITED private"));
    const limited = await api.resolveQr(request("/api/me/participation/qr/resolve", {
      method: "POST",
      body: JSON.stringify({ rawCode: "unknown-code", requestKey }),
    }));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    expect(await limited.json()).toEqual({ error: { code: "QR_RATE_LIMITED" } });
  });

  it("recovers a QR result by request key without retrying the mutation", async () => {
    vi.mocked(deps.rpc).mockResolvedValueOnce({ requestId: contextId, status: "resolved", replayed: true });
    const response = await api.qrStatus(request(`/api/me/participation/qr/requests/${requestKey}`), requestKey);
    expect(response.status).toBe(200);
    expect(deps.rpc).toHaveBeenCalledWith("read_owned_mobile_participation_qr_request", {
      p_app_user_id: owner,
      p_request_key: requestKey,
    });

    vi.mocked(deps.rpc).mockResolvedValueOnce(null);
    const missing = await api.qrStatus(request(`/api/me/participation/qr/requests/${requestKey}`), requestKey);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: { code: "QR_REQUEST_NOT_FOUND" } });
  });
});
