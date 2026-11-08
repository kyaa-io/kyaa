"use client";
import { FanTag } from "@/components/fan-ui/fan-tag";
import type { AppLocale } from "@/i18n/locales";
import { jjinfanChallengeSchema } from "@/features/rankings/domain/types";
import { useJjinfanSeed } from "@/features/rankings/ui/jjinfan-seed";
import { rankingsText } from "@/features/rankings/ui/rankings-copy";
import { useRankingResource } from "@/features/rankings/ui/use-ranking-resource";

const parseChallenge = (value: unknown) => jjinfanChallengeSchema.parse(value);

/** 찐팬 100 챌린지가 켜진 팬페이지 머리 이름 옆 태그 1개(6차 피드백 I ②). 모임 목록 카드와 같은 `jjTag` 문구, 게이지와 같은 응답을 읽는다. 꺼져 있으면 그리지 않는다. */
export function PageChallengeTag({ slug, locale }: { slug: string; locale: AppLocale }) {
  const { state } = useRankingResource(`/api/pages/${encodeURIComponent(slug)}/jjinfan-challenge`, parseChallenge);
  const seed = useJjinfanSeed(slug);
  const data = state.status === "ready" ? state.data : seed;
  if (!data?.campaign) return null;
  return <FanTag tone="fan">{rankingsText(locale, "jjTag")}</FanTag>;
}
