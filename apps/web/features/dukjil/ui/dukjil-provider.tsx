"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useGroupRequest, useGroupResource, type GroupRequestError } from "@/features/groups/ui/use-group-resource";
import type { AppLocale } from "@/i18n/locales";
import type { AttendanceResult } from "@/features/passport/domain/dukjil-types";
import { activeToday, catalogIsActive, parseDukjilCatalog, parseDukjilToday, type DukjilCatalogView, type DukjilTodayView } from "../domain/dukjil-ui";

export type DukjilAttendanceState = { attendedToday: boolean; streak: number; nextBonusIn: number | null; result?: AttendanceResult };
export type DukjilStatus = "loading" | "on" | "off";
export type DukjilState = {
  slug: string | undefined;
  locale: AppLocale;
  authenticated: boolean;
  /** `on` only when the catalog carries rules (and `today`, once read, says the policy is active). Everything new is hidden otherwise. */
  status: DukjilStatus;
  hasPassport: boolean | undefined;
  catalog: DukjilCatalogView | undefined;
  today: DukjilTodayView | undefined;
  todayFailure: GroupRequestError | undefined;
  attendance: DukjilAttendanceState | undefined;
  setAttendance(next: DukjilAttendanceState): void;
  refresh(): void;
};

const DukjilContext = createContext<DukjilState | null>(null);
export const useDukjil = () => useContext(DukjilContext);

// One catalog read per locale shared by every provider on the page; failures are never cached.
const catalogCache = new Map<string, { at: number; promise: Promise<DukjilCatalogView> }>();
const CATALOG_TTL = 60_000;
/** Test hook. */
export const resetDukjilCatalogCache = () => catalogCache.clear();

function useCatalog(locale: AppLocale) {
  const auth = useGroupRequest();
  const { request } = auth;
  const [state, setState] = useState<{ locale: AppLocale; catalog?: DukjilCatalogView; failed?: boolean }>();
  useEffect(() => {
    let live = true;
    const hit = catalogCache.get(locale);
    const promise = hit && Date.now() - hit.at < CATALOG_TTL ? hit.promise
      : request(`/api/dukjil/catalog?locale=${encodeURIComponent(locale)}`, undefined, "json", false).then(parseDukjilCatalog);
    if (!hit || promise !== hit.promise) catalogCache.set(locale, { at: Date.now(), promise });
    promise.then(catalog => live && setState({ locale, catalog }), () => { catalogCache.delete(locale); if (live) setState({ locale, failed: true }); });
    return () => { live = false; };
  }, [locale, request]);
  const ready = state?.locale === locale;
  return { catalog: ready ? state?.catalog : undefined, settled: ready, ready: auth.ready, authenticated: auth.authenticated };
}

/** One catalog read and (with a slug) one `today` read; every badge, tile and the dialog reads from here. */
type ProviderProps = { slug?: string; locale: AppLocale; hasPassport?: boolean; children: ReactNode };
/** A provider for the same creator and locale already above this one is reused, so nested screens share one catalog and one `today` read. */
export function DukjilProvider(props: ProviderProps) {
  const parent = useDukjil();
  if (parent && parent.slug === props.slug && parent.locale === props.locale && props.hasPassport === undefined) return <>{props.children}</>;
  return <DukjilProviderRoot {...props} />;
}

function DukjilProviderRoot({ slug, locale, hasPassport, children }: ProviderProps) {
  const { catalog, settled, ready, authenticated } = useCatalog(locale);
  const catalogOn = catalogIsActive(catalog);
  const today = useGroupResource(slug && authenticated && catalogOn ? `/api/me/dukjil/today?creator=${encodeURIComponent(slug)}` : null, parseDukjilToday);
  const [local, setLocal] = useState<DukjilAttendanceState>();
  const { retry } = today;
  const refresh = useCallback(() => retry(), [retry]);
  const active = activeToday(today.data);
  const fromServer = active?.attendance ?? undefined;
  const attendance = local ?? fromServer;
  const status: DukjilStatus = !settled || !ready ? "loading" : !catalogOn || today.data?.policyActive === false ? "off" : "on";
  const value = useMemo<DukjilState>(() => ({
    slug, locale, authenticated, status, hasPassport: hasPassport ?? active?.hasPassport ?? undefined, catalog, today: today.data,
    todayFailure: today.failure, attendance, setAttendance: setLocal, refresh,
  }), [slug, locale, authenticated, status, hasPassport, active, catalog, today.data, today.failure, attendance, refresh]);
  return <DukjilContext.Provider value={value}>{children}</DukjilContext.Provider>;
}

/** Renders `on` only for an active policy; `off` (the legacy screen) for an empty/failed catalog; `loading` while undecided. */
export function DukjilSwitch({ on, off, loading = null }: { on: ReactNode; off: ReactNode; loading?: ReactNode }) {
  const state = useDukjil();
  if (!state || state.status === "off") return <>{off}</>;
  return <>{state.status === "loading" ? loading : on}</>;
}

/** Gate for places outside any provider (account menu): the same cached catalog read, no `today`. */
export function useDukjilStatus(locale: AppLocale): DukjilStatus {
  const { catalog, settled, ready } = useCatalog(locale);
  return !settled || !ready ? "loading" : catalogIsActive(catalog) ? "on" : "off";
}
