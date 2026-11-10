import { redirect } from "next/navigation";

import { parseAppLocale } from "@/i18n/locales";

type Props = { searchParams: Promise<{ locale?: string | string[] }> };

/** 랭킹은 홈의 "오늘의 랭킹"에 있다. 예전 주소와 공유 링크는 그 구역으로 보낸다. */
export default async function RankingsPage({ searchParams }: Props) {
  redirect(`/?locale=${parseAppLocale((await searchParams).locale)}#home-ranking`);
}
