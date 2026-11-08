import { describe, expect, it } from "vitest";
import { notificationKindSchema, type NotificationItem } from "./notification-model";
import { attachHonorific, formalKo, groupInbox, notificationChip, notificationTime, targetLabel } from "./notification-inbox";

const item = (id: number, kind: NotificationItem["kind"], createdAt: string): NotificationItem => ({
  id: `${String(id).padStart(8, "0")}-0000-4000-8000-000000000000`, kind, title: "t", detail: "d", createdAt, readAt: null, deepLink: "/passports",
});

describe("notification inbox domain", () => {
  it("maps every kind to one of the four chips", () => {
    const chips = new Set(notificationKindSchema.options.map(notificationChip));
    expect([...chips].sort()).toEqual(["favorite", "friend", "stamp", "system"]);
    expect(notificationChip("stamp_issued")).toBe("stamp");
    expect(notificationChip("content_reply")).toBe("friend");
    expect(notificationChip("schedule_changed")).toBe("favorite");
    expect(notificationChip("support_reply")).toBe("system");
  });
  it("groups by KST day and bundles a run of three or more of the same kind, keeping action rows on top", () => {
    const now = new Date("2026-11-08T05:00:00Z");
    const groups = groupInbox([
      item(1, "content_reply", "2026-11-08T04:00:00Z"),
      item(2, "stamp_issued", "2026-11-08T03:00:00Z"),
      item(3, "stamp_issued", "2026-11-08T02:00:00Z"),
      item(4, "stamp_issued", "2026-11-08T01:00:00Z"),
      item(5, "recipient_information_required", "2026-11-08T00:00:00Z"),
      item(6, "stamp_issued", "2026-11-07T14:00:00Z"),
      item(7, "stamp_issued", "2026-11-07T13:00:00Z"),
      item(8, "level_up", "2026-11-05T00:00:00Z"),
    ], now);
    expect(groups.map((group) => group.label)).toEqual(["today", "yesterday", "date"]);
    expect(groups[0].entries.map((entry) => entry.type)).toEqual(["item", "item", "bundle"]);
    expect(groups[0].entries[0]).toMatchObject({ type: "item", item: { kind: "recipient_information_required" } });
    expect(groups[1].entries).toHaveLength(2);
    expect(groups[2].date).toBe("2026.11.05");
  });
  it("writes KST time and 습니다체 endings", () => {
    expect(notificationTime("2026-11-08T04:47:00Z")).toBe("2026.11.08 13:47");
    expect(formalKo("새 댓글이 도착했어요")).toBe("새 댓글이 도착했습니다");
    expect(formalKo("일정이 변경됐어요")).toBe("일정이 변경됐습니다");
    expect(formalKo("KARA LIVE, 10분 후 시작해요")).toBe("KARA LIVE, 10분 후 시작합니다");
    expect(formalKo("수령 정보를 입력해 주세요")).toBe("수령 정보를 입력해 주세요");
    expect(formalKo("페이지 개설 신청 검토가 끝났어요")).toBe("페이지 개설 신청 검토가 끝났습니다");
    expect(formalKo("시험 아티스트 님이 팬페이지에 들어왔어요")).toBe("시험 아티스트 님이 팬페이지에 들어왔습니다");
    expect(formalKo("다가오는 일정이 있어요")).toBe("다가오는 일정이 있습니다");
    expect(formalKo("Collectible을 받을 수 있어요")).toBe("Collectible을 받을 수 있습니다");
  });
  it("drops the space between a name and 님 and leaves other spaces alone", () => {
    expect(attachHonorific("시험 아티스트 님이 팬페이지에 들어왔습니다")).toBe("시험 아티스트님이 팬페이지에 들어왔습니다");
    expect(attachHonorific("이퓨 님의 글")).toBe("이퓨님의 글");
    expect(attachHonorific("이퓨님이 댓글을 남겼습니다")).toBe("이퓨님이 댓글을 남겼습니다");
    expect(attachHonorific("님프 사진")).toBe("님프 사진");
  });
  it("uses one target label, never a title joined to the body", () => {
    expect(targetLabel({ target: { type: "fan_post", id: "x", label: "  [시험]   제목  " } })).toBe("[시험] 제목");
    expect(targetLabel({ target: null })).toBeNull();
  });
});
