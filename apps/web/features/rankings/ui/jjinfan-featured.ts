"use client";
import type { Route } from "next";
import type { AppLocale } from "@/i18n/locales";
import { activeJjinfanChallengesSchema, type ActiveJjinfanChallenge } from "../domain/types";
import { useRankingResource } from "./use-ranking-resource";

const parse = (value: unknown) => activeJjinfanChallengesSchema.parse(value);

/** The detail page of the 찐팬 100 challenge: the gauge, how to join and the donation. */
export const jjinfanDetailHref = (locale: AppLocale) => `/guide/jjinfan?locale=${locale}#jjinfan-challenge` as Route;

/** The one challenge the home points at: the administrator's newest switch-on (the reader's first row). The administrator turns challenges on one at a
 * time; none, or a failed read, is `item: null`. */
export function useFeaturedChallenge(locale: AppLocale): { loading: boolean; item: ActiveJjinfanChallenge | null } {
  const { state } = useRankingResource(`/api/rankings/challenges?locale=${locale}`, parse);
  return { loading: state.status === "loading", item: state.status === "ready" ? state.data.items[0] ?? null : null };
}
