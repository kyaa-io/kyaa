"use client";

import { toContentLocale } from "@/i18n/locales";
import type { AppLocale } from "@/i18n/locales";
import { usePrivy } from "@privy-io/react-auth";
import { createContext, useContext, type ReactNode } from "react";
import { mySummarySchema, type MySummary } from "../../features/my/domain/my-summary";
import { useOwnedFanResource } from "./use-owned-fan-resource";

type PersonalizationState = { status: "auth-loading" } | { status: "guest" } | { status: "authenticated-loading" }
  | { status: "authenticated-error" } | { status: "authenticated-ready"; summary: MySummary };

type HomeOwnerContextValue = {
  personalization: PersonalizationState;
  retryPersonalization(): void;
  creatorVerification(slug: string): { status: "guest" | "loading" | "error" | "ready"; verified?: boolean };
};

const HomeOwnerContext = createContext<HomeOwnerContextValue | null>(null);

const parseHomeSummary = (body: unknown) => mySummarySchema.parse((body as { summary?: unknown }).summary);

type HomeAuth = ReturnType<typeof usePrivy>;

function HomeOwnerStateProvider({ locale, children, auth }: { locale: AppLocale; children: ReactNode; auth: HomeAuth }) {
  const ownerId = auth.user?.id;
  const privateReady = auth.ready && (!auth.authenticated || Boolean(ownerId));
  const ownerAuth = { ready: privateReady, authenticated: auth.authenticated, user: ownerId ? { id: ownerId } : null, getAccessToken: auth.getAccessToken };
  const summaryResource = useOwnedFanResource(auth.authenticated && ownerId ? `/api/me/summary?locale=${toContentLocale(locale)}&tierStages=1` : null, parseHomeSummary, ownerAuth);
  const personalization: PersonalizationState = !privateReady ? { status: "auth-loading" }
    : !auth.authenticated ? { status: "guest" }
    : summaryResource.state.status === "loading" ? { status: "authenticated-loading" }
    : summaryResource.state.status === "error" ? { status: "authenticated-error" }
    : { status: "authenticated-ready", summary: summaryResource.state.data };
  const creatorVerification = (slug: string) => {
    if (personalization.status === "auth-loading" || personalization.status === "authenticated-loading") return { status: "loading" as const };
    if (personalization.status === "guest") return { status: "guest" as const };
    if (personalization.status === "authenticated-error") return { status: "error" as const };
    const creator = personalization.summary.creators.find((creator) => creator.celebrity.slug === slug);
    return { status: "ready" as const, verified: Boolean(creator?.passport) };
  };
  const value: HomeOwnerContextValue = {
    personalization,
    retryPersonalization: summaryResource.retry,
    creatorVerification,
  };
  return <HomeOwnerContext.Provider value={value}>{children}</HomeOwnerContext.Provider>;
}

export function HomeOwnerProvider({ locale, children }: { locale: AppLocale; children: ReactNode }) {
  const auth = usePrivy();
  const ownerKey = !auth.ready ? "auth-loading" : !auth.authenticated ? "guest" : auth.user?.id ?? "owner-loading";
  return <HomeOwnerStateProvider key={ownerKey} locale={locale} auth={auth}>{children}</HomeOwnerStateProvider>;
}

export function useHomeOwner() {
  const value = useContext(HomeOwnerContext);
  if (!value) throw new Error("Home owner context is unavailable");
  return value;
}

export function useOptionalHomeCreatorVerification(slug: string) {
  const value = useContext(HomeOwnerContext);
  return value?.creatorVerification(slug) ?? null;
}
