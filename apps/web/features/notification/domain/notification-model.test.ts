import { describe, expect, it } from "vitest";
import { notificationCollectionSchema, safeNotificationPathSchema } from "./notification-model";

const id = "11111111-1111-4111-8111-111111111111";
const notification = {
  id,
  title: "알림",
  detail: "본문",
  createdAt: "2026-10-12T00:00:00.000Z",
  readAt: null,
};

describe("notification recipient links", () => {
  it("accepts a mixed collection containing the exact recipient route", () => {
    expect(notificationCollectionSchema.parse({
      notifications: [
        { ...notification, kind: "live_reserved", deepLink: "/live/kara-live" },
        { ...notification, id: "22222222-2222-4222-8222-222222222222", kind: "recipient_information_required", deepLink: `/my/rewards/${id}/recipient` },
      ],
      unreadCount: 2,
    }).notifications).toHaveLength(2);
  });

  it.each([
    `https://evil.example/my/rewards/${id}/recipient`,
    `/my/rewards/${id}/recipient?next=https://evil.example`,
    `/my/rewards/${id}/recipient#details`,
    "/my/rewards/not-a-uuid/recipient",
    `/my/rewards/${id}/recipient/extra`,
  ])("rejects recipient route variation %s", (path) => {
    expect(safeNotificationPathSchema.safeParse(path).success).toBe(false);
  });
});

it("accepts RUNMUSIC results in a mixed collection but rejects arbitrary RUNMUSIC links", () => {
  expect(notificationCollectionSchema.parse({ notifications: [
    {...notification,kind:"runmusic_result",deepLink:"/connect/runmusic/results"},
    {...notification,id:"22222222-2222-4222-8222-222222222222",kind:"live_reserved",deepLink:"/live/kara-live"},
  ],unreadCount:2}).notifications).toHaveLength(2);
  for (const path of ["/connect/runmusic","/connect/runmusic/results?owner=secret","/connect/runmusic/results/extra","https://evil.example/connect/runmusic/results"]) {
    expect(safeNotificationPathSchema.safeParse(path).success).toBe(false);
  }
});

describe("group web notification paths",()=>{
 const group="10000000-0000-4000-8000-000000000001",target="10000000-0000-4000-8000-000000000002";
 it("accepts only the implemented group and friend destinations",()=>{
  for(const path of [`/my/friends?profileId=${target}`,`/my/friends?conversationId=${target}`,`/pages/groups/apply?applicationId=${target}`,`/pages/groups/${group}?tab=board&postId=${target}`,`/pages/groups/${group}/raffles/${target}`])expect(safeNotificationPathSchema.safeParse(path).success).toBe(true);
 });
 it("rejects external and injected group notification destinations",()=>{
  for(const path of [`//evil.test/my/friends`,`/my/friends?profileId=${target}&next=https://evil.test`,`/pages/groups/${group}/raffles/nope`,`/pages/groups/${group}?tab=board&postId=${target}#redirect`,`/my/friends?conversationId=%2F%2Fevil.test`])expect(safeNotificationPathSchema.safeParse(path).success).toBe(false);
 });
});
