"use client";
import type { AppLocale } from "@/i18n/locales";
import { jjinfanChallengeSchema } from "@/features/rankings/domain/types";
import { useJjinfanSeed } from "@/features/rankings/ui/jjinfan-seed";
import { rankingsText } from "@/features/rankings/ui/rankings-copy";
import { useRankingResource } from "@/features/rankings/ui/use-ranking-resource";

const parseChallenge = (value: unknown) => jjinfanChallengeSchema.parse(value);

/** 찐팬 100 챌린지가 켜진 팬페이지 머리 통계 줄의 회색 항목 1개(6차 피드백 I ②, VISUAL-K ②): `찐팬 100 도전 중 1/100`.
 * 모임 목록 카드와 같은 `jjTag` 문구, 게이지와 같은 응답을 읽는다. 꺼져 있거나 읽는 중이면 그리지 않는다. 분홍 강조 없음. */
export function PageChallengeStat({ slug, locale, className }: { slug: string; locale: AppLocale; className?: string }) {
  const { state } = useRankingResource(`/api/pages/${encodeURIComponent(slug)}/jjinfan-challenge`, parseChallenge);
  const seed = useJjinfanSeed(slug);
  const data = state.status === "ready" ? state.data : seed;
  if (!data?.campaign) return null;
  const count = Math.min(data.count, data.target).toLocaleString(locale), target = data.target.toLocaleString(locale);
  return <span className={className} data-challenge-stat="">{rankingsText(locale, "jjTag")} {count}/{target}</span>;
}
