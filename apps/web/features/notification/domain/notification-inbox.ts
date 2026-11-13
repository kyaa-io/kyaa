import type { NotificationItem } from "./notification-model";

/** 알림함 칩(plan-ux r6 6.5 정보 설계 표). 종류 → 칩 하나. 표에 없는 종류는 가까운 칩에 둔다(아래 주석). */
export type NotificationChip = "all" | "favorite" | "stamp" | "friend" | "system";
export const notificationChips: readonly NotificationChip[] = ["all", "favorite", "stamp", "friend", "system"];

export function notificationChip(kind: NotificationItem["kind"]): Exclude<NotificationChip, "all"> {
  if (kind === "artist_comment" || kind === "artist_online" || kind === "official_post") return "favorite";
  // schedule_suggestion_reviewed는 이름이 schedule_*이지만 내 제안의 검토 결과라 시스템에 둔다.
  if (kind === "schedule_suggestion_reviewed") return "system";
  if (kind.startsWith("schedule_") || kind.startsWith("live_")) return "favorite";
  // 표에 없는 당첨·수령 상태(group_raffle_won·fulfillment_meaningful_update)는 보상이라 스탬프·포인트에 둔다.
  if (kind === "stamp_issued" || kind === "level_up" || kind.startsWith("benefit_") || kind.startsWith("collectible_") || kind === "group_raffle_won" || kind === "group_raffle_result" || kind === "fulfillment_meaningful_update") return "stamp";
  if (kind.startsWith("fan_dm_") || kind === "fan_friend_request" || kind.startsWith("friend_") || kind === "content_reply") return "friend";
  // support_reply·fanpage_request_reviewed·recipient_information_required·runmusic_result·survey_reminder, 표에 없는 group_event_reviewed·group_notice(페이지 운영진 공지)·participation_deadline.
  return "system";
}

/** 할 일이 남은 알림. 그날 묶음 맨 위에 두고 오른쪽에 `입력 ›`. */
export const isActionNotification = (kind: NotificationItem["kind"]) => kind === "recipient_information_required";

const KST = 9 * 60 * 60 * 1000;
/** KST 날짜 열쇠 `2026-11-08`. */
export function kstDay(value: string | number | Date) {
  return new Date(new Date(value).getTime() + KST).toISOString().slice(0, 10);
}
/** 알림 일시 `2026.11.08 13:47`(DESIGN 숫자 5: 거래·공지·알림 형식, KST). */
export function notificationTime(value: string) {
  const iso = new Date(new Date(value).getTime() + KST).toISOString();
  return `${iso.slice(0, 4)}.${iso.slice(5, 7)}.${iso.slice(8, 10)} ${iso.slice(11, 16)}`;
}
export const notificationDate = (value: string) => notificationTime(value).slice(0, 10);

export type InboxEntry =
  | { type: "item"; item: NotificationItem }
  | { type: "bundle"; kind: NotificationItem["kind"]; items: NotificationItem[] };
export type InboxGroup = { day: string; label: "today" | "yesterday" | "date"; date: string; entries: InboxEntry[] };

/** 같은 종류가 같은 날 연속 3개 이상이면 묶음 1행(감독 결정 ⑥ A). 응답 순서를 지킨다. */
export const BUNDLE_MIN = 3;

export function groupInbox(items: readonly NotificationItem[], now: Date = new Date()): InboxGroup[] {
  const today = kstDay(now);
  const yesterday = kstDay(now.getTime() - 24 * 60 * 60 * 1000);
  const days: InboxGroup[] = [];
  for (const item of items) {
    const day = kstDay(item.createdAt);
    let group = days.at(-1);
    if (!group || group.day !== day) {
      group = days.find((candidate) => candidate.day === day);
      if (!group) {
        group = { day, label: day === today ? "today" : day === yesterday ? "yesterday" : "date", date: notificationDate(item.createdAt), entries: [] };
        days.push(group);
      }
    }
    group.entries.push({ type: "item", item });
  }
  for (const group of days) {
    const pinned = group.entries.filter((entry) => entry.type === "item" && isActionNotification(entry.item.kind));
    const rest = group.entries.filter((entry) => !(entry.type === "item" && isActionNotification(entry.item.kind)));
    const bundled: InboxEntry[] = [];
    for (let i = 0; i < rest.length;) {
      const first = rest[i];
      if (first.type !== "item") { bundled.push(first); i += 1; continue; }
      let end = i + 1;
      while (end < rest.length) {
        const next = rest[end];
        if (next.type !== "item" || next.item.kind !== first.item.kind) break;
        end += 1;
      }
      const run = rest.slice(i, end).map((entry) => (entry as { item: NotificationItem }).item);
      if (run.length >= BUNDLE_MIN) bundled.push({ type: "bundle", kind: first.item.kind, items: run });
      else for (const item of run) bundled.push({ type: "item", item });
      i = end;
    }
    group.entries = [...pinned, ...bundled];
  }
  return days;
}

export function filterInbox(items: readonly NotificationItem[], chip: NotificationChip) {
  return chip === "all" ? items : items.filter((item) => notificationChip(item.kind) === chip);
}

/** 서버의 한국어 제목은 해요체다. 알림 1줄은 `…했습니다|됐습니다`로 맞춘다(plan-ux r6 6.5 수용 기준 2). 끝말만 바꾸고 내용은 그대로다. */
export function formalKo(text: string) {
  const trimmed = text.trim();
  // `했어요·됐어요·끝났어요·들어왔어요·있어요`: 받침 ㅆ 뒤 `어요` → `습니다`.
  const past = /([가-힣])어요$/.exec(trimmed);
  if (past && (past[1].charCodeAt(0) - 0xac00) % 28 === 20) return `${trimmed.slice(0, -2)}습니다`;
  const rules: Array<[RegExp, string]> = [[/이에요$/, "입니다"], [/예요$/, "입니다"], [/해요$/, "합니다"], [/나요$/, "납니다"]];
  for (const [pattern, next] of rules) if (pattern.test(trimmed)) return trimmed.replace(pattern, next);
  return trimmed;
}

/** 대상 이름: 서버의 target.label 하나(글 제목, 없으면 본문 앞 60자). 제목과 본문을 잇지 않는다. 공백을 줄이고 80자에서 자른다. */
export function targetLabel(item: Pick<NotificationItem, "target">) {
  const label = item.target?.label?.replace(/\s+/g, " ").trim();
  if (!label) return null;
  return label.length > 80 ? `${label.slice(0, 79)}…` : label;
}

/** 앞에서부터 행 `limit`개만(`더 보기`로 20개씩 늘린다). 날짜 머리는 행이 남는 그룹에만. */
export function limitInbox(groups: readonly InboxGroup[], limit: number): InboxGroup[] {
  const out: InboxGroup[] = [];
  let left = limit;
  for (const group of groups) {
    if (left <= 0) break;
    const entries = group.entries.slice(0, left);
    left -= entries.length;
    out.push({ ...group, entries });
  }
  return out;
}

/** 한국어 알림 1줄에서 이름과 `님` 사이 공백을 없앤다(`시험 아티스트 님이` → `시험 아티스트님이`). 서버 문구는 그대로 두고 화면 조립에서만 고친다. */
export function attachHonorific(text: string) {
  return text.replace(/(\S)\s+님(?=[이께의을에과와은도]|\s|$)/g, "$1님");
}
