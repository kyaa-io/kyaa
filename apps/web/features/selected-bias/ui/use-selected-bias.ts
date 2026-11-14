"use client";
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useOwnedFanResource } from "@/components/fan-ui/use-owned-fan-resource";
import { notifyFanActivityUpdated } from "@/components/fan-ui/fan-activity-updates";
import { showFanToast } from "@/components/fan-ui/fan-toast";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { mySummaryPath, mySummarySchema } from "@/features/my/domain/my-summary";
import { toContentLocale, type AppLocale } from "@/i18n/locales";
import { translate } from "@/i18n/messages";
import { messages } from "@/i18n/catalogs/features__selected-bias";
import { defaultPassport, pickSelectedBias, selectedBiasOptions, type SelectedBiasOption } from "../domain/selected-bias-pick";
import { selectedBiasSource } from "./selected-bias-source";

export { defaultPassport, pickSelectedBias, selectedBiasOptions, type SelectedBiasOption };

export type SelectedBias = {
  /** guest: signed out. empty: signed in with no passport. ready: at least one passport (a favorite may still be unnamed: `selected` null). */
  status: "loading" | "guest" | "empty" | "ready" | "error";
  /** Every creator the viewer holds a passport for, in the order /api/me/summary returns them. */
  options: readonly SelectedBiasOption[];
  /** The favorite named in MY (one value, fan_profile_public_fields) while its passport exists; null when none is named. */
  selected: SelectedBiasOption | null;
  /** With no passport: the first creator the viewer follows, shown by name without a tier. */
  unverified: { slug: string; name: string; image: string } | null;
  /** Names the favorite in MY. The header shows it at once and goes back if saving fails. */
  select: (slug: string) => void;
  retry: () => void;
};

/** The browser's old choice (R2 header menu, before the favorite moved to the server). Read only to move it once, then removed. */
const LEGACY_KEY = "kyaa:selected-bias:v1:";
const PROFILE_FIELDS = "/api/me/social/profile-fields";

/** A pick waiting for the server, per owner, so every reader in the page shows it at once. */
const pending = new Map<string, string>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const setPending = (ownerId: string, slug: string | null) => { if (slug) pending.set(ownerId, slug); else pending.delete(ownerId); for (const listener of listeners) listener(); };

function readLegacy(ownerId: string) { try { return window.localStorage.getItem(LEGACY_KEY + ownerId); } catch { return null; } }
function dropLegacy(ownerId: string) { try { window.localStorage.removeItem(LEGACY_KEY + ownerId); } catch { /* nothing to remove */ } }

/** Saves the favorite through D's `PUT /api/me/social/profile-fields` (set_owned_fan_profile_public), keeping the fan's SNS links and intro.
 * true when the server holds `slug` afterwards (already or now); false on any failure, including the route not being there. */
export async function saveNamedFavorite(slug: string, contentLocale: string, getAccessToken: () => Promise<string | null>) {
  try {
    const token = await getAccessToken();
    if (!token) return false;
    const path = `${PROFILE_FIELDS}?locale=${contentLocale}`, headers = { authorization: `Bearer ${token}` };
    const current = await fetch(path, { headers, cache: "no-store" });
    if (!current.ok) return false;
    const fields = await current.json() as { favorite?: { slug?: string } | null; links?: unknown; bio?: unknown };
    if (fields.favorite?.slug === slug) return true;
    const saved = await fetch(path, { method: "PUT", headers: { ...headers, "content-type": "application/json" }, cache: "no-store",
      body: JSON.stringify({ favoriteSlug: slug, links: Array.isArray(fields.links) ? fields.links : [], bio: typeof fields.bio === "string" ? fields.bio : null }) });
    return saved.ok;
  } catch { return false; }
}

const parseSummary = (body: unknown) => mySummarySchema.parse((body as { summary?: unknown } | null)?.summary);
const failedText = (locale: AppLocale) => translate(locale, messages.biasSaveFailed, locale === "ko" ? selectedBiasSource.biasSaveFailed.ko : selectedBiasSource.biasSaveFailed.en);

/** The one favorite of the app, read from the server summary (`favorite`, named in MY). The header, the 덕질 bar and the screens that follow
 * the favorite read it here; the fan list, ranking and profile card read the same table on the server. */
export function useSelectedBias(locale: AppLocale): SelectedBias {
  const auth = useByUsAuth();
  const ownerId = auth.authenticated ? auth.user?.id : undefined;
  const contentLocale = toContentLocale(locale);
  const summary = useOwnedFanResource(auth.authenticated ? mySummaryPath(contentLocale) : null, parseSummary, auth);
  const waiting = useSyncExternalStore(subscribe, () => (ownerId ? pending.get(ownerId) ?? null : null), () => null);
  const { getAccessToken } = auth;
  const data = summary.state.status === "ready" ? summary.state.data : undefined;
  const named = data?.favorite === undefined ? undefined : data.favorite?.slug ?? null;
  const select = useCallback((slug: string) => {
    if (!ownerId) return;
    setPending(ownerId, slug);
    void saveNamedFavorite(slug, contentLocale, getAccessToken).then((saved) => {
      if (saved) { notifyFanActivityUpdated(ownerId, ["summary"]); return; }
      setPending(ownerId, null);
      showFanToast({ title: failedText(locale), tone: "error" });
    });
  }, [contentLocale, getAccessToken, locale, ownerId]);
  // The server answered with the pick: nothing is waiting any more.
  useEffect(() => { if (ownerId && waiting && named === waiting) setPending(ownerId, null); }, [named, ownerId, waiting]);
  // One-time move of the old browser choice: saved when no favorite is named yet, then removed; kept for a later try if saving failed.
  const moved = useRef<string | null>(null);
  useEffect(() => {
    if (!ownerId || !data || data.favorite === undefined || moved.current === ownerId) return;
    moved.current = ownerId;
    const legacy = readLegacy(ownerId);
    if (!legacy) return;
    if (data.favorite || !data.creators.some((creator) => creator.passport && creator.celebrity.slug === legacy)) { dropLegacy(ownerId); return; }
    void saveNamedFavorite(legacy, contentLocale, getAccessToken).then((saved) => { if (saved) { dropLegacy(ownerId); notifyFanActivityUpdated(ownerId, ["summary"]); } });
  }, [contentLocale, data, getAccessToken, ownerId]);
  const options = useMemo(() => selectedBiasOptions(data), [data]);
  const selected = pickSelectedBias(options, waiting ?? named);
  const status: SelectedBias["status"] = !auth.ready ? "loading"
    : !auth.authenticated ? "guest"
    : summary.state.status === "loading" ? "loading"
    : summary.state.status === "error" ? summary.state.kind === "auth" ? "guest" : "error"
    : options.length ? "ready" : "empty";
  const followed = data?.creators[0]?.celebrity;
  return { status, options, selected, unverified: status === "empty" && followed ? { slug: followed.slug, name: followed.name, image: followed.image } : null, select, retry: summary.retry };
}
