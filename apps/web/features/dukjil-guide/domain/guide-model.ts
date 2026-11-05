import type { DukjilCatalog } from "@/features/passport/domain/dukjil-types";

// Guide view model. Every number comes from the /api/dukjil/catalog payload; this file only decides which rule or slot
// to show and in what order. A rule or slot the catalog does not carry is not shown, so nothing is promised that the policy lacks.

type Rule = DukjilCatalog["rules"][string];

/** Display order of fan activities. Rows whose rule is missing from the catalog are skipped. */
const ACTIVITY_ORDER = [
  "checkin", "post", "comment", "reaction", "share", "invite", "quiz", "subscription",
  "live_reserve", "live_attend", "survey", "mission", "event_checkin", "event_review", "proof",
] as const;
export type GuideActivityKey = (typeof ACTIVITY_ORDER)[number];

/** Activities whose app feature is not released yet; the guide marks them instead of presenting them as usable. */
const NOT_YET_AVAILABLE: ReadonlySet<string> = new Set(["proof"]);

export type GuideLimit = { per: "day" | "month" | "creatorMonth"; max: number };
export type GuideActivity = {
  key: GuideActivityKey;
  points: number | null;
  pointsMax: number | null;
  firstPoints: number | null;
  limit: GuideLimit | null;
  streak: { every: number; bonus: number } | null;
  stamp: boolean;
  soon: boolean;
};
export type GuideSlot = { slot: number; action: string; required: boolean; days: number | null; activity: GuideActivity | null };
export type GuideModel = { version: number; activities: GuideActivity[]; slots: GuideSlot[] } | null;

const num = (value: unknown): number | null => (typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null);
const rec = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

function limitOf(rule: Rule): GuideLimit | null {
  const cap = rec(rule.pointCap);
  const max = num(cap.max);
  if (max === null) return null;
  if (cap.per === "user_day") return { per: "day", max };
  if (cap.per === "user_month") return { per: "month", max };
  if (cap.per === "creator_month") return { per: "creatorMonth", max };
  return null;
}

function activityOf(key: GuideActivityKey, rule: Rule): GuideActivity {
  const min = num(rule.pointsMin);
  const max = num(rule.pointsMax);
  const range = min !== null && max !== null && max > min;
  const every = num(rule.streakEvery);
  const bonus = num(rule.streakBonus);
  const base = num(rule.points);
  return {
    key,
    points: range ? min : base,
    pointsMax: range ? max : null,
    firstPoints: num(rule.firstPoints),
    limit: limitOf(rule),
    streak: every && bonus ? { every, bonus } : null,
    stamp: typeof rule.stamp === "string" && rule.stamp.length > 0,
    soon: NOT_YET_AVAILABLE.has(key),
  };
}

export function buildGuideModel(catalog: DukjilCatalog | { version: null; rules: object; missionBook: null }): GuideModel {
  if (catalog.version === null) return null;
  const rules = catalog.rules as DukjilCatalog["rules"];
  const activities: GuideActivity[] = [];
  for (const key of ACTIVITY_ORDER) {
    const rule = rules[key];
    if (rule) activities.push(activityOf(key, rule));
  }
  const pages = Array.isArray(rec(catalog.missionBook).pages) ? (rec(catalog.missionBook).pages as unknown[]) : [];
  const slots: GuideSlot[] = [];
  for (const raw of Array.isArray(rec(pages[0]).slots) ? (rec(pages[0]).slots as unknown[]) : []) {
    const s = rec(raw);
    const slot = num(s.slot);
    if (slot === null || typeof s.action !== "string") continue;
    const rule = rules[s.action];
    const known = (ACTIVITY_ORDER as readonly string[]).includes(s.action);
    slots.push({
      slot,
      action: s.action,
      required: s.required === true,
      days: num(s.days),
      activity: rule && known ? activityOf(s.action as GuideActivityKey, rule) : null,
    });
  }
  slots.sort((a, b) => a.slot - b.slot);
  return { version: catalog.version, activities, slots };
}
