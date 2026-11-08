"use client";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useOwnedFanResource } from "@/components/fan-ui/use-owned-fan-resource";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { notifyFanActivityUpdated } from "@/components/fan-ui/fan-activity-updates";
import { mySummaryPath, mySummarySchema } from "@/features/my/domain/my-summary";
import { toContentLocale, type AppLocale } from "@/i18n/locales";
import { pickSelectedBias, selectedBiasOptions, type SelectedBiasOption } from "../domain/selected-bias-pick";

export { pickSelectedBias, selectedBiasOptions, type SelectedBiasOption };

export type SelectedBias = {
  /** guest: signed out. empty: signed in with no passport. ready: at least one passport. */
  status: "loading" | "guest" | "empty" | "ready" | "error";
  /** Every creator the viewer holds a passport for, in the order /api/me/summary returns them. */
  options: readonly SelectedBiasOption[];
  /** The stored choice while its passport exists, otherwise the highest-stage passport (same in every locale). Null only without a passport. */
  selected: SelectedBiasOption | null;
  /** With no passport: the first creator the viewer follows, shown by name without a tier. */
  unverified: { slug: string; name: string } | null;
  select: (slug: string) => void;
  retry: () => void;
};

const KEY = "kyaa:selected-bias:v1:";
const listeners = new Set<() => void>();

/** Browser storage can throw or come back empty; that only means no choice is stored. */
export function readSelectedBiasSlug(ownerId: string | null | undefined): string | null {
  if (!ownerId) return null;
  try { return window.localStorage.getItem(KEY + ownerId); } catch { return null; }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => { listeners.delete(listener); window.removeEventListener("storage", listener); };
}

/** The header menu names the favorite in MY too (D's `PUT /api/me/social/profile-fields`, which is the source of truth), keeping the fan's
 * SNS links and intro as they are. Before that route exists (404) or on any failure the browser's choice still holds; nothing is retried. */
export async function saveNamedFavorite(slug: string, contentLocale: string, getAccessToken: () => Promise<string | null>) {
  try {
    const token = await getAccessToken();
    if (!token) return false;
    const path = `/api/me/social/profile-fields?locale=${contentLocale}`, headers = { authorization: `Bearer ${token}` };
    const current = await fetch(path, { headers, cache: "no-store" });
    if (!current.ok) return false;
    const fields = await current.json() as { favorite?: { slug?: string } | null; links?: unknown; bio?: unknown };
    if (fields.favorite?.slug === slug) return false;
    const saved = await fetch(path, { method: "PUT", headers: { ...headers, "content-type": "application/json" }, cache: "no-store",
      body: JSON.stringify({ favoriteSlug: slug, links: Array.isArray(fields.links) ? fields.links : [], bio: typeof fields.bio === "string" ? fields.bio : null }) });
    return saved.ok;
  } catch { return false; }
}

const parseSummary = (body: unknown) => mySummarySchema.parse((body as { summary?: unknown } | null)?.summary);

/** The one "selected favorite" of the app: the header shows it, and default destinations and the passport switcher read it. */
export function useSelectedBias(locale: AppLocale): SelectedBias {
  const auth = useByUsAuth();
  const ownerId = auth.authenticated ? auth.user?.id : undefined;
  const summary = useOwnedFanResource(auth.authenticated ? mySummaryPath(toContentLocale(locale)) : null, parseSummary, auth);
  const stored = useSyncExternalStore(subscribe, () => readSelectedBiasSlug(ownerId), () => null);
  const { getAccessToken } = auth;
  const contentLocale = toContentLocale(locale);
  const select = useCallback((slug: string) => {
    if (!ownerId) return;
    try { window.localStorage.setItem(KEY + ownerId, slug); } catch { /* The choice lasts until the next read. */ }
    for (const listener of listeners) listener();
    void saveNamedFavorite(slug, contentLocale, getAccessToken).then((saved) => { if (saved) notifyFanActivityUpdated(ownerId, ["summary"]); });
  }, [contentLocale, getAccessToken, ownerId]);
  const data = summary.state.status === "ready" ? summary.state.data : undefined;
  const options = useMemo(() => selectedBiasOptions(data), [data]);
  const selected = pickSelectedBias(options, stored, data?.favorite?.slug);
  const status: SelectedBias["status"] = !auth.ready ? "loading"
    : !auth.authenticated ? "guest"
    : summary.state.status === "loading" ? "loading"
    : summary.state.status === "error" ? summary.state.kind === "auth" ? "guest" : "error"
    : options.length ? "ready" : "empty";
  const followed = data?.creators[0]?.celebrity;
  return { status, options, selected, unverified: status === "empty" && followed ? { slug: followed.slug, name: followed.name } : null, select, retry: summary.retry };
}
