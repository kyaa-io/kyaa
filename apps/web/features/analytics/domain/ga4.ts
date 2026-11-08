import { signupProviderSchema } from "./signup-funnel-event";
import { pageKindForPath, shareContentTypeSchema, type PageKind } from "./funnel-event";

export { GA4_MEASUREMENT_ID_PATTERN, readGa4MeasurementId } from "./ga4-id";

/**
 * The address GA4 receives: origin and a normalized path only. Query, hash, identifiers and link tokens are dropped, so
 * returnTo, authIntent, attempt, passport and invitation values never leave the browser. Staff and sign-in plumbing
 * screens (the same set the self ledger skips) are not sent at all.
 */
export function ga4PageLocation(origin: string, pathname: string): { location: string; kind: PageKind } | null {
  const kind = pageKindForPath(pathname);
  if (!kind) return null;
  const segments = pathname.split("/").filter(Boolean);
  const tokenRoot = new Set(["s", "i", "t", "o", "go", "share"]);
  const normalized = segments.map((segment, index) => {
    if (index > 0 && tokenRoot.has(segments[0])) return ":token";
    let value: string;
    try { value = decodeURIComponent(segment); } catch { return ":id"; }
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return ":id";
    if (/^\d+$/.test(value)) return ":id";
    if (value.length >= 20 && /\d/.test(value) && /^[A-Za-z0-9_-]+$/.test(value)) return ":id";
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(value)) return ":id";
    return value;
  });
  return { location: `${origin}/${normalized.join("/")}`, kind };
}

/** Referrers keep only another site's origin; kyaa's own pages and unknown values are blank. */
export function ga4PageReferrer(referrer: string, origin: string): string {
  try {
    const url = new URL(referrer);
    return /^https?:$/.test(url.protocol) && url.origin !== origin ? url.origin : "";
  } catch {
    return "";
  }
}

const provider = signupProviderSchema.options as readonly string[];
const shareContent = shareContentTypeSchema.options as readonly string[];

/**
 * Every GA4 event kyaa sends and the only parameters each may carry: fixed enums or a bounded number. No member,
 * creator, post or passport identifiers, no free text. Names follow GA4_EVENT_NAME (funnel-event.ts) and ga4-plan.md §6.
 */
export const GA4_EVENT_PARAMETERS = {
  page_view: { page_location: "string", page_referrer: "string", page_title: "string" },
  login: { method: provider },
  sign_up: { method: provider },
  fan_verification_start: {},
  fan_verification_submit: { outcome: ["passed", "failed"], score: [0, 1, 2, 3] },
  passport_issued: {},
  daily_checkin: {},
  post_create: { board: ["fan", "group"] },
  cheer: {},
  share: { method: ["native", "copy"], content_type: shareContent },
  raffle_entry: { kind: ["claim", "application", "ticket"] },
} as const satisfies Record<string, Record<string, "string" | readonly (string | number)[]>>;

export type Ga4EventName = keyof typeof GA4_EVENT_PARAMETERS;
export type Ga4Parameters = Record<string, string | number>;

/** Drops the event (null) when a parameter is unknown or out of its list. page_view strings must be kyaa-built. */
export function ga4Payload(name: string, parameters: Ga4Parameters = {}): { name: Ga4EventName; parameters: Ga4Parameters } | null {
  if (!Object.hasOwn(GA4_EVENT_PARAMETERS, name)) return null;
  const allowed = GA4_EVENT_PARAMETERS[name as Ga4EventName] as Record<string, "string" | readonly (string | number)[]>;
  for (const [key, value] of Object.entries(parameters)) {
    const rule = allowed[key];
    if (!rule) return null;
    if (rule === "string" ? typeof value !== "string" || value.length > 300 : !rule.includes(value)) return null;
  }
  return { name: name as Ga4EventName, parameters };
}
