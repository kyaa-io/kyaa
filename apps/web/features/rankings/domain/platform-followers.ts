import { z } from "zod";

/** Platforms whose follower count the creator ranking can show. A new platform is one more entry here (and one more value of the database enum social_platform). */
export const FOLLOWER_PLATFORMS = ["instagram", "tiktok", "youtube", "chzzk"] as const;
export type FollowerPlatform = (typeof FOLLOWER_PLATFORMS)[number];

/** A confirmed count. `digits` set = the count is rounded and only that many leading digits are real; `text` = the platform's own wording ("1.2만", "50K"). Unconfirmed platforms are not in the list. 0 is a confirmed zero. */
export const platformFollowerSchema = z.object({
  platform: z.enum(FOLLOWER_PLATFORMS),
  count: z.number().int().min(0),
  digits: z.number().int().min(1).max(6).nullable().optional(),
  text: z.string().min(1).max(40).nullable().optional(),
});
export type PlatformFollower = z.infer<typeof platformFollowerSchema>;

/** What an operator typed, as the database stores it. count null = unconfirmed (the row is removed). */
export type ParsedFollowerInput = { count: number; digits: number | null; sourceText: string | null };

const UNITS: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9, 천: 1e3, 만: 1e4, 억: 1e8 };

/** "1088", "1,088" → exact. "1.2만", "50K", "1.2M" → rounded: the count the text names plus the number of digits it shows. "" → null (unconfirmed). Anything else → undefined (not a count). */
export function parseFollowerInput(input: string): ParsedFollowerInput | null | undefined {
  const text = input.trim();
  if (!text) return null;
  const plain = /^\d{1,3}(?:,\d{3})+$|^\d+$/.exec(text);
  if (plain) {
    const count = Number(text.replaceAll(",", ""));
    return Number.isSafeInteger(count) && count < 1e13 ? { count, digits: null, sourceText: null } : undefined;
  }
  const match = /^(\d+(?:\.\d+)?)\s*([kKmMbB천만억])$/.exec(text);
  if (!match) return undefined;
  const unit = UNITS[match[2]!.toLowerCase()]!;
  const [whole = "", fraction = ""] = match[1]!.split(".");
  // Integer arithmetic: 1.2 × 10,000 must be 12,000, not 11,999.999….
  const count = Number(`${whole}${fraction}`) * (unit / 10 ** fraction.length);
  if (!Number.isSafeInteger(count) || count >= 1e13) return undefined;
  const digits = `${whole}${fraction}`.replace(/^0+/, "").length;
  return { count, digits: Math.min(Math.max(digits, 1), 6), sourceText: text };
}

/** The panel's number. The platform's own wording wins; otherwise 1,000 and up shrink to K/M with one decimal at most, always rounded down (19,960 → 19.9K, never 20K),
 * and a rounded count never shows more digits than were real. */
export function formatFollowerCount(count: number, digits?: number | null, text?: string | null): string {
  if (text) return text;
  if (count < 1000) return String(count);
  const [unit, suffix] = count >= 1e6 ? [1e6, "M"] as const : [1e3, "K"] as const;
  const whole = Math.floor(count / unit);
  const decimals = digits ? Math.max(0, Math.min(1, digits - String(whole).length)) : 1;
  const scale = 10 ** decimals;
  const shown = Math.floor((count * scale) / unit) / scale;
  return `${decimals ? shown.toFixed(decimals).replace(/\.0$/, "") : String(shown)}${suffix}`;
}
