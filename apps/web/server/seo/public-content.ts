import { toContentLocale } from "@/i18n/locales";
import "server-only";
import { cache } from "react";
import { createPublishedContentRepositoryFromEnvironment } from "@/server/content/published-content-repository";
import { createLiveEventRepositoryFromEnvironment } from "@/server/g3/live-event-repository";
import type { SeoLocale } from "@/seo/metadata";
import { createRaffleDependencies } from "@/server/raffle/raffle-dependencies";
import { createBenefitRepositoryFromEnvironment } from "@/server/g4/benefit-repository";
import { loadServerEnv } from "@/server/config/env";

// Request-scoped only: anonymous content is shared between metadata and page,
// never between users or across a publication change.
export const loadSeoCreator = cache(async (slug: string, locale: SeoLocale) =>
  createPublishedContentRepositoryFromEnvironment().findBySlug(toContentLocale(locale), slug));

export const loadSeoRaffles = cache(async (slug: string, locale: SeoLocale) =>
  createRaffleDependencies().list({ celebritySlug: slug, locale: toContentLocale(locale), now: new Date() }));

export const loadSeoBenefit = cache(async (benefitId: string, locale: SeoLocale) => {
  const environment = loadServerEnv();
  return createBenefitRepositoryFromEnvironment({ url: environment.SUPABASE_URL, serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY })
    .find({ benefitId, locale: toContentLocale(locale), appUserId: null, now: new Date() });
});

export const loadSeoLive = cache(async (slug: string, locale: SeoLocale) => {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Public LIVE is not configured");
  return createLiveEventRepositoryFromEnvironment({ url, serviceRoleKey })
    .findPublishedBySlug({ slug, locale: toContentLocale(locale), appUserId: null, now: new Date() });
});
