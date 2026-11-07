"use client";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useOwnedFanResource } from "@/components/fan-ui/use-owned-fan-resource";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { mySummarySchema, type MySummary } from "@/features/my/domain/my-summary";
import type { FanStage, FanStageKey } from "@/features/rewards/domain/fan-stage";
import { toContentLocale, type AppLocale } from "@/i18n/locales";

export type SelectedBiasOption = {
  slug: string;
  name: string;
  image: string;
  imagePosition?: string;
  passportId: string;
  tier: FanStage["tier"];
  stage: { key: FanStageKey; tier: FanStage["tier"]; subdivision: number } | null;
};

export type SelectedBias = {
  /** guest: signed out. empty: signed in with no passport. ready: at least one passport. */
  status: "loading" | "guest" | "empty" | "ready" | "error";
  /** Every creator the viewer holds a passport for, in the order /api/me/summary returns them. */
  options: readonly SelectedBiasOption[];
  /** The stored choice while its passport exists, otherwise the first passport. Null only without a passport. */
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

export function selectedBiasOptions(summary: MySummary | undefined): SelectedBiasOption[] {
  return (summary?.creators ?? []).flatMap((creator) => {
    if (!creator.passport) return [];
    const current = creator.passport.stageProgress?.current;
    return [{
      slug: creator.celebrity.slug, name: creator.celebrity.name, image: creator.celebrity.image, imagePosition: creator.celebrity.imagePosition,
      passportId: creator.passport.id, tier: creator.passport.tier,
      stage: current ? { key: current.key, tier: current.tier, subdivision: current.subdivision } : null,
    }];
  });
}

export function pickSelectedBias(options: readonly SelectedBiasOption[], stored: string | null): SelectedBiasOption | null {
  return options.find((option) => option.slug === stored) ?? options[0] ?? null;
}

const parseSummary = (body: unknown) => mySummarySchema.parse((body as { summary?: unknown } | null)?.summary);

/** The one "selected favorite" of the app: the header shows it, and default destinations and the passport switcher read it. */
export function useSelectedBias(locale: AppLocale): SelectedBias {
  const auth = useByUsAuth();
  const ownerId = auth.authenticated ? auth.user?.id : undefined;
  const summary = useOwnedFanResource(auth.authenticated ? `/api/me/summary?locale=${toContentLocale(locale)}&tierStages=1` : null, parseSummary, auth);
  const stored = useSyncExternalStore(subscribe, () => readSelectedBiasSlug(ownerId), () => null);
  const select = useCallback((slug: string) => {
    if (!ownerId) return;
    try { window.localStorage.setItem(KEY + ownerId, slug); } catch { /* The choice lasts until the next read. */ }
    for (const listener of listeners) listener();
  }, [ownerId]);
  const data = summary.state.status === "ready" ? summary.state.data : undefined;
  const options = useMemo(() => selectedBiasOptions(data), [data]);
  const selected = pickSelectedBias(options, stored);
  const status: SelectedBias["status"] = !auth.ready ? "loading"
    : !auth.authenticated ? "guest"
    : summary.state.status === "loading" ? "loading"
    : summary.state.status === "error" ? summary.state.kind === "auth" ? "guest" : "error"
    : options.length ? "ready" : "empty";
  const followed = data?.creators[0]?.celebrity;
  return { status, options, selected, unverified: status === "empty" && followed ? { slug: followed.slug, name: followed.name } : null, select, retry: summary.retry };
}
