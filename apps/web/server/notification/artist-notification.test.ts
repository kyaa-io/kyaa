import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { notificationItemSchema, notificationKindSchema, notificationPreferencesSchema } from "../../features/notification/domain/notification-model";
import { projectNotificationRow } from "./notification-repository";

const page = "18ec5319-95fb-4134-95f4-97ff95ae726b", post = "10000000-0000-4000-8000-000000000001", comment = "10000000-0000-4000-8000-000000000002";
const base = { id: "11111111-1111-4111-8111-111111111111", created_at: "2026-11-08T00:00:00.000Z", read_at: null, live_events: null };

describe("261107-2 E6 artist activity notices", () => {
  it("adds the two kinds to the inbox contract", () => {
    expect(notificationKindSchema.options).toEqual(expect.arrayContaining(["artist_comment", "artist_online"]));
    expect(notificationPreferencesSchema.parse({ liveReminders: true, surveyReminders: true, benefitNotifications: true, browserSubscription: "unsubscribed" }))
      .toMatchObject({ artistActivityNotifications: true, artistOnlineNotifications: true });
  });
  it("shows the artist name, the comment count of the hour and the post, and links to the comment", () => {
    const deep_link = `/pages/groups/${page}?tab=board&post=${post}#comment-${comment}`;
    const one = projectNotificationRow({ ...base, kind: "artist_comment", deep_link, payload: { artistName: "엘리나", postTitle: "오늘 공연 후기", count: 1 } }, "ko");
    expect(notificationItemSchema.parse(one)).toMatchObject({ title: "엘리나 님이 댓글을 남겼어요", detail: "오늘 공연 후기", deepLink: deep_link });
    const three = projectNotificationRow({ ...base, kind: "artist_comment", deep_link, payload: { artistName: "엘리나", postTitle: "오늘 공연 후기", count: 3 } }, "en");
    expect(three.title).toBe("엘리나 left 3 comments");
    const online = projectNotificationRow({ ...base, kind: "artist_online", deep_link: `/pages/groups/${page}`, payload: { artistName: "엘리나", pageName: "엘리나" } }, "ko");
    expect(notificationItemSchema.parse(online)).toMatchObject({ title: "엘리나 님이 팬페이지에 들어왔어요", deepLink: `/pages/groups/${page}` });
  });
  it("does not accept a link outside the group page", () => {
    const item = projectNotificationRow({ ...base, kind: "artist_comment", deep_link: "https://evil.example/x", payload: {} }, "ko");
    expect(notificationItemSchema.safeParse(item).success).toBe(false);
  });
  it("keeps push to the dev list and outside quiet hours in the migration, never email or Kakao", () => {
    const sql = readFileSync(resolve(process.cwd(), "../../supabase/migrations/20261216031000_artist_activity_notifications.sql"), "utf8");
    expect(sql).toContain("mode text not null default 'test'");
    expect(sql).toContain("between 8 and 22");
    expect(sql).toMatch(/create or replace function public\.create_external_notification_plan[\s\S]*?artist_activity_is_artist_notice\(p_notification_id\) then return null/);
    // review r5: the callers' owners get EXECUTE on what they call, and the mobile queue is checked again at prepare time.
    expect(sql).toMatch(/grant execute on function public\.%s to %I/);
    expect(sql).toContain("artist_activity_mobile_delivery_refused(p_delivery_id, p_worker_id)");
    expect(sql).not.toMatch(/insert into public\.artist_activity_push_control\([^)]*mode/);
  });
});
