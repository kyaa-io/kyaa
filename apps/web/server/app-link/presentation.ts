import "server-only";

import type { AppLocale } from "@/i18n/locales";
import { toContentLocale } from "@/i18n/locales";
import { creatorHomeHref } from "@/features/creator/domain/creator-navigation";
import { resolvePhoto } from "@/features/media/domain/public-image";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { readSharedPassportActivity } from "@/server/community-stamps/shared-passport";
import { createBenefitRepositoryFromEnvironment } from "@/server/g4/benefit-repository";
import { loadSeoCreator, loadSeoLive } from "@/server/seo/public-content";
import type { AppLinkDestination } from "./destination";

export type AppLinkPresentation =
  | { state: "available"; title: string; subtitle: string; image?: { src: string; alt: string }; status: "creator" | "live" | "scheduled" | "ended" | "benefit" | "passport"; parentHref: string }
  | { state: "unavailable"; reason: "unavailable" | "expired"; parentHref: string }
  | { state: "generic" };

type Loaders = {
  creator(slug: string, locale: AppLocale): ReturnType<typeof loadSeoCreator>;
  live(slug: string, locale: AppLocale): ReturnType<typeof loadSeoLive>;
  benefit(id: string, locale: AppLocale): Promise<{ title: string; summary: string; imageUrl?: string | null; state: string } | null>;
  passport(token: string, locale: AppLocale): Promise<{ creator: string } | null>;
};

const defaultLoaders: Loaders = {
  creator: loadSeoCreator,
  live: loadSeoLive,
  async benefit(id, locale) {
    const url = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if ((!url || !serviceRoleKey) && (!process.env.POSTGREST_URL || !process.env.POSTGREST_SERVICE_TOKEN)) throw new Error("Public benefits are not configured");
    return createBenefitRepositoryFromEnvironment({ url, serviceRoleKey }).find({
      benefitId: id,
      locale: toContentLocale(locale),
      appUserId: null,
      now: new Date(),
    });
  },
  async passport(token) {
    return readSharedPassportActivity(token, createFanpageDependencies());
  },
};

function pathname(returnTo: string) {
  return new URL(returnTo, "https://byus.local").pathname;
}

export async function resolveAppLinkPresentation(
  destination: AppLinkDestination,
  locale: AppLocale,
  loaders: Loaders = defaultLoaders,
): Promise<AppLinkPresentation> {
  if (!destination.valid) return { state: "generic" };
  const path = pathname(destination.returnTo);

  try {
    const liveMatch = path.match(/^\/live\/([a-z0-9]+(?:-[a-z0-9]+)*)$/i);
    if (liveMatch) {
      const result = await loaders.live(liveMatch[1], locale);
      if (!result) return { state: "unavailable", reason: "unavailable", parentHref: "/live" };
      const { live } = result;
      const photo = resolvePhoto(live.photos, "event.detail", live.heroImage.url, locale);
      return {
        state: "available",
        title: live.title,
        subtitle: live.celebrity.name,
        image: { src: photo.src, alt: photo.alt ?? live.heroImage.alt },
        status: live.effectiveStatus === "scheduled" ? "scheduled" : live.effectiveStatus === "ended" || live.effectiveStatus === "cancelled" ? "ended" : "live",
        parentHref: creatorHomeHref(live.celebrity.slug),
      };
    }

    const benefitMatch = path.match(/^\/benefits\/([0-9a-f-]{36})$/i);
    if (benefitMatch) {
      const benefit = await loaders.benefit(benefitMatch[1], locale);
      if (!benefit) return { state: "unavailable", reason: "unavailable", parentHref: "/benefits" };
      if (benefit.state === "expired") return { state: "unavailable", reason: "expired", parentHref: "/benefits" };
      return { state: "available", title: benefit.title, subtitle: benefit.summary, image: benefit.imageUrl ? { src: benefit.imageUrl, alt: "" } : undefined, status: "benefit", parentHref: "/benefits" };
    }

    const passportMatch = path.match(/^\/s\/([a-f0-9]{32})$/i);
    if (passportMatch) {
      const passport = await loaders.passport(passportMatch[1], locale);
      if (!passport) return { state: "unavailable", reason: "unavailable", parentHref: "/" };
      const creator = await loaders.creator(passport.creator, locale);
      if (!creator) return { state: "unavailable", reason: "unavailable", parentHref: "/" };
      const photo = resolvePhoto(creator.image.photos, "creator.hero.mobile", creator.image.url, locale);
      return { state: "available", title: creator.name, subtitle: creator.summary, image: { src: photo.src, alt: photo.alt ?? creator.image.alt }, status: "passport", parentHref: creatorHomeHref(creator.slug) };
    }

    const creatorMatch = path.match(/^\/(?:c\/)?([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/.*)?$/i);
    if (creatorMatch && destination.kind === "creator") {
      const creator = await loaders.creator(creatorMatch[1], locale);
      if (!creator) return { state: "unavailable", reason: "unavailable", parentHref: "/celebrities" };
      const photo = resolvePhoto(creator.image.photos, "creator.hero.mobile", creator.image.url, locale);
      return { state: "available", title: creator.name, subtitle: creator.summary, image: { src: photo.src, alt: photo.alt ?? creator.image.alt }, status: "creator", parentHref: creatorHomeHref(creator.slug) };
    }
  } catch {
    // A repository outage must not be presented as a deleted or private target.
    return { state: "generic" };
  }

  return { state: "generic" };
}
