import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { notificationItemSchema } from "../../features/notification/domain/notification-model";
import {
  createNotificationRepository,
  NotificationSubscriptionBusyError,
  projectNotificationRow,
} from "./notification-repository";
const base = {
  id: "11111111-1111-4111-8111-111111111111",
  created_at: "2026-07-22T00:00:00.000Z",
  read_at: null,
  live_events: null,
};
describe("FAN-019 progress notification projection", () => {
  it("keeps social message content out of inbox copy and links to a web page that exists", () => {
    const target = "10000000-0000-4000-8000-000000000001";
    for (const kind of ["fan_dm_request", "fan_dm_message", "fan_friend_request"]) {
      const path = kind === "fan_friend_request" ? `/people/${target}/friend-request?favorite=kara` : `/messages/${target}`;
      const item = projectNotificationRow({ ...base, kind, deep_link: path, payload: { body: "private message", nickname: "Private Name" } }, "ko");
      expect(notificationItemSchema.safeParse(item).success).toBe(true);
      expect(item.deepLink).toBe("/");
      expect(JSON.stringify(item)).not.toContain("private message");
      expect(JSON.stringify(item)).not.toContain("Private Name");
    }
  });
  it("projects owned activity notifications without private source data", () => {
    const id = "10000000-0000-4000-8000-000000000001";
    for (const [kind, path] of [["support_reply", `/support/${id}`], ["stamp_issued", `/stamps/${id}`], ["stamp_issued", "/my/community-stamps"], ["participation_deadline", `/activities/${id}`]]) {
      for (const locale of ["ko", "en"] as const) {
        const item = projectNotificationRow({ ...base, kind, deep_link: path, payload: { body: "private source", subject: "private source" } }, locale);
        expect(notificationItemSchema.safeParse(item).success).toBe(true);
        expect(item.deepLink).toBe(path.startsWith("/stamps/") ? path : path === "/my/community-stamps" ? "/passports" : "/");
        expect(item.deepLink).not.toContain("open-app");
        expect(JSON.stringify(item)).not.toContain("private source");
      }
    }
  });
  it("renders a level-up from its versioned payload and stored safe link", () => {
    const item = projectNotificationRow(
      {
        ...base,
        kind: "level_up",
        deep_link: "/passports",
        payload: { schemaVersion: 1, currentLevel: "Gold" },
        benefits: null,
      },
      "ko",
    );
    expect(notificationItemSchema.parse(item)).toMatchObject({
      kind: "level_up",
      title: "팬 레벨이 Gold로 올랐어요",
      deepLink: "/passports",
    });
  });
  it("renders benefit unlock localization and exact stored link", () => {
    const id = "22222222-2222-4222-8222-222222222222";
    const item = projectNotificationRow(
      {
        ...base,
        kind: "benefit_unlocked",
        deep_link: `/benefits/${id}`,
        payload: { schemaVersion: 1 },
        benefits: {
          id,
          benefit_localizations: [{ locale: "ko", title: "VIP Meet & Greet" }],
        },
      },
      "ko",
    );
    expect(notificationItemSchema.parse(item)).toMatchObject({
      kind: "benefit_unlocked",
      title: "VIP Meet & Greet 혜택이 열렸어요",
      deepLink: `/benefits/${id}`,
    });
  });
});
describe("localized action-required notification projection", () => {
  const benefitId = "22222222-2222-4222-8222-222222222222";
  const winnerId = "33333333-3333-4333-8333-333333333333";
  const benefit = {
    id: benefitId,
    benefit_localizations: [
      { locale: "ko", title: "사인 앨범" },
      { locale: "en", title: "Signed album" },
    ],
  };
  it.each([
    ["benefit_won", "You won Signed album"],
    ["recipient_information_required", "Enter recipient information"],
    ["fulfillment_meaningful_update", "Signed album status changed"],
    ["collectible_claim_available", "Your Collectible is ready"],
    ["collectible_claim_expiring", "Your Collectible claim period ends soon"],
  ] as const)("does not leak a stored Korean payload for %s", (kind, expected) => {
    const item = projectNotificationRow({
      ...base,
      kind,
      source_key: kind === "recipient_information_required" ? `recipient_information_required:${winnerId}:1` : `${kind}:test`,
      deep_link: `/benefits/${benefitId}`,
      payload: { title: "한국어 저장 제목", detail: "한국어 저장 본문", fulfillmentStatus: "shipping_in_transit" },
      benefits: benefit,
    }, "en");
    expect(item.title).toBe(expected);
    expect(`${item.title} ${item.detail}`).not.toContain("한국어");
  });
  it.each([
    ["ko", "information_required", "정보 입력 필요"],
    ["ko", "ready", "준비 완료"],
    ["ko", "shipping_preparing", "배송 준비 중"],
    ["ko", "shipping_in_transit", "배송 중"],
    ["ko", "shipping_completed", "배송 완료"],
    ["ko", "pickup_available", "수령 가능"],
    ["ko", "pickup_completed", "수령 완료"],
    ["ko", "digital_delivered", "지급 완료"],
    ["en", "information_required", "Information required"],
    ["en", "ready", "Ready"],
    ["en", "shipping_preparing", "Preparing shipment"],
    ["en", "shipping_in_transit", "In transit"],
    ["en", "shipping_completed", "Delivered"],
    ["en", "pickup_available", "Ready for pickup"],
    ["en", "pickup_completed", "Picked up"],
    ["en", "digital_delivered", "Delivered"],
  ] as const)("localizes the actual fulfillment enum %s/%s", (locale, fulfillmentStatus, expected) => {
    const item = projectNotificationRow({
      ...base,
      kind: "fulfillment_meaningful_update",
      source_key: `fulfillment_meaningful_update:${winnerId}:1`,
      deep_link: `/benefits/${benefitId}`,
      payload: { fulfillmentStatus },
      benefits: benefit,
    }, locale);
    expect(item.detail).toBe(expected);
  });
  it("keeps legacy links by default and derives the recipient route only for opted-in clients", () => {
    const row = {
      ...base,
      kind: "recipient_information_required",
      source_key: `recipient_information_required:${winnerId}:2`,
      deep_link: `/benefits/${benefitId}`,
      payload: {},
      benefits: benefit,
    };
    expect(projectNotificationRow(row, "en").deepLink).toBe(`/benefits/${benefitId}`);
    expect(projectNotificationRow(row, "en", true).deepLink).toBe(`/my/rewards/${winnerId}/recipient`);
    expect(projectNotificationRow({ ...row, source_key: "recipient_information_required:not-a-uuid:2" }, "en", true).deepLink).toBe(`/benefits/${benefitId}`);
  });
});
describe("push subscription ownership", () => {
  it("registers through the atomic RPC rather than a table upsert", async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    const from = vi.fn();
    const repository = createNotificationRepository(
      { url: "https://unused.example", serviceRoleKey: "unused" },
      { rpc, from } as never,
    );
    await repository.putSubscription({
      appUserId: "11111111-1111-4111-8111-111111111111",
      endpoint: "https://push.example/device",
      p256dh: "p".repeat(40),
      auth: "a".repeat(16),
      userAgent: null,
    });
    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith(
      "register_push_subscription",
      expect.objectContaining({
        p_app_user_id: "11111111-1111-4111-8111-111111111111",
        p_endpoint_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    );
  });
  it("maps a busy ownership transfer without exposing the endpoint", async () => {
    const repository = createNotificationRepository(
      { url: "https://unused.example", serviceRoleKey: "unused" },
      {
        rpc: vi.fn(async () => ({ data: null, error: { code: "55P03" } })),
        from: vi.fn(),
      } as never,
    );
    await expect(
      repository.putSubscription({
        appUserId: "11111111-1111-4111-8111-111111111111",
        endpoint: "https://push.example/device",
        p256dh: "p".repeat(40),
        auth: "a".repeat(16),
        userAgent: null,
      }),
    ).rejects.toBeInstanceOf(NotificationSubscriptionBusyError);
  });
});

it.each(["ko","en"] as const)("projects RUNMUSIC results in %s without contact or winner data", (locale) => {
  const item = projectNotificationRow({...base,kind:"runmusic_result",deep_link:"/connect/runmusic/results",payload:{kakaoId:"private-contact",winner:true}},locale);
  expect(notificationItemSchema.parse(item)).toMatchObject({kind:"runmusic_result",deepLink:"/connect/runmusic/results"});
  expect(item.title).toBe(locale==="ko"?"RUNMUSIC 추첨 결과가 나왔어요":"Your RUNMUSIC results are ready");
  expect(JSON.stringify(item)).not.toContain("private-contact");
});

describe("group notifications stay on the web",()=>{
 const group="10000000-0000-4000-8000-000000000001",target="10000000-0000-4000-8000-000000000002";
 it("does not route new friend and message links through app opening",()=>{
  for(const [kind,path]of [["fan_friend_request",`/my/friends?profileId=${target}`],["fan_dm_message",`/my/friends?conversationId=${target}`]]){
   const item=projectNotificationRow({id:target,kind,created_at:"2026-11-01T00:00:00Z",read_at:null,deep_link:path,payload:{body:"private secret"}},"ko");
   expect(item.deepLink).toBe(path);expect(item.detail).not.toContain("앱");expect(JSON.stringify(item)).not.toContain("private secret");expect(notificationItemSchema.safeParse(item).success).toBe(true);
  }
 });
 it("says the decision and the event's name from the stored review, in the row's language",()=>{
  const path=`/pages/groups/${group}/events/${target}`,row=(payload:unknown)=>({id:target,kind:"group_event_reviewed",created_at:"2026-11-01T00:00:00Z",read_at:null,deep_link:path,payload});
  const approved=projectNotificationRow(row({targetType:"group_event",targetId:target,revision:1,decision:"approved",eventTitle:"한강 러닝"}),"ko");
  expect(approved.title).toBe("'한강 러닝' 행사가 승인됐어요");expect(approved.detail).toBe("이제 캘린더와 행사 목록에 보여요.");expect(approved.eventReview).toEqual({decision:"approved",name:"한강 러닝"});expect(approved.deepLink).toBe(path);expect(notificationItemSchema.safeParse(approved).success).toBe(true);
  const rejected=projectNotificationRow(row({decision:"rejected",eventTitle:"Run $& fun"}),"en");
  expect(rejected.title).toBe('"Run $& fun" was not approved');expect(rejected.detail).toBe("See the reason on the event page.");
 });
 it("keeps the old wording for notifications without both values, and never repeats anything else from the payload",()=>{
  const path=`/pages/groups/${group}/events/${target}`;
  for(const payload of [undefined,{targetType:"group_event",targetId:target,revision:1},{decision:"approved"},{eventTitle:"한강"},{decision:"maybe",eventTitle:"한강"},{decision:"approved",eventTitle:"  "}]){
   const item=projectNotificationRow({id:target,kind:"group_event_reviewed",created_at:"2026-11-01T00:00:00Z",read_at:null,deep_link:path,payload},"ko");
   expect(item.title).toBe("행사 승인 검토가 끝났어요");expect(item.detail).toBe("결과를 확인해 주세요.");expect(item).not.toHaveProperty("eventReview");
  }
  const item=projectNotificationRow({id:target,kind:"group_event_reviewed",created_at:"2026-11-01T00:00:00Z",read_at:null,deep_link:path,payload:{decision:"rejected",eventTitle:"한강",reason:"private secret"}},"ko");
  expect(JSON.stringify(item)).not.toContain("private secret");
 });
 it("does not read those values on any other kind",()=>{
  const item=projectNotificationRow({id:target,kind:"group_raffle_won",created_at:"2026-11-01T00:00:00Z",read_at:null,deep_link:"/my",payload:{decision:"approved",eventTitle:"한강"}},"ko");
  expect(item.title).toBe("추첨에 당첨됐어요");expect(item).not.toHaveProperty("eventReview");
 });
 it("names the group event review result without calling it a page request",()=>{
  const path=`/pages/groups/${group}/events/${target}`;
  const item=projectNotificationRow({id:target,kind:"group_event_reviewed",created_at:"2026-11-01T00:00:00Z",read_at:null,deep_link:path},"ko");
  expect(item.title).toBe("행사 승인 검토가 끝났어요");expect(item.detail).toBe("결과를 확인해 주세요.");expect(item.deepLink).toBe(path);expect(notificationItemSchema.safeParse(item).success).toBe(true);
 });
 it("supports winner notices and generic page application results",()=>{
  const path=`/pages/groups/${group}/raffles/${target}`;
  const item=projectNotificationRow({id:target,kind:"group_raffle_won",created_at:"2026-11-01T00:00:00Z",read_at:null,deep_link:path},"ko");
  expect(item.title).toBe("추첨에 당첨됐어요");expect(item.deepLink).toBe(path);expect(notificationItemSchema.safeParse(item).success).toBe(true);
  const application=projectNotificationRow({id:target,kind:"fanpage_request_reviewed",created_at:"2026-11-01T00:00:00Z",read_at:null,deep_link:`/pages/groups/apply?applicationId=${target}`},"ko");expect(application.title).toContain("페이지 개설 신청");
 });
});

describe("B8 group notice notification", () => {
  const post = "b8000000-0000-4000-8000-0000000000f1", page = "b8000000-0000-4000-8000-0000000000a1";
  const row = { id: "b8000000-0000-4000-8000-0000000000e9", created_at: "2026-11-09T09:00:00.000Z", read_at: null, kind: "group_notice", deep_link: `/pages/groups/${page}?tab=board&postId=${post}`, payload: { schemaVersion: 1, targetType: "group_post", targetId: post, pageId: page, pageName: "b8 모임", postTitle: "정기 모임 안내" } };
  it("shows the page name and notice title only, and opens the notice", () => {
    const item = projectNotificationRow(row, "ko");
    expect(notificationItemSchema.safeParse(item).success).toBe(true);
    expect(item).toMatchObject({ kind: "group_notice", title: "b8 모임 공지", detail: "정기 모임 안내", deepLink: row.deep_link });
    expect(projectNotificationRow(row, "en")).toMatchObject({ title: "Notice from b8 모임", detail: "정기 모임 안내" });
  });
});
