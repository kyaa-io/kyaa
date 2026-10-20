"use client";
import { z } from "zod";
import type { PublishedCelebrity } from "@/server/content/content-domain";
import { type AppLocale, toContentLocale } from "@/i18n/locales";
import { CreatorRafflesScreen } from "@/features/benefit/ui/creator-raffles-screen";
import { raffleListSchema } from "@/features/benefit/domain/raffle";
import { benefitCatalogItemSchema } from "@/features/benefit/domain/benefit";
import { FanAction } from "@/components/fan-ui/fan-action";
import { participationCopy } from "@/features/connect/kyaa-wave-participation-copy";
import { useFanpageResource } from "./use-fanpage-resource";
const parseRaffles = (value: unknown) => raffleListSchema.parse(value);
const parseBenefit = (value: unknown) => z.object({ benefit: benefitCatalogItemSchema }).parse(value);
export function WaveRaffles({ celebrity, locale, benefitId }: { celebrity: PublishedCelebrity; locale: AppLocale; benefitId?: string }) {
  const raffles = useFanpageResource(`/api/celebrities/${celebrity.slug}/raffles?locale=${toContentLocale(locale)}`, parseRaffles);
  const benefit = useFanpageResource(benefitId ? `/api/benefits/${benefitId}?locale=${toContentLocale(locale)}` : null, parseBenefit);
  const copy = participationCopy[locale];
  if (raffles.state.status === "error" || benefitId && benefit.state.status === "error") return <div><p role="alert">{copy.unavailable}</p><FanAction onClick={() => { raffles.retry(); benefit.retry(); }}>{copy.retry}</FanAction></div>;
  if (raffles.state.status !== "ready" || benefitId && benefit.state.status !== "ready") return <p role="status">{copy.loading}</p>;
  return <CreatorRafflesScreen celebrity={celebrity} locale={locale} raffles={raffles.state.data.raffles} benefitId={benefitId} deliveryInstructions={benefit.state.status === "ready" ? benefit.state.data.benefit.deliveryLabel : undefined} />;
}
