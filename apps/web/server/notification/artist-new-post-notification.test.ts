import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { notificationItemSchema } from "../../features/notification/domain/notification-model";
import { actorSentence } from "../../features/notification/ui/notification-inbox-copy";
import { APP_LOCALES } from "../../i18n/locales";
import { projectNotificationRow } from "./notification-repository";

const base = { id: "11111111-1111-4111-8111-111111111111", created_at: "2026-11-13T00:00:00.000Z", read_at: null, live_events: null, deep_link: "/c/elina/notices/instagram-0123456789abcdef" };

describe("artist new-post notification (official_post, folded per 2 hours)", () => {
  it("carries the folded post count, and only when it is more than one", () => {
    const one = projectNotificationRow({ ...base, kind: "official_post", payload: { targetType: "notice", count: 1 } }, "ko");
    expect(notificationItemSchema.parse(one).count).toBeUndefined();
    const three = projectNotificationRow({ ...base, kind: "official_post", payload: { targetType: "notice", count: 3 } }, "ko");
    expect(notificationItemSchema.parse(three)).toMatchObject({ count: 3, deepLink: base.deep_link });
    const old = projectNotificationRow({ ...base, kind: "official_post", payload: {} }, "ko");
    expect(old.count).toBeUndefined();
    const other = projectNotificationRow({ ...base, kind: "content_reply", payload: { count: 4 } }, "ko");
    expect(other.count).toBeUndefined();
  });
  it("names the artist and the number in every language, and keeps the single-post sentence for one post", () => {
    expect(actorSentence("ko", "official_post", "엘리나", null, 3)).toBe("엘리나님이 새 소식 3개를 올렸습니다");
    expect(actorSentence("ko", "official_post", "엘리나", null, 1)).toBe("엘리나님이 새 소식을 올렸습니다");
    expect(actorSentence("ko", "official_post", "엘리나", "오늘 무대", undefined)).toBe("엘리나님이 ‘오늘 무대’ 소식을 올렸습니다");
    for (const locale of APP_LOCALES) {
      const said = actorSentence(locale, "official_post", "Elina", "Title", 5);
      expect(said, locale).toContain("Elina");
      expect(said, locale).toContain("5");
      expect(said, locale).not.toContain("{");
    }
  });
});
